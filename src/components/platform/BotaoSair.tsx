import { signOutPlatform } from "@/lib/auth-platform";
import { LogOut } from "lucide-react";

export function BotaoSair() {
  return (
    <form
      action={async () => {
        "use server";
        await signOutPlatform({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition"
      >
        <LogOut size={15} />
        Sair
      </button>
    </form>
  );
}
