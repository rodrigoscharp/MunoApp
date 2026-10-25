"use client";

import { GavetaDaSacola } from "@/components/cart/GavetaDaSacola";

interface MesaCartDrawerProps {
  open: boolean;
  onClose: () => void;
  token: string;
}

export function MesaCartDrawer({ open, onClose, token }: MesaCartDrawerProps) {
  return (
    <GavetaDaSacola
      open={open}
      onClose={onClose}
      hrefDoPedido={`/mesa/${token}/checkout`}
      nota="O pedido entra na conta da mesa, e o pagamento é no balcão, ao final."
    />
  );
}
