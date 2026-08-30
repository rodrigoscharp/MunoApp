# Instrumentação do funil: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o dado do funil existir e estar correto, da visita anônima na landing até o restaurante provisionado, sem nenhuma tela nova e sem que nada disso possa derrubar uma venda.

**Architecture:** O proxy planta um cookie anônimo (`muno_s`) no host raiz e não fala com o banco. A landing e o checkout mandam eventos para `/api/funil/evento`, que cria a `SessaoFunil` no primeiro evento e grava `EventoFunil`. `Lead` e `Inscricao` guardam o mesmo `sessaoId`, o que costura navegador e servidor. O cron das 9h fecha o lead de checkout abandonado e, depois de 90 dias, resume os eventos crus em `ResumoDiario` antes de apagá-los.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts` como middleware), Prisma 6 sobre Postgres, Vitest (`environment: "node"`, jsdom por arquivo quando for componente), zod, Tailwind v4 no app e v3 por CDN na landing.

**Spec:** `docs/superpowers/specs/2026-08-30-instrumentacao-do-funil-design.md`

## Global Constraints

- **Esta não é a Next.js que você conhece.** Antes de escrever código de rota, middleware ou cookie, leia o guia correspondente em `node_modules/next/dist/docs/`.
- **O banco é local.** `docker compose up -d` sobe o Postgres na porta 5433. `npm run db:migrate`, `db:push`, `db:reset` e `dev` passam por `scripts/guard-local-db.js`, que aborta se o `DATABASE_URL` não for localhost. Se a trava disparou, o alvo está errado; não a contorne.
- **Toda tabela nova em `public` precisa de RLS**, tenha `tenantId` ou não. Sem `tenantId` não há como escopar: ligue RLS sem policy nenhuma. Modelo da migração: `prisma/migrations/20260810200000_rls_nas_tabelas_de_plataforma/migration.sql`.
- **Modelo de plataforma não entra em `src/lib/tenant-scoped-models.ts`** e é lido por `prismaUnscoped`, nunca por `prisma`.
- **A migração vai commitada junto do código.** O build de produção roda `scripts/migrate-on-deploy.js`; não existe passo manual.
- **Sem travessão na cópia visível ao usuário.** Vírgula ou conjunção em prosa; travessão só como estrutura. Vale para o aviso no rodapé da landing.
- **Testes:** `npm test` roda `vitest run`. Arquivo de teste vive ao lado do arquivo testado, dentro de `src/`.
- **Nada de relatório pode derrubar receita.** Todo evento disparado do navegador é `keepalive` sem `await` e com `.catch(() => {})`; todo evento gravado no servidor vive em `try/catch` que só faz `console.error`.
- **Nome do cookie:** `muno_s`. Constante única em `src/lib/funil/cookie.ts`, importada pelo proxy e pelas rotas.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/funil/cookie.ts` | O nome e os atributos do cookie, em um lugar só |
| `src/lib/funil/estagio.ts` | Puro: em que ponto do funil um lead ou uma sessão está |
| `src/lib/funil/resumo.ts` | Puro: normalizar origem e agrupar eventos por dia, tipo e origem |
| `src/lib/funil/registrar.ts` | O único ponto que escreve `EventoFunil`, e que nunca lança |
| `src/app/api/funil/evento/route.ts` | Ingestão pública dos eventos do navegador |
| `prisma/migrations/<ts>_funil_instrumentado/` | Tabelas e colunas novas (gerada pelo Prisma) |
| `prisma/migrations/<ts>_rls_no_funil/` | RLS nas três tabelas novas (escrita à mão) |

**Modificar:**

| Arquivo | O que muda |
|---|---|
| `prisma/schema.prisma` | 3 modelos, 1 enum, 2 colunas |
| `src/proxy.ts` | planta o cookie no raiz; libera `/api/funil/evento` do pipeline de tenant |
| `src/proxy.test.ts` | as asserções do cookie e da guarda |
| `public/vendas/js/main.js` | emite `VISITA`, `VIU_PRECO`, `CLICOU_ASSINAR`, `ABRIU_WHATSAPP` |
| `public/vendas/index.html` | aviso de privacidade no rodapé |
| `src/app/api/assinar/route.ts` | grava `sessaoId` na `Inscricao` e no `Lead`, emite `CHECKOUT_CRIADO` |
| `src/components/assinar/FormularioAssinatura.tsx` | emite `CHECKOUT_PASSO` |
| `src/app/api/assinaturas/webhook/asaas/route.ts` | emite `PAGOU` |
| `src/lib/assinatura/provisionamento.ts` | emite `PROVISIONADO` dentro da transação |
| `src/app/api/cron/assinaturas/route.ts` | `ABANDONOU` + lead `PERDIDO`; resumo e expurgo dos 90 dias |

---

### Task 1: Schema, migração e RLS

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_rls_no_funil/migration.sql`
- Create: `src/lib/funil/modelos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: os modelos `SessaoFunil`, `EventoFunil`, `ResumoDiario`, o enum `TipoEvento` com os valores `VISITA | VIU_PRECO | CLICOU_ASSINAR | ABRIU_WHATSAPP | CHECKOUT_PASSO | CHECKOUT_CRIADO | PAGOU | PROVISIONADO | ABANDONOU`, e os campos `Lead.sessaoId` e `Inscricao.sessaoId`, ambos `String?`.

- [ ] **Step 1: Write the failing test**

Este teste lê o `schema.prisma` como texto, no mesmo espírito do teste de `tenant-removal` que já lê o schema para conferir a ordem de exclusão. Ele existe para uma pergunta só: tabela nova de plataforma nasceu com RLS e ficou fora do escopo de tenant?

Create `src/lib/funil/modelos.test.ts`:

```ts
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
    expect(TENANT_SCOPED_MODELS).not.toContain(nome);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/funil/modelos.test.ts`
Expected: FAIL. Os `it.each` de existência falham com string vazia, porque nenhum dos três modelos existe ainda.

- [ ] **Step 3: Add the models to the schema**

Modify `prisma/schema.prisma`. Coloque o bloco logo depois de `model LeadNote`, que é onde o vizinho temático já está:

```prisma
// Como uma pessoa chegou até aqui, antes de ela ser alguém.
//
// O id é o valor do cookie muno_s, plantado pelo proxy no host raiz. Sem
// @default: quem gera é o proxy, e uma sessão com id inventado pelo banco não
// casaria com cookie nenhum.
//
// Registro de plataforma, como Lead e Inscricao: sem tenantId, lido por
// prismaUnscoped, fora de tenant-scoped-models.ts, com RLS sem policy.
model SessaoFunil {
  id          String        @id
  utmSource   String?
  utmMedium   String?
  utmCampaign String?
  // Só o host de origem, nunca a URL inteira: o caminho de onde a pessoa veio
  // pode conter dado dela, e para saber "veio do Instagram" o host basta.
  referrer    String?
  dispositivo String?
  eventos     EventoFunil[]
  leads       Lead[]
  inscricoes  Inscricao[]
  createdAt   DateTime      @default(now())

  @@index([createdAt])
}

enum TipoEvento {
  VISITA
  VIU_PRECO
  CLICOU_ASSINAR
  ABRIU_WHATSAPP
  CHECKOUT_PASSO
  CHECKOUT_CRIADO
  PAGOU
  PROVISIONADO
  ABANDONOU
}

model EventoFunil {
  id        String       @id @default(cuid())
  // Nulável porque evento de servidor pode chegar sem sessão: quem comprou de
  // um navegador que bloqueia cookie não tem sessaoId, e o evento ainda vale
  // como contagem.
  sessaoId  String?
  sessao    SessaoFunil? @relation(fields: [sessaoId], references: [id])
  tipo      TipoEvento
  detalhe   String?
  createdAt DateTime     @default(now())

  @@index([createdAt])
  @@index([sessaoId])
  @@index([tipo, createdAt])
}

// O que sobra depois do expurgo dos 90 dias, e o que sustenta a série
// histórica. A chave composta é o que torna o resumo idempotente: o cron
// rodando duas vezes no mesmo dia soma no lugar de duplicar.
model ResumoDiario {
  dia    DateTime   @db.Date
  tipo   TipoEvento
  origem String
  n      Int

  @@id([dia, tipo, origem])
}
```

Em `model Lead`, logo antes de `notas`:

```prisma
  // NÃO é @unique, ao contrário de tenantId: a mesma sessão pode gerar o lead
  // de WhatsApp e o de checkout, e uma constraint aqui derrubaria o segundo
  // create no meio de uma compra que já virou cobrança.
  sessaoId    String?
  sessao      SessaoFunil? @relation(fields: [sessaoId], references: [id])
```

e no bloco de índices do `Lead`, junto de `@@index([status])`:

```prisma
  @@index([sessaoId])
```

Em `model Inscricao`, logo antes de `tenantId`:

```prisma
  sessaoId            String?
  sessao              SessaoFunil?    @relation(fields: [sessaoId], references: [id])
```

e junto de `@@index([status])`:

```prisma
  @@index([sessaoId])
```

- [ ] **Step 4: Generate the migration**

```bash
docker compose up -d
npm run db:migrate -- --name funil_instrumentado
```

