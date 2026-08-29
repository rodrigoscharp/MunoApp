import { validateSlug, ProvisionError } from "@/lib/tenant-provisioning";

// Reexportada por compatibilidade — quem só precisa de checarSlug (server)
// continua importando os dois deste arquivo. Mas dois Client Components
// (ConverterLead e FormularioAssinatura) importam sugerirSlug direto de
// ./sugerir-slug, e NÃO daqui: importar qualquer coisa deste módulo no
// navegador arrasta o `validateSlug` acima até tenant-provisioning -> prisma
// -> tenant-context -> node:async_hooks, e o build de produção
// (next build --webpack) falha inteiro. Ver o comentário de
// sugerir-slug.ts para o porquê completo.
export { sugerirSlug } from "./sugerir-slug";

export type Disponibilidade =
  | { livre: true }
  | { livre: false; motivo: "INVALIDO" | "RESERVADO" | "EM_USO" };

/**
 * Recebe as buscas por parâmetro em vez de importar o Prisma: assim a regra é
 * testável sem banco, e a rota decide qual cliente usar.
 *
 * O formato é checado antes de qualquer consulta — endpoint público não
 * consulta banco por causa de texto que nunca poderia ser um slug.
 *
 * Contrato: espera o slug JÁ normalizado (minúsculo, sem espaço nas pontas).
 * Esta função não normaliza — entrada fora do formato não é corrigida, é
 * recusada como INVALIDO, porque a regex de validateSlug só admite
 * minúsculas. É falha fechada de propósito: não "conserte" adicionando um
 * toLowerCase() aqui dentro, isso mudaria o contrato sem que quem chama
 * perceba. Quem for chamar checarSlug de outro lugar precisa normalizar
 * antes.
 */
export async function checarSlug(
  slug: string,
  buscas: {
    tenant: (s: string) => Promise<boolean>;
    inscricao: (s: string) => Promise<boolean>;
  }
): Promise<Disponibilidade> {
  try {
    validateSlug(slug);
  } catch (err) {
    if (err instanceof ProvisionError) {
      return {
        livre: false,
        motivo: err.code === "SLUG_RESERVADO" ? "RESERVADO" : "INVALIDO",
      };
    }
    throw err;
  }

  // A lista de reservados mora num lugar só (RESERVED_SLUGS, em
  // tenant-provisioning.ts) e chega aqui de graça via validateSlug acima: um
  // subdomínio novo da plataforma passa a valer aqui sem precisar tocar neste
  // arquivo.

  if (await buscas.tenant(slug)) return { livre: false, motivo: "EM_USO" };
  if (await buscas.inscricao(slug)) return { livre: false, motivo: "EM_USO" };
  return { livre: true };
}
