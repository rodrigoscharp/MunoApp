/**
 * As contas da tela de conversão.
 *
 * Puras, sem Prisma e sem HTTP, como platform-metrics.ts e lead-landing.ts: a
 * página busca, estas funções decidem. É o que torna a regra testável sem
 * banco, e é o que evita que dois lugares calculem "conversão" de jeitos
 * diferentes sem ninguém perceber.
 *
 * Uma decisão atravessa o arquivo inteiro: **taxa sobre denominador zero é
 * `null`, nunca 0**. Zero afirma que ninguém converteu; null diz que não há o
 * que dividir. A diferença aparece na primeira semana de uma campanha nova,
 * exatamente quando a leitura errada custa uma decisão de orçamento.
 */

/** Virou cliente = existe restaurante ligado ao lead. É o que a conversão da
 *  rota de checkout e a da conversão manual gravam, e o único sinal que não
 *  depende de alguém ter movido um status à mão. */
export type LeadDaConversao = {
  origem: string;
  tenantId: string | null;
  createdAt: Date;
  /** createdAt do tenant, quando existe. Nulo para lead ainda em aberto. */
  fechadoEm: Date | null;
};

export type LinhaDeConversao = {
  rotulo: string;
  leads: number;
  clientes: number;
  taxa: number | null;
};

function linha(rotulo: string, leads: LeadDaConversao[]): LinhaDeConversao {
  const clientes = leads.filter((l) => l.tenantId !== null).length;
  return {
    rotulo,
    leads: leads.length,
    clientes,
    taxa: leads.length === 0 ? null : clientes / leads.length,
  };
}

export function taxaDeConversao(leads: LeadDaConversao[]): LinhaDeConversao {
  return linha("total", leads);
}

/**
 * A mesma taxa, recortada por onde o lead nasceu.
 *
 * É o recorte que muda decisão: o lead que veio do checkout já demonstrou
 * intenção de pagar, e o que veio do formulário de WhatsApp ainda está
 * perguntando. Misturar os dois produz uma taxa média que não descreve
 * nenhum dos dois.
 */
export function conversaoPorOrigem(leads: LeadDaConversao[]): LinhaDeConversao[] {
  const porOrigem = new Map<string, LeadDaConversao[]>();
  for (const lead of leads) {
    const chave = lead.origem || "manual";
    porOrigem.set(chave, [...(porOrigem.get(chave) ?? []), lead]);
  }

  return [...porOrigem.entries()]
    .map(([origem, doGrupo]) => linha(origem, doGrupo))
    .sort((a, b) => b.leads - a.leads);
}

export type LinhaDeCoorte = LinhaDeConversao & { chave: string };

/** Mês de uma data, no fuso local, como "2026-08". */
function mesDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Dos leads que entraram em cada mês, quantos viraram cliente até hoje.
 *
 * Coorte, e não "clientes criados no mês": a segunda pergunta credita a
 * conversão ao mês do fechamento, e com isso um mês de captação fraca com
 * fechamento tardio aparece como mês bom. A coorte segue a turma que entrou
 * junto, que é o que responde "aquele investimento valeu".
 *
 * Os meses mais recentes são naturalmente pessimistas, porque parte da turma
 * ainda não teve tempo de fechar. Isso é honesto e a tela precisa dizer.
 */
export function coorteMensal(
  leads: LeadDaConversao[],
  agora: Date,
  meses = 6
): LinhaDeCoorte[] {
  const linhas: LinhaDeCoorte[] = [];

  for (let i = meses - 1; i >= 0; i--) {
    const alvo = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const chave = mesDe(alvo);
    const doMes = leads.filter((l) => mesDe(l.createdAt) === chave);
    linhas.push({
      ...linha(
        `${String(alvo.getMonth() + 1).padStart(2, "0")}/${alvo.getFullYear()}`,
        doMes
      ),
      chave,
    });
  }

  return linhas;
}

/**
 * Mediana de dias entre o lead entrar e o restaurante nascer.
 *
 * Mediana e não média: um único lead que dormiu seis meses e fechou puxa a
 * média para um número que não descreve nenhum negócio real. Com poucos
 * dados, que é o caso hoje, a diferença entre as duas é enorme.
 */
export function medianaDeDiasAteFechar(leads: LeadDaConversao[]): number | null {
  const dias = leads
    .filter((l) => l.fechadoEm !== null)
    .map((l) => (l.fechadoEm!.getTime() - l.createdAt.getTime()) / 86400000)
    // Relógio torto, importação de dado antigo, fuso: qualquer um produz
    // duração negativa, e uma mediana negativa afirmaria que o cliente nasceu
    // antes do lead existir.
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);

  if (dias.length === 0) return null;

  const meio = Math.floor(dias.length / 2);
  const mediana =
    dias.length % 2 === 0 ? (dias[meio - 1] + dias[meio]) / 2 : dias[meio];

  return Math.round(mediana * 10) / 10;
}

export type Degrau = {
  chave: string;
  rotulo: string;
  n: number;
  /** Quantos do degrau anterior chegaram aqui. Nulo no primeiro e quando o
   *  degrau anterior está zerado. */
  doAnterior: number | null;
};

/**
 * A escada da visita ao restaurante no ar.
 *
 * A ordem é fixa e declarada aqui, não inferida da contagem: um degrau que
 * ainda não aconteceu precisa aparecer com zero, e não sumir. Degrau que some
 * faz a escada parecer completa quando ela está furada.
 */
const ESCADA = [
  ["VISITA", "chegou na página"],
  ["VIU_PRECO", "chegou no preço"],
  ["CLICOU_ASSINAR", "clicou em assinar"],
  ["CHECKOUT_CRIADO", "iniciou o checkout"],
  ["PAGOU", "pagou"],
  ["PROVISIONADO", "restaurante no ar"],
] as const;

export function degrausDoFunil(contagens: Record<string, number>): Degrau[] {
  return ESCADA.map(([chave, rotulo], i) => {
    const n = contagens[chave] ?? 0;
    const anterior = i === 0 ? null : (contagens[ESCADA[i - 1][0]] ?? 0);
    return {
      chave,
      rotulo,
      n,
      doAnterior: anterior === null || anterior === 0 ? null : n / anterior,
    };
  });
}

/** "12,5%" ou "sem dado". Formatar aqui, e não na tela, mantém as duas
 *  telas que um dia mostrarem a mesma taxa dizendo a mesma coisa. */
export function formatarTaxa(taxa: number | null): string {
  if (taxa === null) return "sem dado";
  return `${(taxa * 100).toFixed(1).replace(".", ",")}%`;
}
