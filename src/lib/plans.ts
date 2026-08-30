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

/**
 * O plano e o ciclo que a página /assinar deve exibir, a partir da query
 * string — `?plano=…&ciclo=…`, montada pelos CTAs da landing.
 *
 * Mora aqui, e não dentro da page, por dois motivos. O primeiro é prático:
 * Server Component assíncrono não se testa com o ferramental dos componentes
 * de cliente, e esta é a parte que precisa de teste — a marcação em volta
 * dela, não. O segundo é que a regra é sobre PREÇO, e preço mora neste
 * arquivo.
 *
 * A REGRA é o fail-closed: link velho compartilhado no WhatsApp, parâmetro
 * cortado por um cliente de e-mail, ou valor de uma versão futura do enum
 * nunca podem quebrar a página — e nunca podem conceder por engano o plano
 * mais caro para quem não pediu. Tudo que não for exatamente reconhecido cai
 * no mais barato, no ciclo mensal.
 */
export function escolhaDaQueryString(params: {
  plano?: string;
  ciclo?: string;
}): { plano: PlanoTenant; ciclo: Ciclo } {
  return {
    plano: params.plano === "MEMBRO_MESA_QR" ? "MEMBRO_MESA_QR" : "MEMBRO",
    ciclo: params.ciclo === "ANUAL" ? "ANUAL" : "MENSAL",
  };
}

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

/**
 * O que cada plano entrega, na ordem em que a landing anuncia.
 *
 * Fonte única pelo mesmo motivo de PRECOS, e com o mesmo teste: a tela de
 * /assinar lista isto ao lado do formulário, e uma segunda cópia divergiria da
 * página de vendas do jeito que 99,99 e 99 divergiram antes de 26/08/2026. A
 * diferença é que preço errado alguém percebe na fatura, e benefício errado
 * vira promessa que o produto não cumpre — descoberta pelo cliente, depois de
 * pagar.
 *
 * `plans.test.ts` confere cada string contra public/vendas/index.html, então
 * mexer aqui sem mexer lá (ou o contrário) quebra o teste. Texto novo precisa
 * casar com o da landing ao pé da letra, ignorada só a quebra de linha.
 *
 * Este arquivo é importado por Client Component (ConverterLead.tsx já importa
 * PRECOS): nada aqui pode puxar Prisma nem nada de servidor.
 */
export const PLANO_BENEFICIOS: Record<PlanoTenant, readonly string[]> = {
  MEMBRO: [
    "Produtos ilimitados",
    "Painel financeiro completo",
    "Suporte prioritário via WhatsApp",
    "Relatórios de venda em tempo real",
    "Link personalizado",
    "Pedidos ilimitados",
  ],
  MEMBRO_MESA_QR: [
    "Tudo do Membro MUNO",
    "QR Code de mesa",
    "Cliente pede e paga direto da mesa",
    "Sem garçom, sem fila, sem erro de anotação",
  ],
};

// Fail-closed: header ausente ou com um valor que este código não reconhece
// vira MEMBRO, nunca a feature paga. Isso cobre tanto uma request que por
// algum motivo não passou pelo proxy quanto uma versão futura do enum que
// este deploy ainda não conhece.
export function planoFromHeaderValue(value: string | null): PlanoTenant {
  if (value === "MEMBRO_MESA_QR") return "MEMBRO_MESA_QR";
  return "MEMBRO";
}
