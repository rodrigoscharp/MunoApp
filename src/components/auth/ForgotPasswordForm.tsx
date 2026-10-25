"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
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
import type { RestaurantInfo } from "@/lib/restaurant";

const schema = z.object({
  email: z.string().email("Email inválido"),
});

type FormData = z.infer<typeof schema>;

/**
 * O pedido de link para redefinir a senha. Mora aqui, e não na rota, pelo
 * mesmo motivo do login e do cadastro: a página é Server Component para o
 * painel de marca ler o restaurante do subdomínio. Até a loja nova ela trazia
 * o logo da Muno escrito no JSX, na tela de um restaurante que o cliente
 * conhece pelo nome.
 */
export function ForgotPasswordForm({ restaurantInfo }: { restaurantInfo: RestaurantInfo }) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("Erro ao enviar email. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const voltar = (
    <Link
      href="/login"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-loja-preco transition hover:text-forest-dark"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Voltar ao login
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AuthBrandPanel
        restaurantInfo={restaurantInfo}
        descricao="Vamos te enviar um link para redefinir sua senha."
      />

      <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:px-6 lg:items-center lg:py-12">
        <div className={`${cartao} w-full max-w-sm p-6 sm:p-8`}>
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-loja-folha">
                <CheckCircle size={30} aria-hidden="true" className="text-forest-dark" />
              </div>
              <h1 className="manchete text-[40px] text-forest-dark">Email enviado!</h1>
              <p className="text-sm leading-relaxed text-loja-tinta-2">
                Se existe uma conta com esse email, você receberá um link para redefinir sua senha em breve. Verifique sua caixa de entrada (e spam).
              </p>
              <div className="pt-1">{voltar}</div>
            </div>
          ) : (
            <>
              <div className="-mt-2 mb-4">{voltar}</div>

              <TituloDaTela
                rotulo="Recuperar acesso"
                titulo="Esqueci minha senha"
                subtitulo="Digite seu email e enviaremos um link para redefinir sua senha."
              />

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Rotulo htmlFor="esqueci-email">Email</Rotulo>
                  <div className="relative">
                    <Mail size={18} aria-hidden="true" className={iconeDoCampo} />
                    <input
                      {...register("email")}
                      id="esqueci-email"
                      type="email"
                      autoComplete="email"
                      placeholder="seu@email.com"
                      className={campoComIcone}
                    />
                  </div>
                  <ErroDoCampo>{errors.email?.message}</ErroDoCampo>
                </div>

                <AvisoDeErro>{error}</AvisoDeErro>

                <button
                  type="submit"
                  disabled={loading}
                  className={`${botaoBrasa} h-[52px] w-full text-[15px]`}
                >
                  {loading ? "Enviando..." : "Enviar link de redefinição"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
