import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

/**
 * Pedidos de mesa (QR code, sem login) devem mostrar o nome digitado no checkout
 * da mesa, nunca o nome de uma conta logada — a mesma pessoa pode pedir para
 * várias pessoas na mesa com nomes diferentes. Só no cardápio digital de
 * delivery/retirada (com login opcional) o nome da conta tem prioridade.
 */
export function getCustomerDisplayName(order: {
  deliveryType: string;
  customerName?: string | null;
  user?: { name: string } | null;
}): string | null {
  if (order.deliveryType === "DINE_IN") {
    return order.customerName || order.user?.name || null;
  }
  return order.user?.name || order.customerName || null;
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "Em Preparo",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Em Entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de Crédito",
  CASH: "Dinheiro",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Não Pago",
  PAID: "Pago",
  REFUNDED: "Reembolsado",
};
