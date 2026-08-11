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
      {/* Coluna no desktop, barra no rodapé no celular.
          A sidebar é clara, e não mais um bloco terracota: uma coluna de cor
          cheia ao lado de números coloridos disputa a atenção com eles. Em
          papel, ela desaparece e o dado fica sendo a única coisa saturada da
          tela. */}
      <aside className="bg-console-cartao border-console-linha md:fixed md:inset-y-0 md:left-0 md:w-60 md:flex md:flex-col md:p-5 md:border-r fixed bottom-0 inset-x-0 z-20 px-3 py-2 md:py-5 border-t md:border-t-0">
        <div className="hidden md:block mb-9 px-2">
          <Image
            src="/muno-marca.png"
            alt="Muno"
            width={682}
            height={155}
            className="h-7 w-auto object-contain"
            priority
          />
          <p className="text-[12px] text-console-tinta/45 mt-1.5">plataforma</p>
        </div>

        <MenuLateral />

        <div className="hidden md:block mt-auto pt-4 border-t border-console-linha space-y-2">
          <p className="text-xs text-console-tinta/45 truncate px-2">
            {session.user.email}
          </p>
          <BotaoSair />
        </div>
      </aside>

      {/* Sair sobe para o topo no celular, onde o rodapé é o menu. */}
      <div className="md:hidden flex items-center justify-between bg-console-cartao border-b border-console-linha px-4 py-3">
        <Image
          src="/muno-marca.png"
          alt="Muno"
          width={682}
          height={155}
          className="h-6 w-auto object-contain"
          priority
        />
        <BotaoSair />
      </div>

      <main className="md:ml-60 px-5 md:px-8 py-7 md:py-9 pb-28 md:pb-12 max-w-[1180px]">
        {children}
      </main>
    </div>
  );
}
