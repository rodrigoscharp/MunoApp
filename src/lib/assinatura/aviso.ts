import { AVISO_DIAS, BLOQUEIO_DIAS, diasDeAtraso } from "./regua";

/**
 * O tom da faixa de aviso no /adm, decidido pelo atraso da cobrança em aberto
 * mais antiga — nunca por `assinatura.status`.
 *
 * A distinção não é estilística. Nos seis primeiros dias de atraso o status
 * ainda é ATIVA de propósito (ver statusPelaRegua): atraso curto não marca o
 * cadastro. Uma faixa que lesse o status ficaria muda exatamente na janela em
 * que um empurrãozinho ainda resolve sem atrito, e só apareceria no sétimo dia,
 * quando o cliente já está irritado. O bug seria invisível: a tela renderiza,
 * ela só nunca avisa ninguém.
 *
 * Mora aqui, fora do JSX, porque limiar de cobrança é regra testável e o
 * componente não é.
 */
export type TomDoAviso = "INFORMATIVO" | "FIRME" | "BLOQUEIO";

export interface Aviso {
  tom: TomDoAviso;
  dias: number;
}

/**
 * `vencimentoMaisAntigo` é o vencimento da cobrança em aberto mais antiga
 * (PENDENTE ou VENCIDA), ou null quando não há nenhuma. O relógio é parâmetro
 * pelo mesmo motivo do resto da régua: teste não pode depender do dia em que
 * roda.
 *
 * Devolve null quando não há o que avisar — inclusive no próprio dia do
 * vencimento, que ainda não é atraso.
 */
export function avisoDeAtraso(
  vencimentoMaisAntigo: Date | null,
  agora: Date
): Aviso | null {
  if (!vencimentoMaisAntigo) return null;

  const dias = diasDeAtraso(vencimentoMaisAntigo, agora);
  if (dias < 1) return null;

  // Os limiares são os mesmos da régua, importados e não recopiados: a faixa
  // precisa falar em bloqueio no dia em que o bloqueio de fato acontece.
  if (dias >= BLOQUEIO_DIAS) return { tom: "BLOQUEIO", dias };
  if (dias >= AVISO_DIAS) return { tom: "FIRME", dias };
  return { tom: "INFORMATIVO", dias };
}
