"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FUSO,
  rotuloDoMes,
  somarPorMes,
  variacao,
  type PontoDiario,
} from "@/lib/platform-series";
import { GraficoBarras } from "./GraficoBarras";
import { IconeChevron } from "./IconesConsole";
import { NumeroAnimado } from "./NumeroAnimado";
import { Variacao } from "./Variacao";

type Periodo = "7" | "30" | "12m";
type Metrica = "pedidos" | "volume";

// O botão mostra a forma curta e o menu a longa: "Últimos 30 dias" no botão
// quebra em duas linhas num celular, e a pílula deixa de ser pílula.
const PERIODOS: { valor: Periodo; rotulo: string; curto: string }[] = [
  { valor: "7", rotulo: "Últimos 7 dias", curto: "7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias", curto: "30 dias" },
  { valor: "12m", rotulo: "Últimos 12 meses", curto: "12 meses" },
];

const METRICAS: { valor: Metrica; rotulo: string }[] = [
  { valor: "pedidos", rotulo: "Pedidos" },
  { valor: "volume", rotulo: "Volume" },
];

function somar(pontos: PontoDiario[]) {
  const pedidos = pontos.reduce((s, p) => s + p.pedidos, 0);
  const volume = pontos.reduce((s, p) => s + p.volume, 0);
  return { pedidos, volume, ticket: pedidos === 0 ? 0 : volume / pedidos };
}

const meioDia = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

/**
 * O "Product activity" do Core, com o que a Muno tem de produto: os pedidos
 * que passam por todos os cardápios.
 *
 * Recebe o ano inteiro, dia a dia, e recorta no navegador. Trocar de período
 * não volta ao servidor: são 365 linhas pequenas, e a troca precisa ser
 * instantânea para a animação das barras ser o que a pessoa vê, e não um
 * carregamento.
 *
 * A comparação é com o período anterior de mesmo tamanho. Nos 12 meses não há
 * período anterior carregado, e a pílula diz "sem base" em vez de comparar com
 * um ano pela metade.
 */
export function GraficoAtividade({ dias }: { dias: PontoDiario[] }) {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [metrica, setMetrica] = useState<Metrica>("pedidos");

  const { pontos, atual, anterior } = useMemo(() => {
    if (periodo === "12m") {
      const meses = somarPorMes(dias).slice(-12);
      return { pontos: meses, atual: somar(meses), anterior: null };
    }
    const n = Number(periodo);
    const recorte = dias.slice(-n);
    const antes = dias.slice(-2 * n, -n);
    return {
      pontos: recorte,
      atual: somar(recorte),
      anterior: antes.length === n ? somar(antes) : null,
    };
  }, [dias, periodo]);

  const barras = pontos.map((p) => ({
    rotulo:
      periodo === "7"
        ? meioDia(p.dia)
            .toLocaleDateString("pt-BR", { weekday: "short", timeZone: FUSO })
            .replace(".", "")
        : p.rotulo,
    valor: metrica === "pedidos" ? p.pedidos : p.volume,
    titulo:
      periodo === "12m"
        ? rotuloDoMes(p.dia, true)
        : meioDia(p.dia).toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: FUSO,
          }),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-7">
        <h2 className="text-[19px] sm:text-[20px] font-semibold tracking-[-0.015em]">
          Atividade dos restaurantes
        </h2>
        <div className="flex items-center gap-2">
          <Alternador valor={metrica} opcoes={METRICAS} aoMudar={setMetrica} />
          <Seletor valor={periodo} opcoes={PERIODOS} aoMudar={setPeriodo} />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-7 lg:gap-8">
        <dl className="grid grid-cols-3 lg:grid-cols-1 gap-4 lg:gap-6 lg:w-44 shrink-0 lg:pr-6 lg:border-r lg:border-console-linha">
          <Resumo
            rotulo="Pedidos"
            valor={atual.pedidos}
            anterior={anterior?.pedidos}
          />
          <Resumo
            rotulo="Volume"
            valor={atual.volume}
            anterior={anterior?.volume}
            moeda
          />
          <Resumo
            rotulo="Ticket médio"
            valor={atual.ticket}
            anterior={anterior?.ticket}
            moeda
          />
        </dl>

        <div className="flex-1 min-w-0">
          <GraficoBarras
            barras={barras}
            moeda={metrica === "volume"}
            unidade={["pedido", "pedidos"]}
          />
        </div>
      </div>
    </div>
  );
}

