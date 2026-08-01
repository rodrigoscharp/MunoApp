# Console da plataforma: layout e painéis — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar identidade visual ao console da plataforma — menu lateral, login redesenhado — e substituir a home por uma visão geral que abre com o que precisa de atenção.

**Architecture:** O console usa o verde da marca (`--color-forest`, já em `globals.css`) contra um neutro frio, com a terracota reservada para ação. Números em `Geist Mono` tabular. A lógica que decide a pauta e calcula o MRR sai em funções puras testáveis; as telas só as consomem.

**Tech Stack:** Next.js 16 (App Router), Tailwind v4, Prisma 6, NextAuth v5 beta, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-01-plataforma-layout-dashboards-design.md`

## Global Constraints

- Este projeto **não é o Next.js do seu treino**. Leia o guia relevante em `node_modules/next/dist/docs/` antes de escrever código de framework (`AGENTS.md`).
- **O banco é o de PRODUÇÃO.** Migration só com `--create-only`, revisão do SQL, e `migrate deploy`. Nunca `migrate dev` direto, `db push` ou `reset`.
- Código de plataforma usa **`prismaUnscoped` e `authPlatform`**, nunca `prisma` ou `auth`. 401 antes de ler dado em toda rota.
- Links dentro do console são relativos à raiz reescrita (`/leads`, `/clientes`), nunca `/platform/...`.
- **A terracota (`bg-brand`) é só para ação** — botão primário e item ativo do menu. Não usar como cor de texto decorativa ou fundo de card.
- Comentários e textos de interface em português.
- Não rodar `npm run build` nem `npm run dev`. Não rodar `npm run lint` (falha no repo inteiro por motivos pré-existentes); lintar caminhos específicos com `npx eslint`.
- Ao commitar, nunca `git add -A` ou `git add .`. Caminhos com `[id]` não casam em pathspec do git — adicione o diretório.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/app/globals.css` | Tokens do console. | 1 |
| `src/app/layout.tsx` | Carrega `Geist_Mono`. | 1 |
| `prisma/schema.prisma` | `valorMensal`, `diaVencimento` no `Tenant`. | 2 |
| `src/lib/platform-metrics.ts` | **Novo.** `montarPauta` e `calcularMrr`, puras. | 3 |
| `src/lib/platform-metrics.test.ts` | **Novo.** Testes das duas. | 3 |
| `src/app/platform/layout.tsx` | Shell com menu lateral, Sair, e barra inferior no mobile. | 4 |
| `src/app/platform/login/page.tsx` | Login na linguagem do console. | 5 |
| `src/app/platform/page.tsx` | Passa a ser a visão geral. | 6 |
| `src/app/platform/leads/page.tsx` | **Novo.** Recebe o funil. | 6 |
| `src/app/platform/leads/[id]/page.tsx` | Link de volta aponta para `/leads`. | 6 |
| `src/app/platform/clientes/page.tsx` | **Novo.** Lista de restaurantes. | 7 |
| `src/app/api/platform/clientes/[id]/route.ts` | **Novo.** `PATCH` de mensalidade. | 7 |
| `src/components/platform/MensalidadeInline.tsx` | **Novo.** Edição inline. | 7 |
| `src/components/platform/ConverterLead.tsx` | Campo de mensalidade. | 8 |
| `src/app/api/platform/leads/[id]/converter/route.ts` | Aceita e grava `valorMensal`. | 8 |

---

### Task 1: Tokens do console e a fonte mono

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: classes Tailwind `bg-console`, `bg-console-verde`, `text-console-tinta`, `border-console-linha`, e a variável `--font-geist-mono`. Consumidas pelas Tasks 4-7.

**Contexto:** o `globals.css` já define `--color-forest: #2B5240` e `--color-forest-dark`, hoje quase sem uso. Esta tarefa não inventa paleta: nomeia o uso dela no console e acrescenta os neutros frios. O fundo é frio de propósito — o creme `#F5F2EE` do app do cliente aqui apagaria a distinção que a cor existe para criar.

- [ ] **Step 1: Adicionar os tokens**

Em `src/app/globals.css`, dentro do bloco `@theme inline`, após a linha `--color-forest-light: #E8F0ED;`:

