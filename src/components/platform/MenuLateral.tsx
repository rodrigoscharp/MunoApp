"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Store } from "lucide-react";

const DESTINOS = [
  { href: "/", rotulo: "Visão geral", Icone: LayoutGrid },
  { href: "/leads", rotulo: "Leads", Icone: Users },
  { href: "/clientes", rotulo: "Clientes", Icone: Store },
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
            className={`flex-1 md:flex-none flex flex-col md:flex-row items-center md:gap-3 gap-1 px-3 py-2.5 rounded-lg text-sm transition ${
              ativo
                ? "bg-brand text-white font-semibold"
                : "text-white/60 hover:text-white hover:bg-console-verde-esc"
            }`}
          >
            <Icone size={17} />
            <span className="text-[11px] md:text-sm">{rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