function Resumo({
  rotulo,
  valor,
  anterior,
  moeda = false,
}: {
  rotulo: string;
  valor: number;
  anterior?: number;
  moeda?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium text-console-segunda">{rotulo}</dt>
      <dd className="mt-1.5 flex items-start leading-none text-console-tinta">
        {moeda && (
          <span className="text-[13px] sm:text-[15px] font-semibold mt-[0.15em] mr-1">
            R$
          </span>
        )}
        <NumeroAnimado
          valor={valor}
          moeda={moeda}
          className="text-[22px] sm:text-[30px] font-semibold tracking-[-0.035em] whitespace-nowrap"
        />
      </dd>
      <dd className="mt-2">
        <Variacao
          valor={anterior === undefined ? null : variacao(valor, anterior)}
          compacta
        />
      </dd>
    </div>
  );
}

/** Duas opções com a pílula branca deslizando entre elas. */
function Alternador<T extends string>({
  valor,
  opcoes,
  aoMudar,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  aoMudar: (v: T) => void;
}) {
  const indice = Math.max(
    0,
    opcoes.findIndex((o) => o.valor === valor)
  );

  return (
    <div
      role="radiogroup"
      aria-label="Métrica"
      className="relative grid p-1 rounded-xl bg-console-tinta/[0.05]"
      style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-[9px] bg-console-cartao shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{
          width: `calc((100% - 8px) / ${opcoes.length})`,
          transform: `translateX(${indice * 100}%)`,
        }}
      />
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => aoMudar(o.valor)}
          className={`relative z-10 h-8 px-3.5 text-[13px] font-medium transition-colors ${
            o.valor === valor
              ? "text-console-tinta"
              : "text-console-segunda hover:text-console-tinta"
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** O "Last 7 days ⌄" do Core: botão com menu que abre escalando do canto. */
function Seletor<T extends string>({
  valor,
  opcoes,
  aoMudar,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string; curto?: string }[];
  aoMudar: (v: T) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const atual = opcoes.find((o) => o.valor === valor);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex items-center gap-1.5 h-10 pl-3.5 pr-2.5 rounded-xl border border-console-linha bg-console-cartao whitespace-nowrap text-[13px] sm:text-[14px] font-medium text-console-tinta shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-console-mudo transition-colors"
      >
        <span className="sm:hidden">{atual?.curto ?? atual?.rotulo}</span>
        <span className="hidden sm:inline">{atual?.rotulo}</span>
        <IconeChevron
          size={18}
          className={`text-console-segunda transition-transform duration-300 ${
            aberto ? "rotate-180" : ""
          }`}
        />
      </button>

      {aberto && (
        <ul
          role="listbox"
          className="console-menu absolute right-0 top-full mt-2 z-30 min-w-[180px] rounded-2xl border border-console-linha bg-console-cartao p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.2)]"
        >
          {opcoes.map((o) => (
            <li key={o.valor}>
              <button
                type="button"
                role="option"
                aria-selected={o.valor === valor}
                onClick={() => {
                  aoMudar(o.valor);
                  setAberto(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-[14px] transition-colors ${
                  o.valor === valor
                    ? "bg-console-suave font-semibold text-console-tinta"
                    : "text-console-segunda hover:bg-console-suave hover:text-console-tinta"
                }`}
              >
                {o.rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