```css
  /* Console da plataforma: o salão veste terracota, a sala de máquinas veste
     verde. Os neutros são FRIOS de propósito — creme aqui puxaria o console
     para o mesmo lugar do app do cliente. */
  --color-console-verde: #2B5240;
  --color-console-verde-esc: #1E3D2F;
  --color-console-fundo: #F2F3F5;
  --color-console-cartao: #FFFFFF;
  --color-console-linha: #E3E5E9;
  --color-console-tinta: #17191C;
  --font-mono: var(--font-geist-mono);
```

- [ ] **Step 2: Carregar a Geist Mono**

Em `src/app/layout.tsx`, o import atual é `import { Geist } from "next/font/google";`. Troque por:

```ts
import { Geist, Geist_Mono } from "next/font/google";
```

E logo após a declaração `const geistSans = Geist({...})`, adicione:

```ts
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

Então adicione `geistMono.variable` à lista de classes do `<body>` (ou do `<html>`, onde `geistSans.variable` já estiver).

- [ ] **Step 3: Utilitário de numeral tabular**

Ainda em `globals.css`, fora do `@theme`, adicione:

```css
/* Números do console alinham em coluna — é o que faz a interface ler como
   painel de instrumento em vez de página de marketing. */
.tabular {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-geist-mono), ui-monospace, monospace;
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint src/app/layout.tsx`
Expected: sem erros; 144 testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "Adiciona tokens do console e a fonte monoespaçada"
```

---

### Task 2: Mensalidade no Tenant

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_mensalidade_tenant/migration.sql` (gerado)

**Interfaces:**
- Produces: `Tenant.valorMensal` e `Tenant.diaVencimento` no Prisma Client. Consumidos pelas Tasks 3, 6, 7 e 8.

**Contexto — leia antes de rodar qualquer coisa:** o projeto tem **um único banco, e é o de produção**. O fluxo abaixo gera o SQL sem aplicar, você confere que é aditivo, e só então aplica.

- [ ] **Step 1: Adicionar os campos**

Em `prisma/schema.prisma`, no model `Tenant`, após `status String @default("active")`:

```prisma
  valorMensal   Decimal? @db.Decimal(10, 2)
  diaVencimento Int?
```

Opcionais de propósito: o tenant `default` e qualquer cliente já existente continuam válidos sem eles, e isso mantém a migration puramente aditiva.

- [ ] **Step 2: Gerar a migration SEM aplicar**

Run: `npx prisma migrate dev --create-only --name mensalidade_tenant`
Expected: cria o diretório e imprime o caminho. Não toca no banco.

- [ ] **Step 3: Conferir que o SQL é aditivo**

Leia o `migration.sql`. Deve conter **apenas** `ALTER TABLE "Tenant" ADD COLUMN`. Se aparecer `DROP`, `ALTER COLUMN` sobre coluna existente ou `TRUNCATE`, **pare e reporte**.

- [ ] **Step 4: Aplicar e regenerar**

Run: `npx prisma migrate deploy && npx prisma generate`

- [ ] **Step 5: Verificar**

Run: `npx prisma migrate status && npx tsc --noEmit && npm test`
Expected: "Database schema is up to date!"; 144 testes.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Adiciona mensalidade e dia de vencimento ao Tenant"
```

---

### Task 3: A pauta e o MRR, com testes

**Files:**
- Create: `src/lib/platform-metrics.ts`
- Create: `src/lib/platform-metrics.test.ts`

**Interfaces:**
- Consumes: nada (funções puras).
- Produces: `montarPauta(leads, agora): ItemDaPauta[]` e `calcularMrr(tenants): number`. Consumidas pelas Tasks 6 e 7.

**Contexto:** esta é a lógica que dá sentido à tela, então é a única parte com testes — a convenção do projeto é testar só lógica pura. `montarPauta` recebe `agora` por parâmetro em vez de chamar `new Date()` internamente: sem isso, a regra dos 5 dias não é testável sem congelar o relógio.

A regra "fechado sem cliente" existe por causa de um invariante da spec anterior: `tenantId` só é preenchido pela rota de conversão, então `FECHADO` com `tenantId` nulo significa exatamente "fechei a venda e não criei o restaurante".

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/platform-metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularMrr, montarPauta } from "./platform-metrics";

const AGORA = new Date("2026-08-01T12:00:00Z");
const diasAtras = (d: number) =>
  new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000);

