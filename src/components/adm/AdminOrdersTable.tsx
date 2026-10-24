"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCanalRealtime } from "@/hooks/useTopicoRealtime";
import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import {
  formatCurrency,
  formatDate,
  getCustomerDisplayName,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/utils";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@/types";
import { X } from "lucide-react";

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  menuItem: { id: string; name: string; imageUrl: string | null };
}

interface Order {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryType: string;
  total: number;
  deliveryFee?: number;
  discount?: number;
  couponCode?: string | null;
  notes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  user: { name: string; email: string } | null;
  table: { number: number; name: string | null } | null;
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  IN_PREPARATION: "bg-orange-100 text-orange-700",
  READY: "bg-green-100 text-green-700",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-neutral-100 text-neutral-600",
  CANCELLED: "bg-brand-light text-red-700",
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  UNPAID: "text-brand",
  PAID: "text-green-600",
  REFUNDED: "text-neutral-500",
};

const STATUS_VALIDOS = new Set(Object.keys(STATUS_COLORS));
const SITUACOES_VALIDAS = new Set(Object.keys(PAYMENT_COLORS));
const METODOS_VALIDOS = new Set(["PIX", "CREDIT_CARD", "CASH"]);

/**
 * O que um order-updated muda numa linha. Lido com desconfiança: o id chega
 * como `orderId` ou `id`, e campo ausente ou desconhecido não sobrescreve nada.
 */
export function ajusteDoEvento(
  payload: Record<string, unknown>
): { id: string; ajuste: Partial<Order> } | null {
  const id = payload.id ?? payload.orderId;
  if (typeof id !== "string" || !id) return null;
  const ajuste: Partial<Order> = {};
  if (typeof payload.status === "string" && STATUS_VALIDOS.has(payload.status)) {
    ajuste.status = payload.status as OrderStatus;
  }
  if (typeof payload.paymentStatus === "string" && SITUACOES_VALIDAS.has(payload.paymentStatus)) {
    ajuste.paymentStatus = payload.paymentStatus as PaymentStatus;
  }
  if (typeof payload.paymentMethod === "string" && METODOS_VALIDOS.has(payload.paymentMethod)) {
    ajuste.paymentMethod = payload.paymentMethod as PaymentMethod;
  }
  return { id, ajuste };
}

// Rajada de pedidos (hora do almoço) vira um refresh só.
const ESPERA_DO_REFRESH_MS = 800;

