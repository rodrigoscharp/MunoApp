"use client";

import { useActionState } from "react";
import { loginPlataforma } from "./actions";

export default function PlatformLoginPage() {
  const [erro, formAction, pending] = useActionState(loginPlataforma, undefined);

  return (
    <div className="min-h-screen bg-console-verde flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-white font-bold text-lg tracking-tight">MUNO</p>
          <p className="tabular text-[11px] uppercase tracking-[0.18em] text-white/40">
            plataforma
          </p>
        </div>

        <form
          action={formAction}
          className="bg-console-cartao rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="tabular block text-[11px] uppercase tracking-[0.14em] text-neutral-500 mb-1.5">
              E-mail
            </label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg border border-console-linha bg-console-fundo text-sm focus:outline-none focus:ring-2 focus:ring-console-verde"
            />
          </div>

          <div>
            <label className="tabular block text-[11px] uppercase tracking-[0.14em] text-neutral-500 mb-1.5">
              Senha
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-console-linha bg-console-fundo text-sm focus:outline-none focus:ring-2 focus:ring-console-verde"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
