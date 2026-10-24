"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INTERVALO_DO_BIPE_MS,
  INTERVALO_DO_TITULO_MS,
  pendentesSemCiencia,
  tituloDoAlerta,
  tocarBipe,
} from "@/lib/alerta-cozinha";

const CHAVE_DO_SOM = "muno:cozinha:som";

function lerPreferencia(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CHAVE_DO_SOM) === "1";
  } catch {
    return false;
  }
}

function gravarPreferencia(ativo: boolean) {
  try {
    window.localStorage.setItem(CHAVE_DO_SOM, ativo ? "1" : "0");
  } catch {
    // Aba anônima ou armazenamento bloqueado: o som vale só para esta visita.
  }
}

function criarContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * Alarme de pedido novo: bipe repetido, título piscando e tela acesa.
 *
 * Antes o pedido novo só aparecia no quadro, em silêncio. Numa cozinha com
 * fogão ligado ninguém olha para o tablet, e o pedido esperava até alguém
 * passar por ele.
 *
 * O navegador só libera áudio depois de um gesto da pessoa, por isso o som tem
 * um botão ("Ativar som"), e a escolha fica guardada. Com a escolha guardada
 * e a página recarregada, o áudio ainda precisa de um toque qualquer na tela
 * para destravar: `bloqueado` diz isso à interface.
 */
export function useAlertaCozinha(pedidos: { id: string; status: string }[]) {
  const [somAtivo, setSomAtivo] = useState(lerPreferencia);
  const [bloqueado, setBloqueado] = useState(true);
  const [vistos, setVistos] = useState<ReadonlySet<string>>(() => new Set());
  const ctxRef = useRef<AudioContext | null>(null);

  const alertando = useMemo(() => pendentesSemCiencia(pedidos, vistos), [pedidos, vistos]);

  const destravar = useCallback(async () => {
    if (!ctxRef.current) ctxRef.current = criarContexto();
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      if (ctx.state !== "running") await ctx.resume();
    } catch {
      // Sem gesto válido ainda: continua bloqueado até o próximo toque.
    }
    setBloqueado(ctx.state !== "running");
  }, []);

  const alternarSom = useCallback(() => {
    const novo = !somAtivo;
    setSomAtivo(novo);
    gravarPreferencia(novo);
    // Chamado dentro do clique: é o gesto que o navegador exige.
    if (novo) {
      destravar();
      if (ctxRef.current) tocarBipe(ctxRef.current);
    }
  }, [somAtivo, destravar]);

  // Preferência guardada de outra visita: o primeiro toque em qualquer lugar
  // destrava o áudio, sem obrigar a pessoa a achar o botão de novo.
  useEffect(() => {
    if (!somAtivo) return;
    const aoTocar = () => {
      destravar();
    };
    window.addEventListener("pointerdown", aoTocar, { once: true });
    window.addEventListener("keydown", aoTocar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", aoTocar);
      window.removeEventListener("keydown", aoTocar);
    };
  }, [somAtivo, destravar]);

  const haAlerta = alertando.length > 0;

  // Bipe repetido até alguém dar ciência. Repetir é o ponto: um bipe único
  // some no barulho da cozinha.
  useEffect(() => {
    if (!somAtivo || !haAlerta) return;
    const tocar = () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state === "running") tocarBipe(ctx);
    };
    tocar();
    const timer = setInterval(tocar, INTERVALO_DO_BIPE_MS);
    return () => clearInterval(timer);
  }, [somAtivo, haAlerta]);

  // Título piscando: alcança quem está com outra aba na frente, inclusive com
  // o som desligado.
  const quantos = alertando.length;
  useEffect(() => {
    if (quantos === 0) return;
    const base = document.title;
    let aceso = true;
    document.title = tituloDoAlerta(base, quantos, aceso);
    const timer = setInterval(() => {
      aceso = !aceso;
      document.title = tituloDoAlerta(base, quantos, aceso);
    }, INTERVALO_DO_TITULO_MS);
    return () => {
      clearInterval(timer);
      document.title = base;
    };
  }, [quantos]);

  // Tela acesa enquanto o quadro estiver aberto. O navegador solta a trava
  // quando a aba some, então ela é pedida de novo na volta.
  useEffect(() => {
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request(tipo: "screen"): Promise<{ release(): Promise<void> }> };
    }).wakeLock;
    if (!wakeLock) return;

    let ativo = true;
    let trava: { release(): Promise<void> } | null = null;
    const pedir = () => {
      if (document.hidden) return;
      wakeLock
        .request("screen")
        .then((t) => {
          if (ativo) trava = t;
          else t.release().catch(() => {});
        })
        .catch(() => {
          // Bateria fraca ou permissão negada: o quadro segue sem a trava.
        });
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      ativo = false;
      document.removeEventListener("visibilitychange", pedir);
      trava?.release().catch(() => {});
    };
  }, []);

  const alertandoRef = useRef(alertando);
  useEffect(() => {
    alertandoRef.current = alertando;
  }, [alertando]);

  // Sem ids: tudo o que está tocando agora (o botão "Ciente"). Com ids: o
  // pedido em cujo card alguém tocou.
  const ciente = useCallback((ids?: string[]) => {
    setVistos((v) => {
      const n = new Set(v);
      for (const id of ids ?? alertandoRef.current) n.add(id);
      return n;
    });
  }, []);

  return { alertando, somAtivo, bloqueado: somAtivo && bloqueado, alternarSom, ciente };
}
