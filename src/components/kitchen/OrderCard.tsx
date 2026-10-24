"use client";

import { useState } from "react";
import { formatCurrency, getCustomerDisplayName } from "@/lib/utils";
import { OrderWithItems } from "@/types";
import { Clock, ChevronLeft, Printer } from "lucide-react";
import { DELIVERY_TYPE_META } from "./constants";
import { useAgora } from "@/hooks/useAgora";
import { rotuloDePagamento, type TomDoPagamento } from "@/lib/pagamento-rotulo";

const TOM_DO_PAGAMENTO: Record<TomDoPagamento, string> = {
  pago: "border-green-500/40 bg-green-500/10 text-green-300",
  pendente: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "na-entrega": "border-yellow-500/30 bg-yellow-500/5 text-yellow-200",
  neutro: "border-neutral-700 bg-neutral-800 text-neutral-400",
};

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
  // Confirmação no próprio card, não window.confirm: o diálogo nativo trava a
  // aba inteira, e no tablet do balcão isso para o quadro (e o alarme) até
  // alguém tocar nele.
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const pagamento = rotuloDePagamento(order.paymentMethod, order.paymentStatus);
  const deliveryMeta = DELIVERY_TYPE_META[order.deliveryType] ?? DELIVERY_TYPE_META.PICKUP;
  const DeliveryIcon = deliveryMeta.icon;
  const customerDisplayName = getCustomerDisplayName(order);

  async function handlePrint() {
    const { printOrder } = await import("@/lib/printOrder");
    printOrder(order, paperWidth);
  }

  return (
    <div className="bg-neutral-900 rounded-lg p-3 border border-neutral-800 flex flex-col gap-2">
      {/* ID + hora + tipo de entrega */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-neutral-300">
          #{order.id.slice(-6).toUpperCase()}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${deliveryMeta.className}`}>
            <DeliveryIcon size={9} />
            {order.deliveryType === "DINE_IN" && order.table
              ? order.table.name || `Mesa ${order.table.number}`
              : deliveryMeta.label}
          </span>
          <span className={`text-xs flex items-center gap-1 ${elapsed > 20 ? "text-red-400" : "text-neutral-500"}`}>
            <Clock size={10} />
            {elapsed}min
          </span>
        </div>
      </div>

      {pagamento && (
        <span
          className={`self-start text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TOM_DO_PAGAMENTO[pagamento.tom]}`}
        >
          {pagamento.texto}
        </span>
      )}

      {/* Cliente */}
      {customerDisplayName && (
        <p className="text-xs text-neutral-400 truncate">
          {customerDisplayName}
        </p>
      )}

      {/* Itens */}
      <ul className="space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm text-white leading-snug">
            <span className="font-bold text-brand-muted">{item.quantity}×</span>{" "}
            {item.menuItem.name}
            {item.notes && (
              <p className="text-xs text-neutral-500 ml-4 italic">{item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Obs do pedido */}
      {order.notes && (
        <p className="text-xs text-yellow-400 bg-yellow-400/10 rounded px-2 py-1">
          ⚠ {order.notes}
        </p>
      )}

      {/* Rodapé: valor + ações */}
      {/* Quebra em duas linhas quando não cabe: na coluna "Em Entrega" o card
          chega a ter Voltar, Cancelar e Entregue lado a lado, e com cinco
          colunas no quadro isso estourava a largura. */}
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 pt-1 border-t border-neutral-800 mt-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-neutral-400">
            {formatCurrency(order.total)}
          </span>
          {printerEnabled && (
            <button
              onClick={handlePrint}
              title="Imprimir pedido"
              className="text-neutral-500 hover:text-white transition p-0.5 rounded"
            >
              <Printer size={13} />
            </button>
          )}
        </div>
        {confirmandoCancelamento ? (
          <div className="flex flex-wrap items-center gap-1 ml-auto">
            <span className="text-xs text-red-300">Cancelar pedido?</span>
            <button
              onClick={() => setConfirmandoCancelamento(false)}
              disabled={ocupado}
              className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition disabled:opacity-50"
            >
              Manter
            </button>
            <button
              onClick={() => {
                setConfirmandoCancelamento(false);
                onCancel();
              }}
              disabled={ocupado}
              className="text-xs px-2 py-1 rounded bg-red-700 text-white font-semibold hover:bg-red-600 transition disabled:opacity-50"
            >
              Sim, cancelar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 ml-auto">
            {/* `disabled` enquanto o PATCH anda: o card já mudou de coluna
                pelo passo otimista, e um segundo toque no mesmo lugar mandava
                o passo seguinte, pulando uma etapa. */}
            {hasPrev && (
              <button
                onClick={onRevert}
                disabled={ocupado}
                title="Voltar fase anterior"
                className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={12} />
                Voltar
              </button>
            )}
            {order.status !== "READY" && (
              <button
                onClick={() => setConfirmandoCancelamento(true)}
                disabled={ocupado}
                className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-red-900/60 hover:text-red-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            )}
            {hasNext && (
              <button
                onClick={onAdvance}
                disabled={ocupado}
                className="text-xs px-2.5 py-1 rounded bg-brand hover:bg-brand-dark text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {order.status === "OUT_FOR_DELIVERY"
                  ? "Entregue"
                  : order.status === "READY"
                  ? order.deliveryType === "DELIVERY"
                    ? "Saiu p/ entrega"
                    : order.deliveryType === "DINE_IN"
                    ? "Servido"
                    : "Retirado"
                  : "Avançar →"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
