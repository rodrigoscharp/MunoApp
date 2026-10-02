import "dotenv/config";
import {
  AnonimizacaoError,
  anonimizarCliente,
  contarDadosDoCliente,
} from "../src/lib/anonimizacao-cliente";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Faltou valor para --${key}`);
      args[key] = value;
      i++;
    }
  }
  return args;
}

function hostDoBanco(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname || "desconhecido";
  } catch {
    return "desconhecido";
  }
}

const USO =
  'Uso: npm run cliente:anonimizar -- --slug "restaurante-x" (--telefone "11999998888" | --email "ana@x.com") [--confirmar "restaurante-x"]';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug || (!args.telefone && !args.email)) {
    console.error(USO);
    process.exit(1);
  }

  const alvo = { slug: args.slug, telefone: args.telefone, email: args.email };
  const r = await contarDadosDoCliente(alvo);

  console.log(`\n  Banco:       ${hostDoBanco()}`);
  console.log(`  Restaurante: ${r.tenant.nome} (${r.tenant.slug})\n`);
  console.log("  Será anonimizado (os pedidos ficam, sem nome, telefone, endereço e observações):");
  console.log(`    ${String(r.pedidos).padStart(6)}  pedido(s)`);
  console.log(`    ${String(r.mensagensDeChat).padStart(6)}  mensagem(ns) de chat (apagadas)`);
  console.log(`    ${String(r.rastreamentos).padStart(6)}  rastreamento(s) de entrega (apagados)`);
  console.log(`    ${r.temConta ? "     1" : "     0"}  conta de cliente (nome, e-mail e senha removidos)`);

  if (r.pedidos === 0 && !r.temConta) {
    console.log("\n  Nada encontrado para esse titular neste restaurante.\n");
    return;
  }

  // Mesma ideia de tenant:remove: repetir o slug obriga a ler em que restaurante
  // a operação vai acontecer, que é o erro que a confirmação precisa pegar.
  if (args.confirmar !== r.tenant.slug) {
    console.log(
      `\n  Nada foi alterado. Para confirmar, repita o slug:\n\n    npm run cliente:anonimizar -- --slug "${r.tenant.slug}" ${
        args.telefone ? `--telefone "${args.telefone}"` : `--email "${args.email}"`
      } --confirmar "${r.tenant.slug}"\n`
    );
    process.exit(1);
  }

  const feito = await anonimizarCliente(alvo);
  console.log(`\n  Anonimizado: ${feito.pedidos} pedido(s)${feito.temConta ? " e a conta" : ""}.\n`);
}

main()
  .catch((erro) => {
    if (erro instanceof AnonimizacaoError) {
      console.error(`\n  ${erro.message}\n`);
    } else {
      console.error(erro);
    }
    process.exit(1);
  })
  .finally(async () => {
    const { prismaUnscoped } = await import("../src/lib/prisma");
    await prismaUnscoped.$disconnect();
  });