Expected: uma pasta nova em `prisma/migrations/` e `prisma generate` rodando no fim. Se `guard-local-db.js` abortar, o `DATABASE_URL` está apontando para fora de localhost: confira `.env.local`, que só deveria ter `BLOB_READ_WRITE_TOKEN` e `VERCEL_OIDC_TOKEN`.

- [ ] **Step 5: Write the RLS migration by hand**

Uma segunda pasta, e não uma edição da anterior: mexer numa migração já aplicada quebra o checksum que o Prisma guarda e a próxima `migrate dev` acusa drift.

Create `prisma/migrations/20260830190000_rls_no_funil/migration.sql`:

```sql
-- RLS nas três tabelas do funil, sem policy nenhuma.
--
-- Mesma razão de 20260810200000_rls_nas_tabelas_de_plataforma: `anon` e
-- `authenticated` recebem SELECT, INSERT, UPDATE, DELETE e TRUNCATE em todo o
-- schema public por padrão do Supabase, e a API REST responde com a
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, que vai no bundle do navegador de todo
-- cardápio. Tabela nova sem RLS nasce aberta para a internet, com escrita.
--
-- Sem policy é o certo aqui, e não uma omissão: não há tenantId por onde
-- escopar, e sem policy permissiva quem não tem BYPASSRLS não enxerga linha
-- alguma. A aplicação conecta como `postgres`, que tem BYPASSRLS, e nada muda
-- para ela.
--
-- O que estas tabelas guardam é justamente o que não pode vazar nem ser
-- escrito de fora: quanto tráfego a Muno tem, de onde ele vem, e quanto dele
-- vira cliente.

ALTER TABLE "SessaoFunil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventoFunil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResumoDiario" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 6: Apply it and run the tests**

```bash
npm run db:migrate
npm test -- src/lib/funil/modelos.test.ts src/lib/tenant-removal.test.ts src/lib/tenant-scoped-models.test.ts
```

Expected: PASS nos três arquivos. O de `tenant-removal` passa sem alteração porque nenhum modelo novo tem `tenantId`; se ele falhar, algum modelo ganhou `tenantId` por engano.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/funil/modelos.test.ts
git commit -m "O funil ganha tabelas: sessão, evento e resumo, com RLS"
```

---

### Task 2: A biblioteca pura do funil

**Files:**
- Create: `src/lib/funil/cookie.ts`
- Create: `src/lib/funil/estagio.ts`
- Create: `src/lib/funil/estagio.test.ts`
- Create: `src/lib/funil/resumo.ts`
- Create: `src/lib/funil/resumo.test.ts`

**Interfaces:**
- Consumes: o enum `TipoEvento` da Task 1.
- Produces:
  - `COOKIE_SESSAO = "muno_s"`, `MAX_AGE_SESSAO = 31536000`
  - `type Estagio = "VISITANTE" | "IDENTIFICOU" | "CHECKOUT" | "PAGOU" | "CLIENTE" | "ABANDONOU" | "PERDIDO"`
  - `estagioDoLead(lead: LeadDoFunil, eventos: EventoDoFunil[]): Estagio`
  - `estagioDaSessao(lead: LeadDoFunil | null, eventos: EventoDoFunil[]): Estagio`
  - `podeMoverAMao(lead: { origem: string }): boolean`
  - `normalizarOrigem(utmSource: string | null | undefined): string`
  - `resumir(eventos: EventoParaResumo[]): LinhaDeResumo[]`
  - `type LeadDoFunil = { origem: string; status: string; tenantId: string | null }`
  - `type EventoDoFunil = { tipo: TipoEvento }`
  - `type EventoParaResumo = { tipo: TipoEvento; createdAt: Date; origem: string | null }`
  - `type LinhaDeResumo = { dia: Date; tipo: TipoEvento; origem: string; n: number }`

- [ ] **Step 1: Write the cookie constants**

Não tem teste próprio: é uma constante compartilhada, e o que a prova é o teste do proxy na Task 3. Existe como arquivo para que proxy e rota não escrevam a string duas vezes.

Create `src/lib/funil/cookie.ts`:

```ts
/**
 * O cookie da sessão anônima do funil.
 *
 * Sem atributo Domain, de propósito. Em `.munoapp.com.br` ele seria enviado em
 * toda requisição de todo cardápio de todo restaurante, engordando o header de
 * páginas que não têm nada a ver com o funil. Host-only, ele fica no apex, que
 * é onde a landing e o checkout vivem.
 *
 * HttpOnly porque o JavaScript nunca precisa ler o valor: a rota de ingestão é
 * same-origin e o navegador manda o cookie sozinho no fetch.
 */
export const COOKIE_SESSAO = "muno_s";

/** Um ano. Sessão curta transformaria visitante recorrente em vários. */
export const MAX_AGE_SESSAO = 60 * 60 * 24 * 365;
```

- [ ] **Step 2: Write the failing test for estagio**

Create `src/lib/funil/estagio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estagioDaSessao, estagioDoLead, podeMoverAMao } from "./estagio";

const leadDeCheckout = { origem: "checkout", status: "NEGOCIACAO", tenantId: null };
const leadDaLanding = { origem: "landing", status: "NOVO", tenantId: null };

describe("estagioDoLead", () => {
  it("é CLIENTE quando existe tenant, não importa o resto", () => {
    expect(
      estagioDoLead(
        { ...leadDeCheckout, tenantId: "t1", status: "NOVO" },
        [{ tipo: "ABANDONOU" }]
      )
    ).toBe("CLIENTE");
  });

  it("é ABANDONOU quando o checkout expirou sem pagamento", () => {
    expect(
      estagioDoLead(leadDeCheckout, [
        { tipo: "CHECKOUT_CRIADO" },
        { tipo: "ABANDONOU" },
      ])
    ).toBe("ABANDONOU");
  });

  it("é PAGOU quando pagou e o restaurante ainda não nasceu", () => {
    expect(
      estagioDoLead(leadDeCheckout, [{ tipo: "CHECKOUT_CRIADO" }, { tipo: "PAGOU" }])
    ).toBe("PAGOU");
  });

  it("é CHECKOUT com a inscrição criada e nenhum pagamento", () => {
    expect(estagioDoLead(leadDeCheckout, [{ tipo: "CHECKOUT_CRIADO" }])).toBe(
      "CHECKOUT"
    );
  });

  // A ordem em que os eventos chegam não pode mandar no estágio: o webhook do
  // Asaas reentrega, e um PAGOU pode ser gravado depois de um CHECKOUT_PASSO
  // que ficou na fila do navegador.
  it("não depende da ordem dos eventos", () => {
    expect(
      estagioDoLead(leadDeCheckout, [
        { tipo: "PAGOU" },
        { tipo: "CHECKOUT_PASSO" },
        { tipo: "CHECKOUT_CRIADO" },
      ])
    ).toBe("PAGOU");
  });

  // Lead sem evento nenhum ainda é alguém que se identificou: o piso do lead é
  // IDENTIFICOU, nunca VISITANTE. Quem bloqueia cookie cai exatamente aqui.
  it("é IDENTIFICOU para lead sem evento", () => {
    expect(estagioDoLead(leadDaLanding, [])).toBe("IDENTIFICOU");
  });

  it("é PERDIDO quando você marcou perdido à mão", () => {
    expect(
      estagioDoLead({ ...leadDaLanding, status: "PERDIDO" }, [])
    ).toBe("PERDIDO");
  });

  // ABANDONOU vence PERDIDO porque diz mais: os dois são perda, e só um
  // informa a causa.
  it("prefere ABANDONOU a PERDIDO quando os dois valem", () => {
    expect(
      estagioDoLead({ ...leadDeCheckout, status: "PERDIDO" }, [
        { tipo: "ABANDONOU" },
      ])
    ).toBe("ABANDONOU");
  });
});

describe("estagioDaSessao", () => {
  it("é VISITANTE quando a sessão nunca virou lead", () => {
    expect(estagioDaSessao(null, [{ tipo: "VISITA" }, { tipo: "VIU_PRECO" }])).toBe(
      "VISITANTE"
    );
  });

  it("delega para o lead assim que ele existe", () => {
    expect(
      estagioDaSessao(leadDeCheckout, [{ tipo: "VISITA" }, { tipo: "CHECKOUT_CRIADO" }])
    ).toBe("CHECKOUT");
  });
});

describe("podeMoverAMao", () => {
  // O funil de checkout é automático de ponta a ponta. Um botão que sobrescreve
  // o que o servidor derivou só cria divergência entre a tela e o que aconteceu.
  it("é falso para o lead de checkout", () => {
    expect(podeMoverAMao({ origem: "checkout" })).toBe(false);
  });

  // Nenhum evento captura "ela pediu para eu voltar em janeiro".
  it.each(["landing", "manual"])("é verdadeiro para origem %s", (origem) => {
    expect(podeMoverAMao({ origem })).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/funil/estagio.test.ts`
Expected: FAIL com "Failed to resolve import ./estagio".

- [ ] **Step 4: Implement estagio.ts**

Create `src/lib/funil/estagio.ts`:

