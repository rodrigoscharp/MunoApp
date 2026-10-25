"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { cn, getCustomerDisplayName } from "@/lib/utils";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { prefetchChat } from "@/hooks/useChat";
import { OrderStatusBadge } from "@/components/chat/OrderStatusBadge";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { Selo } from "@/components/painel/Selo";
import { cartaoPainel } from "@/components/painel/estilos";
import { OrderStatus } from "@/types";

interface OrderWithLastMessage {
  id: string;
  status: string;
  deliveryType: string;
  customerName: string | null;
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
  /** Pedido para abrir de cara (o atalho do detalhe em /adm/orders). */
  pedidoInicial?: string;
}

const idCurto = (id: string) => id.slice(-6).toUpperCase();

function nomeDoCliente(order: OrderWithLastMessage) {
  return (
    getCustomerDisplayName({
      deliveryType: order.deliveryType,
      customerName: order.customerName,
      user: order.user?.name ? { name: order.user.name } : null,
    }) ?? "Cliente sem conta"
  );
}

// Fuso fixo: o servidor (UTC na Vercel) e o navegador renderizam a mesma hora.
const FUSO = "America/Sao_Paulo";
const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** Hoje mostra a hora; antes disso, o dia. A lista é lida de relance. */
function quando(data: Date) {
  const d = new Date(data);
  return DIA.format(d) === DIA.format(new Date()) ? HORA.format(d) : DIA.format(d);
}

export function AdminChatsClient({ orders, adminName, pedidoInicial }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    (pedidoInicial && orders.some((o) => o.id === pedidoInicial) ? pedidoInicial : orders[0]?.id) ??
      null
  );

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  // A lista era um retrato do carregamento: conversa nova ou última mensagem
  // mudada só apareciam recarregando a página. Polling, e não o canal: o aviso
  // de chat sai só nos canais do pedido e do cliente (ver
  // src/app/api/orders/[id]/chat/route.ts), não no canal do restaurante, e
  // assinar um canal por pedido da lista seria abrir até cem. A conversa aberta
  // continua ao vivo pelo useChat da ChatWindow.
  const router = useRouter();
  useEffect(() => iniciarPollingVisivel(() => router.refresh(), 30_000), [router]);

  // Não há marca de leitura no banco. "Aguardando resposta" é a pergunta que
  // importa no balcão — a última palavra é do cliente — e sai do que já existe.
  const aguardando = (o: OrderWithLastMessage) => o.chatMessages[0]?.senderRole === "CUSTOMER";
  const quantosAguardando = orders.filter(aguardando).length;

  const contexto =
    orders.length === 0
      ? undefined
      : `${orders.length} ${orders.length === 1 ? "conversa" : "conversas"}${
          quantosAguardando ? ` · ${quantosAguardando} aguardando resposta` : ""
        }`;

  return (
    <div className="flex h-[calc(100dvh-theme(spacing.32))] gap-4 lg:h-[calc(100dvh-theme(spacing.16))]">
      {/* Lista — esconde no celular quando uma conversa está aberta */}
      <aside
        aria-label="Conversas"
        className={cn(
          "w-full shrink-0 flex-col sm:w-80",
          selectedId ? "hidden sm:flex" : "flex"
        )}
      >
        <CabecalhoDaTela contexto={contexto} titulo="Chats" />

        <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1 pb-1">
          {orders.length === 0 ? (
            <div className={cn(cartaoPainel, "flex flex-col items-center gap-2 px-6 py-10 text-center")}>
              <MessageSquare size={28} className="text-loja-tinta-2" aria-hidden="true" />
              <p className="text-[14px] font-bold text-loja-tinta">Nenhuma conversa ainda.</p>
              <p className="text-[12.5px] text-loja-tinta-2">
                Quando um cliente escrever pelo acompanhamento do pedido, a conversa aparece aqui.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const lastMsg = order.chatMessages[0];
              const isSelected = order.id === selectedId;
              const esperando = aguardando(order);
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedId(order.id)}
                  onMouseEnter={() => prefetchChat(order.id)}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-[18px] border-2 bg-loja-papel px-4 py-3 text-left shadow-loja transition hover:bg-white",
                    isSelected ? "border-brand" : "border-transparent"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13.5px] font-extrabold text-loja-tinta">
                      {nomeDoCliente(order)}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-loja-tinta-2">
                      {lastMsg ? quando(lastMsg.createdAt) : ""}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="manchete text-[17px] leading-none text-forest-dark">
                      #{idCurto(order.id)}
                    </span>
                    {esperando && <Selo tom="novo">Aguardando resposta</Selo>}
                  </span>
                  {lastMsg && (
                    <span
                      className={cn(
                        "truncate text-[12.5px]",
                        esperando ? "font-semibold text-loja-tinta" : "text-loja-tinta-2"
                      )}
                    >
                      {lastMsg.senderRole === "ADMIN" ? "Você: " : ""}
                      {lastMsg.content}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Painel da conversa */}
      <section
        aria-label={selectedOrder ? `Conversa do pedido #${idCurto(selectedOrder.id)}` : "Conversa"}
        className={cn(
          cartaoPainel,
          "min-w-0 flex-1 flex-col overflow-hidden",
          selectedId ? "flex" : "hidden sm:flex"
        )}
      >
        {selectedOrder ? (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-loja-linha px-3 py-3 sm:px-5">
              {/* Voltar — só no celular */}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Voltar para a lista de conversas"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta transition hover:bg-loja-creme sm:hidden"
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>

              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-dark font-extrabold text-white"
              >
                {nomeDoCliente(selectedOrder).charAt(0).toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-[14px] font-extrabold text-loja-tinta">
                  {nomeDoCliente(selectedOrder)}
                </p>
                <p className="text-[12px] font-semibold text-loja-preco">
                  Pedido #{idCurto(selectedOrder.id)}
                </p>
              </div>

              <OrderStatusBadge
                orderId={selectedOrder.id}
                initialStatus={selectedOrder.status as OrderStatus}
              />
            </div>

            <div className="min-h-0 flex-1">
              <ChatWindow
                key={selectedOrder.id}
                orderId={selectedOrder.id}
                currentRole="ADMIN"
                currentName={adminName}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <MessageSquare size={36} className="text-loja-linha" aria-hidden="true" />
            <p className="manchete text-[26px] text-forest-dark">Selecione uma conversa</p>
            <p className="text-[13px] text-loja-tinta-2">
              Escolha um pedido na lista para ver e responder as mensagens.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
