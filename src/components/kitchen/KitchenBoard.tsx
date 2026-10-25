"use client";

import { useEffect, useState } from "react";
import { useKitchenOrders } from "@/hooks/useKitchenOrders";
import { ORDER_STATUS_LABELS } from "@/lib/utils";
import { OrderWithItems } from "@/types";
import Link from "next/link";
import {
  RefreshCw,
  AlertTriangle,
  WifiOff,
  Wifi,
  Bell,
  BellOff,
  BellRing,
} from "lucide-react";
import { toast } from "sonner";
import type { PrinterConfig } from "@/app/api/settings/printer/route";
import { KITCHEN_COLUMNS, FAIXA_DA_COLUNA, CONTADOR_DA_COLUNA } from "./constants";
import { proximoStatus, statusAnterior } from "@/lib/kitchen-flow";
import { OrderCard } from "./OrderCard";
import { useAlertaCozinha } from "@/hooks/useAlertaCozinha";
import { useAgora } from "@/hooks/useAgora";
import type { EstadoRealtime } from "@/hooks/useTopicoRealtime";
import { cn } from "@/lib/utils";

// Um pedido some da tela quando o próximo status não tem coluna — ou seja,
// quando ele terminou (entregue ou cancelado). "Em entrega" TEM coluna: o
// pedido em rua continua visível até alguém fechá-lo.
const STATUS_NO_QUADRO = new Set(KITCHEN_COLUMNS.map((c) => c.status));