const lead = (over: Partial<Parameters<typeof montarPauta>[0][number]> = {}) => ({
  status: "NOVO",
  tenantId: null,
  updatedAt: AGORA,
  ...over,
});

describe("montarPauta", () => {
  it("convida a cadastrar quando não há lead nenhum", () => {
    const pauta = montarPauta([], AGORA);
    expect(pauta).toHaveLength(1);
    expect(pauta[0].chave).toBe("sem-leads");
  });

  it("diz que está tudo em dia quando nada precisa de atenção", () => {
    const pauta = montarPauta([lead({ status: "CONTATADO" })], AGORA);
    expect(pauta).toHaveLength(1);
    expect(pauta[0].chave).toBe("em-dia");
  });

  it("avisa sobre venda fechada que não virou cliente", () => {
    const pauta = montarPauta([lead({ status: "FECHADO", tenantId: null })], AGORA);
    expect(pauta.map((i) => i.chave)).toContain("fechado-sem-cliente");
  });

  it("não avisa quando o lead fechado já tem cliente criado", () => {
    const pauta = montarPauta([lead({ status: "FECHADO", tenantId: "t1" })], AGORA);
    expect(pauta.map((i) => i.chave)).not.toContain("fechado-sem-cliente");
  });

  it("aponta leads abertos sem contato há mais de 5 dias", () => {
    const pauta = montarPauta([lead({ updatedAt: diasAtras(6) })], AGORA);
    expect(pauta.map((i) => i.chave)).toContain("parados");
  });

  it("não considera parado um lead tocado há 4 dias", () => {
    const pauta = montarPauta([lead({ updatedAt: diasAtras(4) })], AGORA);
    expect(pauta.map((i) => i.chave)).not.toContain("parados");
  });

  it("ignora fechados e perdidos na contagem de parados", () => {
    const pauta = montarPauta(
      [
        lead({ status: "PERDIDO", updatedAt: diasAtras(30) }),
        lead({ status: "FECHADO", tenantId: "t1", updatedAt: diasAtras(30) }),
      ],
      AGORA
    );
    expect(pauta.map((i) => i.chave)).not.toContain("parados");
  });

  it("conta quem está em negociação", () => {
    const pauta = montarPauta([lead({ status: "NEGOCIACAO" })], AGORA);
    expect(pauta.map((i) => i.chave)).toContain("negociando");
  });

  it("acumula as regras do meio quando mais de uma bate", () => {
    const pauta = montarPauta(
      [
        lead({ status: "FECHADO", tenantId: null }),
        lead({ status: "NEGOCIACAO", updatedAt: diasAtras(9) }),
      ],
      AGORA
    );
    expect(pauta.map((i) => i.chave)).toEqual([
      "fechado-sem-cliente",
      "parados",
      "negociando",
    ]);
  });

  it("usa singular e plural corretamente", () => {
    const um = montarPauta([lead({ updatedAt: diasAtras(6) })], AGORA);
    expect(um[0].texto).toContain("1 lead sem contato");

    const dois = montarPauta(
      [lead({ updatedAt: diasAtras(6) }), lead({ updatedAt: diasAtras(7) })],
      AGORA
    );
    expect(dois[0].texto).toContain("2 leads sem contato");
  });
});

