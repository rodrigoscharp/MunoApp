import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Tenant, User } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";

// Subdomínios que a plataforma usa e nenhum restaurante pode tomar.
export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "adm",
  "admin",
  "app",
  "default",
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
  const rootDomain = (process.env.ROOT_DOMAIN ?? "localhost:3000").split(",")[0];
  const protocol = rootDomain.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${slug}.${rootDomain}`;
}

export async function provisionTenant(input: {
  nome: string;
  slug: string;
  email: string;
  senha?: string;
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

    const tenant = await tx.tenant.create({
      data: { nome: input.nome, slug: input.slug },
    });

    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: `Administrador ${input.nome}`,
        email: input.email,
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    return { tenant, admin };
  });

  return { tenant, admin, url: buildTenantBaseUrl(tenant.slug), senha };
}
