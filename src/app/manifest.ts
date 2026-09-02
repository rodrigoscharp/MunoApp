import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getRestaurantInfo } from "@/lib/restaurant";
import { montarManifest, montarManifestDaPlataforma } from "@/lib/pwa/manifest";
import { tipoDeHost } from "@/lib/hosts";

/**
 * /manifest.webmanifest, montado por host.
 *
 * São três produtos, e cada um instala como um app separado porque cada host
 * é uma origem diferente:
 *
 *   <slug>.<dominio>  o cardápio, com nome e logo do restaurante
 *   admin.<dominio>   o console, "Muno Admin", com GESTÃO no ícone
 *   <dominio>         a landing e o checkout, "Muno"
 *
 * O x-tenant-id vem do proxy, que só o injeta em subdomínio de restaurante.
 * Quem separa o console do raiz é `tipoDeHost`, importado de @/lib/hosts —
 * a MESMA implementação que o proxy usa, e não uma cópia. A lógica de montar
 * mora em src/lib/pwa/manifest.ts, com teste ao lado.
 *
 * Ler headers() é o que tira esta rota do cache estático, que é justamente o
 * necessário: um manifest cacheado no build serviria o mesmo nome para todos
 * os restaurantes.
 *
 * Ele atravessa o proxy em qualquer host porque `isEstatico()` casa a extensão
 * `.webmanifest` e deixa passar antes do 404 do domínio raiz.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cabecalhos = await headers();

  if (tipoDeHost(cabecalhos.get("host") ?? "") === "plataforma") {
    return montarManifestDaPlataforma();
  }

  const tenantId = cabecalhos.get("x-tenant-id");
  if (!tenantId) return montarManifest(null);

  try {
    const info = await getRestaurantInfo(tenantId);
    return montarManifest(info.name, info.logoUrl);
  } catch {
    // Um manifest que lança vira 500, e um 500 aqui não degrada a aparência:
    // ele tira a instalação do ar por completo, sem nada na tela para
    // denunciar. O nome da plataforma é um fallback melhor que isso.
    return montarManifest(null);
  }
}
