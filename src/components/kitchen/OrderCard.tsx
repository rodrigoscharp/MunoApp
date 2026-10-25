"use client";

import { useState } from "react";
import { cn, formatCurrency, getCustomerDisplayName } from "@/lib/utils";
import { OrderWithItems } from "@/types";
import { AlertTriangle, ChevronLeft, Clock, Printer } from "lucide-react";
import { DELIVERY_TYPE_META, rotuloDaAcao } from "./constants";
import { useAgora } from "@/hooks/useAgora";
import { rotuloDePagamento, type TomDoPagamento } from "@/lib/pagamento-rotulo";
import { Selo, type TomDoSelo } from "@/components/painel/Selo";
import { botaoBrasa, botaoContorno, botaoFloresta } from "@/components/painel/estilos";

/**
 * O selo de pagamento usa os tons do painel. "Pendente" é o tom de alerta
 * porque é a pergunta do balcão ("posso soltar?"); dinheiro na entrega é o
 * normal e fica no tom de andamento, sem gritar.
 */
const TOM_DO_PAGAMENTO: Record<TomDoPagamento, TomDoSelo> = {
  pago: "pago",
  pendente: "alerta",
  "na-entrega": "andamento",
  neutro: "neutro",
};

/** Minutos a partir dos quais o pedido está atrasado e o card avisa forte. */
const ATRASO_MIN = 20;

/** Vermelho do atraso: branco sobre ele passa de 6:1. */
const VERMELHO = "#A3221B";

