/**
 * As contas puras do dashboard do /adm: que trecho do calendário cada período
 * cobre, contra qual trecho ele se compara, e como os números crus viram o que
 * a tela desenha (variação, mapa de calor, clientes novos e de volta).
 *
 * Nada aqui fala com o banco nem lê o relógio sozinho: `agora` é parâmetro,
 * como em src/lib/faturamento.ts, para o teste não depender do dia em que roda.
 * As consultas moram em src/lib/analytics.ts.
 */

import { diaBRT, inicioDeDiasAtrasBRT, inicioDoDiaBRT, inicioDoMesBRT } from "@/lib/faturamento";

const UM_DIA_MS = 24 * 60 * 60 * 1000;
// Brasília não tem horário de verão desde 2019 (mesma premissa de faturamento.ts).
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export const PERIODOS = ["hoje", "7d", "30d", "mes"] as const;
export type Periodo = (typeof PERIODOS)[number];

export const ROTULO_DO_PERIODO: Record<Periodo, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Mês",
};

/** O padrão da tela, como no mockup aprovado. */
export const PERIODO_PADRAO: Periodo = "7d";

/**
 * O `?periodo=` da URL. Qualquer coisa fora da lista (inclusive repetido, que
 * o Next entrega como array) cai no padrão em vez de quebrar a página.
 */
export function lerPeriodo(valor: string | string[] | undefined): Periodo {
  return typeof valor === "string" && (PERIODOS as readonly string[]).includes(valor)
    ? (valor as Periodo)
    : PERIODO_PADRAO;
}

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

export interface IntervaloDoPeriodo {
  atual: Intervalo;
  /** O trecho de mesmo tamanho imediatamente comparável. */
  anterior: Intervalo;
  /** Como a tela chama o trecho anterior: "ontem até esta hora". */
  rotuloAnterior: string;
  /** Os dias do gráfico de barras, em "YYYY-MM-DD" de Brasília; o último é hoje. */
  diasDaSerie: string[];
}

/**
 * O trecho de cada período, sempre terminando em `agora`.
 *
 * O anterior tem exatamente a mesma duração do atual. Comparar "os 7 dias até
 * agora" (seis dias e meio, porque hoje ainda não acabou) com "os 7 dias
 * fechados anteriores" faria todo período parecer em queda até a meia-noite,
 * e o dono aprenderia a desconfiar da seta. Por isso o anterior é o atual
 * deslocado para trás, e "hoje" se compara com ontem até a mesma hora.
 *
 * O mês se compara com o mesmo trecho do mês passado (1º a 24 de outubro
 * contra 1º a 24 de setembro), cortado no fim do mês passado quando ele é mais
 * curto.
 */
export function intervaloDoPeriodo(periodo: Periodo, agora: Date): IntervaloDoPeriodo {
  const hoje = inicioDoDiaBRT(agora);
  const dias = (inicio: Date, n: number) =>
    Array.from({ length: n }, (_, i) => diaBRT(new Date(inicio.getTime() + i * UM_DIA_MS)));
  const deslocado = (inicio: Date, n: number): Intervalo => ({
    inicio: new Date(inicio.getTime() - n * UM_DIA_MS),
    fim: new Date(agora.getTime() - n * UM_DIA_MS),
  });

  switch (periodo) {
    case "hoje": {
      // O gráfico de "hoje" mostra a semana até hoje: uma barra sozinha não
      // diz nada, e hoje em destaque ao lado dos seis dias anteriores diz.
      const inicioDaSerie = inicioDeDiasAtrasBRT(agora, 6);
      return {
        atual: { inicio: hoje, fim: agora },
        anterior: deslocado(hoje, 1),
        rotuloAnterior: "ontem até esta hora",
        diasDaSerie: dias(inicioDaSerie, 7),
      };
    }
    case "7d":
    case "30d": {
      const n = periodo === "7d" ? 7 : 30;
      const inicio = inicioDeDiasAtrasBRT(agora, n - 1);
      return {
        atual: { inicio, fim: agora },
        anterior: deslocado(inicio, n),
        rotuloAnterior: `nos ${n} dias anteriores`,
        diasDaSerie: dias(inicio, n),
      };
    }
    case "mes": {
      const inicio = inicioDoMesBRT(agora);
      const inicioAnterior = inicioDoMesBRT(new Date(inicio.getTime() - 1));
      const fimAnterior = new Date(
        Math.min(inicioAnterior.getTime() + (agora.getTime() - inicio.getTime()), inicio.getTime())
      );
      const n = Math.round((hoje.getTime() - inicio.getTime()) / UM_DIA_MS) + 1;
      return {
        atual: { inicio, fim: agora },
        anterior: { inicio: inicioAnterior, fim: fimAnterior },
        rotuloAnterior: "no mesmo trecho do mês passado",
        diasDaSerie: dias(inicio, n),
      };
    }
  }
}

