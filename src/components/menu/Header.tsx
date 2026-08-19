"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useCart } from "@/hooks/useCart";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartFlyAnimation } from "@/components/menu/CartFlyAnimation";
import { useState, useEffect, useRef } from "react";
import { ShoppingCart, User, LogOut, Settings, ChefHat, Menu, X, ClipboardList } from "lucide-react";
import type { RestaurantInfo } from "@/lib/restaurant";
import { NotificationBell } from "@/components/menu/NotificationBell";

interface HeaderProps {
  restaurantInfo: RestaurantInfo;
}

export function Header({ restaurantInfo }: HeaderProps) {
  const { data: session } = useSession();

  // Selector direto no valor — Zustand re-renderiza imediatamente ao mudar
  const itemCount = useCart((s) =>
    s.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  const [cartOpen, setCartOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bounce, setBounce] = useState(false);
  const prevCount = useRef(itemCount);

  // Dispara animação de bounce no badge quando a contagem aumenta
  useEffect(() => {
    if (itemCount > prevCount.current) {
      setBounce(true);
      const t = setTimeout(() => setBounce(false), 400);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  return (
    <>
      <CartFlyAnimation />

      <header className="sticky top-8 z-40 bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0 flex items-center gap-3">
            <Image src={restaurantInfo.logoUrl} alt={restaurantInfo.name} width={180} height={68} className="h-10 sm:h-16 w-auto object-contain" loading="eager" fetchPriority="high" unoptimized={restaurantInfo.logoUrl.startsWith("http")} />
            <div className="flex flex-col justify-center leading-tight">
              <span className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">{restaurantInfo.name}</span>
              {/* Sem endereço cadastrado não se mostra o pino sozinho — e desde
                  que o fallback deixou de ser o restaurante do seed, "vazio" é
                  um estado real de tenant recém-criado. */}
              {restaurantInfo.address && (
                <span className="text-[11px] sm:text-xs text-neutral-500 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                  {restaurantInfo.address}
                </span>
              )}
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {session?.user.role === "ADMIN" && (
              <Link href="/adm" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand px-3 py-1.5 rounded-lg hover:bg-brand-light transition">
                <Settings size={14} /> Admin
              </Link>
            )}
            {(session?.user.role === "ADMIN" || session?.user.role === "KITCHEN") && (
              <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand px-3 py-1.5 rounded-lg hover:bg-brand-light transition">
                <ChefHat size={14} /> Cozinha
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {/* Sino de notificações de pedido */}
            {session && <NotificationBell />}

            {/* Cart — id usado pela animação de partícula */}
            <button
              id="cart-btn"
              onClick={() => setCartOpen(true)}
              className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-neutral-100 transition"
              aria-label="Abrir carrinho"
            >
              <ShoppingCart size={20} className="text-neutral-700" />
              {itemCount > 0 && (
                <span
                  key={itemCount}
                  className={`absolute -top-0.5 -right-0.5 bg-brand text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold leading-none ${bounce ? "animate-cart-bounce" : ""}`}
                >
                  {itemCount > 9 ? "9+" : itemCount}
                </span>
              )}
            </button>

            {/* User menu (desktop) */}
            {session ? (
              <div className="relative hidden sm:block">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition text-sm text-neutral-700"
                >
                  <User size={16} />
                  <span className="max-w-24 truncate">{session.user.name}</span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 min-w-44 z-50">
                    <p className="px-4 py-2 text-xs text-neutral-400 border-b border-neutral-100 truncate">
                      {session.user.email}
                    </p>
                    <Link
                      href="/pedidos"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition"
                    >
                      <ClipboardList size={14} /> Meus Pedidos
                    </Link>
                    <button
                      onClick={() => { setUserMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition"
                    >
                      <LogOut size={14} /> Sair
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" className="hidden sm:block text-sm text-neutral-600 hover:text-brand px-3 py-1.5 rounded-lg hover:bg-brand-light transition font-medium">
                Entrar
              </Link>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden flex items-center justify-center w-10 h-10 rounded-full hover:bg-neutral-100 transition"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-neutral-100 bg-white px-4 py-3 space-y-1">
            {session?.user.role === "ADMIN" && (
              <Link href="/adm" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100">
                <Settings size={15} /> Admin
              </Link>
            )}
            {(session?.user.role === "ADMIN" || session?.user.role === "KITCHEN") && (
              <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100">
                <ChefHat size={15} /> Cozinha
              </Link>
            )}
            {session ? (
              <>
                <Link
                  href="/pedidos"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100"
                >
                  <ClipboardList size={15} /> Meus Pedidos
                </Link>
                <button
                  onClick={() => { setMobileMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100"
                >
                  <LogOut size={15} /> Sair ({session.user.name})
                </button>
              </>
            ) : (
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-brand font-medium hover:bg-brand-light">
                Entrar
              </Link>
            )}
          </div>
        )}
      </header>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      {userMenuOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
      )}
    </>
  );
}
