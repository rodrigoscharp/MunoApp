// @vitest-environment jsdom
/**
 * O resumo do plano na tela de pré-pagamento.
 *
 * É a metade da tela que responde "o que exatamente eu estou comprando, e por
 * quanto" no momento em que a pessoa decide pagar. O que ele afirma sai de
 * plans.ts — preço e benefícios — e é lá que o teste de divergência com a
 * landing mora. Aqui o que se testa é se a tela mostra o que a tabela diz, e
 * se o toggle avisa quem manda.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumoPlano } from "./ResumoPlano";

afterEach(cleanup);

describe("ResumoPlano", () => {
  it("anuncia o plano e o preço mensal", () => {
    render(
      <ResumoPlano plano="MEMBRO" ciclo="MENSAL" onCicloChange={() => {}} />
    );

    expect(screen.getByText("Membro")).toBeTruthy();
    expect(screen.getByText(/R\$ 119,99/)).toBeTruthy();
    expect(screen.getByText("/mês")).toBeTruthy();
  });

  it("no anual mostra o preço do ano e explica o desconto", () => {
    render(
      <ResumoPlano
        plano="MEMBRO_MESA_QR"
        ciclo="ANUAL"
        onCicloChange={() => {}}
      />
    );

    expect(screen.getByText(/R\$ 1\.649,89/)).toBeTruthy();
    expect(screen.getByText("/ano")).toBeTruthy();
    // O desconto é o argumento do anual. Some do mensal, onde não existe.
    expect(screen.getByText(/11 mensalidades/)).toBeTruthy();
  });

  it("não fala em desconto no mensal", () => {
    render(
      <ResumoPlano plano="MEMBRO" ciclo="MENSAL" onCicloChange={() => {}} />
    );

    expect(screen.queryByText(/11 mensalidades/)).toBeNull();
  });

  it("o toggle avisa a troca de ciclo em vez de decidir sozinho", async () => {
    // Quem é dono do ciclo é o Checkout, que precisa dele para montar a URL e
    // para enviar no submit. O resumo só reporta a intenção.
    const user = userEvent.setup();
    const onCicloChange = vi.fn();
    render(
      <ResumoPlano plano="MEMBRO" ciclo="MENSAL" onCicloChange={onCicloChange} />
    );

    await user.click(screen.getByRole("button", { name: /anual/i }));

    expect(onCicloChange).toHaveBeenCalledWith("ANUAL");
  });
});
