import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { URL_PADRAO_DO_BANCO_DE_TESTE } from "./src/test-integracao/banco";

/**
 * Testes de integração: falam com um Postgres de verdade.
 *
 * Os testes de unidade mockam o Prisma, então nenhuma constraint única,
 * corrida ou policy de RLS é exercitada neles. Estes rodam contra um banco
 * DESCARTÁVEL (`muno_teste` no Postgres local, ou o serviço do CI), criado com
 * `prisma migrate deploy`. Nunca contra o banco de desenvolvimento nem contra
 * produção: `src/test-integracao/banco.ts` recusa qualquer host que não seja
 * local.
 *
 *   docker compose up -d
 *   npm run test:integracao
 */
const url = process.env.DATABASE_URL_TESTE ?? URL_PADRAO_DO_BANCO_DE_TESTE;

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Um arquivo por vez e em sequência: todos dividem o mesmo banco.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["src/test-integracao/preparar-banco.ts"],
    env: {
      DATABASE_URL: url,
      DIRECT_URL: url,
      DATABASE_URL_TESTE: url,
      PAYMENT_TOKEN_ENCRYPTION_KEY: "0".repeat(64),
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
