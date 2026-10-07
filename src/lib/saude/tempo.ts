const MIN = 60_000;
const HORA = 60 * MIN;

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function tempoDesde(d: Date, agora: Date): string {
  const ms = agora.getTime() - d.getTime();
  if (ms < MIN) return "agora";
  if (ms < HORA) return `há ${Math.floor(ms / MIN)} min`;
  if (ms < 48 * HORA) return `há ${Math.floor(ms / HORA)} h`;
  return `há ${Math.floor(ms / (24 * HORA))} dias`;
}
