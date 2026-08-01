# Plataforma Muno: CRM de leads e onboarding em um clique — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à Muno uma área administrativa própria em `admin.munoapp.com.br`, com um CRM de leads enxuto e um botão que provisiona o cliente — eliminando o terminal do processo de onboarding.

**Architecture:** O `src/proxy.ts` desvia o subdomínio `admin` antes de resolver tenant e reescreve para `/platform/*`, negando esse caminho a qualquer outro host. A autenticação é uma segunda instância do NextAuth com nome de cookie próprio, isolada da autenticação de restaurante por construção. A lógica de criação de tenant sai do script CLI para `src/lib/tenant-provisioning.ts`, passando a servir os dois caminhos.

**Tech Stack:** Next.js 16 (App Router), NextAuth v5 beta, Prisma 6, Zod, Tailwind v4, Vitest, bcryptjs.

**Spec:** `docs/superpowers/specs/2026-07-31-plataforma-crm-leads-design.md`

## Pré-requisito de infraestrutura (manual, fora do código)

O dono do projeto executa isto na Vercel. **Nenhuma tarefa deste plano depende disso para
ser escrita ou testada**, mas o resultado só é utilizável depois:

1. Atrelar `*.munoapp.com.br` ao projeto (Settings → Domains). Hoje o DNS aponta para a
   Vercel mas nenhum projeto reivindica o hostname — `teste.munoapp.com.br` devolve
   `DEPLOYMENT_NOT_FOUND`, erro da Vercel, não o 404 do app.
2. Definir `ROOT_DOMAIN=www.munoapp.com.br,munoapp.com.br` — nessa ordem. Ver a tabela da
   armadilha na spec: um valor errado derruba o site, o outro serve o restaurante errado em
   silêncio.

## Global Constraints

