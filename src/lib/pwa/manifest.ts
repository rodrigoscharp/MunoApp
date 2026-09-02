import type { MetadataRoute } from "next";

/**
 * O manifest do PWA, montado a partir de quem é o dono do host.
 *
 * Cada subdomínio é uma ORIGEM diferente, e o navegador trata cada origem como
 * um app instalável separado. Isso é o que obriga o manifest a ser dinâmico:
 * quem instala a partir de pizzaria.munoapp.com.br é o cliente do restaurante,
 * e um ícone chamado "Muno" na tela inicial dele nomeia a plataforma que ele
 * não conhece em vez do negócio onde ele pede comida. No raiz e em admin. não
 * há restaurante, e aí "Muno" é o nome certo.
 *
 * O ÍCONE, ao contrário do nome, continua sempre o da Muno. O logo do cadastro
 * é upload de dimensão desconhecida, e o Chrome descarta ícone cuja imagem não
 * bate com o `sizes` declarado. O efeito não é um ícone feio: é a instalação
 * deixar de ser oferecida, sem erro em lugar nenhum. Servir o logo do cliente
 * aqui pede uma rota que normalize o arquivo antes.
 */

// Os mesmos valores de src/app/globals.css: --background e --primary.
const PAPEL = "#F5F2EE";
const TERRACOTA = "#D4612A";

// O que cabe embaixo do ícone na tela inicial antes do aparelho cortar com
// reticências. Android e iOS variam, e 12 é o menor denominador comum seguro.
const LIMITE_DO_NOME_CURTO = 12;

/**
 * Encurta o nome do restaurante para caber embaixo do ícone.
 *
 * "Hamburgueria do Seu Zé Ubatuba" cortado pelo aparelho vira "Hamburgueri…",
 * que não identifica ninguém. A primeira palavra quase sempre é a marca, e é
 * ela que a pessoa procura na tela inicial.
 */
export function nomeCurto(nome: string): string {
  const limpo = nome.trim();
  if (limpo.length <= LIMITE_DO_NOME_CURTO) return limpo;

  const primeira = limpo.split(/\s+/)[0];
  return primeira.length <= LIMITE_DO_NOME_CURTO
    ? primeira
    : primeira.slice(0, LIMITE_DO_NOME_CURTO);
}

/**
 * @param nomeDoRestaurante nome do tenant do host, ou null no raiz e no admin.
 */
export function montarManifest(
  nomeDoRestaurante: string | null
): MetadataRoute.Manifest {
  // O trim pega o caso real: getRestaurantInfo devolve name vazio quando o
  // Tenant não tem nome, e um manifest com name vazio é um manifest inválido,
  // que o Chrome recusa sem oferecer instalação e sem reclamar.
  const restaurante = nomeDoRestaurante?.trim() || null;

  const name = restaurante ?? "Muno";
  const description = restaurante
    ? `Peça no ${restaurante} e acompanhe seu pedido em tempo real.`
    : "Peça online com facilidade e acompanhe seu pedido em tempo real.";

  return {
    name,
    short_name: restaurante ? nomeCurto(restaurante) : "Muno",
    description,
    // Relativo ao host de propósito: no subdomínio do restaurante "/" é o
    // cardápio dele, e no raiz é a landing.
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    background_color: PAPEL,
    theme_color: TERRACOTA,
    icons: [
      // Caminhos absolutos: o manifest é servido em /manifest.webmanifest e um
      // caminho relativo resolveria contra a URL dele, não contra a origem.
      { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png" },
      // Gerada por scripts/gerar-icones-pwa.ts sangrando até a borda: quem
      // arredonda a maskable é o sistema, e um canto redondo por baixo da
      // máscara do aparelho deixa uma casca clara acompanhando a curva.
      {
        src: "/icons/icone-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
