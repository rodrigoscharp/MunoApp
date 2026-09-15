/**
 * Regras sobre o projeto inteiro, lidas como texto.
 *
 * Cada teste deste arquivo existe porque a falha que ele pega é silenciosa: o
 * app builda, a tela funciona, e o buraco só aparece quando alguém de fora o
 * encontra. Nenhum deles protege um arquivo específico; todos protegem o
 * arquivo que ainda vai ser escrito.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

const ler = (relativo: string) => readFileSync(path.join(RAIZ, relativo), "utf8");

/** Todo .ts/.tsx de src/, sem o cliente gerado do Prisma e sem testes. */
function arquivosDoCodigo(dir = "src"): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const relativo = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) {
      if (relativo === "src/generated") continue;
      saida.push(...arquivosDoCodigo(relativo));
    } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      saida.push(relativo);
    }
  }
  return saida;
}

const ARQUIVOS = arquivosDoCodigo();

// --- prismaUnscoped ----------------------------------------------------------

const TENANT_COM_ESCOPO_MANUAL =
  "Server Component de tenant que usa o cliente sem escopo: todo where precisa levar tenantId à mão";
const PLATAFORMA = "área da plataforma, que não pertence a tenant nenhum";
const SEM_SUBDOMINIO =
  "entra sem subdomínio de restaurante e descobre o tenant pelo próprio registro";
const BUNDLE_DO_PROXY =
  "roda no bundle do proxy, onde a extensão de tenant por AsyncLocalStorage não alcança";

/**
 * Quem importa o cliente sem escopo de tenant, e por quê.
 *
 * Estar aqui não certifica que o arquivo está certo. Revisar cada um é trabalho
 * separado (ver a spec). A lista existe para que essa revisão seja possível e
 * para que nenhum uso novo entre sem alguém escrever o motivo.
 */
const USO_DE_PRISMA_UNSCOPED: Record<string, string> = {
  "src/app/(chat)/pedidos/[orderId]/chat/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/(client)/pedidos/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/(client)/track/[orderId]/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/adm/chats/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/adm/comecar/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/adm/menu/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/adm/motoboys/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/adm/orders/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/adm/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/adm/restaurante/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/mesa/[token]/layout.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/motoboy/delivery/[orderId]/page.tsx": TENANT_COM_ESCOPO_MANUAL,
  "src/app/motoboy/pedidos/page.tsx": TENANT_COM_ESCOPO_MANUAL,

  "src/app/api/assinar/reconciliar/route.ts": SEM_SUBDOMINIO,
  "src/app/api/assinar/route.ts": SEM_SUBDOMINIO,
  "src/app/api/assinar/slug/route.ts": SEM_SUBDOMINIO,
  "src/app/api/assinaturas/webhook/asaas/route.ts": SEM_SUBDOMINIO,
  "src/app/api/cron/assinaturas/route.ts": SEM_SUBDOMINIO,
  "src/app/api/funil/evento/route.ts": SEM_SUBDOMINIO,
  "src/app/api/leads/publico/route.ts": SEM_SUBDOMINIO,
  "src/app/api/payments/webhook/[provider]/[tenantId]/route.ts": SEM_SUBDOMINIO,
  "src/app/api/payments/connections/route.ts":
    "lê a conexão de pagamento pelo tenantId da sessão do ADMIN, não pelo header",

  "src/app/api/platform/clientes/[id]/route.ts": PLATAFORMA,
  "src/app/api/platform/leads/[id]/converter/route.ts": PLATAFORMA,
  "src/app/api/platform/leads/[id]/notas/route.ts": PLATAFORMA,
  "src/app/api/platform/leads/[id]/plano/route.ts": PLATAFORMA,
  "src/app/api/platform/leads/[id]/route.ts": PLATAFORMA,
  "src/app/api/platform/leads/route.ts": PLATAFORMA,
  "src/app/platform/clientes/page.tsx": PLATAFORMA,
  "src/app/platform/conversao/page.tsx": PLATAFORMA,
  "src/app/platform/leads/[id]/page.tsx": PLATAFORMA,
  "src/app/platform/leads/page.tsx": PLATAFORMA,
  "src/app/platform/page.tsx": PLATAFORMA,

  "src/lib/auth.ts": BUNDLE_DO_PROXY,
  "src/lib/auth-platform.ts": BUNDLE_DO_PROXY,
  "src/lib/assinatura/baixa.ts": "baixa manual de cobrança, feita pela plataforma",
  "src/lib/assinatura/email-boas-vindas.ts":
    "e-mail de boas-vindas do provisionamento, quando o tenant acabou de nascer",
  "src/lib/assinatura/provisionamento.ts": "cria o tenant, que ainda não existe no contexto",
  "src/lib/assinatura/reconciliacao.ts":
    "job de plataforma que atravessa as inscrições de todos os restaurantes",
  "src/lib/payments/factory.ts": "resolve a conexão de pagamento por tenantId explícito",
  "src/lib/tenant-provisioning.ts": "cria tenant novo, fora de qualquer contexto de tenant",
  "src/lib/tenant-removal.ts": "apaga um tenant model por model, na ordem das foreign keys",
};

