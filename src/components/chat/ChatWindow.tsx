"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { useChat, type ChatMessageData } from "@/hooks/useChat";

export interface QuickReply {
  label: string;
  message: string;
}

interface Props {
  orderId: string;
  tenantId: string;
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

export function ChatWindow({ orderId, tenantId, currentRole, quickReplies }: Props) {
  const { messages, loading, sending, sendMessage } = useChat(orderId, tenantId);
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
    <div className="flex flex-col h-full" style={{ background: "#ece5dd" }}>

      {/* Área de mensagens — cresce e rola */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 py-3 space-y-1">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-neutral-400" />
          </div>
        ) : messages.length === 0 && !showQuickReplies ? (
          <div className="flex items-center justify-center h-full py-12">
            <p className="text-sm text-neutral-400 text-center">
              Nenhuma mensagem ainda.
            </p>
          </div>
        ) : (
          grouped.map(({ dayLabel, msgs }) => (
            <div key={dayLabel}>
              <div className="flex items-center justify-center my-3">
                <span className="text-[11px] font-medium text-neutral-500 bg-white/75 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
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
        <div className="shrink-0 max-h-[45dvh] overflow-y-auto bg-white/90 border-t border-neutral-200 px-3 sm:px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-2">
            Selecione sua situação
          </p>
          <div className="flex flex-col gap-1.5">
            {quickReplies!.map((qr) => {
              const [emoji, ...rest] = qr.label.split(" ");
              const isActivating = activatingId === qr.message;
              return (
                <button
                  key={qr.message}
                  onClick={() => handleQuickReply(qr)}
                  disabled={sending}
                  className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl bg-white border border-neutral-200 hover:border-brand/40 hover:bg-brand/5 active:scale-[0.98] transition-all text-sm text-neutral-800 disabled:opacity-60 shadow-sm"
                >
                  {isActivating ? (
                    <Loader2 size={16} className="animate-spin text-brand shrink-0" />
                  ) : (
                    <span className="text-lg leading-none shrink-0">{emoji}</span>
                  )}
                  <span className="font-medium leading-snug">{rest.join(" ")}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input — safe-area-inset-bottom para iOS com home bar */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 flex items-end gap-2 bg-white border-t border-neutral-200 px-3 sm:px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
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
          className="flex-1 resize-none rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition bg-neutral-50 leading-relaxed"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-brand text-white disabled:opacity-40 transition hover:opacity-90 active:scale-95 shrink-0 mb-0.5"
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
            <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center text-[10px] text-white font-bold">
              R
            </div>
          )}
        </div>
      )}

      <div className={`max-w-[82%] sm:max-w-[70%] flex flex-col ${isMine ? "items-end" : "items-start"} gap-0.5`}>
        {!isMine && isLast && (
          <span className="text-[11px] font-semibold text-brand px-1">
            {msg.senderRole === "ADMIN" ? "Restaurante" : (msg.senderName ?? "Cliente")}
          </span>
        )}

        <div
          className={`px-3.5 py-2 text-sm leading-relaxed shadow-sm transition-opacity ${
            isMine
              ? msg.failed
                ? "bg-red-100 text-red-700 rounded-[18px] rounded-br-[4px]"
                : "bg-brand text-white rounded-[18px] rounded-br-[4px]"
              : "bg-white text-neutral-800 rounded-[18px] rounded-bl-[4px]"
          } ${msg.pending ? "opacity-60" : "opacity-100"}`}
        >
          {msg.content}
        </div>

        {/* Status de envio */}
        {isMine && isLast && (
          <div className="flex items-center gap-1 px-1">
            {msg.pending ? (
              <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                <Loader2 size={9} className="animate-spin" />
                Enviando...
              </span>
            ) : msg.failed ? (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-600 transition"
              >
                <AlertCircle size={10} />
                Falha · toque para reenviar
                <RotateCcw size={9} />
              </button>
            ) : (
              <span className="text-[10px] text-neutral-500">
                {formatTime(msg.createdAt)}
              </span>
            )}
          </div>
        )}

        {/* Horário nas mensagens não-minhas ou quando não é a última */}
        {!isMine && isLast && (
          <span className="text-[10px] text-neutral-500 px-1">
            {formatTime(msg.createdAt)}
          </span>
        )}
      </div>
    </div>
  );
}
