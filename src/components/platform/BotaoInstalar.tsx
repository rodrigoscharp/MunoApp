"use client";

import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useInstalacao } from "@/components/pwa/useInstalacao";

/**
 * Instalar o console na tela inicial.
 *
 * Vive em components/platform, e não em components/pwa, porque só a aparência
 * é dele: a decisão inteira (qual plataforma, já instalado, dispensado) vem do
 * mesmo `useInstalacao` que o cardápio usa. O que muda aqui são os tokens de
 * cor, porque o console tem tema claro e escuro e a folha do cardápio não.
 *
 * Ele some sozinho quando não há o que oferecer, e é por isso que pode ficar
 * montado nos dois lugares do layout: a barra do topo no celular e o rodapé da
 * coluna no desktop, cada um escondido pelo breakpoint do outro.
 *
 * No iOS não existe API de instalação, então o botão abre a instrução manual
 * em vez de um diálogo.
 */
export function BotaoInstalar() {
  const { estado, instalar } = useInstalacao();
  const [aberto, setAberto] = useState(false);

  if (estado !== "android" && estado !== "ios") return null;

  const classe =
    "flex items-center gap-2 px-2 py-1 text-sm text-console-tinta/50 " +
    "hover:text-console-campo transition focus-visible:outline-2 " +
    "focus-visible:outline-offset-2 focus-visible:outline-console-campo";

  if (estado === "android") {
    return (
      <button type="button" onClick={instalar} className={classe}>
        <Download size={15} />
        Instalar
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-expanded={aberto}
        className={classe}
      >
        <Download size={15} />
        Instalar
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Como instalar o console"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3"
          onClick={() => setAberto(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-console-cartao border border-console-linha p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-console-tinta">
                Deixar na tela inicial
              </p>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="-mt-1 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-console-tinta/45 hover:text-console-tinta transition"
              >
                <X size={17} />
              </button>
            </div>

            <ol className="mt-4 space-y-3">
              <li className="flex items-center gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-console-campo/10 text-console-campo text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <span className="text-sm text-console-tinta/80 flex items-center gap-1.5 flex-wrap">
                  Toque em
                  <Share size={16} className="text-console-campo" aria-hidden />
                  <strong className="font-semibold">Compartilhar</strong>
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-console-campo/10 text-console-campo text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <span className="text-sm text-console-tinta/80 flex items-center gap-1.5 flex-wrap">
                  Escolha
                  <SquarePlus size={16} className="text-console-campo" aria-hidden />
                  <strong className="font-semibold">Adicionar à Tela de Início</strong>
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
