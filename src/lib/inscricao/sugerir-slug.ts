/**
 * Vive num arquivo próprio, sem NENHUM import — nem de `checarSlug`, nem de
 * `tenant-provisioning` — porque dois Client Components chamam esta função
 * direto no navegador (ConverterLead, no CRM, e FormularioAssinatura, no
 * checkout público). Antes ela morava dentro de src/lib/inscricao/slug.ts,
 * junto de `checarSlug`; importar só `sugerirSlug` de lá bastava para o
 * bundler seguir o `import { validateSlug } from "@/lib/tenant-provisioning"`
 * daquele arquivo até `prisma.ts` e `tenant-context.ts`, que usa
 * `node:async_hooks` — o webpack não sabe empacotar esquema `node:` para o
 * navegador, e o build de produção falha inteiro (`next build --webpack`).
 * Um módulo puro, sem import nenhum, não tem como arrastar isso: quem chama
 * `sugerirSlug` no cliente não precisa saber que `checarSlug` existe.
 */
export function sugerirSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
