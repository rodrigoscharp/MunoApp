import type { OrderStatus } from "@/types";

/**
 * As cores do selo de status do pedido, nas três famílias do sistema visual
 * (floresta, folha e pêssego) mais um neutro para o cancelado.
 *
 * Moram num lugar só porque o mesmo pedido aparece na lista de "Meus pedidos"
 * e no topo do chat, e um selo que mudasse de cor entre as duas telas faria
 * o cliente achar que o status mudou. Todo par texto/fundo passa de 4.5:1.
 */
export const SELO_DO_PEDIDO: Record<OrderStatus, string> = {
  // Esperando a loja: pêssego, o tom de "pendente".
  PENDING: "bg-loja-pessego text-[#6A3A1E]",
  // Na mão da cozinha: o terracota claro, com o texto no tom de preço.
  CONFIRMED: "bg-loja-pessego-claro text-loja-preco",
  IN_PREPARATION: "bg-loja-pessego-claro text-loja-preco",
  // Pronto e a caminho: floresta cheio, o selo que mais chama.
  READY: "bg-forest-dark text-white",
  OUT_FOR_DELIVERY: "bg-forest-dark text-white",
  // Fim: folha, como o "Pix pago".
  DELIVERED: "bg-loja-folha text-forest-dark",
  CANCELLED: "bg-[#EFE4D7] text-loja-tinta-2",
};

/** A forma do selo, igual em toda tela: pílula de 26px, texto 11px. */
export const seloBase =
  "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-extrabold";
