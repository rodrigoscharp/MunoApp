// @vitest-environment jsdom
/**
 * O reforço: o que vem junto no plano, e o aviso de para onde o pagamento vai.
 *
 * Separado do ResumoPlano por causa do celular. Junto com o cabeçalho, esta
 * lista empurrava o formulário inteiro para baixo da dobra — a pessoa rolava
 * seis bullets antes de ver o primeiro campo. Separado, ele desce para depois
 * do formulário no celular e sobe para a coluna da esquerda no desktop, sem
 * duplicar marcação.
 */

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReforcoPlano } from "./ReforcoPlano";
import { PLANO_BENEFICIOS } from "@/lib/plans";

afterEach(cleanup);

describe("ReforcoPlano", () => {
  it("lista os benefícios do plano escolhido, e não os do outro", () => {
    render(<ReforcoPlano plano="MEMBRO_MESA_QR" />);

    for (const beneficio of PLANO_BENEFICIOS.MEMBRO_MESA_QR) {
      expect(screen.getByText(beneficio)).toBeTruthy();
    }
    // "Produtos ilimitados" é do MEMBRO puro e está coberto pelo "Tudo do
    // Membro MUNO" — repetir a lista inteira seria anunciar duas vezes.
    expect(screen.queryByText("Produtos ilimitados")).toBeNull();
  });

  it("avisa que o pagamento sai daqui, e por onde", () => {
    // O próximo clique manda a pessoa para um domínio que não é o da Muno,
    // com o CPF que ela acabou de digitar. Dizer isso antes é o que separa
    // "checkout seguro" de "fui redirecionado para um site estranho".
    render(<ReforcoPlano plano="MEMBRO" />);

    expect(screen.getByText(/Asaas/)).toBeTruthy();
  });
});
