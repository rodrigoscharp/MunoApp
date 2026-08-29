"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { orderChannel, tenantChannelName } from "@/lib/realtime-channel";

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
// gerava 15 requisições por minuto por conversa aberta.
const POLL_INTERVAL = 15_000;

// Cache em memória por orderId
const messageCache = new Map<string, ChatMessageData[]>();

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

export function useChat(orderId: string, tenantId: string) {
  const cached = messageCache.get(orderId);
  const [messages, setMessages] = useState<ChatMessageData[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [sending, setSending] = useState(false);
  const seenIds = useRef<Set<string>>(new Set(cached?.map((m) => m.id)));

  // Faz fetch e integra com estado atual (preserva mensagens pending)
  async function fetchMessages(silent = false) {
    try {
      const res = await fetch(`/api/orders/${orderId}/chat`);
      if (!res.ok) return;
      const data: ChatMessageData[] = await res.json();

      data.forEach((m) => seenIds.current.add(m.id));
      messageCache.set(orderId, data);

      setMessages((prev) => {
        const pending = prev.filter((m) => m.pending || m.failed);
        return [...data, ...pending];
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

  // Polling — fonte principal de novas mensagens
  useEffect(() => {
    const timer = setInterval(() => fetchMessages(true), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast no canal do tenant — esta é a fonte principal de novas mensagens.
  // O evento é só um aviso (id, sem conteúdo); o texto vem do GET protegido.
  useEffect(() => {
    const channel = supabase
      .channel(tenantChannelName(tenantId, orderChannel(orderId)))
      .on("broadcast", { event: "chat-message" }, ({ payload }) => {
        const messageId = payload.messageId as string;
        // A própria mensagem enviada volta pela resposta do POST; ignorar aqui
        // evita um fetch redundante por mensagem que o remetente já tem.
        if (!messageId || seenIds.current.has(messageId)) return;
        fetchMessages(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

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
