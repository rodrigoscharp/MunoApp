import Image from "next/image";
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
    <div className="min-h-screen bg-console-papel text-console-tinta">
      {/* Coluna no desktop, barra no rodapé no celular. */}
      <aside className="bg-console-campo md:fixed md:inset-y-0 md:left-0 md:w-64 md:flex md:flex-col md:p-6 fixed bottom-0 inset-x-0 z-20 px-3 py-2 md:py-6">
        <div className="hidden md:block mb-10">
          {/* A logo da própria Muno, invertida em branco — o mesmo tratamento
              que as telas de conta do app já usam. */}
          <Image
            src="/munowbg.png"
            alt="Muno"
            width={160}
            height={60}
            className="h-9 w-auto object-contain brightness-0 invert"
            priority
          />
          <p className="text-[13px] text-white/60 mt-2">plataforma</p>
        </div>

        <MenuLateral />

        <div className="hidden md:block mt-auto pt-5 border-t border-white/15 space-y-2">
          <p className="text-xs text-white/50 truncate">{session.user.email}</p>
          <BotaoSair />
        </div>
      </aside>

      {/* Sair sobe para o topo no celular, onde o rodapé é o menu. */}
      <div className="md:hidden flex items-center justify-between bg-console-campo px-4 py-3">
        <Image
          src="/munowbg.png"
          alt="Muno"
          width={120}
          height={45}
          className="h-6 w-auto object-contain brightness-0 invert"
          priority
        />
        <BotaoSair />
      </div>

      <main className="md:ml-64 px-5 md:px-10 py-7 md:py-12 pb-28 md:pb-12 max-w-5xl">
        {children}
      </main>
    </div>
  );
}