export function KitchenBoard({
  restaurante,
  usuario,
  ehAdmin = false,
}: {
  /** Nome do restaurante, no topo. Vazio quando o cadastro não pôde ser lido. */
  restaurante?: string;
  usuario?: string | null;
  /** Mostra o atalho para o /adm. */
  ehAdmin?: boolean;
} = {}) {
  const { orders, loading, error, estado, refetch, updateOrderStatus, removeOrder, restoreOrder } =
    useKitchenOrders();
  const alerta = useAlertaCozinha(orders);
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
    alerta.ciente([order.id]);
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
    alerta.ciente([order.id]);
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
    alerta.ciente([order.id]);
    // Optimistic: remove da lista imediatamente
    removeOrder(order.id);

    if (await enviarStatus(order, "CANCELLED")) {
      toast.error(`Pedido #${order.id.slice(-6).toUpperCase()} cancelado`);
    } else {
      restoreOrder(order);
      toast.error("Erro ao cancelar pedido");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Topo e aviso juntos, presos no alto: no tablet o quadro rola, e quem
          está na chapa precisa ver o pedido novo sem voltar para cima. */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 bg-loja-creme px-4 pt-4 pb-1 sm:-mx-6 sm:px-6">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[22px] bg-forest-dark px-5 py-3 text-white">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="manchete text-[2.1rem]">Cozinha</h1>
            {restaurante && (
              <span className="truncate text-[15px] font-semibold text-white/85">{restaurante}</span>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <PilulaDoTempoReal estado={estado} />

            <button
              onClick={alerta.alternarSom}
              aria-pressed={alerta.somAtivo}
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-full px-4 text-[14px] font-extrabold transition",
                alerta.somAtivo && !alerta.bloqueado
                  ? "border-[1.5px] border-white/40 bg-white/10 text-white hover:bg-white/20"
                  : "bg-[#FDBA8C] text-[#5A2A14] hover:bg-[#FCCBA8]"
              )}
            >
              {alerta.somAtivo ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
              {!alerta.somAtivo
                ? "Ativar som"
                : alerta.bloqueado
                ? "Som ligado · toque na tela para liberar"
                : "Som ativo"}
            </button>

            <Relogio />

            <nav aria-label="Outras telas" className="flex items-center gap-1">
              <Link
                href="/"
                className="inline-flex h-11 items-center rounded-full px-3 text-[13px] font-bold text-white/85 transition hover:bg-white/10 hover:text-white"
              >
                Cardápio
              </Link>
              {ehAdmin && (
                <Link
                  href="/adm"
                  className="inline-flex h-11 items-center rounded-full px-3 text-[13px] font-bold text-white/85 transition hover:bg-white/10 hover:text-white"
                >
                  Admin
                </Link>
              )}
              {usuario && (
                <span className="hidden px-2 text-[12.5px] font-semibold text-white/75 lg:inline">{usuario}</span>
              )}
            </nav>
          </div>
        </header>

        {alerta.alertando.length > 0 && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-[22px] bg-loja-brasa px-5 py-3 text-white shadow-loja-brasa"
          >
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <span className="absolute inset-0 rounded-full bg-white/25 motion-safe:animate-ping" aria-hidden />
              <BellRing size={20} aria-hidden />
            </span>
            <span className="manchete text-[1.9rem]">
              {alerta.alertando.length === 1
                ? "1 pedido novo"
                : `${alerta.alertando.length} pedidos novos`}
            </span>
            <button
              onClick={() => alerta.ciente()}
              className="ml-auto inline-flex h-[52px] items-center rounded-full bg-loja-papel px-7 text-[16px] font-extrabold text-loja-preco transition hover:bg-white active:scale-[0.98]"
            >
              Ciente
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-[18px] bg-[#FBE4E1] px-4 py-3 text-[15px] font-bold text-[#7F1D16]">
          <AlertTriangle size={18} aria-hidden />
          {error}
          <button
            onClick={refetch}
            className="ml-auto inline-flex h-11 items-center rounded-full bg-loja-papel px-4 text-[14px] font-extrabold text-[#7F1D16] transition hover:bg-white"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center gap-3 text-[16px] font-semibold text-loja-tinta-2">
          <RefreshCw size={20} className="animate-spin" aria-hidden />
          Carregando pedidos...
        </div>
      ) : (
        /* No celular as colunas empilham; do tablet para cima ficam lado a
           lado, e se não couberem com largura de leitura, o quadro rola na
           horizontal em vez de espremer o card. */
        <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-flow-col sm:grid-cols-none sm:auto-cols-[minmax(17.5rem,1fr)] sm:overflow-x-auto">
          {KITCHEN_COLUMNS.map((col) => {
            const colOrders = orders.filter((o) => o.status === col.status);
            return (
              <section
                key={col.status}
                aria-label={col.label}
                className="flex min-h-48 flex-col gap-3 rounded-[24px] bg-[#EFE4D7] p-3"
              >
                <div className={cn("h-1.5 rounded-full", FAIXA_DA_COLUNA[col.tom])} aria-hidden />
                <div className="flex items-center justify-between px-1">
                  <h2 className="manchete text-[1.75rem] text-forest-dark">{col.label}</h2>
                  <span
                    className={cn(
                      "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[15px] font-extrabold tabular-nums",
                      CONTADOR_DA_COLUNA[col.tom]
                    )}
                  >
                    {colOrders.length}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
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
                    <p className="py-8 text-center text-[14px] font-semibold text-loja-tinta-2">
                      Nenhum pedido
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * O estado do canal, dito para quem está no balcão. "Conectando" é o estado
 * normal do carregamento e não leva tom de alerta; só a falha leva, e diz o
 * que muda: a tela segue, de 10 em 10 segundos.
 */
function PilulaDoTempoReal({ estado }: { estado: EstadoRealtime }) {
  if (estado === "sem-tempo-real") {
    return (
      <span
        role="status"
        className="inline-flex h-12 items-center gap-2 rounded-full bg-[#FDBA8C] px-4 text-[14px] font-extrabold text-[#5A2A14]"
      >
        <WifiOff size={18} aria-hidden />
        <span className="flex flex-col leading-tight">
          <span>Sem tempo real</span>
          <span className="text-[11.5px] font-bold">atualizando a cada 10s</span>
        </span>
      </span>
    );
  }
  return (
    <span
      role="status"
      className={cn(
        "inline-flex h-12 items-center gap-2 rounded-full px-4 text-[14px] font-extrabold",
        estado === "conectado" ? "bg-loja-folha text-forest-dark" : "bg-white/10 text-white"
      )}
    >
      <Wifi size={18} aria-hidden />
      {estado === "conectado" ? "Tempo real" : "Conectando"}
    </span>
  );
}

/**
 * Hora do balcão. Usa o relógio compartilhado do quadro (tiques de 30s), o
 * mesmo dos minutos de espera dos cards, para não abrir um segundo timer. A
 * hora do servidor e a do tablet diferem no fuso, por isso o aviso de
 * hidratação é suprimido no texto.
 */
function Relogio() {
  const agora = useAgora();
  const hora = new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <time
      suppressHydrationWarning
      className="manchete min-w-[4.5ch] text-[2rem] tabular-nums text-white"
    >
      {hora}
    </time>
  );
}
