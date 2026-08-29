// @vitest-environment jsdom
/**
 * O seletor de forma de pagamento do checkout.
 *
 * O componente decide o que o cliente **vê**; POST /api/orders decide o que ele
 * pode fazer (assertMethodAllowed). Mas oferecer PIX num restaurante sem
 * gateway leva o cliente até o fim para tomar 422 na cara — a tela precisa
 * concordar com o servidor.
 *
 * O estado `null` é o que carrega: enquanto /api/payments/methods não responde,
 * nenhuma opção online aparece. Opção que aparece e some é pior que opção que
 * demora a aparecer.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentMethodSelector } from "./PaymentMethodSelector";

const onChange = vi.fn();

beforeEach(() => {
  onChange.mockClear();
});

afterEach(() => {
  cleanup();
});

const AVISO_SO_ENTREGA = /apenas pagamento na entrega/i;

describe("enquanto carrega", () => {
  it("mostra só dinheiro", () => {
    render(<PaymentMethodSelector value="CASH" onChange={onChange} enabled={null} />);

    expect(screen.getByLabelText(/dinheiro/i)).toBeDefined();
    expect(screen.queryByLabelText(/pix/i)).toBeNull();
    expect(screen.queryByLabelText(/cartão/i)).toBeNull();
  });

  it("não anuncia que o restaurante só aceita entrega antes de saber", () => {
    // O aviso é uma afirmação sobre o restaurante. Dá-la antes da resposta
    // seria dizer ao cliente algo que pode ser falso um segundo depois.
    render(<PaymentMethodSelector value="CASH" onChange={onChange} enabled={null} />);
    expect(screen.queryByText(AVISO_SO_ENTREGA)).toBeNull();
  });
});

describe("com a resposta do servidor", () => {
  it("mostra as três quando todas estão habilitadas", () => {
    render(
      <PaymentMethodSelector
        value="PIX"
        onChange={onChange}
        enabled={["PIX", "CREDIT_CARD", "CASH"]}
      />
    );

    expect(screen.getByLabelText(/pix/i)).toBeDefined();
    expect(screen.getByLabelText(/cartão de crédito/i)).toBeDefined();
    expect(screen.getByLabelText(/dinheiro/i)).toBeDefined();
  });

  it("esconde o que o restaurante não aceita", () => {
    render(
      <PaymentMethodSelector value="PIX" onChange={onChange} enabled={["PIX", "CASH"]} />
    );

    expect(screen.getByLabelText(/pix/i)).toBeDefined();
    expect(screen.queryByLabelText(/cartão de crédito/i)).toBeNull();
  });

  it("avisa quando só sobra pagamento na entrega", () => {
    render(<PaymentMethodSelector value="CASH" onChange={onChange} enabled={["CASH"]} />);
    expect(screen.getByText(AVISO_SO_ENTREGA)).toBeDefined();
  });

  it("não avisa quando há pagamento online disponível", () => {
    render(
      <PaymentMethodSelector value="PIX" onChange={onChange} enabled={["PIX", "CASH"]} />
    );
    expect(screen.queryByText(AVISO_SO_ENTREGA)).toBeNull();
  });

  it("não avisa quando só cartão está disponível", () => {
    render(
      <PaymentMethodSelector value="CREDIT_CARD" onChange={onChange} enabled={["CREDIT_CARD"]} />
    );
    expect(screen.queryByText(AVISO_SO_ENTREGA)).toBeNull();
  });

  it("não mostra opção nenhuma quando a lista volta vazia", () => {
    render(<PaymentMethodSelector value="CASH" onChange={onChange} enabled={[]} />);

    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText(AVISO_SO_ENTREGA)).toBeDefined();
  });
});

describe("seleção", () => {
  it("marca a opção que está no value", () => {
    render(
      <PaymentMethodSelector
        value="CREDIT_CARD"
        onChange={onChange}
        enabled={["PIX", "CREDIT_CARD", "CASH"]}
      />
    );

    expect((screen.getByLabelText(/cartão de crédito/i) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/pix/i) as HTMLInputElement).checked).toBe(false);
  });

  it("avisa a escolha do cliente", async () => {
    render(
      <PaymentMethodSelector
        value="PIX"
        onChange={onChange}
        enabled={["PIX", "CREDIT_CARD", "CASH"]}
      />
    );

    await userEvent.click(screen.getByLabelText(/dinheiro/i));

    expect(onChange).toHaveBeenCalledWith("CASH");
  });

  it("mantém os rádios no mesmo grupo, para a escolha ser única", () => {
    render(
      <PaymentMethodSelector
        value="PIX"
        onChange={onChange}
        enabled={["PIX", "CREDIT_CARD", "CASH"]}
      />
    );

    const nomes = screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).name);
    expect(new Set(nomes)).toEqual(new Set(["paymentMethod"]));
  });
});
