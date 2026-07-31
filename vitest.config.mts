import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Restrito a src/ de propósito: a raiz contém worktrees em
    // .claude/worktrees/ com cópias do projeto, que seriam varridas de outra forma.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
