import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fredoka } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      </body>
    </html>
  );
}
