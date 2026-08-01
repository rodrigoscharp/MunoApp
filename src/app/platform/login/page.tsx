"use client";

import Image from "next/image";
import { useActionState } from "react";
import { loginPlataforma } from "./actions";

export default function PlatformLoginPage() {
  const [erro, formAction, pending] = useActionState(loginPlataforma, undefined);

  return (
    <div className="min-h-screen bg-console-campo flex flex-col items-center justify-center px-5 py-10 overflow-hidden">
      {/* Dois arcos enormes no fundo, o mesmo desenho das letras do logotipo,
          quase invisíveis. Dão profundidade ao campo sem virar ornamento. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -bottom-32 w-[26rem] h-[26rem] bg-white/[0.06] arco"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-40 w-[22rem] h-[22rem] bg-white/[0.05] arco"
      />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/muno-marca.png"
            alt="Muno"
            width={682}
            height={155}
            className="h-11 w-auto object-contain brightness-0 invert"
            priority
          />
          <p className="text-white/70 text-sm mt-3">plataforma</p>
        </div>

        {/* O primeiro arco da interface: o cartão de entrada. */}
        <form
          action={formAction}
          className="bg-console-cartao arco px-7 pt-10 pb-7 space-y-4 shadow-xl shadow-black/10"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm text-neutral-600 mb-1.5"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-console-linha bg-console-papel text-[15px] focus:outline-none focus:border-console-dado focus:ring-2 focus:ring-console-dado/20 transition"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm text-neutral-600 mb-1.5"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-console-linha bg-console-papel text-[15px] focus:outline-none focus:border-console-dado focus:ring-2 focus:ring-console-dado/20 transition"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-console-dado hover:bg-forest-dark disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