export type Sentido = "subiu" | "caiu" | "igual" | "novo";

export interface Variacao {
  sentido: Sentido;
  /** Variação percentual arredondada; nula quando não há base para dividir. */
  pct: number | null;
  /** Diferença absoluta, para quando o percentual engana (cancelados). */
  delta: number;
}

/**
 * Atual contra anterior. Sem base (anterior zero) não existe percentual: "+∞%"
 * não ajuda ninguém, e é "novo" quando surgiu movimento, "igual" quando os dois
 * são zero.
 */
export function compararPeriodos(atual: number, anterior: number): Variacao {
  const delta = atual - anterior;
  if (anterior === 0) {
    return { sentido: atual === 0 ? "igual" : "novo", pct: null, delta };
  }
  const pct = Math.round((delta / anterior) * 100);
  if (pct === 0) return { sentido: "igual", pct: 0, delta };
  return { sentido: pct > 0 ? "subiu" : "caiu", pct, delta };
}

export interface MapaDeCalor {
  /** 7 linhas (domingo a sábado, a ordem do `extract(dow)`), 24 colunas. */
  celulas: number[][];
  maximo: number;
  pico: { diaDaSemana: number; hora: number; pedidos: number } | null;
  /** As horas que a tela desenha, da primeira à última com pedido. */
  horas: number[];
}

// Sem pedido nenhum, a grade mostra o horário comercial típico em vez de 24
// colunas vazias.
const HORAS_PADRAO = { de: 11, ate: 22 };

/**
 * Os baldes de dia da semana por hora, já contados no banco em fuso de
 * Brasília, viram a grade da tela. Linha fora de faixa é descartada em vez de
 * criar coluna nova.
 */
export function montarMapaDeCalor(
  linhas: { diaDaSemana: number; hora: number; pedidos: number }[]
): MapaDeCalor {
  const celulas = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let pico: MapaDeCalor["pico"] = null;
  let de = 24;
  let ate = -1;

  for (const { diaDaSemana, hora, pedidos } of linhas) {
    const d = Number(diaDaSemana);
    const h = Number(hora);
    const n = Number(pedidos);
    if (!Number.isInteger(d) || !Number.isInteger(h) || d < 0 || d > 6 || h < 0 || h > 23 || n <= 0) {
      continue;
    }
    celulas[d][h] += n;
    de = Math.min(de, h);
    ate = Math.max(ate, h);
  }

  let maximo = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (celulas[d][h] > maximo) {
        maximo = celulas[d][h];
        pico = { diaDaSemana: d, hora: h, pedidos: maximo };
      }
    }
  }

  if (ate < 0) {
    de = HORAS_PADRAO.de;
    ate = HORAS_PADRAO.ate;
  }
  const horas = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  return { celulas, maximo, pico, horas };
}

/** O tom da célula: 0 é vazio, 1 a 4 em quartos do máximo. */
export function nivelDoCalor(valor: number, maximo: number): 0 | 1 | 2 | 3 | 4 {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((valor / maximo) * 4))) as 1 | 2 | 3 | 4;
}

export interface Clientes {
  novos: number;
  voltaram: number;
  pedidosDeNovos: number;
  pedidosDeQuemVoltou: number;
}

/**
 * Cada cliente com conta que pediu no período, com a data do primeiro pedido
 * dele na vida da loja: se ela cai dentro do período, é cliente novo.
 * O primeiro pedido vem como texto ISO porque passou pelo cache (JSON).
 */
export function classificarClientes(
  linhas: { primeiroPedido: string; pedidos: number }[],
  inicio: Date
): Clientes {
  const r: Clientes = { novos: 0, voltaram: 0, pedidosDeNovos: 0, pedidosDeQuemVoltou: 0 };
  for (const { primeiroPedido, pedidos } of linhas) {
    const novo = new Date(primeiroPedido).getTime() >= inicio.getTime();
    if (novo) {
      r.novos++;
      r.pedidosDeNovos += Number(pedidos);
    } else {
      r.voltaram++;
      r.pedidosDeQuemVoltou += Number(pedidos);
    }
  }
  return r;
}

/** Hora de Brasília (0 a 23) de um instante. */
export function horaBRT(agora: Date): number {
  return new Date(agora.getTime() - BRT_OFFSET_MS).getUTCHours();
}

export function saudacao(agora: Date): string {
  const h = horaBRT(agora);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "SÁBADO, 25 DE OUTUBRO", no calendário de Brasília. */
export function dataPorExtenso(agora: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(agora)
    .toUpperCase();
}

/** Quanto tempo um pedido espera: "8 min", "2 h 05", "3 dias". */
export function formatarEspera(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

/** "Ana Paula Souza" vira "Ana S.": a tabela é de olhar rápido, não de cadastro. */
export function nomeCurto(nome: string | null | undefined): string | null {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}
