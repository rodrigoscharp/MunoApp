"use client";

import { MENSAGEM_SENHA_MINIMA, SENHA_MINIMA } from "@/lib/senha";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, User } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import {
  AvisoDeErro,
  ErroDoCampo,
  Rotulo,
  TituloDaTela,
  campoComIcone,
  iconeDoCampo,
} from "@/components/auth/pecas";
import { botaoBrasa, cartao } from "@/components/loja/estilos";
import { destinoSeguro } from "@/lib/redirect-seguro";
import type { RestaurantInfo } from "@/lib/restaurant";

const schema = z
  .object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    email: z.string().email("Email inválido"),
    password: z.string().min(SENHA_MINIMA, MENSAGEM_SENHA_MINIMA),
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
  // Só destino interno, e o mesmo valor limpo segue para o link de login.
  // Ver src/lib/redirect-seguro.ts.
  const callbackSeguro = destinoSeguro(searchParams.get("callbackUrl"), null);
  const callbackUrl = callbackSeguro ?? "/";
  const loginHref = callbackSeguro
    ? `/login?callbackUrl=${encodeURIComponent(callbackSeguro)}`
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

    // O resultado do signIn era ignorado: se o login automático falhasse, o
    // formulário seguia para o callbackUrl, e no /checkout o proxy devolvia a
    // pessoa ao login sem explicação, como se o cadastro não tivesse ido. A
    // conta já existe, então o recado é entrar, não cadastrar de novo.
    const entrou = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    })
      .then((result) => !result?.error)
      .catch(() => false);

    if (!entrou) {
      setError("Sua conta foi criada, mas não conseguimos entrar agora. Use o link Entrar abaixo.");
      setLoading(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AuthBrandPanel
        restaurantInfo={restaurantInfo}
        descricao="Crie sua conta e aproveite a comodidade de pedir online a qualquer hora."
      />

      <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:px-6 lg:items-center lg:py-12">
        <div className={`${cartao} w-full max-w-sm p-6 sm:p-8`}>
          <TituloDaTela
            rotulo="Sua conta"
            titulo="Criar conta"
            subtitulo="Preencha os dados abaixo para se cadastrar"
          />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Rotulo htmlFor="cadastro-nome">Nome</Rotulo>
              <div className="relative">
                <User size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("name")}
                  id="cadastro-nome"
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  className={campoComIcone}
                />
              </div>
              <ErroDoCampo>{errors.name?.message}</ErroDoCampo>
            </div>
            <div>
              <Rotulo htmlFor="cadastro-email">Email</Rotulo>
              <div className="relative">
                <Mail size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("email")}
                  id="cadastro-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  className={campoComIcone}
                />
              </div>
              <ErroDoCampo>{errors.email?.message}</ErroDoCampo>
            </div>
            <div>
              <Rotulo htmlFor="cadastro-senha">Senha</Rotulo>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("password")}
                  id="cadastro-senha"
                  type="password"
                  autoComplete="new-password"
                  placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                  className={campoComIcone}
                />
              </div>
              <ErroDoCampo>{errors.password?.message}</ErroDoCampo>
            </div>
            <div>
              <Rotulo htmlFor="cadastro-confirmar">Confirmar senha</Rotulo>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("confirmPassword")}
                  id="cadastro-confirmar"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  className={campoComIcone}
                />
              </div>
              <ErroDoCampo>{errors.confirmPassword?.message}</ErroDoCampo>
            </div>

            <AvisoDeErro>{error}</AvisoDeErro>

            <button
              type="submit"
              disabled={loading}
              className={`${botaoBrasa} mt-2 h-[52px] w-full text-[15px]`}
            >
              {loading ? "Criando conta..." : "Criar conta"}
            </button>
            <p className="text-center text-xs leading-relaxed text-loja-tinta-2">
              Seus dados são usados para o seu pedido, conforme a{" "}
              <a
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-loja-preco underline"
              >
                Política de Privacidade
              </a>
              .
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-loja-tinta-2">
            Já tem conta?{" "}
            <Link
              href={loginHref}
              className="inline-flex min-h-11 items-center font-bold text-loja-preco hover:text-forest-dark"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