```ts
import type { TipoEvento } from "@prisma/client";

/**
 * Em que ponto do funil alguém está, decidido pelo que aconteceu de verdade.
 *
 * Puro, sem Prisma e sem HTTP, como lead-landing.ts e platform-metrics.ts: a
 * consulta busca, esta função decide. É o que torna a regra testável sem banco.
 */
export type Estagio =
  | "VISITANTE"
  | "IDENTIFICOU"
  | "CHECKOUT"
  | "PAGOU"
  | "CLIENTE"
  | "ABANDONOU"
  | "PERDIDO";

export type LeadDoFunil = {
  origem: string;
  status: string;
  tenantId: string | null;
};

export type EventoDoFunil = { tipo: TipoEvento };

/**
 * Precedência, e não ordem cronológica. Os eventos chegam fora de ordem por
 * projeto: o webhook do Asaas reentrega, e o navegador manda com keepalive sem
 * garantia de sequência. Decidir pelo evento mais recente faria o estágio
 * oscilar sozinho.
 */
export function estagioDoLead(
  lead: LeadDoFunil,
  eventos: EventoDoFunil[]
): Estagio {
  const tem = (tipo: TipoEvento) => eventos.some((e) => e.tipo === tipo);

  if (lead.tenantId !== null) return "CLIENTE";
  if (tem("ABANDONOU")) return "ABANDONOU";
  if (tem("PAGOU")) return "PAGOU";
  if (lead.status === "PERDIDO") return "PERDIDO";
  if (tem("CHECKOUT_CRIADO") || tem("CHECKOUT_PASSO")) return "CHECKOUT";

  // O piso de um lead é IDENTIFICOU: a pessoa deixou um contato. VISITANTE é
  // estágio de sessão, e uma sessão que virou lead nunca volta para ele.
  return "IDENTIFICOU";
}

export function estagioDaSessao(
  lead: LeadDoFunil | null,
  eventos: EventoDoFunil[]
): Estagio {
  if (lead === null) return "VISITANTE";
  return estagioDoLead(lead, eventos);
}

/**
 * Se o botão de status aparece na tela do lead.
 *
 * Só para quem você conduz na conversa. O lead de checkout tem o estágio
 * derivado pelo servidor, e mover à mão um funil automático só produz
 * divergência entre a tela e o banco.
 */
export function podeMoverAMao(lead: { origem: string }): boolean {
  return lead.origem !== "checkout";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/lib/funil/estagio.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 6: Write the failing test for resumo**

Create `src/lib/funil/resumo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizarOrigem, resumir } from "./resumo";

describe("normalizarOrigem", () => {
  // Instagram e instagram viram duas linhas de resumo se ninguém normalizar, e
  // o gráfico passa a mostrar a mesma campanha em dois lugares.
  it.each(["Instagram", " instagram ", "INSTAGRAM"])(
    "colapsa %s em instagram",
    (bruto) => {
      expect(normalizarOrigem(bruto)).toBe("instagram");
    }
  );

  it.each([null, undefined, "", "   "])(
    "vira 'direto' quando não há utm (%s)",
    (bruto) => {
      expect(normalizarOrigem(bruto)).toBe("direto");
    }
  );
});

