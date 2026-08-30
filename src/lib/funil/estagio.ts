import type { TipoEvento } from "@prisma/client";

/**
 * Em que ponto do funil alguém está, decidido pelo que aconteceu de verdade.
 *
 * Puro, sem Prisma e sem HTTP, como lead-landing.ts e platform-metrics.ts: a
 * consulta busca, esta função decide. É o que torna a regra testável sem banco.
 */
export type Estagio =
  | "VISITANTE"
  | "IDENTIFICOU"
  | "CHECKOUT"
  | "PAGOU"
  | "CLIENTE"
  | "ABANDONOU"
  | "PERDIDO";

export type LeadDoFunil = {
  origem: string;
  status: string;
  tenantId: string | null;
};

export type EventoDoFunil = { tipo: TipoEvento };

/**
 * Precedência, e não ordem cronológica. Os eventos chegam fora de ordem por
 * projeto: o webhook do Asaas reentrega, e o navegador manda com keepalive sem
 * garantia de sequência. Decidir pelo evento mais recente faria o estágio
 * oscilar sozinho.
 */
export function estagioDoLead(
  lead: LeadDoFunil,
  eventos: EventoDoFunil[]
): Estagio {
  const tem = (tipo: TipoEvento) => eventos.some((e) => e.tipo === tipo);

  if (lead.tenantId !== null) return "CLIENTE";
  if (tem("ABANDONOU")) return "ABANDONOU";
  if (tem("PAGOU")) return "PAGOU";
  if (lead.status === "PERDIDO") return "PERDIDO";
  if (tem("CHECKOUT_CRIADO") || tem("CHECKOUT_PASSO")) return "CHECKOUT";

  // O piso de um lead é IDENTIFICOU: a pessoa deixou um contato. VISITANTE é
  // estágio de sessão, e uma sessão que virou lead nunca volta para ele.
  return "IDENTIFICOU";
}

export function estagioDaSessao(
  lead: LeadDoFunil | null,
  eventos: EventoDoFunil[]
): Estagio {
  if (lead === null) return "VISITANTE";
  return estagioDoLead(lead, eventos);
}

/**
 * Se o botão de status aparece na tela do lead.
 *
 * Só para quem você conduz na conversa. O lead de checkout tem o estágio
 * derivado pelo servidor, e mover à mão um funil automático só produz
 * divergência entre a tela e o banco.
 */
export function podeMoverAMao(lead: { origem: string }): boolean {
  return lead.origem !== "checkout";
}
