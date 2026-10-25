"use client";

import { useState } from "react";
import { useCart } from "@/hooks/useCart";
import { CartUpsell } from "@/components/cart/CartUpsell";
import { GavetaDaSacola } from "@/components/cart/GavetaDaSacola";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const items = useCart((s) => s.items);
  // O upsell busca o cardápio inteiro em /api/menu ao montar. Montado sempre,
  // ele fazia essa busca em toda visita, inclusive de quem nunca abriu o
  // carrinho. Agora nasce na primeira abertura com item e fica montado: fechar
  // e reabrir não busca de novo (ele mesmo some quando o carrinho esvazia).
  const [upsellAtivo, setUpsellAtivo] = useState(false);
  if (open && items.length > 0 && !upsellAtivo) setUpsellAtivo(true);

  return (
    <GavetaDaSacola
      open={open}
      onClose={onClose}
      hrefDoPedido="/checkout"
      nota="Entrega, cupom e pagamento você escolhe no próximo passo."
      sugestoes={upsellAtivo && <CartUpsell className="pt-4" />}
    />
  );
}
