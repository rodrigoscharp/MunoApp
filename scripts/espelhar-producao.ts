import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * Traz os dados de produção para o banco LOCAL, anonimizados.
 *
 * Resolve o custo que a separação de bancos criou: desenvolver passou a ser
 * contra um seed fictício, e investigar problema de cliente específico exigia
 * apontar para produção — exatamente o que a trava existe para impedir.
 *
 * Aqui você fica com a forma real dos dados (volume de pedidos, combinações de
 * status, cardápio de verdade, o caso estranho que só aquele restaurante tem) e
 * nenhum nome, telefone, e-mail ou endereço de gente real.
 *
 *   npm run db:espelhar              usa o dump mais recente de backups/
 *   npm run db:espelhar -- --agora   tira um dump novo antes
 *   npm run db:espelhar -- --cru     mantém os dados reais (ver aviso abaixo)
 *
 * --cru existe para o caso em que o dado pessoal É o bug: acento que quebra a
 * impressão, telefone que o gateway recusa. Use e depois rode sem a flag.
 */

const SENHA_DEV = "dev123";
const CONTAINER = "muno-db-dev";

function argumento(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

function exigirBancoLocal(url: string | undefined) {
  const host = url ? new URL(url).hostname : "";
  if (!["localhost", "127.0.0.1"].includes(host)) {
    console.error(
      `\nerro: DATABASE_URL aponta para "${host}", não para localhost.\n` +
        `       Este script APAGA o banco de destino antes de restaurar.\n`
    );
    process.exit(1);
  }
}

function dumpMaisRecente(): string {
  const dir = path.resolve(__dirname, "../backups");
  const dumps = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("muno-") && f.endsWith(".sql"))
        .sort()
        .reverse()
    : [];

  if (dumps.length === 0) {
    console.error("\nerro: nenhum dump em backups/. Rode com --agora para tirar um.\n");
    process.exit(1);
  }
  return path.join(dir, dumps[0]);
}

async function anonimizar(url: string) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const senha = await bcrypt.hash(SENHA_DEV, 12);

  // Uma transação só: um banco meio anonimizado é pior que um cru, porque você
  // confia nele sem motivo.
  await prisma.$transaction([
    // O e-mail é chave única por tenant, então precisa continuar único — daí o
    // id entrar no lugar do endereço real. O papel (ADMIN/MOTOBOY/...) fica
    // intacto: é o que faz as telas se comportarem como em produção.
    prisma.$executeRawUnsafe(`
      update "User"
         set name     = 'Usuário ' || substr(id, 1, 6),
             email    = 'usuario-' || substr(id, 1, 8) || '@exemplo.local',
             password = $1
    `, senha),
    prisma.$executeRawUnsafe(`
      update "Order"
         set "customerName"    = case when "customerName"    is null then null else 'Cliente ' || substr(id, 1, 6) end,
             "customerPhone"   = case when "customerPhone"   is null then null else '11900000000' end,
             "deliveryAddress" = case when "deliveryAddress" is null then null else 'Rua de Teste, 100 - Bairro' end
    `),
    // Conteúdo de chat é texto livre: cliente manda endereço e telefone ali.
    prisma.$executeRawUnsafe(`
      update "ChatMessage"
         set content    = '[mensagem removida no espelhamento]',
             "senderName" = case when "senderName" is null then null else 'Participante' end
    `),
    // Credenciais de gateway, mesmo cifradas, não têm por que existir aqui.
    prisma.$executeRawUnsafe(`delete from "PaymentConnection"`),
    prisma.$executeRawUnsafe(`delete from "PasswordResetToken"`),
    // Leads são contatos comerciais reais — nome, e-mail e telefone de gente.
    prisma.$executeRawUnsafe(`
      update "Lead"
         set contato  = case when contato  is null then null else 'Contato ' || substr(id, 1, 6) end,
             email    = case when email    is null then null else 'lead-' || substr(id, 1, 8) || '@exemplo.local' end,
             telefone = case when telefone is null then null else '11900000000' end
    `),
    prisma.$executeRawUnsafe(`update "LeadNote" set texto = '[nota removida no espelhamento]'`),
    prisma.$executeRawUnsafe(`update "PlatformAdmin" set email = 'admin@exemplo.local', password = $1`, senha),
  ]);

  const [contagem] = await prisma.$queryRawUnsafe<{ vazou: number }[]>(`
    select (
      (select count(*) from "User"  where email not like '%@exemplo.local') +
      (select count(*) from "Order" where "customerPhone" is not null and "customerPhone" <> '11900000000') +
      (select count(*) from "Lead"  where email is not null and email not like '%@exemplo.local')
    )::int as vazou
  `);

  await prisma.$disconnect();
  return contagem.vazou;
}

async function main() {
  const url = process.env.DATABASE_URL;
  exigirBancoLocal(url);

  const raiz = path.resolve(__dirname, "..");

  if (argumento("agora")) {
    console.log("Tirando um dump novo de produção...");
    execFileSync("./scripts/backup-producao.sh", { cwd: raiz, stdio: "inherit" });
  }

  const dump = dumpMaisRecente();
  console.log(`\nRestaurando ${path.basename(dump)} no banco local...`);

  // Recria do zero: restaurar por cima deixaria linha velha que produção já não
  // tem, e aí o espelho mente.
  execFileSync("docker", [
    "exec", CONTAINER, "psql", "-U", "muno", "-d", "postgres", "-q",
    "-c", "drop database if exists muno with (force);",
    "-c", "create database muno;",
  ], { stdio: "pipe" });

  execFileSync("bash", ["-c", `docker exec -i ${CONTAINER} psql -U muno -d muno -q < "${dump}" 2>&1 | grep -v "already exists" || true`], {
    cwd: raiz,
    stdio: "inherit",
  });

  if (argumento("cru")) {
    console.log("\n⚠  --cru: dados reais mantidos. Este banco tem PII de cliente.");
    console.log("   Rode sem a flag assim que terminar de investigar.");
    return;
  }

  console.log("Anonimizando...");
  const vazou = await anonimizar(url!);

  if (vazou > 0) {
    console.error(`\nerro: ${vazou} registro(s) com dado pessoal sobraram. Não confie neste banco.\n`);
    process.exit(1);
  }

  console.log("\nPronto. Dados reais em forma, nenhum dado pessoal.");
  console.log(`Login:  qualquer e-mail da tabela User, senha "${SENHA_DEV}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
