"use client";

import Image from "next/image";
import { useActionState } from "react";
import { loginPlataforma } from "./actions";

/**
 * A entrada do console, no mesmo desenho do Core 2.0 que o resto da
 * plataforma: papel cinza, um cartão de vidro canelado no meio e o botão em
 * tinta cheia.
 *
 * O campo terracota de antes saiu junto com a paleta: com `--console-campo`
 * sendo a tinta, uma tela inteira dessa cor viraria um bloco preto. O que
 * carrega a marca aqui é o ícone, como na coluna lateral.
 */
export default function PlatformLoginPage() {
  const [erro, formAction, pending] = useActionState(loginPlataforma, undefined);

  return (
    <div className="min-h-screen bg-console-papel text-console-tinta flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="flex flex-col items-center mb-7">
          <Image
            src="/icons/icone-192.png"
            alt="Muno"
            width={192}
            height={192}
            className="size-14 rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_10px_24px_-10px_rgba(0,0,0,0.25)]"
            priority
          />
          <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.03em]">
            Muno <span className="text-console-segunda">Admin</span>
          </h1>
          <p className="text-[14px] text-console-mudo mt-1">
            o console da plataforma
          </p>
        </div>

        <form
          action={formAction}
          className="console-vidro console-entra rounded-[28px] p-6 sm:p-7 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-[13px] font-medium text-console-segunda mb-2"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              className="w-full h-12 px-4 rounded-xl border border-console-linha bg-console-cartao text-[15px] outline-none focus:border-console-tinta focus:ring-2 focus:ring-console-tinta/10 transition"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[13px] font-medium text-console-segunda mb-2"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full h-12 px-4 rounded-xl border border-console-linha bg-console-cartao text-[15px] outline-none focus:border-console-tinta focus:ring-2 focus:ring-console-tinta/10 transition"
            />
          </div>

          {erro && (
            <p className="rounded-xl bg-console-negativo-fundo px-3.5 py-2.5 text-[14px] font-medium text-console-alerta">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full h-12 rounded-xl bg-console-campo text-console-sobre-campo font-semibold hover:bg-console-campo-esc disabled:opacity-50 transition-colors"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
