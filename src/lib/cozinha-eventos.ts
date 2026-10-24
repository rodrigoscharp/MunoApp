import type { OrderStatus, OrderWithItems, PaymentMethod, PaymentStatus } from "@/types";

const STATUS: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];
const METODOS: PaymentMethod[] = ["PIX", "CREDIT_CARD", "CASH"];
const SITUACOES: PaymentStatus[] = ["UNPAID", "PAID", "REFUNDED"];

function um<T extends string>(lista: T[], valor: unknown): T | undefined {
  return lista.includes(valor as T) ? (valor as T) : undefined;
}

/**
 * Aplica um `order-updated` do canal da cozinha à lista em tela.
 *
 * O payload é lido com desconfiança: o id chega como `orderId` hoje e como
 * `id` no contrato novo, e os campos de pagamento podem não vir. Campo ausente
 * ou com valor desconhecido não sobrescreve nada.
 *
 * `buscar` pede uma ida ao servidor quando o aviso não basta: pedido que não
 * está na tela e cujo status o põe no quadro (voltou de um passo, ou chegou
 * antes do GET inicial). Para o resto, remendar a lista evita que cada clique
 * de qualquer tablet faça todos os outros baixarem a fila inteira.
 */
export function aplicarAtualizacao(
  pedidos: OrderWithItems[],
  payload: Record<string, unknown>,
  noQuadro: (s: OrderStatus) => boolean
): { pedidos: OrderWithItems[]; buscar: boolean } {
  const id = (payload.id ?? payload.orderId) as unknown;
  if (typeof id !== "string" || !id) return { pedidos, buscar: true };

  const status = um(STATUS, payload.status);
  const paymentStatus = um(SITUACOES, payload.paymentStatus);
  const paymentMethod = um(METODOS, payload.paymentMethod);

  const atual = pedidos.find((p) => p.id === id);
  if (!atual) {
    return { pedidos, buscar: !status || noQuadro(status) };
  }

  if (status && !noQuadro(status)) {
    return { pedidos: pedidos.filter((p) => p.id !== id), buscar: false };
  }

  const novo: OrderWithItems = {
    ...atual,
    ...(status ? { status } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
  };
  return { pedidos: pedidos.map((p) => (p.id === id ? novo : p)), buscar: false };
}

/**
 * Intervalo do polling de reserva da cozinha.
 *
 * Com o tempo real de pé o polling só corrige o que um aviso perdido deixou
 * para trás, então 60s basta. Sem ele, o polling é a única fonte de pedido
 * novo, e 10s é o atraso máximo aceitável para um cliente esperando.
 */
export function intervaloDaCozinha(conectado: boolean): number {
  return conectado ? 60_000 : 10_000;
}
