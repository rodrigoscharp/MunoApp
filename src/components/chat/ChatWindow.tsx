"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, AlertCircle, RotateCcw, MessageCircle } from "lucide-react";
import { useChat, type ChatMessageData } from "@/hooks/useChat";

export interface QuickReply {
  label: string;
  message: string;
}

interface Props {
  orderId: string;
  currentRole: "CUSTOMER" | "ADMIN";
  currentName: string;
  quickReplies?: QuickReply[];
}

function formatTime(date: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDayLabel(date: Date | string) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(d);
}

export function ChatWindow({ orderId, currentRole, quickReplies }: Props) {
  const { messages, loading, sending, sendMessage } = useChat(orderId);
  const [text, setText] = useState("");
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasCustomerMessage = messages.some((m) => m.senderRole === "CUSTOMER");
  const showQuickReplies =
    currentRole === "CUSTOMER" &&
    !!quickReplies?.length &&
    !hasCustomerMessage &&
    !loading;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const ok = await sendMessage(text.trim());
    if (ok) {
      setText("");
      // Reset textarea height
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      textareaRef.current?.focus();
    }
  }

  async function handleQuickReply(qr: QuickReply) {
    if (sending) return;
    setActivatingId(qr.message);
    await sendMessage(qr.message);
    setActivatingId(null);
  }

  async function handleRetry(id: string, content: string) {
    // A mensagem que falhou dá lugar à nova, em vez de as duas coexistirem.
    await sendMessage(content, id);
  }

  // Agrupa mensagens por dia
  const grouped: { dayLabel: string; msgs: ChatMessageData[] }[] = [];
  for (const msg of messages) {
    const label = formatDayLabel(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.dayLabel === label) {
      last.msgs.push(msg);
    } else {
      grouped.push({ dayLabel: label, msgs: [msg] });
    }
  }

  return (
    <div className="flex h-full flex-col bg-loja-creme text-loja-tinta">

      {/* Área de mensagens — cresce e rola */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 py-3 space-y-1">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-loja-tinta-2" />
          </div>
        ) : messages.length === 0 && !showQuickReplies ? (
          <div className="flex items-center justify-center h-full py-12">
            <p className="text-center text-sm text-loja-tinta-2">
              Nenhuma mensagem ainda.
            </p>
          </div>
        ) : (
          grouped.map(({ dayLabel, msgs }) => (
            <div key={dayLabel}>
              <div className="flex items-center justify-center my-3">
                <span className="rounded-full bg-loja-papel px-3 py-1 text-[11px] font-bold text-loja-tinta-2 shadow-loja">
                  {dayLabel}
                </span>
              </div>
              <div className="space-y-[2px]">
                {msgs.map((msg, i) => {
                  const isMine = msg.senderRole === currentRole || !!msg.pending || !!msg.failed;
                  const next = msgs[i + 1];
                  const isLast = !next || next.senderRole !== msg.senderRole;
                  return (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isMine={isMine}
                      isLast={isLast}
                      onRetry={msg.failed ? () => handleRetry(msg.id, msg.content) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies — altura máxima com scroll para telas pequenas */}
      {showQuickReplies && (
        <div className="max-h-[45dvh] shrink-0 overflow-y-auto border-t border-loja-linha bg-loja-papel px-3 py-3 sm:px-5">
          <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-loja-tinta-2">
            Selecione sua situação
          </p>
          <div className="flex flex-col gap-1.5">
            {quickReplies!.map((qr) => {
              const isActivating = activatingId === qr.message;
              return (
                <button
                  key={qr.message}
                  onClick={() => handleQuickReply(qr)}
                  disabled={sending}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-loja-linha bg-loja-papel px-4 py-3 text-left text-sm text-loja-tinta transition-all hover:border-brand hover:bg-loja-pessego-claro active:scale-[0.98] disabled:opacity-60"
                >
                  {isActivating ? (
                    <Loader2 size={16} aria-hidden="true" className="shrink-0 animate-spin text-loja-preco" />
                  ) : (
                    <MessageCircle size={16} aria-hidden="true" className="shrink-0 text-forest" />
                  )}
                  <span className="font-semibold leading-snug">{qr.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input — safe-area-inset-bottom para iOS com home bar */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-loja-linha bg-loja-papel px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:px-4"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder={showQuickReplies ? "Ou escreva aqui..." : "Mensagem..."}
          rows={1}
          className="min-h-11 flex-1 resize-none rounded-[22px] border border-loja-linha bg-loja-creme/60 px-4 py-2.5 text-[15px] leading-relaxed text-loja-tinta outline-none transition placeholder:text-loja-tinta-2/80 focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-loja-brasa text-white transition hover:bg-loja-brasa-escura active:scale-95 disabled:opacity-40"
        >
          {sending && !activatingId ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={15} strokeWidth={2.5} />
          )}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  msg,
  isMine,
  isLast,
  onRetry,
}: {
  msg: ChatMessageData;
  isMine: boolean;
  isLast: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className={`flex items-end gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
      {/* Avatar restaurante */}
      {!isMine && (
        <div className="w-6 shrink-0 mb-0.5">
          {isLast && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-dark text-[10px] font-bold text-white">
              R
            </div>
          )}
        </div>
      )}

      <div className={`max-w-[82%] sm:max-w-[70%] flex flex-col ${isMine ? "items-end" : "items-start"} gap-0.5`}>
        {!isMine && isLast && (
          <span className="px-1 text-[11px] font-bold text-loja-preco">
            {msg.senderRole === "ADMIN" ? "Restaurante" : (msg.senderName ?? "Cliente")}
          </span>
        )}

        <div
          className={`px-3.5 py-2 text-sm leading-relaxed shadow-loja transition-opacity ${
            isMine
              ? msg.failed
                ? "bg-loja-pessego-claro text-loja-preco rounded-[18px] rounded-br-[4px]"
                : "bg-loja-brasa text-white rounded-[18px] rounded-br-[4px]"
              : "bg-loja-papel text-loja-tinta rounded-[18px] rounded-bl-[4px]"
          } ${msg.pending ? "opacity-60" : "opacity-100"}`}
        >
          {msg.content}
        </div>

        {/* Status de envio */}
        {isMine && isLast && (
          <div className="flex items-center gap-1 px-1">
            {msg.pending ? (
              <span className="flex items-center gap-1 text-[10px] text-loja-tinta-2">
                <Loader2 size={9} className="animate-spin" />
                Enviando...
              </span>
            ) : msg.failed ? (
              <button
                onClick={onRetry}
                className="flex min-h-11 items-center gap-1 text-[11px] font-bold text-loja-preco transition hover:text-forest-dark"
              >
                <AlertCircle size={10} />
                Falha · toque para reenviar
                <RotateCcw size={9} />
              </button>
            ) : (
              <span className="text-[10px] text-loja-tinta-2">
                {formatTime(msg.createdAt)}
              </span>
            )}
          </div>
        )}

        {/* Horário nas mensagens não-minhas ou quando não é a última */}
        {!isMine && isLast && (
          <span className="px-1 text-[10px] text-loja-tinta-2">
            {formatTime(msg.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}
