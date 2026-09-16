import { redirect } from "next/navigation";
import { signOutPlatform } from "@/lib/auth-platform";
import { LogOut } from "lucide-react";

/**
 * `compacto` é a forma do celular: só o ícone, num alvo redondo de 40px. A
 * barra do topo tem 375px para marca e três ações, e "Sair" escrito por
 * extenso ali come o espaço de um alvo que o polegar alcança.
 */
export function BotaoSair({ compacto = false }: { compacto?: boolean }) {
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
      {compacto ? (
        <button
          type="submit"
          aria-label="Sair"
          title="Sair"
          className="size-10 rounded-full flex items-center justify-center text-console-segunda hover:text-console-tinta hover:bg-console-tinta/[0.05] transition"
        >
          <LogOut size={18} />
        </button>
      ) : (
        <button
          type="submit"
          className="flex items-center gap-2 px-2 text-sm text-console-segunda hover:text-console-tinta transition"
        >
          <LogOut size={15} />
          Sair
        </button>
      )}
    </form>
  );
}