export function AdminOrdersTable({ orders: doServidor }: { orders: Order[] }) {
  // Pelo id, não o objeto: o objeto guardado era um retrato do clique e não
  // acompanhava as mudanças que chegam pelo canal.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const router = useRouter();

  // A lista era um retrato do carregamento: o dono via "Pendente" num pedido
  // já entregue até recarregar a página. Agora a tela escuta o canal da
  // cozinha. Mudança de pedido que já está na lista é remendada aqui; pedido
  // novo (ou que a tela não conhece) pede um router.refresh, que traz a linha
  // completa pelo servidor.
  const [ajustes, setAjustes] = useState<Record<string, Partial<Order>>>({});
  // Lista nova do servidor zera os remendos: ela já é mais nova que eles, e um
  // remendo velho por cima esconderia uma mudança que o aviso não trouxe.
  const [base, setBase] = useState(doServidor);
  if (base !== doServidor) {
    setBase(doServidor);
    setAjustes({});
  }
  const orders = useMemo(
    () => doServidor.map((o) => (ajustes[o.id] ? { ...o, ...ajustes[o.id] } : o)),
    [doServidor, ajustes]
  );
  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const setSelected = (o: Order | null) => setSelectedId(o?.id ?? null);

  const idsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    idsRef.current = new Set(doServidor.map((o) => o.id));
  }, [doServidor]);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const recarregarEmBreve = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), ESPERA_DO_REFRESH_MS);
  };

  const estado = useCanalRealtime("kitchen", null, {
    "order-created": () => recarregarEmBreve(),
    "order-updated": (payload) => {
      const evento = ajusteDoEvento(payload);
      if (!evento || !idsRef.current.has(evento.id)) {
        recarregarEmBreve();
        return;
      }
      setAjustes((a) => ({ ...a, [evento.id]: { ...a[evento.id], ...evento.ajuste } }));
    },
  });

  // Sem tempo real, a lista se renova sozinha a cada minuto com a aba visível.
  // É histórico, não fila: um minuto de atraso não custa pedido.
  const conectado = estado === "conectado";
  useEffect(() => {
    if (conectado) return;
    return iniciarPollingVisivel(() => router.refresh(), 60_000);
  }, [conectado, router]);

  const filtered = filter === "ALL" ? orders : orders.filter((o) => o.status === filter);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/*
          OUT_FOR_DELIVERY faltava aqui: a coluna de status sabe exibi-lo, mas não
          havia botão para filtrá-lo, e o pedido em rua ficava inalcançável na
          hora exata em que o cliente liga perguntando dele. É o mesmo esquecimento
          que já tinha acontecido na lista de status aceitos pelo PATCH do pedido.
        */}
        {(["ALL", "PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"] as const).map(
          (s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                filter === s
                  ? "bg-brand text-white"
                  : "bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300"
              }`}
            >
              {s === "ALL" ? "Todos" : ORDER_STATUS_LABELS[s]}
            </button>
          )
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="text-left px-4 py-3 text-neutral-500 font-medium">ID</th>
                <th className="text-left px-4 py-3 text-neutral-500 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-neutral-500 font-medium">Mesa</th>
                <th className="text-left px-4 py-3 text-neutral-500 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-neutral-500 font-medium">Pagamento</th>
                <th className="text-left px-4 py-3 text-neutral-500 font-medium">Total</th>
                <th className="text-left px-4 py-3 text-neutral-500 font-medium">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelected(order)}
                  className="hover:bg-neutral-50 cursor-pointer transition"
                >
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                    #{order.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    {getCustomerDisplayName(order) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {order.table ? order.table.name || `Mesa ${order.table.number}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    <div className="flex flex-col">
                      <span>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
                      <span className={`text-xs font-medium ${PAYMENT_COLORS[order.paymentStatus]}`}>
                        {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(order.total)}</td>
                  <td className="px-4 py-3 text-neutral-400 text-xs">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-neutral-400">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-semibold text-neutral-900">
                  Pedido #{selected.id.slice(-6).toUpperCase()}
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">{formatDate(selected.createdAt)}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[selected.status]}`}>
                  {ORDER_STATUS_LABELS[selected.status]}
                </span>
                <div className="text-right">
                  <p className="text-sm text-neutral-600">{PAYMENT_METHOD_LABELS[selected.paymentMethod]}</p>
                  <p className={`text-xs font-medium ${PAYMENT_COLORS[selected.paymentStatus]}`}>
                    {PAYMENT_STATUS_LABELS[selected.paymentStatus]}
                  </p>
                </div>
              </div>

              {/* Customer */}
              {(selected.user || selected.customerName) && (
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-xs text-neutral-400 mb-1">Cliente</p>
                  <p className="text-sm font-medium">{getCustomerDisplayName(selected)}</p>
                  {selected.user?.email && (
                    <p className="text-xs text-neutral-500">{selected.user.email}</p>
                  )}
                  {selected.customerPhone && (
                    <p className="text-xs text-neutral-500">{selected.customerPhone}</p>
                  )}
                  {selected.table && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {selected.table.name || `Mesa ${selected.table.number}`}
                    </p>
                  )}
                </div>
              )}

              {/* Items */}
              <div>
                <p className="text-xs text-neutral-400 mb-2">Itens</p>
                <ul className="space-y-2">
                  {selected.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2">
                      <div className="flex gap-2">
                        <span className="text-sm font-bold text-brand">{item.quantity}x</span>
                        <div>
                          <span className="text-sm">{item.menuItem.name}</span>
                          {item.notes && (
                            <p className="text-xs text-neutral-400">{item.notes}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-neutral-600 flex-shrink-0">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {selected.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-700 font-medium">Observação</p>
                  <p className="text-sm text-yellow-800 mt-0.5">{selected.notes}</p>
                </div>
              )}

              <div className="border-t border-neutral-100 pt-3 space-y-1.5">
                {(Number(selected.deliveryFee ?? 0) > 0 || Number(selected.discount ?? 0) > 0) && (
                  <>
                    <div className="flex justify-between text-sm text-neutral-500">
                      <span>Subtotal</span>
                      <span>
                        {formatCurrency(
                          Number(selected.total) -
                            Number(selected.deliveryFee ?? 0) +
                            Number(selected.discount ?? 0)
                        )}
                      </span>
                    </div>
                    {Number(selected.deliveryFee ?? 0) > 0 && (
                      <div className="flex justify-between text-sm text-neutral-500">
                        <span>Taxa de entrega</span>
                        <span>{formatCurrency(Number(selected.deliveryFee))}</span>
                      </div>
                    )}
                    {Number(selected.discount ?? 0) > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>
                          Desconto
                          {selected.couponCode && (
                            <span className="text-green-500 text-xs font-mono ml-1">
                              · {selected.couponCode}
                            </span>
                          )}
                        </span>
                        <span>-{formatCurrency(Number(selected.discount))}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between pt-1">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold">{formatCurrency(selected.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
