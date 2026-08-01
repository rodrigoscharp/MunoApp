import { authPlatform } from "@/lib/auth-platform";
import { MenuLateral } from "@/components/platform/MenuLateral";
import { BotaoSair } from "@/components/platform/BotaoSair";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await authPlatform();

  // Sem sessão, só a tela de login renderiza — o proxy já redireciona, mas a
  // autorização precisa existir aqui também, não só no roteamento.
  if (!session?.user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-console-fundo text-console-tinta">
      {/* Coluna no desktop, barra no rodapé no celular. */}
      <aside className="bg-console-verde md:fixed md:inset-y-0 md:left-0 md:w-60 md:flex md:flex-col md:p-5 fixed bottom-0 inset-x-0 z-20 px-3 py-2 md:py-5">
        <div className="hidden md:block mb-8">
          <p className="text-white font-bold tracking-tight">MUNO</p>
          <p className="tabular text-[11px] uppercase tracking-[0.18em] text-white/40">
            plataforma
          </p>
        </div>

        <MenuLateral />

        <div className="hidden md:block mt-auto pt-5 border-t border-white/10 space-y-1.5">
          <p className="text-xs text-white/40 truncate">{session.user.email}</p>
          <BotaoSair />
        </div>
      </aside>

      {/* Sair sobe para o topo no celular, onde o rodapé é o menu. */}
      <div className="md:hidden flex items-center justify-between bg-console-verde px-4 py-3">
        <p className="text-white font-bold tracking-tight text-sm">MUNO</p>
        <BotaoSair />
      </div>

      <main className="md:ml-60 px-4 md:px-8 py-6 md:py-10 pb-24 md:pb-10 max-w-5xl">
        {children}
      </main>
    </div>
  );
}
