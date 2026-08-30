// @vitest-environment jsdom
/**
 * A tela de pré-pagamento inteira: resumo + formulário.
 *
 * Ela existe como Client Component por UM motivo, e é o que o primeiro teste
 * aqui trava: trocar o ciclo NÃO pode desmontar o formulário. Antes o ciclo
 * vinha só da query string, e mudá-lo exigia navegar — o que apagaria tudo que
 * a pessoa já tinha digitado, no exato passo em que ela está a um clique de
 * pagar. Quem clicou no plano errado desistia em vez de digitar tudo de novo.
 *
 * O fail-closed de plano/ciclo continua em plans.ts, aplicado pela page antes
 * de chegar aqui. Este componente recebe a escolha já resolvida.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkout } from "./Checkout";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // O formulário consulta /api/assinar/slug a cada tecla. Aqui só precisa não
  // explodir — a lógica de slug tem teste próprio em FormularioAssinatura.
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ livre: true }),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState({}, "", "/assinar?plano=MEMBRO&ciclo=MENSAL");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Checkout", () => {
  it("trocar o ciclo preserva o que já foi digitado", async () => {
    const user = userEvent.setup();
    render(<Checkout planoInicial="MEMBRO" cicloInicial="MENSAL" />);

    const nome = screen.getByLabelText(/nome do restaurante/i);
    await user.type(nome, "Cantina da Ana");
    const email = screen.getByLabelText(/e-mail/i);
    await user.type(email, "ana@cantina.com");

    await user.click(screen.getByRole("button", { name: /anual/i }));

    expect((nome as HTMLInputElement).value).toBe("Cantina da Ana");
    expect((email as HTMLInputElement).value).toBe("ana@cantina.com");
  });

  it("trocar o ciclo troca o preço anunciado", async () => {
    const user = userEvent.setup();
    render(<Checkout planoInicial="MEMBRO" cicloInicial="MENSAL" />);

    expect(screen.getByText(/R\$ 119,99/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /anual/i }));

    expect(screen.getByText(/R\$ 1\.319,89/)).toBeTruthy();
    expect(screen.queryByText(/R\$ 119,99/)).toBeNull();
  });

  it("a URL acompanha o ciclo, para refresh e link compartilhado", async () => {
    // replaceState, e não navegação: a URL precisa contar a verdade sem que o
    // Next remonte a árvore e leve o formulário junto.
    const user = userEvent.setup();
    render(<Checkout planoInicial="MEMBRO" cicloInicial="MENSAL" />);

    await user.click(screen.getByRole("button", { name: /anual/i }));

    expect(window.location.search).toContain("ciclo=ANUAL");
    expect(window.location.search).toContain("plano=MEMBRO");
  });

  it("no mensal não oferece forma de pagamento; no anual, sim", async () => {
    // Regra existente: mensal é sempre cartão, porque PIX mensal geraria um QR
    // novo todo mês. A troca de ciclo precisa revelar a escolha junto.
    const user = userEvent.setup();
    render(<Checkout planoInicial="MEMBRO" cicloInicial="MENSAL" />);

    expect(screen.queryByText("Forma de pagamento")).toBeNull();

    await user.click(screen.getByRole("button", { name: /anual/i }));

    expect(screen.getByText("Forma de pagamento")).toBeTruthy();
  });
});
