"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, AlertCircle, CheckCircle } from "lucide-react";

const schema = z
  .object({
    password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

/**
 * O formulário de senha, usado por DOIS caminhos que chegam na mesma tela:
 * o "esqueci minha senha" de quem já usa o sistema, e o primeiro acesso de
 * quem acabou de comprar e veio pelo link do e-mail de boas-vindas.
 *
 * `novo=1` na query string separa os dois (posto lá por email-boas-vindas.ts).
 * Sem essa distinção, um cliente que pagou minutos atrás era recebido com
 * "crie uma NOVA senha para sua conta" — palavra errada para quem nunca teve
 * uma, na primeira tela do produto que ele vê depois de pagar.
 *
 * A marca só troca o texto. Quem autoriza a troca de senha é o token, sempre.
 */
export function ResetPasswordForm({ nomeRestaurante }: { nomeRestaurante?: string }) {

  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const primeiroAcesso = searchParams.get("novo") === "1";
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    if (!token) {
      setError("Link inválido. Solicite um novo.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao redefinir senha.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-8 lg:hidden">
        <Image src="/munowbg.png" alt="MUNO" width={160} height={60} className="h-16 w-auto object-contain" />
      </div>

      {success ? (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">{primeiroAcesso ? "Tudo pronto!" : "Senha redefinida!"}</h2>
          <p className="text-neutral-500 text-sm">Redirecionando para o login...</p>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900">
              {primeiroAcesso
                ? nomeRestaurante
                  ? `Bem-vindo à Muno, ${nomeRestaurante}.`
                  : "Bem-vindo à Muno."
                : "Nova senha"}
            </h2>
            <p className="text-neutral-500 text-sm mt-1">
              {primeiroAcesso
                ? "Crie sua senha para entrar pela primeira vez. Depois dela, o painel do seu restaurante é todo seu."
                : "Crie uma nova senha para sua conta."}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{primeiroAcesso ? "Sua senha" : "Nova senha"}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  {...register("password")}
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition placeholder:text-neutral-400"
                />
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.password.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{primeiroAcesso ? "Confirmar senha" : "Confirmar nova senha"}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  {...register("confirmPassword")}
                  type="password"
                  placeholder="Repita a senha"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition placeholder:text-neutral-400"
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="text-red-500 shrink-0" />
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition text-sm shadow-sm"
            >
              {loading ? "Salvando..." : primeiroAcesso ? "Criar senha e entrar" : "Redefinir senha"}
            </button>
          </form>

          {!primeiroAcesso && (
            <p className="text-center text-sm text-neutral-500 mt-6">
              <Link href="/login" className="text-brand hover:text-brand-dark font-semibold">
                Voltar ao login
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
