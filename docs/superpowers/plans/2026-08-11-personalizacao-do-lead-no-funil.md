# Personalização do lead no funil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o cadastro de lead no funil da plataforma preencha opcionalmente endereço
e logo do restaurante, e propagar nome/endereço/telefone/logo para o `Setting("restaurant_info")`
do tenant no momento da conversão, em vez de o cliente nascer com os dados de placeholder da Muno.

**Architecture:** Duas colunas novas no `Lead` (`endereco`, `logoUrl`), capturadas no formulário
de cadastro (upload de logo via rota `/api/upload` adaptada para aceitar sessão de plataforma) e
propagadas por `provisionTenant` para um `Setting` criado na mesma transação que cria o `Tenant`.

**Tech Stack:** Next.js (App Router), Prisma, NextAuth (duas instâncias: tenant e plataforma),
Supabase Storage, Vitest.

## Global Constraints

- Migração de schema só via `npm run db:migrate` (passa por `scripts/guard-local-db.js`, que
  recusa qualquer `DATABASE_URL` que não seja localhost — nunca rodar `prisma migrate dev` direto).
- Nenhuma relação nova com `Tenant` usa `onDelete: Cascade` — é proposital (AGENTS.md, "Remover um
  cliente"), então qualquer código que apague um `Tenant` precisa apagar as tabelas dependentes
  antes, na ordem certa.
- Testes usam Vitest com `environment: "node"` e `include: ["src/**/*.test.ts"]`
  (`vitest.config.ts`) — não há Testing Library nem `.test.tsx` configurados neste repo. Mudanças
  de componente React são verificadas manualmente (dev server), não por teste automatizado.
- Seguir o padrão de mock já estabelecido nos testes de rota existentes: `vi.mock("@/lib/prisma", ...)`
  com funções `vi.fn()` por operação, `vi.mock("@/lib/auth-platform", ...)` /
  `vi.mock("@/lib/auth", ...)` para sessão, import dinâmico da rota depois dos mocks
  (`await import(...)`).

---

### Task 1: Colunas `endereco`/`logoUrl` no Lead e aceite no cadastro

**Files:**
- Modify: `prisma/schema.prisma:356-378` (model `Lead`)
- Create: `prisma/migrations/<timestamp>_endereco_e_logo_no_lead/migration.sql` (gerada pelo Prisma)
- Modify: `src/app/api/platform/leads/route.ts:6-13` (`createSchema`)
- Test: `src/app/api/platform/leads/route.test.ts` (novo arquivo)

**Interfaces:**
- Produces: `Lead.endereco: string | null`, `Lead.logoUrl: string | null` no Prisma Client
  gerado — usados pelas Tasks 4 e 6.
- Produces: `POST /api/platform/leads` aceita `endereco?: string` e `logoUrl?: string` no corpo,
  com o mesmo tratamento de "vazio vira null" que os demais campos opcionais já têm.

- [ ] **Step 1: Escrever o teste da rota (ainda falhando)**

Crie `src/app/api/platform/leads/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: {
      create: (...args: unknown[]) => create(...args),
    },
  },
}));

const { POST } = await import("@/app/api/platform/leads/route");

function requisicao(body: unknown): NextRequest {
  return new NextRequest("http://admin.localhost/api/platform/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "admin-1" } });
  create.mockImplementation(async (args: { data: unknown }) => ({
    id: "lead-1",
    ...(args.data as Record<string, unknown>),
  }));
});

describe("POST /api/platform/leads", () => {
  it("grava endereco e logoUrl quando informados", async () => {
    const res = await POST(
      requisicao({
        restaurante: "Pizzaria do João",
        endereco: "Rua das Flores, 100",
        logoUrl: "https://exemplo.com/logo.png",
      })
    );

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({
      endereco: "Rua das Flores, 100",
      logoUrl: "https://exemplo.com/logo.png",
    });
  });

  it("normaliza endereco e logoUrl vazios para null, igual aos demais opcionais", async () => {
    const res = await POST(
      requisicao({ restaurante: "Pizzaria do João", endereco: "", logoUrl: "" })
    );

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].data).toMatchObject({
      endereco: null,
      logoUrl: null,
    });
  });

  it("continua funcionando sem endereco/logoUrl (campos opcionais)", async () => {
    const res = await POST(requisicao({ restaurante: "Pizzaria do João" }));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await POST(requisicao({ restaurante: "x", endereco: "y" }));

    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/platform/leads/route.test.ts`
Expected: FAIL nos dois primeiros casos — `endereco`/`logoUrl` não existem em `createSchema`
hoje, então o zod os descarta silenciosamente e `create.mock.calls[0][0].data` não tem essas
chaves.

- [ ] **Step 3: Adicionar as colunas ao schema**

Em `prisma/schema.prisma`, no model `Lead` (linha 356), adicione as duas colunas ao lado das
outras opcionais:

```prisma
model Lead {
  id          String     @id @default(cuid())
  restaurante String
  contato     String?
  email       String?
  telefone    String?
  cidade      String?
  endereco    String?
  logoUrl     String?
  origem      String     @default("manual")
  // ... resto do model sem mudança
```

- [ ] **Step 4: Gerar e aplicar a migração**

Confirme que o Postgres local está de pé (`docker compose up -d` se não estiver) e rode:

```bash
npm run db:migrate -- --name endereco_e_logo_no_lead
```

Isso passa por `scripts/guard-local-db.js`, gera
`prisma/migrations/<timestamp>_endereco_e_logo_no_lead/migration.sql`, aplica no banco local e
roda `prisma generate` — o que atualiza os tipos do Prisma Client usados nas próximas tasks.

- [ ] **Step 5: Aceitar os campos no `createSchema`**

Em `src/app/api/platform/leads/route.ts`, adicione as duas linhas ao schema (linha 6-13):

```ts
const createSchema = z.object({
  restaurante: z.string().min(2, "Informe o nome do restaurante"),
  contato: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  endereco: z.string().optional(),
  logoUrl: z.string().optional(),
  origem: z.string().default("manual"),
});
```

Nenhuma outra linha da rota muda: `endereco` e `logoUrl` caem em `...opcionais` e passam pelo
mesmo `Object.fromEntries(...)` que já transforma vazio em `null` para `contato`/`cidade`/etc.

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/api/platform/leads/route.test.ts`
Expected: PASS nos 4 casos.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/app/api/platform/leads/route.ts src/app/api/platform/leads/route.test.ts
git commit -m "Aceita endereco e logoUrl opcionais no cadastro de lead"
```

---

### Task 2: Rota de upload aceita sessão de plataforma

**Files:**
- Modify: `src/app/api/upload/route.ts:1-9`
- Test: `src/app/api/upload/route.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `auth()` de `@/lib/auth`, `authPlatform()` de `@/lib/auth-platform` (ambas já
  existem, sem mudança de assinatura).
- Produces: `POST /api/upload` aceita sessão de tenant ADMIN (comportamento atual) OU sessão de
  plataforma — usado pela Task 4 (upload de logo no cadastro de lead, sem tenant nem sessão de
  tenant disponíveis).

- [ ] **Step 1: Escrever o teste da rota (ainda falhando)**

Crie `src/app/api/upload/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => upload(...args),
        getPublicUrl: (...args: unknown[]) => getPublicUrl(...args),
      }),
    },
  },
}));

