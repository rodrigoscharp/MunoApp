# Onboarding do cliente novo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a quem acabou de comprar uma tela guiada de dois passos — identidade e primeiro item do cardápio — em vez de soltá-lo num painel zerado.

**Architecture:** Uma rota nova `/adm/comecar` (já protegida pela guarda de ADMIN do proxy) composta pelas rotas de API que já existem. Pendência é **derivada dos dados** (endereço preenchido + existe item), nunca de uma flag; só o "deixar para depois" é lembrado, numa linha de `Setting`. O redirecionamento mora no Dashboard, não no proxy.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Prisma, Vitest + Testing Library (jsdom por arquivo).

**Spec:** `docs/superpowers/specs/2026-08-30-onboarding-do-cliente-novo-design.md`

## Global Constraints

- **Sem migração.** Pendência é derivada; o "dispensado" usa o model `Setting` que já existe (`@@unique([tenantId, key])`).
- **Sem rota de API nova.** Usar `PUT /api/settings/restaurant`, `POST /api/categories`, `POST /api/menu`.
- **Sem travessão (—) em texto que o cliente lê.** Vírgula, ponto ou conjunção. Vale para toda a cópia de interface.
- **TDD obrigatório:** teste primeiro, vê falhar, código mínimo, vê passar, commita.
- **Regra pura recebe dados por parâmetro**, não consulta banco — convenção de `checarSlug` (`src/lib/inscricao/slug.ts`) e `escolhaDaQueryString` (`src/lib/plans.ts`).
- Testes de componente pedem `// @vitest-environment jsdom` na primeira linha do arquivo.
- Vitest só varre `src/**/*.test.ts(x)`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/onboarding.ts` (criar) | A regra pura: dado o estado, o onboarding está pendente? deve redirecionar? |
| `src/lib/onboarding.test.ts` (criar) | As quatro combinações da tabela da spec |
| `src/app/adm/comecar/page.tsx` (criar) | Server Component: lê estado atual e monta a tela |
| `src/components/adm/Comecar.tsx` (criar) | Client: os dois passos, o progresso e o "deixar para depois" |
| `src/components/adm/Comecar.test.tsx` (criar) | Render dos dois passos |
| `src/app/api/settings/onboarding/route.ts` (criar) | Grava o `Setting` de dispensa (não é rota de dado, é de preferência) |
| `src/app/adm/page.tsx` (modificar) | Redireciona quando pendente e não dispensado; mostra o bloco quando pendente |
| `src/components/auth/LoginForm.tsx` (modificar) | ADMIN passa a cair em `/adm` |

**Nota sobre a rota nova:** a Global Constraint diz "sem rota de API nova" para os **dados** do restaurante. A dispensa é preferência de interface e não tem rota existente; ela é a única exceção, e é trivial.

---

### Task 1: A regra de pendência

**Files:**
- Create: `src/lib/onboarding.ts`
- Test: `src/lib/onboarding.test.ts`

**Interfaces:**
- Produces: `type EstadoOnboarding = { enderecoPreenchido: boolean; temItem: boolean; dispensado: boolean }`, `estaPendente(e): boolean`, `deveRedirecionar(e): boolean`, `ONBOARDING_DISPENSADO = "onboarding_dispensado"`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { deveRedirecionar, estaPendente } from "./onboarding";

const estado = (over: Partial<Parameters<typeof estaPendente>[0]> = {}) => ({
  enderecoPreenchido: false,
  temItem: false,
  dispensado: false,
  ...over,
});

describe("estaPendente", () => {
  it("pendente enquanto faltar endereço ou item", () => {
    expect(estaPendente(estado())).toBe(true);
    expect(estaPendente(estado({ enderecoPreenchido: true }))).toBe(true);
    expect(estaPendente(estado({ temItem: true }))).toBe(true);
  });

  it("deixa de ser pendente com os dois prontos", () => {
    expect(
      estaPendente(estado({ enderecoPreenchido: true, temItem: true }))
    ).toBe(false);
  });

  // Derivado, não flag: quem preencheu tudo pelo caminho normal, sem passar
  // pelo onboarding, não pode continuar sendo tratado como pendente.
  it("dispensar não torna pronto", () => {
    expect(estaPendente(estado({ dispensado: true }))).toBe(true);
  });
});

describe("deveRedirecionar", () => {
  it("redireciona só quem está pendente e não dispensou", () => {
    expect(deveRedirecionar(estado())).toBe(true);
    expect(deveRedirecionar(estado({ dispensado: true }))).toBe(false);
    expect(
      deveRedirecionar(estado({ enderecoPreenchido: true, temItem: true }))
    ).toBe(false);
    expect(
      deveRedirecionar(
        estado({ enderecoPreenchido: true, temItem: true, dispensado: true })
      )
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: FAIL com `Cannot find module './onboarding'`

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * A regra recebe o estado por parâmetro em vez de consultar o banco: assim é
 * testável sem banco, e quem chama decide de onde os dados vêm. Mesma
 * convenção de checarSlug e escolhaDaQueryString.
 */
export const ONBOARDING_DISPENSADO = "onboarding_dispensado";

export type EstadoOnboarding = {
  enderecoPreenchido: boolean;
  temItem: boolean;
  dispensado: boolean;
};

/**
 * Pendência é DERIVADA dos dados, nunca de uma flag. Quem preenche tudo pelo
 * caminho normal do painel sai de pendente sozinho; uma flag continuaria
 * dizendo "pendente" com a casa inteira montada.
 *
 * Dispensar NÃO torna pronto: o bloco de progresso do painel continua
 * aparecendo. O que a dispensa desliga é só o redirecionamento.
 */
export function estaPendente(e: EstadoOnboarding): boolean {
  return !e.enderecoPreenchido || !e.temItem;
}

export function deveRedirecionar(e: EstadoOnboarding): boolean {
  return estaPendente(e) && !e.dispensado;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding.ts src/lib/onboarding.test.ts
git commit -m "A regra de pendência do onboarding, derivada dos dados"
```

