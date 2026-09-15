# Suíte de segurança Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Testes de invariante que pegam rota nova sem autorização, uso novo de cliente sem escopo, tabela sem RLS e vazamento de módulo de servidor, mais a correção dos cinco problemas que a exploração encontrou.

**Architecture:** Uma pasta `src/security/` com dois testes de projeto inteiro (matriz de acesso dirigida por manifesto, e invariantes estáticos lidos como texto). As correções entram cada uma no arquivo responsável, com teste vermelho antes: extensão do Prisma, proxy, formulários de login e cadastro, rota de cadastro. Um workflow do GitHub passa a rodar lint e testes.

**Tech Stack:** Next 16.3 (App Router, `src/proxy.ts`), NextAuth 5 beta, Prisma 6.19, Vitest 4 (`environment: node`, jsdom por arquivo), Testing Library, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-suite-de-seguranca-design.md`

## Global Constraints

- Branch: `seguranca/suite-de-testes`. Nenhum `git push` sem pedido explícito.
- Linha de base antes do Task 1: `npm test` com 135 arquivos e 1850 testes verdes; `npm run lint` com 0 erros e 8 avisos. Todo task termina com `npm test` verde e sem erro novo de lint.
- Nunca rodar `db:*`, `tenant:*`, `platform:*` nem nada que leia `.env.prod`. Nenhum teste deste plano toca banco.
- Comentário e texto em português, no tom dos existentes: explicam o porquê.
- Texto visível ao usuário final sem travessão (vírgula ou conjunção).
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Ajuste à spec, decidido na escrita deste plano: o manifesto ganha um quarto tipo, `DONO_DO_RECURSO`. As rotas cujo acesso depende de quem é o dono do registro (`canViewOrder`, chat do pedido, cobrança) precisam ler o registro antes de decidir, então não cabem na regra "nenhum acesso ao banco" e não são `PUBLICO`. O Task 6 registra isso na spec.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/security/invariantes.test.ts` (novo) | Regras estáticas: lista de `prismaUnscoped`, fronteira cliente/servidor, `NEXT_PUBLIC_*`, sinks perigosos, RLS, headers. |
| `src/lib/prisma.ts` / `prisma.test.ts` | Extensão passa a prender `data.tenantId` nas escritas de update. |
| `src/proxy.ts` / `proxy.test.ts` | Ramos sem tenant encaminham o request sem `x-tenant-id` e `x-tenant-plano`. |
| `src/lib/redirect-seguro.ts` (novo) + teste | `destinoSeguro()`. |
| `src/components/auth/LoginForm.tsx`, `RegisterForm.tsx` + testes novos | Usam `destinoSeguro()`. |
| `src/app/api/auth/register/route.ts` + teste | Rate limit por tenant e IP. |
| `src/security/politica-de-acesso.ts` (novo) | Manifesto de quem pode chamar cada handler. |
| `src/security/matriz-de-acesso.test.ts` (novo) | Cobertura, negação e controle positivo sobre o manifesto. |
| `.github/workflows/testes.yml` (novo) | Lint, testes e audit em todo push e PR. |
| `AGENTS.md` | Seção curta sobre a suíte, para quem criar rota ou tabela. |

---

### Task 1: Invariantes estáticos

**Files:**
- Create: `src/security/invariantes.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada que outro task importe. O arquivo contém `USO_DE_PRISMA_UNSCOPED`, lista que o Task 6 não usa.

Este task não tem fase vermelha: ele trava o estado atual, que já está correto. A verificação de que cada regra morde está no Step 3.

- [ ] **Step 1: Escrever o teste**

```ts
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
```

- [ ] **Step 2: Rodar e confirmar verde**

Run: `npx vitest run src/security/invariantes.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 3: Confirmar que cada regra morde**

Faça cada sabotagem abaixo, rode o arquivo, confirme o FAIL indicado e desfaça antes da próxima:

1. Apague a linha de `"src/lib/tenant-removal.ts"` em `USO_DE_PRISMA_UNSCOPED`. Expected: FAIL em "quem importa é exatamente quem está na lista".
2. Acrescente `import { prisma } from "@/lib/prisma";` na segunda linha de `src/components/auth/LoginForm.tsx`. Expected: FAIL em "nenhum 'use client' importa...".
3. Troque `"DENY"` por `"SAMEORIGIN"` em `next.config.js`. Expected: FAIL em "mantém nosniff e bloqueio de iframe".

Run: `git diff --stat`
Expected: só `src/security/invariantes.test.ts` como arquivo novo, nenhum outro modificado.

- [ ] **Step 4: Suíte completa**

Run: `npm test`
Expected: 136 arquivos, todos verdes.

- [ ] **Step 5: Commit**

```bash
git add src/security/invariantes.test.ts
git commit -m "Invariantes de segurança: prismaUnscoped com motivo, fronteira cliente, RLS e headers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: A extensão do Prisma prende `data.tenantId` nos updates

**Files:**
- Modify: `src/lib/prisma.ts` (dentro de `createPrismaClient`, perto do bloco `WHERE_OPERATIONS`)
- Test: `src/lib/prisma.test.ts` (novo `describe` no fim do arquivo)

**Interfaces:**
- Consumes: helper `argsEntregues(model, operation, args, tenantId?)` já existente em `prisma.test.ts`.
- Produces: nada exportado.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `src/lib/prisma.test.ts`:

```ts
/**
 * O where escopado impede de ALCANÇAR a linha de outro restaurante. Não impedia
 * de MANDAR a própria linha para outro restaurante: um
 * `update({ where: { id }, data: { tenantId: "b" } })` passava com o where certo
 * e o data errado. Hoje nenhuma rota faz isso porque o zod descarta campo
 * desconhecido antes, o que é coincidência e não garantia.
 */
