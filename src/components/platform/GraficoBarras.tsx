"use client";

import { useState } from "react";
import { escalaBonita, numeroCompacto } from "@/lib/numero-compacto";
import { formatCurrency } from "@/lib/utils";

export type BarraDoGrafico = { rotulo: string; valor: number; titulo?: string };

/** Altura da faixa de rótulos do eixo X: 8px de respiro + 20px de texto. */
const RODAPE = "pb-[21px]";

/**
 * Barras no desenho do Core: cinza recessivo, a última em verde, e a barra sob
 * o cursor em tinta cheia com o balão escuro por cima.
 *
 * HTML e não recharts, por dois motivos. O primeiro é a animação: cada barra
 * cresce da base com um atraso próprio, e isso é uma classe CSS aqui contra um
 * `animationBegin` global lá. O segundo é o tema: as cores saem dos tokens do
 * console, e o recharts escreve `fill` como atributo SVG, onde `var()` não é
 * garantido.
 *
 * A altura vem por classe (`className`), e não por número: assim o gráfico
 * encolhe no celular com uma media query do Tailwind, sem hook de largura e
 * sem o pulo de layout que medir no cliente produz. Por isso a área das barras
 * é `flex-1` e nada aqui faz conta de pixel.
 *
 * A última barra é verde porque é "agora", que é o que a pessoa procura
 * primeiro. Quando o período ainda não fechou (`ultimaEmCurso`), ela vai
 * listrada: comparar uma semana pela metade com semanas inteiras é o erro que
 * este gráfico convida, e a textura avisa sem legenda.
 */
export function GraficoBarras({
  barras,
  moeda = false,
  unidade = ["", ""],
  className = "h-[190px] sm:h-[240px]",
  destacarUltima = true,
  ultimaEmCurso = false,
}: {
  barras: BarraDoGrafico[];
  moeda?: boolean;
  unidade?: [string, string];
  className?: string;
  destacarUltima?: boolean;
  ultimaEmCurso?: boolean;
}) {
  const [foco, setFoco] = useState<number | null>(null);

  const n = barras.length;
  const maximo = Math.max(0, ...barras.map((b) => b.valor));
  const topo = escalaBonita(maximo);
  const vao = n > 40 ? 2 : n > 14 ? 4 : 10;
  // No máximo uns oito rótulos no eixo, sempre incluindo o último.
  const passo = Math.max(1, Math.ceil(n / 8));
  // Trocar o recorte remonta as barras, e remontar é o que refaz a animação.
  const assinatura = barras.map((b) => `${b.rotulo}:${b.valor}`).join("|");

  const formatar = (v: number) =>
    moeda
      ? formatCurrency(v)
      : `${v} ${v === 1 ? unidade[0] : unidade[1]}`.trim();

  return (
    <div
      className={`flex gap-2.5 sm:gap-3 select-none ${className}`}
      role="img"
      aria-label={`${n} barras, a maior com ${formatar(maximo)}`}
    >
      <div
        aria-hidden
        className={`flex flex-col justify-between items-end shrink-0 w-8 sm:w-10 -mt-[7px] ${RODAPE} text-[11px] sm:text-[12px] leading-[14px] text-console-mudo tabular`}
      >
        <span>{numeroCompacto(topo)}</span>
        <span>{numeroCompacto(topo / 2)}</span>
        <span>0</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="relative flex-1">
          <div
            aria-hidden
            className="absolute inset-0 flex flex-col justify-between"
          >
            <span className="border-t border-dashed border-console-linha" />
            <span className="border-t border-dashed border-console-linha" />
            <span className="border-t border-console-linha" />
          </div>

          <div
            key={assinatura}
            className="relative h-full flex items-end"
            style={{ gap: vao }}
            onMouseLeave={() => setFoco(null)}
          >
            {barras.map((b, i) => {
              const pct = topo === 0 ? 0 : (b.valor / topo) * 100;
              const ultima = i === n - 1;
              const emFoco = foco === i;
              const cor = emFoco
                ? "bg-console-tinta"
                : ultima && ultimaEmCurso
                  ? "console-em-curso"
                  : ultima && destacarUltima
                    ? "bg-console-grafico"
                    : "bg-console-tinta/[0.09]";
              // O balão encosta na borda do gráfico nas pontas, em vez de
              // centralizar e sair do cartão.
              const lado =
                i < n * 0.2
                  ? "left-0"
                  : i >= n * 0.8
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2";

              return (
                <div
                  key={i}
                  className="relative flex-1 h-full flex items-end justify-center"
                  onMouseEnter={() => setFoco(i)}
                  onClick={() => setFoco(emFoco ? null : i)}
                >
                  <div
                    className={`console-barra w-full max-w-[40px] rounded-[7px] sm:rounded-[8px] transition-colors duration-200 ${cor}`}
                    style={
                      {
                        height: b.valor > 0 ? `max(6px, ${pct}%)` : "3px",
                        "--atraso": `${Math.min(i * 30, 480)}ms`,
                      } as React.CSSProperties
                    }
                  />
                  {emFoco && (
                    <div
                      className={`absolute z-10 pointer-events-none ${lado}`}
                      style={{ bottom: `calc(${Math.max(pct, 1)}% + 10px)` }}
                    >
                      <div className="console-aparece whitespace-nowrap rounded-xl bg-console-tinta text-console-papel px-3 py-2 shadow-lg">
                        <p className="text-[11px] opacity-60">
                          {b.titulo ?? b.rotulo}
                        </p>
                        <p className="text-[14px] font-semibold tabular">
                          {formatar(b.valor)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div
          aria-hidden
          className="flex mt-2 h-[20px] items-center"
          style={{ gap: vao }}
        >
          {barras.map((b, i) => {
            const daDireitaParaEsquerda = n - 1 - i;
            const rotulado = daDireitaParaEsquerda % passo === 0;
            // Metade dos rótulos some no celular: a mesma escada que cabe em
            // 700px encosta uma data na outra em 375px, e data colada em data
            // não é rótulo, é ruído.
            const soNoDesktop =
              rotulado && (daDireitaParaEsquerda / passo) % 2 === 1;

            return (
              <span
                key={i}
                className={`flex-1 min-w-0 justify-center whitespace-nowrap text-[11px] sm:text-[12px] transition-colors ${
                  soNoDesktop ? "hidden sm:flex" : "flex"
                } ${
                  foco === i
                    ? "text-console-tinta font-medium"
                    : "text-console-mudo"
                }`}
              >
                {rotulado ? b.rotulo : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
