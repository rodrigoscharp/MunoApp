import { formatCurrency } from "@/lib/utils";
import { OrderWithItems } from "@/types";
import { Clock, ChevronLeft, Printer } from "lucide-react";
import { DELIVERY_TYPE_META } from "./constants";

export function OrderCard({
  order,
  onAdvance,
  onRevert,
  onCancel,
  hasNext,
  hasPrev,
  printerEnabled,
  paperWidth,
}: {
  order: OrderWithItems;
  onAdvance: () => void;
  onRevert: () => void;
  onCancel: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  printerEnabled: boolean;
  paperWidth: "58mm" | "80mm";
}) {
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000);
  const deliveryMeta = DELIVERY_TYPE_META[order.deliveryType] ?? DELIVERY_TYPE_META.PICKUP;
  const DeliveryIcon = deliveryMeta.icon;

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
            {deliveryMeta.label}
          </span>
          <span className={`text-xs flex items-center gap-1 ${elapsed > 20 ? "text-red-400" : "text-neutral-500"}`}>
            <Clock size={10} />
            {elapsed}min
          </span>
        </div>
      </div>

      {/* Cliente */}
      {(order.customerName || order.user?.name) && (
        <p className="text-xs text-neutral-400 truncate">
          {order.user?.name || order.customerName}
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
      <div className="flex items-center justify-between pt-1 border-t border-neutral-800 mt-1">
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
        <div className="flex gap-1">
          {hasPrev && (
            <button
              onClick={onRevert}
              title="Voltar fase anterior"
              className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition flex items-center gap-1"
            >
              <ChevronLeft size={12} />
              Voltar
            </button>
          )}
          {order.status !== "READY" && (
            <button
              onClick={onCancel}
              className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-400 hover:bg-red-900/60 hover:text-red-300 transition"
            >
              Cancelar
            </button>
          )}
          {hasNext && (
            <button
              onClick={onAdvance}
              className="text-xs px-2.5 py-1 rounded bg-brand hover:bg-brand-dark text-white font-semibold transition"
            >
              {order.status === "READY"
                ? order.deliveryType === "DELIVERY"
                  ? "Saiu p/ entrega"
                  : order.deliveryType === "DINE_IN"
                  ? "Servido"
                  : "Retirado"
                : "Avançar →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
