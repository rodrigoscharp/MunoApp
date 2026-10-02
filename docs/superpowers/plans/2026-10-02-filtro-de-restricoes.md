# Filtro de restrições alimentares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o assistente de IA do cardápio por três botões (Vegano, Sem glúten, Sem lactose) que filtram pelo que o dono declarou ao cadastrar o item.

**Architecture:** `MenuItem` ganha três colunas booleanas anuláveis, onde `null` significa "não informado". Uma lib pura (`src/lib/restricoes.ts`) define o que passa em cada filtro e converte o tri-estado do formulário. O admin declara no `MenuItemModal`, o cardápio filtra em `FiltroDeRestricoes`, e a rota da Groq some.

**Tech Stack:** Next.js (App Router, webpack), Prisma + Postgres local, zod, react-hook-form, Vitest + Testing Library (jsdom), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-02-filtro-de-restricoes-no-lugar-da-ia-design.md`

## Global Constraints

* `null` significa "o restaurante não informou". As colunas **não têm `@default`**, e nenhum código converte `null`, `undefined` ou valor estranho em `false`.
* Quem passa em cada filtro: Vegano `isVegan === true`; Sem glúten `containsGluten === false`; Sem lactose `containsLactose === false`. Filtros ativos se combinam por E. Vegano **não** implica sem lactose.
* A migração só adiciona três colunas anuláveis a `MenuItem`. Não cria tabela, então não há RLS novo e `src/lib/tenant-scoped-models.ts` não muda.
* Aviso fixo com filtro ativo, literal: `Informado pelo restaurante. Em caso de alergia, confirme com a equipe antes de pedir.`
* Chave do `localStorage`: `muno-filtro-dispensado`. Toda leitura e escrita em `try/catch`.
* Texto novo ao cliente e na landing: **sem travessão e sem a palavra "IA"**.
* O banco de dev é local (`docker compose up -d`). Nunca rode migração contra produção. `npm run db:migrate` passa por `scripts/guard-local-db.js`; se ele abortar, o alvo está errado, não contorne.
* Não rode `npm run build`: ele executa `migrate-on-deploy.js`. Para tipos use `npx tsc --noEmit`.
* Teste de componente começa com `// @vitest-environment jsdom`. Comentários e mensagens de commit em português, como no resto do repositório.
* Todo commit termina com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
* Branch de trabalho: `filtro-de-restricoes` (já criada, com a spec commitada).

## Review Focus

* **Dado antigo ou ausente.** Item cadastrado antes da migração chega com os campos `undefined` ou `null` (inclusive pelo cache de 60s do cardápio). Nunca pode virar "sem lactose", nem no filtro, nem no modal, nem no que o modal envia. Testes: Task 1 (`{}` não passa), Task 3 (item antigo abre em "Não informado" e salva `null`), Task 4 (`SEM_INFO` nunca aparece).
* **Valor estranho vindo de fora.** String no lugar de boolean na API, ou valor desconhecido no radio. Esperado: 400 na API e `null` no cliente, nunca `false`. Testes: Task 1 (`triParaBoolean`), Task 2 (`"false"`, `"sim"`, `0` recusados).
* **O cardápio muda por baixo.** Com o cache de 60s, um item pode perder a declaração enquanto o cliente está com um filtro ligado. O filtro cujo botão sumiu não pode continuar filtrando em silêncio. Teste: Task 4 (`rerender`).
* **Restaurante sem nenhuma declaração.** O componente não renderiza nada, nem o wrapper com margem, e o cardápio fica como estava. Teste: Task 4.
* **`localStorage` bloqueado** (janela privada, política do navegador). O card continua funcionando. Teste: Task 4.

---

### Task 1: Lógica pura do filtro

**Files:**
- Create: `src/lib/restricoes.ts`
- Test: `src/lib/restricoes.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usado nas Tasks 3 e 4):
  - `type RestricaoDeCardapio = "vegano" | "sem-gluten" | "sem-lactose"`
  - `interface DeclaracaoAlimentar { containsGluten?: boolean | null; containsLactose?: boolean | null; isVegan?: boolean | null }`
  - `const RESTRICOES: readonly { id: RestricaoDeCardapio; label: string; emoji: string }[]`
  - `atende(item: DeclaracaoAlimentar, restricao: RestricaoDeCardapio): boolean`
  - `filtrarPorRestricoes<T extends DeclaracaoAlimentar>(itens: readonly T[], ativas: readonly RestricaoDeCardapio[]): T[]` (sem filtro ativo devolve todos)
  - `restricoesDisponiveis<T extends DeclaracaoAlimentar>(itens: readonly T[]): RestricaoDeCardapio[]`
  - `type TriEstado = "sim" | "nao" | "nd"`
  - `triParaBoolean(valor: TriEstado): boolean | null`
  - `booleanParaTri(valor: boolean | null | undefined): TriEstado`

- [ ] **Step 1: Write the failing test**

Crie `src/lib/restricoes.test.ts`:

```ts
/**
 * O que passa em cada filtro, e a conversão do tri-estado do formulário.
 *
 * A regra que segura tudo é uma só: só passa quem tem declaração EXPLÍCITA.
 * `null` e `undefined` são "o restaurante não informou", e confundi-los com
 * `false` faz o cardápio afirmar "sem lactose" sobre um prato que ninguém
 * verificou. Quase todos os testes abaixo são variações dessa linha.
 */

import { describe, expect, it } from "vitest";
import {
  RESTRICOES,
  atende,
  booleanParaTri,
  filtrarPorRestricoes,
  restricoesDisponiveis,
  triParaBoolean,
} from "./restricoes";

const prato = (id: string, declaracao: Record<string, boolean | null> = {}) => ({
  id,
  ...declaracao,
});

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

describe("atende: só declaração explícita passa", () => {
  it.each([
    ["vegano", { isVegan: true }, true],
    ["vegano", { isVegan: false }, false],
    ["vegano", { isVegan: null }, false],
    ["vegano", {}, false],
    ["sem-gluten", { containsGluten: false }, true],
    ["sem-gluten", { containsGluten: true }, false],
    ["sem-gluten", { containsGluten: null }, false],
    ["sem-gluten", {}, false],
    ["sem-lactose", { containsLactose: false }, true],
    ["sem-lactose", { containsLactose: true }, false],
    ["sem-lactose", { containsLactose: null }, false],
    ["sem-lactose", {}, false],
  ] as const)("%s com %j: %s", (restricao, item, esperado) => {
    expect(atende(item, restricao)).toBe(esperado);
  });

  it("vegano não implica sem lactose: o dono precisa declarar", () => {
    expect(atende({ isVegan: true, containsLactose: null }, "sem-lactose")).toBe(false);
  });
});

describe("filtrarPorRestricoes", () => {
  const itens = [
    prato("a", { containsGluten: false, containsLactose: false, isVegan: true }),
    prato("b", { containsGluten: false, containsLactose: true, isVegan: false }),
    prato("c", { containsGluten: null, containsLactose: false }),
    prato("d"),
  ];

  it("sem filtro ativo devolve tudo, na mesma ordem", () => {
    expect(ids(filtrarPorRestricoes(itens, []))).toEqual(["a", "b", "c", "d"]);
  });

  it("um filtro devolve só quem declarou", () => {
    expect(ids(filtrarPorRestricoes(itens, ["sem-lactose"]))).toEqual(["a", "c"]);
    expect(ids(filtrarPorRestricoes(itens, ["sem-gluten"]))).toEqual(["a", "b"]);
  });

  it("filtros se combinam por E", () => {
    expect(ids(filtrarPorRestricoes(itens, ["sem-gluten", "sem-lactose"]))).toEqual(["a"]);
  });

  it("item sem nenhuma declaração nunca passa", () => {
    const soSemInfo = [prato("d")];
    for (const { id } of RESTRICOES) {
      expect(filtrarPorRestricoes(soSemInfo, [id])).toEqual([]);
    }
  });

  it("não altera a lista de entrada", () => {
    const copia = [...itens];
    filtrarPorRestricoes(itens, ["vegano"]);
    expect(itens).toEqual(copia);
  });
});

