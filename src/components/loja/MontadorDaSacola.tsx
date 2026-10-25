"use client";

import dynamic from "next/dynamic";
import { useSacola } from "@/components/loja/sacola";

// A gaveta fica fora do bundle do cardápio (ver `montada` em sacola.ts).
const CartDrawer = dynamic(
  () => import("@/components/cart/CartDrawer").then((m) => m.CartDrawer),
  { ssr: false }
);

/** Monta a única gaveta da sacola da loja quando alguém a pede; os botões a abrem por useSacola. */
export function MontadorDaSacola() {
  const montada = useSacola((s) => s.montada);
  const aberta = useSacola((s) => s.aberta);
  const fechar = useSacola((s) => s.fechar);
  if (!montada) return null;
  return <CartDrawer open={aberta} onClose={fechar} />;
}
