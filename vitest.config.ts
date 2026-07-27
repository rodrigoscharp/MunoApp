import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
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
