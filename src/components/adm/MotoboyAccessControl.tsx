"use client";

import { MENSAGEM_SENHA_MINIMA, SENHA_MINIMA } from "@/lib/senha";
import { useState } from "react";
import { Bike, Plus, Trash2, KeyRound, Check, X, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { Selo } from "@/components/painel/Selo";
import {
  botaoBrasa,
  botaoContorno,
  botaoFloresta,
  campo,
  cartaoPainel,
  rotulo,
  tituloDeSecao,
} from "@/components/painel/estilos";

interface Motoboy {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface Props {
  initialMotoboys: Motoboy[];
  /** Pedidos de hoje já entregues, por motoboy. Quem não aparece fez zero. */
  entregasHoje?: Record<string, number>;
}

export function MotoboyAccessControl({ initialMotoboys, entregasHoje = {} }: Props) {
  const [motoboys, setMotoboys] = useState<Motoboy[]>(initialMotoboys);
  const totalHoje = motoboys.reduce((soma, m) => soma + (entregasHoje[m.id] ?? 0), 0);

  // New motoboy form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [adding, setAdding] = useState(false);

  // Reset password inline
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  async function addMotoboy() {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error("Preencha nome, e-mail e senha");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/users/motoboys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim(), password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Erro ao criar acesso");
      }
      const motoboy = await res.json() as Motoboy;
      setMotoboys((prev) => [motoboy, ...prev]);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      toast.success(`Acesso criado para ${motoboy.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar acesso");
    } finally {
      setAdding(false);
    }
  }

  async function deleteMotoboy(id: string, name: string) {
    const res = await fetch(`/api/users/motoboys/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMotoboys((prev) => prev.filter((m) => m.id !== id));
      toast.success(`Acesso de ${name} removido`);
    } else {
      toast.error("Erro ao remover acesso");
    }
  }

  async function saveResetPassword(id: string) {
    if (!resetPassword || resetPassword.length < SENHA_MINIMA) {
      toast.error(MENSAGEM_SENHA_MINIMA);
      return;
    }
    const res = await fetch(`/api/users/motoboys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    if (res.ok) {
      setResetId(null);
      setResetPassword("");
      toast.success("Senha atualizada");
    } else {
      toast.error("Erro ao atualizar senha");
    }
  }

  const contexto =
    motoboys.length === 0
      ? "Portal do entregador"
      : `${motoboys.length} com acesso · ${totalHoje} entrega${totalHoje !== 1 ? "s" : ""} hoje`;

  return (
    <div>
      <CabecalhoDaTela contexto={contexto} titulo="Motoboys" />
      <p className="-mt-2 mb-5 text-sm text-loja-tinta-2">Gerencie quem tem acesso ao portal de entregadores.</p>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Lista */}
        <section aria-label="Motoboys com acesso" className="flex min-w-0 flex-col gap-3">
          {motoboys.length === 0 && (
            <div className={cn(cartaoPainel, "flex flex-col items-center gap-3 px-6 py-14 text-center")}>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-loja-pessego-claro text-loja-preco">
                <Bike size={30} strokeWidth={1.6} aria-hidden="true" />
              </span>
              <p className="text-[15px] font-extrabold text-loja-tinta">Nenhum motoboy cadastrado</p>
              <p className="max-w-xs text-sm text-loja-tinta-2">
                Crie um acesso ao lado para o entregador entrar no portal e aceitar as corridas.
              </p>
            </div>
          )}

          {motoboys.map((m) => {
            const hoje = entregasHoje[m.id] ?? 0;
            return (
              <article key={m.id} className={cn(cartaoPainel, "p-4 sm:p-5")}>
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="manchete flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest-dark text-[22px] text-white"
                  >
                    {m.name.trim().charAt(0).toUpperCase() || "M"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-extrabold text-loja-tinta">{m.name}</p>
                      <Selo tom="pronto">Com acesso</Selo>
                    </div>
                    <p className="truncate text-[13px] text-loja-tinta-2">{m.email}</p>
                    <p className="mt-1 text-[12px] text-loja-tinta-2">desde {formatDate(m.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="manchete text-[28px] text-forest-dark">{hoje}</span>
                    <span className={cn(rotulo, "-mt-0.5")}>entrega{hoje !== 1 ? "s" : ""} hoje</span>
                  </div>
                </div>

                {resetId === m.id ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-loja-creme p-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 px-2">
                      <KeyRound size={15} className="shrink-0 text-loja-tinta-2" aria-hidden="true" />
                      <span className="sr-only">Nova senha de {m.name}</span>
                      <input
                        type="password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        placeholder={`Nova senha (mín. ${SENHA_MINIMA} caracteres)`}
                        className="h-11 min-w-0 flex-1 bg-transparent text-sm text-loja-tinta placeholder:text-loja-tinta-2/80 focus:outline-none"
                      />
                    </label>
                    <button
                      onClick={() => saveResetPassword(m.id)}
                      className={cn(botaoFloresta, "h-11 px-4 text-[13px]")}
                    >
                      <Check size={15} aria-hidden="true" />
                      Salvar
                    </button>
                    <button
                      onClick={() => { setResetId(null); setResetPassword(""); }}
                      aria-label="Cancelar troca de senha"
                      className="flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-papel"
                    >
                      <X size={17} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-[#F0E6DA] pt-3">
                    <button
                      onClick={() => { setResetId(m.id); setResetPassword(""); }}
                      className={cn(botaoContorno, "h-11 px-4 text-[13px]")}
                    >
                      <KeyRound size={15} aria-hidden="true" />
                      Redefinir senha
                    </button>
                    <button
                      onClick={() => deleteMotoboy(m.id, m.name)}
                      className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-bold text-[#A3301A] transition hover:bg-[#FBE4DA]"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Remover acesso
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {/* Adicionar */}
        <section aria-labelledby="titulo-adicionar-motoboy" className={cn(cartaoPainel, "p-5 lg:sticky lg:top-6")}>
          <h2 id="titulo-adicionar-motoboy" className={tituloDeSecao}>Adicionar motoboy</h2>
          <p className="mb-4 mt-1 text-[12.5px] text-loja-tinta-2">
            Com o e-mail e a senha, o entregador entra no portal e vê as corridas.
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Nome</span>
              <span className="relative flex items-center">
                <User size={15} className="pointer-events-none absolute left-4 text-loja-tinta-2" aria-hidden="true" />
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome completo"
                  className={cn(campo, "pl-10")}
                />
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>E-mail</span>
              <span className="relative flex items-center">
                <Mail size={15} className="pointer-events-none absolute left-4 text-loja-tinta-2" aria-hidden="true" />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="E-mail de acesso"
                  className={cn(campo, "pl-10")}
                />
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Senha</span>
              <span className="relative flex items-center">
                <KeyRound size={15} className="pointer-events-none absolute left-4 text-loja-tinta-2" aria-hidden="true" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMotoboy()}
                  placeholder={`Senha (mín. ${SENHA_MINIMA} caracteres)`}
                  className={cn(campo, "pl-10")}
                />
              </span>
            </label>
            <button
              onClick={addMotoboy}
              disabled={adding}
              className={cn(botaoBrasa, "mt-1 h-12 w-full text-sm")}
            >
              <Plus size={16} aria-hidden="true" />
              {adding ? "Criando acesso..." : "Criar acesso"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
