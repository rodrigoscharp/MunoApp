/**
 * Regras da captura de lead vinda da landing de vendas.
 *
 * Funções puras, sem Prisma e sem HTTP: a rota busca os candidatos e aplica a
 * decisão, e este arquivo só decide.
 */

export const ORIGEM_LANDING = "landing";

/** Reenvio no mesmo dia é a mesma intenção; contato semanas depois é outra. */
export const JANELA_DEDUPE_MS = 24 * 60 * 60 * 1000;

const MIN_DIGITOS = 10; // fixo + DDD
const MAX_DIGITOS = 13; // +55, DDD e nove dígitos

export function normalizarTelefone(bruto: string): string {
  return bruto.replace(/\D/g, "");
}

/**
 * Valida pela contagem de dígitos, e não pelo comprimento do texto:
 * "(11) 99999-9999" tem 15 caracteres e 11 dígitos, enquanto "((((((((((" tem
 * 10 caracteres e nenhum. Medir o texto cru aceitaria o segundo e recusaria
 * formatação legítima.
 */
export function telefoneValido(bruto: string): boolean {
  const digitos = normalizarTelefone(bruto).length;
  return digitos >= MIN_DIGITOS && digitos <= MAX_DIGITOS;
}

export type LeadCandidato = {
  id: string;
  telefone: string | null;
  origem: string;
  createdAt: Date;
};

export type Decisao = { acao: "criar" } | { acao: "atualizar"; id: string };

/**
 * A dedução só considera leads da própria landing. Lead digitado à mão nunca é
 * sobrescrito pelo que a pessoa preencheu no formulário — o nome que você
 * escreveu vale mais que o que ela digitou com pressa no celular.
 */
export function decidirGravacao(
  candidatos: LeadCandidato[],
  telefone: string,
  agora: Date
): Decisao {
  const alvo = normalizarTelefone(telefone);

  const elegiveis = candidatos
    .filter(
      (c) =>
        c.origem === ORIGEM_LANDING &&
        c.telefone !== null &&
        normalizarTelefone(c.telefone) === alvo &&
        agora.getTime() - c.createdAt.getTime() < JANELA_DEDUPE_MS
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const recente = elegiveis[0];
  return recente ? { acao: "atualizar", id: recente.id } : { acao: "criar" };
}