describe("resumir", () => {
  const dia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

  it("agrupa por dia, tipo e origem", () => {
    const linhas = resumir([
      { tipo: "VISITA", createdAt: dia("2026-06-01"), origem: "instagram" },
      { tipo: "VISITA", createdAt: dia("2026-06-01"), origem: "instagram" },
      { tipo: "VISITA", createdAt: dia("2026-06-01"), origem: "google" },
      { tipo: "PAGOU", createdAt: dia("2026-06-02"), origem: "instagram" },
    ]);

    expect(linhas).toHaveLength(3);
    expect(linhas).toContainEqual({
      dia: new Date("2026-06-01T00:00:00.000Z"),
      tipo: "VISITA",
      origem: "instagram",
      n: 2,
    });
  });

  // O evento de servidor não tem sessão, e sem sessão não tem utm. Ele conta
  // como "direto" em vez de sumir: um PAGOU descartado quebraria a soma da
  // conversão contra a mesma série de visitas.
  it("conta evento sem origem como direto", () => {
    const linhas = resumir([
      { tipo: "PAGOU", createdAt: dia("2026-06-01"), origem: null },
    ]);

    expect(linhas).toEqual([
      {
        dia: new Date("2026-06-01T00:00:00.000Z"),
        tipo: "PAGOU",
        origem: "direto",
        n: 1,
      },
    ]);
  });

  it("devolve lista vazia sem evento nenhum", () => {
    expect(resumir([])).toEqual([]);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- src/lib/funil/resumo.test.ts`
Expected: FAIL com "Failed to resolve import ./resumo".

- [ ] **Step 8: Implement resumo.ts**

Create `src/lib/funil/resumo.ts`:

```ts
import type { TipoEvento } from "@prisma/client";

export type EventoParaResumo = {
  tipo: TipoEvento;
  createdAt: Date;
  origem: string | null;
};

export type LinhaDeResumo = {
  dia: Date;
  tipo: TipoEvento;
  origem: string;
  n: number;
};

export const ORIGEM_DIRETA = "direto";

/**
 * A origem como ela vai para o resumo: minúscula, sem espaço nas pontas, e
 * "direto" quando não veio utm nenhum.
 *
 * "direto" e não null porque a chave de ResumoDiario é composta e não aceita
 * nulo, e porque quem chegou digitando o endereço é um canal, não uma ausência.
 */
export function normalizarOrigem(bruto: string | null | undefined): string {
  const limpo = (bruto ?? "").trim().toLowerCase();
  return limpo === "" ? ORIGEM_DIRETA : limpo;
}

/** Meia-noite UTC do dia da data. A coluna é @db.Date e não guarda hora. */
function diaDe(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function resumir(eventos: EventoParaResumo[]): LinhaDeResumo[] {
  const contagem = new Map<string, LinhaDeResumo>();

  for (const evento of eventos) {
    const dia = diaDe(evento.createdAt);
    const origem = normalizarOrigem(evento.origem);
    const chave = `${dia.toISOString()}|${evento.tipo}|${origem}`;

    const linha = contagem.get(chave);
    if (linha) linha.n += 1;
    else contagem.set(chave, { dia, tipo: evento.tipo, origem, n: 1 });
  }

  return [...contagem.values()];
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- src/lib/funil/resumo.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 10: Commit**

```bash
git add src/lib/funil
git commit -m "A regra do funil, pura: estágio derivado e resumo por origem"
```

---

### Task 3: O proxy planta o cookie e libera a rota

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/proxy.test.ts`

**Interfaces:**
- Consumes: `COOKIE_SESSAO` e `MAX_AGE_SESSAO` de `src/lib/funil/cookie.ts`.
- Produces: toda resposta HTML do host raiz sai com `Set-Cookie: muno_s=<uuid>` quando o cookie ainda não veio; `/api/funil/evento` sai do pipeline de tenant.

- [ ] **Step 1: Write the failing tests**

Modify `src/proxy.test.ts`. Dentro do `describe("proxy: o domínio raiz serve a landing, nunca um restaurante")`, depois do teste de `/api/leads/publico`, acrescente:

```ts
  const cookieDe = (res: Response) => res.headers.get("set-cookie") ?? "";

  // A sessão anônima nasce aqui, e só aqui. O proxy gera o id e devolve o
  // cookie; quem grava no banco é a rota de ingestão. Um write no middleware
  // custaria uma ida ao Postgres em toda requisição de todo cardápio.
  it("planta o cookie de sessão na home do raiz", async () => {
    const res = await proxy(requisicaoRaiz("/"));

    expect(cookieDe(res)).toMatch(/muno_s=[0-9a-f-]{36}/);
    expect(cookieDe(res)).toContain("HttpOnly");
    expect(cookieDe(res)).toContain("SameSite=lax");
  });

  // O checkout é o outro lado do mesmo funil e mora no mesmo host. Quem chega
  // de um anúncio direto em /assinar precisa de sessão igual.
  it("planta o cookie em /assinar", async () => {
    const res = await proxy(requisicaoRaiz("/assinar"));

    expect(cookieDe(res)).toMatch(/muno_s=/);
  });

  // Reescrever o valor a cada visita mataria a sessão e transformaria um
  // visitante recorrente em vários, deflacionando toda taxa de conversão.
  it("não reescreve o cookie que já veio na requisição", async () => {
    const req = requisicaoRaiz("/");
    req.headers.set("cookie", "muno_s=ja-existente");

    const res = await proxy(req);

    expect(cookieDe(res)).not.toContain("muno_s=");
  });

  // É por isso que o cookie não tem atributo Domain. Em .munoapp.com.br ele
  // viajaria em toda requisição de todo cardápio de todo restaurante.
  it("não planta cookie nenhum em host de restaurante", async () => {
    const res = await proxy(requisicao("/"));

    expect(cookieDe(res)).not.toContain("muno_s=");
  });

  // Mesma guarda, mesma posição e mesmo motivo de /api/leads/publico: sem ela
  // o raiz responde 404 e o painel fica vazio, com o fetch da landing engolindo
  // o erro de propósito.
  it("POST /api/funil/evento no raiz passa, sem resolver tenant", async () => {
    const res = await proxy(requisicaoRaiz("/api/funil/evento", "POST"));

    expect(res.status).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/proxy.test.ts`
Expected: FAIL nos cinco novos. O de `/api/funil/evento` falha com status 404; os de cookie falham com string vazia.

- [ ] **Step 3: Implement in the proxy**

Modify `src/proxy.ts`.

No topo, junto dos outros imports:

```ts
import { COOKIE_SESSAO, MAX_AGE_SESSAO } from "@/lib/funil/cookie";
```

Depois de `isEstatico`, acrescente o helper:

```ts
/**
 * Planta a sessão anônima do funil, se ela ainda não existe.
 *
 * O proxy gera o id e NÃO fala com o banco. Ele roda em toda requisição de
 * todos os hosts, e um write aqui transformaria cada visita de cardápio numa
 * ida ao Postgres — além de quebrar a garantia que src/proxy.test.ts protege,
 * de que o host raiz não consulta tenant nenhum. Quem grava é
 * /api/funil/evento, e a linha da sessão nasce no primeiro evento que chega.
 *
 * Sem atributo `domain`: host-only, o cookie fica no apex, onde a landing e o
 * checkout vivem, e não viaja para subdomínio de restaurante.
 */
function comSessao(res: NextResponse, req: { cookies: { has(n: string): boolean } }): NextResponse {
  if (req.cookies.has(COOKIE_SESSAO)) return res;

  res.cookies.set(COOKIE_SESSAO, crypto.randomUUID(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SESSAO,
  });
  return res;
}
```

Logo depois da guarda de `/api/leads/publico` (a que responde `NextResponse.next()` para `nextUrl.pathname === "/api/leads/publico"`), acrescente:

```ts
  // Ingestão de evento do funil, pela mesma razão e na mesma posição da guarda
  // acima: sair antes do findUnique. Pelo caminho normal a rota resolveria o
  // slug "default" e morreria junto com o restaurante de demonstração, e no
  // host raiz ela tomaria o 404 do bloco de baixo — em silêncio, porque o
  // fetch da landing engole o erro de propósito.
  if (nextUrl.pathname === "/api/funil/evento") {
    return NextResponse.next();
  }
```

No bloco do checkout público, troque o `return NextResponse.next();` por uma versão que planta o cookie só no raiz:

```ts
  if (
    nextUrl.pathname === "/assinar" ||
    nextUrl.pathname.startsWith("/assinar/") ||
    nextUrl.pathname.startsWith("/api/assinar")
  ) {
    // A condição de host importa: este bloco atende qualquer host, e sem ela o
    // cookie seria plantado também em subdomínio de cliente, que é justamente
    // o que a ausência de `domain` evita.
    return resolvedSlug === null
      ? comSessao(NextResponse.next(), req)
      : NextResponse.next();
  }
```

E no bloco do domínio raiz, o rewrite da home:

```ts
    if (nextUrl.pathname.replace(/\/$/, "") === "") {
      return comSessao(NextResponse.rewrite(urlNoHost(LANDING_DOC)), req);
    }
```

O ramo `isEstatico` e o `404` final ficam intactos: asset não precisa de sessão, e plantar cookie numa resposta 404 só encheria o navegador de quem bateu num caminho que não existe.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/proxy.test.ts`
Expected: PASS no arquivo inteiro, inclusive os testes antigos. O `não resolve tenant nenhum no raiz` continua verde: nada aqui chama o Prisma.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/proxy.test.ts src/lib/funil/cookie.ts
git commit -m "O proxy planta a sessão anônima no raiz, e não fala com o banco"
```

---

### Task 4: A rota de ingestão

**Files:**
- Create: `src/app/api/funil/evento/route.ts`
- Create: `src/app/api/funil/evento/route.test.ts`
- Create: `src/lib/funil/registrar.ts`

**Interfaces:**
- Consumes: `COOKIE_SESSAO`, os modelos da Task 1.
- Produces: `POST /api/funil/evento`; e `registrarEvento(cliente, { sessaoId, tipo, detalhe })` de `src/lib/funil/registrar.ts`, usado pelas tasks 6 e 8, com assinatura
  `registrarEvento(cliente: ClienteDeEvento, dados: { sessaoId: string | null; tipo: TipoEvento; detalhe?: string | null }): Promise<void>`
  onde `ClienteDeEvento = { eventoFunil: { create(args: { data: {...} }): Promise<unknown> } }`, satisfeita tanto por `prismaUnscoped` quanto pelo `tx` de uma transação.

- [ ] **Step 1: Write the emitter**

Sem teste próprio: ele é uma linha de `create` embrulhada num `catch`, e o que o prova são os testes de rota abaixo e os das tasks 6 e 8.

Create `src/lib/funil/registrar.ts`:

```ts
import type { TipoEvento } from "@prisma/client";

/**
 * O único ponto que escreve EventoFunil, e o único que decide que gravar
 * evento nunca derruba o que estava acontecendo.
 *
 * Aceita tanto prismaUnscoped quanto o `tx` de uma transação, porque o
 * PROVISIONADO precisa nascer dentro da transação que cria a assinatura, e o
 * CHECKOUT_CRIADO precisa nascer fora de qualquer uma.
 */
export type ClienteDeEvento = {
  eventoFunil: {
    create(args: {
      data: {
        sessaoId: string | null;
        tipo: TipoEvento;
        detalhe: string | null;
      };
    }): Promise<unknown>;
  };
};

export async function registrarEvento(
  cliente: ClienteDeEvento,
  dados: { sessaoId: string | null; tipo: TipoEvento; detalhe?: string | null }
): Promise<void> {
  try {
    await cliente.eventoFunil.create({
      data: {
        sessaoId: dados.sessaoId,
        tipo: dados.tipo,
        detalhe: dados.detalhe ?? null,
      },
    });
  } catch (erro) {
    // Nunca propaga. Evento é relatório, e o caminho que gera receita não pode
    // depender do que gera relatório: um blip aqui não pode abortar um
    // checkout que já virou cobrança nem uma transação de provisionamento.
    //
    // O log traz o tipo, nunca o detalhe: detalhe pode carregar o que a pessoa
    // escolheu, e log não é lugar de dado de cliente.
    console.error(`[funil] falha ao registrar evento ${dados.tipo}`, erro);
  }
}
```

**Atenção ao usar dentro de `$transaction`:** o `catch` engole o erro, mas o Prisma marca a transação como abortada se o `create` falhar de verdade no banco. Na Task 6 o `PROVISIONADO` entra na transação assumindo esse risco de forma consciente e documentada, porque ali o evento é parte do mesmo fato atômico.

- [ ] **Step 2: Write the failing route test**

Create `src/app/api/funil/evento/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const upsert = vi.fn();
const create = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    sessaoFunil: { upsert: (...a: unknown[]) => upsert(...a) },
    eventoFunil: { create: (...a: unknown[]) => create(...a) },
  },
}));

const ORIGEM = "http://localhost:3000";

function requisicao(corpo: unknown, opcoes: { origem?: string | null; cookie?: string | null } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  const origem = opcoes.origem === undefined ? ORIGEM : opcoes.origem;
  if (origem) headers.set("origin", origem);
  const cookie = opcoes.cookie === undefined ? "muno_s=sessao-1" : opcoes.cookie;
  if (cookie) headers.set("cookie", cookie);

  return new NextRequest(`${ORIGEM}/api/funil/evento`, {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

describe("POST /api/funil/evento", () => {
  beforeEach(() => {
    vi.resetModules();
    upsert.mockReset().mockResolvedValue({ id: "sessao-1" });
    create.mockReset().mockResolvedValue({});
  });

  async function post(...args: Parameters<typeof requisicao>) {
    const { POST } = await import("./route");
    return POST(requisicao(...args));
  }

  it("grava o evento e responde 204", async () => {
    const res = await post({ tipo: "VIU_PRECO" });

    expect(res.status).toBe(204);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessaoId: "sessao-1", tipo: "VIU_PRECO" }),
      })
    );
  });

  // Evento sem sessão não tem para onde ir, e criar sessão a partir do corpo
  // deixaria a tabela aberta para qualquer um inventar id. 204 e não 400: o
  // navegador que bloqueia cookie não fez nada de errado.
  it("sem cookie, não grava nada", async () => {
    const res = await post({ tipo: "VISITA" }, { cookie: null });

    expect(res.status).toBe(204);
    expect(create).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("recusa origem fora da lista", async () => {
    const res = await post({ tipo: "VISITA" }, { origem: "https://invasor.com" });

    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  // O enum é seguro aqui, ao contrário de Lead.plano: emissor e receptor são
  // publicados no mesmo deploy, então um valor novo nunca chega sozinho.
  it("recusa tipo desconhecido", async () => {
    const res = await post({ tipo: "COMPROU_UM_CARRO" });

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  // Atribuição de primeiro toque: o anúncio que trouxe a pessoa é quem pagou
  // pela visita, e uma volta digitando o endereço não pode roubar o crédito.
  it("não sobrescreve o utm de uma sessão que já existe", async () => {
    await post({
      tipo: "VISITA",
      utm: { source: "google" },
      referrer: "google.com",
      dispositivo: "desktop",
    });

    const args = upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({ id: "sessao-1", utmSource: "google" });
    expect(args.update).toEqual({});
  });

  it("corta detalhe longo demais em vez de recusar o evento", async () => {
    await post({ tipo: "CHECKOUT_PASSO", detalhe: "x".repeat(200) });

    const { detalhe } = create.mock.calls[0][0].data;
    expect(detalhe).toHaveLength(60);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/app/api/funil/evento/route.test.ts`
Expected: FAIL com "Failed to resolve import ./route".

- [ ] **Step 4: Implement the route**

Create `src/app/api/funil/evento/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { COOKIE_SESSAO } from "@/lib/funil/cookie";
import { registrarEvento } from "@/lib/funil/registrar";

/**
 * Ingestão dos eventos do funil disparados pelo navegador.
 *
 * Sai do pipeline de tenant por uma guarda em src/proxy.ts, então chega aqui
 * SEM x-tenant-id — daí o prismaUnscoped explícito, como em
 * /api/leads/publico. Funil é dado da plataforma, não de restaurante.
 *
 * Responde 204 em quase tudo, inclusive quando não grava. Quem chama é um
 * fetch com keepalive que descarta a resposta de propósito: devolver corpo
 * seria trabalho para ninguém ler.
 */

// Módulo-escopo de propósito: o estado precisa sobreviver entre requisições da
// mesma instância. Ver a nota sobre o alcance disso em src/lib/rate-limit.ts.
//
// Teto bem mais alto que o de lead (5 em 10 min): uma sessão legítima emite
// vários eventos numa visita só, e uma casa com wi-fi compartilhado emite
// vários por pessoa.
const limitador = criarLimitador({ max: 60, janelaMs: 10 * 60 * 1000 });

const schema = z.object({
  tipo: z.enum([
    "VISITA",
    "VIU_PRECO",
    "CLICOU_ASSINAR",
    "ABRIU_WHATSAPP",
    "CHECKOUT_PASSO",
  ]),
  detalhe: z.string().trim().optional(),
  utm: z
    .object({
      source: z.string().trim().max(80).optional(),
      medium: z.string().trim().max(80).optional(),
      campaign: z.string().trim().max(120).optional(),
    })
    .optional(),
  referrer: z.string().trim().max(120).optional(),
  dispositivo: z.enum(["celular", "desktop"]).optional(),
});

// Os tipos de servidor (CHECKOUT_CRIADO, PAGOU, PROVISIONADO, ABANDONOU) ficam
// FORA do enum acima de propósito: eles nascem de fatos que o servidor conhece,
// e aceitá-los aqui deixaria qualquer um declarar que pagou.

const MAX_DETALHE = 60;

function origensPermitidas(): string[] {
  return (process.env.LANDING_ORIGIN ?? "")
    .split(",")
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada !== "");
}

function origemPermitida(origem: string | null): origem is string {
  if (!origem) return false;
  // Comparação exata por item, nunca prefixo: "munoapp.com.br.attacker.com"
  // começa com uma origem permitida.
  if (origensPermitidas().includes(origem)) return true;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const { hostname } = new URL(origem);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const semConteudo = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  if (!origemPermitida(req.headers.get("origin"))) {
    return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  }

  // A Vercel sobrescreve X-Forwarded-For na borda em vez de acrescentar a ele,
  // então o primeiro valor é o IP público do cliente (mesmo raciocínio de
  // /api/leads/publico).
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return semConteudo();
  }

  const sessaoId = req.cookies.get(COOKIE_SESSAO)?.value;
  // Sem sessão não há o que costurar, e criar uma a partir do corpo deixaria
  // a tabela aberta para qualquer um inventar id. 204 porque o navegador que
  // bloqueia cookie não fez nada de errado: ele some do numerador e do
  // denominador ao mesmo tempo.
  if (!sessaoId) return semConteudo();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { tipo, detalhe, utm, referrer, dispositivo } = parsed.data;

  try {
    // Atribuição de primeiro toque: o `update` é vazio de propósito. A sessão
    // guarda o utm que a criou, e quem chega pelo anúncio, sai e volta
    // digitando o endereço continua creditado ao anúncio, que foi quem pagou
    // pela visita.
    await prismaUnscoped.sessaoFunil.upsert({
      where: { id: sessaoId },
      create: {
        id: sessaoId,
        utmSource: utm?.source ?? null,
        utmMedium: utm?.medium ?? null,
        utmCampaign: utm?.campaign ?? null,
        referrer: referrer ?? null,
        dispositivo: dispositivo ?? null,
      },
      update: {},
    });

    // Trunca em vez de recusar: detalhe é enfeite do evento, e perder o evento
    // inteiro porque a etiqueta ficou comprida seria trocar o dado pelo rótulo.
    await registrarEvento(prismaUnscoped, {
      sessaoId,
      tipo,
      detalhe: detalhe ? detalhe.slice(0, MAX_DETALHE) : null,
    });
  } catch (erro) {
    console.error("[funil/evento] falha ao gravar", erro);
    return semConteudo();
  }

  return semConteudo();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/app/api/funil/evento/route.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/funil src/lib/funil/registrar.ts
git commit -m "A rota que recebe o evento do funil, e a sessão que nasce nela"
```

---

### Task 5: A landing emite os quatro eventos

**Files:**
- Modify: `public/vendas/js/main.js:172-217`
- Modify: `public/vendas/index.html` (rodapé)

**Interfaces:**
- Consumes: `POST /api/funil/evento` da Task 4.
- Produces: `VISITA`, `VIU_PRECO`, `CLICOU_ASSINAR` e `ABRIU_WHATSAPP` saindo do navegador.

Não há teste automatizado aqui: a landing é um documento estático fora do `include` do Vitest (`src/**`), e montar jsdom para um `IntersectionObserver` custaria mais do que a verificação manual do Step 4. A prova é a rota, que já tem teste.

- [ ] **Step 1: Add the emitter to main.js**

Modify `public/vendas/js/main.js`. Logo antes de `const ENDPOINT_LEAD = '/api/leads/publico';`, acrescente:

```js
  /* ── Eventos do funil ─────────────────────────────── */
  // Caminho relativo pelo mesmo motivo do endpoint de lead: a página é
  // servida pelo próprio app desde 26/08/2026, e um endereço absoluto de
  // produção faria a página aberta em localhost gravar no banco dos clientes.
  const ENDPOINT_EVENTO = '/api/funil/evento';

  const params = new URLSearchParams(location.search);
  const utm = {
    source: params.get('utm_source') || undefined,
    medium: params.get('utm_medium') || undefined,
    campaign: params.get('utm_campaign') || undefined,
  };

  // Só o host de quem indicou, nunca a URL inteira: o caminho pode carregar
  // dado de quem navegava, e para saber "veio do Instagram" o host basta.
  let referrer;
  try {
    referrer = document.referrer ? new URL(document.referrer).hostname : undefined;
  } catch (_) {
    referrer = undefined;
  }

  const dispositivo = window.matchMedia('(max-width: 767px)').matches
    ? 'celular'
    : 'desktop';

  // Dispara e esquece. keepalive para sobreviver à aba sendo descarregada,
  // sem await e com catch vazio: se a ingestão estiver fora do ar, a visita
  // não é contada e a venda acontece igual. O caminho que gera receita nunca
  // depende do que gera relatório.
  function evento(tipo, detalhe) {
    try {
      fetch(ENDPOINT_EVENTO, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, detalhe, utm, referrer, dispositivo }),
      }).catch(() => {});
    } catch (_) {
      /* navegador antigo sem fetch: a página segue funcionando */
    }
  }

  evento('VISITA');

  // Rolou até os planos. IntersectionObserver e não scroll listener: o
  // listener dispara dezenas de vezes por segundo numa página que também roda
  // uma cena 3D, e o custo apareceria no celular, que é de onde vem o tráfego.
  const secaoPlanos = document.getElementById('planos');
  if (secaoPlanos && 'IntersectionObserver' in window) {
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        evento('VIU_PRECO');
        observador.disconnect(); // uma vez por visita, não uma por rolagem
      }
    }, { threshold: 0.4 });
    observador.observe(secaoPlanos);
  }

  // Intenção declarada: o clique que leva ao checkout. Delegado no documento
  // para pegar qualquer botão de assinar da página, inclusive os que uma
  // edição futura acrescentar.
  document.addEventListener('click', (e) => {
    const alvo = e.target instanceof Element ? e.target.closest('a[href^="/assinar"]') : null;
    if (alvo) evento('CLICOU_ASSINAR');
  });
```

- [ ] **Step 2: Emit ABRIU_WHATSAPP in the existing submit**

No handler de `submit` do `leadForm`, logo depois do `window.open(...)` e antes do `fetch(ENDPOINT_LEAD, ...)`:

```js
    // O evento e o Lead nascem do mesmo clique, e os dois são gravados. Não é
    // redundância: o lead é a pessoa, o evento é o momento dentro da sessão.
    // Sem ele a jornada perde o degrau entre ver o preço e virar lead.
    evento('ABRIU_WHATSAPP', plan);
```

O `window.open` continua sendo a primeira linha do handler e continua síncrono: depois de um `await` ou `.then()` o Safari do iOS trata a janela como não solicitada e bloqueia, e iPhone é de onde vem o tráfego de Instagram.

- [ ] **Step 3: Confirm the id of the pricing section**

Run: `grep -n 'id="planos"\|id="precos"\|id="pricing"' public/vendas/index.html`
Expected: uma linha. Se o id for outro, ajuste `getElementById` no Step 1 para o id real. Se não houver id nenhum, acrescente `id="planos"` na `<section>` dos planos.

- [ ] **Step 4: Verify by hand**

```bash
docker compose up -d
npm run dev
```

Abra `http://localhost:3000/?utm_source=instagram`, role até os planos, clique em assinar e volte. Depois:

```bash
docker compose exec -T db psql -U postgres -d muno -c \
  'SELECT tipo, detalhe, "createdAt" FROM "EventoFunil" ORDER BY "createdAt";'
docker compose exec -T db psql -U postgres -d muno -c \
  'SELECT id, "utmSource", dispositivo FROM "SessaoFunil";'
```

Expected: `VISITA`, `VIU_PRECO` e `CLICOU_ASSINAR` na primeira consulta, e uma sessão com `utmSource = instagram` na segunda. Se o nome do serviço ou do banco no `docker-compose.yml` for outro, ajuste o comando; o que importa é ver as linhas.

- [ ] **Step 5: Add the privacy line to the footer**

Modify `public/vendas/index.html`, no rodapé, junto dos links que já existem. Sem travessão e sem pop-up: um modal na frente da página de vendas derruba a conversão que este projeto existe para medir.

```html
<p class="text-xs text-gray-400 mt-2">
  Usamos um identificador anônimo para saber de onde vêm as visitas. Nenhum dado
  pessoal, e nada é enviado para terceiros.
</p>
```

- [ ] **Step 6: Commit**

```bash
git add public/vendas/js/main.js public/vendas/index.html
git commit -m "A landing conta quem chegou, de onde veio e até onde rolou"
```

---

### Task 6: Os eventos de servidor

**Files:**
- Modify: `src/app/api/assinar/route.ts:152-190`
- Modify: `src/app/api/assinaturas/webhook/asaas/route.ts:122-130`
- Modify: `src/lib/assinatura/provisionamento.ts:128-225`
- Modify: `src/app/api/assinar/route.test.ts`

**Interfaces:**
- Consumes: `registrarEvento` e `ClienteDeEvento` da Task 4, `COOKIE_SESSAO` da Task 2.
- Produces: `Inscricao.sessaoId` e `Lead.sessaoId` preenchidos no checkout; eventos `CHECKOUT_CRIADO`, `PAGOU` e `PROVISIONADO`.

- [ ] **Step 1: Write the failing test**

Modify `src/app/api/assinar/route.test.ts`. Acrescente ao final, dentro do `describe` que já existe (reaproveite os mocks e helpers do arquivo; o trecho abaixo assume o helper de requisição já presente e o mock de `prismaUnscoped`):

```ts
  // A costura entre navegador e servidor. Sem o sessaoId aqui, o checkout é um
  // evento órfão: dá para contar quantos pagaram e não de onde eles vieram.
  it("grava o sessaoId do cookie na Inscricao e no Lead", async () => {
    const req = requisicaoValida();
    req.headers.set("cookie", "muno_s=sessao-1");

    await POST(req);

    expect(inscricaoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessaoId: "sessao-1" }),
      })
    );
    expect(leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessaoId: "sessao-1" }),
      })
    );
  });

  // Quem bloqueia cookie compra do mesmo jeito. sessaoId nulável é o que
  // impede um bloqueador de anúncios de virar erro 500 no meio da compra.
  it("compra sem cookie nenhum continua funcionando", async () => {
    const res = await POST(requisicaoValida());

    expect(res.status).toBe(201);
    expect(inscricaoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessaoId: null }),
      })
    );
  });
```

Se os nomes `requisicaoValida`, `inscricaoCreate` e `leadCreate` não existirem no arquivo, use os equivalentes que estiverem lá: leia o arquivo antes de escrever, e mantenha o padrão dele.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/assinar/route.test.ts`
Expected: FAIL nos dois novos, com `sessaoId` ausente no objeto recebido.

- [ ] **Step 3: Implement in /api/assinar**

Modify `src/app/api/assinar/route.ts`.

Nos imports:

```ts
import { COOKIE_SESSAO } from "@/lib/funil/cookie";
import { registrarEvento } from "@/lib/funil/registrar";
```

Logo depois da desestruturação de `parsed.data`:

```ts
  // Nulo quando o navegador bloqueia cookie, e isso é aceitável: a compra
  // acontece igual e o cliente aparece como origem desconhecida, que é
  // informação. Um campo obrigatório aqui trocaria receita por relatório.
  const sessaoId = req.cookies.get(COOKIE_SESSAO)?.value ?? null;
```

No `inscricao.create`, acrescente `sessaoId` ao `data`. No `lead.create` que já existe no bloco comentado como "O Lead entra aqui", acrescente `sessaoId` ao `data` e, logo depois do `create`, dentro do mesmo `try`:

```ts
    // Mesma posição do Lead, e pelo mesmo motivo: antes do Asaas e fora do
    // try que fala com o gateway. Se estivesse lá dentro, uma falha ao gravar
    // evento acionaria o catch que apaga a Inscricao, com a cobrança viva do
    // outro lado, e o cliente pagaria por um restaurante que nunca nasce.
    await registrarEvento(prismaUnscoped, {
      sessaoId,
      tipo: "CHECKOUT_CRIADO",
      detalhe: `${plano}/${ciclo}/${metodo}`,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/assinar/route.test.ts`
Expected: PASS no arquivo inteiro.

- [ ] **Step 5: Emit PAGOU in the webhook**

Modify `src/app/api/assinaturas/webhook/asaas/route.ts`. Depois da guarda de idempotência (`if (inscricao.status === "PROVISIONADA") return ok();`) e antes de `await provisionarInscricao(...)`:

```ts
  // O pagamento confirmado, no momento em que ele é conhecido. Fora da
  // transação de provisionamento de propósito: se o provisionamento falhar e o
  // Asaas reentregar, este evento já registrou que o dinheiro entrou, que é
  // exatamente o que você quer enxergar quando o restaurante não nasceu.
  //
  // A guarda de idempotência acima é o que evita um PAGOU por reentrega.
  await registrarEvento(prismaUnscoped, {
    sessaoId: inscricao.sessaoId,
    tipo: "PAGOU",
    detalhe: inscricao.plano,
  });
```

Acrescente `registrarEvento` aos imports e `sessaoId: true` ao `select` do `inscricao.findFirst` (linha 91) se ele for seletivo; se ele traz o registro inteiro, nada a fazer.

- [ ] **Step 6: Emit PROVISIONADO inside the transaction**

Modify `src/lib/assinatura/provisionamento.ts`, dentro do `$transaction`, logo depois do `tx.lead.updateMany` que fecha os outros leads:

```ts
    // Dentro da transação, ao contrário dos outros eventos. Aqui o evento é
    // parte do mesmo fato atômico que a Assinatura, a Cobranca e o status
    // PROVISIONADA: um provisionamento que aconteceu e não aparece no funil
    // seria um cliente sem origem, e a reentrega do Asaas não o traria de
    // volta, porque a idempotência lá em cima já a barra.
    await registrarEvento(tx, {
      sessaoId: inscricao.sessaoId,
      tipo: "PROVISIONADO",
      detalhe: inscricao.plano,
    });
```

E, no `tx.lead.update` que fecha o lead do checkout, acrescente ao `data` nada de novo: o `sessaoId` do lead já foi gravado no checkout.

Acrescente `registrarEvento` aos imports do arquivo.

- [ ] **Step 7: Run the affected suites**

Run: `npm test -- src/lib/assinatura src/app/api/assinaturas src/app/api/assinar`
Expected: PASS. Se algum teste de provisionamento montar um `tx` falso, ele precisa ganhar `eventoFunil: { create: vi.fn() }`; sem isso o `registrarEvento` cai no `catch` e o teste passa mesmo assim, mas com um `console.error` no output que denuncia o mock incompleto.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/assinar src/app/api/assinaturas src/lib/assinatura/provisionamento.ts
git commit -m "O servidor registra o que só ele sabe: checkout, pagamento e restaurante no ar"
```

---

### Task 7: O checkout diz onde a pessoa parou

**Files:**
- Modify: `src/components/assinar/FormularioAssinatura.tsx`

**Interfaces:**
- Consumes: `POST /api/funil/evento` da Task 4.
- Produces: eventos `CHECKOUT_PASSO` com `detalhe` em `endereco | documento | pagamento`.

O formulário é uma tela só, não um assistente: os três "passos" são marcos de progresso dentro do mesmo formulário, cada um disparado uma única vez.

- [ ] **Step 1: Add the emitter**

Modify `src/components/assinar/FormularioAssinatura.tsx`. Depois das declarações de `useState`:

```tsx
  // Uma vez por marco, por montagem. useRef e não useState: registrar um passo
  // não deve provocar render, e um Set em estado re-renderizaria o formulário
  // inteiro no meio da digitação.
  const passosVistos = useRef(new Set<string>());

  function registrarPasso(passo: "endereco" | "documento" | "pagamento") {
    if (passosVistos.current.has(passo)) return;
    passosVistos.current.add(passo);

    // Dispara e esquece, como na landing: nada aqui pode atrasar ou atrapalhar
    // uma compra em andamento.
    fetch("/api/funil/evento", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "CHECKOUT_PASSO", detalhe: passo }),
    }).catch(() => {});
  }
```

Acrescente `useRef` ao import de `react` que já existe na linha 3.

- [ ] **Step 2: Wire the three marks**

- **`endereco`**: em `FormularioAssinatura.tsx:91`, na linha
  `setResultado({ slug, livre: !!body.livre, motivo: body.motivo });`. Logo
  depois dela:

```tsx
        if (body.livre) registrarPasso("endereco");
```

- **`documento`**: no `onBlur` do campo de CPF/CNPJ, condicionado a o valor ser
  válido. O componente já conhece `isValidCpfCnpj` pela rota; importe-o de
  `@/lib/cpf` se ainda não estiver importado:

```tsx
        onBlur={() => {
          if (isValidCpfCnpj(cpfCnpj)) registrarPasso("documento");
        }}
```

- **`pagamento`**: no handler de envio que já existe, como primeira linha, antes
  de qualquer `await`. Antes do `await` de propósito: o evento precisa sair
  mesmo que o envio falhe, porque "chegou no pagamento e a compra não
  completou" é exatamente o caso que este passo existe para revelar.

```tsx
    registrarPasso("pagamento");
```

- [ ] **Step 3: Verify by hand**

Com `npm run dev` rodando, abra `http://localhost:3000/assinar`, preencha o endereço até ele ficar verde, preencha um CPF válido, e clique em assinar (o envio pode falhar por falta de credencial do Asaas em dev; o evento já terá saído).

```bash
docker compose exec -T db psql -U postgres -d muno -c \
  "SELECT tipo, detalhe FROM \"EventoFunil\" WHERE tipo = 'CHECKOUT_PASSO';"
```

Expected: três linhas, `endereco`, `documento` e `pagamento`, sem repetição.

- [ ] **Step 4: Commit**

```bash
git add src/components/assinar/FormularioAssinatura.tsx
git commit -m "O checkout diz em qual campo a venda parou"
```

---

### Task 8: O cron fecha o checkout abandonado

**Files:**
- Modify: `src/app/api/cron/assinaturas/route.ts:179-245`

**Interfaces:**
- Consumes: `registrarEvento` da Task 4.
- Produces: evento `ABANDONOU` e `Lead` fechado como `PERDIDO` para cada inscrição que venceu sem pagamento.

- [ ] **Step 1: Write the failing test**

Modify (ou crie, se não existir) `src/app/api/cron/assinaturas/route.test.ts`. Acrescente:

```ts
  // Hoje a Inscricao vencida é apagada e o Lead fica NEGOCIACAO para sempre,
  // inflando "leads abertos" na visão geral com gente que desistiu meses atrás.
  it("fecha como PERDIDO o lead do checkout que expirou", async () => {
    inscricaoFindMany.mockResolvedValue([
      { id: "i1", slug: "pizzaria", asaasSubscriptionId: null, sessaoId: "s1" },
    ]);

    await executarCron();

    expect(leadUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessaoId: "s1",
          status: { notIn: ["FECHADO", "PERDIDO"] },
          tenantId: null,
        }),
        data: expect.objectContaining({
          status: "PERDIDO",
          motivoPerda: "Checkout expirado sem pagamento",
        }),
      })
    );
    expect(eventoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessaoId: "s1", tipo: "ABANDONOU" }),
      })
    );
  });

  // Um lead que já virou cliente não volta atrás por causa de um relógio, e um
  // que você moveu à mão não é sobrescrito.
  it("não toca em lead já fechado", async () => {
    inscricaoFindMany.mockResolvedValue([
      { id: "i1", slug: "pizzaria", asaasSubscriptionId: null, sessaoId: "s1" },
    ]);

    await executarCron();

    const where = leadUpdateMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ notIn: ["FECHADO", "PERDIDO"] });
    expect(where.tenantId).toBeNull();
  });
```

`src/app/api/cron/assinaturas/route.test.ts` já existe: leia-o antes de escrever e reaproveite os mocks e helpers dele, mantendo os nomes que ele usa. Os mocks de `prismaUnscoped` precisam ganhar `eventoFunil: { create: vi.fn() }` e `lead: { updateMany: vi.fn() }` se ainda não os tiverem, senão o `registrarEvento` cai no `catch` e o teste passa em falso, com um `console.error` no output denunciando o mock incompleto.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/cron/assinaturas/route.test.ts`
Expected: FAIL, `leadUpdateMany` não foi chamado.

- [ ] **Step 3: Implement**

Modify `src/app/api/cron/assinaturas/route.ts`.

No `select` do `inscricao.findMany` das candidatas (linha 186), acrescente `sessaoId: true`.

Depois do `deleteMany` que apaga as inscrições e antes do fechamento do `try`:

```ts
    // O rastro que a exclusão apagaria. A Inscricao precisa morrer para soltar
    // o slug (o @unique é o que segura o endereço), mas o fato de alguém ter
    // chegado até o pagamento e desistido é justamente o degrau onde mais gente
    // cai, e hoje ele se desfaz em silêncio.
    //
    // Em try próprio: fechar lead e registrar evento é relatório, e a mesma
    // regra do bloco inteiro vale aqui, com mais razão ainda. Slug preso por
    // mais 24h é irrelevante; fatura não emitida não é.
    for (const candidata of candidatas.filter((c) => paraApagar.includes(c.id))) {
      await registrarEvento(prismaUnscoped, {
        sessaoId: candidata.sessaoId,
        tipo: "ABANDONOU",
        detalhe: null,
      });

      if (!candidata.sessaoId) continue;

      try {
        // Só o lead daquela sessão, e só se ainda estiver em aberto. FECHADO
        // não volta atrás por causa de um relógio, e PERDIDO já está perdido.
        await prismaUnscoped.lead.updateMany({
          where: {
            sessaoId: candidata.sessaoId,
            tenantId: null,
            status: { notIn: ["FECHADO", "PERDIDO"] },
          },
          data: {
            status: "PERDIDO",
            motivoPerda: "Checkout expirado sem pagamento",
          },
        });
      } catch (erro) {
        console.error(
          `[cron/assinaturas] não foi possível fechar o lead da sessão ${candidata.sessaoId}`,
          erro
        );
      }
    }
```

Acrescente `registrarEvento` aos imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/cron/assinaturas/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/assinaturas
git commit -m "O checkout abandonado deixa de sumir em silêncio"
```

---

### Task 9: O resumo e o expurgo dos 90 dias

**Files:**
- Modify: `src/app/api/cron/assinaturas/route.ts` (final de `executar`)
- Create: `src/lib/funil/expurgo.ts`
- Create: `src/lib/funil/expurgo.test.ts`

**Interfaces:**
- Consumes: `resumir` e `LinhaDeResumo` da Task 2.
- Produces: `DIAS_DE_EVENTO_CRU = 90`, `limiteDoExpurgo(agora: Date): Date`, e `expurgarEventos(prisma: PrismaLike, agora: Date): Promise<{ resumidos: number; apagados: number }>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/funil/expurgo.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { expurgarEventos, limiteDoExpurgo } from "./expurgo";

const AGORA = new Date("2026-08-30T09:00:00.000Z");

describe("limiteDoExpurgo", () => {
  it("é 90 dias antes de agora", () => {
    expect(limiteDoExpurgo(AGORA).toISOString()).toBe("2026-06-01T09:00:00.000Z");
  });
});

function prismaFalso(eventos: unknown[]) {
  const upsert = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: eventos.length });
  const findMany = vi.fn().mockResolvedValue(eventos);

  const tx = {
    eventoFunil: { findMany, deleteMany },
    resumoDiario: { upsert },
    sessaoFunil: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };

  return {
    cliente: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
    upsert,
    deleteMany,
  };
}

describe("expurgarEventos", () => {
  const antigo = {
    tipo: "VISITA",
    createdAt: new Date("2026-05-01T10:00:00.000Z"),
    sessao: { utmSource: "instagram" },
  };

  it("resume antes de apagar", async () => {
    const { cliente, upsert, deleteMany } = prismaFalso([antigo, antigo]);

    const resultado = await expurgarEventos(cliente, AGORA);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      deleteMany.mock.invocationCallOrder[0]
    );
    expect(resultado).toEqual({ resumidos: 1, apagados: 2 });
  });

  // Idempotência: o cron rodando duas vezes no mesmo dia soma no lugar de
  // duplicar, e uma falha no meio não deixa um dia contado pela metade.
  it("soma no resumo que já existe, em vez de sobrescrever", async () => {
    const { cliente, upsert } = prismaFalso([antigo]);

    await expurgarEventos(cliente, AGORA);

    expect(upsert.mock.calls[0][0].update).toEqual({ n: { increment: 1 } });
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      origem: "instagram",
      tipo: "VISITA",
      n: 1,
    });
  });

  it("não faz nada quando não há evento velho", async () => {
    const { cliente, upsert, deleteMany } = prismaFalso([]);

    const resultado = await expurgarEventos(cliente, AGORA);

    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(resultado).toEqual({ resumidos: 0, apagados: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/funil/expurgo.test.ts`
Expected: FAIL com "Failed to resolve import ./expurgo".

- [ ] **Step 3: Implement expurgo.ts**

Create `src/lib/funil/expurgo.ts`:

```ts
import { resumir } from "./resumo";
import type { TipoEvento } from "@prisma/client";

/**
 * O evento cru serve para investigar o mês corrente; a série histórica vive no
 * resumo. Passados 90 dias não dá mais para reconstruir a jornada de uma pessoa
 * específica, só a contagem por dia, tipo e origem. É a troca escolhida contra
 * uma tabela que só cresce.
 */
export const DIAS_DE_EVENTO_CRU = 90;

export function limiteDoExpurgo(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_DE_EVENTO_CRU * 24 * 60 * 60 * 1000);
}

type EventoBruto = {
  tipo: TipoEvento;
  createdAt: Date;
  sessao: { utmSource: string | null } | null;
};

type Transacional = {
  $transaction<T>(fn: (tx: ClienteDoExpurgo) => Promise<T>): Promise<T>;
};

type ClienteDoExpurgo = {
  eventoFunil: {
    findMany(args: unknown): Promise<EventoBruto[]>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  resumoDiario: { upsert(args: unknown): Promise<unknown> };
  sessaoFunil: { deleteMany(args: unknown): Promise<{ count: number }> };
};

/**
 * Resume e então apaga, na mesma transação.
 *
 * A ordem é o ponto: apagar antes de resumir perderia o histórico para sempre,
 * e fazer as duas coisas fora de uma transação abriria a janela em que o dia
 * foi apagado e não foi contado. Uma falha no meio desfaz tudo, e a passada de
 * amanhã refaz.
 */
export async function expurgarEventos(
  cliente: Transacional,
  agora: Date
): Promise<{ resumidos: number; apagados: number }> {
  const limite = limiteDoExpurgo(agora);

  return cliente.$transaction(async (tx) => {
    const antigos = await tx.eventoFunil.findMany({
      where: { createdAt: { lt: limite } },
      select: {
        tipo: true,
        createdAt: true,
        sessao: { select: { utmSource: true } },
      },
    });

    if (antigos.length === 0) return { resumidos: 0, apagados: 0 };

    const linhas = resumir(
      antigos.map((e) => ({
        tipo: e.tipo,
        createdAt: e.createdAt,
        origem: e.sessao?.utmSource ?? null,
      }))
    );

    for (const linha of linhas) {
      // increment, e não set: o cron rodando duas vezes no mesmo dia soma no
      // lugar de duplicar, e um dia parcialmente resumido numa passada
      // anterior é completado, nunca substituído.
      await tx.resumoDiario.upsert({
        where: {
          dia_tipo_origem: {
            dia: linha.dia,
            tipo: linha.tipo,
            origem: linha.origem,
          },
        },
        create: linha,
        update: { n: { increment: linha.n } },
      });
    }

    const { count } = await tx.eventoFunil.deleteMany({
      where: { createdAt: { lt: limite } },
    });

    // Sessão de visitante que nunca voltou não precisa viver para sempre: o
    // que ela representa já está no resumo. Só as que ficaram sem evento, sem
    // lead e sem inscrição — as outras são a costura de alguém que comprou.
    await tx.sessaoFunil.deleteMany({
      where: {
        createdAt: { lt: limite },
        eventos: { none: {} },
        leads: { none: {} },
        inscricoes: { none: {} },
      },
    });

    return { resumidos: linhas.length, apagados: count };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/funil/expurgo.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Wire it into the cron**

Modify `src/app/api/cron/assinaturas/route.ts`. Depois do bloco de limpeza de inscrições e antes de montar `resposta`:

```ts
  // Por último, como a limpeza de slug e pelo mesmo motivo: conveniência não
  // derruba receita. Um erro aqui não pode fazer o job sair sem gerar a fatura
  // de ninguém.
  let funil = { resumidos: 0, apagados: 0 };
  let expurgoDoFunilFalhou = false;
  try {
    funil = await expurgarEventos(prismaUnscoped, agora);
  } catch (erro) {
    expurgoDoFunilFalhou = true;
    console.error(
      "[cron/assinaturas] falha ao resumir e expurgar eventos do funil",
      erro
    );
  }
```

E no objeto `resposta`, junto dos outros contadores:

```ts
    funil,
    ...(expurgoDoFunilFalhou ? { expurgoDoFunilFalhou: true } : {}),
```

Acrescente `expurgarEventos` aos imports.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS em tudo. Rode também `npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/funil/expurgo.ts src/lib/funil/expurgo.test.ts src/app/api/cron/assinaturas/route.ts
git commit -m "Noventa dias de evento cru, e o resumo que sobrevive a eles"
```

---

### Task 10: O botão some do funil automático

**Files:**
- Modify: `src/app/platform/leads/[id]/page.tsx`
- Modify: `src/app/api/platform/leads/[id]/route.ts`
- Modify: `src/app/api/platform/leads/[id]/route.test.ts`

**Interfaces:**
- Consumes: `podeMoverAMao` de `src/lib/funil/estagio.ts` (Task 2).
- Produces: a tela do lead de checkout sem os botões de status, e a rota
  recusando a troca manual desse lead.

Esta é a única mudança de tela do plano, e ela está aqui porque é o que dá
sentido à Task 2: sem consumidor, `podeMoverAMao` nasceria código morto. As
telas de conversão continuam sendo a spec B.

- [ ] **Step 1: Write the failing test**

Modify `src/app/api/platform/leads/[id]/route.test.ts`. Leia o arquivo antes e
reaproveite os helpers dele; acrescente:

```ts
  // O funil de checkout é derivado dos fatos. Um PATCH que sobrescreve o que o
  // servidor derivou cria divergência entre a tela e o que aconteceu, e é o
  // tipo de divergência que ninguém percebe: os dois números parecem certos,
  // cada um por conta própria.
  it("recusa mudar à mão o status de um lead de checkout", async () => {
    findUnique.mockResolvedValue({ id: "l1", origem: "checkout" });

    const res = await PATCH(requisicao({ status: "FECHADO" }), {
      params: Promise.resolve({ id: "l1" }),
    });

    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["landing", "manual"])(
    "deixa mudar o status do lead de origem %s",
    async (origem) => {
      findUnique.mockResolvedValue({ id: "l1", origem });

      const res = await PATCH(requisicao({ status: "CONTATADO" }), {
        params: Promise.resolve({ id: "l1" }),
      });

      expect(res.status).toBe(200);
      expect(update).toHaveBeenCalled();
    }
  );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/platform/leads/\[id\]/route.test.ts`
Expected: FAIL no primeiro, com status 200 em vez de 409.

- [ ] **Step 3: Implement in the route**

Modify `src/app/api/platform/leads/[id]/route.ts`. No handler `PATCH`, antes do
`update` e depois de carregar o lead (se o handler ainda não carrega o lead,
acrescente o `findUnique` selecionando `origem`):

```ts
  // A trava fica no servidor, e não só na tela. Botão escondido é conveniência;
  // o que garante que o funil automático não é sobrescrito é isto aqui.
  if (!podeMoverAMao(lead)) {
    return NextResponse.json(
      {
        error:
          "Este lead veio do checkout e o estágio dele é derivado do que aconteceu. Não dá para movê-lo à mão.",
      },
      { status: 409 }
    );
  }
```

Acrescente `import { podeMoverAMao } from "@/lib/funil/estagio";` aos imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/platform/leads/\[id\]/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Hide the buttons**

Modify `src/app/platform/leads/[id]/page.tsx`. Troque o bloco que renderiza
`LeadAcoes` por:

```tsx
      {podeMoverAMao(lead) ? (
        <div className="bg-console-cartao border border-console-linha rounded-2xl p-5">
          <LeadAcoes leadId={lead.id} statusAtual={lead.status} />
        </div>
      ) : (
        <div className="bg-console-cartao border border-console-linha rounded-2xl p-5">
          <p className="text-sm text-neutral-500">
            Este lead veio do checkout. O estágio dele acompanha o que aconteceu
            de verdade, sem passo manual.
          </p>
        </div>
      )}
```

Acrescente `import { podeMoverAMao } from "@/lib/funil/estagio";` aos imports.

O aviso substitui os botões em vez de deixar o espaço vazio: um card sumindo
sem explicação parece bug, e a frase é o que ensina a regra nova para quem abrir
a tela daqui a três meses. Sem travessão, como o resto da cópia.

- [ ] **Step 6: Commit**

```bash
git add src/app/platform/leads src/app/api/platform/leads
git commit -m "O lead de checkout perde o botão de status, na tela e na rota"
```

---

## Verificação final

Antes de considerar a spec entregue:

- [ ] `npm test` verde, incluindo `src/proxy.test.ts`, `src/lib/tenant-removal.test.ts` e `src/lib/tenant-scoped-models.test.ts`, que não deveriam ter mudado
- [ ] `npm run lint` limpo
- [ ] `npm run build` passa (ele roda `prisma generate` e valida o schema)
- [ ] Fluxo manual completo em `localhost:3000`: abrir com `?utm_source=instagram`, rolar até o preço, clicar em assinar, preencher o checkout, e confirmar no banco que `SessaoFunil`, `EventoFunil`, `Lead.sessaoId` e `Inscricao.sessaoId` contam a mesma jornada
- [ ] `.env.local` conferido depois de qualquer comando da Vercel: só `BLOB_READ_WRITE_TOKEN` e `VERCEL_OIDC_TOKEN`
- [ ] As duas migrações commitadas junto do código, porque produção migra sozinha no deploy

## O que este plano não entrega

Nenhuma tela. Ao fim das nove tasks o console continua exatamente como está, e o dado do funil existe, correto, esperando a spec B. É deliberado: assim a verificação deste passo é "o evento certo aparece na hora certa e nenhuma venda depende dele", que dá para provar sem opinião sobre gráfico.
