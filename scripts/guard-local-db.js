#!/usr/bin/env node
/**
 * Recusa comandos destrutivos do Prisma quando o DATABASE_URL não é local.
 *
 * `prisma migrate dev` propõe RESETAR o banco quando acha drift, e `prisma db
 * push` derruba coluna para o schema bater. Os dois têm nome de ferramenta de
 * desenvolvimento e obedecem ao DATABASE_URL que estiver no ambiente — e por um
 * bom tempo esse valor foi o do Supabase de produção, com os pedidos de todos os
 * restaurantes dentro. Nenhum dos dois pergunta em que banco está mexendo.
 *
 * Esta trava é a resposta a essa pergunta. Roda antes deles (ver package.json).
 * Para migrar produção existe `prisma migrate deploy`, que nunca reseta nem
 * destrói, e é o único que deve chegar lá.
 */

const fs = require("node:fs");
const path = require("node:path");

// Lê o .env na mão: este script roda antes do Prisma, que é quem normalmente
// carregaria o arquivo.
function lerEnv(arquivo) {
  try {
    return fs.readFileSync(arquivo, "utf8");
  } catch {
    return "";
  }
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const raiz = path.resolve(__dirname, "..");
  for (const nome of [".env.local", ".env"]) {
    const linha = lerEnv(path.join(raiz, nome))
      .split("\n")
      .find((l) => l.trim().startsWith("DATABASE_URL="));
    if (linha) {
      return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

const url = databaseUrl();

if (!url) {
  console.error("\n  DATABASE_URL não encontrado. Configure o .env antes de migrar.\n");
  process.exit(1);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error(`\n  DATABASE_URL não é uma URL válida.\n`);
  process.exit(1);
}

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal", "db"]);

if (!LOCAIS.has(host)) {
  console.error(`
  ┌───────────────────────────────────────────────────────────────┐
  │  BLOQUEADO: este comando pode apagar o banco inteiro.         │
  └───────────────────────────────────────────────────────────────┘

  DATABASE_URL aponta para:  ${host}
  Esperado:                  localhost

  'migrate dev' e 'db push' são ferramentas de desenvolvimento: o
  primeiro oferece resetar o banco quando acha drift, o segundo
  derruba coluna para o schema bater. Contra o banco dos
  restaurantes, os dois apagam pedido de cliente.

  Para desenvolver:
      docker compose up -d
      npm run db:reset

  Para migrar produção (nunca reseta, nunca destrói):
      npm run db:deploy
`);
  process.exit(1);
}
