import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getRestaurantInfo } from "@/lib/restaurant";
import { montarManifest } from "@/lib/pwa/manifest";

/**
 * /manifest.webmanifest, montado por host.
 *
 * O x-tenant-id vem do proxy, que só o injeta em subdomínio de restaurante.
 * No raiz (a landing) e em admin. (o console) o header não existe, e o
 * manifest sai com a marca da plataforma. A lógica em si mora em
 * src/lib/pwa/manifest.ts, com teste ao lado; aqui fica só a leitura do
 * header.
 *
 * Ler headers() é o que tira esta rota do cache estático, que é justamente o
 * necessário: um manifest cacheado no build serviria o mesmo nome para todos
 * os restaurantes.
 *
 * Ele atravessa o proxy em qualquer host porque `isEstatico()` casa a extensão
 * `.webmanifest` e deixa passar antes do 404 do domínio raiz.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const tenantId = (await headers()).get("x-tenant-id");
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
