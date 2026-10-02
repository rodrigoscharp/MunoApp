"use client";

import { MENSAGEM_SENHA_MINIMA, SENHA_MINIMA } from "@/lib/senha";
import { useState } from "react";
import { Bike, Plus, Trash2, KeyRound, Check, X, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

interface Motoboy {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface Props {
  initialMotoboys: Motoboy[];
}

export function MotoboyAccessControl({ initialMotoboys }: Props) {
  const [motoboys, setMotoboys] = useState<Motoboy[]>(initialMotoboys);

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

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bike size={15} className="text-neutral-400" />
        <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
          Acesso de Motoboys
        </p>
      </div>

      {/* Lista */}
      <div className="space-y-2 mb-4">
        {motoboys.length === 0 && (
          <p className="text-xs text-neutral-400 italic text-center py-3">
            Nenhum motoboy cadastrado
          </p>
        )}

        {motoboys.map((m) => (
          <div key={m.id} className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5">
            {resetId === m.id ? (
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="text-neutral-400 shrink-0" />
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder={`Nova senha (mín. ${SENHA_MINIMA} caracteres)`}
                  className="flex-1 min-w-0 border border-neutral-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button onClick={() => saveResetPassword(m.id)} className="text-green-500 hover:text-green-600 p-1">
                  <Check size={15} />
                </button>
                <button onClick={() => { setResetId(null); setResetPassword(""); }} className="text-neutral-400 hover:text-neutral-600 p-1">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">{m.name}</p>
                  <p className="text-xs text-neutral-400 truncate">{m.email}</p>
                </div>
                <span className="text-[10px] text-neutral-300 shrink-0 hidden sm:block">
                  desde {formatDate(m.createdAt)}
                </span>
                <button
                  onClick={() => { setResetId(m.id); setResetPassword(""); }}
                  title="Redefinir senha"
                  className="text-neutral-400 hover:text-brand p-1 shrink-0"
                >
                  <KeyRound size={13} />
                </button>
                <button
                  onClick={() => deleteMotoboy(m.id, m.name)}
                  title="Remover acesso"
                  className="text-neutral-400 hover:text-red-500 p-1 shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Adicionar */}
      <div className="border-t border-neutral-100 pt-4 space-y-2">
        <p className="text-xs font-medium text-neutral-600">Adicionar motoboy</p>
        <div className="grid grid-cols-1 gap-2">
          <div className="flex items-center gap-2 border border-neutral-200 rounded-lg px-3 py-2 bg-neutral-50">
            <User size={13} className="text-neutral-400 shrink-0" />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome completo"
              className="flex-1 text-sm bg-transparent focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 border border-neutral-200 rounded-lg px-3 py-2 bg-neutral-50">
            <Mail size={13} className="text-neutral-400 shrink-0" />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="E-mail de acesso"
              className="flex-1 text-sm bg-transparent focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 border border-neutral-200 rounded-lg px-3 py-2 bg-neutral-50">
              <KeyRound size={13} className="text-neutral-400 shrink-0" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMotoboy()}
                placeholder={`Senha (mín. ${SENHA_MINIMA} caracteres)`}
                className="flex-1 text-sm bg-transparent focus:outline-none"
              />
            </div>
            <button
              onClick={addMotoboy}
              disabled={adding}
              className="flex items-center gap-1.5 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-lg transition shrink-0"
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
