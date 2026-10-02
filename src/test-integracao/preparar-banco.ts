import { execSync } from "node:child_process";
import { URL_PADRAO_DO_BANCO_DE_TESTE, urlDoBancoDeTeste } from "./banco";

/**
 * Antes de qualquer teste: confere que o alvo é o banco de teste local e aplica
 * as migrações nele (idempotente). É o mesmo `migrate deploy` que produção usa,
 * então um teste que passa aqui roda sobre o schema real.
 */
export default function preparar() {
  const url = urlDoBancoDeTeste({
    DATABASE_URL_TESTE: process.env.DATABASE_URL_TESTE ?? URL_PADRAO_DO_BANCO_DE_TESTE,
  });
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
