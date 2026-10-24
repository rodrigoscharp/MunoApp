/**
 * Regras do alarme de pedido novo da cozinha. O hook que liga som, título e
 * tela acesa mora em src/hooks/useAlertaCozinha.ts; aqui fica o que dá para
 * testar sem navegador.
 */

/** Intervalo entre bipes enquanto houver pedido pendente sem ciência. */
export const INTERVALO_DO_BIPE_MS = 4_000;

/** Pisca do título da aba. */
export const INTERVALO_DO_TITULO_MS = 1_000;

/**
 * Pedidos pendentes que ninguém tocou ainda.
 *
 * O alarme é por pedido, não por evento: o que importa no balcão é "há pedido
 * esperando confirmação", e um aviso de tempo real perdido não pode deixar um
 * pedido em silêncio. Por isso a entrada é a lista de pendentes da tela, que o
 * polling também alimenta. O pedido sai daqui quando alguém dá ciência ou
 * quando ele deixa de ser PENDING.
 */
export function pendentesSemCiencia(
  pedidos: { id: string; status: string }[],
  vistos: ReadonlySet<string>
): string[] {
  return pedidos.filter((p) => p.status === "PENDING" && !vistos.has(p.id)).map((p) => p.id);
}

export function tituloDoAlerta(base: string, quantos: number, aceso: boolean): string {
  if (quantos === 0 || !aceso) return base;
  return quantos === 1 ? "(1) Novo pedido!" : `(${quantos}) Novos pedidos!`;
}

/**
 * Dois tons curtos gerados na hora, sem arquivo de áudio: nada para baixar,
 * nada para falhar ao carregar no tablet com rede ruim.
 */
export function tocarBipe(ctx: AudioContext): void {
  const inicio = ctx.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = inicio + i * 0.18;
    // Rampa curta na entrada e na saída: corte seco na onda soa como estalo.
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }
}
