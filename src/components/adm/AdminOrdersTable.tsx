"use client";

import { useState } from "react";
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

export function AdminOrdersTable({ orders }: { orders: Order[] }) {
  const [selected, setSelected] = useState<Order | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");

  const filtered = filter === "ALL" ? orders : orders.filter((o) => o.status === filter);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(["ALL", "PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED"] as const).map(
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

              <div className="border-t border-neutral-100 pt-3 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="text-lg font-bold">{formatCurrency(selected.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
