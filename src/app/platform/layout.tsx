import type { Metadata } from "next";
import Image from "next/image";
import { Inter } from "next/font/google";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { diasDeAtraso } from "@/lib/assinatura/regua";
import { MenuInferior, MenuLateral } from "@/components/platform/MenuLateral";
import { BotaoSair } from "@/components/platform/BotaoSair";
import { TemaBotao } from "@/components/platform/TemaBotao";
import { BotaoInstalar } from "@/components/platform/BotaoInstalar";

/**
 * A identidade do console nas tags que o manifest não alcança.
 *
 * O Safari ignora boa parte do manifest e lê meta tag, então sem isto o
 * console instalado num iPhone se chamaria "Muno" e usaria o ícone da landing:
 * dois atalhos idênticos na mesma tela inicial, para dois produtos diferentes.
 * O manifest (src/app/manifest.ts) resolve o mesmo pelo lado do Android.
 */
export const metadata: Metadata = {
  title: "Muno Admin",
  applicationName: "Muno Admin",
  appleWebApp: { capable: true, title: "Admin", statusBarStyle: "default" },
  icons: {
    icon: { url: "/icons/gestao-192.png", type: "image/png", sizes: "192x192" },
    apple: {
      url: "/icons/gestao-apple-180.png",
      type: "image/png",
      sizes: "180x180",
    },
  },
};

// O desenho do console segue o Core 2.0, que é desenhado em Inter. Carregada
// aqui e não no layout raiz: nenhum outro produto do projeto usa, e no raiz ela
// entraria no CSS de todo cardápio de restaurante.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await authPlatform();

  // Sem sessão, só a tela de login renderiza — o proxy já redireciona, mas a
  // autorização precisa existir aqui também, não só no roteamento. O wrapper
  // fica, porque é ele que leva a Inter e o [data-console]: sem isso a tela de
  // entrada seria o único lugar do console em outra tipografia.
  if (!session?.user) {
    return (
      <div
        data-console
        className={`${inter.variable} min-h-screen bg-console-papel text-console-tinta antialiased`}
      >
        {children}
      </div>
    );
  }

  // Os selos do menu. Contagem pura, e a de atraso usa o mesmo diasDeAtraso da
  // visão geral e da lista de clientes, para o número no menu nunca discordar
  // do número na tela que ele abre.
  const agora = new Date();
  const [novos, negociando, emAberto] = await Promise.all([
    prismaUnscoped.lead.count({ where: { status: "NOVO" } }),
    prismaUnscoped.lead.count({ where: { status: "NEGOCIACAO" } }),
    prismaUnscoped.cobranca.findMany({
      where: { status: { in: ["PENDENTE", "VENCIDA"] } },
      select: { vencimento: true },
    }),
  ]);
  const contagens = {
    novos,
    negociando,
    atrasadas: emAberto.filter((c) => diasDeAtraso(c.vencimento, agora) > 0)
      .length,
  };

  const email = session.user.email ?? "";
  const nome = session.user.name ?? email.split("@")[0];

  return (
    <div
      data-console
      className={`${inter.variable} min-h-screen bg-console-papel text-console-tinta antialiased`}
    >
      {/* A coluna do Core: sem borda e sem fundo próprio. Ela mora no mesmo
          cinza do papel, e só os cartões do conteúdo são brancos, então a
          navegação some e o dado fica sendo o que se destaca. */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-20 w-[272px] flex-col px-5 pt-8 pb-5 overflow-y-auto no-scrollbar">
        {/* O logotipo é a marca escrita, não o ícone do atalho: é assim que o
            console se apresentava antes do redesenho, e é o desenho que a Muno
            usa em toda peça sua. */}
        <div className="px-2.5 mb-10">
          <Image
            src="/muno-marca.png"
            alt="Muno"
            width={682}
            height={155}
            className="h-7 w-auto object-contain"
            priority
          />
          <p className="text-[12px] text-console-mudo mt-1.5">plataforma</p>
        </div>

        <MenuLateral contagens={contagens} />

        <div className="mt-auto pt-8 space-y-3">
          <TemaBotao />
          <div className="flex items-center gap-3 rounded-2xl px-2.5 py-2">
            <span className="size-9 shrink-0 rounded-full bg-console-cartao flex items-center justify-center text-[14px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              {nome.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium truncate">{nome}</p>
              <p className="text-[12px] text-console-mudo truncate">{email}</p>
            </div>
          </div>
          {/* Some sozinho quando não há o que oferecer, então pode ficar aqui
              e na barra do celular ao mesmo tempo. */}
          <BotaoInstalar />
          <BotaoSair />
        </div>
      </aside>

      {/* Sair sobe para o topo no celular, onde o rodapé é o menu. */}
      <div className="md:hidden sticky top-0 z-20 flex items-center justify-between bg-console-papel/85 backdrop-blur-md px-4 py-3">
        <Image
          src="/muno-marca.png"
          alt="Muno"
          width={682}
          height={155}
          className="h-6 w-auto object-contain"
          priority
        />
        <div className="flex items-center gap-1">
          {/* No celular é aqui que o botão aparece: o rodapé é o menu, e o
              bloco do desktop está escondido pelo breakpoint. */}
          <BotaoInstalar />
          <BotaoSair />
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-console-papel/90 backdrop-blur-md border-t border-console-linha pb-[env(safe-area-inset-bottom)]">
        <MenuInferior contagens={contagens} />
      </div>

      <main className="md:ml-[272px] px-4 sm:px-6 md:pl-3 md:pr-10 pt-3 md:pt-10 pb-28 md:pb-14">
        <div className="max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}
