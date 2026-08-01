"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Store } from "lucide-react";

// Minúsculas: a marca fala assim. O logotipo é "muno", não "MUNO".
const DESTINOS = [
  { href: "/", rotulo: "visão geral", Icone: LayoutGrid },
  { href: "/leads", rotulo: "leads", Icone: Users },
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
            // O campo inteiro já é terracota, então o item ativo se destaca
            // invertendo — papel sobre a cor da marca.
            className={`flex-1 md:flex-none flex flex-col md:flex-row items-center md:gap-3 gap-1 px-3 md:px-4 py-2.5 rounded-full transition ${
              ativo
                ? "bg-console-papel text-console-campo font-semibold"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <Icone size={18} strokeWidth={ativo ? 2.4 : 2} />
            <span className="text-[11px] md:text-[15px]">{rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
