// @vitest-environment jsdom
/**
 * A tela de acompanhamento do pedido.
 *
 * É o recibo que o cliente guarda e a única tela que ele revisita depois de
 * pagar. Duas coisas justificam o teste:
 *
 *  - **A aritmética do recibo.** O subtotal não vem do servidor: é recomposto
 *    aqui como `total - frete + desconto`. Se o sinal de um dos dois inverter, a
 *    conta continua parecendo plausível e passa a mentir sobre o que foi cobrado.
 *  - **A linha do tempo.** Passo concluído, passo atual e passo futuro são três
 *    estados visuais distintos, e o índice que os separa vem de um `indexOf` que
 *    devolve -1 para CANCELLED.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OrderTracker } from "./OrderTracker";

const realtime = vi.fn();
vi.mock("@/hooks/useOrderRealtime", () => ({
  useOrderRealtime: () => realtime(),
}));

// O mapa carrega leaflet e não é assunto desta suíte; só nos interessa *se* ele
// aparece.
vi.mock("@/components/delivery/LiveDeliveryTracker", () => ({
  LiveDeliveryTracker: () => <div data-testid="mapa-ao-vivo" />,
}));

const ORDER_ID = "cmabcdef123456";
const TENANT = "restaurante-a";

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: "PENDING" as const,
    paymentMethod: "PIX" as const,
    paymentStatus: "UNPAID" as const,
    total: 50,
    createdAt: new Date("2026-08-29T12:00:00.000Z"),
    items: [
      {
        id: "oi-1",
        quantity: 2,
        unitPrice: 25,
        notes: null,
        menuItem: { id: "item-1", name: "X-Salada", imageUrl: null },
      },
    ],
    ...over,
  };
}

function montar(over: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  const order = pedido(over);
  return render(
    <OrderTracker
      orderId={ORDER_ID}
      initialStatus={order.status}
      order={order as never}
      tenantId={TENANT}
      canChat={false}
      {...props}
    />
  );
}

beforeEach(() => {
  realtime.mockReturnValue({ status: null, estimatedDeliveryAt: null });
});

afterEach(() => {
  cleanup();
});

describe("o status em destaque", () => {
  it.each([
    ["PENDING", "Pedido recebido"],
    ["CONFIRMED", "Pedido confirmado"],
    ["IN_PREPARATION", "Em preparo"],
    ["READY", "Pronto!"],
    ["OUT_FOR_DELIVERY", "A caminho!"],
    ["DELIVERED", "Entregue!"],
    ["CANCELLED", "Cancelado"],
  ])("mostra o título de %s", (status, titulo) => {
    montar({ status });
    expect(screen.getByRole("heading", { name: titulo })).toBeDefined();
  });

  it("mostra os últimos seis caracteres do id, em maiúsculas", () => {
    montar();
    expect(screen.getByText("Pedido #123456")).toBeDefined();
  });

  it("o status do tempo real vence o status inicial", () => {
    realtime.mockReturnValue({ status: "READY", estimatedDeliveryAt: null });
    montar({ status: "PENDING" });

    expect(screen.getByRole("heading", { name: "Pronto!" })).toBeDefined();
  });

  it("marca como ao vivo enquanto o pedido está em curso", () => {
    montar({ status: "IN_PREPARATION" });
    expect(screen.getByText(/ao vivo/i)).toBeDefined();
  });

  it.each(["DELIVERED", "CANCELLED"])("tira o ao vivo quando o pedido fecha (%s)", (status) => {
    montar({ status });
    expect(screen.queryByText(/ao vivo/i)).toBeNull();
  });
});

describe("a linha do tempo", () => {
  it("some quando o pedido foi cancelado", () => {
    // `STEPS.indexOf("CANCELLED")` é -1: sem esconder, todos os passos
    // apareceriam como futuros e o cliente veria a régua de um pedido vivo.
    montar({ status: "CANCELLED" });
    expect(screen.queryByText("Status atual")).toBeNull();
  });

  it("aponta o passo atual", () => {
    montar({ status: "IN_PREPARATION" });

    expect(screen.getByText("Status atual")).toBeDefined();
    expect(screen.getByText("Preparando").className).toMatch(/text-neutral-900/);
  });

  it("risca os passos já vencidos", () => {
    montar({ status: "READY" });

    expect(screen.getByText("Recebido").className).toMatch(/line-through/);
    expect(screen.getByText("Confirmado").className).toMatch(/line-through/);
  });

  it("deixa os passos futuros apagados e sem risco", () => {
    montar({ status: "CONFIRMED" });

    const futuro = screen.getByText("Entregue");
    expect(futuro.className).toMatch(/text-neutral-300/);
    expect(futuro.className).not.toMatch(/line-through/);
  });

  it("no primeiro passo nada está vencido", () => {
    montar({ status: "PENDING" });
    expect(screen.getByText("Recebido").className).not.toMatch(/line-through/);
  });
});

describe("os itens", () => {
  it("mostra quantidade, nome e o subtotal da linha", () => {
    montar();

    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("X-Salada")).toBeDefined();
    // Num pedido de um item só, o subtotal da linha e o total do pedido são o
    // mesmo valor e aparecem duas vezes na tela.
    expect(screen.getAllByText("R$ 50,00")).toHaveLength(2);
  });

  it("mostra a observação do item quando existe", () => {
    montar({
      items: [
        {
          id: "oi-1",
          quantity: 1,
          unitPrice: 25,
          notes: "sem cebola",
          menuItem: { id: "item-1", name: "X-Salada", imageUrl: null },
        },
      ],
    });

    expect(screen.getByText("sem cebola")).toBeDefined();
  });
});

describe("a aritmética do recibo", () => {
  it("esconde o bloco de taxa e desconto num pedido simples", () => {
    // Retirada sem cupom: mostrar "Subtotal R$ 50,00 / Total R$ 50,00" é ruído.
    montar({ total: 50, deliveryFee: 0, discount: 0 });

    expect(screen.queryByText("Subtotal")).toBeNull();
    expect(screen.queryByText("Taxa de entrega")).toBeNull();
  });

  it("recompõe o subtotal a partir do total, tirando o frete", () => {
    // itens 50 + frete 8 = total 58 → subtotal precisa voltar a 50.
    montar({ total: 58, deliveryFee: 8, discount: 0 });

    expect(screen.getByText("Subtotal")).toBeDefined();
    expect(screen.getAllByText("R$ 50,00").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 8,00")).toBeDefined();
  });

  it("recompõe o subtotal somando de volta o desconto", () => {
    // itens 50 − desconto 10 = total 40 → subtotal precisa voltar a 50.
    montar({ total: 40, deliveryFee: 0, discount: 10 });

    expect(screen.getByText("-R$ 10,00")).toBeDefined();
    expect(screen.getAllByText("R$ 50,00").length).toBeGreaterThan(0);
  });

  it("acerta o subtotal com frete e desconto juntos", () => {
    // itens 50 + frete 8 − desconto 10 = total 48.
    montar({ total: 48, deliveryFee: 8, discount: 10 });

    expect(screen.getAllByText("R$ 50,00").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 8,00")).toBeDefined();
    expect(screen.getByText("-R$ 10,00")).toBeDefined();
    expect(screen.getByText("R$ 48,00")).toBeDefined();
  });

  it("mostra o código do cupom ao lado do desconto", () => {
    montar({ total: 40, discount: 10, couponCode: "PROMO10" });
    expect(screen.getByText(/PROMO10/)).toBeDefined();
  });

  it("não mostra código quando o desconto veio sem cupom", () => {
    montar({ total: 40, discount: 10, couponCode: null });
    expect(screen.getByText("Desconto")).toBeDefined();
  });

  it("mostra o total e a forma de pagamento", () => {
    montar({ total: 50, paymentMethod: "PIX" });

    expect(screen.getAllByText("R$ 50,00").length).toBeGreaterThan(0);
    expect(screen.getByText(/pix/i)).toBeDefined();
  });

  it("marca como pago só quando está pago", () => {
    montar({ paymentStatus: "PAID" });
    expect(screen.getByText(/pago/i)).toBeDefined();

    cleanup();
    montar({ paymentStatus: "UNPAID" });
    expect(screen.queryByText(/pago/i)).toBeNull();
  });
});

describe("o mapa ao vivo", () => {
  const emRota = {
    status: "OUT_FOR_DELIVERY",
    deliveryType: "DELIVERY",
    deliveryAddress: "Rua A, 1",
  };

  it("aparece quando o pedido saiu para entrega", () => {
    montar(emRota);
    expect(screen.getByTestId("mapa-ao-vivo")).toBeDefined();
  });

  it("não aparece antes de sair para entrega", () => {
    montar({ ...emRota, status: "READY" });
    expect(screen.queryByTestId("mapa-ao-vivo")).toBeNull();
  });

  it("não aparece em pedido de retirada", () => {
    montar({ ...emRota, deliveryType: "PICKUP" });
    expect(screen.queryByTestId("mapa-ao-vivo")).toBeNull();
  });

  it("não aparece sem endereço para onde ir", () => {
    montar({ ...emRota, deliveryAddress: null });
    expect(screen.queryByTestId("mapa-ao-vivo")).toBeNull();
  });
});

describe("a previsão de entrega", () => {
  const daquiA30Min = () => new Date(Date.now() + 30 * 60_000);

  it("mostra os minutos que faltam", () => {
    montar({ status: "IN_PREPARATION", estimatedDeliveryAt: daquiA30Min() });

    expect(screen.getByText(/previsão de entrega/i)).toBeDefined();
    expect(screen.getByText("30")).toBeDefined();
  });

  it("some depois de entregue", () => {
    montar({ status: "DELIVERED", estimatedDeliveryAt: daquiA30Min() });
    expect(screen.queryByText(/previsão de entrega/i)).toBeNull();
  });

  it("some em pedido cancelado", () => {
    montar({ status: "CANCELLED", estimatedDeliveryAt: daquiA30Min() });
    expect(screen.queryByText(/previsão de entrega/i)).toBeNull();
  });

  it("não mostra minutos negativos quando o prazo já passou", () => {
    montar({
      status: "OUT_FOR_DELIVERY",
      estimatedDeliveryAt: new Date(Date.now() - 10 * 60_000),
    });

    expect(screen.queryByText("minutos")).toBeNull();
  });

  it("anuncia a estimativa por rota quando ela vem do motoboy", () => {
    realtime.mockReturnValue({ status: "OUT_FOR_DELIVERY", estimatedDeliveryAt: daquiA30Min() });
    montar({ status: "OUT_FOR_DELIVERY" });

    expect(screen.getByText(/por rota/i)).toBeDefined();
  });

  it("a estimativa do tempo real vence a que veio do servidor", () => {
    realtime.mockReturnValue({
      status: "OUT_FOR_DELIVERY",
      estimatedDeliveryAt: new Date(Date.now() + 5 * 60_000),
    });
    montar({ status: "OUT_FOR_DELIVERY", estimatedDeliveryAt: daquiA30Min() });

    expect(screen.getByText("5")).toBeDefined();
  });
});

describe("o chat com o restaurante", () => {
  it("aparece quando o pedido permite chat", () => {
    montar({}, { canChat: true });

    const link = screen.getByRole("link", { name: /chat com o restaurante/i });
    expect(link.getAttribute("href")).toBe(`/pedidos/${ORDER_ID}/chat`);
  });

  it("não aparece quando o pedido não permite", () => {
    montar({}, { canChat: false });
    expect(screen.queryByRole("link", { name: /chat/i })).toBeNull();
  });

  it("some em pedido cancelado, mesmo com chat permitido", () => {
    montar({ status: "CANCELLED" }, { canChat: true });
    expect(screen.queryByRole("link", { name: /chat/i })).toBeNull();
  });
});

describe("pedido entregue", () => {
  it("fecha com o agradecimento", () => {
    montar({ status: "DELIVERED" });
    // Aparece na mensagem do status e de novo no bloco de encerramento.
    expect(screen.getAllByText(/bom apetite/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/volte sempre/i)).toBeDefined();
  });

  it("não mostra o agradecimento antes da entrega", () => {
    montar({ status: "OUT_FOR_DELIVERY" });
    expect(screen.queryByText(/bom apetite/i)).toBeNull();
  });
});
