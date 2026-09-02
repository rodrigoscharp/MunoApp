"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, Smartphone } from "lucide-react";
import { useInstalacao } from "./useInstalacao";
import { InstrucaoIOS } from "./InstrucaoIOS";
import { FAIXA_NO_CARDAPIO } from "@/lib/pwa/config";
import { aoMudarAFolha, folhaEstaVisivel } from "./convitePosLogin";

/**
 * O convite permanente do cardápio, para quem procurar sozinho.
 *
 * Ela é o par da folha pós-login e existe pelo caso oposto: quem dispensou o
 * convite, ou nunca chegou a fazer login, continua tendo onde instalar sem
 * depender de a plataforma perguntar de novo. Por isso ela NÃO tem botão de
 * dispensar, e por isso ela é discreta.
 *
 * A instrução do iOS abre sob demanda. Aberta por padrão, ela ocuparia quatro
 * linhas de cardápio permanentemente para todo iPhone, resolvendo uma dúvida
 * que quase ninguém tem naquele instante.
 */
export function FaixaDeInstalacao() {
  const { estado, instalar } = useInstalacao();
  const [aberta, setAberta] = useState(false);
  const [folha, setFolha] = useState(false);

  // A folha pós-login tem prioridade: ela tem o momento, alguém acabou de
  // entrar na conta. A faixa volta assim que a folha sair.
  useEffect(() => {
    const conferir = () => setFolha(folhaEstaVisivel());
    conferir();
    return aoMudarAFolha(conferir);
  }, []);

  if (!FAIXA_NO_CARDAPIO) return null;
  if (folha) return null;
  if (estado !== "android" && estado !== "ios") return null;

  return (
    <div className="bg-brand-light border border-brand-muted rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <span className="shrink-0 w-9 h-9 rounded-lg bg-white flex items-center justify-center">
          <Smartphone size={18} className="text-brand" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-neutral-700 leading-snug">
          <strong className="font-semibold text-neutral-900">
            Instale o cardápio
          </strong>{" "}
          e peça em tela cheia, direto da tela inicial.
        </p>

        {estado === "android" ? (
          <button
            type="button"
            onClick={instalar}
            className="shrink-0 flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            <Download size={14} />
            Instalar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAberta((a) => !a)}
            aria-expanded={aberta}
            className="shrink-0 flex items-center gap-1 text-brand hover:text-brand-dark text-xs font-semibold px-3 py-2 rounded-lg hover:bg-white/60 transition"
          >
            Como fazer
            <ChevronDown
              size={14}
              className={`transition-transform ${aberta ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {estado === "ios" && aberta && (
        <div className="px-3 pb-3 pt-1 border-t border-brand-muted/60 bg-white/50">
          <div className="pt-3">
            <InstrucaoIOS compacto />
          </div>
        </div>
      )}
    </div>
  );
}
