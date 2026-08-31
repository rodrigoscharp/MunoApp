"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Monitor, Sun, Moon } from "lucide-react";

/**
 * Escolha de tema do console: sistema, claro ou escuro.
 *
 * Três opções e não um interruptor de duas, porque "sistema" é a resposta certa
 * para a maioria e precisa continuar disponível depois que alguém experimentar
 * as outras duas. Um interruptor de duas posições perde esse estado para sempre
 * no primeiro clique.
 *
 * Segmentado e não um botão que cicla: com três estados, ciclar obriga a pessoa
 * a passar pelo tema que ela não quer para chegar no que quer.
 */
const OPCOES = [
  { valor: "sistema", rotulo: "sistema", Icone: Monitor },
  { valor: "claro", rotulo: "claro", Icone: Sun },
  { valor: "escuro", rotulo: "escuro", Icone: Moon },
] as const;

type Tema = (typeof OPCOES)[number]["valor"];

const CHAVE = "muno-tema";

/**
 * O tema é estado do documento, não do React: quem o aplicou primeiro foi o
 * script inline do layout raiz, antes de qualquer componente existir. Por isso
 * a leitura passa por useSyncExternalStore, e não por useState com efeito de
 * hidratação: o servidor não tem documento, o cliente tem, e esta é a API que
 * concilia os dois sem setState dentro de efeito nem aviso de hidratação.
 */
const ouvintes = new Set<() => void>();

/** Escolha feita nesta aba. Nula até alguém clicar, quando o documento manda. */
let escolhido: Tema | null = null;

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
  };
}

function lerDoDocumento(): Tema {
  if (escolhido !== null) return escolhido;
  const atual = document.documentElement.dataset.tema;
  return atual === "claro" || atual === "escuro" ? atual : "sistema";
}

/** No servidor não há documento, e "sistema" é o padrão honesto: é o estado em
 *  que a media query decide sozinha. */
function lerNoServidor(): Tema {
  return "sistema";
}

/**
 * Fora do componente de propósito. A loja é do módulo, e mexer nela de dentro
 * do componente seria efeito colateral durante o render, que é o que a regra
 * react-hooks/immutability recusa com razão. Aqui, é só uma loja se atualizando
 * e avisando quem assinou.
 */
function escolher(novo: Tema) {
  escolhido = novo;
  for (const ouvinte of ouvintes) ouvinte();
}

export function TemaBotao() {
  const tema = useSyncExternalStore(assinar, lerDoDocumento, lerNoServidor);

  // A escrita no documento vive num efeito, não no clique: falar com o mundo de
  // fora do componente durante o render ou o handler é exatamente o que a regra
  // react-hooks/immutability recusa, e ela está certa.
  const primeiraPassada = useRef(true);
  useEffect(() => {
    // A montagem não escreve nada. Quem decidiu o tema inicial foi o script
    // inline, e reaplicá-lo aqui só criaria a chance de apagá-lo por um quadro.
    if (primeiraPassada.current) {
      primeiraPassada.current = false;
      return;
    }

    const raiz = document.documentElement;
    // Ausência do atributo é o estado "sistema": sem ele, quem manda é a media
    // query de prefers-color-scheme.
    if (tema === "sistema") raiz.removeAttribute("data-tema");
    else raiz.setAttribute("data-tema", tema);

    try {
      if (tema === "sistema") localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, tema);
    } catch {
      // Armazenamento bloqueado: a escolha vale só nesta aba, e trocar de tema
      // continua funcionando. Melhor que recusar a troca.
    }
  }, [tema]);

  return (
    <div
      role="radiogroup"
      aria-label="Tema do console"
      className="flex gap-0.5 p-0.5 rounded-xl bg-console-tinta/5"
    >
      {OPCOES.map(({ valor, rotulo, Icone }) => {
        const ativo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={rotulo}
            title={rotulo}
            onClick={() => escolher(valor)}
            className={`flex-1 flex items-center justify-center py-1.5 rounded-[10px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-console-campo ${
              ativo
                ? "bg-console-cartao text-console-tinta shadow-sm"
                : "text-console-tinta/45 hover:text-console-tinta"
            }`}
          >
            <Icone size={15} strokeWidth={ativo ? 2.4 : 2} />
          </button>
        );
      })}
    </div>
  );
}
