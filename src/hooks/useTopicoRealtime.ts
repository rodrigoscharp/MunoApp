"use client";

import { useEffect, useRef, useState } from "react";
import { entrarNoCanal, esperaDaTentativa, reabrirCanal } from "@/lib/canal-compartilhado";

type Canal = "kitchen" | "order" | "user";

export { esperaDaTentativa };

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

  // O canal é dividido com os outros ouvintes do mesmo tópico (ver
  // src/lib/canal-compartilhado.ts): sair daqui não derruba o chat ou o mapa
  // que continuam abertos na mesma tela.
  useEffect(() => {
    if (!topic) return;
    return entrarNoCanal(topic, eventos.split(",").filter(Boolean), {
      tratadores: () => ref.current,
      aoMudarStatus: (status) =>
        setEstadoCanal({
          topic,
          estado:
            status === "conectado"
              ? "conectado"
              : status === "caiu"
                ? "sem-tempo-real"
                : "conectando",
        }),
    });
  }, [topic, eventos]);

  // Rede que volta: não espera o timer da próxima tentativa.
  useEffect(() => {
    if (!topic || typeof window === "undefined") return;
    const aoVoltar = () => reabrirCanal(topic, true);
    window.addEventListener("online", aoVoltar);
    return () => window.removeEventListener("online", aoVoltar);
  }, [topic]);

  if (semId) return "sem-tempo-real";
  if (falhou) return "sem-tempo-real";
  if (!topic) return "conectando";
  if (estadoCanal?.topic !== topic) return "conectando";
  return estadoCanal.estado;
}
