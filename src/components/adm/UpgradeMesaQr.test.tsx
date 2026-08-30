// @vitest-environment jsdom
/**
 * A oferta de upgrade na tela de assinatura, para quem está no Membro MUNO.
 *
 * O que o teste guarda: a oferta sai de plans.ts, que é a fonte única cruzada
 * com a landing por plans.test.ts. Escrever benefício ou preço à mão aqui
 * criaria a mesma divergência que a página de vendas já teve, só que num lugar
 * onde ninguém confere.
 */
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UpgradeMesaQr } from "./UpgradeMesaQr";
import { PLANO_BENEFICIOS, PRECOS } from "@/lib/plans";

afterEach(cleanup);

describe("UpgradeMesaQr", () => {
  it("anuncia a diferença de preço, não o preço cheio", () => {
    render(<UpgradeMesaQr />);

    const diferenca =
      (PRECOS.MEMBRO_MESA_QR.mensalCentavos - PRECOS.MEMBRO.mensalCentavos) / 100;
    expect(diferenca).toBe(30);
    // Quem já paga 119,99 decide pelo delta, não pelo total: "R$ 30,00 a mais"
    // é a pergunta real, e "R$ 149,99" faz parecer uma segunda mensalidade.
    expect(screen.getByText(/R\$ 30,00 a mais/)).toBeTruthy();
  });

  it("lista os ganhos reais do plano", () => {
    render(<UpgradeMesaQr />);

    for (const beneficio of PLANO_BENEFICIOS.MEMBRO_MESA_QR) {
      if (beneficio.startsWith("Tudo do")) continue;
      expect(screen.getByText(beneficio)).toBeTruthy();
    }
  });

  // "Tudo do Membro MUNO" é um ponteiro para o outro plano, não uma
  // funcionalidade. Para quem JÁ é Membro MUNO ele não oferece nada, e ocupa a
  // primeira linha da lista com uma obviedade.
  it("não oferece de volta o que a pessoa já tem", () => {
    render(<UpgradeMesaQr />);

    expect(screen.queryByText(/Tudo do Membro MUNO/)).toBeNull();
  });

  it("leva ao WhatsApp com a mensagem pronta", () => {
    render(<UpgradeMesaQr />);

    const link = screen.getByRole("link", { name: /migrar/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("wa.me/");
    // Sem a mensagem pronta a pessoa abre uma conversa em branco e desiste, ou
    // escreve algo que a equipe precisa decifrar.
    expect(decodeURIComponent(href)).toContain("Mesas QR");
  });
});
