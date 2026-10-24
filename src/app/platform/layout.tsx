import type { Metadata } from "next";
import Image from "next/image";
import { Inter } from "next/font/google";
import { unstable_cache } from "next/cache";
import type { LeadStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { avaliarSaude } from "@/lib/saude/avaliar";
import { coletarSaudeDaRequisicao } from "@/lib/saude/coletar";
import { inicioDoAtraso } from "./atraso";
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

/** O valor de reserva de uma contagem do menu que falhou, com a linha no log. */
function contagemFalhou<T>(reserva: T) {
  return (erro: unknown): T => {
    console.error("[console] contagem do menu falhou", erro instanceof Error ? erro.name : "erro");
    return reserva;
  };
}

/**
 * Os selos do menu, guardados por um minuto entre requisições.
 *
 * O layout roda em toda página do console, e sem cache cada clique pagava três
 * contagens na ida e volta até o banco. Um selo que demora até um minuto para
 * mudar não engana ninguém: a tela que ele abre lê ao vivo. A saúde fica de
 * fora de propósito (ver coletarSaudeDaRequisicao): um "banco OK" guardado
 * mentiria no minuto em que o banco caísse.
 */
const UM_MINUTO = 60;

const contarLeads = unstable_cache(
  (status: LeadStatus) => prismaUnscoped.lead.count({ where: { status } }),
  ["console:menu:leads"],
  { revalidate: UM_MINUTO, tags: ["console:menu"] }
);

// Contagem no banco, e não as linhas filtradas aqui: o selo só precisa do
// número, e trazer toda cobrança em aberto para contar era carregar a lista a
// cada página. O limite entra como argumento (string, que é o que a chave do
// cache serializa) para a virada do dia mudar a chave.
const contarAtrasadas = unstable_cache(
  (limite: string) =>
    prismaUnscoped.cobranca.count({
      where: { status: { in: ["PENDENTE", "VENCIDA"] }, vencimento: { lt: new Date(limite) } },
    }),
  ["console:menu:atrasadas"],
  { revalidate: UM_MINUTO, tags: ["console:menu"] }
);

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

  // Os selos do menu. Contagem pura, e a de atraso usa um limite equivalente
  // ao diasDeAtraso da visão geral e da lista de clientes (ver atraso.ts),
  // para o número no menu nunca discordar do número na tela que ele abre.
  //
  // Contagem que falha vira zero, e não erro de página: este layout envolve a
  // tela de saúde, que precisa abrir justamente com o banco fora do ar. No log
  // vai só a classe do erro, porque a mensagem do Prisma pode trazer o SQL.
  //
  // O `.catch` fica do lado de fora do cache: falha não é guardada, e a
  // próxima página tenta de novo em vez de mostrar zero por um minuto.
  const [novos, negociando, atrasadas, saude] = await Promise.all([
    contarLeads("NOVO").catch(contagemFalhou(0)),
    contarLeads("NEGOCIACAO").catch(contagemFalhou(0)),
    contarAtrasadas(inicioDoAtraso(new Date()).toISOString()).catch(contagemFalhou(0)),
    coletarSaudeDaRequisicao(),
  ]);
  const contagens = { novos, negociando, atrasadas };

  // O ponto do item "Saúde" no menu: a mesma regra da tela e do monitor, e a
  // mesma leitura que a tela de saúde usa quando é ela que está abrindo.
  const corDaSaude = avaliarSaude(saude.dados, saude.agora).geral;

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

        <MenuLateral contagens={contagens} saude={corDaSaude} />

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

      {/* A barra do topo no celular, onde o rodapé é o menu.
          Três decisões de desenho moram aqui:
          * ela reserva o safe-area do iPhone, porque o console instala na tela
            inicial e sem isso a marca fica embaixo do relógio;
          * o fundo é o próprio papel com blur, e a separação é um fio que
            desbota nas pontas, em vez de uma borda de ponta a ponta — barra e
            conteúdo são a mesma superfície, e uma linha cheia aqui corta a
            tela em duas;
          * as ações viram alvos redondos de 40px com ícone, e não texto: em
            375px, "Instalar" e "Sair" escritos ocupam a largura que o polegar
            precisa para acertar. */}
      <header className="md:hidden sticky top-0 z-30 bg-console-papel/80 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between gap-2 px-4 h-[60px]">
          <Image
            src="/muno-marca.png"
            alt="Muno"
            width={682}
            height={155}
            className="h-6 w-auto object-contain"
            priority
          />
          <div className="flex items-center gap-1">
            <TemaBotao compacto />
            {/* No celular é aqui que o botão aparece: o rodapé é o menu, e o
                bloco do desktop está escondido pelo breakpoint. */}
            <BotaoInstalar compacto />
            <BotaoSair compacto />
          </div>
        </div>
        <div
          aria-hidden
          className="h-px bg-gradient-to-r from-transparent via-console-linha to-transparent"
        />
      </header>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-console-papel/90 backdrop-blur-md border-t border-console-linha pb-[env(safe-area-inset-bottom)]">
        <MenuInferior contagens={contagens} saude={corDaSaude} />
      </div>

      <main className="md:ml-[272px] px-4 sm:px-6 md:pl-3 md:pr-10 pt-3 md:pt-10 pb-28 md:pb-14">
        <div className="max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}
