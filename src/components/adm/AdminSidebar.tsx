"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair,
  ArrowUpRight,
  Bike,
  CreditCard,
  Flame,
  House,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  ReceiptText,
  ShieldCheck,
  Store,
  Ticket,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { kicker } from "@/components/painel/estilos";

interface ItemDoMenu {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Número ao lado do rótulo; zero não aparece. */
  contagem?: number;
  /** Como o leitor de tela lê a contagem: "3 em andamento". */
  rotuloDaContagem?: string;
}

interface GrupoDoMenu {
  label: string;
  items: ItemDoMenu[];
}

// Função pura (não um valor fixo) porque "Mesas" só entra para quem tem o
// plano — sem o plano, o item nem existe na lista, não fica escondido.
function montarGrupos(temMesaQr: boolean, pedidosEmAndamento: number): GrupoDoMenu[] {
  return [
    {
      label: "Operação",
      items: [
        { href: "/adm", label: "Início", icon: House, exact: true },
        {
          href: "/adm/orders",
          label: "Pedidos",
          icon: ReceiptText,
          contagem: pedidosEmAndamento,
          rotuloDaContagem: `${pedidosEmAndamento} em andamento`,
        },
        // O quadro da cozinha mora fora de /adm, e o dono que também opera o
        // balcão não tinha como chegar nele pelo painel.
        { href: "/dashboard", label: "Cozinha", icon: Flame },
        // Sem contagem: o restaurante não tem cursor de "lida" no chat (o
        // sino é do cliente), e inventar um número de não lidas aqui seria
        // pior que não ter nenhum.
        { href: "/adm/chats", label: "Chats", icon: MessageSquare },
        ...(temMesaQr ? [{ href: "/adm/mesas", label: "Mesas", icon: Armchair }] : []),
        { href: "/adm/motoboys", label: "Motoboys", icon: Bike },
      ],
    },
    {
      label: "Loja",
      items: [
        { href: "/adm/menu", label: "Cardápio", icon: LayoutGrid },
        { href: "/adm/banner-cupons", label: "Banner e cupons", icon: Ticket },
        { href: "/adm/restaurante", label: "Restaurante", icon: Store },
      ],
    },
    {
      label: "Financeiro",
      items: [
        { href: "/adm/pagamentos", label: "Pagamentos", icon: CreditCard },
        // Sem esta entrada a tela da mensalidade só existiria depois do
        // atraso, pela faixa de aviso ou pelo redirecionamento do bloqueio.
        { href: "/adm/assinatura", label: "Assinatura", icon: ShieldCheck },
      ],
    },
  ];
}

function estaAtivo(pathname: string, item: ItemDoMenu): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface RestauranteDoMenu {
  nome: string;
  aberto: boolean;
  /** "Aberto · fecha 23:30" (ver estadoDaLoja). */
  rotulo: string;
}

interface Props {
  user: { name: string; email: string };
  temMesaQr: boolean;
  restaurante: RestauranteDoMenu;
  /**
   * Retrato do carregamento, como o ponto do menu do console: navegar entre
   * telas do /adm não refaz o layout, então o número só anda numa carga nova.
   */
  pedidosEmAndamento: number;
}

function Contagem({ valor, ativo, rotulo }: { valor: number; ativo: boolean; rotulo?: string }) {
  if (valor <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold",
        ativo ? "bg-white text-loja-brasa" : "bg-loja-brasa text-white"
      )}
    >
      <span aria-hidden="true">{valor > 99 ? "99+" : valor}</span>
      <span className="sr-only">{rotulo ?? valor}</span>
    </span>
  );
}