describe("calcularMrr", () => {
  it("soma a mensalidade dos clientes ativos", () => {
    expect(
      calcularMrr([
        { status: "active", valorMensal: 199.9 },
        { status: "active", valorMensal: 100.1 },
      ])
    ).toBe(300);
  });

  it("aceita Decimal do Prisma", () => {
    expect(
      calcularMrr([{ status: "active", valorMensal: { toString: () => "149.90" } }])
    ).toBe(149.9);
  });

  it("ignora cliente inativo", () => {
    expect(
      calcularMrr([
        { status: "active", valorMensal: 100 },
        { status: "suspended", valorMensal: 999 },
      ])
    ).toBe(100);
  });

  it("ignora cliente sem mensalidade definida", () => {
    expect(
      calcularMrr([
        { status: "active", valorMensal: null },
        { status: "active", valorMensal: 50 },
      ])
    ).toBe(50);
  });

  it("devolve zero sem clientes", () => {
    expect(calcularMrr([])).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — módulo `./platform-metrics` não existe.

- [ ] **Step 3: Implementar**

Crie `src/lib/platform-metrics.ts`:

```ts
/**
 * Lógica da visão geral do console. Fica aqui, pura, porque é o que dá sentido
 * à tela — e porque a regra dos 5 dias não é testável se a função olhar o
 * relógio por conta própria.
 */

export type LeadDaPauta = {
  status: string;
  tenantId: string | null;
  updatedAt: Date;
};

export type ChaveDaPauta =
  | "sem-leads"
  | "fechado-sem-cliente"
  | "parados"
  | "negociando"
  | "em-dia";

export type ItemDaPauta = { chave: ChaveDaPauta; texto: string };

const ABERTOS = new Set(["NOVO", "CONTATADO", "NEGOCIACAO"]);
const DIAS_SEM_CONTATO = 5;

export function montarPauta(
  leads: LeadDaPauta[],
  agora: Date
): ItemDaPauta[] {
  if (leads.length === 0) {
    return [{ chave: "sem-leads", texto: "Nenhum lead cadastrado ainda." }];
  }

  const itens: ItemDaPauta[] = [];

  // tenantId só é preenchido pela rota de conversão, então FECHADO sem tenant
  // é literalmente "fechei a venda e não criei o restaurante".
  const semCliente = leads.filter(
    (l) => l.status === "FECHADO" && l.tenantId === null
  ).length;
  if (semCliente > 0) {
    itens.push({
      chave: "fechado-sem-cliente",
      texto: `${semCliente} ${semCliente === 1 ? "fechado" : "fechados"} sem cliente criado`,
    });
  }

  const limite = agora.getTime() - DIAS_SEM_CONTATO * 24 * 60 * 60 * 1000;
  const parados = leads.filter(
    (l) => ABERTOS.has(l.status) && l.updatedAt.getTime() < limite
  ).length;
  if (parados > 0) {
    itens.push({
      chave: "parados",
      texto: `${parados} ${parados === 1 ? "lead" : "leads"} sem contato há mais de ${DIAS_SEM_CONTATO} dias`,
    });
  }

  const negociando = leads.filter((l) => l.status === "NEGOCIACAO").length;
  if (negociando > 0) {
    itens.push({ chave: "negociando", texto: `${negociando} em negociação` });
  }

  if (itens.length === 0) {
    return [{ chave: "em-dia", texto: "Tudo em dia." }];
  }
  return itens;
}

export type TenantDoMrr = {
  status: string;
  valorMensal: number | { toString(): string } | null;
};

/** Receita contratada: o que os clientes ativos somam por mês. Não é o que foi recebido. */
export function calcularMrr(tenants: TenantDoMrr[]): number {
  const total = tenants
    .filter((t) => t.status === "active" && t.valorMensal != null)
    .reduce((soma, t) => soma + Number(t.valorMensal!.toString()), 0);

  // Soma de decimais em ponto flutuante: 199.9 + 100.1 dá 300.00000000000006.
  return Math.round(total * 100) / 100;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS. Os 144 anteriores continuam passando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform-metrics.ts src/lib/platform-metrics.test.ts
git commit -m "Adiciona a lógica da pauta e do MRR com testes"
```

---

### Task 4: Shell com menu lateral

**Files:**
- Modify: `src/app/platform/layout.tsx`
- Create: `src/components/platform/MenuLateral.tsx`
- Create: `src/components/platform/BotaoSair.tsx`

**Interfaces:**
- Consumes: tokens da Task 1, `authPlatform` e `signOutPlatform` de `@/lib/auth-platform`.
- Produces: o shell onde as Tasks 6 e 7 penduram as telas.

**Contexto:** o layout atual tem 28 linhas e nenhuma navegação. `signOutPlatform` está exportado desde a construção da autenticação e **nunca foi usado** — não existe forma de deslogar hoje.

No mobile o menu **não** é lateral: vira barra fixa no rodapé. Um menu lateral fixo come metade da largura útil de um telefone, e o celular é onde o lead é atualizado logo depois de uma ligação.

- [ ] **Step 1: Botão de sair**

Crie `src/components/platform/BotaoSair.tsx`:

```tsx
import { signOutPlatform } from "@/lib/auth-platform";
import { LogOut } from "lucide-react";

export function BotaoSair() {
  return (
    <form
      action={async () => {
        "use server";
        await signOutPlatform({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition"
      >
        <LogOut size={15} />
        Sair
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Menu**

Crie `src/components/platform/MenuLateral.tsx` como client component (precisa de `usePathname` para marcar o item ativo):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Store } from "lucide-react";

const DESTINOS = [
  { href: "/", rotulo: "Visão geral", Icone: LayoutGrid },
  { href: "/leads", rotulo: "Leads", Icone: Users },
  { href: "/clientes", rotulo: "Clientes", Icone: Store },
] as const;

export function MenuLateral() {
  const pathname = usePathname();

  // O proxy reescreve admin.<root>/x para /platform/x, então o pathname que
  // chega aqui já vem prefixado.
  const atual = pathname.replace(/^\/platform/, "") || "/";

  return (
    <nav className="flex md:flex-col gap-1">
      {DESTINOS.map(({ href, rotulo, Icone }) => {
        const ativo = href === "/" ? atual === "/" : atual.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 md:flex-none flex flex-col md:flex-row items-center md:gap-3 gap-1 px-3 py-2.5 rounded-lg text-sm transition ${
              ativo
                ? "bg-brand text-white font-semibold"
                : "text-white/60 hover:text-white hover:bg-console-verde-esc"
            }`}
          >
            <Icone size={17} />
            <span className="text-[11px] md:text-sm">{rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Shell**

Substitua o conteúdo de `src/app/platform/layout.tsx`:

```tsx
import { authPlatform } from "@/lib/auth-platform";
import { MenuLateral } from "@/components/platform/MenuLateral";
import { BotaoSair } from "@/components/platform/BotaoSair";

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
    <div className="min-h-screen bg-console-fundo text-console-tinta">
      {/* Coluna no desktop, barra no rodapé no celular. */}
      <aside className="bg-console-verde md:fixed md:inset-y-0 md:left-0 md:w-60 md:flex md:flex-col md:p-5 fixed bottom-0 inset-x-0 z-20 px-3 py-2 md:py-5">
        <div className="hidden md:block mb-8">
          <p className="text-white font-bold tracking-tight">MUNO</p>
          <p className="tabular text-[11px] uppercase tracking-[0.18em] text-white/40">
            plataforma
          </p>
        </div>

        <MenuLateral />

        <div className="hidden md:block mt-auto pt-5 border-t border-white/10 space-y-1.5">
          <p className="text-xs text-white/40 truncate">{session.user.email}</p>
          <BotaoSair />
        </div>
      </aside>

      {/* Sair sobe para o topo no celular, onde o rodapé é o menu. */}
      <div className="md:hidden flex items-center justify-between bg-console-verde px-4 py-3">
        <p className="text-white font-bold tracking-tight text-sm">MUNO</p>
        <BotaoSair />
      </div>

      <main className="md:ml-60 px-4 md:px-8 py-6 md:py-10 pb-24 md:pb-10 max-w-5xl">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform" src/components/platform`
Expected: sem erros.

Se o server action dentro de `BotaoSair` não type-checar por estar num componente sem `"use server"` no topo do arquivo, **pare e reporte** — a alternativa é um arquivo de actions separado, e vale revisão em vez de tentativa.

- [ ] **Step 5: Commit**

```bash
git add "src/app/platform" src/components/platform
git commit -m "Adiciona menu lateral e sair ao console da plataforma"
```

---

### Task 5: Login na linguagem do console

**Files:**
- Modify: `src/app/platform/login/page.tsx`

**Interfaces:**
- Consumes: tokens da Task 1, `loginPlataforma` de `./actions` (não muda).

**Contexto:** só o visual muda. A server action, os `name` dos inputs e o `useActionState` continuam exatamente como estão — foi o caminho que substituiu um POST direto que falhava em silêncio, e não há motivo para reabri-lo.

- [ ] **Step 1: Redesenhar**

Em `src/app/platform/login/page.tsx`, mantenha os imports, a chamada do `useActionState` e os `name="email"` / `name="password"`. Troque o JSX retornado por:

```tsx
  return (
    <div className="min-h-screen bg-console-verde flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-white font-bold text-lg tracking-tight">MUNO</p>
          <p className="tabular text-[11px] uppercase tracking-[0.18em] text-white/40">
            plataforma
          </p>
        </div>

        <form
          action={formAction}
          className="bg-console-cartao rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="tabular block text-[11px] uppercase tracking-[0.14em] text-neutral-500 mb-1.5">
              E-mail
            </label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg border border-console-linha bg-console-fundo text-sm focus:outline-none focus:ring-2 focus:ring-console-verde"
            />
          </div>

          <div>
            <label className="tabular block text-[11px] uppercase tracking-[0.14em] text-neutral-500 mb-1.5">
              Senha
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-console-linha bg-console-fundo text-sm focus:outline-none focus:ring-2 focus:ring-console-verde"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform/login"`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/platform/login"
git commit -m "Redesenha o login da plataforma"
```

---

### Task 6: Visão geral e mudança do funil para /leads

**Files:**
- Create: `src/app/platform/leads/page.tsx`
- Modify: `src/app/platform/page.tsx`
- Modify: `src/app/platform/leads/[id]/page.tsx`

**Interfaces:**
- Consumes: `montarPauta` e `calcularMrr` da Task 3, tokens da Task 1.

**Contexto:** a home deixa de ser o funil e passa a ser a visão geral. **O funil não muda de comportamento** — é o mesmo componente, em outra rota.

A pauta vem **antes** dos números de propósito: com 0 leads e 1 cliente, uma grade de estatísticas é decoração; uma pauta é útil no banco vazio e continua útil com 40 leads.

- [ ] **Step 1: Mover o funil**

Crie `src/app/platform/leads/page.tsx` com **exatamente** o conteúdo atual de `src/app/platform/page.tsx`, mudando apenas o nome da função de `FunilPage` para `LeadsPage`.

- [ ] **Step 2: Corrigir o link de volta**

Em `src/app/platform/leads/[id]/page.tsx`, o link "Voltar ao funil" aponta para `/`. Troque para `/leads`.

- [ ] **Step 3: Escrever a visão geral**

Substitua o conteúdo de `src/app/platform/page.tsx`:

```tsx
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { calcularMrr, montarPauta } from "@/lib/platform-metrics";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ABERTOS = new Set(["NOVO", "CONTATADO", "NEGOCIACAO"]);

export default async function VisaoGeralPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const [leads, tenants, pedidos, novosNoMes] = await Promise.all([
    prismaUnscoped.lead.findMany({
      select: { status: true, tenantId: true, updatedAt: true },
    }),
    prismaUnscoped.tenant.findMany({
      select: { status: true, valorMensal: true },
    }),
    prismaUnscoped.order.count(),
    prismaUnscoped.lead.count({ where: { createdAt: { gte: inicioDoMes } } }),
  ]);

  const pauta = montarPauta(leads, new Date());
  const mrr = calcularMrr(tenants);
  const abertos = leads.filter((l) => ABERTOS.has(l.status)).length;
  const ativos = tenants.filter((t) => t.status === "active").length;
  const comPlano = tenants.filter(
    (t) => t.status === "active" && t.valorMensal != null
  ).length;

  const semLeads = pauta[0].chave === "sem-leads";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Visão geral</h1>

      {/* A pauta abre a tela: o que precisa de atenção vem antes do que é só
          referência. */}
      <section className="bg-console-cartao rounded-2xl border border-console-linha p-5">
        <p className="tabular text-[11px] uppercase tracking-[0.16em] text-neutral-400 mb-3">
          Pauta
        </p>
        <ul className="space-y-2">
          {pauta.map((item) => (
            <li key={item.chave} className="text-[15px]">
              {item.texto}
            </li>
          ))}
        </ul>
        {semLeads && (
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-brand hover:text-brand-dark transition"
          >
            Cadastrar o primeiro
            <ArrowRight size={15} />
          </Link>
        )}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Bloco
          rotulo="Vendas"
          valor={String(abertos)}
          unidade="leads abertos"
          apoio={`${novosNoMes} este mês`}
        />
        <Bloco
          rotulo="Clientes"
          valor={String(ativos)}
          unidade="ativos"
          apoio={`${pedidos} pedidos`}
        />
        <Bloco
          rotulo="Receita"
          valor={formatCurrency(mrr)}
          unidade="por mês"
          apoio={`${comPlano} com plano`}
        />
      </section>
    </div>
  );
}

function Bloco({
  rotulo,
  valor,
  unidade,
  apoio,
}: {
  rotulo: string;
  valor: string;
  unidade: string;
  apoio: string;
}) {
  return (
    <div className="bg-console-cartao rounded-2xl border border-console-linha p-5">
      <p className="tabular text-[11px] uppercase tracking-[0.16em] text-neutral-400">
        {rotulo}
      </p>
      <p className="tabular text-3xl font-semibold mt-2 leading-none">{valor}</p>
      <p className="text-xs text-neutral-500 mt-1.5">{unidade}</p>
      <p className="tabular text-xs text-neutral-400 mt-3 pt-3 border-t border-console-linha">
        {apoio}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform"`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/platform"
git commit -m "Substitui a home pela visão geral e move o funil para /leads"
```

---

### Task 7: Clientes

**Files:**
- Create: `src/app/platform/clientes/page.tsx`
- Create: `src/app/api/platform/clientes/[id]/route.ts`
- Create: `src/components/platform/MensalidadeInline.tsx`

**Interfaces:**
- Consumes: `calcularMrr` da Task 3, campos da Task 2.

**Contexto:** lista os restaurantes com quando entraram, quantos pedidos fizeram e quanto pagam. A mensalidade é editável inline porque preço de cliente muda.

**O `PATCH` aceita apenas `valorMensal` e `diaVencimento`.** Nunca `slug`, `status` ou `nome` — mudar a identidade de um cliente por essa rota seria uma porta lateral perigosa.

- [ ] **Step 1: API**

Crie `src/app/api/platform/clientes/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";

// Só dinheiro. slug, status e nome ficam de fora de propósito: esta rota não
// pode virar uma porta lateral para mudar a identidade de um cliente.
const schema = z.object({
  valorMensal: z.number().min(0).nullable().optional(),
  diaVencimento: z.number().int().min(1).max(28).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authPlatform();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const existe = await prismaUnscoped.tenant.findUnique({ where: { id } });
  if (!existe) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const tenant = await prismaUnscoped.tenant.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(tenant);
}
```

O limite de 28 no dia de vencimento é deliberado: 29, 30 e 31 não existem em todo mês.

- [ ] **Step 2: Edição inline**

Crie `src/components/platform/MensalidadeInline.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export function MensalidadeInline({
  tenantId,
  valorAtual,
}: {
  tenantId: string;
  valorAtual: number | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorAtual != null ? String(valorAtual) : "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");

    try {
      const res = await fetch(`/api/platform/clientes/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Campo apagado volta a "sem plano", não a zero.
        body: JSON.stringify({
          valorMensal: valor.trim() ? Number(valor) : null,
        }),
      });

      if (!res.ok) {
        setErro("Não salvou.");
        return;
      }

      setEditando(false);
      router.refresh();
    } catch {
      setErro("Sem conexão.");
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="tabular text-sm text-console-tinta hover:text-brand transition text-right"
      >
        {valorAtual != null ? formatCurrency(valorAtual) : "definir"}
      </button>
    );
  }

  return (
    <form onSubmit={salvar} className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.01"
        min="0"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        className="tabular w-24 px-2 py-1 rounded border border-console-linha bg-console-fundo text-sm text-right"
      />
      <button
        type="submit"
        disabled={salvando}
        className="text-xs font-semibold text-brand disabled:opacity-50"
      >
        ok
      </button>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="text-xs text-neutral-400"
      >
        x
      </button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </form>
  );
}
```

- [ ] **Step 3: Tela**

Crie `src/app/platform/clientes/page.tsx`:

```tsx
import { prismaUnscoped } from "@/lib/prisma";
import { authPlatform } from "@/lib/auth-platform";
import { calcularMrr } from "@/lib/platform-metrics";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";
import { formatCurrency } from "@/lib/utils";
import { MensalidadeInline } from "@/components/platform/MensalidadeInline";

export default async function ClientesPage() {
  const session = await authPlatform();
  if (!session?.user) return null;

  const tenants = await prismaUnscoped.tenant.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  const mrr = calcularMrr(tenants);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="text-right">
          <p className="tabular text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Receita mensal
          </p>
          <p className="tabular text-xl font-semibold">{formatCurrency(mrr)}</p>
        </div>
      </div>

      {tenants.length === 0 ? (
        <p className="text-neutral-500 py-16 text-center">
          Nenhum cliente ainda. Eles aparecem aqui quando você converte um lead.
        </p>
      ) : (
        <ul className="space-y-2">
          {tenants.map((t) => (
            <li
              key={t.id}
              className="bg-console-cartao rounded-xl border border-console-linha px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold truncate">{t.nome}</p>
                <a
                  href={buildTenantBaseUrl(t.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular text-xs text-neutral-400 hover:text-brand transition"
                >
                  {t.slug}
                </a>
              </div>

              <div className="flex items-center gap-6 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="tabular text-sm">{t._count.orders}</p>
                  <p className="text-[11px] text-neutral-400">pedidos</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="tabular text-sm">
                    {t.createdAt.toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-[11px] text-neutral-400">desde</p>
                </div>
                <MensalidadeInline
                  tenantId={t.id}
                  valorAtual={t.valorMensal != null ? Number(t.valorMensal) : null}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`buildTenantBaseUrl` vem de `@/lib/tenant-provisioning` de propósito — ele já resolve o domínio correto (usando a **última** entrada de `ROOT_DOMAIN`, não a primeira) e não deve ser reimplementado aqui.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/platform" "src/app/api/platform" src/components/platform`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/platform" "src/app/api/platform" src/components/platform
git commit -m "Adiciona a tela de clientes com mensalidade editável"
```

---

### Task 8: Mensalidade na conversão do lead

**Files:**
- Modify: `src/app/api/platform/leads/[id]/converter/route.ts`
- Modify: `src/components/platform/ConverterLead.tsx`

**Interfaces:**
- Consumes: campos da Task 2.

**Contexto:** o momento natural de definir quanto o cliente paga é quando ele vira cliente. O campo é **opcional** — não travar a conversão por causa dele.

- [ ] **Step 1: Aceitar no schema**

Em `src/app/api/platform/leads/[id]/converter/route.ts`, o schema atual é:

```ts
const schema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  nome: z.string().min(2).optional(),
});
```

Adicione `valorMensal: z.number().min(0).optional(),`.

- [ ] **Step 2: Gravar depois de provisionar**

O `provisionTenant` não conhece mensalidade e **não deve conhecer** — ele é compartilhado com o script de CLI. Grave logo depois dele, antes do vínculo do lead:

```ts
    if (parsed.data.valorMensal !== undefined) {
      await prismaUnscoped.tenant.update({
        where: { id: tenant.id },
        data: { valorMensal: parsed.data.valorMensal },
      });
    }
```

- [ ] **Step 3: Campo no formulário**

Em `src/components/platform/ConverterLead.tsx`, adicione um estado `mensalidade` (string, vazio por padrão) e um terceiro campo no formulário, rotulado "Mensalidade (opcional)", tipo numérico com `step="0.01"`. No `body` do `fetch`, inclua `valorMensal` **apenas quando preenchido**:

```tsx
        body: JSON.stringify({
          slug,
          email,
          ...(mensalidade.trim() ? { valorMensal: Number(mensalidade) } : {}),
        }),
```

Enviar `valorMensal: NaN` quando o campo está vazio quebraria a validação do Zod — daí a inclusão condicional.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test && npx eslint "src/app/api/platform" src/components/platform`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/platform" src/components/platform
git commit -m "Permite definir a mensalidade ao converter o lead"
```

---

## Verificação final

```bash
npm test && npx tsc --noEmit
```

Expected: todos os testes passando (144 anteriores + os novos da Task 3), sem erros de tipo.

Depois, no navegador em `admin.munoapp.com.br`:

1. O login aparece em verde, com o cartão claro e o botão terracota
2. Depois de entrar, o menu lateral está lá e o item ativo é terracota
3. **Sair funciona** e devolve ao login
4. A visão geral abre com a pauta dizendo "Nenhum lead cadastrado ainda."
5. Cadastrar um lead → a pauta muda e o bloco Vendas conta 1
6. Marcar o lead como `FECHADO` sem converter → a pauta avisa "1 fechado sem cliente criado"
7. `/clientes` lista o tenant `default`; editar a mensalidade dele muda o MRR na visão geral
8. No celular, o menu está no rodapé e o Sair no topo
