// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Cor } from "@/lib/saude/avaliar";
import { MenuInferior, MenuLateral } from "./MenuLateral";

// O ponto do item "Saúde" é um aviso. Verde e neutro não desenham nada: um
// ponto sempre aceso vira papel de parede, e o dia em que ficar amarelo
// ninguém repararia.

vi.mock("next/navigation", () => ({
  usePathname: () => "/platform/leads",
  useSearchParams: () => new URLSearchParams(),
}));

const CONTAGENS = { novos: 0, negociando: 0, atrasadas: 0 };

afterEach(cleanup);

describe.each([
  ["MenuLateral", (saude: Cor) => <MenuLateral contagens={CONTAGENS} saude={saude} />],
  ["MenuInferior", (saude: Cor) => <MenuInferior contagens={CONTAGENS} saude={saude} />],
])("%s", (_nome, montar) => {
  it.each([
    ["amarelo", "pede atenção", "bg-console-aviso"],
    ["vermelho", "algo parou", "bg-console-alerta"],
  ] as const)("acende o ponto no item Saúde quando a cor é %s", (cor, rotulo, tom) => {
    render(montar(cor));

    const ponto = within(screen.getByRole("link", { name: /Saúde/ })).getByLabelText(rotulo);
    expect(ponto.className).toContain(tom);
  });

  // aria-label num span sem papel é ignorado por parte dos leitores de tela;
  // com role="img" o ponto é anunciado pelo nome.
  it("o ponto tem papel de imagem, para o leitor de tela anunciá-lo", () => {
    render(montar("vermelho"));

    within(screen.getByRole("link", { name: /Saúde/ })).getByRole("img", { name: "algo parou" });
  });

  it.each(["verde", "neutro"] as const)("não desenha nada quando a cor é %s", (cor) => {
    render(montar(cor));

    expect(screen.queryByLabelText("pede atenção")).toBeNull();
    expect(screen.queryByLabelText("algo parou")).toBeNull();
  });

  it("não põe o ponto em nenhum outro item", () => {
    render(montar("vermelho"));

    for (const link of screen.getAllByRole("link")) {
      if (/Saúde/.test(link.textContent ?? "")) continue;
      expect(within(link).queryByLabelText("algo parou")).toBeNull();
    }
  });
});
