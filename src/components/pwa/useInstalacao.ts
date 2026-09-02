"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CHAVE_DISPENSA,
  dispensaAtiva,
  marcarDispensa,
} from "@/lib/pwa/dispensa";
import { ehIOS } from "@/lib/pwa/plataforma";

/**
 * O convite de instalação, e por que ele tem quatro estados e não dois.
 *
 * - `indisponivel`: não há o que oferecer. Navegador que não suporta, convite
 *   dispensado ainda no prazo, ou Android antes do Chrome dizer que o app é
 *   instalável. É também o estado do PRIMEIRO render, sempre.
 * - `instalada`: já está na tela inicial. Nada a mostrar.
 * - `android`: temos o evento do Chrome guardado e podemos abrir o diálogo
 *   nativo com um clique.
 * - `ios`: não existe API nenhuma. O único caminho é ensinar o passo manual.
 *
 * O primeiro render é sempre `indisponivel` de propósito: matchMedia,
 * navigator e localStorage não existem no servidor, e decidir durante o render
 * faria o HTML do servidor divergir do cliente na hidratação. Tudo é decidido
 * dentro do efeito.
 */

export type EstadoInstalacao = "indisponivel" | "instalada" | "android" | "ios";

// O que o Chrome entrega no beforeinstallprompt. Não está no lib.dom.
interface EventoDeInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// Evento nosso, para avisar os hooks montados de que o evento do Chrome chegou.
const AVISO_INTERNO = "muno:instalacao-disponivel";

/*
 * O evento guardado fora do React, e o listener instalado no IMPORT do módulo.
 *
 * Isto não é micro-otimização, é a única forma de o botão do Android aparecer.
 * O Chrome dispara beforeinstallprompt durante o carregamento da página, antes
 * de qualquer useEffect rodar. Um listener instalado no efeito chegaria tarde,
 * o evento passaria sem ninguém escutar, e como ele não se repete o botão
 * nunca mais apareceria naquela visita.
 *
 * O guard de window mantém o módulo importável no servidor.
 */
let eventoGuardado: EventoDeInstalacao | null = null;

/*
 * A dispensa desta sessão, guardada fora do localStorage.
 *
 * O carimbo em localStorage é o que cala o convite por DIAS_DE_SILENCIO, mas
 * ele não pode ser a ÚNICA memória: o Safari em navegação privada lança ao
 * gravar, e aí o convite voltaria no mesmo instante em que a pessoa o
 * dispensou, porque decidir() relê um storage que nunca recebeu nada.
 */
let dispensadaNestaSessao = false;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (evento) => {
    // preventDefault tira o banner que o Chrome mostraria sozinho, para o
    // convite aparecer onde nós escolhemos e não por cima do cardápio.
    evento.preventDefault();
    eventoGuardado = evento as EventoDeInstalacao;
    window.dispatchEvent(new Event(AVISO_INTERNO));
  });

  window.addEventListener("appinstalled", () => {
    // O menu do próprio navegador também instala, e aí este é o único aviso.
    eventoGuardado = null;
  });
}

/** localStorage lança em navegação privada no Safari. Nunca vale um crash. */
function lerDispensa(): string | null {
  try {
    return localStorage.getItem(CHAVE_DISPENSA);
  } catch {
    return null;
  }
}

function gravarDispensa(agora: number): void {
  try {
    localStorage.setItem(CHAVE_DISPENSA, marcarDispensa(agora));
  } catch {
    // Sem persistir, o convite volta na próxima visita. É o pior caso
    // aceitável; derrubar a tela por causa de um convite não é.
  }
}

function jaInstalada(): boolean {
  const porDisplayMode =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  // O Safari não implementa display-mode: standalone. Sem esta segunda
  // pergunta, o convite apareceria dentro do app já instalado no iPhone.
  const porSafari =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return porDisplayMode || porSafari;
}

export function useInstalacao() {
  const [estado, setEstado] = useState<EstadoInstalacao>("indisponivel");

  useEffect(() => {
    function decidir() {
      if (jaInstalada()) return setEstado("instalada");
      if (dispensadaNestaSessao) return setEstado("indisponivel");
      if (dispensaAtiva(lerDispensa(), Date.now())) {
        return setEstado("indisponivel");
      }
      if (eventoGuardado) return setEstado("android");
      if (ehIOS(navigator.userAgent, navigator.maxTouchPoints)) {
        return setEstado("ios");
      }
      // Android antes do Chrome decidir, ou desktop sem suporte. Se o evento
      // chegar depois, o AVISO_INTERNO traz o hook de volta aqui.
      return setEstado("indisponivel");
    }

    decidir();

    const instalou = () => setEstado("instalada");
    window.addEventListener(AVISO_INTERNO, decidir);
    window.addEventListener("appinstalled", instalou);
    return () => {
      window.removeEventListener(AVISO_INTERNO, decidir);
      window.removeEventListener("appinstalled", instalou);
    };
  }, []);

  const dispensar = useCallback(() => {
    dispensadaNestaSessao = true;
    gravarDispensa(Date.now());
    setEstado("indisponivel");
    // Avisa as OUTRAS instâncias do hook. A folha pós-login e a faixa do
    // cardápio ficam montadas ao mesmo tempo, cada uma com o próprio estado:
    // sem este aviso, dispensar a folha deixaria a faixa na tela oferecendo
    // exatamente o que a pessoa acabou de recusar.
    window.dispatchEvent(new Event(AVISO_INTERNO));
  }, []);

  const instalar = useCallback(async () => {
    const evento = eventoGuardado;
    if (!evento) return;

    // O evento vale um uso só. Zerar antes do await impede o clique duplo de
    // chamar prompt() duas vezes, o que o Chrome trata como erro.
    eventoGuardado = null;

    await evento.prompt();
    const { outcome } = await evento.userChoice;

    if (outcome === "accepted") return setEstado("instalada");

    // Recusou no diálogo. Conta como dispensa: sem isto o botão continuaria na
    // tela, mas o evento já foi consumido e um segundo clique não abriria
    // diálogo nenhum, que é o pior dos dois mundos.
    dispensar();
  }, [dispensar]);

  return { estado, instalar, dispensar };
}
