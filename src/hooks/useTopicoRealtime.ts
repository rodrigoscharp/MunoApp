"use client";

import { useEffect, useState } from "react";

/**
 * Nome secreto do canal de tempo real (ver src/lib/realtime-topic.ts), obtido
 * do servidor depois de ele conferir que esta pessoa pode ouvi-lo.
 *
 * Devolve null enquanto busca e quando o servidor recusa ou está fora do ar. O
 * consumidor simplesmente não assina nesse caso: todo canal tem polling de
 * reserva, então a tela continua funcionando, só sem o aviso instantâneo.
 */
export function useTopicoRealtime(
  canal: "kitchen" | "order" | "user",
  id?: string | null,
  habilitado = true
): string | null {
  // O tópico guardado leva a chave (canal+id) a que pertence: ao trocar de
  // pedido, o tópico do anterior deixa de valer na hora, sem precisar zerar o
  // estado dentro do effect.
  const [guardado, setGuardado] = useState<{ chave: string; topic: string } | null>(null);
  const semId = (canal === "order" && !id) || !habilitado;
  const chave = `${canal}:${id ?? ""}`;

  useEffect(() => {
    if (semId) return;
    let ativo = true;

    const params = new URLSearchParams({ canal });
    if (id) params.set("id", id);

    fetch(`/api/realtime/topic?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (ativo && data?.topic) setGuardado({ chave, topic: data.topic as string });
      })
      .catch(() => {});

    return () => {
      ativo = false;
    };
  }, [canal, id, semId, chave]);

  return !semId && guardado?.chave === chave ? guardado.topic : null;
}
