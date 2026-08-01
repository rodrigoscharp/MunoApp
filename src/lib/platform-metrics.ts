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

/**
 * Um lead "aberto" é o que ainda está em jogo. A definição mora aqui, junto do
 * montarPauta que também depende dela — duas cópias divergiriam em silêncio.
 */
export function contarLeadsAbertos(leads: { status: string }[]): number {
  return leads.filter((l) => ABERTOS.has(l.status)).length;
}

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

export type SemanaDoFunil = { semana: string; leads: number };

/** Segunda-feira da semana da data, à meia-noite. */
export function inicioDaSemana(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  // getDay(): 0 é domingo. Recua até a segunda.
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

/**
 * As 8 semanas até hoje, com quantos leads entraram em cada uma.
 *
 * `agora` vem por parâmetro pelo mesmo motivo do montarPauta: aritmética de
 * data que lê o relógio por dentro não é testável.
 */
export function montarSemanas(
  criacoes: Date[],
  agora: Date,
  quantas = 8
): SemanaDoFunil[] {
  const atual = inicioDaSemana(agora);
  const semanas: SemanaDoFunil[] = [];

  for (let i = quantas - 1; i >= 0; i--) {
    const inicio = new Date(atual);
    inicio.setDate(inicio.getDate() - i * 7);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 7);

    semanas.push({
      semana: `${String(inicio.getDate()).padStart(2, "0")}/${String(
        inicio.getMonth() + 1
      ).padStart(2, "0")}`,
      leads: criacoes.filter((c) => c >= inicio && c < fim).length,
    });
  }

  return semanas;
}
