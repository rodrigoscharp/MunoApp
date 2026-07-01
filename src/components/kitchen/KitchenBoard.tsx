"use client";

import { useEffect, useState } from "react";
import { useKitchenOrders } from "@/hooks/useKitchenOrders";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { OrderWithItems } from "@/types";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { PrinterConfig } from "@/app/api/settings/printer/route";
import { KITCHEN_COLUMNS, NEXT_STATUS, PREV_STATUS, STATUS_COLORS, BADGE_COLORS, HEADER_COLORS } from "./constants";
import { OrderCard } from "./OrderCard";

export function KitchenBoard() {
  const { orders, loading, error, refetch, updateOrderStatus, removeOrder } = useKitchenOrders();
  const [printer, setPrinter] = useState<PrinterConfig>({ enabled: false, paperWidth: "80mm" });

  useEffect(() => {
    fetch("/api/settings/printer")
      .then((r) => r.json())
      .then((cfg: PrinterConfig) => setPrinter(cfg))
      .catch(() => {});
  }, []);

  async function advanceStatus(order: OrderWithItems) {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;

    // Optimistic: atualiza imediatamente na tela
    if (nextStatus === "DELIVERED") {
      removeOrder(order.id);
    } else {
      updateOrderStatus(order.id, nextStatus);
    }

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (res.ok) {
      toast.success(`#${order.id.slice(-6).toUpperCase()} → ${ORDER_STATUS_LABELS[nextStatus]}`);
    } else {
      // Reverte em caso de erro
      updateOrderStatus(order.id, order.status);
      toast.error("Erro ao atualizar pedido");
    }
  }

  async function revertStatus(order: OrderWithItems) {
    const prevStatus = PREV_STATUS[order.status];
    if (!prevStatus) return;

    updateOrderStatus(order.id, prevStatus);

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: prevStatus }),
    });

    if (res.ok) {
      toast.info(`#${order.id.slice(-6).toUpperCase()} ← ${ORDER_STATUS_LABELS[prevStatus]}`);
    } else {
      updateOrderStatus(order.id, order.status);
      toast.error("Erro ao reverter pedido");
    }
  }

  async function cancelOrder(order: OrderWithItems) {
    // Optimistic: remove da lista imediatamente
    removeOrder(order.id);

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    if (res.ok) {
      toast.error(`Pedido #${order.id.slice(-6).toUpperCase()} cancelado`);
    } else {
      // Reverte
      updateOrderStatus(order.id, order.status);
      toast.error("Erro ao cancelar pedido");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-neutral-500">
        <RefreshCw size={18} className="animate-spin" />
        Carregando pedidos...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2.5">
          <AlertTriangle size={15} />
          {error}
          <button onClick={refetch} className="ml-auto underline hover:no-underline text-xs">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KITCHEN_COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.status);
          return (
            <div
              key={col.status}
              className={`rounded-xl border ${STATUS_COLORS[col.color]} flex flex-col gap-3 p-4 min-h-48`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 font-semibold text-sm ${HEADER_COLORS[col.color]}`}>
                  {col.icon}
                  {col.label}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${BADGE_COLORS[col.color]}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Orders */}
              <div className="space-y-3">
                {colOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAdvance={() => advanceStatus(order)}
                    onRevert={() => revertStatus(order)}
                    onCancel={() => cancelOrder(order)}
                    hasNext={!!NEXT_STATUS[order.status]}
                    hasPrev={!!PREV_STATUS[order.status]}
                    printerEnabled={printer.enabled}
                    paperWidth={printer.paperWidth}
                  />
                ))}

                {colOrders.length === 0 && (
                  <p className="text-xs text-neutral-600 text-center py-6">
                    Nenhum pedido
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
