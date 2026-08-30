import { resumir } from "./resumo";
import type { Prisma, TipoEvento } from "@prisma/client";

/**
 * O evento cru serve para investigar o mês corrente; a série histórica vive no
 * resumo. Passados 90 dias não dá mais para reconstruir a jornada de uma pessoa
 * específica, só a contagem por dia, tipo e origem. É a troca escolhida contra
 * uma tabela que só cresce.
 */
export const DIAS_DE_EVENTO_CRU = 90;

export function limiteDoExpurgo(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_DE_EVENTO_CRU * 24 * 60 * 60 * 1000);
}

// Derivados do Prisma pelo mesmo motivo de ClienteDeEvento: uma interface
// escrita à mão com assinaturas simplificadas não é satisfeita pelo
// PrismaClient real, cujos métodos são genéricos.
type ClienteDoExpurgo = Pick<
  Prisma.TransactionClient,
  "eventoFunil" | "resumoDiario" | "sessaoFunil"
>;

type Transacional = {
  $transaction<T>(fn: (tx: ClienteDoExpurgo) => Promise<T>): Promise<T>;
};

/**
 * Resume e então apaga, na mesma transação.
 *
 * A ordem é o ponto: apagar antes de resumir perderia o histórico para sempre,
 * e fazer as duas coisas fora de uma transação abriria a janela em que o dia
 * foi apagado e não foi contado. Uma falha no meio desfaz tudo, e a passada de
 * amanhã refaz.
 */
export async function expurgarEventos(
  cliente: Transacional,
  agora: Date
): Promise<{ resumidos: number; apagados: number }> {
  const limite = limiteDoExpurgo(agora);

  return cliente.$transaction(async (tx) => {
    const antigos: {
      tipo: TipoEvento;
      createdAt: Date;
      sessao: { utmSource: string | null } | null;
    }[] = await tx.eventoFunil.findMany({
      where: { createdAt: { lt: limite } },
      select: {
        tipo: true,
        createdAt: true,
        sessao: { select: { utmSource: true } },
      },
    });

    let resumidos = 0;
    let apagados = 0;

    if (antigos.length > 0) {
      const linhas = resumir(
        antigos.map((e) => ({
          tipo: e.tipo,
          createdAt: e.createdAt,
          origem: e.sessao?.utmSource ?? null,
        }))
      );

      for (const linha of linhas) {
        // increment, e não set: o cron rodando duas vezes no mesmo dia soma no
        // lugar de duplicar, e um dia parcialmente resumido numa passada
        // anterior é completado, nunca substituído.
        await tx.resumoDiario.upsert({
          where: {
            dia_tipo_origem: {
              dia: linha.dia,
              tipo: linha.tipo,
              origem: linha.origem,
            },
          },
          create: linha,
          update: { n: { increment: linha.n } },
        });
      }

      const resultado = await tx.eventoFunil.deleteMany({
        where: { createdAt: { lt: limite } },
      });

      resumidos = linhas.length;
      apagados = resultado.count;
    }

    // Fora do if de propósito: a sessão órfã é medida pelo createdAt dela, não
    // pelo dos eventos — as duas checagens são independentes. Amarrar esta
    // faxina à existência de evento velho a desligaria justamente no caso que
    // ela existe para pegar, o visitante que saiu antes de qualquer evento ser
    // registrado (cookie plantado, checkout aberto direto). Sessão de
    // visitante que nunca voltou não precisa viver para sempre — o que ela
    // representa já está no resumo, quando há resumo. Só as que ficaram sem
    // evento, sem lead e sem inscrição: as outras são a costura de alguém que
    // comprou.
    await tx.sessaoFunil.deleteMany({
      where: {
        createdAt: { lt: limite },
        eventos: { none: {} },
        leads: { none: {} },
        inscricoes: { none: {} },
      },
    });

    return { resumidos, apagados };
  });
}
