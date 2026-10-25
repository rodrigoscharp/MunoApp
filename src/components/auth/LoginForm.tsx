"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
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
import { pedirConviteAposLogin } from "@/components/pwa/convitePosLogin";
import { destinoSeguro } from "@/lib/redirect-seguro";
import type { RestaurantInfo } from "@/lib/restaurant";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm({ restaurantInfo }: { restaurantInfo: RestaurantInfo }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sem o `?? "/"` de antes: o destino padrão passou a depender do papel de
  // quem entrou (ver onSubmit), e um default aqui apagaria essa distinção.
  // Só destino interno. Um callbackUrl externo conta como ausente, e o destino
  // volta a depender do papel. Ver src/lib/redirect-seguro.ts.
  const callbackUrl = destinoSeguro(searchParams.get("callbackUrl"), null);
  // Posto por ResetPasswordForm depois da criação da primeira senha. Só troca
  // a saudação: quem entra é a credencial, sempre.
  const primeiroAcesso = searchParams.get("novo") === "1";
  const registerHref = callbackUrl
    ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/register";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email ou senha incorretos");
      setLoading(false);
      return;
    }

    // O papel não vem no retorno do signIn, então lemos a sessão recém-criada.
    // Vale o round-trip: mandar todo mundo para /adm e deixar o proxy devolver
    // quem não é ADMIN faria o cliente ver a tela do painel piscar antes de
    // ser expulso.
    const sessao = await getSession();

    // Dono que faz login quer gerenciar, não pedir comida. Antes o destino era
    // sempre "/", e o dono entrava na Muno pela primeira vez caindo na própria
    // vitrine, sem nunca encontrar o painel. Para ver o cardápio como cliente
    // ele abre o endereço, que é público e não pede senha.
    //
    // A equipe da cozinha também: ela caía na vitrine e precisava saber que o
    // quadro mora em /dashboard, um endereço que ninguém digita de memória.
    //
    // callbackUrl tem precedência: quem foi barrado numa página específica
    // volta para ela, não para o painel.
    const papel = sessao?.user?.role;
    const destino =
      callbackUrl ?? (papel === "ADMIN" ? "/adm" : papel === "KITCHEN" ? "/dashboard" : "/");

    // Deixa o bilhete do convite de instalação, que o ConviteDeInstalacao
    // consome na tela seguinte. Aqui não dá para mostrá-lo: o router.push
    // logo abaixo troca a tela antes de qualquer coisa ser lida.
    //
    // Só para quem cai na área do cliente. O painel de gestão e a cozinha não
    // montam o convite (ele vive no layout de (client)), e sem esta condição o
    // bilhete ficaria guardado esperando o dono abrir o próprio cardápio, para
    // aí convidá-lo do nada, sem login nenhum por perto.
    if (!destino.startsWith("/adm") && !destino.startsWith("/dashboard")) {
      pedirConviteAposLogin();
    }

    router.push(destino);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AuthBrandPanel
        restaurantInfo={restaurantInfo}
        descricao="Sabor e qualidade em cada prato. Faça seu pedido online com facilidade."
      />

      <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:px-6 lg:items-center lg:py-12">
        <div className={`${cartao} w-full max-w-sm p-6 sm:p-8`}>
          <TituloDaTela
            rotulo="Sua conta"
            titulo={primeiroAcesso ? "Tudo pronto!" : "Bem-vindo de volta"}
            subtitulo={
              primeiroAcesso
                ? "Entre com seu e-mail e a senha que você acabou de criar."
                : "Entre com suas credenciais para continuar"
            }
          />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Rotulo htmlFor="login-email">Email</Rotulo>
              <div className="relative">
                <Mail size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("email")}
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  className={campoComIcone}
                />
              </div>
              <ErroDoCampo>{errors.email?.message}</ErroDoCampo>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Rotulo htmlFor="login-senha">Senha</Rotulo>
                <Link
                  href="/esqueci-senha"
                  className="-mt-1.5 inline-flex min-h-11 items-center text-[13px] font-bold text-loja-preco transition hover:text-forest-dark"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className={iconeDoCampo} />
                <input
                  {...register("password")}
                  id="login-senha"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`${campoComIcone} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-loja-tinta-2 transition hover:text-loja-tinta"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <ErroDoCampo>{errors.password?.message}</ErroDoCampo>
            </div>

            <AvisoDeErro>{error}</AvisoDeErro>

            <button
              type="submit"
              disabled={loading}
              className={`${botaoBrasa} mt-2 h-[52px] w-full text-[15px]`}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-loja-tinta-2">
            Não tem conta?{" "}
            <Link
              href={registerHref}
              className="inline-flex min-h-11 items-center font-bold text-loja-preco hover:text-forest-dark"
            >
              Cadastre-se grátis
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
