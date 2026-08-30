import type { TipoEvento } from "@prisma/client";

export type EventoParaResumo = {
  tipo: TipoEvento;
  createdAt: Date;
  origem: string | null;
};

export type LinhaDeResumo = {
  dia: Date;
  tipo: TipoEvento;
  origem: string;
  n: number;
};

export const ORIGEM_DIRETA = "direto";

/**
 * A origem como ela vai para o resumo: minúscula, sem espaço nas pontas, e
 * "direto" quando não veio utm nenhum.
 *
 * "direto" e não null porque a chave de ResumoDiario é composta e não aceita
 * nulo, e porque quem chegou digitando o endereço é um canal, não uma ausência.
 */
export function normalizarOrigem(bruto: string | null | undefined): string {
  const limpo = (bruto ?? "").trim().toLowerCase();
  return limpo === "" ? ORIGEM_DIRETA : limpo;
}

/** Meia-noite UTC do dia da data. A coluna é @db.Date e não guarda hora. */
function diaDe(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function resumir(eventos: EventoParaResumo[]): LinhaDeResumo[] {
  const contagem = new Map<string, LinhaDeResumo>();

  for (const evento of eventos) {
    const dia = diaDe(evento.createdAt);
    const origem = normalizarOrigem(evento.origem);
    const chave = `${dia.toISOString()}|${evento.tipo}|${origem}`;

    const linha = contagem.get(chave);
    if (linha) linha.n += 1;
    else contagem.set(chave, { dia, tipo: evento.tipo, origem, n: 1 });
  }

  return [...contagem.values()];
}
