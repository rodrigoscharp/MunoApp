import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PlanoTenant, Tenant, User } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { SEM_CADASTRO } from "@/lib/restaurant";

// Subdomínios que a plataforma usa e nenhum restaurante pode tomar.
//
// "join" não é servido por este projeto: é a landing de vendas, que mora em
// outro repositório e tem o domínio apontado para lá na Vercel. Por isso ela
// não aparece em lugar nenhum daqui — e é justamente esse o risco. Provisionar
// um tenant com esse slug faria buildTenantBaseUrl entregar
// join.munoapp.com.br ao restaurante, host que a Vercel resolve para a página
// de preços: o cliente ficaria inacessível e quem abrisse o link dele veria a
// landing.
export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "adm",
  "admin",
  "app",
  "default",
  "join",
  "mail",
  "static",
]);

export type ProvisionErrorCode =
  | "SLUG_INVALIDO"
  | "SLUG_RESERVADO"
  | "SLUG_EM_USO";

export class ProvisionError extends Error {
  constructor(
    message: string,
    readonly code: ProvisionErrorCode
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

export function validateSlug(slug: string): void {
  if (!/^[a-z0-9](-?[a-z0-9])*$/.test(slug)) {
    throw new ProvisionError(
      "Slug inválido: use apenas letras minúsculas, números e hífens (ex: burger-house).",
      "SLUG_INVALIDO"
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ProvisionError(
      `Slug "${slug}" é reservado pela plataforma. Escolha outro.`,
      "SLUG_RESERVADO"
    );
  }
}

export function gerarSenha(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export function buildTenantBaseUrl(slug: string): string {
  // ROOT_DOMAIN lista os hosts raiz em ordem: os primeiros são os hosts
  // institucionais/marketing (ex.: www.munoapp.com.br) e o ÚLTIMO é o domínio
  // nu do qual os tenants pendem. Usar o primeiro geraria
  // "pizzaria.www.munoapp.com.br" — subdomínio de dois níveis, que o
  // certificado curinga *.munoapp.com.br não cobre.
  const roots = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(",");
  const rootDomain = roots[roots.length - 1].trim();
  const protocol = rootDomain.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${slug}.${rootDomain}`;
}

export async function provisionTenant(input: {
  nome: string;
  slug: string;
  email: string;
  senha?: string;
  endereco?: string;
  telefone?: string;
  logoUrl?: string;
  plano?: PlanoTenant;
}): Promise<{ tenant: Tenant; admin: User; url: string; senha: string }> {
  validateSlug(input.slug);

  const senha = input.senha ?? gerarSenha();
  const hashedPassword = await bcrypt.hash(senha, 12);

  // Transação porque criar o tenant e falhar ao criar o admin deixaria um
  // tenant órfão ocupando o slug para sempre.
  const { tenant, admin } = await prismaUnscoped.$transaction(async (tx) => {
    const existing = await tx.tenant.findUnique({ where: { slug: input.slug } });
    if (existing) {
      throw new ProvisionError(
        `Já existe um tenant com o slug "${input.slug}".`,
        "SLUG_EM_USO"
      );
    }

    // O findUnique acima é só atalho: entre ele e o create cabe outra
    // transação (READ COMMITTED não impede check-then-act). Quem perde a
    // corrida bate na constraint única e recebe um P2002 cru, que a rota de
    // conversão não reconhece e vira 500 — com um tenant real já criado e a
    // senha só na resposta do vencedor. Traduzimos para o mesmo erro do atalho.
    let tenant: Tenant;
    try {
      tenant = await tx.tenant.create({
        data: { nome: input.nome, slug: input.slug, plano: input.plano ?? "MEMBRO" },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ProvisionError(
          `Já existe um tenant com o slug "${input.slug}".`,
          "SLUG_EM_USO"
        );
      }
      throw err;
    }

    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: `Administrador ${input.nome}`,
        email: input.email,
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    // Todo tenant nasce com o Setting já preenchido: o nome é sempre conhecido
    // aqui, e sem o registro o storefront ficaria sem identidade até o cliente
    // editar na mão.
    //
    // Endereço e telefone caem para VAZIO quando o lead não os trouxe, nunca
    // para um exemplo. Antes eles herdavam os do restaurante do seed, e o
    // cardápio do cliente novo nascia publicando o endereço e o telefone de uma
    // hamburgueria em Ubatuba — gravados no banco dele, não só exibidos.
    await tx.setting.create({
      data: {
        tenantId: tenant.id,
        key: "restaurant_info",
        value: JSON.stringify({
          name: input.nome,
          address: input.endereco?.trim() || SEM_CADASTRO.address,
          phone: input.telefone?.trim() || SEM_CADASTRO.phone,
          logoUrl: input.logoUrl?.trim() || SEM_CADASTRO.logoUrl,
        }),
      },
    });

    return { tenant, admin };
  });

  return { tenant, admin, url: buildTenantBaseUrl(tenant.slug), senha };
}
