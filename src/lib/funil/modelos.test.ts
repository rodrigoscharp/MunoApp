import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TENANT_SCOPED_MODELS } from "@/lib/tenant-scoped-models";

const schema = readFileSync(
  join(process.cwd(), "prisma/schema.prisma"),
  "utf8"
);

const MODELOS_DO_FUNIL = ["SessaoFunil", "EventoFunil", "ResumoDiario"];

function corpoDoModelo(nome: string): string {
  const inicio = schema.indexOf(`model ${nome} {`);
  if (inicio === -1) return "";
  return schema.slice(inicio, schema.indexOf("\n}", inicio));
}

describe("os modelos do funil são registro de plataforma", () => {
  it.each(MODELOS_DO_FUNIL)("%s existe no schema", (nome) => {
    expect(corpoDoModelo(nome)).not.toBe("");
  });

  // Sem tenantId de propósito: o funil é da Muno, não de um restaurante. Um
  // tenantId aqui obrigaria entrada em tenant-scoped-models, policy de RLS e
  // lugar em ORDEM_DE_EXCLUSAO, e nenhuma das três faz sentido para dado de
  // prospecção da própria plataforma.
  it.each(MODELOS_DO_FUNIL)("%s não tem tenantId", (nome) => {
    expect(corpoDoModelo(nome)).not.toMatch(/\btenantId\b/);
  });

  // A lista é o que separa um restaurante do outro (a extensão do Prisma em
  // src/lib/prisma.ts injeta tenantId no where a partir dela). Modelo de
  // plataforma entrando nela ganharia um filtro por um tenant que não existe,
  // e passaria a devolver nada.
  it.each(MODELOS_DO_FUNIL)("%s fica fora de TENANT_SCOPED_MODELS", (nome) => {
    expect([...TENANT_SCOPED_MODELS]).not.toContain(nome);
  });

  // A trava que mais importa. `anon` e `authenticated` recebem CRUD em todo o
  // schema public por padrão do Supabase, e a NEXT_PUBLIC_SUPABASE_ANON_KEY vai
  // no bundle de todo cardápio: tabela nova sem RLS nasce aberta para a
  // internet, com escrita.
  it.each(MODELOS_DO_FUNIL)("%s tem RLS ligado em alguma migração", (nome) => {
    const dir = join(process.cwd(), "prisma/migrations");
    const sql = readdirSync(dir)
      .filter((m) => !m.endsWith(".toml"))
      .map((m) => {
        try {
          return readFileSync(join(dir, m, "migration.sql"), "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");

    expect(sql).toContain(`ALTER TABLE "${nome}" ENABLE ROW LEVEL SECURITY`);
  });
});
