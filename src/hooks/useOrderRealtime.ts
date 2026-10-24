"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanalRealtime } from "@/hooks/useTopicoRealtime";
import { OrderStatus, PaymentStatus } from "@/types";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { toast } from "sonner";

const STATUS = new Set<string>(Object.keys(ORDER_STATUS_LABELS));
const SITUACOES = new Set<string>(["UNPAID", "PAID", "REFUNDED"]);

export interface AtualizacaoDoPedido {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  updatedAt?: string;
  estimatedDeliveryAt?: Date;
}

/**
 * Lê o que interessa ao acompanhamento, venha do broadcast ou do GET. Campo
 * ausente ou com valor desconhecido fica de fora, e não apaga o que a tela já
 * sabe: o payload do canal ainda não traz `paymentStatus` em todo publisher.
 */
export function lerAtualizacaoDoPedido(dado: Record<string, unknown> | null): AtualizacaoDoPedido {
  if (!dado) return {};
  const r: AtualizacaoDoPedido = {};
  if (typeof dado.status === "string" && STATUS.has(dado.status)) r.status = dado.status as OrderStatus;
  if (typeof dado.paymentStatus === "string" && SITUACOES.has(dado.paymentStatus)) {
    r.paymentStatus = dado.paymentStatus as PaymentStatus;
  }
  if (typeof dado.updatedAt === "string") r.updatedAt = dado.updatedAt;
  if (typeof dado.estimatedDeliveryAt === "string") {
    const d = new Date(dado.estimatedDeliveryAt);
    if (!Number.isNaN(d.getTime())) r.estimatedDeliveryAt = d;
  }
  return r;
}

/**
 * Intervalo do polling de reserva do acompanhamento. Sem tempo real, 15s é o
 * atraso que o cliente tolera para ver "saiu para entrega"; com ele, o polling
 * só cobre aviso perdido.
 */
export function intervaloDoAcompanhamento(conectado: boolean): number {
  return conectado ? 45_000 : 15_000;
}

export function useOrderRealtime(
  orderId: string,
  inicial?: { status?: OrderStatus | null }
) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [estimatedDeliveryAt, setEstimatedDeliveryAt] = useState<Date | null>(null);
  // Último status mostrado, para o aviso sair só quando algo mudou. O polling
  // devolve o mesmo status a cada volta, e um toast por volta seria ruído.
  const ultimoStatus = useRef<OrderStatus | null>(inicial?.status ?? null);

  const aplicar = useCallback((a: AtualizacaoDoPedido) => {
    if (a.status) {
      setStatus(a.status);
      if (ultimoStatus.current !== a.status) {
        ultimoStatus.current = a.status;
        toast.info(`Pedido atualizado: ${ORDER_STATUS_LABELS[a.status]}`);
      }
    }
    if (a.paymentStatus) setPaymentStatus(a.paymentStatus);
    if (a.updatedAt) setUpdatedAt(a.updatedAt);
    if (a.estimatedDeliveryAt) setEstimatedDeliveryAt(a.estimatedDeliveryAt);
  }, []);

  const estado = useCanalRealtime("order", orderId, {
    "order-updated": (payload) => aplicar(lerAtualizacaoDoPedido(payload)),
  });
  const conectado = estado === "conectado";

  // Polling de reserva. Antes não havia nenhum: sem o canal, o cliente ficava
  // olhando "em preparo" até recarregar a página, e o QR do Pix continuava na
  // tela depois de pago.
  useEffect(() => {
    let ativo = true;
    const buscar = () => {
      fetch(`/api/orders/${orderId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((dado) => {
          if (ativo && dado) aplicar(lerAtualizacaoDoPedido(dado));
        })
        .catch(() => {});
    };
    const parar = iniciarPollingVisivel(buscar, intervaloDoAcompanhamento(conectado));
    return () => {
      ativo = false;
      parar();
    };
  }, [orderId, conectado, aplicar]);

  return { status, paymentStatus, updatedAt, estimatedDeliveryAt, estado };
}
