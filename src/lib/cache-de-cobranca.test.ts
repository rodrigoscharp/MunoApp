import { describe, expect, it, vi, beforeEach } from "vitest";

const revalidateTag = vi.fn();
let semRequisicao = false;
vi.mock("next/cache", () => ({
  revalidateTag: (...a: unknown[]) => {
    revalidateTag(...a);
    if (semRequisicao) throw new Error("static generation store missing");
  },
}));

import {
  invalidarCacheDeCobranca,
  invalidarMenuDoConsole,
  TAG_AVISO_DE_COBRANCA,
  TAG_MENU_DO_CONSOLE,
} from "./cache-de-cobranca";

describe("cache de cobrança", () => {
  beforeEach(() => {
    revalidateTag.mockReset();
    semRequisicao = false;
  });

  it("cobrança limpa a faixa do /adm e o menu do console, na hora", () => {
    invalidarCacheDeCobranca();
    expect(revalidateTag).toHaveBeenCalledWith(TAG_AVISO_DE_COBRANCA, { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith(TAG_MENU_DO_CONSOLE, { expire: 0 });
  });

  it("lead limpa só o menu do console", () => {
    invalidarMenuDoConsole();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(TAG_MENU_DO_CONSOLE, { expire: 0 });
  });

  it("nunca lança, nem fora de uma requisição do Next", () => {
    semRequisicao = true;
    expect(() => invalidarCacheDeCobranca()).not.toThrow();
    expect(() => invalidarMenuDoConsole()).not.toThrow();
  });
});