export function OrderCard({
  order,
  onAdvance,
  onRevert,
  onCancel,
  hasNext,
  hasPrev,
  printerEnabled,
  paperWidth,
  ocupado = false,
}: {
  order: OrderWithItems;
  onAdvance: () => void;
  onRevert: () => void;
  onCancel: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  printerEnabled: boolean;
  paperWidth: "58mm" | "80mm";
  /** Há um PATCH deste pedido em andamento: os botões de ação ficam travados. */
  ocupado?: boolean;
}) {
  const agora = useAgora();
  const elapsed = Math.max(0, Math.floor((agora - new Date(order.createdAt).getTime()) / 60_000));
  const atrasado = elapsed > ATRASO_MIN;
  // Confirmação no próprio card, não window.confirm: o diálogo nativo trava a
  // aba inteira, e no tablet do balcão isso para o quadro (e o alarme) até
  // alguém tocar nele.
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const pagamento = rotuloDePagamento(order.paymentMethod, order.paymentStatus);
  const deliveryMeta = DELIVERY_TYPE_META[order.deliveryType] ?? DELIVERY_TYPE_META.PICKUP;
  const DeliveryIcon = deliveryMeta.icon;
  const customerDisplayName = getCustomerDisplayName(order);
  const canal =
    order.deliveryType === "DINE_IN" && order.table
      ? order.table.name || `Mesa ${order.table.number}`
      : deliveryMeta.label;
  // O último passo é entregar o pedido a alguém: floresta, para não se
  // confundir com o terracota de "mexer na comida".
  const botaoPrincipal =
    order.status === "READY" || order.status === "OUT_FOR_DELIVERY" ? botaoFloresta : botaoBrasa;

  async function handlePrint() {
    const { printOrder } = await import("@/lib/printOrder");
    printOrder(order, paperWidth);
  }

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-[20px] bg-loja-papel p-4 text-loja-tinta shadow-loja",
        atrasado && "ring-[3px] ring-[#A3221B]"
      )}
    >
      {/* Número + tempo de espera */}
      <div className="flex items-start justify-between gap-2">
        <span className="manchete text-[30px] leading-none text-forest-dark tabular-nums">
          #{order.id.slice(-6).toUpperCase()}
        </span>
        <span
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[15px] font-extrabold tabular-nums",
            atrasado ? "text-white" : "bg-loja-creme text-loja-tinta"
          )}
          style={atrasado ? { backgroundColor: VERMELHO } : undefined}
        >
          {atrasado ? <AlertTriangle size={15} aria-hidden /> : <Clock size={15} aria-hidden />}
          {elapsed} min
          {atrasado && <span className="sr-only"> · atrasado</span>}
        </span>
      </div>

      {/* Canal + pagamento */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-forest-dark px-3 text-[13px] font-extrabold text-white">
          <DeliveryIcon size={15} aria-hidden />
          {canal}
        </span>
        {pagamento && (
          <Selo tom={TOM_DO_PAGAMENTO[pagamento.tom]} className="h-8 px-3 text-[13px]">
            {pagamento.texto}
          </Selo>
        )}
      </div>

      {/* Cliente */}
      {customerDisplayName && (
        <p className="truncate text-[14px] font-semibold text-loja-tinta-2">{customerDisplayName}</p>
      )}

      {/* Itens */}
      <ul className="flex flex-col gap-2 border-t border-loja-linha pt-3">
        {order.items.map((item) => (
          <li key={item.id} className="text-[17px] font-bold leading-snug">
            <span className="mr-1 font-extrabold text-loja-preco tabular-nums">{item.quantity}×</span>
            {item.menuItem.name}
            {item.notes && (
              <p className="mt-1 rounded-xl border-l-4 border-loja-brasa bg-loja-pessego-claro px-3 py-1.5 text-[14px] font-bold text-[#7A3410]">
                {item.notes}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* Obs do pedido */}
      {order.notes && (
        <p className="flex items-start gap-2 rounded-xl bg-[#5A2A14] px-3 py-2 text-[14px] font-bold text-[#FDE3CF]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{order.notes}</span>
        </p>
      )}

      {/* Rodapé: valor + ações */}
      <div className="flex flex-col gap-2.5 border-t border-loja-linha pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-extrabold tabular-nums">{formatCurrency(order.total)}</span>
          {printerEnabled && (
            <button
              onClick={handlePrint}
              title="Imprimir pedido"
              aria-label="Imprimir pedido"
              className="inline-flex size-11 items-center justify-center rounded-full bg-loja-creme text-loja-tinta transition hover:bg-loja-pessego-claro"
            >
              <Printer size={18} />
            </button>
          )}
        </div>

        {confirmandoCancelamento ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-[#FBE4E1] p-3">
            <span className="text-[15px] font-extrabold text-[#7F1D16]">Cancelar este pedido?</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirmandoCancelamento(false)}
                disabled={ocupado}
                className={cn(botaoContorno, "h-[52px] bg-loja-papel px-3 text-[15px]")}
              >
                Manter
              </button>
              <button
                onClick={() => {
                  setConfirmandoCancelamento(false);
                  onCancel();
                }}
                disabled={ocupado}
                className="inline-flex h-[52px] items-center justify-center rounded-full px-3 text-[15px] font-extrabold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: VERMELHO }}
              >
                Sim, cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* `disabled` enquanto o PATCH anda: o card já mudou de coluna
                pelo passo otimista, e um segundo toque no mesmo lugar mandava
                o passo seguinte, pulando uma etapa. */}
            {hasNext && (
              <button
                onClick={onAdvance}
                disabled={ocupado}
                className={cn(botaoPrincipal, "h-14 w-full text-[17px]")}
              >
                {rotuloDaAcao(order.status, order.deliveryType)}
              </button>
            )}
            {(hasPrev || order.status !== "READY") && (
              <div className="flex gap-2">
                {hasPrev && (
                  <button
                    onClick={onRevert}
                    disabled={ocupado}
                    title="Voltar fase anterior"
                    className="inline-flex h-12 flex-1 items-center justify-center gap-1 rounded-full bg-loja-creme px-3 text-[14px] font-bold text-loja-tinta transition hover:bg-loja-pessego-claro disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft size={16} aria-hidden />
                    Voltar
                  </button>
                )}
                {order.status !== "READY" && (
                  <button
                    onClick={() => setConfirmandoCancelamento(true)}
                    disabled={ocupado}
                    className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-loja-creme px-3 text-[14px] font-bold text-[#8F1F18] transition hover:bg-[#FBE4E1] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
