import { FUSO } from "@/lib/platform-series";

export type LinhaPorHora = { dia: string; hora: number; n: number };
export type BarraDePedidos = { hora: number; hoje: number; media: number };

/** 0 a 23, no relógio de São Paulo. */
export function horaEmBrasilia(d: Date): number {
  return Number(d.toLocaleString("en-US", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }));
}

/**
 * Hoje, hora a hora até agora, contra a média da mesma hora nos dias de
 * comparação (os mesmos dias da semana anteriores). Dia sem pedido conta como
 * zero na média: é o que aconteceu, não falta de dado.
 */
export function montarPedidosPorHora(
  linhas: LinhaPorHora[],
  hoje: string,
  anteriores: string[],
  horaAtual: number
): BarraDePedidos[] {
  const n = (dia: string, hora: number) =>
    linhas.find((l) => l.dia === dia && l.hora === hora)?.n ?? 0;
  return Array.from({ length: horaAtual + 1 }, (_, hora) => ({
    hora,
    hoje: n(hoje, hora),
    media: anteriores.length
      ? Math.round(anteriores.reduce((s, dia) => s + n(dia, hora), 0) / anteriores.length)
      : 0,
  }));
}
