"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Canal = "kitchen" | "order" | "user";

/**
 * Espera antes da tentativa `n` (0, 1, 2…): 2s, 4s, 8s… até 60s.
 *
 * Sem teto, uma cozinha que ficou uma hora sem rede passaria o resto do turno
 * esperando minutos entre tentativas; sem crescer, um servidor fora do ar
 * levaria uma chamada a cada 2s de cada tablet aberto.
 */
export function esperaDaTentativa(n: number): number {
  return Math.min(2_000 * 2 ** n, 60_000);
}

interface Guardado {
  chave: string;
  topic: string | null;
  // Recusa definitiva (401/403/404): o servidor disse que esta pessoa não pode
  // ouvir este canal. Repetir não muda a resposta, só gasta requisição.
  recusado: boolean;
}

/**
 * Busca o tópico e repete com espera crescente enquanto a falha for
 * passageira (rede, 5xx). O estado leva a chave a que pertence, como antes.
 */
function useTopicoComFalha(canal: Canal, id: string | null | undefined, habilitado: boolean) {
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const semId = (canal === "order" && !id) || !habilitado;
  const chave = `${canal}:${id ?? ""}`;

  useEffect(() => {
    if (semId) return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tentativa = 0;

    const params = new URLSearchParams({ canal });
    if (id) params.set("id", id);

    const buscar = () => {
      fetch(`/api/realtime/topic?${params}`)
        .then(async (r) => {
          if (!ativo) return;
          if (r.ok) {
            const data = await r.json().catch(() => null);
            if (!ativo) return;
            if (data?.topic) {
              setGuardado({ chave, topic: data.topic as string, recusado: false });
              return;
            }
          } else if (r.status >= 400 && r.status < 500) {
            setGuardado({ chave, topic: null, recusado: true });
            return;
          }
          agendar();
        })
        .catch(() => {
          if (ativo) agendar();
        });
    };

    // Antes a busca era uma só: uma falha de rede no carregamento deixava a
    // tela sem tempo real até alguém recarregar, vivendo só do polling.
    const agendar = () => {
      setGuardado({ chave, topic: null, recusado: false });
      timer = setTimeout(buscar, esperaDaTentativa(tentativa++));
    };

    buscar();

    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [canal, id, semId, chave]);

  const atual = !semId && guardado?.chave === chave ? guardado : null;
  return { topic: atual?.topic ?? null, falhou: !!atual && !atual.topic, semId };
}

/**
 * Nome secreto do canal de tempo real (ver src/lib/realtime-topic.ts), obtido
 * do servidor depois de ele conferir que esta pessoa pode ouvi-lo.
 *
 * Devolve null enquanto busca e quando o servidor recusa ou está fora do ar. O
 * consumidor simplesmente não assina nesse caso: todo canal tem polling de
 * reserva, então a tela continua funcionando, só sem o aviso instantâneo.
 * Falha passageira é repetida sozinha, com espera crescente.
 */
export function useTopicoRealtime(
  canal: Canal,
  id?: string | null,
  habilitado = true
): string | null {
  return useTopicoComFalha(canal, id, habilitado).topic;
}

/**
 * - `conectando`: buscando o tópico ou entrando no canal.
 * - `conectado`: o Supabase confirmou a assinatura; avisos chegam na hora.
 * - `sem-tempo-real`: o tópico não veio ou o canal caiu. A tela deve apertar o
 *   polling, porque é ele que está trazendo as novidades.
 */
export type EstadoRealtime = "conectando" | "conectado" | "sem-tempo-real";

type Tratadores = Record<string, (payload: Record<string, unknown>) => void>;

/**
 * Tópico + assinatura + estado da conexão, num lugar só.
 *
 * Os consumidores antigos assinavam sem callback de status, então não havia
 * como saber se o canal estava de pé. Era isso que impedia o polling de ser
 * esparso com o tempo real funcionando e apertado sem ele.
 *
 * Os tratadores ficam num ref: trocar a função a cada render não pode
 * derrubar e reabrir o canal.
 */
export function useCanalRealtime(
  canal: Canal,
  id: string | null | undefined,
  tratadores: Tratadores,
  habilitado = true
): EstadoRealtime {
  const { topic, falhou, semId } = useTopicoComFalha(canal, id, habilitado);
  const ref = useRef(tratadores);
  useEffect(() => {
    ref.current = tratadores;
  });

  const eventos = Object.keys(tratadores).sort().join(",");
  const [estadoCanal, setEstadoCanal] = useState<{ topic: string; estado: EstadoRealtime } | null>(
    null
  );
  const [reabrir, setReabrir] = useState(0);

  useEffect(() => {
    if (!topic) return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    let channel = supabase.channel(topic);
    for (const evento of eventos.split(",").filter(Boolean)) {
      channel = channel.on("broadcast", { event: evento }, ({ payload }) => {
        ref.current[evento]?.((payload ?? {}) as Record<string, unknown>);
      });
    }

    channel.subscribe((status: string) => {
      // O removeChannel do cleanup dispara CLOSED; isso é a gente saindo, não
      // o canal caindo.
      if (!ativo) return;
      if (status === "SUBSCRIBED") {
        tentativasCanal.set(topic, 0);
        clearTimeout(timer);
        setEstadoCanal({ topic, estado: "conectado" });
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setEstadoCanal({ topic, estado: "sem-tempo-real" });
        // A biblioteca tenta reentrar sozinha depois de erro, mas não depois de
        // CLOSED vindo do servidor. Reabrir do zero cobre os dois: se ela já
        // tiver voltado quando o timer vencer, o SUBSCRIBED cancela o timer.
        clearTimeout(timer);
        const n = tentativasCanal.get(topic) ?? 0;
        tentativasCanal.set(topic, n + 1);
        timer = setTimeout(() => {
          if (ativo) setReabrir((r) => r + 1);
        }, esperaDaTentativa(n));
      }
    });

    // O cliente do Supabase devolve o canal que já existe para o mesmo tópico
    // (a tela do pedido abre acompanhamento, chat e mapa no mesmo), e o
    // subscribe de um canal já de pé não chama o callback. Sem esta leitura o
    // estado ficaria em "conectando" para sempre nesse caso.
    if ((channel as unknown as { state?: string }).state === "joined") {
      queueMicrotask(() => {
        if (ativo) setEstadoCanal({ topic, estado: "conectado" });
      });
    }

    return () => {
      ativo = false;
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [topic, eventos, reabrir]);

  // Rede que volta: não espera o timer da próxima tentativa.
  useEffect(() => {
    if (!topic || typeof window === "undefined") return;
    const aoVoltar = () => {
      tentativasCanal.set(topic, 0);
      setReabrir((r) => r + 1);
    };
    window.addEventListener("online", aoVoltar);
    return () => window.removeEventListener("online", aoVoltar);
  }, [topic]);

  if (semId) return "sem-tempo-real";
  if (falhou) return "sem-tempo-real";
  if (!topic) return "conectando";
  if (estadoCanal?.topic !== topic) return "conectando";
  return estadoCanal.estado;
}

// Fora do estado do React de propósito: a contagem precisa sobreviver ao
// remount do effect que ela mesma provoca.
const tentativasCanal = new Map<string, number>();
