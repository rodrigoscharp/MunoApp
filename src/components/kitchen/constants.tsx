import { OrderStatus } from "@/types";
import { Bike, ShoppingBag, UtensilsCrossed } from "lucide-react";

/**
 * O tom de cada coluna do quadro. Ele pinta só a faixa do topo da coluna e o
 * contador; o card continua papel em todas, para que o olho leia o pedido, e
 * não a cor da coluna.
 */
export type TomDaColuna = "brasa" | "pessego" | "andamento" | "pronto" | "rua";

export const KITCHEN_COLUMNS: { status: OrderStatus; label: string; tom: TomDaColuna }[] = [
  { status: "PENDING", label: "Novos", tom: "brasa" },
  { status: "CONFIRMED", label: "Confirmados", tom: "pessego" },
  { status: "IN_PREPARATION", label: "Em preparo", tom: "andamento" },
  { status: "READY", label: "Prontos", tom: "pronto" },
  // O pedido em rua fica visível até alguém fechá-lo. Ele some do quadro quando
  // vira DELIVERED — pelo motoboy, no app, ou pela própria cozinha, no botão
  // "Entregue" deste card, que é a única saída para quem entrega sem motoboy
  // cadastrado.
  { status: "OUT_FOR_DELIVERY", label: "Em entrega", tom: "rua" },
];

// As transições saíram daqui para src/lib/kitchen-flow.ts: o último passo
// depende do tipo de entrega, e um Record de status não conseguia expressar
// isso — era o que fazia "Saiu p/ entrega" gravar DELIVERED.

/** Faixa no topo da coluna. */
export const FAIXA_DA_COLUNA: Record<TomDaColuna, string> = {
  brasa: "bg-loja-brasa",
  pessego: "bg-loja-pessego",
  andamento: "bg-[#E08A4F]",
  pronto: "bg-forest",
  rua: "bg-forest-dark",
};

/** Contador ao lado do nome da coluna. Todos acima de 4.5:1. */
export const CONTADOR_DA_COLUNA: Record<TomDaColuna, string> = {
  brasa: "bg-loja-brasa text-white",
  pessego: "bg-loja-pessego text-[#7A3410]",
  andamento: "bg-loja-pessego-claro text-[#8A3A12]",
  pronto: "bg-loja-folha text-forest-dark",
  rua: "bg-forest-dark text-white",
};

export const DELIVERY_TYPE_META = {
  DELIVERY: { label: "Entrega", icon: Bike },
  PICKUP: { label: "Retirada", icon: ShoppingBag },
  DINE_IN: { label: "Mesa", icon: UtensilsCrossed },
} as const;

/** O texto do botão principal do card, conforme a etapa e o tipo de entrega. */
export function rotuloDaAcao(status: OrderStatus, deliveryType: string): string {
  switch (status) {
    case "PENDING":
      return "Confirmar";
    case "CONFIRMED":
      return "Começar preparo";
    case "IN_PREPARATION":
      return "Marcar pronto";
    case "READY":
      return deliveryType === "DELIVERY"
        ? "Saiu p/ entrega"
        : deliveryType === "DINE_IN"
        ? "Servido"
        : "Retirado";
    case "OUT_FOR_DELIVERY":
      return "Entregue";
    default:
      return "Avançar";
  }
}
