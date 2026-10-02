"use client";

import { useState } from "react";
import { MessageSquare, ArrowLeft } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { prefetchChat } from "@/hooks/useChat";
import { OrderStatusBadge } from "@/components/chat/OrderStatusBadge";
import { Store } from "lucide-react";
import { OrderStatus } from "@/types";

interface OrderWithLastMessage {
  id: string;
  status: string;
  updatedAt: Date;
  user: { name: string | null; email: string | null } | null;
  chatMessages: {
    id: string;
    senderRole: string;
    content: string;
    createdAt: Date;
  }[];
}

interface Props {
  orders: OrderWithLastMessage[];
  adminName: string;
}

export function AdminChatsClient({ orders, adminName }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    orders[0]?.id ?? null
  );

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100dvh-theme(spacing.32))] lg:h-[calc(100dvh-theme(spacing.16))] gap-4">

      {/* Sidebar — esconde no mobile quando um chat está aberto */}
      <aside
        className={`flex flex-col w-full sm:w-72 shrink-0 ${
          selectedId ? "hidden sm:flex" : "flex"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={18} className="text-brand" />
          <h1 className="text-lg font-bold text-neutral-900">Chats</h1>
          {orders.length > 0 && (
            <span className="ml-auto text-xs bg-brand text-white rounded-full px-2 py-0.5 font-medium">
              {orders.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {orders.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-10">
              Nenhum chat ainda.
            </p>
          ) : (
            orders.map((order) => {
              const lastMsg = order.chatMessages[0];
              const isSelected = order.id === selectedId;
              return (
                <button
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  onMouseEnter={() => prefetchChat(order.id)}
                  className={`w-full text-left rounded-xl px-4 py-3 transition border ${
                    isSelected
                      ? "bg-brand/5 border-brand/30"
                      : "bg-white border-neutral-200 hover:border-brand/20 hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-mono text-xs font-bold text-neutral-500">
                      #{order.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-[10px] text-neutral-400 shrink-0">
                      {lastMsg ? formatDate(lastMsg.createdAt) : ""}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 truncate">
                    {order.user?.name ?? "Cliente sem conta"}
                  </p>
                  {lastMsg && (
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {lastMsg.senderRole === "ADMIN" ? "Você: " : ""}
                      {lastMsg.content}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Painel do chat */}
      <div
        className={`flex-1 min-w-0 bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col ${
          selectedId ? "flex" : "hidden sm:flex"
        }`}
      >
        {selectedOrder ? (
          <>
            {/* Header do chat */}
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-neutral-200 shrink-0 bg-white">
              {/* Botão voltar — só no mobile */}
              <button
                onClick={() => setSelectedId(null)}
                className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition shrink-0"
              >
                <ArrowLeft size={18} className="text-neutral-600" />
              </button>

              <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                <Store size={15} className="text-neutral-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-neutral-900 text-sm truncate">
                  {selectedOrder.user?.name ?? "Cliente sem conta"}
                </p>
                <p className="text-xs text-neutral-400">
                  Pedido #{selectedOrder.id.slice(-6).toUpperCase()}
                </p>
              </div>

              <OrderStatusBadge
                orderId={selectedOrder.id}
                initialStatus={selectedOrder.status as OrderStatus}
              />
            </div>

            {/* Chat */}
            <div className="flex-1 min-h-0">
              <ChatWindow
                key={selectedOrder.id}
                orderId={selectedOrder.id}
                currentRole="ADMIN"
                currentName={adminName}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8">
            <MessageSquare size={40} className="text-neutral-200" />
            <p className="text-neutral-500 font-medium">Selecione um chat</p>
            <p className="text-sm text-neutral-400">
              Escolha um pedido na lista ao lado para ver as mensagens.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
