"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useMemo, useState } from "react";
import {
  BarChart2,
  UtensilsCrossed,
  ShoppingBag,
  LogOut,
  Store,
  Menu,
  X,
  ChevronRight,
  Bike,
  TableProperties,
  MessageSquare,
  CreditCard,
  Receipt,
  ExternalLink,
} from "lucide-react";

// Função pura (não um valor fixo) porque "Mesas (QR)" só entra no grupo
// "Restaurante" para quem tem o plano — sem o plano, o item nem existe na
// lista, não fica escondido/desabilitado.
function buildNavGroups(temMesaQr: boolean) {
  return [
    {
      label: "Resultados",
      items: [
        { href: "/adm",        label: "Dashboard", icon: BarChart2,       exact: true  },
        { href: "/adm/orders", label: "Pedidos",   icon: ShoppingBag,     exact: false },
        { href: "/adm/chats",  label: "Chats",     icon: MessageSquare,   exact: false },
      ],
    },
    {
      label: "Restaurante",
      items: [
        { href: "/adm/restaurante", label: "Gerenciamento", icon: Store,           exact: false },
        { href: "/adm/menu",        label: "Cardápio",      icon: UtensilsCrossed, exact: false },
        { href: "/adm/motoboys",    label: "Motoboys",      icon: Bike,            exact: false },
        ...(temMesaQr
          ? [{ href: "/adm/mesas", label: "Mesas (QR)", icon: TableProperties, exact: false }]
          : []),
        { href: "/adm/pagamentos",  label: "Pagamentos",    icon: CreditCard,      exact: false },
        // Sem esta entrada a tela da mensalidade só existiria depois do atraso,
        // pela faixa de aviso ou pelo redirecionamento do bloqueio. Quem está em
        // dia também precisa achar o próprio extrato.
        { href: "/adm/assinatura",  label: "Assinatura",    icon: Receipt,         exact: false },
      ],
    },
  ];
}

interface Props {
  user: { name: string; email: string };
  temMesaQr: boolean;
}

export function AdminSidebar({ user, temMesaQr }: Props) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navGroups = useMemo(() => buildNavGroups(temMesaQr), [temMesaQr]);
  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  const currentItem = allItems.find((i) => isActive(i.href, i.exact));

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-56 bg-white border-r border-neutral-200 flex-col shrink-0">
        <div className="px-6 py-5 border-b border-neutral-100">
          <Link href="/" className="block">
            <Image src="/munowbg.png" alt="MUNO" width={140} height={52} className="h-12 w-auto object-contain" />
          </Link>
          <p className="text-xs text-neutral-400 mt-1">Painel Admin</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon, exact }) => {
                  const active = isActive(href, exact);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                        active ? "bg-brand-light text-brand-dark font-medium" : "text-neutral-600 hover:bg-neutral-100"
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-neutral-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-neutral-900 truncate">{user.name}</p>
            <p className="text-xs text-neutral-400 truncate">{user.email}</p>
          </div>
          {/* A saída do painel de volta para a loja pública.
              NÃO se chama "Cardápio": esse nome já é do item de navegação
              acima, que abre /adm/menu para GERENCIAR o cardápio. Dois
              rótulos iguais indo para lugares diferentes é a confusão que
              este nome evita.

              Mora aqui embaixo, junto do "Sair", porque é ação de deixar o
              painel, não destino de navegação dentro dele. E abre em nova aba
              para o dono não perder a tela em que estava. */}
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-neutral-500 hover:bg-neutral-100 transition"
          >
            <ExternalLink size={16} />
            Ver minha loja
          </a>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-neutral-500 hover:bg-neutral-100 transition"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-neutral-200 h-14 flex items-center px-4 gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition"
        >
          <Menu size={20} className="text-neutral-700" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Image src="/munowbg.png" alt="MUNO" width={80} height={30} className="h-7 w-auto object-contain" />
          {currentItem && (
            <>
              <ChevronRight size={14} className="text-neutral-300 shrink-0" />
              <span className="text-sm font-semibold text-neutral-800 truncate">{currentItem.label}</span>
            </>
          )}
        </div>
      </header>

      {/* ── Mobile drawer ───────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />

          {/* Drawer panel */}
          <div className="relative w-72 max-w-[85vw] bg-white flex flex-col h-full shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div>
                <Image src="/munowbg.png" alt="MUNO" width={100} height={38} className="h-9 w-auto object-contain" />
                <p className="text-xs text-neutral-400 mt-0.5">Painel Admin</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition"
              >
                <X size={18} className="text-neutral-500" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map(({ href, label, icon: Icon, exact }) => {
                      const active = isActive(href, exact);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setDrawerOpen(false)}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition ${
                            active ? "bg-brand-light text-brand-dark font-semibold" : "text-neutral-700 hover:bg-neutral-100"
                          }`}
                        >
                          <Icon size={18} />
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* User + logout */}
            <div className="px-3 py-4 border-t border-neutral-100">
              <div className="px-3 py-2 mb-1">
                <p className="text-sm font-medium text-neutral-900 truncate">{user.name}</p>
                <p className="text-xs text-neutral-400 truncate">{user.email}</p>
              </div>
              <a
                href="/"
                target="_blank"
                rel="noopener"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-neutral-500 hover:bg-neutral-100 transition"
              >
                <ExternalLink size={18} />
                Ver minha loja
              </a>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-neutral-500 hover:bg-neutral-100 transition"
              >
                <LogOut size={18} />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile bottom nav ───────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200 flex">
        {allItems.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition ${
                active ? "text-brand" : "text-neutral-400"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
