import type { PlanoTenant } from "@prisma/client";

// Header setado pelo proxy.ts junto com x-tenant-id, pra quem precisa saber
// o plano do tenant sem fazer outra query (Server Components e Route
// Handlers já recebem o tenant resolvido pelo subdomínio).
export const TENANT_PLANO_HEADER = "x-tenant-plano";

// Único ponto de verdade sobre o que cada plano libera. Se um terceiro plano
// aparecer, a lista de planos que têm a feature muda aqui, não em cada rota.
export function tenantTemMesaQr(plano: PlanoTenant): boolean {
  return plano === "MEMBRO_MESA_QR";
}

export type Ciclo = "MENSAL" | "ANUAL";

// O preço de cada plano, em centavos e num lugar só.
//
// Centavos inteiros, e não reais em ponto flutuante: 119.99 não existe em
// binário, e somar doze deles para montar o anual devolve um valor que não é o
// que ninguém combinou. Dinheiro é contagem, não medida.
//
// Esta tabela é a fonte única — a página de vendas em public/vendas/index.html
// e a sugestão de mensalidade do CRM saem daqui, e src/lib/plans.test.ts falha
// se a página anunciar um valor que não está nesta tabela. Antes de 26/08/2026
// os dois viviam em repositórios diferentes e já divergiam: a página dizia
// 99,99 e o CRM sugeria 99.
//
// O anual é onze mensalidades, não doze: um mês grátis é o incentivo para se
// comprometer com o período, e é essa mesma conta que o reembolso
// proporcional desfaz quando alguém sai antes do fim.
export const PRECOS: Record<
  PlanoTenant,
  { mensalCentavos: number; anualCentavos: number }
> = {
  MEMBRO: { mensalCentavos: 11999, anualCentavos: 11999 * 11 },
  MEMBRO_MESA_QR: { mensalCentavos: 14999, anualCentavos: 14999 * 11 },
};

/** O preço do plano no ciclo pedido — o ponto único que decide entre mensal e anual. */
export function precoDoCiclo(plano: PlanoTenant, ciclo: Ciclo): number {
  return ciclo === "ANUAL"
    ? PRECOS[plano].anualCentavos
    : PRECOS[plano].mensalCentavos;
}

const BRL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Centavos para o texto que aparece na tela: 9999 -> "99,99". Sem "R$". */
export function formatarBRL(centavos: number): string {
  return BRL.format(centavos / 100);
}

export const PLANO_LABELS: Record<PlanoTenant, string> = {
  MEMBRO: "Membro",
  MEMBRO_MESA_QR: "Membro + Mesas QR",
};

// Fail-closed: header ausente ou com um valor que este código não reconhece
// vira MEMBRO, nunca a feature paga. Isso cobre tanto uma request que por
// algum motivo não passou pelo proxy quanto uma versão futura do enum que
// este deploy ainda não conhece.
export function planoFromHeaderValue(value: string | null): PlanoTenant {
  if (value === "MEMBRO_MESA_QR") return "MEMBRO_MESA_QR";
  return "MEMBRO";
}
