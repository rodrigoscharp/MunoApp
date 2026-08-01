import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { LogOut } from "lucide-react";

export default async function MotoboyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAuthenticated =
    !!session?.user && (session.user.role === "MOTOBOY" || session.user.role === "ADMIN");

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {isAuthenticated && (
        <header className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center text-white font-bold text-sm">
              {session.user.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{session.user.name}</p>
              <p className="text-xs text-neutral-400 mt-0.5">Motoboy</p>
            </div>
          </div>

          <form
            action={async () => {
              "use server";
              // `redirect: false` + redirect relativo: com redirectTo o
              // NextAuth monta o destino a partir de AUTH_URL/NEXTAUTH_URL,
              // que em produção aponta para localhost:3000 — o entregador
              // saía do app para uma porta local.
              await signOut({ redirect: false });
              redirect("/motoboy/login");
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition px-3 py-2 rounded-lg hover:bg-neutral-800"
            >
              <LogOut size={14} />
              Sair
            </button>
          </form>
        </header>
      )}
      <main className="max-w-lg mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
