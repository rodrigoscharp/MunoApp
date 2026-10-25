"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { ChefHat, ClipboardList, LogOut, Settings } from "lucide-react";

/**
 * O menu da conta: o mesmo no desktop (o menu do nome, no cabeçalho) e no
 * celular (a folha do Perfil, na barra de baixo). Os atalhos de Admin e
 * Cozinha moram aqui desde que o menu sanduíche do celular saiu: a equipe
 * entra pela loja e precisa chegar ao painel sem digitar endereço.
 */
export function ItensDaConta({ session, aoEscolher }: { session: Session; aoEscolher: () => void }) {
  const papel = session.user.role;
  const item =
    "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-loja-tinta transition hover:bg-loja-pessego-claro";
  return (
    <>
      <div className="px-3 pb-2 pt-1">
        {session.user.name && <p className="truncate text-sm font-extrabold text-loja-tinta">{session.user.name}</p>}
        {session.user.email && <p className="truncate text-xs text-loja-tinta-2">{session.user.email}</p>}
      </div>
      <Link href="/pedidos" onClick={aoEscolher} className={item}>
        <ClipboardList size={17} aria-hidden="true" className="text-forest" /> Meus pedidos
      </Link>
      {papel === "ADMIN" && (
        <Link href="/adm" onClick={aoEscolher} className={item}>
          <Settings size={17} aria-hidden="true" className="text-forest" /> Admin
        </Link>
      )}
      {(papel === "ADMIN" || papel === "KITCHEN") && (
        <Link href="/dashboard" onClick={aoEscolher} className={item}>
          <ChefHat size={17} aria-hidden="true" className="text-forest" /> Cozinha
        </Link>
      )}
      <button
        type="button"
        onClick={() => {
          aoEscolher();
          signOut({ callbackUrl: "/" });
        }}
        className={item}
      >
        <LogOut size={17} aria-hidden="true" className="text-forest" /> Sair
      </button>
    </>
  );
}
