"use client";

import { useEffect, useRef, useState } from "react";
import { IconeDaCategoria } from "@/components/loja/IconeDaCategoria";
import { iconeDaCategoria } from "@/lib/loja/icone-da-categoria";

interface Category {
  id: string;
  name: string;
  slug: string;
}

/** Âncora para "Cardápio" da barra de baixo (ver BarraInferior). */
const ANCORA = "cardapio";
/** Mesmo id da seção em MaisPedidos.tsx. */
const ANCORA_TOP = "mais-pedidos";

/**
 * Quanto do topo da tela fica coberto pelo que gruda: a própria navegação e o
 * que estiver acima dela. Medido, e não fixo, porque o cabeçalho é fixo no
 * desktop e rola no celular, e a mesa tem o próprio cabeçalho.
 */
function alturaCoberta(nav: HTMLElement | null): number {
  if (!nav) return 0;
  const topo = parseFloat(getComputedStyle(nav).top) || 0;
  return topo + nav.getBoundingClientRect().height;
}

export function CategoryNav({
  categories,
  comMaisPedidos = false,
  className = "top-0 md:top-20",
}: {
  categories: Category[];
  /** Acrescenta o bloco "Top", que leva à fileira de mais pedidos. */
  comMaisPedidos?: boolean;
  /**
   * Onde a navegação gruda. O padrão é o da loja: no topo no celular (o
   * cabeçalho rola) e abaixo do cabeçalho de h-20 no desktop.
   */
  className?: string;
}) {
  const blocos = [
    ...(comMaisPedidos ? [{ id: ANCORA_TOP, name: "Top", slug: ANCORA_TOP, top: true }] : []),
    ...categories.map((c) => ({ ...c, top: false })),
  ];
  const [active, setActive] = useState(blocos[0]?.slug);
  const navRef = useRef<HTMLElement>(null);
  const trilhoRef = useRef<HTMLDivElement>(null);
  const slugs = blocos.map((b) => b.slug).join("|");

  useEffect(() => {
    const coberto = Math.round(alturaCoberta(navRef.current));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: `-${coberto + 8}px 0px -60% 0px` }
    );

    slugs.split("|").forEach((slug) => {
      const el = slug && document.getElementById(slug);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [slugs]);

  // O bloco ativo entra na faixa quando a página rola para uma seção que
  // estava fora dela. Rola só o trilho, nunca a página.
  useEffect(() => {
    const trilho = trilhoRef.current;
    const bloco = trilho?.querySelector<HTMLElement>(`[data-slug="${active}"]`);
    if (!trilho || !bloco) return;
    const esquerda = bloco.offsetLeft - trilho.offsetLeft;
    const fora = esquerda < trilho.scrollLeft || esquerda + bloco.offsetWidth > trilho.scrollLeft + trilho.clientWidth;
    if (fora) trilho.scrollTo({ left: Math.max(0, esquerda - 16), behavior: "smooth" });
  }, [active]);

  function scrollTo(slug: string) {
    const el = document.getElementById(slug);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - alturaCoberta(navRef.current) - 8;
    window.scrollTo({ top, behavior: "smooth" });
    setActive(slug);
  }

  return (
    <>
      <div id={ANCORA} aria-hidden="true" />
      <nav
        ref={navRef}
        aria-label="Categorias"
        className={`sticky z-30 bg-loja-creme/95 backdrop-blur ${className}`}
      >
        <div
          ref={trilhoRef}
          className="no-scrollbar mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-2.5"
        >
          {blocos.map((bloco) => {
            const ativo = active === bloco.slug;
            return (
              <button
                key={bloco.id}
                type="button"
                data-slug={bloco.slug}
                onClick={() => scrollTo(bloco.slug)}
                aria-current={ativo ? "location" : undefined}
                className={`flex h-[64px] min-w-[68px] max-w-[96px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] bg-loja-papel px-2 text-[11px] leading-tight transition ${
                  ativo
                    ? "border-[#F0C3A6] font-bold text-loja-preco"
                    : "border-transparent font-semibold text-loja-tinta-2 shadow-loja hover:text-loja-tinta"
                }`}
              >
                {bloco.top ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-[22px] w-[22px] text-brand">
                    <path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
                  </svg>
                ) : (
                  <IconeDaCategoria
                    icone={iconeDaCategoria(bloco.name)}
                    className={`h-[22px] w-[22px] ${ativo ? "text-brand" : "text-forest"}`}
                  />
                )}
                <span className="w-full truncate text-center">{bloco.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
