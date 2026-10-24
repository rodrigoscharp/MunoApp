"use client";

import { useEffect, useState } from "react";
import { useKitchenOrders } from "@/hooks/useKitchenOrders";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { OrderWithItems } from "@/types";
import { RefreshCw, AlertTriangle, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { PrinterConfig } from "@/app/api/settings/printer/route";
import { KITCHEN_COLUMNS, STATUS_COLORS, BADGE_COLORS, HEADER_COLORS } from "./constants";
import { proximoStatus, statusAnterior } from "@/lib/kitchen-flow";
import { OrderCard } from "./OrderCard";

// Um pedido some da tela quando o próximo status não tem coluna — ou seja,
// quando ele terminou (entregue ou cancelado). "Em entrega" TEM coluna: o
// pedido em rua continua visível até alguém fechá-lo.
const STATUS_NO_QUADRO = new Set(KITCHEN_COLUMNS.map((c) => c.status));

export function KitchenBoard() {
  const { orders, loading, error, estado, refetch, updateOrderStatus, removeOrder, restoreOrder } =
    useKitchenOrders();
  const [printer, setPrinter] = useState<PrinterConfig>({ enabled: false, paperWidth: "80mm" });

  useEffect(() => {
    fetch("/api/settings/printer")
      .then((r) => r.json())
      .then((cfg: PrinterConfig) => setPrinter(cfg))
      .catch(() => {});
  }, []);

  // Pedidos com PATCH em andamento. O card trava os botões enquanto o id
  // estiver aqui; o `if` no começo de cada ação cobre o toque que chega antes
  // de o React repintar o botão desabilitado.
  const [emAndamento, setEmAndamento] = useState<ReadonlySet<string>>(new Set());

  /**
   * Manda o status e devolve se o servidor aceitou. Erro de rede conta como
   * recusa: antes o `fetch` que lançava deixava o card no passo otimista para
   * sempre, sem aviso nenhum.
   *
   * Sem nova busca depois do sucesso: o passo otimista já pôs a tela no lugar,
   * e o order-updated que o próprio PATCH publica corrige o resto.
   */
  async function enviarStatus(order: OrderWithItems, status: string): Promise<boolean> {
    setEmAndamento((s) => new Set(s).add(order.id));
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setEmAndamento((s) => {
        const n = new Set(s);
        n.delete(order.id);
        return n;
      });
    }
  }

  async function advanceStatus(order: OrderWithItems) {
    if (emAndamento.has(order.id)) return;
    const nextStatus = proximoStatus(order.status, order.deliveryType);
    if (!nextStatus) return;

    // Optimistic: atualiza imediatamente na tela
    if (STATUS_NO_QUADRO.has(nextStatus)) {
      updateOrderStatus(order.id, nextStatus);
    } else {
      removeOrder(order.id);
    }

    if (await enviarStatus(order, nextStatus)) {
      toast.success(`#${order.id.slice(-6).toUpperCase()} → ${ORDER_STATUS_LABELS[nextStatus]}`);
    } else {
      // Devolve o retrato de antes do clique. `updateOrderStatus` não serve
      // quando o passo otimista foi `removeOrder`: o pedido já não está na
      // lista e o `map` não encontra nada para desfazer. Antes isto era um GET
      // da fila inteira, que sem rede também falhava e deixava o card sumido.
      restoreOrder(order);
      toast.error("Erro ao atualizar pedido");
    }
  }

  async function revertStatus(order: OrderWithItems) {
    if (emAndamento.has(order.id)) return;
    const prevStatus = statusAnterior(order.status);
    if (!prevStatus) return;

    updateOrderStatus(order.id, prevStatus);

    if (await enviarStatus(order, prevStatus)) {
      toast.info(`#${order.id.slice(-6).toUpperCase()} ← ${ORDER_STATUS_LABELS[prevStatus]}`);
    } else {
      restoreOrder(order);
      toast.error("Erro ao reverter pedido");
    }
  }

  async function cancelOrder(order: OrderWithItems) {
    if (emAndamento.has(order.id)) return;
    // Optimistic: remove da lista imediatamente
    removeOrder(order.id);

    if (await enviarStatus(order, "CANCELLED")) {
      toast.error(`Pedido #${order.id.slice(-6).toUpperCase()} cancelado`);
    } else {
      restoreOrder(order);
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
      {/* Só depois de falhar: "conectando" no carregamento é o estado normal e
          não merece aviso. O texto diz o que muda para quem está no balcão. */}
      {estado === "sem-tempo-real" && (
        <div
          role="status"
          className="self-start flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1"
        >
          <WifiOff size={12} />
          Sem tempo real · atualizando a cada 10s
        </div>
      )}

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                    hasNext={!!proximoStatus(order.status, order.deliveryType)}
                    hasPrev={!!statusAnterior(order.status)}
                    printerEnabled={printer.enabled}
                    paperWidth={printer.paperWidth}
                    ocupado={emAndamento.has(order.id)}
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
