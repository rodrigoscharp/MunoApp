"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signInPlatform } from "@/lib/auth-platform";

export async function loginPlataforma(
  _anterior: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  try {
    // `redirect: false` de propósito. Com redirectTo, o NextAuth monta o
    // destino a partir de AUTH_URL/NEXTAUTH_URL — que em produção está como
    // http://localhost:3000 e mandava o login para a porta 3000. Aqui ele só
    // valida a credencial e grava o cookie; quem navega é a linha abaixo.
    await signInPlatform("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) return "E-mail ou senha inválidos.";
    throw err;
  }

  // Caminho relativo: o navegador resolve contra a origem atual, então
  // funciona em admin.munoapp.com.br e em localhost sem depender de variável
  // de ambiente nenhuma. Fica fora do try porque redirect() sinaliza por
  // exceção — capturá-la travaria o login numa tela que nunca navega.
  redirect("/");
}
