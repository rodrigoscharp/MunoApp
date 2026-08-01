"use server";

import { AuthError } from "next-auth";
import { signInPlatform } from "@/lib/auth-platform";

export async function loginPlataforma(
  _anterior: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  try {
    await signInPlatform("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      // Redireciona para a raiz: o proxy reescreve admin.<root>/ para
      // /platform, então a URL fica limpa no navegador.
      redirectTo: "/",
    });
  } catch (err) {
    // Só trate falha de credencial. O signIn bem-sucedido lança um
    // NEXT_REDIRECT que PRECISA propagar — capturá-lo trava o login numa
    // tela que nunca navega.
    if (err instanceof AuthError) return "E-mail ou senha inválidos.";
    throw err;
  }
}
