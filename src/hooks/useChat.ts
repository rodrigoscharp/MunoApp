"use client";

import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { useEffect, useRef, useState } from "react";
import { useCanalRealtime } from "@/hooks/useTopicoRealtime";

export interface ChatMessageData {
  id: string;
  orderId: string;
  senderRole: string;
  senderId: string | null;
  senderName: string | null;
  content: string;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
}

// Rede de segurança, não a fonte principal. Até a migração para Broadcast a
// assinatura de postgres_changes nunca disparava (RLS em ChatMessage bloqueia a
// role anon), então o chat inteiro vivia deste intervalo — a 4s ele sozinho
// gerava 15 requisições por minuto por conversa aberta. Com o canal de pé o
// aviso chega na hora, e o polling só cobre mensagem perdida.
export function intervaloDoChat(conectado: boolean): number {
  return conectado ? 60_000 : 15_000;
}

/**
 * O cursor do `?since=`: a mensagem confirmada mais recente, 1ms antes. O
 * servidor filtra `createdAt > since`, e duas mensagens no mesmo milissegundo
 * fariam a segunda nunca chegar; o milissegundo de folga a traz de volta, e a
 * deduplicação por id descarta a repetida.
 */
export function cursorDoChat(mensagens: ChatMessageData[]): string | null {
  let maior = -Infinity;
  for (const m of mensagens) {
    if (m.pending || m.failed) continue;
    const t = new Date(m.createdAt).getTime();
    if (t > maior) maior = t;
  }
  return Number.isFinite(maior) ? new Date(maior - 1).toISOString() : null;
}

/** Junta as novas às confirmadas, sem repetir id, em ordem cronológica. */
export function juntarMensagens(
  confirmadas: ChatMessageData[],
  novas: ChatMessageData[]
): ChatMessageData[] {
  const porId = new Map(confirmadas.map((m) => [m.id, m]));
  for (const m of novas) porId.set(m.id, m);
  return [...porId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// Cache em memória por orderId
const messageCache = new Map<string, ChatMessageData[]>();

/** Só para teste: o cache vive no módulo e atravessaria de um caso a outro. */
export function _esquecerChats(): void {
  messageCache.clear();
}

export async function prefetchChat(orderId: string): Promise<void> {
  if (messageCache.has(orderId)) return;
  try {
    const res = await fetch(`/api/orders/${orderId}/chat`);
    if (!res.ok) return;
    const data: ChatMessageData[] = await res.json();
    messageCache.set(orderId, data);
  } catch {
    // silencia
  }
}

export function useChat(orderId: string) {
  const cached = messageCache.get(orderId);
  const [messages, setMessages] = useState<ChatMessageData[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [sending, setSending] = useState(false);
  const seenIds = useRef<Set<string>>(new Set(cached?.map((m) => m.id)));

  // Faz fetch e integra com estado atual (preserva mensagens pending). Com
  // mensagens já em mãos, pede só as novas: antes cada volta do polling
  // baixava as 200 últimas de novo.
  async function fetchMessages(silent = false) {
    try {
      const confirmadas = messageCache.get(orderId) ?? [];
      const cursor = cursorDoChat(confirmadas);
      const url = cursor
        ? `/api/orders/${orderId}/chat?since=${encodeURIComponent(cursor)}`
        : `/api/orders/${orderId}/chat`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data: ChatMessageData[] = await res.json();

      data.forEach((m) => seenIds.current.add(m.id));
      const todas = cursor ? juntarMensagens(confirmadas, data) : data;
      messageCache.set(orderId, todas);

      setMessages((prev) => {
        const pending = prev.filter((m) => m.pending || m.failed);
        return [...todas, ...pending];
      });
    } catch {
      // silencia erros de polling
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Fetch inicial
  useEffect(() => {
    if (cached) setLoading(false);
    fetchMessages(!!cached);
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast no canal do pedido — esta é a fonte principal de novas
  // mensagens. O evento é só um aviso (id, sem conteúdo); o texto vem do GET
  // protegido.
  const conexao = useCanalRealtime("order", orderId, {
    "chat-message": (payload) => {
      const messageId = payload.messageId as string;
      // A própria mensagem enviada volta pela resposta do POST; ignorar aqui
      // evita um fetch redundante por mensagem que o remetente já tem.
      if (!messageId || seenIds.current.has(messageId)) return;
      fetchMessages(true);
    },
  });
  const conectado = conexao === "conectado";

  // Polling de reserva, esparso com o canal de pé e apertado sem ele.
  useEffect(() => {
    return iniciarPollingVisivel(() => fetchMessages(true), intervaloDoChat(conectado));
  }, [orderId, conectado]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * `substituirId` é a mensagem que esta substitui — o caso do reenvio depois de
   * uma falha. Sem ele, a bolha vermelha continuava na lista ao lado da nova: o
   * cliente via o mesmo texto duas vezes, e a vermelha sobrevivia a todo
   * polling, porque o merge de `fetchMessages` preserva `failed` para sempre.
   */
  async function sendMessage(content: string, substituirId?: string): Promise<boolean> {
    if (!content.trim()) return false;

    // Mensagem otimista — aparece imediatamente
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessageData = {
      id: tempId,
      orderId,
      senderRole: "CUSTOMER",
      senderId: null,
      senderName: null,
      content,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    seenIds.current.add(tempId);
    if (substituirId) seenIds.current.delete(substituirId);
    setMessages((prev) => [...prev.filter((m) => m.id !== substituirId), optimistic]);
    setSending(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error();

      const confirmed: ChatMessageData = await res.json();

      seenIds.current.delete(tempId);
      seenIds.current.add(confirmed.id);

      setMessages((prev) => {
        const updated = prev.map((m) => m.id === tempId ? confirmed : m);
        messageCache.set(orderId, updated.filter((m) => !m.pending && !m.failed));
        return updated;
      });

      return true;
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, pending: false, failed: true } : m)
      );
      return false;
    } finally {
      setSending(false);
    }
  }

  return { messages, loading, sending, sendMessage };
}
