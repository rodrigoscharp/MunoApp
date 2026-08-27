import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    // Restrito a src/ de propósito: a raiz contém worktrees em
    // .claude/worktrees/ com cópias do projeto, que seriam varridas de outra forma.
    // .tsx entra para os testes de componente. O ambiente segue "node" por
    // padrão, e cada arquivo de componente pede jsdom no topo com
    // `// @vitest-environment jsdom` — assim as centenas de suítes de lógica
    // pura continuam sem pagar o custo de montar um DOM a cada arquivo.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Chave fixa de 32 bytes só pra teste — src/lib/crypto.ts exige uma.
    env: {
      PAYMENT_TOKEN_ENCRYPTION_KEY: "0".repeat(64),
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
