"use client";

import { useActionState } from "react";
import { loginPlataforma } from "./actions";

export default function PlatformLoginPage() {
  const [erro, formAction, pending] = useActionState(loginPlataforma, undefined);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <form
        action={formAction}
        className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 p-6 space-y-4"
      >
        <h1 className="text-xl font-bold text-neutral-900">Muno · Plataforma</h1>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            E-mail
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Senha
          </label>
          <input
            name="password"
            type="password"
            required
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
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
  );
}