const { POST } = await import("@/app/api/upload/route");

function arquivo(nome = "logo.png", tipo = "image/png"): File {
  return new File([new Uint8Array([1, 2, 3])], nome, { type: tipo });
}

function requisicao(file: File | null): NextRequest {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: fd,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(null);
  authPlatform.mockResolvedValue(null);
  upload.mockResolvedValue({ error: null });
  getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://cdn.example/logo.png" },
  });
});

describe("POST /api/upload", () => {
  it("aceita sessão de tenant ADMIN (comportamento atual)", async () => {
    auth.mockResolvedValue({ user: { role: "ADMIN" } });

    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("aceita sessão de plataforma, sem sessão de tenant", async () => {
    authPlatform.mockResolvedValue({ user: { id: "admin-1" } });

    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("recusa sem nenhuma das duas sessões", async () => {
    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("recusa sessão de tenant que não é ADMIN e sem sessão de plataforma", async () => {
    auth.mockResolvedValue({ user: { role: "GARCOM" } });

    const res = await POST(requisicao(arquivo()));

    expect(res.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/app/api/upload/route.test.ts`
Expected: FAIL no caso "aceita sessão de plataforma" — a rota hoje devolve 403 porque só checa
`auth()`.

- [ ] **Step 3: Ajustar o guard da rota**

Em `src/app/api/upload/route.ts`, adicione o import e troque o guard (linhas 1-9):

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authPlatform } from "@/lib/auth-platform";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const tenantSession = await auth();
  if (tenantSession?.user.role !== "ADMIN") {
    const platformSession = await authPlatform();
    if (!platformSession?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
  }
```

O resto do arquivo (a partir de `const formData = await req.formData();`) não muda.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/app/api/upload/route.test.ts`
Expected: PASS nos 4 casos.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/upload/route.ts src/app/api/upload/route.test.ts
git commit -m "Permite upload de logo com sessão de plataforma, sem tenant"
```

---

### Task 3: Extrair helper de upload de logo

**Files:**
- Create: `src/lib/upload-logo.ts`
- Test: `src/lib/upload-logo.test.ts`
- Modify: `src/components/adm/RestaurantInfoControl.tsx:25-39`

**Interfaces:**
- Produces: `uploadLogo(file: File): Promise<string>` de `@/lib/upload-logo` — resolve com a URL
  pública, rejeita se a resposta não for `ok`. Consumida por `RestaurantInfoControl.tsx` (este
  task) e por `NovoLeadForm.tsx` (Task 4).

- [ ] **Step 1: Escrever o teste do helper (ainda falhando)**

Crie `src/lib/upload-logo.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { uploadLogo } from "./upload-logo";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("uploadLogo", () => {
  it("envia o arquivo em multipart para /api/upload e devolve a URL pública", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://cdn.example/logo.png" }),
    });

    const url = await uploadLogo(
      new File(["x"], "logo.png", { type: "image/png" })
    );

    expect(url).toBe("https://cdn.example/logo.png");
    const [rota, opcoes] = mockFetch.mock.calls[0];
    expect(rota).toBe("/api/upload");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.body).toBeInstanceOf(FormData);
  });

  it("lança erro quando a resposta não é ok", async () => {
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    await expect(
      uploadLogo(new File(["x"], "logo.png", { type: "image/png" }))
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/upload-logo.test.ts`
Expected: FAIL com "Cannot find module './upload-logo'" (o arquivo não existe ainda).

- [ ] **Step 3: Criar o helper**

Crie `src/lib/upload-logo.ts`:

```ts
export async function uploadLogo(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    throw new Error("Erro ao enviar imagem");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/upload-logo.test.ts`
Expected: PASS nos 2 casos.

- [ ] **Step 5: Usar o helper em `RestaurantInfoControl.tsx`**

Sem teste automatizado aqui — não há Testing Library configurada neste repo (ver Global
Constraints); a verificação é manual no Step 6.

Em `src/components/adm/RestaurantInfoControl.tsx`, adicione o import e substitua a função local
`uploadLogo` (linhas 25-39):

```tsx
import { toast } from "sonner";
import type { RestaurantInfo } from "@/lib/restaurant";
import { uploadLogo } from "@/lib/upload-logo";
```

```tsx
  async function handleLogoSelected(file: File) {
    setUploading(true);
    try {
      const url = await uploadLogo(file);
      setInfo((prev) => ({ ...prev, logoUrl: url }));
      setSaved(false);
      toast.success("Logo carregada");
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }
```

E troque a referência no `onChange` do input de arquivo (perto da linha 92):

```tsx
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoSelected(f); }}
```

- [ ] **Step 6: Verificar manualmente**

Run: `npm run dev`

Abra o painel do restaurante (`/adm`, seção de informações do restaurante), clique em "Trocar
logo", escolha uma imagem e confirme que ela aparece no preview e que "Salvar informações" ainda
funciona — mesmo comportamento de antes do refactor.

- [ ] **Step 7: Commit**

```bash
git add src/lib/upload-logo.ts src/lib/upload-logo.test.ts src/components/adm/RestaurantInfoControl.tsx
git commit -m "Extrai helper de upload de logo para reuso no funil de leads"
```

---

### Task 4: Campos de endereço e logo no cadastro de lead

**Files:**
- Modify: `src/components/platform/NovoLeadForm.tsx`

**Interfaces:**
- Consumes: `uploadLogo(file: File): Promise<string>` de `@/lib/upload-logo` (Task 3).
- Consumes: `POST /api/platform/leads` aceitando `endereco`/`logoUrl` no corpo (Task 1).

- [ ] **Step 1: Adicionar "Endereço" como campo de texto**

Em `src/components/platform/NovoLeadForm.tsx`, adicione ao array `CAMPOS` (linha 7-12) — é texto
livre, mesmo tratamento de `contato`/`cidade`, então nenhuma outra mudança é necessária para esse
campo (`extras`, `onSubmit` e a limpeza no backend já são genéricos):

```tsx
const CAMPOS = [
  { name: "contato", label: "Nome do contato" },
  { name: "telefone", label: "Telefone" },
  { name: "email", label: "E-mail" },
  { name: "cidade", label: "Cidade" },
  { name: "endereco", label: "Endereço" },
] as const;
```

- [ ] **Step 2: Adicionar upload de logo**

No topo do arquivo, ajuste os imports:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, Upload } from "lucide-react";
import { uploadLogo } from "@/lib/upload-logo";
```

Dentro de `NovoLeadForm`, adicione estado e o handler de upload, ao lado dos outros `useState`:

```tsx
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function onLogoSelecionada(file: File) {
    setEnviandoLogo(true);
    setErro("");
    try {
      const url = await uploadLogo(file);
      setExtras((prev) => ({ ...prev, logoUrl: url }));
    } catch {
      setErro("Erro ao enviar a logo.");
    } finally {
      setEnviandoLogo(false);
    }
  }
```

Depois do `<div className="grid grid-cols-2 gap-3">...</div>` dos `CAMPOS` e antes do bloco de
erro/botões, adicione:

```tsx
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          Logo (opcional)
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={enviandoLogo}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition"
          >
            <Upload size={12} />
            {enviandoLogo ? "Enviando..." : "Escolher arquivo"}
          </button>
          {extras.logoUrl && (
            <div className="relative w-8 h-8 rounded border border-neutral-200 overflow-hidden shrink-0">
              <Image
                src={extras.logoUrl}
                alt="Preview da logo"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          )}
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLogoSelecionada(f);
          }}
        />
      </div>
```

`setExtras({})` no `onSubmit` de sucesso (linha 40, já existente) já limpa `logoUrl` junto com os
demais campos — nenhuma mudança necessária ali.

- [ ] **Step 3: Verificar manualmente**

Run: `npm run dev`

No console da plataforma (`/platform/clientes` ou onde `NovoLeadForm` estiver montado), abra
"Novo lead", preencha o restaurante, digite um endereço, envie uma imagem como logo e salve.
Confirme que:
- o preview da logo aparece depois do upload;
- o lead criado aparece na listagem;
- abrindo o Prisma Studio (`npm run db:studio`) ou consultando o banco local, o `Lead` criado tem
  `endereco` e `logoUrl` preenchidos.

- [ ] **Step 4: Commit**

```bash
git add src/components/platform/NovoLeadForm.tsx
git commit -m "Adiciona endereço e upload de logo ao cadastro de lead"
```

---

### Task 5: `provisionTenant` cria o `Setting("restaurant_info")`

**Files:**
- Modify: `src/lib/restaurant.ts:12-17` (exportar `DEFAULT`)
- Modify: `src/lib/tenant-provisioning.ts:74-133`
- Test: `src/lib/tenant-provisioning.test.ts` (arquivo existente, ampliar)

**Interfaces:**
- Produces: `provisionTenant` passa a aceitar `endereco?: string`, `telefone?: string`,
  `logoUrl?: string` além dos campos já existentes (`nome`, `slug`, `email`, `senha?`) — usado
  pela Task 6.
- Produces: todo `provisionTenant` bem-sucedido cria um `Setting` com
  `key: "restaurant_info"` e `tenantId` do tenant recém-criado.

- [ ] **Step 1: Exportar o `DEFAULT` de `restaurant.ts`**

Em `src/lib/restaurant.ts` (linha 12), torne a constante exportada:

```ts
export const DEFAULT: RestaurantInfo = {
  name: "Muno Food Restaurante",
  address: "Rua Paraty 1772, Ubatuba-SP",
  phone: "(12) 99999-0000",
  logoUrl: "/munowbg.png",
};
```

- [ ] **Step 2: Escrever o teste de `provisionTenant` (ainda falhando)**

Em `src/lib/tenant-provisioning.test.ts`, adicione os mocks de `@/lib/prisma` **antes** do import
existente (o `vi.mock` é hoisted pelo Vitest, então a posição não importa, mas mantenha os mocks
no topo do arquivo por legibilidade) e troque a linha de import para incluir `provisionTenant`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
const tenantCreate = vi.fn();
const userCreate = vi.fn();
const settingCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        tenant: {
          findUnique: (...a: unknown[]) => tenantFindUnique(...a),
          create: (...a: unknown[]) => tenantCreate(...a),
        },
        user: { create: (...a: unknown[]) => userCreate(...a) },
        setting: { create: (...a: unknown[]) => settingCreate(...a) },
      }),
  },
}));

import {
  ProvisionError,
  buildTenantBaseUrl,
  gerarSenha,
  provisionTenant,
  validateSlug,
} from "./tenant-provisioning";
```

(Remova a linha de `import` antiga que não tinha `provisionTenant`.)

No fim do arquivo, adicione:

```ts
describe("provisionTenant — restaurant_info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantFindUnique.mockResolvedValue(null);
    tenantCreate.mockImplementation(
      async (args: { data: { nome: string; slug: string } }) => ({
        id: "tenant-1",
        ...args.data,
      })
    );
    userCreate.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: "user-1",
        ...args.data,
      })
    );
    settingCreate.mockResolvedValue({});
    process.env.ROOT_DOMAIN = "munoapp.com.br";
  });

  it("cria o Setting com o nome do tenant e o resto no DEFAULT quando nada mais foi informado", async () => {
    await provisionTenant({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
    });

    expect(settingCreate).toHaveBeenCalledTimes(1);
    const { data } = settingCreate.mock.calls[0][0];
    expect(data.tenantId).toBe("tenant-1");
    expect(data.key).toBe("restaurant_info");
    expect(JSON.parse(data.value)).toEqual({
      name: "Pizzaria do João",
      address: "Rua Paraty 1772, Ubatuba-SP",
      phone: "(12) 99999-0000",
      logoUrl: "/munowbg.png",
    });
  });

  it("usa endereco/telefone/logoUrl do input quando informados", async () => {
    await provisionTenant({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
      endereco: "Rua das Flores, 100",
      telefone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });

    const { data } = settingCreate.mock.calls[0][0];
    expect(JSON.parse(data.value)).toEqual({
      name: "Pizzaria do João",
      address: "Rua das Flores, 100",
      phone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/tenant-provisioning.test.ts`
Expected: FAIL nos dois casos novos — `settingCreate` nunca é chamado, porque `provisionTenant`
ainda não cria nenhum `Setting`. (Os testes antigos de `validateSlug`/`gerarSenha`/
`buildTenantBaseUrl` continuam passando.)

- [ ] **Step 4: Implementar em `tenant-provisioning.ts`**

Adicione o import do `DEFAULT` (linha 1-6):

```ts
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Tenant, User } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { DEFAULT as RESTAURANT_INFO_DEFAULT } from "@/lib/restaurant";
```

Amplie a assinatura de `provisionTenant` (linha 74-79):

```ts
export async function provisionTenant(input: {
  nome: string;
  slug: string;
  email: string;
  senha?: string;
  endereco?: string;
  telefone?: string;
  logoUrl?: string;
}): Promise<{ tenant: Tenant; admin: User; url: string; senha: string }> {
```

E, dentro da transação, depois de criar `admin` e antes do `return { tenant, admin };` (linha
119-129):

```ts
    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: `Administrador ${input.nome}`,
        email: input.email,
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    // Todo tenant nasce com o Setting já preenchido: sem isto, o storefront
    // dele mostra "Muno Food Restaurante" em Ubatuba até o cliente editar na
    // mão — nome errado incluído, já que ele é sempre conhecido aqui.
    await tx.setting.create({
      data: {
        tenantId: tenant.id,
        key: "restaurant_info",
        value: JSON.stringify({
          name: input.nome,
          address: input.endereco?.trim() || RESTAURANT_INFO_DEFAULT.address,
          phone: input.telefone?.trim() || RESTAURANT_INFO_DEFAULT.phone,
          logoUrl: input.logoUrl?.trim() || RESTAURANT_INFO_DEFAULT.logoUrl,
        }),
      },
    });

    return { tenant, admin };
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/tenant-provisioning.test.ts`
Expected: PASS em todos os casos, antigos e novos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/restaurant.ts src/lib/tenant-provisioning.ts src/lib/tenant-provisioning.test.ts
git commit -m "provisionTenant cria o Setting(restaurant_info) do tenant"
```

---

### Task 6: Conversão de lead propaga endereço/telefone/logo e corrige a limpeza do tenant fantasma

**Files:**
- Modify: `src/app/api/platform/leads/[id]/converter/route.ts:53-57,117-126`
- Test: `src/app/api/platform/leads/[id]/converter/route.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: `provisionTenant` com os três campos novos (`endereco`, `telefone`, `logoUrl`) —
  Task 5.
- Consumes: `Lead.endereco`, `Lead.telefone`, `Lead.logoUrl` — Task 1.

- [ ] **Step 1: Escrever o teste da rota (ainda falhando)**

Crie `src/app/api/platform/leads/[id]/converter/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authPlatform = vi.fn();
vi.mock("@/lib/auth-platform", () => ({ authPlatform: () => authPlatform() }));

const provisionTenant = vi.fn();
vi.mock("@/lib/tenant-provisioning", () => ({
  ProvisionError: class ProvisionError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  provisionTenant: (...args: unknown[]) => provisionTenant(...args),
}));

const leadFindUnique = vi.fn();
const leadUpdateMany = vi.fn();
const assinaturaCreate = vi.fn();
const assinaturaDeleteMany = vi.fn();
const settingDeleteMany = vi.fn();
const userDeleteMany = vi.fn();
const tenantDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: {
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      updateMany: (...a: unknown[]) => leadUpdateMany(...a),
    },
    assinatura: {
      create: (...a: unknown[]) => assinaturaCreate(...a),
      deleteMany: (...a: unknown[]) => assinaturaDeleteMany(...a),
    },
    setting: { deleteMany: (...a: unknown[]) => settingDeleteMany(...a) },
    user: { deleteMany: (...a: unknown[]) => userDeleteMany(...a) },
    tenant: { delete: (...a: unknown[]) => tenantDelete(...a) },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { POST } = await import("@/app/api/platform/leads/[id]/converter/route");

function requisicao(body: unknown): NextRequest {
  return new NextRequest(
    "http://admin.localhost/api/platform/leads/lead-1/converter",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const params = { params: Promise.resolve({ id: "lead-1" }) };

const LEAD_BASE = {
  id: "lead-1",
  restaurante: "Pizzaria do João",
  tenantId: null,
  endereco: null,
  telefone: null,
  logoUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  authPlatform.mockResolvedValue({ user: { id: "admin-1" } });
  leadFindUnique.mockResolvedValue(LEAD_BASE);
  provisionTenant.mockResolvedValue({
    tenant: { id: "tenant-1", nome: "Pizzaria do João", slug: "pizzaria-joao" },
    admin: { email: "dono@exemplo.com" },
    url: "https://pizzaria-joao.munoapp.com.br",
    senha: "senha-gerada",
  });
  leadUpdateMany.mockResolvedValue({ count: 1 });
  assinaturaDeleteMany.mockResolvedValue({ count: 0 });
  settingDeleteMany.mockResolvedValue({ count: 0 });
  userDeleteMany.mockResolvedValue({ count: 0 });
  tenantDelete.mockResolvedValue({});
});

describe("POST /api/platform/leads/[id]/converter", () => {
  it("passa endereco, telefone e logoUrl do lead para provisionTenant", async () => {
    leadFindUnique.mockResolvedValue({
      ...LEAD_BASE,
      endereco: "Rua das Flores, 100",
      telefone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });

    await POST(
      requisicao({ slug: "pizzaria-joao", email: "dono@exemplo.com" }),
      params
    );

    expect(provisionTenant).toHaveBeenCalledWith({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
      endereco: "Rua das Flores, 100",
      telefone: "(12) 98888-7777",
      logoUrl: "https://cdn.example/logo.png",
    });
  });

  it("usa undefined, não null, quando o lead não tem esses campos", async () => {
    await POST(
      requisicao({ slug: "pizzaria-joao", email: "dono@exemplo.com" }),
      params
    );

    expect(provisionTenant).toHaveBeenCalledWith({
      nome: "Pizzaria do João",
      slug: "pizzaria-joao",
      email: "dono@exemplo.com",
      endereco: undefined,
      telefone: undefined,
      logoUrl: undefined,
    });
  });

  it("corrida perdida: desfaz o setting junto com assinatura e user antes de apagar o tenant", async () => {
    leadUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(
      requisicao({ slug: "pizzaria-joao", email: "dono@exemplo.com" }),
      params
    );

    expect(res.status).toBe(409);
    expect(settingDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
    });
    expect(tenantDelete).toHaveBeenCalledWith({ where: { id: "tenant-1" } });
  });

  it("recusa sem sessão de plataforma", async () => {
    authPlatform.mockResolvedValue(null);

    const res = await POST(
      requisicao({ slug: "x", email: "a@b.com" }),
      params
    );

    expect(res.status).toBe(401);
    expect(provisionTenant).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run "src/app/api/platform/leads/[id]/converter/route.test.ts"`
Expected: FAIL nos dois primeiros casos (a rota ainda não envia `endereco`/`telefone`/`logoUrl`
para `provisionTenant`) e no caso de corrida perdida (a rota ainda não chama
`prismaUnscoped.setting.deleteMany`).

- [ ] **Step 3: Propagar os campos do lead**

Em `src/app/api/platform/leads/[id]/converter/route.ts`, troque a chamada a `provisionTenant`
(linha 53-57):

```ts
    const { tenant, admin, url, senha } = await provisionTenant({
      nome: parsed.data.nome ?? lead.restaurante,
      slug: parsed.data.slug,
      email: parsed.data.email,
      endereco: lead.endereco ?? undefined,
      telefone: lead.telefone ?? undefined,
      logoUrl: lead.logoUrl ?? undefined,
    });
```

- [ ] **Step 4: Corrigir a limpeza do tenant fantasma**

Na mesma rota, na transação de desfazimento (linha 117-126), adicione o delete do `Setting` antes
do `Tenant` — sem ele o `tenant.delete` bate na FK que o Setting criado por `provisionTenant`
(Task 5) passou a deixar para trás:

```ts
      try {
        await prismaUnscoped.$transaction([
          // A assinatura pode ter acabado de ser criada logo acima, e a foreign
          // key dela impede o delete do tenant. Ainda não existe cobrança:
          // nenhuma foi emitida entre a criação e esta linha.
          prismaUnscoped.assinatura.deleteMany({
            where: { tenantId: tenant.id },
          }),
          // provisionTenant sempre cria o Setting("restaurant_info") agora —
          // sem FK cascade (nenhuma relação com Tenant tem, de propósito) —
          // e ele bloqueia o delete do tenant do mesmo jeito se não for limpo.
          prismaUnscoped.setting.deleteMany({
            where: { tenantId: tenant.id },
          }),
          prismaUnscoped.user.deleteMany({ where: { tenantId: tenant.id } }),
          prismaUnscoped.tenant.delete({ where: { id: tenant.id } }),
        ]);
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run "src/app/api/platform/leads/[id]/converter/route.test.ts"`
Expected: PASS em todos os casos.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — nenhuma regressão nos testes das Tasks 1-5 nem nos demais testes do repositório.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/platform/leads/[id]/converter/route.ts "src/app/api/platform/leads/[id]/converter/route.test.ts"
git commit -m "Propaga endereço/telefone/logo do lead na conversão e corrige limpeza do tenant fantasma"
```