describe("restricoesDisponiveis: o botão só existe se há o que mostrar", () => {
  it("cardápio sem nenhuma declaração não habilita botão nenhum", () => {
    expect(restricoesDisponiveis([prato("a"), prato("b")])).toEqual([]);
  });

  it("declarar que CONTÉM não habilita o botão 'sem'", () => {
    expect(
      restricoesDisponiveis([prato("a", { containsGluten: true, containsLactose: true, isVegan: false })])
    ).toEqual([]);
  });

  it("habilita só o que algum item declara", () => {
    expect(restricoesDisponiveis([prato("a", { containsLactose: false })])).toEqual(["sem-lactose"]);
  });

  it("segue a ordem de RESTRICOES, não a dos itens", () => {
    const itens = [
      prato("a", { containsLactose: false }),
      prato("b", { isVegan: true }),
      prato("c", { containsGluten: false }),
    ];
    expect(restricoesDisponiveis(itens)).toEqual(["vegano", "sem-gluten", "sem-lactose"]);
  });
});

describe("tri-estado do formulário", () => {
  it.each([
    ["sim", true],
    ["nao", false],
    ["nd", null],
  ] as const)("%s vira %s", (tri, esperado) => {
    expect(triParaBoolean(tri)).toBe(esperado);
  });

  it("valor desconhecido vira null, e nunca false", () => {
    expect(triParaBoolean("" as never)).toBeNull();
    expect(triParaBoolean("false" as never)).toBeNull();
    expect(triParaBoolean(undefined as never)).toBeNull();
  });

  it.each([
    [true, "sim"],
    [false, "nao"],
    [null, "nd"],
    [undefined, "nd"],
  ] as const)("%s volta como %s", (valor, esperado) => {
    expect(booleanParaTri(valor)).toBe(esperado);
  });

  it("ida e volta preserva os três estados", () => {
    for (const tri of ["sim", "nao", "nd"] as const) {
      expect(booleanParaTri(triParaBoolean(tri))).toBe(tri);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/restricoes.test.ts`
Expected: FAIL, "Failed to resolve import ./restricoes" (o módulo não existe).

- [ ] **Step 3: Write minimal implementation**

Crie `src/lib/restricoes.ts`:

```ts
/**
 * O que o restaurante declarou sobre um prato, e o filtro que o cliente usa.
 *
 * Os três campos são booleanos ANULÁVEIS, e `null` (ou ausente) quer dizer "o
 * restaurante não informou". Isso não é detalhe de modelagem: um `false` por
 * padrão faria todo item cadastrado antes deste filtro aparecer como "sem
 * lactose" e "sem glúten" sem que ninguém tivesse verificado nada, e para quem
 * tem intolerância esse é o pior erro possível. Por isso a regra de cada
 * filtro olha a declaração EXPLÍCITA, e nenhuma função aqui transforma
 * ausência em `false`.
 */

export type RestricaoDeCardapio = "vegano" | "sem-gluten" | "sem-lactose";

export interface DeclaracaoAlimentar {
  containsGluten?: boolean | null;
  containsLactose?: boolean | null;
  isVegan?: boolean | null;
}

/** A ordem daqui é a ordem dos botões no cardápio. */
export const RESTRICOES: readonly { id: RestricaoDeCardapio; label: string; emoji: string }[] = [
  { id: "vegano", label: "Vegano", emoji: "🌱" },
  { id: "sem-gluten", label: "Sem glúten", emoji: "🌾" },
  { id: "sem-lactose", label: "Sem lactose", emoji: "🥛" },
];

/**
 * O item atende à restrição? Só com declaração explícita.
 *
 * Vegano não implica "sem lactose": derivar seria adivinhar, que é justamente o
 * que este filtro existe para não fazer. Se o dono quer o item no filtro de
 * lactose, ele marca.
 */
export function atende(item: DeclaracaoAlimentar, restricao: RestricaoDeCardapio): boolean {
  switch (restricao) {
    case "vegano":
      return item.isVegan === true;
    case "sem-gluten":
      return item.containsGluten === false;
    case "sem-lactose":
      return item.containsLactose === false;
  }
}

/**
 * Os itens que atendem a TODAS as restrições ativas (E, não OU). Sem restrição
 * ativa devolve a lista inteira: quem decide não mostrar nada nesse caso é a
 * tela, e não esta função.
 */
export function filtrarPorRestricoes<T extends DeclaracaoAlimentar>(
  itens: readonly T[],
  ativas: readonly RestricaoDeCardapio[]
): T[] {
  return itens.filter((item) => ativas.every((restricao) => atende(item, restricao)));
}

/**
 * Quais botões fazem sentido neste cardápio: os que pelo menos um item atende
 * sozinho. Um botão que sempre devolve zero itens é pior do que botão nenhum.
 */
export function restricoesDisponiveis<T extends DeclaracaoAlimentar>(
  itens: readonly T[]
): RestricaoDeCardapio[] {
  return RESTRICOES.map((r) => r.id).filter((id) => itens.some((item) => atende(item, id)));
}

/** Como o formulário do admin guarda uma resposta: Sim, Não, ou Não informado. */
export type TriEstado = "sim" | "nao" | "nd";

/**
 * Do formulário para o servidor. Tudo que não for exatamente "sim" ou "nao"
 * vira `null`: o ponto onde "não informado" viraria `false` sem ninguém notar é
 * este, então o caso de dúvida cai para o lado seguro.
 */
export function triParaBoolean(valor: TriEstado): boolean | null {
  if (valor === "sim") return true;
  if (valor === "nao") return false;
  return null;
}

/** Do servidor para o formulário. Item antigo (campo ausente) abre em "nd". */
export function booleanParaTri(valor: boolean | null | undefined): TriEstado {
  if (valor === true) return "sim";
  if (valor === false) return "nao";
  return "nd";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/restricoes.test.ts`
Expected: PASS, todos os testes do arquivo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/restricoes.ts src/lib/restricoes.test.ts
git commit -m "$(cat <<'EOF'
Lógica do filtro de restrições e do tri-estado do admin

Só passa no filtro quem tem declaração explícita: null e ausente nunca
viram "sem lactose". A conversão do formulário cai para null na dúvida.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Colunas, migração e API

**Files:**
- Modify: `prisma/schema.prisma` (model `MenuItem`, linhas 98-115)
- Create: `prisma/migrations/<timestamp>_restricoes_no_item/migration.sql` (gerado pelo Prisma)
- Modify: `src/app/api/menu/route.ts` (`menuItemSchema`)
- Modify: `src/app/api/menu/[id]/route.ts` (`updateSchema`)
- Modify: `src/types/index.ts` (`MenuItemWithCategory`)
- Test: `src/app/api/menu/route.test.ts`
- Test: `src/app/api/menu/[id]/route.test.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces (usado nas Tasks 3 e 4):
  - colunas `containsGluten`, `containsLactose`, `isVegan`, todas `Boolean?`, em `MenuItem`;
  - `POST /api/menu` e `PUT /api/menu/[id]` aceitam os três como `boolean | null`, ausente significa "não mexe";
  - `MenuItemWithCategory` ganha os três campos opcionais (`boolean | null | undefined`).

- [ ] **Step 1: Write the failing tests**

Em `src/app/api/menu/route.test.ts`, acrescente ao **fim** do arquivo:

```ts
describe("POST: informações alimentares", () => {
  it.each([[true], [false], [null]])("aceita %s nos três campos", async (valor) => {
    const res = await POST(
      reqPost({ ...itemValido, containsGluten: valor, containsLactose: valor, isVegan: valor })
    );

    expect(res.status).toBe(201);
    expect(menuItemCreate.mock.calls[0][0].data).toMatchObject({
      containsGluten: valor,
      containsLactose: valor,
      isVegan: valor,
    });
  });

  it("sem os campos, não inventa valor: ficam fora do data", async () => {
    await POST(reqPost(itemValido));

    const { data } = menuItemCreate.mock.calls[0][0];
    expect(data).not.toHaveProperty("containsGluten");
    expect(data).not.toHaveProperty("containsLactose");
    expect(data).not.toHaveProperty("isVegan");
  });

  it.each([["true"], ["false"], ["sim"], [0], [1]])("recusa %j", async (valor) => {
    const res = await POST(reqPost({ ...itemValido, containsLactose: valor }));

    expect(res.status).toBe(400);
    expect(menuItemCreate).not.toHaveBeenCalled();
  });
});
```

Em `src/app/api/menu/[id]/route.test.ts`, acrescente ao **fim** do arquivo:

```ts
describe("PUT: informações alimentares", () => {
  it.each([[true], [false], [null]])("aceita %s, e null volta a 'não informado'", async (valor) => {
    const res = await PUT(req("PUT", { containsLactose: valor }), params);

    expect(res.status).toBe(200);
    expect(menuItemUpdate.mock.calls[0][0].data).toEqual({ containsLactose: valor });
  });

  it("editar outro campo não toca nas declarações", async () => {
    await PUT(req("PUT", { name: "X-Bacon" }), params);

    const { data } = menuItemUpdate.mock.calls[0][0];
    expect(data).toEqual({ name: "X-Bacon" });
    expect(data).not.toHaveProperty("containsGluten");
    expect(data).not.toHaveProperty("containsLactose");
    expect(data).not.toHaveProperty("isVegan");
  });

  it.each([["false"], ["sim"], [0]])("recusa %j", async (valor) => {
    const res = await PUT(req("PUT", { isVegan: valor }), params);

    expect(res.status).toBe(400);
    expect(menuItemUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/menu`
Expected: FAIL. O zod descarta chaves desconhecidas, então "aceita %s" falha no `toMatchObject` e "recusa" devolve 201/200 em vez de 400.

- [ ] **Step 3: Change the schema and create the migration**

Em `prisma/schema.prisma`, no model `MenuItem`, acrescente depois de `available`:

```prisma
  available   Boolean     @default(true)
  // O que o restaurante declara sobre a receita. null = "não informou", e por
  // isso as colunas NÃO têm default: um `false` faria todo item antigo aparecer
  // como "sem lactose" sem que ninguém tivesse verificado. Ver src/lib/restricoes.ts.
  containsGluten  Boolean?
  containsLactose Boolean?
  isVegan         Boolean?
```

Suba o banco local e gere a migração **sem aplicar**, para poder comentá-la antes (editar uma migração já aplicada muda o checksum e o Prisma pede reset):

Run: `docker compose up -d`
Run: `npm run db:migrate -- --create-only --name restricoes_no_item`
Expected: cria `prisma/migrations/<timestamp>_restricoes_no_item/migration.sql`. Se o Prisma pedir reset por drift, **pare e avise**: o banco local não está no estado esperado.

Abra o arquivo gerado. O corpo deve ser exatamente:

```sql
-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "containsGluten" BOOLEAN,
ADD COLUMN     "containsLactose" BOOLEAN,
ADD COLUMN     "isVegan" BOOLEAN;
```

Acrescente este comentário no topo do arquivo, antes do `-- AlterTable`:

```sql
-- Declarações alimentares do prato, anuláveis e SEM default.
--
-- null quer dizer "o restaurante não informou". Um DEFAULT false marcaria todo
-- item existente como "sem glúten" e "sem lactose" no dia do deploy, sem
-- verificação nenhuma, e quem tem intolerância pediria confiando nisso.
--
-- Sem tabela nova, não há RLS a acrescentar: MenuItem já tem. A migração é
-- retrocompatível, porque o código antigo ignora as colunas.

```

Aplique:

Run: `npm run db:migrate`
Expected: "Applying migration `<timestamp>_restricoes_no_item`" e o client do Prisma regenerado.

- [ ] **Step 4: Accept the fields in both routes**

Em `src/app/api/menu/route.ts`, no `menuItemSchema`, acrescente depois de `categoryId`:

```ts
  categoryId: z.string(),
  // null limpa a declaração ("não informado"); ausente não mexe. String como
  // "false" é recusada de propósito: virar boolean por coerção reabriria o
  // buraco que a coluna anulável fecha.
  containsGluten: z.boolean().nullable().optional(),
  containsLactose: z.boolean().nullable().optional(),
  isVegan: z.boolean().nullable().optional(),
```

Em `src/app/api/menu/[id]/route.ts`, no `updateSchema`, acrescente os mesmos três campos depois de `categoryId`:

```ts
  categoryId: z.string().optional(),
  containsGluten: z.boolean().nullable().optional(),
  containsLactose: z.boolean().nullable().optional(),
  isVegan: z.boolean().nullable().optional(),
```

- [ ] **Step 5: Add the fields to the shared type**

Em `src/types/index.ts`, no `MenuItemWithCategory`, acrescente depois de `categoryId: string;`:

```ts
  categoryId: string;
  // Opcionais: o cardápio chega por cache e por um cast em page.tsx, e item
  // anterior à migração não traz os campos. Ausente significa "não informado".
  containsGluten?: boolean | null;
  containsLactose?: boolean | null;
  isVegan?: boolean | null;
```

- [ ] **Step 6: Run tests and the type check**

Run: `npx vitest run src/app/api/menu`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/app/api/menu src/types/index.ts
git commit -m "$(cat <<'EOF'
Item do cardápio ganha declarações alimentares anuláveis

containsGluten, containsLactose e isVegan, sem default: null é "o
restaurante não informou", e item antigo nunca vira "sem lactose" por
omissão. A API aceita boolean ou null e recusa string.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: O admin declara no formulário do item

**Files:**
- Modify: `src/components/adm/MenuItemModal.tsx`
- Modify: `src/components/adm/MenuManager.tsx` (interface `MenuItem`, linhas 10-18)
- Test: `src/components/adm/MenuItemModal.test.tsx`

**Interfaces:**
- Consumes: `triParaBoolean`, `booleanParaTri`, `TriEstado` de `@/lib/restricoes` (Task 1); API da Task 2.
- Produces: o modal envia `containsGluten`, `containsLactose` e `isVegan` como `boolean | null` em todo POST e PUT.

- [ ] **Step 1: Write the failing tests**

Em `src/components/adm/MenuItemModal.test.tsx`, troque a linha de import do Testing Library por:

```tsx
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
```

e acrescente ao **fim** do arquivo:

```tsx
describe("informações para o cliente", () => {
  // `null` e `false` são coisas diferentes aqui: "Não informado" nunca pode
  // chegar ao servidor como "Não", porque o cardápio passaria a afirmar que o
  // prato não tem lactose sem que o dono tenha dito isso.
  const PERGUNTAS = [
    ["Contém glúten?", /contém glúten/i, "containsGluten"],
    ["Contém lactose?", /contém lactose/i, "containsLactose"],
    ["É vegano?", /é vegano/i, "isVegan"],
  ] as const;

  const opcao = (grupo: RegExp, rotulo: string) =>
    within(screen.getByRole("group", { name: grupo })).getByRole("radio", {
      name: rotulo,
    }) as HTMLInputElement;

  const itemAntigo = {
    id: "item-1",
    name: "X-Bacon",
    description: null,
    price: 30,
    imageUrl: null,
    available: true,
    categoryId: "cat-1",
  };

  it.each(PERGUNTAS)("%s começa em 'Não informado' num item novo", (_titulo, grupo) => {
    montar();
    expect(opcao(grupo, "Não informado").checked).toBe(true);
  });

  it("item anterior à migração, sem os campos, também abre em 'Não informado'", () => {
    montar(itemAntigo);

    for (const [, grupo] of PERGUNTAS) {
      expect(opcao(grupo, "Não informado").checked).toBe(true);
    }
  });

  it("salvar sem mexer manda null nos três, nunca false", async () => {
    montar();
    await preencherValido();
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()).toMatchObject({
      containsGluten: null,
      containsLactose: null,
      isVegan: null,
    });
  });

  it.each(PERGUNTAS)("%s: 'Sim' manda true", async (_titulo, grupo, campoApi) => {
    montar();
    await preencherValido();
    await userEvent.click(opcao(grupo, "Sim"));
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()[campoApi]).toBe(true);
  });

  it.each(PERGUNTAS)("%s: 'Não' manda false", async (_titulo, grupo, campoApi) => {
    montar();
    await preencherValido();
    await userEvent.click(opcao(grupo, "Não"));
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado()[campoApi]).toBe(false);
  });

  it("carrega o que o item já declara", () => {
    montar({ ...itemAntigo, containsGluten: false, containsLactose: true, isVegan: null });

    expect(opcao(/contém glúten/i, "Não").checked).toBe(true);
    expect(opcao(/contém lactose/i, "Sim").checked).toBe(true);
    expect(opcao(/é vegano/i, "Não informado").checked).toBe(true);
  });

  it("dá para voltar uma declaração para 'Não informado'", async () => {
    montar({ ...itemAntigo, containsLactose: false });
    await userEvent.click(opcao(/contém lactose/i, "Não informado"));
    await salvar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(enviado().containsLactose).toBeNull();
  });

  it("avisa sobre contaminação cruzada, porque o cliente vai confiar", () => {
    montar();
    expect(screen.getByText(/contaminação cruzada/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/adm/MenuItemModal.test.tsx`
Expected: FAIL nos testes novos ("Unable to find role group"). Os testes antigos continuam passando.

- [ ] **Step 3: Implement the form section**

Em `src/components/adm/MenuItemModal.tsx`:

**3a.** Troque os imports do topo (acrescente `UseFormRegister` e a lib):

```tsx
import { useForm, type UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, Upload } from "lucide-react";
import { toast } from "sonner";
import { booleanParaTri, triParaBoolean } from "@/lib/restricoes";
```

**3b.** No `schema`, acrescente os três campos e a definição do tri-estado:

```tsx
// `.catch("nd")`: valor que não seja exatamente um dos três cai em "Não
// informado". Falhar a validação aqui travaria o botão sem mensagem nenhuma, e
// coagir para "Não" afirmaria algo que o dono não disse.
const triEstado = z.enum(["sim", "nao", "nd"]).catch("nd");

const schema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  description: z.string().optional(),
  price: z.string().refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Preço deve ser positivo"),
  imageUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  available: z.boolean(),
  categoryId: z.string().min(1, "Selecione uma categoria"),
  containsGluten: triEstado,
  containsLactose: triEstado,
  isVegan: triEstado,
});
```

**3c.** Na `interface MenuItem` local, acrescente:

```tsx
  categoryId: string;
  containsGluten?: boolean | null;
  containsLactose?: boolean | null;
  isVegan?: boolean | null;
```

**3d.** Acrescente o componente da pergunta **antes** de `export function MenuItemModal`:

```tsx
const OPCOES_ALIMENTARES = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "nd", rotulo: "Não informado" },
] as const;

function PerguntaAlimentar({
  legenda,
  campo,
  register,
}: {
  legenda: string;
  campo: "containsGluten" | "containsLactose" | "isVegan";
  register: UseFormRegister<FormData>;
}) {
  return (
    <fieldset>
      <legend className="text-sm text-neutral-700 mb-1">{legenda}</legend>
      <div className="flex gap-2">
        {OPCOES_ALIMENTARES.map(({ valor, rotulo }) => (
          <label key={valor} className="flex-1 cursor-pointer">
            <input type="radio" value={valor} {...register(campo)} className="peer sr-only" />
            <span className="block text-center px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-600 transition peer-checked:border-brand peer-checked:bg-brand-light peer-checked:text-brand-dark peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
              {rotulo}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

**3e.** No `useEffect`, acrescente os três campos nos dois `reset`:

```tsx
      reset({
        name: item.name,
        description: item.description ?? "",
        price: String(item.price),
        imageUrl: item.imageUrl ?? "",
        available: item.available,
        categoryId: item.categoryId,
        containsGluten: booleanParaTri(item.containsGluten),
        containsLactose: booleanParaTri(item.containsLactose),
        isVegan: booleanParaTri(item.isVegan),
      });
    } else {
      reset({
        name: "",
        description: "",
        price: "",
        imageUrl: "",
        available: true,
        categoryId: categories[0]?.id ?? "",
        containsGluten: "nd",
        containsLactose: "nd",
        isVegan: "nd",
      });
```

**3f.** Em `onSubmit`, troque a montagem do `payload`:

```tsx
    const { containsGluten, containsLactose, isVegan, ...resto } = data;
    const payload = {
      ...resto,
      price: Number(data.price),
      imageUrl: data.imageUrl || null,
      description: data.description || null,
      containsGluten: triParaBoolean(containsGluten),
      containsLactose: triParaBoolean(containsLactose),
      isVegan: triParaBoolean(isVegan),
    };
```

**3g.** No JSX, **entre** o bloco da "Imagem" e o bloco `Disponível no cardápio` (o `div className="flex items-center gap-3"` com o checkbox `available`), acrescente:

```tsx
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-neutral-700">Informações para o cliente</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Marque &quot;Não&quot; só se tiver certeza, incluindo contaminação cruzada na cozinha.
                Quem tem alergia vai confiar nisso.
              </p>
            </div>
            <PerguntaAlimentar legenda="Contém glúten?" campo="containsGluten" register={register} />
            <PerguntaAlimentar legenda="Contém lactose?" campo="containsLactose" register={register} />
            <PerguntaAlimentar legenda="É vegano?" campo="isVegan" register={register} />
          </div>
```

**3h.** Em `src/components/adm/MenuManager.tsx`, na `interface MenuItem`, acrescente depois de `categoryId: string;`:

```tsx
  containsGluten?: boolean | null;
  containsLactose?: boolean | null;
  isVegan?: boolean | null;
```

- [ ] **Step 4: Run tests and the type check**

Run: `npx vitest run src/components/adm/MenuItemModal.test.tsx`
Expected: PASS, incluindo os testes antigos (nenhum deles deve mudar).
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/adm/MenuItemModal.tsx src/components/adm/MenuItemModal.test.tsx src/components/adm/MenuManager.tsx
git commit -m "$(cat <<'EOF'
Admin declara glúten, lactose e vegano ao cadastrar o item

Três perguntas Sim / Não / Não informado, começando em "Não informado"
inclusive em item antigo. Salvar sem mexer manda null, nunca false.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: O cardápio troca o assistente pelos botões

**Files:**
- Create: `src/components/menu/FiltroDeRestricoes.tsx`
- Test: `src/components/menu/FiltroDeRestricoes.test.tsx`
- Modify: `src/app/(client)/page.tsx` (import na linha 7, uso nas linhas 66-75)
- Modify: `prisma/seed.ts` (array `items`, linhas 56-66)
- Delete: `src/components/menu/MenuAIAssistant.tsx`

**Interfaces:**
- Consumes: `RESTRICOES`, `RestricaoDeCardapio`, `filtrarPorRestricoes`, `restricoesDisponiveis` (Task 1); `MenuItemWithCategory` com os campos novos (Task 2).
- Produces: `FiltroDeRestricoes({ menuItems: MenuItemWithCategory[]; restaurantOpen: boolean })`, que devolve `null` quando nenhum item declarou algo filtrável.

- [ ] **Step 1: Write the failing tests**

Crie `src/components/menu/FiltroDeRestricoes.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * O filtro de restrições do cardápio.
 *
 * O que este arquivo protege é o contrário do que a IA fazia: o cardápio só
 * afirma "sem lactose" sobre o que o restaurante DECLAROU. Item sem declaração
 * não aparece em filtro nenhum, e o card inteiro some quando não há nada
 * declarado, para o restaurante que ainda não preencheu não mostrar um filtro
 * que devolve sempre zero.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/menu/CartFlyAnimation", () => ({ triggerCartFly: vi.fn() }));

import { FiltroDeRestricoes } from "./FiltroDeRestricoes";
import { useCart } from "@/hooks/useCart";
import type { MenuItemWithCategory } from "@/types";

const CATEGORIA = { id: "cat-1", name: "Lanches", slug: "lanches" };

function prato(
  id: string,
  name: string,
  declaracao: Partial<MenuItemWithCategory> = {}
): MenuItemWithCategory {
  return {
    id,
    name,
    description: null,
    price: 20,
    imageUrl: null,
    available: true,
    categoryId: CATEGORIA.id,
    category: CATEGORIA,
    ...declaracao,
  };
}

const SALADA = prato("1", "Salada", { containsGluten: false, containsLactose: false, isVegan: true });
const BURGER = prato("2", "X-Burguer", { containsGluten: true, containsLactose: true, isVegan: false });
const PAO_DE_QUEIJO = prato("3", "Pão de queijo", { containsGluten: false, containsLactose: true });
const SEM_INFO = prato("4", "Prato novo");
const BURGER_VEGETAL = prato("5", "Hambúrguer vegetal", { isVegan: true, containsGluten: true });

const CARDAPIO = [SALADA, BURGER, PAO_DE_QUEIJO, SEM_INFO];

const montar = (itens = CARDAPIO, restaurantOpen = true) =>
  render(<FiltroDeRestricoes menuItems={itens} restaurantOpen={restaurantOpen} />);

const botao = (nome: string) => screen.getByRole("button", { name: nome });
const clicar = (nome: string) => userEvent.click(botao(nome));
const AVISO = /informado pelo restaurante/i;

beforeEach(() => {
  localStorage.clear();
  useCart.setState({ items: [] });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("quando o card aparece", () => {
  it("não renderiza nada se nenhum item declarou algo filtrável", () => {
    // BURGER só declara que CONTÉM, e isso não habilita botão nenhum.
    const { container } = montar([BURGER, SEM_INFO]);

    expect(container.firstChild).toBeNull();
  });

  it("só mostra o botão que algum item atende", () => {
    montar([PAO_DE_QUEIJO, SEM_INFO]);

    expect(botao("Sem glúten")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sem lactose" })).toBeNull();
  });

  it("não tem campo de texto nem chama a rede: é só filtro", async () => {
    montar();
    await clicar("Sem lactose");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("filtrar", () => {
  it("não lista item nenhum antes de clicar", () => {
    montar();

    expect(screen.queryByText("Salada")).toBeNull();
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("'Sem lactose' mostra só quem declarou, e nunca item sem informação", async () => {
    montar();
    await clicar("Sem lactose");

    expect(screen.getByText("Salada")).toBeDefined();
    expect(screen.queryByText("Pão de queijo")).toBeNull(); // contém lactose
    expect(screen.queryByText("X-Burguer")).toBeNull();
    expect(screen.queryByText("Prato novo")).toBeNull(); // não informado
  });

  it("'Sem glúten' mostra quem declarou sem glúten", async () => {
    montar();
    await clicar("Sem glúten");

    expect(screen.getByText("Salada")).toBeDefined();
    expect(screen.getByText("Pão de queijo")).toBeDefined();
    expect(screen.queryByText("X-Burguer")).toBeNull();
  });

  it("combina os filtros por E", async () => {
    montar();
    await clicar("Sem glúten");
    await clicar("Sem lactose");

    expect(screen.getByText("Salada")).toBeDefined();
    expect(screen.queryByText("Pão de queijo")).toBeNull();
  });

  it("clicar de novo desliga o filtro", async () => {
    montar();
    await clicar("Sem lactose");
    await clicar("Sem lactose");

    expect(screen.queryByText("Salada")).toBeNull();
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("marca o botão ativo para leitor de tela", async () => {
    montar();
    expect(botao("Vegano").getAttribute("aria-pressed")).toBe("false");

    await clicar("Vegano");
    expect(botao("Vegano").getAttribute("aria-pressed")).toBe("true");
  });

  it("mostra o aviso de que a informação vem do restaurante", async () => {
    montar();
    await clicar("Vegano");

    expect(
      screen.getByText(
        "Informado pelo restaurante. Em caso de alergia, confirme com a equipe antes de pedir."
      )
    ).toBeDefined();
  });

  it("combinação sem resultado avisa, e 'Limpar filtros' desfaz", async () => {
    // O hambúrguer vegetal é vegano mas contém glúten; o pão de queijo é sem
    // glúten mas não é vegano. Os dois botões existem, a combinação é vazia.
    montar([PAO_DE_QUEIJO, BURGER_VEGETAL]);
    await clicar("Vegano");
    await clicar("Sem glúten");

    expect(screen.getByText("Nenhum item atende a todos os filtros marcados.")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    expect(screen.queryByText(/nenhum item atende/i)).toBeNull();
    expect(botao("Vegano").getAttribute("aria-pressed")).toBe("false");
    expect(botao("Sem glúten").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("pedir pelo card", () => {
  it("'+ Adicionar' põe o item no carrinho", async () => {
    montar();
    await clicar("Sem lactose");
    await userEvent.click(screen.getByRole("button", { name: /adicionar/i }));

    expect(useCart.getState().items.map((i) => i.id)).toEqual(["1"]);
  });

  it("com o restaurante fechado, o botão de adicionar fica desabilitado", async () => {
    montar(CARDAPIO, false);
    await clicar("Sem lactose");

    const adicionar = screen.getByRole("button", { name: /adicionar/i }) as HTMLButtonElement;
    expect(adicionar.disabled).toBe(true);
  });
});

describe("o cardápio muda por baixo (cache de 60s)", () => {
  it("filtro ligado cujo botão sumiu deixa de filtrar em silêncio", async () => {
    const { rerender } = montar();
    await clicar("Sem lactose");
    expect(screen.getByText("Salada")).toBeDefined();

    // O dono tirou a declaração de lactose; sobrou só um item vegano.
    const vegano = prato("6", "Salada vegana", { isVegan: true, containsLactose: true });
    rerender(<FiltroDeRestricoes menuItems={[vegano]} restaurantOpen />);

    expect(screen.queryByRole("button", { name: "Sem lactose" })).toBeNull();
    expect(screen.queryByText("Salada vegana")).toBeNull();
    expect(screen.queryByText(AVISO)).toBeNull();
  });
});

describe("dispensar o card", () => {
  it("fechar esconde o card, grava a chave e deixa o atalho para reabrir", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Fechar filtro" }));

    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
    expect(localStorage.getItem("muno-filtro-dispensado")).toBe("1");
    expect(screen.getByRole("button", { name: /filtrar por restrição/i })).toBeDefined();
  });

  it("o atalho reabre o card e apaga a chave", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Fechar filtro" }));
    await userEvent.click(screen.getByRole("button", { name: /filtrar por restrição/i }));

    expect(botao("Vegano")).toBeDefined();
    expect(localStorage.getItem("muno-filtro-dispensado")).toBeNull();
  });

  it("abre já fechado se foi dispensado antes", () => {
    localStorage.setItem("muno-filtro-dispensado", "1");
    montar();

    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
    expect(screen.getByRole("button", { name: /filtrar por restrição/i })).toBeDefined();
  });

  it("não quebra se o localStorage estiver bloqueado", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });

    montar();
    expect(botao("Vegano")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Fechar filtro" }));
    expect(screen.queryByRole("button", { name: "Vegano" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/menu/FiltroDeRestricoes.test.tsx`
Expected: FAIL, "Failed to resolve import ./FiltroDeRestricoes".

- [ ] **Step 3: Write the component**

Crie `src/components/menu/FiltroDeRestricoes.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Leaf, X } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { triggerCartFly } from "@/components/menu/CartFlyAnimation";
import { formatCurrency } from "@/lib/utils";
import {
  RESTRICOES,
  filtrarPorRestricoes,
  restricoesDisponiveis,
  type RestricaoDeCardapio,
} from "@/lib/restricoes";
import { MenuItemWithCategory } from "@/types";

// Chave nova de propósito: quem fechou o assistente de IA (`muno-ai-dismissed`)
// não fechou este card, e herdar o estado esconderia o filtro de quem nunca o viu.
const CHAVE_DISPENSA = "muno-filtro-dispensado";

interface FiltroDeRestricoesProps {
  menuItems: MenuItemWithCategory[];
  restaurantOpen: boolean;
}

function ItemCard({ item, restaurantOpen }: { item: MenuItemWithCategory; restaurantOpen: boolean }) {
  const addItem = useCart((s) => s.addItem);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleAdd() {
    addItem({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl }, 1);
    if (btnRef.current) triggerCartFly(btnRef.current);
  }

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border border-neutral-200 p-2.5 mt-2">
      <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-neutral-100">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} fill sizes="48px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-neutral-900 leading-tight truncate">{item.name}</p>
        <p className="text-xs text-neutral-400">{item.category.name}</p>
        <p className="text-xs font-bold text-brand">{formatCurrency(item.price)}</p>
      </div>
      <button
        ref={btnRef}
        onClick={handleAdd}
        disabled={!restaurantOpen}
        title={!restaurantOpen ? "Restaurante fechado" : undefined}
        className="shrink-0 px-2.5 py-1 rounded-full bg-brand hover:bg-brand-dark active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all duration-150 shadow-sm"
      >
        + Adicionar
      </button>
    </div>
  );
}

export function FiltroDeRestricoes({ menuItems, restaurantOpen }: FiltroDeRestricoesProps) {
  const [dispensado, setDispensado] = useState(false);
  const [ativas, setAtivas] = useState<RestricaoDeCardapio[]>([]);

  useEffect(() => {
    // O localStorage pode lançar (janela privada, política do navegador). O card
    // precisa funcionar do mesmo jeito sem ele.
    try {
      if (localStorage.getItem(CHAVE_DISPENSA) === "1") setDispensado(true);
    } catch {
      /* sem armazenamento: o card só não lembra que foi fechado */
    }
  }, []);

  const disponiveis = useMemo(() => restricoesDisponiveis(menuItems), [menuItems]);

  // O cardápio vem de um cache de 60s e pode mudar com o card aberto. Um filtro
  // ligado cujo botão sumiu não pode seguir filtrando sem o cliente ver por quê.
  const ligadas = useMemo(
    () => ativas.filter((id) => disponiveis.includes(id)),
    [ativas, disponiveis]
  );
  const resultado = useMemo(() => filtrarPorRestricoes(menuItems, ligadas), [menuItems, ligadas]);

  // Nada declarado, nada a mostrar: nem o wrapper, que carrega margem.
  if (disponiveis.length === 0) return null;

  function alternar(id: RestricaoDeCardapio) {
    setAtivas((atuais) => (atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]));
  }

  function dispensar() {
    setDispensado(true);
    try {
      localStorage.setItem(CHAVE_DISPENSA, "1");
    } catch {
      /* ver o useEffect acima */
    }
  }

  function reabrir() {
    setDispensado(false);
    try {
      localStorage.removeItem(CHAVE_DISPENSA);
    } catch {
      /* ver o useEffect acima */
    }
  }

  if (dispensado) {
    return (
      <div className="flex justify-center pb-2">
        <button
          type="button"
          onClick={reabrir}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-brand transition-colors"
        >
          <Leaf size={13} />
          Filtrar por restrição
          <ChevronDown size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm mb-6">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100 bg-neutral-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shrink-0">
            <Leaf size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900 leading-none">Filtrar por restrição</p>
            <p className="text-xs text-neutral-400 mt-0.5">Veja só o que serve para você</p>
          </div>
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Fechar filtro"
          className="text-neutral-400 hover:text-neutral-600 transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {RESTRICOES.filter((r) => disponiveis.includes(r.id)).map(({ id, label, emoji }) => {
            const ligado = ligadas.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={ligado}
                onClick={() => alternar(id)}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all duration-150 active:scale-95 ${
                  ligado
                    ? "border-brand bg-brand text-white"
                    : "border-neutral-200 text-neutral-600 hover:border-brand hover:text-brand hover:bg-brand/5"
                }`}
              >
                <span aria-hidden="true">{emoji}</span> {label}
              </button>
            );
          })}
        </div>

        {ligadas.length > 0 && (
          <div className="space-y-2">
            {resultado.length > 0 ? (
              <div className="max-h-80 overflow-y-auto no-scrollbar">
                {resultado.map((item) => (
                  <ItemCard key={item.id} item={item} restaurantOpen={restaurantOpen} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Nenhum item atende a todos os filtros marcados.</p>
            )}
            <p className="text-xs text-neutral-400">
              Informado pelo restaurante. Em caso de alergia, confirme com a equipe antes de pedir.
            </p>
            <button
              type="button"
              onClick={() => setAtivas([])}
              className="text-xs text-neutral-500 hover:text-brand underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/menu/FiltroDeRestricoes.test.tsx`
Expected: PASS, todos os testes do arquivo.

- [ ] **Step 5: Wire the page, update the seed, delete the old component**

Em `src/app/(client)/page.tsx`, troque a linha 7:

```tsx
import { FiltroDeRestricoes } from "@/components/menu/FiltroDeRestricoes";
```

e, no JSX (linha 66), troque `<MenuAIAssistant` por `<FiltroDeRestricoes`. Os props (`menuItems`, `restaurantOpen`) não mudam, e o `include: { items }` da query já traz as colunas novas.

Em `prisma/seed.ts`, troque o array `items` por este (as declarações são incompletas de propósito, para o dev ver que item sem declaração nunca entra em filtro):

```ts
  // Declarações alimentares de propósito INCOMPLETAS: X-Tudo e o suco ficam sem
  // nenhuma, e Onion Rings e o refrigerante declaram só parte. Assim, depois de
  // um reset, dá para ver na tela que "não informado" nunca aparece num filtro.
  const items = [
    { name: "X-Burguer", description: "Pão brioche, hambúrguer 150g, queijo, alface e tomate", price: 22.9, imageUrl: LANCHE, categoryId: lanches.id, containsGluten: true, containsLactose: true, isVegan: false },
    { name: "X-Bacon", description: "Pão brioche, hambúrguer 150g, queijo, bacon crocante e maionese", price: 40.0, imageUrl: LANCHE, categoryId: lanches.id, containsGluten: true, containsLactose: true, isVegan: false },
    { name: "X-Tudo", description: "Pão brioche, hambúrguer 150g, ovo, queijo, bacon, alface e tomate", price: 31.9, imageUrl: LANCHE, categoryId: lanches.id },
    { name: "Batata Frita P", description: "Porção pequena de batata frita crocante (200g)", price: 14.9, imageUrl: PORCAO, categoryId: porcoes.id, containsGluten: false, containsLactose: false, isVegan: true },
    { name: "Batata Frita G", description: "Porção grande de batata frita crocante (400g)", price: 22.9, imageUrl: PORCAO, categoryId: porcoes.id, containsGluten: false, containsLactose: false, isVegan: true },
    { name: "Onion Rings", description: "Anéis de cebola empanados e fritos (200g)", price: 18.9, imageUrl: PORCAO, categoryId: porcoes.id, containsGluten: true, containsLactose: false },
    { name: "Refrigerante Lata", description: "Coca-Cola, Guaraná ou Sprite 350ml", price: 6.9, imageUrl: BEBIDA, categoryId: bebidas.id, containsGluten: false, containsLactose: false },
    { name: "Suco Natural", description: "Laranja, limão ou maracujá 400ml", price: 9.9, imageUrl: BEBIDA, categoryId: bebidas.id },
    { name: "Água Mineral", description: "500ml com ou sem gás", price: 4.9, imageUrl: BEBIDA, categoryId: bebidas.id, containsGluten: false, containsLactose: false, isVegan: true },
  ];
```

Apague o componente antigo:

Run: `git rm src/components/menu/MenuAIAssistant.tsx`

- [ ] **Step 6: Run the full unit suite and the type check**

Run: `npx tsc --noEmit`
Expected: sem erros (nada mais importa `MenuAIAssistant`).
Run: `npx vitest run`
Expected: PASS na suíte inteira. A rota de IA ainda existe nesta altura e o teste dela continua verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/menu/FiltroDeRestricoes.tsx src/components/menu/FiltroDeRestricoes.test.tsx "src/app/(client)/page.tsx" prisma/seed.ts
git commit -m "$(cat <<'EOF'
Cardápio filtra por restrição declarada, sem chat e sem IA

Três botões (Vegano, Sem glúten, Sem lactose) listam no próprio card os
itens que o restaurante declarou, com aviso de que a informação é dele.
Botão sem dado não aparece, e sem nenhum dado o card inteiro some. O seed
ganha declarações incompletas de propósito.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Remover a rota de IA e o que apontava para ela

**Files:**
- Delete: `src/app/api/ai/menu-recommendation/route.ts`
- Delete: `src/app/api/ai/menu-recommendation/route.test.ts`
- Modify: `src/security/politica-de-acesso.ts` (entrada nas linhas 44-46)
- Modify: `.env.example` (linhas 53-54)
- Modify: `README.md` (linhas 334 e 446)
- Modify: `src/lib/pwa/dispensa.ts` (comentário na linha 18)
- Modify: `src/app/api/orders/[id]/chat/route.ts` (comentário na linha 11)

**Interfaces:**
- Consumes: nada. A Task 4 já tirou o único chamador (`MenuAIAssistant`).
- Produces: nenhuma referência a `GROQ_API_KEY`, `menu-recommendation` ou `MenuAIAssistant` fora de `docs/`.

- [ ] **Step 1: Delete the route**

Run: `git rm -r src/app/api/ai`
Expected: remove `route.ts` e `route.test.ts`, e o diretório `ai/` some.

- [ ] **Step 2: Remove the policy entry**

Em `src/security/politica-de-acesso.ts`, apague exatamente estas três linhas (o `POLITICA` começa na linha seguinte com `GET /api/analytics`):

```ts
  "POST /api/ai/menu-recommendation": publico(
    "sugestão do cardápio para quem está navegando, sem conta; limitada por IP"
  ),
```

- [ ] **Step 3: Remove the env var, the README mentions, and stale comments**

Em `.env.example`, apague o bloco abaixo e uma das duas linhas em branco ao redor, para ficar uma só entre o bloco anterior e `# App`:

```
# AI (Groq - gratuito em console.groq.com, 14.400 req/dia)
GROQ_API_KEY=""
```

Em `README.md`:
- apague a linha da tabela `| \`GROQ_API_KEY\` | Assistente de IA do cardápio |`;
- na árvore de rotas, troque `motoboy/ chat/ analytics/ settings/ upload/ ai/` por `motoboy/ chat/ analytics/ settings/ upload/`.

Em `src/lib/pwa/dispensa.ts`, no comentário de `marcarDispensa`, troque:

```ts
 * Um carimbo de tempo, e não um "1": a flag booleana que MenuAIAssistant usa
 * cala o aviso para sempre, e aqui queremos que ele volte.
```

por:

```ts
 * Um carimbo de tempo, e não um "1": a flag booleana que FiltroDeRestricoes usa
 * cala o aviso para sempre, e aqui queremos que ele volte.
```

Em `src/app/api/orders/[id]/chat/route.ts`, troque o comentário das linhas 11-13 por:

```ts
// Mensagem de chat de pedido não chega perto de 2000 caracteres; o limite
// existe para o campo não ser um depósito de texto arbitrário no banco.
```

- [ ] **Step 4: Verify nothing still points at the removed code**

Run: `grep -rnI "GROQ\|menu-recommendation\|MenuAIAssistant\|muno-ai-dismissed\|api/ai" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=generated --exclude-dir=worktrees | grep -v "^./docs/superpowers/"`
Expected: nenhuma linha. (`docs/superpowers/` fica de fora: a spec e o plano antigo citam esses nomes como história.)

- [ ] **Step 5: Run the security suite and the full tests**

Run: `npx vitest run src/security`
Expected: PASS. A matriz de acesso exige que toda entrada da política aponte para um handler que existe (`matriz-de-acesso.test.ts:189`), então este passo só fica verde porque a rota e a entrada saíram juntas.
Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src .env.example README.md
git commit -m "$(cat <<'EOF'
Remove a rota de IA do cardápio e o que apontava para ela

Sai /api/ai/menu-recommendation, a entrada na política de acesso e a
GROQ_API_KEY do .env.example e do README. A chave na Vercel é removida à
mão, depois do deploy.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: A landing deixa de vender IA

**Files:**
- Modify: `public/vendas/index.html` (linhas 361-362, 364-405 e 638-643)
- Test: `src/lib/plans.test.ts` (já existe, só roda)

**Interfaces:**
- Consumes: nada.
- Produces: nenhuma menção a IA ou assistente na landing.

Esta task **para no meio para o dono aprovar o texto**. A landing é publicidade, e o texto novo não passa para o commit sem um "ok" dele.

- [ ] **Step 1: Make the three edits**

Abra `public/vendas/index.html` e faça as três mudanças. Os textos abaixo não têm travessão nem a palavra "IA".

**1a. O subtítulo (linhas 361-362).** Troque:

```html
        <p class="text-gray-500 mt-2 max-w-xl mx-auto text-sm">Muito além de um cardápio digital com IA integrada que
          recomenda pratos para cada cliente.</p>
```

por:

```html
        <p class="text-gray-500 mt-2 max-w-xl mx-auto text-sm">Muito além de um cardápio digital, com filtro de
          restrições alimentares feito pelo próprio restaurante.</p>
```

**1b. O card largo (linhas 364-405).**
- troque o comentário `<!-- Destaque IA — card largo -->` por `<!-- Destaque: filtro de restrições alimentares, card largo -->`;
- apague o bloco do selo, que anuncia um "exclusivo" que não conseguimos sustentar:

```html
          <div
            class="absolute top-0 right-0 bg-terracota text-white text-xs font-black px-4 py-1.5 rounded-bl-xl rounded-tr-2xl tracking-wide">
            EXCLUSIVO MUNO
          </div>
```

- troque o título `Assistente de IA "Muno, o que você precisa?"` por `Filtro de restrições alimentares`;
- troque o parágrafo inteiro do card por:

```html
              <p class="text-gray-600 text-sm leading-relaxed">
                Ao cadastrar cada prato, o dono informa se tem glúten, se tem lactose e se é vegano. No cardápio, o
                cliente toca em Vegano, Sem glúten ou Sem lactose e vê só o que o restaurante marcou.
                Quem tem restrição encontra o que pode pedir em um toque, sem perguntar no WhatsApp.
              </p>
```

- apague os dois chips que não existem mais, `😋 Com fome` e `🥗 Algo leve`, cada um um `<span ...>...</span>` de três linhas. Ficam os três: `🌱 Vegano`, `🌾 Sem glúten`, `🥛 Sem lactose`.

**1c. A tabela comparativa (linha 638).** Apague a linha inteira da tabela, de `<tr class="bg-terracota/5">` até o `</tr>` correspondente:

```html
            <tr class="bg-terracota/5">
              <td class="text-left font-bold text-gastrogreen">IA de recomendação de pratos</td>
              <td class="compare-col-highlight compare-yes">✓ Exclusivo</td>
              <td class="compare-no">✗ Não tem</td>
              <td class="compare-no hidden md:table-cell">✗ Não tem</td>
            </tr>
```

A linha sai, e não vira "filtro de restrições", porque a coluna dos concorrentes afirmaria "✗ Não tem" sobre produtos de terceiros, e isso não temos como provar.

- [ ] **Step 2: Verify no AI claim is left and prices were not touched**

Run: `grep -nE "\bIA\b|[Aa]ssistente|recomenda|Exclusivo|EXCLUSIVO" public/vendas/index.html`
Expected: nenhuma linha.
Run: `npx vitest run src/lib/plans.test.ts`
Expected: PASS (nenhum preço foi tocado).

- [ ] **Step 3: Show the new copy to the user and wait**

Mostre ao usuário o texto final (subtítulo, título, parágrafo, os três chips) e diga que a linha "IA de recomendação de pratos" saiu da tabela comparativa, com o motivo. **Não faça commit até ouvir "ok".** Se pedirem mudança de texto, edite e repita o Step 2.

- [ ] **Step 4: Commit**

```bash
git add public/vendas/index.html
git commit -m "$(cat <<'EOF'
Landing deixa de vender IA e passa a vender o filtro de restrições

O card largo, o subtítulo e a linha da tabela comparativa falavam de um
assistente que não existe mais. O selo "exclusivo" sai junto, e a linha
da tabela some para não afirmar nada sobre produto de terceiros.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verificação de ponta a ponta

**Files:** nenhum. Esta task só verifica; se algo falhar, a correção volta à task dona do código.

**Interfaces:** nenhuma.

- [ ] **Step 1: Run everything automated**

Run: `npx vitest run`
Expected: PASS na suíte inteira.
Run: `npm run lint`
Expected: sem erros novos.
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 2: Recreate the local database and start the dev server**

Run: `docker compose up -d`
Run: `npm run db:reset`
Expected: o guard confirma localhost, o schema é recriado com a migração nova, e o seed imprime o login do admin.

Inicie o servidor com `preview_start` usando a configuração `muno-dev` de `.claude/launch.json`. Nunca suba o servidor pelo Bash.

- [ ] **Step 3: Check the storefront**

Abra `http://default.localhost:3000` (o storefront do seed é `default.localhost:3000`, e `localhost:3000` é a landing).
- O card "Filtrar por restrição" aparece **sem campo de texto**, com os botões `Vegano`, `Sem glúten`, `Sem lactose`.
- `Sem lactose`: lista Batata Frita P e G, Onion Rings, Refrigerante e Água. **Não** lista X-Burguer, X-Bacon (contêm), nem X-Tudo e Suco (não informado).
- `Vegano`: só Batata Frita P, G e Água.
- `Sem glúten` + `Sem lactose` juntos: Batata P, G, Refrigerante e Água (Onion Rings sai, contém glúten).
- O aviso "Informado pelo restaurante..." aparece com qualquer filtro ligado, e "Limpar filtros" desliga tudo.
- `+ Adicionar` põe o item no carrinho.
- Fechar o card e recarregar: continua fechado; o atalho "Filtrar por restrição" reabre.
- `read_console_messages` sem erros, e `read_network_requests` sem nenhuma chamada a `/api/ai/`.

- [ ] **Step 4: Check the admin**

Entre em `http://default.localhost:3000/adm/menu` com o login do admin que o seed imprimiu.
- Abra **X-Tudo** (sem declaração): as três perguntas abrem em "Não informado".
- Marque `Contém lactose? Não`, salve, e confira na vitrine (o cardápio tem cache de até 60s) que X-Tudo entra em `Sem lactose`.
- Volte para "Não informado", salve, e confira que ele sai do filtro.
- Crie um item novo sem mexer nas perguntas: ele **não** aparece em filtro nenhum.

- [ ] **Step 5: Check the landing**

Abra `http://localhost:3000`. O card largo mostra "Filtro de restrições alimentares", com três chips e sem selo. Procure por "IA" na página inteira e na tabela comparativa: nenhuma ocorrência.

- [ ] **Step 6: Report**

Reporte ao usuário o que passou, com o que viu na tela. Lembre dois itens que **não são do código**: remover `GROQ_API_KEY` do projeto na Vercel depois do deploy, e que o deploy do código e o da landing não devem sair com muito intervalo.
