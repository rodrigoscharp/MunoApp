"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ShoppingBag, User, ChevronDown } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { CartFlyAnimation } from "@/components/menu/CartFlyAnimation";
import type { RestaurantInfo } from "@/lib/restaurant";
import { useAnimacaoAoMudar } from "@/hooks/useAnimacaoAoMudar";
import { MontadorDaSacola } from "@/components/loja/MontadorDaSacola";
import { ItensDaConta } from "@/components/loja/ItensDaConta";
import { ALVO_DA_SACOLA, useSacola } from "@/components/loja/sacola";
import { botaoBrasa } from "@/components/loja/estilos";
import { MarcaDoRestaurante } from "@/components/loja/MarcaDoRestaurante";

// O sino só aparece com sessão, e ele traz o supabase-js junto
// (useOrderNotifications importa o cliente do Realtime). Importado direto, o
// visitante anônimo, que é a maioria, baixava a biblioteca sem usar.
const NotificationBell = dynamic(
  () => import("@/components/menu/NotificationBell").then((m) => m.NotificationBell),
  { ssr: false }
);

interface HeaderProps {
  restaurantInfo: RestaurantInfo;
  /** Lido no servidor pelo layout (checkIsOpen), no fuso de Brasília. */
  aberto: boolean;
  /** Minutos configurados no painel. */
  tempoDeEntrega: number;
}

export function Header({ restaurantInfo, aberto, tempoDeEntrega }: HeaderProps) {
  const { data: session } = useSession();

  const itemCount = useCart((s) => s.items.reduce((sum, item) => sum + item.quantity, 0));
  const abrirSacola = useSacola((s) => s.abrir);
  const prepararSacola = useSacola((s) => s.preparar);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Remontar o badge reinicia a animação do CSS (ver useAnimacaoAoMudar).
  const bounceKey = useAnimacaoAoMudar(itemCount, { apenasAoCrescer: true });

  useEffect(() => {
    if (!userMenuOpen) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setUserMenuOpen(false);
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [userMenuOpen]);

  return (
    <>
      <CartFlyAnimation />
      <MontadorDaSacola />

      {/* Fixo só no desktop, e com altura fixa (h-20): é dela que sai o
          top-20 da navegação de categorias, que gruda logo abaixo. No celular
          o topo rola junto e a navegação gruda no top-0, sem nunca ficar por
          baixo do cabeçalho. */}
      <header className="z-40 bg-loja-creme md:sticky md:top-0 md:h-20 md:border-b md:border-loja-linha md:bg-loja-creme/95 md:backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4 px-4 pb-1 pt-5 md:h-full md:items-center md:py-0">
          <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:gap-5">
            <Link href="/" aria-label={`${restaurantInfo.name || "Cardápio"}, início`} className="min-w-0 shrink-0">
              <MarcaDoRestaurante info={restaurantInfo} prioridade />
            </Link>
            <div className="flex min-w-0 flex-col gap-1 md:gap-0.5">
              {restaurantInfo.slogan && (
                <p className="truncate text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-forest-dark">
                  {restaurantInfo.slogan}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-xs font-semibold text-loja-tinta-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${aberto ? "bg-forest" : "bg-loja-tinta-2/50"}`}
                />
                {aberto ? (
                  <span>
                    <span className="font-extrabold text-forest-dark">Aberto</span> · entrega em {tempoDeEntrega} min
                  </span>
                ) : (
                  <span className="font-extrabold">Fechado agora</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {session && <NotificationBell />}

            {session ? (
              <div className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  className="flex h-11 items-center gap-2 rounded-full bg-loja-papel px-4 text-sm font-semibold text-loja-tinta shadow-loja transition hover:bg-white"
                >
                  <User size={17} aria-hidden="true" className="text-forest" />
                  <span className="max-w-28 truncate">{session.user.name || "Minha conta"}</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 min-w-56 rounded-[20px] bg-loja-papel p-2 shadow-loja-alta">
                    <ItensDaConta session={session} aoEscolher={() => setUserMenuOpen(false)} />
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden h-11 items-center rounded-full px-4 text-sm font-bold text-loja-preco transition hover:bg-loja-pessego-claro md:inline-flex"
              >
                Entrar
              </Link>
            )}

            {/* A sacola do desktop. No celular quem a abre é o botão do meio da
                barra de baixo (BarraInferior); os dois levam o atributo que a
                partícula procura, e só um deles está visível. */}
            <button
              type="button"
              {...{ [ALVO_DA_SACOLA]: "" }}
              onPointerEnter={prepararSacola}
              onFocus={prepararSacola}
              onClick={abrirSacola}
              aria-label={itemCount > 0 ? `Abrir sacola, ${itemCount} ${itemCount === 1 ? "item" : "itens"}` : "Abrir sacola"}
              className={`${botaoBrasa} relative hidden h-11 px-4 text-sm md:inline-flex`}
            >
              <ShoppingBag size={18} aria-hidden="true" />
              Sacola
              {itemCount > 0 && (
                <span
                  key={bounceKey}
                  className={`flex h-6 min-w-6 items-center justify-center rounded-full bg-forest-dark px-1.5 text-xs font-extrabold leading-none ${bounceKey > 0 ? "animate-cart-bounce" : ""}`}
                >
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {userMenuOpen && (
        <div aria-hidden="true" className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
      )}
    </>
  );
}
