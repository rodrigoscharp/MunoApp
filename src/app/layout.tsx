import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fredoka } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { RegistroServiceWorker } from "@/components/pwa/RegistroServiceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Repete a geometria pesada e redonda do logotipo. Só o console usa, e só nos
// títulos e números grandes.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Muno - Bateu fome né?",
  description: "Peça online com facilidade e acompanhe seu pedido em tempo real.",
  applicationName: "Muno",
  // O Safari ignora boa parte do manifest e lê estas meta tags no lugar: sem
  // elas o atalho do iPhone abre dentro do navegador, com barra de endereço,
  // que é exatamente o que instalar deveria tirar.
  //
  // O título aqui é o da plataforma. Em subdomínio de restaurante ele é
  // sobrescrito por src/app/(client)/layout.tsx, que sabe o nome do
  // restaurante; o manifest faz o mesmo pelo lado do Android.
  appleWebApp: {
    capable: true,
    title: "Muno",
    // "default" e não "black-translucent": o translúcido joga o conteúdo por
    // baixo da barra de status do iPhone, e nenhuma tela deste app reserva o
    // safe-area-inset que isso exigiria. O relógio ficaria por cima do
    // cabeçalho do cardápio.
    statusBarStyle: "default",
  },
  // appleWebApp.capable emite só `mobile-web-app-capable`, que é o nome
  // padronizado que o Chrome pede hoje. O iOS anterior ao 16.4 não conhecia
  // manifest e lê apenas a variante com prefixo: sem ela o atalho naquele
  // aparelho abre com barra de endereço, que é o que instalar deveria tirar.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Pinta a barra do navegador e a moldura do app instalado. Segue os três
  // estados de tema do console (ver globals.css): terracota no claro, o mesmo
  // papel escuro no escuro, senão a moldura clara emoldura uma tela preta.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#D4612A" },
    { media: "(prefers-color-scheme: dark)", color: "#181411" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning cobre UM atributo e por um motivo declarado: o
    // script logo abaixo escreve data-tema no <html> antes da hidratação, e o
    // servidor não tem como saber a preferência de quem ainda não pediu página
    // nenhuma. A divergência é deliberada, e sem isto o React reclama dela em
    // toda navegação. Vale só para este elemento, não para a árvore.
    <html
      suppressHydrationWarning
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} h-full antialiased`}
    >
      <head>
        {/*
          Aplica o tema escolhido ANTES da primeira pintura.
          Sem isto, quem escolheu escuro vê o console claro por um quadro e
          então ele pisca para escuro, em toda navegação de página inteira.
          Precisa ser síncrono e inline por isso: qualquer script adiado já
          chega depois da pintura.

          Só grava o atributo quando há escolha explícita gravada. Ausência é o
          estado "sistema", em que quem manda é prefers-color-scheme, e escrever
          o atributo aqui tiraria essa resposta automática de quem nunca
          escolheu nada.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('muno-tema');if(t==='claro'||t==='escuro'){document.documentElement.dataset.tema=t}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/*
          O SessionProvider do NextAuth NÃO mora aqui. Ele pede
          /api/auth/session no cliente, e o layout raiz cobre também
          admin.<dominio>, onde essa rota não existe: o proxy manda para
          /platform/login ou reescreve para uma rota inexistente, e o fetch
          recebe HTML — ClientFetchError em toda navegação do CRM. Quem usa
          useSession são Header, checkout e as notificações de pedido, todos
          sob (client); o provider vive lá. signIn/signOut não precisam dele.
        */}
        {children}
        <Toaster position="bottom-center" richColors />
        {/*
          Registra /sw.js, e só isso: não desenha nada. Mora aqui porque o
          registro é por ORIGEM, e este layout é o único ponto que cobre os
          quatro hosts do projeto (landing, console, cardápio e gestão).
        */}
        <RegistroServiceWorker />
      </body>
    </html>
  );
}
