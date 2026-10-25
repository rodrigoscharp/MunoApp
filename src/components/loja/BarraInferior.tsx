"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useId, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { useAnimacaoAoMudar } from "@/hooks/useAnimacaoAoMudar";
import { ALVO_DA_SACOLA, useSacola } from "@/components/loja/sacola";
import { ItensDaConta } from "@/components/loja/ItensDaConta";

/**
 * A barra de baixo do celular: Início, Cardápio, a Sacola elevada no meio,
 * Pedidos e Perfil. Só abaixo de `md`; no desktop o cabeçalho tem tudo isso.
 *
 * Fica de fora do checkout e da página da sacola, que têm o próprio botão no
 * rodapé: duas barras fixas brigariam pelo mesmo canto da tela.
 */
const SEM_BARRA = ["/checkout", "/cart"];

/** O id da âncora das categorias (ver CategoryNav). */
export const ANCORA_DO_CARDAPIO = "cardapio";

function rolarAte(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

const itemBase =
  "flex h-[52px] w-[60px] flex-col items-center justify-center gap-[3px] rounded-[18px] text-[10.5px] transition";
const itemAtivo = "bg-loja-brasa font-bold text-white";
const itemInativo = "font-semibold text-loja-tinta-2 hover:text-loja-tinta";

function Icone({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function BarraInferior() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  const itemCount = useCart((s) => s.items.reduce((sum, item) => sum + item.quantity, 0));
  const abrirSacola = useSacola((s) => s.abrir);
  const prepararSacola = useSacola((s) => s.preparar);
  const bounceKey = useAnimacaoAoMudar(itemCount, { apenasAoCrescer: true });
  const [contaAberta, setContaAberta] = useState(false);
  const tituloDaConta = useId();

  useEffect(() => {
    if (!contaAberta) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setContaAberta(false);
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [contaAberta]);

  if (SEM_BARRA.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const naInicio = pathname === "/";
  const emPedidos = pathname === "/pedidos" || pathname.startsWith("/pedidos/");
  const noLogin = pathname === "/login" || pathname === "/register";

  const rotuloDaSacola =
    itemCount > 0 ? `Sacola, ${itemCount} ${itemCount === 1 ? "item" : "itens"}` : "Sacola vazia";

  return (
    <>
      {/* Espaço no fim da página para o último conteúdo (o rodapé) não ficar
          por baixo da barra. */}
      <div aria-hidden="true" className="h-[calc(6rem+env(safe-area-inset-bottom))] md:hidden" />

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex h-[66px] items-center justify-between rounded-[26px] bg-loja-papel px-2 shadow-loja-alta md:hidden"
      >
        <Link
          href="/"
          aria-current={naInicio ? "page" : undefined}
          onClick={(e) => {
            if (naInicio) {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          className={`${itemBase} ${naInicio ? itemAtivo : itemInativo}`}
        >
          <Icone>
            <path d="M4 10.5L12 4l8 6.5V20h-5v-6h-6v6H4z" />
          </Icone>
          Início
        </Link>

        <Link
          href={`/#${ANCORA_DO_CARDAPIO}`}
          onClick={(e) => {
            if (naInicio && rolarAte(ANCORA_DO_CARDAPIO)) e.preventDefault();
          }}
          className={`${itemBase} ${itemInativo}`}
        >
          <Icone>
            <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
          </Icone>
          Cardápio
        </Link>

        <button
          type="button"
          {...{ [ALVO_DA_SACOLA]: "" }}
          onPointerDown={prepararSacola}
          onFocus={prepararSacola}
          onClick={abrirSacola}
          aria-label={rotuloDaSacola}
          className="relative -mt-[26px] flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-[0_0_0_5px_var(--color-loja-creme),0_14px_22px_-8px_rgba(191,83,33,0.6)] transition active:scale-95"
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8h14l-1.2 12H6.2z" />
            <path d="M9 8a3 3 0 0 1 6 0" />
          </svg>
          {itemCount > 0 && (
            <span
              key={bounceKey}
              aria-hidden="true"
              data-testid="contagem-da-sacola"
              className={`absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-forest-dark px-1 text-[11px] font-extrabold leading-none text-white shadow-[0_0_0_2px_var(--color-loja-creme)] ${bounceKey > 0 ? "animate-cart-bounce" : ""}`}
            >
              {itemCount > 9 ? "9+" : itemCount}
            </span>
          )}
        </button>

        <Link
          href="/pedidos"
          aria-current={emPedidos ? "page" : undefined}
          className={`${itemBase} ${emPedidos ? itemAtivo : itemInativo}`}
        >
          <Icone>
            <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
            <path d="M9 8h6M9 12h6" />
          </Icone>
          Pedidos
        </Link>

        {session ? (
          <button
            type="button"
            onClick={() => setContaAberta(true)}
            aria-haspopup="dialog"
            aria-expanded={contaAberta}
            className={`${itemBase} ${contaAberta ? itemAtivo : itemInativo}`}
          >
            <Icone>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </Icone>
            Perfil
          </button>
        ) : (
          <Link
            href="/login"
            aria-current={noLogin ? "page" : undefined}
            className={`${itemBase} ${noLogin ? itemAtivo : itemInativo}`}
          >
            <Icone>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </Icone>
            Perfil
          </Link>
        )}
      </nav>

      {session && contaAberta && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden" onClick={() => setContaAberta(false)}>
          <div aria-hidden="true" className="absolute inset-0 bg-loja-tinta/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloDaConta}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full rounded-t-[28px] bg-loja-papel px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-loja-alta"
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-loja-linha" />
            <h2 id={tituloDaConta} className="sr-only">
              Sua conta
            </h2>
            <ItensDaConta session={session} aoEscolher={() => setContaAberta(false)} />
          </div>
        </div>
      )}
    </>
  );
}
