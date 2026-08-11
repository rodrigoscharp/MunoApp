import { redirect } from "next/navigation";
import { signOutPlatform } from "@/lib/auth-platform";
import { LogOut } from "lucide-react";

export function BotaoSair() {
  return (
    <form
      action={async () => {
        "use server";
        // `redirect: false` pelo mesmo motivo do login: com redirectTo o
        // NextAuth monta o destino a partir de AUTH_URL/NEXTAUTH_URL, que em
        // produção aponta para localhost:3000. Aqui ele só apaga o cookie.
        await signOutPlatform({ redirect: false });
        // Caminho relativo, resolvido contra a origem atual.
        redirect("/platform/login");
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-2 px-2 text-sm text-console-tinta/50 hover:text-console-campo transition"
      >
        <LogOut size={15} />
        Sair
      </button>
    </form>
  );
}
