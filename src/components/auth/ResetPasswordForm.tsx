"use client";

import { MENSAGEM_SENHA_MINIMA, SENHA_MINIMA } from "@/lib/senha";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, CheckCircle } from "lucide-react";
import {
  AvisoDeErro,
  ErroDoCampo,
  Rotulo,
  TituloDaTela,
  campoComIcone,
  iconeDoCampo,
} from "@/components/auth/pecas";
import { botaoBrasa } from "@/components/loja/estilos";

const schema = z
  .object({
    password: z.string().min(SENHA_MINIMA, MENSAGEM_SENHA_MINIMA),
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
      // A marca segue para o login: sem ela, quem acabou de criar a primeira
      // senha é recebido com "Bem-vindo de volta", de volta a um lugar onde
      // nunca esteve.
      setTimeout(
        () => router.push(primeiroAcesso ? "/login?novo=1" : "/login"),
        2500
      );
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      {/* A largura e o cartão vêm da page, assim como a marca: o painel do
          restaurante na recuperação, o letreiro no primeiro acesso. */}
      {success ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-loja-folha">
            <CheckCircle size={30} aria-hidden="true" className="text-forest-dark" />
          </div>
          <h1 className="manchete text-[40px] text-forest-dark">
            {primeiroAcesso ? "Tudo pronto!" : "Senha redefinida!"}
          </h1>
          <p className="text-sm text-loja-tinta-2">Redirecionando para o login...</p>
        </div>
      ) : (
        <>
          <TituloDaTela
            rotulo={primeiroAcesso ? "Primeiro acesso" : "Recuperar acesso"}
            titulo={
              primeiroAcesso
                ? nomeRestaurante
                  ? `Bem-vindo à Muno, ${nomeRestaurante}.`
                  : "Bem-vindo à Muno."
                : "Nova senha"
            }
            subtitulo={
              primeiroAcesso
                ? "Crie sua senha para entrar pela primeira vez. Depois dela, o painel do seu restaurante é todo seu."
                : "Crie uma nova senha para sua conta."
            }
          />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Rotulo htmlFor="nova-senha">{primeiroAcesso ? "Sua senha" : "Nova senha"}</Rotulo>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("password")}
                  id="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  placeholder={`Mínimo ${SENHA_MINIMA} caracteres`}
                  className={campoComIcone}
                />
              </div>
              <ErroDoCampo>{errors.password?.message}</ErroDoCampo>
            </div>

            <div>
              <Rotulo htmlFor="confirmar-senha">
                {primeiroAcesso ? "Confirmar senha" : "Confirmar nova senha"}
              </Rotulo>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("confirmPassword")}
                  id="confirmar-senha"
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
              className={`${botaoBrasa} h-[52px] w-full text-[15px]`}
            >
              {loading ? "Salvando..." : primeiroAcesso ? "Criar senha e entrar" : "Redefinir senha"}
            </button>
          </form>

          {!primeiroAcesso && (
            <p className="mt-6 text-center text-sm">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center font-bold text-loja-preco hover:text-forest-dark"
              >
                Voltar ao login
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