describe("update não muda a linha de restaurante", () => {
  const ATUALIZACOES = ["update", "updateMany", "updateManyAndReturn"];

  it.each(ATUALIZACOES)("%s troca data.tenantId pelo do contexto", async (operacao) => {
    const entregue = await argsEntregues("MenuItem", operacao, {
      where: { id: "item-1" },
      data: { name: "X", tenantId: "restaurante-b" },
    });
    expect(entregue.data).toEqual({ name: "X", tenantId: "restaurante-a" });
  });

  it.each(ATUALIZACOES)("%s descarta a forma relacional data.tenant", async (operacao) => {
    const entregue = await argsEntregues("MenuItem", operacao, {
      where: { id: "item-1" },
      data: { name: "X", tenant: { connect: { id: "restaurante-b" } } },
    });
    expect(entregue.data).toEqual({ name: "X", tenantId: "restaurante-a" });
  });

  it("o update do upsert segue a mesma regra", async () => {
    const entregue = await argsEntregues("Setting", "upsert", {
      where: { id: "s-1" },
      create: { key: "k", value: "v" },
      update: { value: "v2", tenantId: "restaurante-b" },
    });
    expect(entregue.update).toEqual({ value: "v2", tenantId: "restaurante-a" });
  });

  it("update que não mexe no tenant sai intacto", async () => {
    const entregue = await argsEntregues("MenuItem", "update", {
      where: { id: "item-1" },
      data: { name: "X" },
    });
    expect(entregue.data).toEqual({ name: "X" });
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/lib/prisma.test.ts`
Expected: FAIL em 7 testes (3 de `data.tenantId`, 3 de `data.tenant`, 1 do upsert), com `tenantId: "restaurante-b"` ou `tenant: { connect: ... }` no valor recebido. O teste "update que não mexe no tenant sai intacto" passa.

- [ ] **Step 3: Implementar**

Em `src/lib/prisma.ts`, logo depois de `const DATA_ARRAY_OPERATIONS = ...`:

```ts
// Escritas que recebem `data` de uma linha que já existe. O where escopado
// impede de alcançar a linha de outro restaurante; prenderAoTenant impede de
// mandar a própria linha para outro restaurante.
const UPDATE_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"]);

/**
 * Se a escrita tentou mexer no tenant, pela coluna ou pela relação, o tenant
 * passa a ser o do contexto. Se não tentou, o data sai intacto: injetar
 * tenantId em todo update mudaria os argumentos de toda escrita legítima.
 */
function prenderAoTenant(data: unknown, tenantId: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (!("tenantId" in data) && !("tenant" in data)) return data;
  const { tenant: _tenant, ...resto } = data as Record<string, unknown>;
  return { ...resto, tenantId };
}
```

Dentro de `$allOperations`, logo depois do bloco `if (WHERE_OPERATIONS.has(operation)) { ... }`:

```ts
          if (UPDATE_OPERATIONS.has(operation)) {
            a.data = prenderAoTenant(a.data, tenantId);
          }
```

E trocar o bloco do upsert por:

```ts
          if (operation === "upsert") {
            a.create = { ...a.create, tenantId };
            a.update = prenderAoTenant(a.update, tenantId);
          }
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npx vitest run src/lib/prisma.test.ts`
Expected: PASS em todos.

- [ ] **Step 5: Suíte completa e lint**

Run: `npm test && npx eslint src/lib/prisma.ts`
Expected: tudo verde; eslint sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prisma.ts src/lib/prisma.test.ts
git commit -m "Update escopado não consegue mais mover a linha para outro restaurante

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: O proxy não repassa header de tenant forjado

**Files:**
- Modify: `src/proxy.ts` (novo helper antes do `export default`; `semTenant` logo depois de `urlNoHost`; os `NextResponse.next()` e `NextResponse.rewrite()` dos ramos sem tenant)
- Test: `src/proxy.test.ts`

**Interfaces:**
- Consumes: em `proxy.test.ts`, os helpers `proxy`, `requisicao`, `tenantInjetado`, `planoInjetado`, `comAssinatura`, `findUnique`, `HOST`, `ADMIN_HOST`, `TENANT_ID`, `Sessao` e o mock de `authPlatform`, todos já existentes.
- Produces: nada exportado.

Contexto: no Next, `NextResponse.next({ request: { headers } })` grava `x-middleware-override-headers` com a lista dos headers a manter, e o servidor (`next/dist/server/lib/router-utils/resolve-routes.js`, linhas 413-438) apaga do request tudo o que não está na lista. `NextResponse.next()` sem argumento não grava a lista, e o request segue com os headers que o navegador mandou.

- [ ] **Step 1: Escrever os testes que falham**

Dentro do `describe("proxy: sessão de outro tenant não pode trancar o NextAuth", ...)`, logo depois do `it.each` de `"/api/auth/session"`, `"/api/auth/callback/credentials"` e `"/api/auth/csrf"`:

```ts
  // O handler de API confere o papel e não o tenant da sessão. Um ADMIN do
  // restaurante A com o cookie colado no host do restaurante B passaria. Quem
  // barra é o tenantMismatch daqui, e só ele.
  it.each(["/api/coupons", "/api/orders", "/api/settings/restaurant"])(
    "%s com sessão de outro tenant não chega ao handler",
    async (caminho) => {
      comAssinatura(null);

      const res = await proxy(requisicao(caminho, DE_OUTRO_TENANT));

      expect(tenantInjetado(res)).toBeNull();
      expect(res.status).not.toBe(200);
    }
  );
```

No fim do arquivo:

```ts
describe("proxy: header de tenant forjado não atravessa rota sem tenant", () => {
  // x-tenant-id é a chave de escopo de toda rota de restaurante. No caminho
  // normal o proxy sobrescreve o valor. Nos ramos que saem antes (checkout,
  // webhooks, cron, landing, plataforma) ele não sobrescrevia nada, e o valor
  // mandado pelo navegador chegava intacto. Nenhuma rota dali lê o header
  // hoje; a primeira que ler confiaria num tenant escolhido pelo cliente.
  const FORJADOS = { "x-tenant-id": "tenant-forjado", "x-tenant-plano": "MEMBRO_MESA_QR" };

  function forjada(host: string, caminho: string, method = "GET"): NextRequest {
    const req = new NextRequest(`http://${host}${caminho}`, {
      method,
      headers: { host, ...FORJADOS },
    });
    (req as unknown as { auth: Sessao }).auth = null;
    return req;
  }

  function semHeaderDeTenant(res: Response) {
    const lista = res.headers.get("x-middleware-override-headers");
    // Sem a lista, o Next repassa o request inteiro como veio do navegador.
    expect(lista).not.toBeNull();
    const repassados = lista!.split(",").map((nome) => nome.trim());
    expect(repassados).toContain("host");
    expect(repassados).not.toContain("x-tenant-id");
    expect(repassados).not.toContain("x-tenant-plano");
    expect(tenantInjetado(res)).toBeNull();
    expect(planoInjetado(res)).toBeNull();
  }

  it.each([
    ["/api/cron/assinaturas", "GET"],
    ["/api/leads/publico", "POST"],
    ["/api/funil/evento", "POST"],
    ["/api/assinaturas/webhook/asaas", "POST"],
    ["/api/payments/webhook/mercado_pago/tenant-1", "POST"],
    ["/api/assinar", "POST"],
  ])("%s em host de restaurante", async (caminho, method) => {
    semHeaderDeTenant(await proxy(forjada(HOST, caminho, method)));
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(["/", "/assinar", "/api/assinar/slug", "/api/funil/evento"])(
    "%s no domínio raiz",
    async (caminho) => {
      semHeaderDeTenant(await proxy(forjada("localhost:3000", caminho)));
    }
  );

  it.each(["/api/platform/leads", "/leads"])("%s no host da plataforma", async (caminho) => {
    vi.mocked(authPlatform).mockResolvedValue({ user: { id: "admin-1" } } as never);

    semHeaderDeTenant(await proxy(forjada(ADMIN_HOST, caminho)));
  });

  it("no host de restaurante o valor forjado é trocado pelo tenant resolvido", async () => {
    const res = await proxy(forjada(HOST, "/"));

    expect(tenantInjetado(res)).toBe(TENANT_ID);
    expect(planoInjetado(res)).toBe("MEMBRO");
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/proxy.test.ts`
Expected: os 3 casos de sessão de outro tenant PASSAM (o `tenantMismatch` já cobre API; o teste trava isso). Os 12 casos de `semHeaderDeTenant` FALHAM em `expect(lista).not.toBeNull()`. O último caso ("trocado pelo tenant resolvido") PASSA.

- [ ] **Step 3: Implementar**

Em `src/proxy.ts`, logo antes de `export default auth(async (req) => {`:

```ts
// Os headers que só o proxy tem autoridade para escrever.
const HEADERS_DE_TENANT = ["x-tenant-id", TENANT_PLANO_HEADER];

/**
 * Encaminhamento para os ramos que saem antes de resolver tenant.
 *
 * `NextResponse.next()` sem argumento repassa o request exatamente como o
 * navegador mandou, com um x-tenant-id que qualquer um escreve. Passar os
 * headers explicitamente faz o Next gravar x-middleware-override-headers, e o
 * servidor apaga do request tudo o que ficou fora da lista.
 */
function semHeadersDeTenant(req: NextRequest) {
  const headers = new Headers(req.headers);
  for (const nome of HEADERS_DE_TENANT) headers.delete(nome);
  return { request: { headers } };
}
```

Logo depois da definição de `urlNoHost` dentro do handler:

```ts
  const semTenant = semHeadersDeTenant(req);
```

Então, no restante do arquivo:

1. Trocar **todo** `NextResponse.next()` sem argumento por `NextResponse.next(semTenant)`. São nove ocorrências: host da plataforma, `/api/leads/publico`, `/api/funil/evento`, `/api/cron/`, `/api/assinaturas/webhook/`, `/api/payments/webhook/`, os dois do bloco de `/assinar` e o estático do domínio raiz.
2. No host da plataforma, trocar
   `NextResponse.rewrite(urlNoHost(\`/platform${nextUrl.pathname}${nextUrl.search}\`))`
   por
   `NextResponse.rewrite(urlNoHost(\`/platform${nextUrl.pathname}${nextUrl.search}\`), semTenant)`.
3. No domínio raiz, trocar
   `comSessao(NextResponse.rewrite(urlNoHost(LANDING_DOC)), req)`
   por
   `comSessao(NextResponse.rewrite(urlNoHost(LANDING_DOC), semTenant), req)`.

O `NextResponse.next(forward)` do fim continua como está: ali `requestHeaders.set` já sobrescreve os dois headers com o tenant resolvido.

Run: `grep -n "NextResponse.next()" src/proxy.ts`
Expected: nenhuma linha.

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npx vitest run src/proxy.test.ts`
Expected: PASS em todos, incluindo os casos antigos de `tenantInjetado(res)` nulo.

- [ ] **Step 5: Suíte completa e lint**

Run: `npm test && npx eslint src/proxy.ts src/proxy.test.ts`
Expected: tudo verde; eslint sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts src/proxy.test.ts
git commit -m "Rota sem tenant deixa de receber o x-tenant-id que o navegador mandou

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Open redirect no login e no cadastro

**Files:**
- Create: `src/lib/redirect-seguro.ts`, `src/lib/redirect-seguro.test.ts`
- Create: `src/components/auth/LoginForm.test.tsx`, `src/components/auth/RegisterForm.test.tsx`
- Modify: `src/components/auth/LoginForm.tsx:25-35`, `src/components/auth/RegisterForm.tsx:30-35`

**Interfaces:**
- Consumes: nada.
- Produces: `destinoSeguro<P extends string | null>(valor: string | null | undefined, padrao: P): string | P`.

- [ ] **Step 1: Escrever o teste da função**

`src/lib/redirect-seguro.test.ts`:

```ts
/**
 * `callbackUrl` vem da query string, e quem escreve a query string é quem
 * mandou o link. Sem esta função,
 * pizzaria.munoapp.com.br/login?callbackUrl=https://golpe.example levava o
 * cliente, recém autenticado e confiando no domínio do restaurante, para
 * qualquer lugar. Por exemplo, uma cópia da tela de login pedindo a senha de
 * novo.
 */

import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./redirect-seguro";

describe("destinoSeguro", () => {
  it.each(["/checkout", "/pedidos/abc/chat", "/adm", "/adm/menu?aba=2#topo", "/"])(
    "mantém o destino interno %s",
    (destino) => {
      expect(destinoSeguro(destino, "/")).toBe(destino);
    }
  );

  it.each([
    ["URL absoluta", "https://golpe.example"],
    ["URL sem esquema", "//golpe.example"],
    ["barra invertida, que o navegador lê como barra", "/\\golpe.example"],
    ["tabulação no meio, que o parser de URL remove", "/\t/golpe.example"],
    ["espaço antes", " //golpe.example"],
    ["javascript:", "javascript:alert(1)"],
    ["caminho relativo", "adm"],
    ["vazio", ""],
  ])("recusa %s", (_nome, valor) => {
    expect(destinoSeguro(valor, "/")).toBe("/");
  });

  it("devolve o padrão quando não há valor", () => {
    expect(destinoSeguro(null, "/")).toBe("/");
    expect(destinoSeguro(undefined, "/inicio")).toBe("/inicio");
  });

  it("aceita null como padrão, para quem decide o destino depois", () => {
    expect(destinoSeguro("https://golpe.example", null)).toBeNull();
    expect(destinoSeguro("/checkout", null)).toBe("/checkout");
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/lib/redirect-seguro.test.ts`
Expected: FAIL com "Failed to resolve import ./redirect-seguro".

- [ ] **Step 3: Implementar a função**

`src/lib/redirect-seguro.ts`:

```ts
// Origem que nenhum endereço real tem (.invalid é reservado pela RFC 2606).
const ORIGEM_FICTICIA = "http://destino.invalid";

/**
 * Devolve `valor` só se ele for um destino dentro do próprio site. Qualquer
 * outra coisa vira `padrao`.
 *
 * A checagem resolve o valor com `new URL` e compara a origem, em vez de olhar
 * prefixo. É o ponto da função: `//golpe.example`, `/\golpe.example` e
 * `/<tab>/golpe.example` começam com "/" e mesmo assim saem do site, porque o
 * navegador os lê como endereço de outro host. Resolvendo pelo mesmo parser,
 * a função enxerga o que o navegador enxerga.
 */
export function destinoSeguro<P extends string | null>(
  valor: string | null | undefined,
  padrao: P
): string | P {
  if (!valor || !valor.startsWith("/")) return padrao;

  let url: URL;
  try {
    url = new URL(valor, ORIGEM_FICTICIA);
  } catch {
    return padrao;
  }
  if (url.origin !== ORIGEM_FICTICIA) return padrao;

  return `${url.pathname}${url.search}${url.hash}`;
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npx vitest run src/lib/redirect-seguro.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever os testes dos formulários**

`src/components/auth/LoginForm.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * O login é onde o open redirect morde: a pessoa acabou de digitar a senha no
 * domínio do restaurante e confia no próximo destino.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  busca: new URLSearchParams(),
  papel: "CUSTOMER",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  useSearchParams: () => nav.busca,
}));
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(async () => ({ error: undefined })),
  getSession: vi.fn(async () => ({ user: { role: nav.papel } })),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span data-imagem={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/pwa/convitePosLogin", () => ({ pedirConviteAposLogin: vi.fn() }));

import { LoginForm } from "./LoginForm";

const RESTAURANTE = {
  name: "Burguer",
  address: "",
  phone: "",
  logoUrl: "",
  floorPlanImageUrl: null,
};

async function entrar() {
  const { container } = render(<LoginForm restaurantInfo={RESTAURANTE} />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("seu@email.com"), "cliente@exemplo.com");
  await user.type(screen.getByPlaceholderText("••••••••"), "senha-123");
  await user.click(container.querySelector('button[type="submit"]')!);
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
}

beforeEach(() => {
  nav.push.mockClear();
  nav.busca = new URLSearchParams();
  nav.papel = "CUSTOMER";
});

afterEach(cleanup);

describe("LoginForm: para onde vai depois de entrar", () => {
  it.each(["https://golpe.example", "//golpe.example", "/\\golpe.example"])(
    "ignora callbackUrl externo %s e segue o destino do papel",
    async (externo) => {
      nav.busca = new URLSearchParams({ callbackUrl: externo });

      await entrar();

      expect(nav.push).toHaveBeenCalledWith("/");
    }
  );

  it("callbackUrl externo não tira o dono do painel", async () => {
    nav.busca = new URLSearchParams({ callbackUrl: "https://golpe.example" });
    nav.papel = "ADMIN";

    await entrar();

    expect(nav.push).toHaveBeenCalledWith("/adm");
  });

  it("callbackUrl interno continua valendo", async () => {
    nav.busca = new URLSearchParams({ callbackUrl: "/checkout" });

    await entrar();

    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("o link de cadastro não carrega o callbackUrl externo", () => {
    nav.busca = new URLSearchParams({ callbackUrl: "https://golpe.example" });

    const { container } = render(<LoginForm restaurantInfo={RESTAURANTE} />);

    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("golpe.example"))).toBe(false);
  });
});
```

`src/components/auth/RegisterForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ push: vi.fn(), busca: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  useSearchParams: () => nav.busca,
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn(async () => ({ error: undefined })) }));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span data-imagem={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { RegisterForm } from "./RegisterForm";

const RESTAURANTE = {
  name: "Burguer",
  address: "",
  phone: "",
  logoUrl: "",
  floorPlanImageUrl: null,
};

async function cadastrar() {
  const { container } = render(<RegisterForm restaurantInfo={RESTAURANTE} />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Seu nome completo"), "Cliente Novo");
  await user.type(screen.getByPlaceholderText("seu@email.com"), "novo@exemplo.com");
  await user.type(screen.getByPlaceholderText("Mínimo 6 caracteres"), "senha-123");
  await user.type(screen.getByPlaceholderText("Repita a senha"), "senha-123");
  await user.click(container.querySelector('button[type="submit"]')!);
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
}

beforeEach(() => {
  nav.push.mockClear();
  nav.busca = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ id: "u1" }), { status: 201 }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RegisterForm: para onde vai depois de criar a conta", () => {
  it.each(["https://golpe.example", "//golpe.example"])(
    "ignora callbackUrl externo %s",
    async (externo) => {
      nav.busca = new URLSearchParams({ callbackUrl: externo });

      await cadastrar();

      expect(nav.push).toHaveBeenCalledWith("/");
    }
  );

  it("callbackUrl interno continua valendo", async () => {
    nav.busca = new URLSearchParams({ callbackUrl: "/checkout" });

    await cadastrar();

    expect(nav.push).toHaveBeenCalledWith("/checkout");
  });

  it("o link de login não carrega o callbackUrl externo", () => {
    nav.busca = new URLSearchParams({ callbackUrl: "https://golpe.example" });

    const { container } = render(<RegisterForm restaurantInfo={RESTAURANTE} />);

    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.includes("golpe.example"))).toBe(false);
  });
});
```

- [ ] **Step 6: Rodar e confirmar a falha**

Run: `npx vitest run src/components/auth/`
Expected: FAIL nos casos de callbackUrl externo e nos dois de link, com `push` chamado com `"https://golpe.example"`. Os casos de `/checkout` PASSAM. Se algum teste falhar por outro motivo (render quebrado, placeholder não encontrado), corrija o harness antes de seguir: a falha certa é a do destino.

- [ ] **Step 7: Aplicar nos formulários**

`src/components/auth/LoginForm.tsx`: acrescentar o import

```tsx
import { destinoSeguro } from "@/lib/redirect-seguro";
```

e trocar

```tsx
  const callbackUrl = searchParams.get("callbackUrl");
```

por

```tsx
  // Só destino interno. Um callbackUrl externo conta como ausente, e o destino
  // volta a depender do papel. Ver src/lib/redirect-seguro.ts.
  const callbackUrl = destinoSeguro(searchParams.get("callbackUrl"), null);
```

O `registerHref` e o `destino` já usam `callbackUrl` e não mudam.

`src/components/auth/RegisterForm.tsx`: acrescentar o mesmo import e trocar

```tsx
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const loginHref = searchParams.get("callbackUrl")
    ? `/login?callbackUrl=${encodeURIComponent(searchParams.get("callbackUrl")!)}`
    : "/login";
```

por

```tsx
  // Só destino interno, e o mesmo valor limpo segue para o link de login.
  // Ver src/lib/redirect-seguro.ts.
  const callbackSeguro = destinoSeguro(searchParams.get("callbackUrl"), null);
  const callbackUrl = callbackSeguro ?? "/";
  const loginHref = callbackSeguro
    ? `/login?callbackUrl=${encodeURIComponent(callbackSeguro)}`
    : "/login";
```

- [ ] **Step 8: Rodar e confirmar verde**

Run: `npx vitest run src/components/auth/ src/lib/redirect-seguro.test.ts`
Expected: PASS em todos.

- [ ] **Step 9: Suíte completa e lint**

Run: `npm test && npx eslint src/lib/redirect-seguro.ts src/components/auth/`
Expected: tudo verde; eslint sem erro (aviso de `no-img-element` não se aplica, o mock usa `span`).

- [ ] **Step 10: Commit**

```bash
git add src/lib/redirect-seguro.ts src/lib/redirect-seguro.test.ts src/components/auth/
git commit -m "Login e cadastro só redirecionam para dentro do próprio site

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Rate limit no cadastro

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Test: `src/app/api/auth/register/route.test.ts`

**Interfaces:**
- Consumes: `criarLimitador({ max, janelaMs })` e `Limitador.permitir(chave, agora)` de `src/lib/rate-limit.ts`.
- Produces: nada exportado.

- [ ] **Step 1: Isolar os testes existentes do limite**

O limitador vive no módulo e dura o arquivo de teste inteiro. Sem isto, os testes existentes, todos sem `x-forwarded-for`, somariam tentativas na mesma chave e o sexto quebraria.

Em `route.test.ts`, trocar o helper `req` por:

```ts
// Cada requisição sai de um IP diferente por padrão: o limitador vive no módulo
// e dura o arquivo inteiro, e os testes que não são sobre o limite não podem
// esbarrar nele.
let ipSequencial = 0;

function req(body: Record<string, unknown>, comTenant = true, ip = `ip-${++ipSequencial}`) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      ...(comTenant ? { "x-tenant-id": TENANT } : {}),
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Escrever os testes que falham**

No fim de `route.test.ts`:

```ts
describe("limite de tentativas", () => {
  // Sem limite, a rota responde "Email já cadastrado" para quantos e-mails
  // alguém quiser testar, e a lista de clientes do restaurante sai por
  // tentativa. O 409 fica, porque a tela de cadastro depende dele; o limite é
  // o que contém a enumeração.
  it("recusa com 429 a sexta tentativa do mesmo IP", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(req({ ...corpoValido, email: `c${i}@exemplo.com` }, true, "203.0.113.7"));
      expect(res.status).toBe(201);
    }

    const res = await POST(req(corpoValido, true, "203.0.113.7"));

    expect(res.status).toBe(429);
    expect(userFindUnique).toHaveBeenCalledTimes(5);
  });

  it("outro IP continua passando", async () => {
    for (let i = 0; i < 5; i++) await POST(req(corpoValido, true, "203.0.113.8"));

    const res = await POST(req(corpoValido, true, "203.0.113.9"));

    expect(res.status).toBe(201);
  });

  it("conta só o primeiro IP do x-forwarded-for", async () => {
    // A Vercel põe o IP do cliente primeiro. Os seguintes são proxies, e contar
    // a lista inteira deixaria o cliente fugir do limite trocando o próprio
    // header.
    for (let i = 0; i < 5; i++) await POST(req(corpoValido, true, "198.51.100.1, 10.0.0.1"));

    const res = await POST(req(corpoValido, true, "198.51.100.1, 10.0.0.2"));

    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `npx vitest run src/app/api/auth/register/route.test.ts`
Expected: os testes antigos PASSAM. "recusa com 429" e "conta só o primeiro IP" FALHAM com status 201 no lugar de 429. "outro IP continua passando" PASSA.

- [ ] **Step 4: Implementar**

Em `src/app/api/auth/register/route.ts`, acrescentar o import:

```ts
import { criarLimitador } from "@/lib/rate-limit";
```

Depois do `registerSchema`:

```ts
// Por tenant e IP. O 409 de e-mail já cadastrado responde a quem perguntar, e
// sem limite a lista de clientes de um restaurante sai por tentativa. O tenant
// entra na chave para que o volume num restaurante não trave o cadastro em
// outro atrás do mesmo IP.
const limitador = criarLimitador({ max: 5, janelaMs: 10 * 60 * 1000 });
```

Dentro de `POST`, logo depois de `if (!tenantId) return apiError(...)`:

```ts
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido").split(",")[0].trim();
  if (!limitador.permitir(`${tenantId}:${ip}`, Date.now())) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em alguns minutos." },
      { status: 429 }
    );
  }
```

- [ ] **Step 5: Rodar e confirmar verde**

Run: `npx vitest run src/app/api/auth/register/route.test.ts`
Expected: PASS em todos.

- [ ] **Step 6: Suíte completa e lint**

Run: `npm test && npx eslint src/app/api/auth/register/`
Expected: tudo verde; eslint sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/auth/register/
git commit -m "Cadastro de cliente ganha limite por tenant e IP

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Matriz de acesso

**Files:**
- Create: `src/security/politica-de-acesso.ts`
- Create: `src/security/matriz-de-acesso.test.ts`
- Modify: `docs/superpowers/specs/2026-09-15-suite-de-seguranca-design.md` (bloco do tipo `Nivel`)

**Interfaces:**
- Consumes: os handlers exportados de todo `src/app/api/**/route.ts`; os módulos `@/lib/auth` (`auth`), `@/lib/auth-platform` (`authPlatform`), `@/lib/prisma` (`prisma`, `prismaUnscoped`), `@/lib/supabase-admin` (`supabaseAdmin`), `@/lib/resend` (`resend`), todos mockados.
- Produces: `POLITICA: Record<string, Nivel>`, `type Nivel`, `type Papel`.

- [ ] **Step 1: Escrever o manifesto**

`src/security/politica-de-acesso.ts`:

```ts
/**
 * Quem pode chamar cada handler de API.
 *
 * src/security/matriz-de-acesso.test.ts lê este arquivo nas duas direções:
 * handler sem entrada quebra o teste, entrada sem handler também. Rota nova
 * não entra no ar sem alguém decidir, por escrito, quem pode chamá-la.
 *
 * A chave é "MÉTODO /api/caminho", com o caminho escrito como a pasta
 * (`/api/coupons/[id]`).
 */

export type Papel = "CUSTOMER" | "ADMIN" | "KITCHEN" | "MOTOBOY";

export type Nivel =
  /** Qualquer um. O motivo é obrigatório: é quem abre a rota dizendo por quê. */
  | { tipo: "PUBLICO"; motivo: string }
  /**
   * O acesso depende de quem é o dono do registro, então a rota precisa lê-lo
   * antes de decidir e não cabe na regra de "nenhum acesso ao banco". A matriz
   * não a exercita; o motivo aponta quem cobre.
   */
  | { tipo: "DONO_DO_RECURSO"; motivo: string }
  /** Autentica por segredo compartilhado, não por sessão. */
  | { tipo: "SEGREDO"; motivo: string }
  /**
   * Lista explícita de quem entra, sem hierarquia. As rotas divergem (cozinha
   * aceita ADMIN e KITCHEN, upload aceita ADMIN e plataforma), e uma hierarquia
   * implícita esconderia justamente a divergência.
   */
  | { tipo: "AUTENTICADO"; aceita: Array<Papel | "PLATAFORMA"> };

const publico = (motivo: string): Nivel => ({ tipo: "PUBLICO", motivo });
const donoDoRecurso = (motivo: string): Nivel => ({ tipo: "DONO_DO_RECURSO", motivo });
const segredo = (motivo: string): Nivel => ({ tipo: "SEGREDO", motivo });
const autenticado = (...aceita: Array<Papel | "PLATAFORMA">): Nivel => ({
  tipo: "AUTENTICADO",
  aceita,
});

// ADMIN primeiro: a matriz usa o primeiro aceito no controle positivo.
const QUALQUER_CONTA_DO_RESTAURANTE: Papel[] = ["ADMIN", "CUSTOMER", "KITCHEN", "MOTOBOY"];

export const POLITICA: Record<string, Nivel> = {
  "POST /api/ai/menu-recommendation": publico(
    "sugestão do cardápio para quem está navegando, sem conta; limitada por IP"
  ),
  "GET /api/analytics": autenticado("ADMIN"),

  "POST /api/assinar": publico("checkout de restaurante novo, que ainda não tem conta; limitado por IP"),
  "POST /api/assinar/reconciliar": publico(
    "volta do gateway na tela de obrigado, antes de existir conta; limitada por IP"
  ),
  "GET /api/assinar/slug": publico(
    "o checkout confere se o endereço está livre antes de existir conta; limitada por IP"
  ),
  "POST /api/assinaturas/webhook/asaas": segredo(
    "asaas-access-token comparado com ASAAS_WEBHOOK_TOKEN em tempo constante"
  ),

  "POST /api/auth/forgot-password": publico(
    "quem esqueceu a senha não tem sessão; limitada por IP e responde igual para e-mail inexistente"
  ),
  "POST /api/auth/register": publico("cadastro de cliente do restaurante; limitado por tenant e IP"),
  "POST /api/auth/reset-password": publico(
    "autentica pelo token enviado por e-mail, não por sessão; limitada por IP"
  ),

  "GET /api/categories": publico("categorias do cardápio público"),
  "POST /api/categories": autenticado("ADMIN"),
  "GET /api/chat/unread": autenticado(...QUALQUER_CONTA_DO_RESTAURANTE),

  "GET /api/coupons": autenticado("ADMIN"),
  "POST /api/coupons": autenticado("ADMIN"),
  "PATCH /api/coupons/[id]": autenticado("ADMIN"),
  "DELETE /api/coupons/[id]": autenticado("ADMIN"),
  "POST /api/coupons/validate": autenticado(...QUALQUER_CONTA_DO_RESTAURANTE),

  "GET /api/cron/assinaturas": segredo("Authorization: Bearer CRON_SECRET, enviado pelo cron da Vercel"),
  "POST /api/cron/assinaturas": segredo("Authorization: Bearer CRON_SECRET, o mesmo job disparado à mão"),

  "GET /api/delivery-zones": publico("zonas e taxas de entrega mostradas no checkout"),
  "POST /api/delivery-zones": autenticado("ADMIN"),
  "PATCH /api/delivery-zones/[id]": autenticado("ADMIN"),
  "DELETE /api/delivery-zones/[id]": autenticado("ADMIN"),

  "POST /api/funil/evento": publico("evento anônimo da landing; exige origem permitida e limita por IP"),
  "OPTIONS /api/leads/publico": publico("preflight de CORS da landing; libera só origem permitida"),
  "POST /api/leads/publico": publico("captação de lead da landing; exige origem permitida e limita por IP"),

  "GET /api/menu": publico("cardápio público do restaurante"),
  "POST /api/menu": autenticado("ADMIN"),
  "GET /api/menu/[id]": publico("item do cardápio público"),
  "PUT /api/menu/[id]": autenticado("ADMIN"),
  "DELETE /api/menu/[id]": autenticado("ADMIN"),

  "GET /api/motoboy/orders": autenticado("MOTOBOY", "ADMIN"),
  "POST /api/motoboy/orders/[orderId]/accept": autenticado("MOTOBOY", "ADMIN"),
  "POST /api/motoboy/orders/[orderId]/complete": autenticado("MOTOBOY", "ADMIN"),
  "POST /api/motoboy/orders/[orderId]/location": autenticado("MOTOBOY", "ADMIN"),
  "GET /api/motoboy/orders/[orderId]/location": donoDoRecurso(
    "rastreio decidido por canViewOrder depois de ler o pedido; ver src/lib/order-access.test.ts"
  ),

  "GET /api/orders": autenticado(...QUALQUER_CONTA_DO_RESTAURANTE),
  "POST /api/orders": publico(
    "pedido de mesa não exige conta e delivery exige; a divisão é coberta em src/app/api/orders/route.test.ts"
  ),
  "GET /api/orders/[id]": donoDoRecurso(
    "acompanhamento decidido por canViewOrder depois de ler o pedido; ver src/lib/order-access.test.ts"
  ),
  "PATCH /api/orders/[id]": autenticado("ADMIN", "KITCHEN"),
  "GET /api/orders/[id]/chat": donoDoRecurso(
    "só o dono do pedido ou ADMIN, decidido depois de ler o pedido; ver o route.test.ts ao lado"
  ),
  "POST /api/orders/[id]/chat": donoDoRecurso(
    "só o dono do pedido ou ADMIN, decidido depois de ler o pedido; ver o route.test.ts ao lado"
  ),

  "POST /api/payments/charge": donoDoRecurso(
    "quem não pode ver o pedido não pode cobrá-lo; canViewOrder depois de ler o pedido"
  ),
  "GET /api/payments/connections": autenticado("ADMIN"),
  "POST /api/payments/connections": autenticado("ADMIN"),
  "DELETE /api/payments/connections": autenticado("ADMIN"),
  "GET /api/payments/methods": publico(
    "o checkout consulta os métodos antes de pagar; devolve só métodos e se exige CPF"
  ),
  "GET /api/payments/webhook/[provider]/[tenantId]": publico(
    "o gateway valida a URL de notificação com GET; responde ok sem ler nada"
  ),
  "POST /api/payments/webhook/[provider]/[tenantId]": publico(
    "autentica pela assinatura do gateway dentro do adapter e responde igual quando não há conexão"
  ),

  "PATCH /api/platform/clientes/[id]": autenticado("PLATAFORMA"),
  "POST /api/platform/cobrancas/[id]/baixa": autenticado("PLATAFORMA"),
  "GET /api/platform/leads": autenticado("PLATAFORMA"),
  "POST /api/platform/leads": autenticado("PLATAFORMA"),
  "GET /api/platform/leads/[id]": autenticado("PLATAFORMA"),
  "PATCH /api/platform/leads/[id]": autenticado("PLATAFORMA"),
  "POST /api/platform/leads/[id]/converter": autenticado("PLATAFORMA"),
  "POST /api/platform/leads/[id]/notas": autenticado("PLATAFORMA"),
  "PATCH /api/platform/leads/[id]/plano": autenticado("PLATAFORMA"),

  "GET /api/settings": publico("tempo de entrega exibido no cardápio"),
  "PUT /api/settings": autenticado("ADMIN"),
  "GET /api/settings/business-hours": publico("horário de funcionamento exibido no cardápio"),
  "PUT /api/settings/business-hours": autenticado("ADMIN"),
  "POST /api/settings/onboarding": autenticado("ADMIN"),
  "GET /api/settings/printer": publico("só liga/desliga e largura do papel, sem dado sensível"),
  "PUT /api/settings/printer": autenticado("ADMIN"),
  "GET /api/settings/restaurant": publico("nome, endereço, telefone e logo exibidos no cardápio"),
  "PUT /api/settings/restaurant": autenticado("ADMIN"),

  "GET /api/tables": autenticado("ADMIN"),
  "POST /api/tables": autenticado("ADMIN"),
  "PATCH /api/tables/[id]": autenticado("ADMIN"),
  "DELETE /api/tables/[id]": autenticado("ADMIN"),
  "POST /api/tables/[id]/close-bill": autenticado("ADMIN"),
  "GET /api/tables/[id]/orders": autenticado("ADMIN"),
  "GET /api/tables/token/[token]": publico("mesa identificada pelo token do QR code, sem conta"),
  "GET /api/tables/token/[token]/conta": publico(
    "conta da mesa identificada pelo token do QR code, sem conta"
  ),

  "POST /api/upload": autenticado("ADMIN", "PLATAFORMA"),
  "GET /api/users/motoboys": autenticado("ADMIN"),
  "POST /api/users/motoboys": autenticado("ADMIN"),
  "PATCH /api/users/motoboys/[id]": autenticado("ADMIN"),
  "DELETE /api/users/motoboys/[id]": autenticado("ADMIN"),
};
```

- [ ] **Step 2: Escrever a matriz**

`src/security/matriz-de-acesso.test.ts`:

```ts
/**
 * A matriz de acesso: todo handler de API contra o manifesto.
 *
 * Três afirmações, e a ordem importa para ler uma falha:
 *
 * 1. Cobertura. Todo handler tem política e toda política tem handler.
 * 2. Negação. Quem não está na política recebe resposta fora de 2xx E a rota
 *    não toca o banco. A segunda metade é a que pega o bug sutil: consultar e
 *    só depois checar o papel já vazou tempo de resposta e efeito colateral,
 *    mesmo que o fim seja um 403.
 * 3. Controle positivo. Quem está na política não leva 401 nem 403. Sem isto a
 *    matriz passaria contra uma rota que recusa todo mundo, ou contra um mock
 *    que não pegou.
 *
 * A matriz testa o handler isolado. Sessão de OUTRO tenant é barrada pelo
 * proxy, não pelo handler, e o teste disso mora em src/proxy.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POLITICA, type Nivel, type Papel } from "./politica-de-acesso";

// --- dublês -------------------------------------------------------------------

const espiao = vi.hoisted(() => {
  const acessos: string[] = [];

  /**
   * Cliente que aceita qualquer caminho (`prisma.order.findMany(...)`), anota
   * cada propriedade lida e resolve toda chamada com undefined.
   *
   * `then` volta undefined sem anotar: o `await` de um valor pergunta por ele,
   * e um `then` que devolvesse função faria o await esperar para sempre.
   */
  function cliente(nome: string): unknown {
    return new Proxy(() => Promise.resolve(undefined), {
      get(_alvo, prop) {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        acessos.push(`${nome}.${String(prop)}`);
        return cliente(`${nome}.${String(prop)}`);
      },
      apply: () => Promise.resolve(undefined),
    });
  }

  return { acessos, cliente };
});

const sessoes = vi.hoisted(() => ({
  tenant: null as unknown,
  plataforma: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: espiao.cliente("prisma"),
  prismaUnscoped: espiao.cliente("prismaUnscoped"),
}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: espiao.cliente("supabaseAdmin") }));
vi.mock("@/lib/resend", () => ({ resend: espiao.cliente("resend") }));
vi.mock("@/lib/auth", () => ({
  auth: async () => sessoes.tenant,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));
vi.mock("@/lib/auth-platform", () => ({
  authPlatform: async () => sessoes.plataforma,
  platformHandlers: {},
  signInPlatform: async () => undefined,
  signOutPlatform: async () => undefined,
}));

// --- varredura ------------------------------------------------------------------

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<Response>;

interface Alvo {
  chave: string;
  metodo: string;
  caminho: string;
  handler: Handler;
  params: Record<string, string>;
}

const METODOS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const TENANT = "tenant-da-matriz";

const alvos: Alvo[] = [];
for (const [arquivo, carregar] of Object.entries(import.meta.glob("../app/api/**/route.ts"))) {
  // Handlers do próprio NextAuth: sustentam o login e não são código nosso.
  if (arquivo.includes("[...nextauth]")) continue;

  const caminho = arquivo.replace(/^\.\.\/app/, "").replace(/\/route\.ts$/, "");
  const params = Object.fromEntries(
    [...caminho.matchAll(/\[([^\]]+)\]/g)].map((m) => [m[1], "id-teste"])
  );
  const modulo = (await carregar()) as Record<string, unknown>;

  for (const metodo of METODOS) {
    if (typeof modulo[metodo] !== "function") continue;
    alvos.push({
      chave: `${metodo} ${caminho}`,
      metodo,
      caminho,
      handler: modulo[metodo] as Handler,
      params,
    });
  }
}

type Quem = "NINGUEM" | Papel | "PLATAFORMA";
const TODOS: Quem[] = ["NINGUEM", "CUSTOMER", "ADMIN", "KITCHEN", "MOTOBOY", "PLATAFORMA"];

function entrarComo(quem: Quem) {
  sessoes.tenant =
    quem === "NINGUEM" || quem === "PLATAFORMA"
      ? null
      : { user: { id: "user-da-matriz", name: "Teste", email: "t@exemplo.com", role: quem, tenantId: TENANT } };
  sessoes.plataforma =
    quem === "PLATAFORMA" ? { user: { id: "admin-da-matriz", name: "Admin", email: "a@exemplo.com" } } : null;
}

function requisicao(alvo: Alvo): NextRequest {
  const url = `http://restaurante.localhost:3000${alvo.caminho.replace(/\[[^\]]+\]/g, "id-teste")}`;
  const temCorpo = !["GET", "HEAD", "OPTIONS"].includes(alvo.metodo);
  return new NextRequest(url, {
    method: alvo.metodo,
    headers: {
      "x-tenant-id": TENANT,
      // O plano mais alto, para a trava de plano não mascarar a falta de trava
      // de papel com um 403 que parece certo.
      "x-tenant-plano": "MEMBRO_MESA_QR",
      "content-type": "application/json",
    },
    ...(temCorpo ? { body: "{}" } : {}),
  });
}

/** A resposta, ou o erro que o handler deixou escapar. */
async function chamar(alvo: Alvo): Promise<Response | Error> {
  try {
    return await alvo.handler(requisicao(alvo), { params: Promise.resolve(alvo.params) });
  } catch (erro) {
    return erro instanceof Error ? erro : new Error(String(erro));
  }
}

const nivelDe = (alvo: Alvo): Nivel | undefined => POLITICA[alvo.chave];
const exigeSessao = (alvo: Alvo) => nivelDe(alvo)?.tipo === "AUTENTICADO";
const aceitos = (alvo: Alvo) =>
  (nivelDe(alvo) as Extract<Nivel, { tipo: "AUTENTICADO" }>).aceita;

beforeEach(() => {
  espiao.acessos.length = 0;
  entrarComo("NINGUEM");
  vi.stubEnv("CRON_SECRET", "segredo-do-cron-da-matriz");
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "token-do-asaas-da-matriz");
  // Nenhum handler sai para a rede a partir daqui.
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("rede bloqueada na matriz de acesso");
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- 1. cobertura -------------------------------------------------------------------

describe("toda rota de API tem política declarada", () => {
  it("a varredura encontrou handlers", () => {
    expect(alvos.length).toBeGreaterThan(0);
  });

  it("todo handler exportado está no manifesto", () => {
    expect(alvos.map((a) => a.chave).filter((c) => !(c in POLITICA))).toEqual([]);
  });

  it("toda entrada do manifesto aponta para um handler que existe", () => {
    const existentes = new Set(alvos.map((a) => a.chave));
    expect(Object.keys(POLITICA).filter((c) => !existentes.has(c))).toEqual([]);
  });

  it("todo motivo é uma frase, não um carimbo", () => {
    const curtos = Object.entries(POLITICA)
      .filter(([, n]) => n.tipo !== "AUTENTICADO" && n.motivo.trim().length < 20)
      .map(([chave]) => chave);
    expect(curtos).toEqual([]);
  });

  it("toda rota autenticada aceita alguém", () => {
    const vazias = Object.entries(POLITICA)
      .filter(([, n]) => n.tipo === "AUTENTICADO" && n.aceita.length === 0)
      .map(([chave]) => chave);
    expect(vazias).toEqual([]);
  });
});

// --- 2. negação -------------------------------------------------------------------------

const casosDeNegacao = alvos
  .filter(exigeSessao)
  .flatMap((alvo) =>
    TODOS.filter((quem) => quem === "NINGUEM" || !aceitos(alvo).includes(quem)).map(
      (quem) => [alvo.chave, quem, alvo] as const
    )
  );

describe("quem não está na política é recusado antes do banco", () => {
  it.each(casosDeNegacao)("%s como %s", async (_chave, quem, alvo) => {
    entrarComo(quem);

    const res = await chamar(alvo);

    expect(res, `lançou em vez de responder: ${String(res)}`).toBeInstanceOf(Response);
    expect((res as Response).status, "respondeu 2xx").not.toBeLessThan(300);
    expect(espiao.acessos, "tocou o banco antes de recusar").toEqual([]);
  });
});

const casosDeSegredo = alvos
  .filter((alvo) => nivelDe(alvo)?.tipo === "SEGREDO")
  .map((alvo) => [alvo.chave, alvo] as const);

describe("rota de segredo sem o segredo é recusada antes do banco", () => {
  it.each(casosDeSegredo)("%s, mesmo com sessão de ADMIN", async (_chave, alvo) => {
    // A sessão está aqui para provar que ela não abre a porta.
    entrarComo("ADMIN");

    const res = await chamar(alvo);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).not.toBeLessThan(300);
    expect(espiao.acessos).toEqual([]);
  });
});

// --- 3. controle positivo -----------------------------------------------------------

const casosPositivos = alvos
  .filter(exigeSessao)
  .map((alvo) => [alvo.chave, aceitos(alvo)[0], alvo] as const);

describe("quem está na política não é barrado", () => {
  it.each(casosPositivos)("%s como %s", async (_chave, quem, alvo) => {
    entrarComo(quem);

    const res = await chamar(alvo);

    // O banco de mentira devolve undefined, então a rota pode quebrar mais
    // adiante, com 400, 404, 500 ou exceção. Tudo isso prova que ela passou
    // da checagem de acesso. Só 401 e 403 provariam o contrário.
    if (res instanceof Response) {
      expect([401, 403]).not.toContain(res.status);
    }
  });
});
```

- [ ] **Step 3: Rodar**

Run: `npx vitest run src/security/matriz-de-acesso.test.ts`
Expected: PASS em todos. A contagem esperada é 80 entradas no manifesto (48 autenticadas, 24 públicas, 5 de dono do recurso, 3 de segredo), 225 casos de negação, 3 de segredo e 48 positivos.

Se algo falhar, leia a mensagem antes de mexer:

- **"todo handler exportado está no manifesto"**: a lista mostra a chave exata. Leia a rota, decida o nível e acrescente ao manifesto.
- **Negação com "tocou o banco antes de recusar"**: é bug real de ordem na rota. Mova a checagem de sessão para antes da primeira consulta, com teste no `route.test.ts` da rota, em commit próprio. Não afrouxe a matriz.
- **Negação com "lançou em vez de responder"**: o handler quebra antes de checar a sessão. Veja a exceção; se vier do harness (módulo sem mock, por exemplo), acrescente o mock com `espiao.cliente`. Se vier da rota, trate como o item anterior.
- **Positivo com 401 ou 403**: ou o manifesto está errado (a rota não aceita aquele papel), ou a rota exige algo que o harness não manda. Leia a rota e corrija o lado errado.

- [ ] **Step 4: Confirmar que a matriz morde**

Faça cada sabotagem, rode o arquivo, confirme o FAIL e desfaça:

1. Em `src/app/api/coupons/route.ts`, no `GET`, troque `if (session?.user.role !== "ADMIN")` por `if (!session)`. Expected: FAIL em "GET /api/coupons como CUSTOMER" (e KITCHEN, MOTOBOY), com "respondeu 2xx" ou "tocou o banco".
2. No manifesto, troque `"GET /api/analytics": autenticado("ADMIN")` por `autenticado("KITCHEN")`. Expected: FAIL no positivo "GET /api/analytics como KITCHEN" com 403, e na negação "como ADMIN".
3. Apague a entrada `"POST /api/upload"` do manifesto. Expected: FAIL em "todo handler exportado está no manifesto" listando `POST /api/upload`.

Run: `git diff --stat`
Expected: só os dois arquivos novos de `src/security/`.

- [ ] **Step 5: Registrar o quarto tipo na spec**

Em `docs/superpowers/specs/2026-09-15-suite-de-seguranca-design.md`, trocar o bloco

```ts
type Nivel =
  | { tipo: "PUBLICO"; motivo: string }
  | { tipo: "SEGREDO"; motivo: string }
  | { tipo: "AUTENTICADO"; aceita: Array<Papel | "PLATAFORMA"> };
```

por

```ts
type Nivel =
  | { tipo: "PUBLICO"; motivo: string }
  | { tipo: "DONO_DO_RECURSO"; motivo: string }
  | { tipo: "SEGREDO"; motivo: string }
  | { tipo: "AUTENTICADO"; aceita: Array<Papel | "PLATAFORMA"> };
```

e acrescentar, logo depois do item de `AUTENTICADO` na lista abaixo do bloco:

```md
* `DONO_DO_RECURSO` entrou na escrita do plano. As rotas que decidem pelo dono do
  pedido (`canViewOrder`, o chat do pedido, a cobrança) precisam ler o registro
  antes de decidir, então não cabem em "nenhum acesso ao banco" e também não são
  públicas. A matriz não as exercita; o motivo aponta o teste que cobre.
```

- [ ] **Step 6: Suíte completa e lint**

Run: `npm test && npx eslint src/security/`
Expected: tudo verde; eslint sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/security/politica-de-acesso.ts src/security/matriz-de-acesso.test.ts docs/superpowers/specs/2026-09-15-suite-de-seguranca-design.md
git commit -m "Matriz de acesso: rota de API nova não entra sem política declarada

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: CI e o registro no AGENTS.md

**Files:**
- Create: `.github/workflows/testes.yml`
- Modify: `AGENTS.md` (nova seção no fim)

**Interfaces:**
- Consumes: `npm run lint`, `npm test`.
- Produces: nada.

- [ ] **Step 1: Escrever o workflow**

`.github/workflows/testes.yml`:

```yaml
name: Testes

# O build da Vercel não roda vitest. Sem isto, a suíte só protege quem lembra
# de rodá-la, e as regras de src/security/ existem justamente para quem não
# lembra.
on:
  push:
  pull_request:

concurrency:
  group: testes-${{ github.ref }}
  cancel-in-progress: true

jobs:
  testes:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      # --ignore-scripts porque o postinstall (scripts/fix-lightningcss.js)
      # instala binários de macOS, que aqui não servem e só atrasam. O único
      # passo do postinstall que os testes precisam é o client do Prisma.
      - run: npm ci --ignore-scripts
      - run: npx prisma generate

      - run: npm run lint
      - run: npm test

      # Avisa e não reprova: em 15/09/2026 há quatro vulnerabilidades high
      # abertas (prisma, @prisma/config, deepmerge-ts, ws), e reprovar todo PR
      # até elas subirem faria alguém desligar o passo inteiro.
      - name: npm audit (só avisa)
        continue-on-error: true
        run: npm audit --omit=dev --audit-level=high
```

- [ ] **Step 2: Escrever a seção do AGENTS.md**

Acrescentar ao fim de `AGENTS.md`:

```md
# A suíte de segurança

`src/security/` guarda testes sobre o projeto inteiro, que falham quando um
arquivo **novo** viola uma regra. A spec é
`docs/superpowers/specs/2026-09-15-suite-de-seguranca-design.md`.

**Rota de API nova precisa de entrada em `src/security/politica-de-acesso.ts`.**
Sem ela, `matriz-de-acesso.test.ts` quebra. A matriz chama cada handler com as
sessões que não estão na política e exige duas coisas: resposta fora de 2xx e
**nenhum acesso ao banco antes de recusar**. Se ela acusar "tocou o banco", o
bug é da rota, que consulta antes de checar o papel. Não afrouxe o teste.

A matriz testa o handler isolado, e o handler não compara o tenant da sessão
com o do host. Quem barra a sessão de outro restaurante é o `tenantMismatch` do
proxy, e só ele.

`invariantes.test.ts` trava o resto:

* importar `prismaUnscoped` exige entrada em `USO_DE_PRISMA_UNSCOPED`, com
  motivo;
* componente `"use client"` não importa `prisma`, `crypto`, `supabase-admin`,
  `auth`, `auth-platform` nem `resend`;
* `NEXT_PUBLIC_*` fica em lista fechada;
* toda tabela criada em migração tem `ENABLE ROW LEVEL SECURITY`, e todo model
  nasce numa migração;
* os headers de segurança do `next.config.js` continuam lá.

`callbackUrl` e qualquer outro destino vindo da URL passam por `destinoSeguro()`
(`src/lib/redirect-seguro.ts`) antes de `router.push` ou `redirect`.

O GitHub Actions roda lint e testes em todo push (`.github/workflows/testes.yml`).
O `npm audit` ali só avisa.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/testes.yml AGENTS.md
git commit -m "CI roda lint e testes em todo push; AGENTS.md explica a suíte de segurança

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Verificar o workflow num Linux limpo**

O `git archive` leva só o que está commitado, então nada da máquina local (node_modules, `src/generated`, `.env`) entra.

Run:

```bash
git archive HEAD | docker run --rm -i -w /app node:24 bash -c \
  'tar -x && npm ci --ignore-scripts && npx prisma generate && npm run lint && npm test'
```

Expected: `npm run lint` com 0 erros, e `npm test` com todos os arquivos verdes (140 arquivos: os 135 da linha de base mais os 5 novos). Se falhar, corrija, faça commit da correção e repita este step.

- [ ] **Step 5: Verificação final**

Run: `npm test && npm run lint && git log --oneline main..HEAD`
Expected: testes verdes, lint sem erro, e nove commits na branch (spec, plano e sete tasks).
