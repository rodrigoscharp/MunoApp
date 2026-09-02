import type { MetadataRoute } from "next";
import { origemDoLogo } from "./logo-do-tenant";

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
 * O ÍCONE segue o mesmo princípio, por uma rota que normaliza o logo do
 * cadastro (src/app/icone/[medida]/route.ts). A escolha entre ele e o da Muno
 * é feita AQUI, e não lá, por dois motivos: quem não cadastrou logo não gasta
 * uma ida à rede que terminaria em redirecionamento a cada instalação, e é
 * isto que mantém o tenant "default" com a marca da plataforma, já que o
 * logoUrl dele é o padrão.
 */

// Os mesmos valores de src/app/globals.css: --background e --primary.
const PAPEL = "#F5F2EE";
const TERRACOTA = "#D4612A";

// O que cabe embaixo do ícone na tela inicial antes do aparelho cortar com
// reticências. Android e iOS variam, e 12 é o menor denominador comum seguro.
const LIMITE_DO_NOME_CURTO = 12;

/**
 * Um carimbo curto e estável do logo, para entrar na URL do ícone.
 *
 * A rota responde com `Cache-Control: immutable`, o que só é seguro porque a
 * URL muda quando o logo muda: sem este carimbo, quem trocasse de logo ficaria
 * preso ao antigo no navegador de todo mundo por um ano.
 *
 * Hash próprio, e não node:crypto, para este módulo continuar sem import
 * nenhum além de tipos. É a mesma cautela documentada em
 * src/lib/inscricao/sugerir-slug.ts: um import de esquema `node:` que chegue ao
 * bundle do navegador derruba o build inteiro, e um dia alguém vai querer
 * chamar isto do cliente.
 */
export function versaoDoLogo(logoUrl: string): string {
  // FNV-1a de 32 bits. Não é criptográfico, e não precisa ser: o que se quer é
  // que a URL mude quando o logo mudar.
  let h = 0x811c9dc5;
  for (let i = 0; i < logoUrl.length; i++) {
    h ^= logoUrl.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Os ícones da própria Muno, gerados por scripts/gerar-icones-pwa.ts. */
const ICONES_DA_MUNO: MetadataRoute.Manifest["icons"] = [
  // A PALAVRA "muno", e não o garfo do favicon: nestes tamanhos ela é legível,
  // e é aqui que a pessoa precisa reconhecer a marca entre dezenas de ícones
  // na tela inicial. A 16px, na aba, ela não se lê, e por isso o favicon é
  // outro desenho (ver o script).
  { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png" },
  // Sangra até a borda, e com a palavra encolhida para caber no círculo
  // central de 80%, que é a zona segura do Android. Quem arredonda é o
  // aparelho: um canto redondo no arquivo, por baixo da máscara, deixa uma
  // casca clara na curva.
  {
    src: "/icons/icone-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

/** Os ícones do restaurante, servidos por src/app/icone/[medida]/route.ts. */
function iconesDoRestaurante(logoUrl: string): MetadataRoute.Manifest["icons"] {
  const v = versaoDoLogo(logoUrl);
  return [
    { src: `/icone/192.png?v=${v}`, sizes: "192x192", type: "image/png" },
    { src: `/icone/512.png?v=${v}`, sizes: "512x512", type: "image/png" },
    {
      src: `/icone/maskable.png?v=${v}`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];
}

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
 * @param logoUrl logo cadastrado pelo dono. Ausente, padrão, ou fora da
 *   allowlist de origemDoLogo, o ícone é o da Muno.
 */
export function montarManifest(
  nomeDoRestaurante: string | null,
  logoUrl?: string | null
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
    // Do restaurante quando ele tem logo próprio; da Muno caso contrário.
    icons:
      logoUrl && origemDoLogo(logoUrl)
        ? iconesDoRestaurante(logoUrl)
        : ICONES_DA_MUNO,
  };
}