- Este projeto **não é o Next.js do seu treino**. Antes de escrever código de framework, leia o guia relevante em `node_modules/next/dist/docs/` (instrução de `AGENTS.md`).
- **Só existe um banco, e ele é o de produção** (Supabase, ver `DATABASE_URL`). **Nunca** rode `npx prisma migrate dev` sem `--create-only`, `prisma migrate reset`, ou `prisma db push`. O fluxo obrigatório está na Task 2.
- `PlatformAdmin`, `Lead` e `LeadNote` **nunca** entram em `TENANT_SCOPED_MODELS` (`src/lib/prisma.ts:6-18`). Não têm `tenantId` próprio; a extensão quebraria neles.
- Todo código de plataforma usa `prismaUnscoped`, não `prisma` — não há tenant em contexto.
- **Não modificar `src/lib/auth.ts`.** Ele acabou de passar por revisão de segurança.
- Comentários e textos de interface em português.
- Não rodar `npm run build` nem `npm run dev`. Não rodar `npm run lint` (falha no repo inteiro por código gerado e cópias em `.claude/worktrees/`); lintar arquivos específicos com `npx eslint <caminho>`.
- Ao commitar, **nunca** `git add -A` ou `git add .` na raiz. Caminhos com colchetes (`[id]`) não casam em pathspec do git — adicione o diretório.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/tenant-provisioning.ts` | **Novo.** Validação de slug, geração de senha, URL do tenant e `provisionTenant` transacional. | 1 |
| `src/lib/tenant-provisioning.test.ts` | **Novo.** Testes das funções puras. | 1 |
| `scripts/create-tenant.ts` | Vira casca fina sobre a lib. | 1 |
| `prisma/schema.prisma` | `PlatformAdmin`, `Lead`, `LeadNote`, enum `LeadStatus`, relação em `Tenant`. | 2 |
| `prisma/migrations/*/migration.sql` | **Novo.** Puramente aditiva. | 2 |
| `src/lib/auth-platform.ts` | **Novo.** Segunda instância NextAuth, cookie próprio. | 3 |
| `src/app/api/platform/auth/[...nextauth]/route.ts` | **Novo.** Handlers da instância de plataforma. | 3 |
| `scripts/create-platform-admin.ts` | **Novo.** Único jeito de criar um `PlatformAdmin`. | 3 |
| `src/proxy.ts` | Desvio do subdomínio `admin`, rewrite e trava de `/platform/*`. | 4 |
| `src/app/platform/login/page.tsx` | **Novo.** Login da plataforma. | 5 |
| `src/app/platform/layout.tsx` | **Novo.** Guarda de sessão + navegação. | 5 |
| `src/app/platform/page.tsx` | **Novo.** Funil agrupado por status. | 6 |
| `src/app/api/platform/leads/route.ts` | **Novo.** Listar e criar lead. | 6 |
| `src/app/platform/leads/[id]/page.tsx` | **Novo.** Detalhe, notas, status, converter. | 7 |
| `src/app/api/platform/leads/[id]/route.ts` | **Novo.** Atualizar status/dados. | 7 |
| `src/app/api/platform/leads/[id]/notas/route.ts` | **Novo.** Adicionar nota. | 7 |
| `src/app/api/platform/leads/[id]/converter/route.ts` | **Novo.** Provisiona e liga o lead. | 8 |

---

### Task 1: Extrair `provisionTenant` com testes

**Files:**
- Create: `src/lib/tenant-provisioning.ts`
- Create: `src/lib/tenant-provisioning.test.ts`
- Modify: `scripts/create-tenant.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `validateSlug(slug: string): void` (lança `ProvisionError`), `gerarSenha(): string`, `buildTenantBaseUrl(slug: string): string`, `provisionTenant(input): Promise<{ tenant, admin, url, senha }>`, a classe `ProvisionError` com `.code`, e `RESERVED_SLUGS`. Consumidos pelas Tasks 3 e 8.

**Contexto:** hoje a lógica vive dentro de `scripts/create-tenant.ts`, misturada com `console.log` e `process.exit`. A API de conversão vai precisar da mesma validação; duas cópias divergiriam. Além de extrair, esta tarefa corrige um defeito real: o script cria tenant e admin em duas operações separadas, então uma falha na segunda deixa um tenant órfão ocupando o slug para sempre.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/tenant-provisioning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ProvisionError,
  buildTenantBaseUrl,
  gerarSenha,
  validateSlug,
} from "./tenant-provisioning";

describe("validateSlug", () => {
  it.each(["burger-house", "pizzaria1", "a", "x-y-z"])(
    "aceita slug válido: %s",
    (slug) => {
      expect(() => validateSlug(slug)).not.toThrow();
    }
  );

  it.each([
    ["Burger", "maiúsculas"],
    ["-comeca-com-hifen", "começa com hífen"],
    ["termina-com-hifen-", "termina com hífen"],
    ["dois--hifens", "hífens consecutivos"],
    ["com espaco", "espaço"],
    ["acentuação", "acento"],
    ["", "vazio"],
  ])("rejeita %s (%s)", (slug) => {
    expect(() => validateSlug(slug)).toThrow(ProvisionError);
  });

  it("rejeita slug reservado com o código certo", () => {
    try {
      validateSlug("admin");
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(ProvisionError);
      expect((err as ProvisionError).code).toBe("SLUG_RESERVADO");
    }
  });

  it("distingue slug inválido de slug reservado", () => {
    try {
      validateSlug("Admin");
      throw new Error("deveria ter lançado");
    } catch (err) {
      // "Admin" tem maiúscula, então falha no formato antes de chegar na
      // lista de reservados.
      expect((err as ProvisionError).code).toBe("SLUG_INVALIDO");
    }
  });
});

describe("gerarSenha", () => {
  it("gera senha com pelo menos 12 caracteres", () => {
    expect(gerarSenha().length).toBeGreaterThanOrEqual(12);
  });

  it("usa apenas caracteres seguros para URL", () => {
    for (let i = 0; i < 50; i++) {
      expect(gerarSenha()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("não repete", () => {
    const senhas = new Set(Array.from({ length: 100 }, () => gerarSenha()));
    expect(senhas.size).toBe(100);
  });
});

describe("buildTenantBaseUrl", () => {
  it("usa http em localhost", () => {
    process.env.ROOT_DOMAIN = "localhost:3000";
    expect(buildTenantBaseUrl("teste")).toBe("http://teste.localhost:3000");
  });

  it("usa https em domínio real e respeita o primeiro da lista", () => {
    process.env.ROOT_DOMAIN = "www.munoapp.com.br,munoapp.com.br";
    expect(buildTenantBaseUrl("teste")).toBe("https://teste.www.munoapp.com.br");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — o módulo `./tenant-provisioning` não existe.

- [ ] **Step 3: Implementar a lib**

Crie `src/lib/tenant-provisioning.ts`:

```ts
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
```

`prismaUnscoped` é deliberado: `User` é tenant-scoped, então o cliente normal injetaria o
`tenantId` do contexto atual — que aqui não existe e, se existisse, seria o errado.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS. Os testes anteriores do repositório continuam passando.

- [ ] **Step 5: Reescrever o script como casca fina**

Substitua o conteúdo de `scripts/create-tenant.ts` por:

```ts
import "dotenv/config";
import {
  ProvisionError,
  provisionTenant,
} from "../src/lib/tenant-provisioning";
import { prismaUnscoped } from "../src/lib/prisma";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Faltou valor para --${key}`);
      }
      args[key] = value;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.nome || !args.slug || !args.email) {
    console.error(
      'Uso: npm run tenant:create -- --nome "Restaurante X" --slug "restaurante-x" --email "admin@restaurantex.com" [--senha "..."]'
    );
    process.exit(1);
  }

  try {
    const { tenant, admin, url, senha } = await provisionTenant({
      nome: args.nome,
      slug: args.slug,
      email: args.email,
      senha: args.senha,
    });

    console.log("\nTenant criado com sucesso!\n");
    console.log(`  Nome:   ${tenant.nome}`);
    console.log(`  Slug:   ${tenant.slug}`);
    console.log(`  URL:    ${url}`);
    console.log(`  Admin:  ${admin.email}`);
    console.log(`  Senha:  ${senha}`);
  } catch (err) {
    if (err instanceof ProvisionError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint src/lib/tenant-provisioning.ts scripts/create-tenant.ts`
Expected: sem erros; todos os testes passando.

Não execute o script — ele escreve no banco de produção.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tenant-provisioning.ts src/lib/tenant-provisioning.test.ts scripts/create-tenant.ts
git commit -m "Extrai provisionamento de tenant para lib compartilhada e transacional"
```

---

### Task 2: Schema da plataforma

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_plataforma_crm_leads/migration.sql` (gerado)

**Interfaces:**
- Consumes: nada.
- Produces: models `PlatformAdmin`, `Lead`, `LeadNote` e enum `LeadStatus` no Prisma Client. Consumidos pelas Tasks 3, 6, 7 e 8.

**Contexto — leia antes de rodar qualquer coisa:** este projeto tem **um único banco, e é o de produção**. `prisma migrate dev` é feito para banco de desenvolvimento e pode propor operações destrutivas. O fluxo abaixo gera o SQL sem aplicar, você confere que é aditivo, e só então aplica.

- [ ] **Step 1: Adicionar os models**

Em `prisma/schema.prisma`, adicione ao final do arquivo:

```prisma
model PlatformAdmin {
  id        String   @id @default(cuid())
  nome      String
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
}

enum LeadStatus {
  NOVO
  CONTATADO
  NEGOCIACAO
  FECHADO
  PERDIDO
}

model Lead {
  id          String     @id @default(cuid())
  restaurante String
  contato     String?
  email       String?
  telefone    String?
  cidade      String?
  origem      String     @default("manual")
  status      LeadStatus @default(NOVO)
  motivoPerda String?
  tenantId    String?    @unique
  tenant      Tenant?    @relation(fields: [tenantId], references: [id])
  notas       LeadNote[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status])
}

model LeadNote {
  id        String   @id @default(cuid())
  leadId    String
  lead      Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  texto     String
  createdAt DateTime @default(now())

  @@index([leadId])
}
```

E no model `Tenant` (linha ~11), adicione o lado inverso da relação junto das outras:

```prisma
  lead              Lead?
```

**Não** adicione nada ao `TENANT_SCOPED_MODELS` em `src/lib/prisma.ts`. Esses models não têm `tenantId` próprio — `Lead.tenantId` é uma referência ao cliente convertido, não um escopo.

- [ ] **Step 2: Gerar a migration SEM aplicar**

Run: `npx prisma migrate dev --create-only --name plataforma_crm_leads`
Expected: cria o diretório da migration e imprime o caminho. **Não aplica nada no banco.**

- [ ] **Step 3: Conferir que o SQL é puramente aditivo**

Leia o `migration.sql` gerado. Ele deve conter **apenas** `CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX`, `CREATE UNIQUE INDEX` e `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`.

Se aparecer qualquer `DROP`, `ALTER COLUMN` ou `TRUNCATE`, **pare e reporte** — significa que o schema local divergiu do banco, e aplicar destruiria dado de produção.

- [ ] **Step 4: Aplicar e regenerar o client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: a migration é marcada como aplicada; o client é regenerado com os novos models.

- [ ] **Step 5: Verificar**

Run: `npx prisma migrate status && npx tsc --noEmit && npm test`
Expected: "Database schema is up to date!"; sem erros de tipo; testes passando.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Adiciona schema da plataforma: PlatformAdmin, Lead e LeadNote"
```

---

### Task 3: Autenticação de plataforma

**Files:**
- Create: `src/lib/auth-platform.ts`
- Create: `src/app/api/platform/auth/[...nextauth]/route.ts`
- Create: `scripts/create-platform-admin.ts`
- Modify: `package.json` (script `platform:create-admin`)

**Interfaces:**
- Consumes: model `PlatformAdmin` da Task 2.
- Produces: `authPlatform()` (lê a sessão de plataforma), `signIn`/`signOut` exportados como `signInPlatform`/`signOutPlatform`. Consumidos pelas Tasks 4, 5, 6, 7 e 8.

**Contexto:** o isolamento vem do **nome do cookie**, não de uma checagem. Cookies distintos significam que uma sessão de restaurante nunca é apresentada como sessão de plataforma. Modele o arquivo em `src/lib/auth.ts`, mas **não modifique aquele arquivo**.

- [ ] **Step 1: Criar a instância de plataforma**

Crie `src/lib/auth-platform.ts`:

```ts
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prismaUnscoped } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Instância separada da autenticação de restaurante (src/lib/auth.ts) de
// propósito. O nome de cookie próprio é o que garante o isolamento: uma sessão
// de restaurante nunca é aceita aqui, e vice-versa, sem depender de nenhuma
// checagem que alguém possa esquecer.
export const {
  handlers: platformHandlers,
  signIn: signInPlatform,
  signOut: signOutPlatform,
  auth: authPlatform,
} = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/platform/login" },
  cookies: {
    sessionToken: {
      name: "muno-platform.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  basePath: "/api/platform/auth",
  providers: [
    CredentialsProvider({
      name: "platform-credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const admin = await prismaUnscoped.platformAdmin.findUnique({
          where: { email: parsed.data.email },
        });
        if (!admin) return null;

        const ok = await bcrypt.compare(parsed.data.password, admin.password);
        if (!ok) return null;

        return { id: admin.id, name: admin.nome, email: admin.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token) session.user.id = token.id as string;
      return session;
    },
  },
});
```

- [ ] **Step 2: Montar os handlers**

Crie `src/app/api/platform/auth/[...nextauth]/route.ts`:

```ts
import { platformHandlers } from "@/lib/auth-platform";

export const { GET, POST } = platformHandlers;
```

- [ ] **Step 3: Criar o script de cadastro**

Crie `scripts/create-platform-admin.ts`. Este é o **único** jeito de criar um
`PlatformAdmin` — não existe rota de cadastro:

```ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prismaUnscoped } from "../src/lib/prisma";
import { gerarSenha } from "../src/lib/tenant-provisioning";

async function main() {
  const [nome, email, senhaArg] = process.argv.slice(2);

  if (!nome || !email) {
    console.error(
      'Uso: npm run platform:create-admin -- "Rodrigo Scharp" "rodrigo@munoapp.com.br" [senha]'
    );
    process.exit(1);
  }

  const existing = await prismaUnscoped.platformAdmin.findUnique({
    where: { email },
  });
  if (existing) {
    console.error(`Já existe um admin de plataforma com o e-mail ${email}.`);
    process.exit(1);
  }

  const senha = senhaArg ?? gerarSenha();
  const admin = await prismaUnscoped.platformAdmin.create({
    data: { nome, email, password: await bcrypt.hash(senha, 12) },
  });

  console.log("\nAdmin de plataforma criado!\n");
  console.log(`  Nome:  ${admin.nome}`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Senha: ${senha}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
```

- [ ] **Step 4: Registrar o script**

Em `package.json`, dentro de `"scripts"`, após a linha do `tenant:create`:

```json
    "platform:create-admin": "tsx scripts/create-platform-admin.ts",
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint src/lib/auth-platform.ts scripts/create-platform-admin.ts`
Expected: sem erros.

Não execute o script — ele escreve no banco de produção.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-platform.ts src/app/api/platform scripts/create-platform-admin.ts package.json
git commit -m "Adiciona autenticação de plataforma isolada por cookie próprio"
```

---

### Task 4: Roteamento do subdomínio `admin`

**Files:**
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: `authPlatform` da Task 3.
- Produces: as rotas `/platform/*` passam a ser alcançáveis **apenas** via `admin.<root>`.

**Contexto:** o Next roteia por caminho, não por host. Sem esta tarefa, `/platform/leads` seria acessível a partir do domínio de qualquer restaurante. São três movimentos, e o terceiro é o que fecha a porta dos fundos.

**Risco conhecido — leia antes do Step 2.** O `src/proxy.ts` inteiro é embrulhado por `export default auth(async (req) => {...})`, o wrapper da instância de restaurante, que injeta `req.auth`. Chamar `authPlatform()` **dentro** desse wrapper pode não funcionar: em middleware, o `auth()` do NextAuth depende de contexto de request que o wrapper de outra instância não fornece.

Se `authPlatform()` falhar ou devolver sempre `null` dentro do proxy, **não improvise**: pare e reporte. As saídas conhecidas, em ordem de preferência, são (a) ler o cookie `muno-platform.session-token` diretamente de `req.cookies` no proxy e apenas checar presença, deixando a validação real para o layout do server component da Task 5; ou (b) tirar o guard de sessão do proxy e mantê-lo só no layout. Ambas mudam a divisão de responsabilidades e merecem revisão, não tentativa e erro.

A opção (a) é segura porque o proxy aqui é **navegação, não autorização** — a autorização de verdade vive no layout (Task 5) e em cada rota de API (Tasks 6, 7, 8), que rodam em contexto normal de servidor onde `authPlatform()` funciona.

- [ ] **Step 1: Adicionar a constante e o desvio**

Em `src/proxy.ts`, logo após a linha `const ROOT_DOMAINS = ...` (linha 7), adicione:

```ts
// Subdomínio reservado da plataforma. Já consta em RESERVED_SLUGS
// (src/lib/tenant-provisioning.ts), então nenhum restaurante pode tomá-lo.
const PLATFORM_SUBDOMAIN = "admin";
```

- [ ] **Step 2: Desviar antes de resolver tenant**

Ainda em `src/proxy.ts`, dentro do handler, a linha atual é:

```ts
const slug = resolveSlugFromHost(host) ?? "default";
```

Substitua por:

```ts
const resolvedSlug = resolveSlugFromHost(host);

// A área de plataforma não pertence a nenhum tenant: não resolvemos tenant e
// não injetamos x-tenant-id, o que obriga o código de lá a usar
// prismaUnscoped conscientemente em vez de herdar um escopo em silêncio.
if (resolvedSlug === PLATFORM_SUBDOMAIN) {
  const isPlatformLogin = nextUrl.pathname === "/platform/login";
  const platformSession = await authPlatform();

  if (!platformSession && !isPlatformLogin) {
    return NextResponse.redirect(new URL("/platform/login", nextUrl));
  }
  if (platformSession && isPlatformLogin) {
    return NextResponse.redirect(new URL("/platform", nextUrl));
  }

  // Reescreve admin.<root>/leads -> /platform/leads, mantendo a URL limpa
  // no navegador. Evita prefixar duas vezes quando já veio reescrito.
  if (nextUrl.pathname.startsWith("/platform")) {
    return NextResponse.next();
  }
  return NextResponse.rewrite(
    new URL(`/platform${nextUrl.pathname}`, nextUrl)
  );
}

const slug = resolvedSlug ?? "default";
```

Adicione o import no topo do arquivo:

```ts
import { authPlatform } from "@/lib/auth-platform";
```

- [ ] **Step 3: Trancar a porta dos fundos**

Ainda em `src/proxy.ts`, logo após a linha `const slug = resolvedSlug ?? "default";`:

```ts
// /platform/* só existe sob o subdomínio da plataforma. Sem isto, o CRM
// ficaria acessível pelo domínio de qualquer restaurante.
if (nextUrl.pathname.startsWith("/platform")) {
  return new NextResponse(null, { status: 404 });
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint src/proxy.ts`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts
git commit -m "Roteia o subdomínio admin para a área de plataforma"
```

---

### Task 5: Login e layout da plataforma

**Files:**
- Create: `src/app/platform/layout.tsx`
- Create: `src/app/platform/login/page.tsx`

**Interfaces:**
- Consumes: `authPlatform`, `signInPlatform` da Task 3.
- Produces: o shell autenticado onde as Tasks 6 e 7 penduram as telas.

**Contexto:** o proxy (Task 4) já redireciona quem não tem sessão. O layout repete a checagem no servidor porque o proxy é conveniência de navegação, não autorização — a mesma separação de camadas usada no trabalho de login obrigatório. Siga o visual do resto do app: Tailwind v4, classes `bg-brand`, `rounded-xl`, `border-neutral-200`. Veja `src/components/auth/LoginForm.tsx` como referência de formulário.

- [ ] **Step 1: Criar o layout com guarda**

Crie `src/app/platform/layout.tsx`:

```tsx
import { authPlatform } from "@/lib/auth-platform";
import Link from "next/link";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await authPlatform();

  // Sem sessão, só a tela de login renderiza — o proxy já redireciona, mas a
  // autorização precisa existir aqui também, não só no roteamento.
  if (!session?.user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-neutral-900">
            Muno · Plataforma
          </Link>
          <span className="text-sm text-neutral-500">{session.user.email}</span>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Criar a tela de login**

Crie `src/app/platform/login/page.tsx` como client component, usando `signIn` de
`next-auth/react` com o `basePath` da instância de plataforma:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");

    // Chama o endpoint da instância de plataforma diretamente: o helper
    // signIn de next-auth/react aponta para o basePath padrão (/api/auth),
    // que é o da autenticação de restaurante.
    const res = await fetch("/api/platform/auth/callback/platform-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password: senha, redirect: "false" }),
    });

    if (!res.ok) {
      setErro("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-2xl border border-neutral-200 p-6 space-y-4"
      >
        <h1 className="text-xl font-bold text-neutral-900">Muno · Plataforma</h1>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Senha
          </label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
```

Se o `POST` direto ao callback não estabelecer a sessão nos seus testes, pare e reporte —
a alternativa é criar um wrapper server action que chame `signInPlatform`, e essa decisão
merece revisão em vez de tentativa e erro.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform"`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/platform
git commit -m "Adiciona login e layout da área de plataforma"
```

---

### Task 6: Funil de leads

**Files:**
- Create: `src/app/platform/page.tsx`
- Create: `src/app/api/platform/leads/route.ts`

**Interfaces:**
- Consumes: models da Task 2, `authPlatform` da Task 3.
- Produces: `GET /api/platform/leads` (lista) e `POST /api/platform/leads` (cria). Consumidos pela Task 7.

**Contexto:** lista agrupada pelos cinco status, com contador em cada — **não kanban com arrastar**. Drag-and-drop é caro e ruim no celular, que é onde o lead vai ser atualizado logo depois de uma ligação. Só `restaurante` é obrigatório no formulário: exigir mais faz o lead não ser cadastrado.

- [ ] **Step 1: Criar a API de leads**

Crie `src/app/api/platform/leads/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

const createSchema = z.object({
  restaurante: z.string().min(2, "Informe o nome do restaurante"),
  contato: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  origem: z.string().default("manual"),
});

export async function GET() {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const leads = await prismaUnscoped.lead.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { email, ...resto } = parsed.data;
  const lead = await prismaUnscoped.lead.create({
    data: { ...resto, email: email || null },
  });
  return NextResponse.json(lead, { status: 201 });
}
```

- [ ] **Step 2: Criar a tela do funil**

Crie `src/app/platform/page.tsx` como server component que lê os leads direto do banco
(mais rápido que passar pela API) e renderiza um client component para o formulário de
novo lead. Agrupe por status na ordem `NOVO`, `CONTATADO`, `NEGOCIACAO`, `FECHADO`,
`PERDIDO`, com o contador ao lado do título de cada grupo, e cada lead como um `<Link>`
para `/leads/{id}` mostrando `restaurante`, `cidade` e a data da última atualização.

Use os rótulos em português: `Novo`, `Contatado`, `Em negociação`, `Fechado`, `Perdido`.

```tsx
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import Link from "next/link";
import { NovoLeadForm } from "@/components/platform/NovoLeadForm";

const ORDEM = ["NOVO", "CONTATADO", "NEGOCIACAO", "FECHADO", "PERDIDO"] as const;

const ROTULOS: Record<(typeof ORDEM)[number], string> = {
  NOVO: "Novo",
  CONTATADO: "Contatado",
  NEGOCIACAO: "Em negociação",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

export default async function FunilPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const leads = await prismaUnscoped.lead.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-900">Funil</h1>
        <NovoLeadForm />
      </div>

      {ORDEM.map((status) => {
        const doStatus = leads.filter((l) => l.status === status);
        if (doStatus.length === 0) return null;

        return (
          <section key={status}>
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
              {ROTULOS[status]} · {doStatus.length}
            </h2>
            <div className="space-y-2">
              {doStatus.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="block bg-white border border-neutral-200 rounded-xl px-5 py-4 hover:border-brand/40 transition"
                >
                  <p className="font-semibold text-neutral-900">
                    {lead.restaurante}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {[lead.cidade, lead.origem].filter(Boolean).join(" · ")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {leads.length === 0 && (
        <p className="text-neutral-500 text-center py-16">
          Nenhum lead ainda. Cadastre o primeiro.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Criar o formulário de novo lead**

Crie `src/components/platform/NovoLeadForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

const CAMPOS = [
  { name: "contato", label: "Nome do contato" },
  { name: "telefone", label: "Telefone" },
  { name: "email", label: "E-mail" },
  { name: "cidade", label: "Cidade" },
] as const;

export function NovoLeadForm() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [restaurante, setRestaurante] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");

    const res = await fetch("/api/platform/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurante, ...extras }),
    });

    if (!res.ok) {
      setErro("Não foi possível salvar o lead.");
      setLoading(false);
      return;
    }

    setRestaurante("");
    setExtras({});
    setAberto(false);
    setLoading(false);
    router.refresh();
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
      >
        <Plus size={16} />
        Novo lead
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full bg-white border border-neutral-200 rounded-xl p-5 space-y-3"
    >
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Restaurante *
        </label>
        <input
          value={restaurante}
          onChange={(e) => setRestaurante(e.target.value)}
          required
          minLength={2}
          autoFocus
          placeholder="Pizzaria do João"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Só o nome é obrigatório: exigir mais faz o lead não ser cadastrado. */}
      <div className="grid grid-cols-2 gap-3">
        {CAMPOS.map((campo) => (
          <div key={campo.name}>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              {campo.label}
            </label>
            <input
              value={extras[campo.name] ?? ""}
              onChange={(e) =>
                setExtras((prev) => ({ ...prev, [campo.name]: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        ))}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-sm text-neutral-500 px-4 py-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform" "src/app/api/platform" src/components/platform`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/platform" "src/app/api/platform" src/components/platform
git commit -m "Adiciona funil de leads da plataforma"
```

---

### Task 7: Detalhe do lead, notas e status

**Files:**
- Create: `src/app/platform/leads/[id]/page.tsx`
- Create: `src/app/api/platform/leads/[id]/route.ts`
- Create: `src/app/api/platform/leads/[id]/notas/route.ts`

**Interfaces:**
- Consumes: models da Task 2, `authPlatform` da Task 3.
- Produces: a tela onde a Task 8 pendura o botão de conversão.

**Contexto:** a cronologia de notas é o valor real do funil — "liguei dia 3, pediu retorno dia 10". Por isso `LeadNote` é model próprio e não um campo de texto. **Qualquer transição de status é permitida**: venda não é linear, e um lead volta de negociação para contato sem drama. A única restrição é que `tenantId` só é preenchido pela rota de conversão (Task 8).

- [ ] **Step 1: API de atualização do lead**

Crie `src/app/api/platform/leads/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

// tenantId NÃO está aqui de propósito: esse campo é escrito só pela rota de
// conversão, que é o único caminho que provisiona um cliente de verdade.
const updateSchema = z.object({
  status: z
    .enum(["NOVO", "CONTATADO", "NEGOCIACAO", "FECHADO", "PERDIDO"])
    .optional(),
  restaurante: z.string().min(2).optional(),
  contato: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  motivoPerda: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const lead = await prismaUnscoped.lead.findUnique({
    where: { id },
    include: {
      notas: { orderBy: { createdAt: "asc" } },
      tenant: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const existing = await prismaUnscoped.lead.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const { email, ...resto } = parsed.data;
  const lead = await prismaUnscoped.lead.update({
    where: { id },
    data: { ...resto, ...(email !== undefined ? { email: email || null } : {}) },
  });

  return NextResponse.json(lead);
}
```

Qualquer transição de status é permitida de propósito: venda não é linear, e um lead volta
de `NEGOCIACAO` para `CONTATADO` sem problema.

- [ ] **Step 2: API de notas**

Crie `src/app/api/platform/leads/[id]/notas/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

const schema = z.object({ texto: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const lead = await prismaUnscoped.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }

  const nota = await prismaUnscoped.leadNote.create({
    data: { leadId: id, texto: parsed.data.texto },
  });

  // Toca o updatedAt do lead para ele subir no funil, que ordena por atividade.
  await prismaUnscoped.lead.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(nota, { status: 201 });
}
```

- [ ] **Step 3: Componente de status e notas**

Crie `src/components/platform/LeadAcoes.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS = [
  ["NOVO", "Novo"],
  ["CONTATADO", "Contatado"],
  ["NEGOCIACAO", "Em negociação"],
  ["FECHADO", "Fechado"],
  ["PERDIDO", "Perdido"],
] as const;

export function LeadAcoes({
  leadId,
  statusAtual,
}: {
  leadId: string;
  statusAtual: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function mudarStatus(status: string) {
    setSalvando(true);
    await fetch(`/api/platform/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSalvando(false);
    router.refresh();
  }

  async function adicionarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setSalvando(true);
    await fetch(`/api/platform/leads/${leadId}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    setTexto("");
    setSalvando(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS.map(([valor, rotulo]) => (
          <button
            key={valor}
            onClick={() => mudarStatus(valor)}
            disabled={salvando || valor === statusAtual}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
              valor === statusAtual
                ? "bg-brand text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <form onSubmit={adicionarNota} className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Anotar algo sobre este lead..."
          className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={salvando}
          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-lg transition"
        >
          Anotar
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Tela de detalhe**

Crie `src/app/platform/leads/[id]/page.tsx`:

```tsx
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeadAcoes } from "@/components/platform/LeadAcoes";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await authPlatform();
  if (!session?.user) return null;

  const { id } = await params;
  const lead = await prismaUnscoped.lead.findUnique({
    where: { id },
    include: {
      notas: { orderBy: { createdAt: "asc" } },
      tenant: true,
    },
  });

  if (!lead) notFound();

  const contato = [lead.contato, lead.telefone, lead.email, lead.cidade].filter(
    Boolean
  );

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft size={16} />
        Voltar ao funil
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          {lead.restaurante}
        </h1>
        {contato.length > 0 && (
          <p className="text-sm text-neutral-500 mt-1">{contato.join(" · ")}</p>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <LeadAcoes leadId={lead.id} statusAtual={lead.status} />
      </div>

      {lead.tenant ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <p className="font-semibold text-green-800">Cliente criado</p>
          <a
            href={buildTenantBaseUrl(lead.tenant.slug)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-green-700 underline"
          >
            {buildTenantBaseUrl(lead.tenant.slug)}
          </a>
        </div>
      ) : (
        // A Task 8 pendura o botão de conversão aqui.
        <div id="conversao" />
      )}

      <section>
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
          Histórico
        </h2>
        {lead.notas.length === 0 ? (
          <p className="text-sm text-neutral-400">Nenhuma anotação ainda.</p>
        ) : (
          <ul className="space-y-3">
            {lead.notas.map((nota) => (
              <li
                key={nota.id}
                className="bg-white border border-neutral-200 rounded-xl px-4 py-3"
              >
                <p className="text-xs text-neutral-400">
                  {nota.createdAt.toLocaleString("pt-BR")}
                </p>
                <p className="text-sm text-neutral-800 mt-1">{nota.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform" "src/app/api/platform" src/components/platform`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/platform" "src/app/api/platform" src/components/platform
git commit -m "Adiciona detalhe do lead com cronologia de notas e mudança de status"
```

---

### Task 8: Conversão do lead em cliente

**Files:**
- Create: `src/app/api/platform/leads/[id]/converter/route.ts`
- Modify: `src/app/platform/leads/[id]/page.tsx`
- Create: `src/components/platform/ConverterLead.tsx`

**Interfaces:**
- Consumes: `provisionTenant` e `ProvisionError` da Task 1, models da Task 2, `authPlatform` da Task 3.
- Produces: nada.

**Contexto:** esta é a tarefa que responde ao problema original — o onboarding deixa de exigir terminal. O `provisionTenant` da Task 1 já é transacional, então a rota não precisa gerenciar isso; ela traduz erros e liga o lead ao tenant criado.

- [ ] **Step 1: Criar a rota de conversão**

Crie `src/app/api/platform/leads/[id]/converter/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { ProvisionError, provisionTenant } from "@/lib/tenant-provisioning";

const schema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  nome: z.string().min(2).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const lead = await prismaUnscoped.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
  }
  if (lead.tenantId) {
    return NextResponse.json(
      { error: "Este lead já foi convertido em cliente." },
      { status: 409 }
    );
  }

  try {
    const { tenant, admin, url, senha } = await provisionTenant({
      nome: parsed.data.nome ?? lead.restaurante,
      slug: parsed.data.slug,
      email: parsed.data.email,
    });

    await prismaUnscoped.lead.update({
      where: { id },
      data: { tenantId: tenant.id, status: "FECHADO" },
    });

    // Senha devolvida uma única vez: não fica recuperável depois.
    return NextResponse.json({ tenant, url, email: admin.email, senha }, { status: 201 });
  } catch (err) {
    if (err instanceof ProvisionError) {
      const status = err.code === "SLUG_EM_USO" ? 409 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
```

- [ ] **Step 2: Criar o componente de conversão**

Crie `src/components/platform/ConverterLead.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function sugerirSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Credenciais = {
  url: string;
  email: string;
  senha: string;
};

export function ConverterLead({
  leadId,
  restauranteNome,
}: {
  leadId: string;
  restauranteNome: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [slug, setSlug] = useState(() => sugerirSlug(restauranteNome));
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");

    const res = await fetch(`/api/platform/leads/${leadId}/converter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, email }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErro(
        typeof body?.error === "string"
          ? body.error
          : "Não foi possível converter este lead."
      );
      setLoading(false);
      return;
    }

    // Não chamamos router.refresh() aqui: o refresh re-renderiza a página e
    // apagaria a senha da tela, que não é recuperável depois.
    setCredenciais({ url: body.url, email: body.email, senha: body.senha });
    setLoading(false);
  }

  if (credenciais) {
    const texto = `${credenciais.url}\nLogin: ${credenciais.email}\nSenha: ${credenciais.senha}`;
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
        <p className="font-semibold text-green-800">Cliente criado!</p>

        <dl className="text-sm space-y-1">
          <div>
            <dt className="text-green-700 inline">URL: </dt>
            <dd className="inline font-mono">{credenciais.url}</dd>
          </div>
          <div>
            <dt className="text-green-700 inline">Login: </dt>
            <dd className="inline font-mono">{credenciais.email}</dd>
          </div>
          <div>
            <dt className="text-green-700 inline">Senha: </dt>
            <dd className="inline font-mono font-bold">{credenciais.senha}</dd>
          </div>
        </dl>

        <p className="text-xs text-green-700">
          Anote a senha agora — ela aparece uma única vez e não é recuperável.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(texto)}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            Copiar
          </button>
          <button
            onClick={() => {
              setCredenciais(null);
              router.refresh();
            }}
            className="text-sm text-green-700 px-4 py-2"
          >
            Já anotei
          </button>
        </div>
      </div>
    );
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-xl transition"
      >
        Converter em cliente
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3"
    >
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Endereço do restaurante *
        </label>
        <div className="flex items-center gap-1">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <span className="text-sm text-neutral-400">.munoapp.com.br</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          E-mail do dono *
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="joao@pizzaria.com"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          {loading ? "Criando..." : "Criar cliente"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-sm text-neutral-500 px-4 py-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Pendurar na tela de detalhe**

Em `src/app/platform/leads/[id]/page.tsx`, importe o componente:

```tsx
import { ConverterLead } from "@/components/platform/ConverterLead";
```

E substitua o marcador deixado pela Task 7:

```tsx
        // A Task 8 pendura o botão de conversão aqui.
        <div id="conversao" />
```

por:

```tsx
        <ConverterLead leadId={lead.id} restauranteNome={lead.restaurante} />
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform" "src/app/api/platform" src/components/platform`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/platform" "src/app/api/platform" src/components/platform
git commit -m "Adiciona conversão de lead em cliente com provisionamento do tenant"
```

---

## Verificação final

```bash
npm test && npx tsc --noEmit
```

Expected: todos os testes passando, sem erros de tipo.

Depois, com o pré-requisito de infraestrutura já feito, verifique no navegador:

1. `admin.munoapp.com.br` deslogado → redireciona para o login da plataforma
2. Login com o `PlatformAdmin` criado pelo script → cai no funil
3. Cadastrar um lead com só o nome → aparece em "Novo"
4. Abrir o lead, adicionar nota, mudar status → persiste
5. Converter → devolve URL, e-mail e senha; o lead vira "Fechado" com link para o cliente
6. Abrir a URL devolvida → o restaurante novo carrega, e o login do admin funciona
7. `pizzaria.munoapp.com.br/platform` (qualquer tenant) → **404**, a porta dos fundos está trancada
8. O login de restaurante continua funcionando normalmente e não dá acesso à plataforma