---

### Task 2: A rota que lembra a dispensa

**Files:**
- Create: `src/app/api/settings/onboarding/route.ts`
- Test: `src/app/api/settings/onboarding/route.test.ts`

**Interfaces:**
- Produces: `POST /api/settings/onboarding` grava `Setting` com `key: ONBOARDING_DISPENSADO`, `value: "1"`. Exige ADMIN.
- Consumes: `ONBOARDING_DISPENSADO` da Task 1.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const auth = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { setting: { upsert: (...a: unknown[]) => upsert(...a) } },
}));
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/api", () => ({
  apiError: (m: string, s: number) =>
    new Response(JSON.stringify({ error: m }), { status: s }),
  getTenantIdFromRequest: () => "tenant-1",
  withTenant: (_id: string, fn: () => unknown) => fn(),
}));

function requisicao() {
  return new Request("http://x/api/settings/onboarding", { method: "POST" });
}

beforeEach(() => {
  upsert.mockReset();
  auth.mockReset();
});

describe("POST /api/settings/onboarding", () => {
  it("grava a dispensa para o tenant", async () => {
    auth.mockResolvedValue({ user: { role: "ADMIN" } });
    const { POST } = await import("./route");

    const res = await POST(requisicao() as never);

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_key: { tenantId: "tenant-1", key: "onboarding_dispensado" },
        },
      })
    );
  });

  it("recusa quem não é ADMIN", async () => {
    auth.mockResolvedValue({ user: { role: "CUSTOMER" } });
    const { POST } = await import("./route");

    const res = await POST(requisicao() as never);

    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/settings/onboarding/`
Expected: FAIL com `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { apiError, getTenantIdFromRequest, withTenant } from "@/lib/api";

import { ONBOARDING_DISPENSADO } from "@/lib/onboarding";

/**
 * "Deixar para depois" do onboarding.
 *
 * É a única coisa do onboarding que precisa ser lembrada: se ele terminou se
 * descobre olhando os dados (ver src/lib/onboarding.ts). Guardar só a dispensa
 * é o que permite não ter migração nenhuma.
 */
export async function POST(req: NextRequest) {
  const tenantId = getTenantIdFromRequest(req);
  if (!tenantId) return apiError("Tenant não identificado", 400);

  return withTenant(tenantId, async () => {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: ONBOARDING_DISPENSADO } },
      update: { value: "1" },
      create: { tenantId, key: ONBOARDING_DISPENSADO, value: "1" },
    });

    return NextResponse.json({ ok: true });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/settings/onboarding/`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/onboarding/
git commit -m "Rota que lembra o 'deixar para depois' do onboarding"
```

---

### Task 3: A tela dos dois passos

**Files:**
- Create: `src/components/adm/Comecar.tsx`
- Test: `src/components/adm/Comecar.test.tsx`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `<Comecar nomeRestaurante={string} enderecoPreenchido={boolean} temItem={boolean} />`

**Nota de domínio (não pule):** `POST /api/menu` exige `categoryId` e restaurante novo nasce com **zero categorias**. O passo 2 cria a categoria antes do item, em duas chamadas. O slug da categoria sai de `sugerirSlug` (`@/lib/inscricao/sugerir-slug`).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Comecar } from "./Comecar";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: "cat-1" }),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Comecar", () => {
  it("salva a identidade no passo 1", async () => {
    const user = userEvent.setup();
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido={false} temItem={false} />
    );

    await user.type(screen.getByLabelText(/endereço/i), "Rua A, 10, Ubatuba");
    await user.click(screen.getByRole("button", { name: /salvar e continuar/i }));

    await waitFor(() => {
      const chamada = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/settings/restaurant"
      );
      expect(chamada).toBeTruthy();
      expect(chamada![1].method).toBe("PUT");
      expect(JSON.parse(chamada![1].body).address).toBe("Rua A, 10, Ubatuba");
    });
  });

  // A ordem importa: sem categoria o item não salva, porque /api/menu exige
  // categoryId e restaurante novo não tem nenhuma.
  it("cria a categoria antes do item", async () => {
    const user = userEvent.setup();
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido temItem={false} />
    );

    await user.type(screen.getByLabelText(/categoria/i), "Lanches");
    await user.type(screen.getByLabelText(/nome do item/i), "X-Salada");
    await user.type(screen.getByLabelText(/preço/i), "25");
    await user.click(screen.getByRole("button", { name: /salvar item/i }));

    await waitFor(() => {
      const rotas = fetchMock.mock.calls.map((c) => c[0]);
      expect(rotas).toContain("/api/categories");
      expect(rotas).toContain("/api/menu");
      expect(rotas.indexOf("/api/categories")).toBeLessThan(
        rotas.indexOf("/api/menu")
      );
    });
  });

  it("manda o categoryId devolvido pela criação da categoria", async () => {
    const user = userEvent.setup();
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido temItem={false} />
    );

    await user.type(screen.getByLabelText(/categoria/i), "Lanches");
    await user.type(screen.getByLabelText(/nome do item/i), "X-Salada");
    await user.type(screen.getByLabelText(/preço/i), "25");
    await user.click(screen.getByRole("button", { name: /salvar item/i }));

    await waitFor(() => {
      const item = fetchMock.mock.calls.find((c) => c[0] === "/api/menu");
      expect(JSON.parse(item![1].body).categoryId).toBe("cat-1");
    });
  });

  it("começa no passo do cardápio quando a identidade já está pronta", () => {
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido temItem={false} />
    );

    expect(screen.getByLabelText(/nome do item/i)).toBeTruthy();
  });

  it("deixar para depois avisa o servidor", async () => {
    const user = userEvent.setup();
    render(
      <Comecar nomeRestaurante="Cantina da Ana" enderecoPreenchido={false} temItem={false} />
    );

    await user.click(screen.getByRole("button", { name: /deixar para depois/i }));

    await waitFor(() => {
      const rotas = fetchMock.mock.calls.map((c) => c[0]);
      expect(rotas).toContain("/api/settings/onboarding");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/adm/Comecar.test.tsx`
Expected: FAIL com `Cannot find module './Comecar'`

- [ ] **Step 3: Write minimal implementation**

Criar `src/components/adm/Comecar.tsx` como Client Component (`"use client"`) que:

- guarda `passo` em estado, inicializado em `enderecoPreenchido ? 2 : 1`
- **passo 1**: campos `Endereço` e `Telefone` (labels exatamente assim, com `htmlFor`/`id`), botão "Salvar e continuar". No submit faz
  `PUT /api/settings/restaurant` com body `{ name: nomeRestaurante, address, phone, logoUrl: "/munowbg.png", floorPlanImageUrl: null }` (o schema `restaurantInfoSchema` exige `name`; os outros têm default mas mandar explícito evita depender disso). Em caso de `ok`, avança para o passo 2.
- **passo 2**: campos `Categoria`, `Nome do item` e `Preço`, botão "Salvar item". No submit, **nesta ordem**:
  1. `POST /api/categories` com `{ name: categoria, slug: sugerirSlug(categoria), position: 0 }`
  2. lê `id` da resposta
  3. `POST /api/menu` com `{ name, price: Number(preco), categoryId: id, available: true }`
  4. em caso de `ok`, `window.location.href = "/adm"`
- botão "Deixar para depois" em ambos os passos: `POST /api/settings/onboarding` e depois `window.location.href = "/adm"`
- erro de qualquer chamada vira mensagem em `<p>` visível, sem travessão

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/adm/Comecar.test.tsx`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add src/components/adm/Comecar.tsx src/components/adm/Comecar.test.tsx
git commit -m "Os dois passos do onboarding, com a categoria antes do item"
```

---

### Task 4: A rota /adm/comecar

**Files:**
- Create: `src/app/adm/comecar/page.tsx`

**Interfaces:**
- Consumes: `Comecar` (Task 3), `getRestaurantInfo` (`@/lib/restaurant`).
- Produces: a rota `/adm/comecar`.

- [ ] **Step 1: Write the page**

Server Component que:

```tsx
import { auth } from "@/lib/auth";
import { prismaUnscoped } from "@/lib/prisma";
import { getRestaurantInfo } from "@/lib/restaurant";
import { Comecar } from "@/components/adm/Comecar";

export default async function ComecarPage() {
  const session = await auth();
  const tenantId = session!.user.tenantId;

  const [info, itens] = await Promise.all([
    getRestaurantInfo(tenantId),
    prismaUnscoped.menuItem.count({ where: { tenantId } }),
  ]);

  return (
    <Comecar
      nomeRestaurante={info.name}
      enderecoPreenchido={info.address.trim().length > 0}
      temItem={itens > 0}
    />
  );
}
```

A guarda de acesso é a do proxy, que já exige `role === "ADMIN"` em todo `/adm`. Não repetir aqui.

- [ ] **Step 2: Verificar que a rota responde**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/adm/comecar`
Expected: 307 (redirect para /login, porque a chamada não tem sessão). Isso confirma que a guarda do proxy pegou a rota nova.

- [ ] **Step 3: Commit**

```bash
git add src/app/adm/comecar/
git commit -m "A rota /adm/comecar"
```

---

### Task 5: O Dashboard redireciona e mostra o progresso

**Files:**
- Modify: `src/app/adm/page.tsx`

**Interfaces:**
- Consumes: `deveRedirecionar`, `estaPendente`, `ONBOARDING_DISPENSADO` (todos da Task 1).

**Nota:** `src/app/adm/page.tsx` **já calcula `menuItemCount`** no `Promise.all` existente. Reusar, não consultar de novo.

- [ ] **Step 1: Ler o estado e redirecionar**

No topo do componente, depois do `Promise.all` existente, acrescentar a leitura de endereço e dispensa e o redirecionamento:

```tsx
import { redirect } from "next/navigation";
import { getRestaurantInfo } from "@/lib/restaurant";
import { deveRedirecionar, estaPendente, ONBOARDING_DISPENSADO } from "@/lib/onboarding";

// ... dentro do componente, ao lado do Promise.all já existente:
const [info, dispensa] = await Promise.all([
  getRestaurantInfo(tenantId),
  prismaUnscoped.setting.findUnique({
    where: { tenantId_key: { tenantId, key: ONBOARDING_DISPENSADO } },
    select: { value: true },
  }),
]);

const estadoOnboarding = {
  enderecoPreenchido: info.address.trim().length > 0,
  temItem: menuItemCount > 0,
  dispensado: dispensa !== null,
};

// O redirecionamento mora aqui, e não no proxy: o proxy roda em toda
// requisição e já faz um findUnique de tenant, e somar duas consultas ali por
// uma tela vista uma vez na vida é caro no lugar errado. Aqui também só pega
// quem chega na porta do painel: quem digita /adm/cardapio direto não é
// sequestrado no meio do caminho.
if (deveRedirecionar(estadoOnboarding)) redirect("/adm/comecar");
```

- [ ] **Step 2: Mostrar o bloco quando pendente**

Antes dos cards do dashboard, quando `estaPendente(estadoOnboarding)`, renderizar um bloco com o que falta e um link para `/adm/comecar`. Texto sem travessão. O bloco aparece mesmo com a dispensa gravada: dispensar desliga o redirecionamento, não o lembrete.

- [ ] **Step 3: Verificar manualmente**

Provisionar um tenant de teste, criar a senha, logar e confirmar:
1. cai em `/adm/comecar`
2. "deixar para depois" leva ao painel e o bloco aparece
3. voltar em `/adm` não redireciona mais
4. completar os dois passos faz o bloco sumir

Limpar o tenant depois com `npm run tenant:remove -- --slug "<slug>" --confirmar "<slug>"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/adm/page.tsx
git commit -m "O painel leva ao onboarding e mostra o que falta"
```

---

### Task 6: O login leva ADMIN ao painel

**Files:**
- Modify: `src/components/auth/LoginForm.tsx:58`

**Interfaces:**
- Consumes: nada.

**Contexto:** hoje `router.push(callbackUrl)` com `callbackUrl = searchParams.get("callbackUrl") ?? "/"`. O dono entra e cai na própria vitrine. Sem esta task, o onboarding nunca é alcançado.

- [ ] **Step 1: Write the failing test**

Acrescentar a `src/funil-de-aquisicao.test.ts`, no bloco da costura 4:

```ts
// Sem isto o onboarding é inalcançável: o login manda para "/" (a vitrine) e
// quem acabou de comprar cai no próprio cardápio como se fosse cliente dele.
it("o login leva ADMIN para o painel, e respeita callbackUrl", () => {
  const login = lerFonte("src/components/auth/LoginForm.tsx");

  expect(login).toContain('"/adm"');
  expect(login).toContain("callbackUrl");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/funil-de-aquisicao.test.ts`
Expected: FAIL, porque `"/adm"` não aparece no arquivo.

- [ ] **Step 3: Write minimal implementation**

Em `LoginForm.tsx`, depois do `signIn` bem-sucedido, trocar `router.push(callbackUrl)` por um destino que respeita `callbackUrl` quando ele existe e manda ADMIN para `/adm` quando não existe:

```tsx
// Dono que faz login quer gerenciar, não pedir comida. Para ver o cardápio
// como cliente ele abre o endereço, que é público e não pede senha.
// callbackUrl continua mandando quando existe: quem foi barrado numa página
// específica volta para ela.
const destino =
  searchParams.get("callbackUrl") ??
  (resultado?.role === "ADMIN" ? "/adm" : "/");
router.push(destino);
```

O papel vem da sessão recém-criada. Se o `signIn` do projeto não devolver o papel, ler de `useSession()` depois do sucesso, ou fazer `router.push("/adm")` e deixar o proxy devolver quem não for ADMIN — mas **preferir a leitura do papel**, porque um CUSTOMER mandado para `/adm` levaria um redirect e veria a tela piscar.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/funil-de-aquisicao.test.ts`
Expected: PASS

- [ ] **Step 5: Verificação manual**

Logar como ADMIN e confirmar que cai em `/adm`. Logar como CUSTOMER (criar por "Cadastre-se grátis") e confirmar que cai em `/`.

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/LoginForm.tsx src/funil-de-aquisicao.test.ts
git commit -m "Login leva o dono ao painel, não à própria vitrine"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Suíte inteira**

Run: `npm test`
Expected: tudo verde, sem teste pulado.

- [ ] **Step 2: Tipos e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc sem saída; lint com 0 erros (os 2 warnings de `react-hooks/incompatible-library` são conhecidos e pré-existentes).

- [ ] **Step 3: Jornada completa num tenant de teste**

Provisionar, criar senha pelo link, logar, percorrer os dois passos, confirmar que a vitrine passa a mostrar o item e o endereço. Remover o tenant ao final.

- [ ] **Step 4: Commit final se algo mudou**
