#!/usr/bin/env node
/**
 * Aplica as migrações pendentes durante o build — só no deploy de produção.
 *
 * Sem isso, o schema do banco só mudava quando alguém rodava Prisma na mão, e
 * existia uma janela em que a main já estava no ar esperando colunas que o
 * banco ainda não tinha.
 *
 * A condição por VERCEL_ENV é o ponto central. Só existe um banco: preview e
 * produção apontam para o mesmo Supabase. Se o build de preview migrasse, abrir
 * um PR com migração nova já a aplicaria em produção, antes de qualquer review
 * — e o rollback do deploy não desfaria a alteração no banco. Então preview
 * builda, não migra.
 *
 * Usa `migrate deploy`, que aplica o que falta e nada mais: não reseta, não
 * derruba coluna, não pede confirmação. Se uma migração falhar, o build falha e
 * o deploy não sai — que é o desfecho certo, porque publicar código esperando um
 * schema que não existe quebra os restaurantes em produção.
 */

const { execFileSync } = require("node:child_process");

const ambiente = process.env.VERCEL_ENV;

if (ambiente !== "production") {
  const onde = ambiente ? `ambiente "${ambiente}"` : "build fora da Vercel";
  console.log(`[migrate] ${onde}: pulando. Só o deploy de produção migra.`);
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  // O pooler em modo transação (porta 6543) não serve para DDL; migração exige
  // a conexão direta. Falhar aqui, com o motivo, é melhor que um erro do Prisma
  // sobre prepared statements no meio do build.
  console.error(
    "\n[migrate] DIRECT_URL não configurada no ambiente de produção.\n" +
      "          Migração precisa da conexão direta do Supabase (porta 5432),\n" +
      "          não do pooler de transação.\n"
  );
  process.exit(1);
}

console.log("[migrate] deploy de produção: aplicando migrações pendentes...");
execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
