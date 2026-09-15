/**
 * As séries temporais da visão geral do console.
 *
 * Tudo aqui é puro e recebe `agora` por parâmetro, pelo mesmo motivo do
 * platform-metrics: aritmética de data que lê o relógio por dentro não é
 * testável.
 *
 * O calendário é o de São Paulo, e não o do servidor. A Vercel roda em UTC, e
 * um pedido das 22h de terça cairia na quarta. A consulta agregada de pedidos
 * (na página) agrupa com `AT TIME ZONE 'America/Sao_Paulo'`, e as chaves de dia
 * e mês geradas aqui precisam sair do MESMO fuso, senão a série preenche zeros
 * nos dias que o banco chamou por outro nome.
 */

export const FUSO = "America/Sao_Paulo";

const DIA_EM_MS = 24 * 60 * 60 * 1000;

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "2026-09-15", no calendário de São Paulo. */
export function chaveDoDia(d: Date): string {
  // en-CA formata como AAAA-MM-DD, que é a forma que ordena como texto.
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

/** "2026-09", no calendário de São Paulo. */
export function chaveDoMes(d: Date): string {
  return chaveDoDia(d).slice(0, 7);
}

/** As `n` chaves de mês terminando no mês de `agora`, da mais antiga à atual. */
export function ultimosMeses(agora: Date, n: number): string[] {
  const [ano, mes] = chaveDoMes(agora).split("-").map(Number);
  const chaves: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    // Aritmética sobre o par (ano, mês), e não sobre Date: subtrair dias de uma
    // data do dia 31 pula fevereiro.
    const total = ano * 12 + (mes - 1) - i;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    chaves.push(`${a}-${String(m).padStart(2, "0")}`);
  }
  return chaves;
}

/** "set" para "2026-09"; "set/25" quando `comAno`. */
export function rotuloDoMes(chave: string, comAno = false): string {
  const [ano, mes] = chave.split("-");
  const nome = MESES[Number(mes) - 1];
  return comAno ? `${nome}/${ano.slice(2)}` : nome;
}

export type PontoMensal = { chave: string; rotulo: string; valor: number };

export type AssinaturaDaSerie = {
  status: string;
  valorMensal: number | { toString(): string };
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A receita contratada no fim de cada mês.
 *
 * O schema não guarda quando uma assinatura foi cancelada, só que ela está
 * cancelada. O `updatedAt` de uma CANCELADA é a melhor aproximação disponível
 * do dia do cancelamento, e erra para o lado de manter a receita por mais
 * tempo quando alguém edita a linha depois. O ponto do mês atual bate com o
 * `calcularMrr`, que é o número grande ao lado do gráfico.
 */
export function serieDeMrr(
  assinaturas: AssinaturaDaSerie[],
  agora: Date,
  meses = 12
): PontoMensal[] {
  return ultimosMeses(agora, meses).map((chave) => {
    const soma = assinaturas
      .filter((a) => chaveDoMes(a.createdAt) <= chave)
      .filter(
        (a) => !(a.status === "CANCELADA" && chaveDoMes(a.updatedAt) <= chave)
      )
      .reduce((s, a) => s + Number(a.valorMensal.toString()), 0);
    return {
      chave,
      rotulo: rotuloDoMes(chave),
      valor: Math.round(soma * 100) / 100,
    };
  });
}

/** Quantos existiam no fim de cada mês, pela data de criação. */
export function serieAcumulada(
  criacoes: Date[],
  agora: Date,
  meses = 12
): PontoMensal[] {
  const chavesDasCriacoes = criacoes.map(chaveDoMes);
  return ultimosMeses(agora, meses).map((chave) => ({
    chave,
    rotulo: rotuloDoMes(chave),
    valor: chavesDasCriacoes.filter((c) => c <= chave).length,
  }));
}

/** O que foi recebido em cada mês, pela data do pagamento. */
export function recebidoPorMes(
  pagas: { valor: number | { toString(): string }; pagoEm: Date | null }[],
  agora: Date,
  meses = 12
): PontoMensal[] {
  const porMes = new Map<string, number>();
  for (const c of pagas) {
    if (!c.pagoEm) continue;
    const chave = chaveDoMes(c.pagoEm);
    porMes.set(chave, (porMes.get(chave) ?? 0) + Number(c.valor.toString()));
  }
  return ultimosMeses(agora, meses).map((chave) => ({
    chave,
    rotulo: rotuloDoMes(chave),
    valor: Math.round((porMes.get(chave) ?? 0) * 100) / 100,
  }));
}

export type LinhaDiaria = { dia: string; pedidos: number; volume: number };

export type PontoDiario = LinhaDiaria & { rotulo: string };

/**
 * Os últimos `dias` dias, com zero onde o banco não devolveu linha.
 *
 * O GROUP BY só devolve dia que teve pedido. Sem preencher, uma semana parada
 * some do gráfico e as barras dos dois lados ficam coladas, que é exatamente
 * a leitura errada: parece que não houve pausa.
 */
export function preencherDias(
  linhas: LinhaDiaria[],
  agora: Date,
  dias: number
): PontoDiario[] {
  const porDia = new Map(linhas.map((l) => [l.dia, l]));
  const pontos: PontoDiario[] = [];
  // Meio-dia como âncora: a 12h de distância da virada, somar ou subtrair dias
  // inteiros nunca troca o nome do dia por causa de fuso.
  const base = new Date(`${chaveDoDia(agora)}T12:00:00-03:00`);
  for (let i = dias - 1; i >= 0; i--) {
    const dia = chaveDoDia(new Date(base.getTime() - i * DIA_EM_MS));
    const linha = porDia.get(dia);
    const [, mes, d] = dia.split("-");
    pontos.push({
      dia,
      rotulo: `${d}/${mes}`,
      pedidos: linha?.pedidos ?? 0,
      volume: linha?.volume ?? 0,
    });
  }
  return pontos;
}

/** Soma os pontos diários por mês, na ordem em que aparecem. */
export function somarPorMes(pontos: PontoDiario[]): PontoDiario[] {
  const meses: PontoDiario[] = [];
  for (const p of pontos) {
    const chave = p.dia.slice(0, 7);
    const ultimo = meses[meses.length - 1];
    if (ultimo && ultimo.dia === chave) {
      ultimo.pedidos += p.pedidos;
      ultimo.volume = Math.round((ultimo.volume + p.volume) * 100) / 100;
    } else {
      meses.push({
        dia: chave,
        rotulo: rotuloDoMes(chave),
        pedidos: p.pedidos,
        volume: p.volume,
      });
    }
  }
  return meses;
}

/**
 * Variação relativa entre dois períodos.
 *
 * Nula quando o anterior é zero: sair de 0 para 3 não é "+∞%", e mostrar
 * "+300%" por convenção inventaria um número que nada mediu.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}

/** Quantas datas caem em [inicio, fim). */
export function contarEntre(datas: Date[], inicio: Date, fim: Date): number {
  const a = inicio.getTime();
  const b = fim.getTime();
  return datas.filter((d) => d.getTime() >= a && d.getTime() < b).length;
}
