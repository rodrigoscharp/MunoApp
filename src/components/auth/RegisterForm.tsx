"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, User, AlertCircle } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import type { RestaurantInfo } from "@/lib/restaurant";

const schema = z
  .object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export function RegisterForm({ restaurantInfo }: { restaurantInfo: RestaurantInfo }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const loginHref = searchParams.get("callbackUrl")
    ? `/login?callbackUrl=${encodeURIComponent(searchParams.get("callbackUrl")!)}`
    : "/login";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        password: data.password,
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error || "Erro ao criar conta");
      setLoading(false);
      return;
    }

    await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex">
      <AuthBrandPanel
        restaurantInfo={restaurantInfo}
        descricao="Crie sua conta e aproveite a comodidade de pedir online a qualquer hora."
      />

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-neutral-50">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Image
              src={restaurantInfo.logoUrl}
              alt={restaurantInfo.name}
              width={160}
              height={60}
              className="h-16 w-auto object-contain"
              unoptimized={restaurantInfo.logoUrl.startsWith("http")}
            />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900">Criar conta</h2>
            <p className="text-neutral-500 text-sm mt-1">Preencha os dados abaixo para se cadastrar</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Nome</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  {...register("name")}
                  type="text"
                  placeholder="Seu nome completo"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition placeholder:text-neutral-400"
                />
              </div>
              {errors.name && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  {...register("email")}
                  type="email"
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition placeholder:text-neutral-400"
                />
              </div>
              {errors.email && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Senha</label>
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
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">Confirmar Senha</label>
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
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition text-sm mt-2 shadow-sm"
            >
              {loading ? "Criando conta..." : "Criar conta"}
            </button>
          </form>

          <p className="text-center text-sm text-neutral-500 mt-6">
            Já tem conta?{" "}
            <Link href={loginHref} className="text-brand hover:text-brand-dark font-semibold">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