const IMPORTA_PRISMA_UNSCOPED =
  /import\s*(?:type\s*)?\{[^}]*\bprismaUnscoped\b[^}]*\}\s*from\s*["'](?:@\/lib\/prisma|\.\/prisma|\.\.\/prisma)["']/;

describe("prismaUnscoped só entra com motivo escrito", () => {
  it("quem importa é exatamente quem está na lista", () => {
    const importam = ARQUIVOS.filter((f) => IMPORTA_PRISMA_UNSCOPED.test(ler(f))).sort();
    expect(importam).toEqual(Object.keys(USO_DE_PRISMA_UNSCOPED).sort());
  });
});

// --- fronteira cliente/servidor -----------------------------------------------

const USE_CLIENT = /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*["']use client["']/;

// Carregam credencial ou acesso irrestrito ao banco. Num componente cliente,
// viram código público no bundle de todo cardápio.
const MODULO_DE_SERVIDOR =
  /from\s*["']@\/lib\/(?:prisma|crypto|supabase-admin|auth-platform|auth|resend)["']/;

describe("componente cliente não importa módulo de servidor", () => {
  it("a varredura encontra componentes cliente", () => {
    expect(ARQUIVOS.filter((f) => USE_CLIENT.test(ler(f))).length).toBeGreaterThan(0);
  });

  it("nenhum 'use client' importa prisma, crypto, supabase-admin, auth, auth-platform ou resend", () => {
    const violam = ARQUIVOS.filter((f) => {
      const texto = ler(f);
      return USE_CLIENT.test(texto) && MODULO_DE_SERVIDOR.test(texto);
    });
    expect(violam).toEqual([]);
  });
});

// Prefixo NEXT_PUBLIC_ é embutido no bundle. Entrar aqui é decidir publicar.
const NEXT_PUBLIC_PERMITIDAS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
];

describe("variável pública é decisão, não acidente", () => {
  it("todo NEXT_PUBLIC_* citado está na lista fechada", () => {
    const citadas = new Set<string>();
    for (const f of ARQUIVOS) {
      for (const m of ler(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) citadas.add(m[0]);
    }
    expect([...citadas].sort()).toEqual(NEXT_PUBLIC_PERMITIDAS);
  });
});

// --- sinks perigosos -----------------------------------------------------------

describe("portas de injeção continuam fechadas", () => {
  it("sem $queryRawUnsafe, $executeRawUnsafe, eval ou new Function", () => {
    const perigoso = /\$queryRawUnsafe|\$executeRawUnsafe|\beval\s*\(|\bnew\s+Function\s*\(/;
    expect(ARQUIVOS.filter((f) => perigoso.test(ler(f)))).toEqual([]);
  });

  it("dangerouslySetInnerHTML só no script de tema do layout raiz", () => {
    expect(ARQUIVOS.filter((f) => ler(f).includes("dangerouslySetInnerHTML"))).toEqual([
      "src/app/layout.tsx",
    ]);
  });
});

// --- RLS ------------------------------------------------------------------------

const MIGRACOES = readdirSync(path.join(RAIZ, "prisma/migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `prisma/migrations/${d.name}/migration.sql`)
  .filter((f) => existsSync(path.join(RAIZ, f)))
  .map(ler)
  .join("\n");

function nomes(regex: RegExp, texto: string): Set<string> {
  return new Set([...texto.matchAll(regex)].map((m) => m[1]));
}

describe("toda tabela nasce com RLS", () => {
  // Tabela em public sem RLS responde à chave anônima do Supabase, que vai no
  // bundle do navegador, com leitura E escrita. Foi assim com Tenant, Lead e
  // PlatformAdmin até 10/08/2026. Ver AGENTS.md.
  const criadas = nomes(/CREATE TABLE (?:IF NOT EXISTS )?(?:"public"\.)?"(\w+)"/g, MIGRACOES);
  const comRls = nomes(
    /ALTER TABLE (?:ONLY )?(?:"public"\.)?"(\w+)" ENABLE ROW LEVEL SECURITY/g,
    MIGRACOES
  );

  it("a varredura encontra as migrações", () => {
    expect(criadas.size).toBeGreaterThan(0);
  });

  it("todo CREATE TABLE tem ENABLE ROW LEVEL SECURITY em alguma migração", () => {
    expect([...criadas].filter((t) => !comRls.has(t))).toEqual([]);
  });

  it("todo model do schema nasce numa migração", () => {
    // Pega tabela criada por `db push`, que não passa por migração e por isso
    // nunca recebeu RLS. Se um dia algum model usar @@map, compare pelo nome
    // mapeado.
    const models = nomes(/^model (\w+) \{/gm, ler("prisma/schema.prisma"));
    expect([...models].filter((m) => !criadas.has(m))).toEqual([]);
  });
});

// --- headers ----------------------------------------------------------------------

describe("headers de segurança do next.config.js", () => {
  type Header = { key: string; value: string };
  const config = createRequire(import.meta.url)("../../next.config.js") as {
    poweredByHeader?: boolean;
    headers: () => Promise<Array<{ source: string; headers: Header[] }>>;
  };

  async function globais(): Promise<Record<string, string>> {
    const regra = (await config.headers()).find((r) => r.source === "/(.*)");
    return Object.fromEntries((regra?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));
  }

  it("não anuncia o framework", () => {
    expect(config.poweredByHeader).toBe(false);
  });

  it("mantém nosniff e bloqueio de iframe", async () => {
    const h = await globais();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
  });

  it("mantém HSTS de pelo menos um ano cobrindo os subdomínios dos restaurantes", async () => {
    const hsts = (await globais())["strict-transport-security"] ?? "";
    expect(Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0)).toBeGreaterThanOrEqual(31536000);
    expect(hsts).toContain("includeSubDomains");
  });
});
