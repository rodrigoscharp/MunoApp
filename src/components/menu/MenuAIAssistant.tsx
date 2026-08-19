"use client";

import Image from "next/image";
import { useRef, useState, useEffect } from "react";
import { Sparkles, X, Send, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/hooks/useCart";
import { triggerCartFly } from "@/components/menu/CartFlyAnimation";
import { formatCurrency } from "@/lib/utils";
import { MenuItemWithCategory } from "@/types";

const QUICK_OPTIONS = [
  { label: "Pouca fome", emoji: "😐" },
  { label: "Com fome", emoji: "😋" },
  { label: "Faminto", emoji: "🤤" },
  { label: "Esfomeado", emoji: "🔥" },
  { label: "Sou vegano", emoji: "🌱" },
  { label: "Sem glúten", emoji: "🌾" },
  { label: "Sem lactose", emoji: "🥛" },
  { label: "Algo leve", emoji: "🥗" },
] as const;

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ids?: string[];
}

interface MenuAIAssistantProps {
  menuItems: MenuItemWithCategory[];
  restaurantOpen: boolean;
}

function ItemCard({ item, restaurantOpen }: { item: MenuItemWithCategory; restaurantOpen: boolean }) {
  const addItem = useCart((s) => s.addItem);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleAdd() {
    addItem({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl }, 1);
    if (btnRef.current) triggerCartFly(btnRef.current);
  }

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border border-neutral-200 p-2.5 mt-2">
      <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-neutral-100">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} fill sizes="48px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-neutral-900 leading-tight truncate">{item.name}</p>
        <p className="text-xs text-neutral-400">{item.category.name}</p>
        <p className="text-xs font-bold text-brand">{formatCurrency(item.price)}</p>
      </div>
      <button
        ref={btnRef}
        onClick={handleAdd}
        disabled={!restaurantOpen}
        title={!restaurantOpen ? "Restaurante fechado" : undefined}
        className="shrink-0 px-2.5 py-1 rounded-full bg-brand hover:bg-brand-dark active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all duration-150 shadow-sm"
      >
        + Adicionar
      </button>
    </div>
  );
}

export function MenuAIAssistant({ menuItems, restaurantOpen }: MenuAIAssistantProps) {
  const [dismissed, setDismissed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (localStorage.getItem("muno-ai-dismissed") === "1") setDismissed(true);
  }, []);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", text: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    setInput("");

    // Build history from previous messages for the API
    const history = messages.map((m) => ({
      role: m.role,
      content: m.role === "assistant"
        ? JSON.stringify({ message: m.text, ids: m.ids ?? [] })
        : m.text,
    }));

    try {
      const res = await fetch("/api/ai/menu-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Erro ao consultar o assistente");
        setMessages(nextMessages.slice(0, -1));
        return;
      }

      setMessages([
        ...nextMessages,
        { role: "assistant", text: data.text ?? "", ids: data.ids ?? [] },
      ]);
    } catch (err) {
      console.error(err);
      toast.error("Não consegui me conectar agora. Tente de novo!");
      setMessages(nextMessages.slice(0, -1));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("muno-ai-dismissed", "1");
  }

  function handleReopen() {
    setDismissed(false);
    localStorage.removeItem("muno-ai-dismissed");
  }

  if (dismissed) {
    return (
      <div className="flex justify-center pb-2">
        <button
          onClick={handleReopen}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-brand transition-colors"
        >
          <Sparkles size={13} />
          Assistente IA
          <ChevronDown size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm mb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100 bg-neutral-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shrink-0">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900 leading-none">Muno, o assistente</p>
            <p className="text-xs text-neutral-400 mt-0.5">Me conta o que você precisa 👀</p>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-neutral-400 hover:text-neutral-600 transition-colors p-1">
          <X size={16} />
        </button>
      </div>

      {/* Estado inicial — compacto, sem área de chat */}
      {messages.length === 0 && !loading ? (
        <div className="px-4 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_OPTIONS.map(({ label, emoji }) => (
              <button
                key={label}
                onClick={() => sendMessage(`${label} ${emoji}`)}
                className="px-3 py-1.5 rounded-full border border-neutral-200 text-sm text-neutral-600 hover:border-brand hover:text-brand hover:bg-brand/5 font-medium transition-all duration-150 active:scale-95"
              >
                {emoji} {label}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ou descreva o que você quer..."
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-neutral-200 outline-none focus:border-brand transition-colors bg-neutral-50 placeholder:text-neutral-300"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-3 py-2 rounded-xl bg-brand hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all duration-150 shrink-0"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* Chat — só abre após primeira mensagem */}
          <div ref={chatRef} className="h-80 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={12} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand text-white rounded-tr-sm"
                      : "bg-neutral-100 text-neutral-800 rounded-tl-sm"
                  }`}>
                    {msg.text}
                  </div>
                  {msg.role === "assistant" && msg.ids && msg.ids.length > 0 && (
                    <div className="w-full space-y-1.5 mt-1">
                      {menuItems
                        .filter((item) => msg.ids!.includes(item.id))
                        .map((item) => (
                          <ItemCard key={item.id} item={item} restaurantOpen={restaurantOpen} />
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center shrink-0">
                  <Sparkles size={12} className="text-white" />
                </div>
                <div className="bg-neutral-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* Input do chat */}
          <div className="border-t border-neutral-100 px-3 py-2.5">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                placeholder="Digite sua mensagem..."
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-neutral-200 outline-none focus:border-brand transition-colors bg-neutral-50 placeholder:text-neutral-300 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="px-3 py-2 rounded-xl bg-brand hover:bg-brand-dark active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all duration-150 shrink-0"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
