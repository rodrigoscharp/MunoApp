/**
 * Lógica da visão geral do console. Fica aqui, pura, porque é o que dá sentido
 * à tela — e porque a regra dos 5 dias não é testável se a função olhar o
 * relógio por conta própria.
 */

export type LeadDaPauta = {
  status: string;
  tenantId: string | null;
  updatedAt: Date;
};

export type ChaveDaPauta =
  | "sem-leads"
  | "fechado-sem-cliente"
  | "parados"
  | "negociando"
  | "em-dia";

export type ItemDaPauta = { chave: ChaveDaPauta; texto: string };

const ABERTOS = new Set(["NOVO", "CONTATADO", "NEGOCIACAO"]);
const DIAS_SEM_CONTATO = 5;

export function montarPauta(
  leads: LeadDaPauta[],
  agora: Date
): ItemDaPauta[] {
  if (leads.length === 0) {
    return [{ chave: "sem-leads", texto: "Nenhum lead cadastrado ainda." }];
  }

  const itens: ItemDaPauta[] = [];

  // tenantId só é preenchido pela rota de conversão, então FECHADO sem tenant
  // é literalmente "fechei a venda e não criei o restaurante".
  const semCliente = leads.filter(
    (l) => l.status === "FECHADO" && l.tenantId === null
  ).length;
  if (semCliente > 0) {
    itens.push({
      chave: "fechado-sem-cliente",
      texto: `${semCliente} ${semCliente === 1 ? "fechado" : "fechados"} sem cliente criado`,
    });
  }

  const limite = agora.getTime() - DIAS_SEM_CONTATO * 24 * 60 * 60 * 1000;
  const parados = leads.filter(
    (l) => ABERTOS.has(l.status) && l.updatedAt.getTime() < limite
  ).length;
  if (parados > 0) {
    itens.push({
      chave: "parados",
      texto: `${parados} ${parados === 1 ? "lead" : "leads"} sem contato há mais de ${DIAS_SEM_CONTATO} dias`,
    });
  }

  const negociando = leads.filter((l) => l.status === "NEGOCIACAO").length;
  if (negociando > 0) {
    itens.push({ chave: "negociando", texto: `${negociando} em negociação` });
  }

  if (itens.length === 0) {
    return [{ chave: "em-dia", texto: "Tudo em dia." }];
  }
  return itens;
}

export type TenantDoMrr = {
  status: string;
  valorMensal: number | { toString(): string } | null;
};

/** Receita contratada: o que os clientes ativos somam por mês. Não é o que foi recebido. */
export function calcularMrr(tenants: TenantDoMrr[]): number {
  const total = tenants
    .filter((t) => t.status === "active" && t.valorMensal != null)
    .reduce((soma, t) => soma + Number(t.valorMensal!.toString()), 0);

  // Soma de decimais em ponto flutuante: 199.9 + 100.1 dá 300.00000000000006.
  return Math.round(total * 100) / 100;
}
