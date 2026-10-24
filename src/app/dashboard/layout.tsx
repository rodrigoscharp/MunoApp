import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChefHat } from "lucide-react";

export default async function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (
    !session ||
    (session.user.role !== "ADMIN" && session.user.role !== "KITCHEN")
  ) {
    // Com o callbackUrl, quem entra pela tela de login volta ao quadro, e não
    // ao destino padrão do papel.
    redirect(`/login?callbackUrl=${encodeURIComponent("/dashboard")}`);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChefHat className="text-brand-muted" size={20} />
          <span className="font-bold text-lg">Cozinha</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-neutral-400 hover:text-white transition">
            Cardápio
          </Link>
          {session.user.role === "ADMIN" && (
            <Link href="/adm" className="text-sm text-neutral-400 hover:text-white transition">
              Admin
            </Link>
          )}
          <span className="text-xs text-neutral-600">{session.user.name}</span>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
