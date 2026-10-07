import { vi } from "vitest";

/**
 * Nos testes de unidade, ninguém grava evento de saúde.
 *
 * reportarErro() chama registrarSaude(), e dezenas de testes passam por
 * reportarErro sem mockar o Prisma. Sem isto, cada um tentaria escrever no
 * Postgres local de verdade, porque o Prisma lê o .env sozinho. Quem precisa
 * do comportamento real (src/lib/saude/registrar.test.ts) usa vi.importActual.
 */
vi.mock("@/lib/saude/registrar", () => ({
  registrarSaude: vi.fn(async () => {}),
}));
