"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Store, TrendingUp } from "lucide-react";

// Minúsculas: a marca fala assim. O logotipo é "muno", não "MUNO".
//
// Conversão fica depois de leads porque é a leitura de cima do mesmo assunto:
// leads é a lista, conversão é o que ela virou.
const DESTINOS = [
  { href: "/", rotulo: "visão geral", Icone: LayoutGrid },
  { href: "/leads", rotulo: "leads", Icone: Users },
  { href: "/conversao", rotulo: "conversão", Icone: TrendingUp },
  { href: "/clientes", rotulo: "clientes", Icone: Store },
] as const;

export function MenuLateral() {
  const pathname = usePathname();

  // O proxy reescreve admin.<root>/x para /platform/x, então o pathname que
  // chega aqui já vem prefixado.
  const atual = pathname.replace(/^\/platform/, "") || "/";

  return (
    <nav className="flex md:flex-col gap-1">
      {DESTINOS.map(({ href, rotulo, Icone }) => {
        const ativo = href === "/" ? atual === "/" : atual.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            // O item ativo é marcado por uma barra, não por inversão de cor.
            // A barra é terracota porque no sistema daqui terracota é ação e
            // verde é dado — navegar é ação. Verde aqui competiria com os
            // números da tela, que são o que a pessoa veio ver.
            className={`relative flex-1 md:flex-none flex flex-col md:flex-row items-center md:gap-3 gap-1 px-3 md:px-4 py-2.5 md:rounded-xl transition ${
              ativo
                ? "md:bg-console-campo/8 text-console-campo font-semibold"
                : "text-console-tinta/55 hover:text-console-tinta hover:md:bg-console-tinta/4"
            }`}
          >
            {ativo && (
              <span
                aria-hidden
                className="absolute md:left-0 md:top-1/2 md:-translate-y-1/2 md:h-5 md:w-[3px] md:rounded-r bg-console-campo left-1/2 -translate-x-1/2 md:translate-x-0 top-0 h-[3px] w-8 rounded-b md:rounded-b-none"
              />
            )}
            <Icone size={18} strokeWidth={ativo ? 2.4 : 2} />
            <span className="text-[11px] md:text-[15px]">{rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
