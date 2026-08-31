import type { StatusAssinatura } from "./regua";

/**
 * A situação de cobrança de um cliente, em uma palavra e um tom.
 *
 * Mora aqui, e não dentro de uma tela, porque duas telas mostram isto: a lista
 * de clientes e o funil de leads. Enquanto era função local de `clientes`, o
 * funil não tinha como dizer "em atraso" sem reescrever a regra, e duas cópias
 * divergem no dia em que uma delas ganha um caso novo.
 *
 * A decisão que a regra carrega: **ler só o status da assinatura mente durante
 * os seis primeiros dias de atraso**. `statusPelaRegua` mantém a assinatura
 * ATIVA até o sétimo dia de propósito, e é justamente essa a janela em que um
 * telefonema resolve sem atrito. Por isso o atraso da cobrança em aberto mais
 * antiga entra na conta, ao lado do status.
 */
export type TomDaSituacao = "ok" | "atencao" | "alerta" | "neutro";

export type Situacao = { texto: string; tom: TomDaSituacao };

export type EntradaDaSituacao = {
  /** Falso para quem nunca teve mensalidade cadastrada. */
  temAssinatura: boolean;
  status?: StatusAssinatura;
  /** Da cobrança em aberto mais antiga. Zero quando não há nenhuma. */
  diasDeAtraso?: number;
  /** `inicioCobranca` ainda no futuro: existe, aparece, e não cobra. */
  emCortesia?: boolean;
};

export function situacaoDoCliente(entrada: EntradaDaSituacao): Situacao {
  const { temAssinatura, status, diasDeAtraso = 0, emCortesia = false } = entrada;

  // "Sem mensalidade" não é inadimplência: é um cliente que existe e que
  // ninguém cadastrou o valor ainda. Tratar os dois como o mesmo vermelho
  // treinaria o olho a ignorar os dois.
  if (!temAssinatura) return { texto: "sem mensalidade", tom: "neutro" };

  if (status === "CANCELADA") return { texto: "cancelada", tom: "neutro" };
  if (status === "BLOQUEADA") return { texto: "bloqueada", tom: "alerta" };
  if (status === "INADIMPLENTE") return { texto: "inadimplente", tom: "alerta" };

  // Cortesia vem depois dos status negativos: uma assinatura bloqueada dentro
  // da cortesia é contraditória, e nesse caso o bloqueio é o que a pessoa
  // precisa ver.
  if (emCortesia) return { texto: "em cortesia", tom: "neutro" };

  return diasDeAtraso >= 1
    ? { texto: "em atraso", tom: "atencao" }
    : { texto: "em dia", tom: "ok" };
}

/** Classe de cor por tom. Uma única tabela para as duas telas, e nomes de tom
 *  em vez de cores nos chamadores: assim trocar a paleta é um lugar só. */
export const CLASSE_DO_TOM: Record<TomDaSituacao, string> = {
  ok: "text-console-dado",
  atencao: "text-console-aviso",
  alerta: "text-console-campo",
  neutro: "text-console-tinta/45",
};
