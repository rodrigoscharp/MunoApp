/**
 * A linha curva ao lado do número grande.
 *
 * Sem eixo e sem escala de propósito: ela responde "subindo ou caindo", e o
 * número ao lado responde "quanto". A curva é Catmull-Rom convertida em Bézier,
 * com os pontos de controle presos à caixa, senão a suavização passa do topo
 * num pico e o traço é cortado pelo SVG.
 */
export function Sparkline({
  valores,
  largura = 104,
  altura = 68,
  className = "",
}: {
  valores: number[];
  largura?: number;
  altura?: number;
  className?: string;
}) {
  if (valores.length < 2) return null;

  const margem = 4;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min;
  const topo = margem;
  const base = altura - margem;

  const pontos = valores.map(
    (v, i) =>
      [
        margem + (i * (largura - 2 * margem)) / (valores.length - 1),
        faixa === 0 ? altura / 2 : base - ((v - min) / faixa) * (base - topo),
      ] as const
  );

  const prende = (y: number) => Math.min(base, Math.max(topo, y));
  const r = (n: number) => Math.round(n * 100) / 100;

  let d = `M${r(pontos[0][0])},${r(pontos[0][1])}`;
  for (let i = 0; i < pontos.length - 1; i++) {
    const p0 = pontos[i - 1] ?? pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = prende(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = prende(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(p2[0])},${r(p2[1])}`;
  }

  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      aria-hidden
      className={`shrink-0 overflow-visible ${className}`}
    >
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="console-traco"
      />
    </svg>
  );
}
