"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  IconeChevron,
  IconeGrade,
  IconeGrafico,
  IconeLoja,
  IconePessoa,
} from "./IconesConsole";

export type ContagensDoMenu = {
  novos: number;
  negociando: number;
  atrasadas: number;
};

type Selo = { contagem: keyof ContagensDoMenu; tom: "laranja" | "verde" };
type Icone = typeof IconeGrade;

type Filho = {
  href: string;
  rotulo: string;
  /** O `?estagio=` que marca este filho como atual. Nulo é "Todos". */
  estagio: string | null;
  selo?: Selo;
};

type Item =
  | { tipo: "link"; href: string; rotulo: string; Icone: Icone; selo?: Selo }
  | { tipo: "grupo"; base: string; rotulo: string; Icone: Icone; filhos: Filho[] };

// Conversão fica depois de leads porque é a leitura de cima do mesmo assunto:
// leads é a lista, conversão é o que ela virou.
//
// Os filhos de Leads são os filtros por estágio que a tela já aceita pela URL.
// Laranja no selo é "tem gente esperando resposta"; verde é "tem venda
// andando". As mesmas duas cores do Core, com o mesmo sentido.
const ITENS: Item[] = [
  { tipo: "link", href: "/", rotulo: "Visão geral", Icone: IconeGrade },
  {
    tipo: "grupo",
    base: "/leads",
    rotulo: "Leads",
    Icone: IconePessoa,
    filhos: [
      { href: "/leads", rotulo: "Todos", estagio: null },
      {
        href: "/leads?estagio=NOVO",
        rotulo: "Novos",
        estagio: "NOVO",
        selo: { contagem: "novos", tom: "laranja" },
      },
      { href: "/leads?estagio=CONTATADO", rotulo: "Contatados", estagio: "CONTATADO" },
      {
        href: "/leads?estagio=NEGOCIACAO",
        rotulo: "Em negociação",
        estagio: "NEGOCIACAO",
        selo: { contagem: "negociando", tom: "verde" },
      },
      { href: "/leads?estagio=FECHADO", rotulo: "Fechados", estagio: "FECHADO" },
    ],
  },
  { tipo: "link", href: "/conversao", rotulo: "Conversão", Icone: IconeGrafico },
  {
    tipo: "link",
    href: "/clientes",
    rotulo: "Clientes",
    Icone: IconeLoja,
    selo: { contagem: "atrasadas", tom: "laranja" },
  },
];

const ALTURA_DO_FILHO = 40;
const VAO_ENTRE_FILHOS = 4;

const SOMBRA_DA_PILULA =
  "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_16px_-6px_rgba(0,0,0,0.10)]";

function useRotaAtual() {
  const pathname = usePathname();
  const params = useSearchParams();
  // O proxy reescreve admin.<root>/x para /platform/x, então o pathname que
  // chega aqui já vem prefixado.
  return {
    caminho: pathname.replace(/^\/platform/, "") || "/",
    estagio: params.get("estagio"),
  };
}

function ativoNoLink(caminho: string, href: string) {
  return href === "/" ? caminho === "/" : caminho.startsWith(href);
}

export function MenuLateral({ contagens }: { contagens: ContagensDoMenu }) {
  const { caminho, estagio } = useRotaAtual();

  return (
    <nav aria-label="Menu" className="flex flex-col gap-1.5">
      {ITENS.map((item) =>
        item.tipo === "link" ? (
          <ItemLink
            key={item.href}
            item={item}
            ativo={ativoNoLink(caminho, item.href)}
            contagens={contagens}
          />
        ) : (
          <Grupo
            key={item.base}
            item={item}
            caminho={caminho}
            estagio={estagio}
            contagens={contagens}
          />
        )
      )}
    </nav>
  );
}