/** O conteúdo do menu: o mesmo na coluna do desktop e na gaveta do celular. */
function ConteudoDoMenu({
  grupos,
  pathname,
  restaurante,
  user,
  aoNavegar,
}: {
  grupos: GrupoDoMenu[];
  pathname: string;
  restaurante: RestauranteDoMenu;
  user: Props["user"];
  aoNavegar?: () => void;
}) {
  const inicial = restaurante.nome.trim().charAt(0).toUpperCase() || "M";
  return (
    <>
      <div className="flex items-center gap-2.5 px-2">
        <Image src="/munowbg.png" alt="Muno" width={80} height={30} className="h-[26px] w-auto object-contain" />
        <span className={cn(kicker, "text-loja-tinta-2")}>Painel</span>
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl bg-loja-pessego p-3">
        <span
          aria-hidden="true"
          className="manchete flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-loja-brasa text-[20px] text-white"
        >
          {inicial}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-extrabold text-forest-dark">
            {restaurante.nome || "Seu restaurante"}
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6A3A1E]">
            <span
              aria-hidden="true"
              className={cn(
                "h-[7px] w-[7px] shrink-0 rounded-full",
                restaurante.aberto ? "bg-forest" : "bg-[#A4461A]"
              )}
            />
            {restaurante.rotulo}
          </span>
        </div>
      </div>

      <nav aria-label="Menu do painel" className="flex flex-col gap-3.5">
        {grupos.map((grupo) => (
          <div key={grupo.label} className="flex flex-col gap-0.5">
            <span className={cn(kicker, "px-3 pb-1 text-[10px] text-loja-tinta-2")}>{grupo.label}</span>
            {grupo.items.map((item) => {
              const ativo = estaAtivo(pathname, item);
              const Icone = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={aoNavegar}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-2.5 rounded-xl px-3 text-[13.5px] transition",
                    ativo
                      ? "bg-loja-brasa font-bold text-white"
                      : "font-semibold text-[#4E4038] hover:bg-loja-creme"
                  )}
                >
                  <Icone size={18} strokeWidth={ativo ? 2 : 1.8} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.contagem !== undefined && (
                    <Contagem valor={item.contagem} ativo={ativo} rotulo={item.rotuloDaContagem} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-2">
        {/* A saída do painel de volta para a loja pública. NÃO se chama
            "Cardápio": esse nome já é do item acima, que abre /adm/menu para
            GERENCIAR o cardápio. Abre em nova aba para o dono não perder a
            tela em que estava. */}
        <a
          href="/"
          target="_blank"
          rel="noopener"
          onClick={aoNavegar}
          className="flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-brand text-[13px] font-extrabold text-loja-preco transition hover:bg-loja-pessego-claro"
        >
          Ver minha loja
          <ArrowUpRight size={15} strokeWidth={2.4} aria-hidden="true" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>

        <div className="flex items-center gap-2 border-t border-loja-linha pt-3">
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-[12.5px] font-bold text-loja-tinta">{user.name}</p>
            <p className="truncate text-[11.5px] text-loja-tinta-2">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-bold text-loja-tinta-2 transition hover:bg-loja-creme hover:text-loja-tinta"
          >
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
      </div>
    </>
  );
}

// No celular, a barra de baixo leva só o que se abre no meio do serviço; o
// resto mora na gaveta. Onze itens numa barra de 360px não cabem em 44px cada.
const ATALHOS_DO_CELULAR = ["/adm", "/adm/orders", "/dashboard", "/adm/menu"];

export function AdminSidebar({ user, temMesaQr, restaurante, pedidosEmAndamento }: Props) {
  const pathname = usePathname();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const fechar = useRef<HTMLButtonElement>(null);
  const abrir = useRef<HTMLButtonElement>(null);

  const grupos = useMemo(() => montarGrupos(temMesaQr, pedidosEmAndamento), [temMesaQr, pedidosEmAndamento]);
  const todos = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  const atual = todos.find((i) => estaAtivo(pathname, i));
  const atalhos = ATALHOS_DO_CELULAR.map((href) => todos.find((i) => i.href === href)!).filter(Boolean);

  // A gaveta é um diálogo: Esc fecha, o foco entra no botão de fechar e volta
  // para o de abrir, e a página atrás não rola.
  useEffect(() => {
    if (!gavetaAberta) return;
    const botaoDeAbrir = abrir.current;
    fechar.current?.focus();
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGavetaAberta(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = rolagem;
      document.removeEventListener("keydown", aoTeclar);
      botaoDeAbrir?.focus();
    };
  }, [gavetaAberta]);

  return (
    <>
      {/* ── Coluna do desktop ───────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-loja-linha bg-loja-papel px-4 py-6 lg:flex">
        <ConteudoDoMenu grupos={grupos} pathname={pathname} restaurante={restaurante} user={user} />
      </aside>

      {/* ── Barra do topo no celular ───────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-loja-linha bg-loja-papel px-2 lg:hidden">
        <button
          ref={abrir}
          type="button"
          onClick={() => setGavetaAberta(true)}
          aria-label="Abrir menu"
          aria-expanded={gavetaAberta}
          aria-controls="gaveta-do-painel"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-loja-tinta transition hover:bg-loja-creme"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <Image src="/munowbg.png" alt="Muno" width={70} height={26} className="h-6 w-auto object-contain" />
        {atual && (
          <span className="ml-1 truncate border-l border-loja-linha pl-3 text-[14px] font-bold text-loja-tinta">
            {atual.label}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pr-2 text-[11.5px] font-semibold text-loja-tinta-2">
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 rounded-full", restaurante.aberto ? "bg-forest" : "bg-[#A4461A]")}
          />
          {restaurante.aberto ? "Aberto" : "Fechado"}
        </span>
      </header>

      {/* ── Gaveta do celular ──────────────────────────────────────── */}
      {gavetaAberta && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div aria-hidden="true" className="absolute inset-0 bg-[#2B231E]/45" onClick={() => setGavetaAberta(false)} />
          <div
            id="gaveta-do-painel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
            className="relative flex h-full w-[296px] max-w-[86vw] flex-col gap-5 overflow-y-auto bg-loja-papel px-4 pb-6 pt-3 shadow-loja-alta"
          >
            <button
              ref={fechar}
              type="button"
              onClick={() => setGavetaAberta(false)}
              aria-label="Fechar menu"
              className="flex h-11 w-11 items-center justify-center self-end rounded-xl text-loja-tinta-2 transition hover:bg-loja-creme"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <ConteudoDoMenu
              grupos={grupos}
              pathname={pathname}
              restaurante={restaurante}
              user={user}
              aoNavegar={() => setGavetaAberta(false)}
            />
          </div>
        </div>
      )}

      {/* ── Barra de baixo no celular ──────────────────────────────── */}
      <nav
        aria-label="Atalhos do painel"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-loja-linha bg-loja-papel pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {atalhos.map((item) => {
          const ativo = estaAtivo(pathname, item);
          const Icone = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition",
                ativo ? "font-extrabold text-loja-preco" : "font-semibold text-loja-tinta-2"
              )}
            >
              <Icone size={20} strokeWidth={ativo ? 2.3 : 1.8} aria-hidden="true" />
              {item.label}
              {item.contagem ? (
                <span className="absolute right-[calc(50%-22px)] top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-loja-brasa px-1 text-[10px] font-extrabold text-white">
                  <span aria-hidden="true">{item.contagem > 99 ? "99+" : item.contagem}</span>
                  <span className="sr-only">{item.rotuloDaContagem}</span>
                </span>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setGavetaAberta(true)}
          aria-expanded={gavetaAberta}
          aria-controls="gaveta-do-painel"
          className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-loja-tinta-2"
        >
          <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
          Mais
        </button>
      </nav>
    </>
  );
}