function ItemLink({
  item,
  ativo,
  contagens,
}: {
  item: Extract<Item, { tipo: "link" }>;
  ativo: boolean;
  contagens: ContagensDoMenu;
}) {
  const { Icone } = item;
  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-3.5 h-12 px-3.5 rounded-2xl text-[15px] transition-[background-color,box-shadow,color] duration-300 ${
        ativo
          ? `bg-console-cartao text-console-tinta font-semibold ${SOMBRA_DA_PILULA}`
          : "text-console-segunda font-medium hover:text-console-tinta hover:bg-console-tinta/[0.03]"
      }`}
    >
      <Icone size={22} className="shrink-0" />
      <span className="flex-1 truncate">{item.rotulo}</span>
      {item.selo && (
        <SeloDeContagem n={contagens[item.selo.contagem]} tom={item.selo.tom} />
      )}
    </Link>
  );
}

/**
 * O grupo com a árvore do Core: o pai abre e fecha, os filhos pendem de um
 * traço com curva, e a pílula branca desliza até o filho atual.
 *
 * A pílula é UM elemento que se move, e não um fundo em cada filho que acende
 * e apaga. É isso que dá a sensação de a seleção viajar de um item para o
 * outro, e é por isso que os filhos têm altura fixa: a posição dela é conta,
 * não medição.
 */
function Grupo({
  item,
  caminho,
  estagio,
  contagens,
}: {
  item: Extract<Item, { tipo: "grupo" }>;
  caminho: string;
  estagio: string | null;
  contagens: ContagensDoMenu;
}) {
  const dentro = caminho.startsWith(item.base);
  const [aberto, setAberto] = useState(dentro);

  // Entrar no grupo por outro caminho (um link da visão geral, por exemplo)
  // abre o grupo. Ajuste de estado durante o render, e não efeito: assim o
  // grupo já pinta aberto, sem um quadro fechado antes.
  const [dentroAntes, setDentroAntes] = useState(dentro);
  if (dentro !== dentroAntes) {
    setDentroAntes(dentro);
    if (dentro) setAberto(true);
  }

  // Só a lista em si marca filho. Na ficha de um lead (/leads/abc) nenhum
  // filtro está aplicado, e acender "Todos" ali seria mentir.
  let atual = -1;
  if (caminho === item.base) {
    atual = item.filhos.findIndex((f) => f.estagio === estagio);
    if (atual === -1) atual = 0;
  }

  const { Icone } = item;

  return (
    <div>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={`flex w-full items-center gap-3.5 h-12 px-3.5 rounded-2xl text-[15px] transition-colors ${
          dentro
            ? "text-console-tinta font-semibold"
            : "text-console-segunda font-medium hover:text-console-tinta hover:bg-console-tinta/[0.03]"
        }`}
      >
        <Icone size={22} className="shrink-0" />
        <span className="flex-1 text-left">{item.rotulo}</span>
        <IconeChevron
          size={18}
          className={`shrink-0 transition-transform duration-300 ${
            aberto ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* 0fr → 1fr anima a altura real do conteúdo, sem medir nada. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden" inert={!aberto}>
          <ul className="relative ml-[25px] pl-[18px] py-1">
            <span
              aria-hidden
              className={`absolute left-[18px] right-0 top-1 rounded-xl bg-console-cartao ${SOMBRA_DA_PILULA} transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]`}
              style={{
                height: ALTURA_DO_FILHO,
                transform: `translateY(${
                  Math.max(0, atual) * (ALTURA_DO_FILHO + VAO_ENTRE_FILHOS)
                }px)`,
                opacity: atual === -1 ? 0 : 1,
              }}
            />
            {item.filhos.map((f, i) => {
              const eAtual = i === atual;
              const ultimo = i === item.filhos.length - 1;
              return (
                <li
                  key={f.href}
                  className="relative"
                  style={{ marginTop: i === 0 ? 0 : VAO_ENTRE_FILHOS }}
                >
                  {/* O ramo: desce do tronco e curva até o item. */}
                  <span
                    aria-hidden
                    className="absolute -left-[18px] top-0 h-1/2 w-3.5 border-l-[1.5px] border-b-[1.5px] border-console-mudo/45 rounded-bl-[10px]"
                  />
                  {/* O tronco continua até o próximo irmão. */}
                  {!ultimo && (
                    <span
                      aria-hidden
                      className={`absolute -left-[18px] -bottom-1 border-l-[1.5px] border-console-mudo/45 ${
                        i === 0 ? "-top-1" : "top-0"
                      }`}
                    />
                  )}
                  <Link
                    href={f.href}
                    aria-current={eAtual ? "page" : undefined}
                    className={`relative flex items-center justify-between gap-2 pl-3 pr-2 rounded-xl text-[15px] transition-colors duration-300 ${
                      eAtual
                        ? "text-console-tinta font-semibold"
                        : "text-console-segunda/85 font-medium hover:text-console-tinta"
                    }`}
                    style={{ height: ALTURA_DO_FILHO }}
                  >
                    <span className="truncate">{f.rotulo}</span>
                    {f.selo && (
                      <SeloDeContagem
                        n={contagens[f.selo.contagem]}
                        tom={f.selo.tom}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SeloDeContagem({ n, tom }: { n: number; tom: "laranja" | "verde" }) {
  if (n <= 0) return null;
  return (
    <span
      // Tinta fixa e não token: os dois fundos são claros nos dois temas.
      className={`shrink-0 min-w-6 h-6 px-1.5 rounded-lg flex items-center justify-center text-[13px] font-semibold tabular text-[#141414] ${
        tom === "laranja" ? "bg-console-selo-laranja" : "bg-console-selo-verde"
      }`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

const DESTINOS_DO_CELULAR = [
  { href: "/", rotulo: "Geral", Icone: IconeGrade },
  { href: "/leads", rotulo: "Leads", Icone: IconePessoa },
  { href: "/conversao", rotulo: "Conversão", Icone: IconeGrafico },
  { href: "/clientes", rotulo: "Clientes", Icone: IconeLoja },
] as const;

/**
 * O rodapé do celular. Sem árvore: em 375px ela não cabe, e os filtros de
 * estágio continuam a um toque dentro da própria tela de leads.
 */
export function MenuInferior({ contagens }: { contagens: ContagensDoMenu }) {
  const { caminho } = useRotaAtual();
  const pendencias: Record<string, number> = {
    "/leads": contagens.novos,
    "/clientes": contagens.atrasadas,
  };

  return (
    <nav aria-label="Menu" className="grid grid-cols-4 px-2 py-1.5">
      {DESTINOS_DO_CELULAR.map(({ href, rotulo, Icone }) => {
        const ativo = ativoNoLink(caminho, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition-colors ${
              ativo ? "text-console-tinta" : "text-console-segunda"
            }`}
          >
            <span
              className={`relative flex items-center justify-center h-8 w-14 rounded-full transition-[background-color,box-shadow] duration-300 ${
                ativo ? `bg-console-cartao ${SOMBRA_DA_PILULA}` : ""
              }`}
            >
              <Icone size={21} />
              {(pendencias[href] ?? 0) > 0 && (
                <span
                  aria-hidden
                  className="absolute top-0.5 right-3 size-2 rounded-full bg-[#FF8051] ring-2 ring-console-papel"
                />
              )}
            </span>
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
