# Assinatura parte A (a régua) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O sistema passa a saber quem deve, quanto e desde quando, bloqueia o `/adm` de quem está muito atrasado, e nunca derruba o cardápio de ninguém.

**Architecture:** Duas tabelas novas (`Assinatura`, `Cobranca`) substituem `Tenant.valorMensal`/`diaVencimento`. A régua é função pura; um job diário a aplica e persiste o status; o `proxy.ts` só lê o campo. Sem gateway — baixa é manual, e a parte B automatiza depois.

**Tech Stack:** Next.js 16.2.2 (App Router, `src/app`), Prisma 6, Zod 4, Vitest 4, Postgres local via Docker.

**Spec:** `docs/superpowers/specs/2026-08-10-assinatura-a-regua.md`

## Global Constraints

- **O proxy deste projeto é `src/proxy.ts`, não `middleware.ts`.** Next 16 — leia `node_modules/next/dist/docs/01-app/` antes de escrever rota nova.
- **Banco de desenvolvimento é local.** `docker compose up -d` (container `muno-db-dev`, porta 5433). `db:migrate` passa por `scripts/guard-local-db.js` e aborta fora de localhost. **Se a trava disparar, PARE e reporte BLOCKED** — não a contorne.
- **Vitest só varre `src/**/*.test.ts`.**
- **Código, comentários e mensagens de commit em português.** Comentários explicam *por quê*.
- **Toda mensagem de commit termina com** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **`Assinatura` e `Cobranca` NÃO são modelos tenant-scoped.** São relação comercial entre plataforma e restaurante, lidas por `prismaUnscoped`. Não adicione entrada em `src/lib/tenant-scoped-models.ts`, nem policy RLS.
- **Valores fixos do spec:** régua 7 dias (aviso) e 15 dias (bloqueio); `diaVencimento` entre 1 e 28; competência no formato `"YYYY-MM"`; status `ATIVA | INADIMPLENTE | BLOQUEADA | CANCELADA` e `PENDENTE | PAGA | VENCIDA | CANCELADA`.
- **A regra que não pode ser quebrada:** inadimplência nunca alcança storefront, `/dashboard` (cozinha) ou `/mesa`. Só `/adm`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/assinatura/regua.ts` | dias de atraso → status. Pura, relógio injetado |
| `src/lib/assinatura/competencia.ts` | competência `"YYYY-MM"` e data de vencimento. Pura |
| `prisma/schema.prisma` + migração | `Assinatura`, `Cobranca`, enums; backfill; drop das colunas do `Tenant` |
| `src/lib/platform-metrics.ts` | `calcularMrr` passa a somar assinatura não cancelada |
| `src/app/api/cron/assinaturas/route.ts` | job diário: gera cobrança, move status |
| `src/proxy.ts` | bloqueio do `/adm` |
| `src/proxy.test.ts` | primeiro teste do proxy — a garantia de que storefront não cai |
| `src/app/adm/assinatura/page.tsx` | tela do restaurante |
| `src/app/platform/clientes/page.tsx` | situação e baixa manual |

---

### Task 1: A régua

**Files:**
- Create: `src/lib/assinatura/regua.ts`
- Test: `src/lib/assinatura/regua.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `AVISO_DIAS = 7`, `BLOQUEIO_DIAS = 15`
  - `type StatusAssinatura = "ATIVA" | "INADIMPLENTE" | "BLOQUEADA" | "CANCELADA"`
  - `diasDeAtraso(vencimento: Date, agora: Date): number`
  - `statusPelaRegua(vencimentoMaisAntigo: Date | null, agora: Date): StatusAssinatura`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { diasDeAtraso, statusPelaRegua } from "./regua";

const HOJE = new Date("2026-08-20T12:00:00Z");
function diasAtras(n: number): Date {
  return new Date(HOJE.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("diasDeAtraso", () => {
  it("conta dias inteiros, ignorando a hora", () => {
    // Vencimento às 23h de ontem e agora meio-dia de hoje é 1 dia de atraso,
    // não 0,5. Cobrança se conta em dias de calendário, não em frações.
    expect(diasDeAtraso(new Date("2026-08-19T23:00:00Z"), HOJE)).toBe(1);
  });

  it("é zero no próprio dia do vencimento", () => {
    expect(diasDeAtraso(new Date("2026-08-20T01:00:00Z"), HOJE)).toBe(0);
  });

  it("é negativo antes de vencer", () => {
    expect(diasDeAtraso(new Date("2026-08-25T12:00:00Z"), HOJE)).toBe(-5);
  });
});

describe("statusPelaRegua", () => {
  it("sem cobrança vencida, fica ATIVA", () => {
    expect(statusPelaRegua(null, HOJE)).toBe("ATIVA");
  });

  it.each([0, 1, 6])("atraso de %i dias ainda é ATIVA", (dias) => {
    // Atraso curto não marca o cadastro — a tela avisa, o status não muda.
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("ATIVA");
  });

  it.each([7, 8, 14])("atraso de %i dias é INADIMPLENTE", (dias) => {
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("INADIMPLENTE");
  });

  it.each([15, 30, 365])("atraso de %i dias é BLOQUEADA", (dias) => {
    expect(statusPelaRegua(diasAtras(dias), HOJE)).toBe("BLOQUEADA");
  });

  it("as bordas caem do lado certo", () => {
    // 6 -> 7 e 14 -> 15 são onde o comportamento muda. Um erro de <= aqui
    // bloqueia um restaurante um dia antes do combinado.
    expect(statusPelaRegua(diasAtras(6), HOJE)).toBe("ATIVA");
    expect(statusPelaRegua(diasAtras(7), HOJE)).toBe("INADIMPLENTE");
    expect(statusPelaRegua(diasAtras(14), HOJE)).toBe("INADIMPLENTE");
    expect(statusPelaRegua(diasAtras(15), HOJE)).toBe("BLOQUEADA");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/assinatura/regua.test.ts`
Expected: FAIL — não resolve `./regua`.

- [ ] **Step 3: Implementar**

```ts
/**
 * A régua de inadimplência.
 *
 * Nunca decide sobre storefront: o pior que este arquivo produz é BLOQUEADA,
 * e quem interpreta isso (src/proxy.ts) só olha rotas /adm. Bloquear gestão é
 * pressão; derrubar o cardápio em horário de pico transfere o prejuízo para o
 * cliente do cliente, e basta um pagamento não conciliado para isso acontecer
 * por engano.
 *
 * O relógio é parâmetro, não Date.now() interno, para o teste não depender do
 * dia em que roda.
 */

export const AVISO_DIAS = 7;
export const BLOQUEIO_DIAS = 15;

export type StatusAssinatura =
  | "ATIVA"
  | "INADIMPLENTE"
  | "BLOQUEADA"
  | "CANCELADA";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dias inteiros de atraso, comparando datas de calendário em UTC. Comparar
 * timestamps daria 0 para um vencimento de ontem às 23h visto hoje ao
 * meio-dia — meio dia de diferença, um dia de atraso.
 */
export function diasDeAtraso(vencimento: Date, agora: Date): number {
  const diaDoVencimento = Date.UTC(
    vencimento.getUTCFullYear(),
    vencimento.getUTCMonth(),
    vencimento.getUTCDate()
  );
  const diaDeHoje = Date.UTC(
    agora.getUTCFullYear(),
    agora.getUTCMonth(),
    agora.getUTCDate()
  );
  return Math.round((diaDeHoje - diaDoVencimento) / UM_DIA_MS);
}

export function statusPelaRegua(
  vencimentoMaisAntigo: Date | null,
  agora: Date
): StatusAssinatura {
  if (!vencimentoMaisAntigo) return "ATIVA";

  const atraso = diasDeAtraso(vencimentoMaisAntigo, agora);
  if (atraso >= BLOQUEIO_DIAS) return "BLOQUEADA";
  if (atraso >= AVISO_DIAS) return "INADIMPLENTE";
  return "ATIVA";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/assinatura/regua.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assinatura/regua.ts src/lib/assinatura/regua.test.ts
git commit -m "$(cat <<'EOF'
Cria a régua de inadimplência da assinatura

Sete dias de atraso viram aviso, quinze viram bloqueio. Os seis primeiros
dias não mexem no status de propósito: atraso curto não merece marca no
cadastro, e a tela avisa sem que o cadastro mude.

O pior que este arquivo produz é BLOQUEADA, que só o /adm interpreta.
Cardápio, cozinha e mesa não têm como cair por inadimplência.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Competência e vencimento

**Files:**
- Create: `src/lib/assinatura/competencia.ts`
- Test: `src/lib/assinatura/competencia.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `DIA_VENCIMENTO_MAX = 28`
  - `competenciaDe(data: Date): string` — `"2026-08"`
  - `vencimentoDaCompetencia(competencia: string, diaVencimento: number): Date`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import {
  DIA_VENCIMENTO_MAX,
  competenciaDe,
  vencimentoDaCompetencia,
} from "./competencia";

describe("competenciaDe", () => {
  it("formata como YYYY-MM com mês de dois dígitos", () => {
    expect(competenciaDe(new Date("2026-08-20T12:00:00Z"))).toBe("2026-08");
    expect(competenciaDe(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(competenciaDe(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("é estável dentro do mesmo mês", () => {
    // É esta propriedade que o @@unique(assinaturaId, competencia) usa para
    // impedir cobrança duplicada quando o job roda duas vezes no mesmo mês.
    const inicio = competenciaDe(new Date("2026-08-01T00:00:00Z"));
    const fim = competenciaDe(new Date("2026-08-31T23:59:59Z"));
    expect(inicio).toBe(fim);
  });
});

describe("vencimentoDaCompetencia", () => {
  it("monta a data no dia contratado", () => {
    expect(vencimentoDaCompetencia("2026-08", 10).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z"
    );
  });

  it("funciona em fevereiro no teto de 28", () => {
    // O teto de 28 (validado na API desde antes deste projeto) é o que torna
    // desnecessária qualquer regra de fim de mês: não existe mês sem dia 28.
    expect(vencimentoDaCompetencia("2026-02", 28).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    );
  });

  it("recusa dia acima do teto", () => {
    expect(() => vencimentoDaCompetencia("2026-02", 31)).toThrow();
    expect(DIA_VENCIMENTO_MAX).toBe(28);
  });

  it("recusa competência malformada", () => {
    expect(() => vencimentoDaCompetencia("2026/08", 10)).toThrow();
    expect(() => vencimentoDaCompetencia("agosto", 10)).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/assinatura/competencia.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * Competência é o mês de referência da cobrança, no formato "YYYY-MM".
 *
 * Ela existe para ser chave de idempotência: com
 * @@unique([assinaturaId, competencia]), o job diário pode rodar dez vezes no
 * mesmo mês e gerar uma cobrança só. A garantia é do banco, não do código que
 * chama — job roda duas vezes é quando, não se.
 */

/**
 * Vencimento nunca passa do dia 28, teto que a API de cliente já valida desde
 * antes deste projeto. É o que dispensa regra de fim de mês: não existe mês
 * sem dia 28, então nenhum vencimento cai em data inexistente. Custa não
 * poder vencer dia 30; elimina uma classe inteira de bug num número que vira
 * fatura.
 */
export const DIA_VENCIMENTO_MAX = 28;

const FORMATO = /^(\d{4})-(\d{2})$/;

export function competenciaDe(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

export function vencimentoDaCompetencia(
  competencia: string,
  diaVencimento: number
): Date {
  const casa = FORMATO.exec(competencia);
  if (!casa) {
    throw new Error(`Competência inválida: "${competencia}". Use "YYYY-MM".`);
  }
  if (
    !Number.isInteger(diaVencimento) ||
    diaVencimento < 1 ||
    diaVencimento > DIA_VENCIMENTO_MAX
  ) {
    throw new Error(
      `Dia de vencimento inválido: ${diaVencimento}. Use de 1 a ${DIA_VENCIMENTO_MAX}.`
    );
  }

  const [, ano, mes] = casa;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, diaVencimento));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/assinatura/competencia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assinatura/competencia.ts src/lib/assinatura/competencia.test.ts
git commit -m "$(cat <<'EOF'
Dá à cobrança uma competência que serve de chave de idempotência

O job diário vai rodar duas vezes um dia — é quando, não se. Competência
estável dentro do mês, combinada com um unique no banco, faz a segunda
execução não gerar cobrança nenhuma.

O teto de 28 no vencimento não é limitação nova: a API de cliente já validava
assim. Mantê-lo dispensa regra de fim de mês inteira, porque não existe mês
sem dia 28.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Modelo, migração e os sete consumidores

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_assinatura_e_cobranca/migration.sql` (editada à mão — ver Step 4)
- Modify: `src/lib/platform-metrics.ts`, `src/app/platform/page.tsx`, `src/app/platform/clientes/page.tsx`, `src/app/api/platform/clientes/[id]/route.ts`, `src/app/api/platform/leads/[id]/converter/route.ts`, `src/components/platform/MensalidadeInline.tsx`, `src/components/platform/ConverterLead.tsx`
- Test: `src/lib/platform-metrics.test.ts` (já existe — atualizar)

**Interfaces:**
- Consumes: `DIA_VENCIMENTO_MAX` (Task 2).
- Produces: models `Assinatura` e `Cobranca`; `calcularMrr` passa a receber assinaturas.

**Esta é a maior tarefa do plano e a única destrutiva.** Migração e refactor são inseparáveis: separados, existe um commit em que o projeto não compila.

- [ ] **Step 1: Subir o banco e conferir o estado**

```bash
docker compose up -d
npx prisma migrate status
```

Expected: "Database schema is up to date!". Se houver migração pendente, pare e reporte.

- [ ] **Step 2: Adicionar os models ao schema**

Em `prisma/schema.prisma`, adicione os enums junto dos outros e os models ao fim, e **remova** `valorMensal` e `diaVencimento` do model `Tenant` (junto do comentário deles), acrescentando a relação:

```prisma
enum AssinaturaStatus { ATIVA INADIMPLENTE BLOQUEADA CANCELADA }
enum CobrancaStatus   { PENDENTE PAGA VENCIDA CANCELADA }

// Relação comercial entre a plataforma e o restaurante. Não é modelo
// tenant-scoped: quem lê é a plataforma, sempre por prismaUnscoped, como o Lead.
model Assinatura {
  id             String           @id @default(cuid())
  tenantId       String           @unique
  tenant         Tenant           @relation(fields: [tenantId], references: [id])
  valorMensal    Decimal          @db.Decimal(10, 2)
  diaVencimento  Int
  // Primeiro vencimento. Durante a cortesia a assinatura existe e não cobra.
  inicioCobranca DateTime
  status         AssinaturaStatus @default(ATIVA)
  cobrancas      Cobranca[]
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
}

model Cobranca {
  id           String         @id @default(cuid())
  assinaturaId String
  assinatura   Assinatura     @relation(fields: [assinaturaId], references: [id])
  competencia  String
  valor        Decimal        @db.Decimal(10, 2)
  vencimento   DateTime
  status       CobrancaStatus @default(PENDENTE)
  pagoEm       DateTime?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  // A idempotência do job diário mora aqui, no banco, e não no código que
  // chama: rodar duas vezes no mesmo mês não gera duas cobranças.
  @@unique([assinaturaId, competencia])
  @@index([status, vencimento])
}
```

No model `Tenant`, adicione `assinatura Assinatura?` junto das outras relações.

- [ ] **Step 3: Gerar a migração**

```bash
npm run db:migrate -- --name assinatura_e_cobranca
```

- [ ] **Step 4: Editar a migração para fazer backfill antes do DROP**

O Prisma gera `CREATE TABLE` e `ALTER TABLE "Tenant" DROP COLUMN` — **sem** o backfill. Abra o `migration.sql` gerado e insira o backfill **entre** a criação das tabelas e os `DROP COLUMN`:

```sql
-- Backfill: todo tenant que já tinha mensalidade contratada vira assinatura.
-- Roda ANTES do DROP e na mesma transação: se falhar, nada cai.
-- inicioCobranca recebe o próximo vencimento a partir de hoje — quem já é
-- cliente não ganha cortesia retroativa.
INSERT INTO "Assinatura" (id, "tenantId", "valorMensal", "diaVencimento", "inicioCobranca", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t.id,
  t."valorMensal",
  COALESCE(t."diaVencimento", 10),
  date_trunc('month', now()) + (COALESCE(t."diaVencimento", 10) - 1) * interval '1 day',
  'ATIVA',
  now(),
  now()
FROM "Tenant" t
WHERE t."valorMensal" IS NOT NULL;
```

**Confira que os `DROP COLUMN` vêm depois do INSERT no arquivo.** Se o Prisma os colocou antes, mova o INSERT para cima deles.

- [ ] **Step 5: Aplicar e conferir o backfill**

```bash
npm run db:reset
docker exec muno-db-dev psql -U muno -d muno -c 'SELECT count(*) FROM "Assinatura";'
```

Expected: a migração aplica sem erro. Num banco de seed a contagem pode ser 0 — isso é esperado e não valida o backfill.

Para validar de verdade, insira um tenant com mensalidade **antes** de migrar num banco espelhado:

```bash
npm run db:espelhar
docker exec muno-db-dev psql -U muno -d muno -c 'SELECT count(*) FROM "Tenant" WHERE "valorMensal" IS NOT NULL;'
```

Guarde esse número, rode `npx prisma migrate deploy`, e confira que `SELECT count(*) FROM "Assinatura"` bate. **Se não bater, pare e reporte BLOCKED** — o backfill perdeu dado e a migração não pode ir para produção.

- [ ] **Step 6: Atualizar `calcularMrr`**

Em `src/lib/platform-metrics.ts`, a função soma `valorMensal` de tenants ativos. Troque a entrada para assinaturas e a regra para "não cancelada":

```ts
type AssinaturaParaMrr = {
  status: string;
  valorMensal: number | { toString(): string };
};

/**
 * Soma assinatura não cancelada — e não "tenant ativo", como era antes das
 * assinaturas existirem. A diferença importa: restaurante inadimplente ainda
 * deve, e tirá-lo da soma esconderia exatamente o número que você precisa
 * ver quando a inadimplência cresce.
 */
export function calcularMrr(assinaturas: AssinaturaParaMrr[]): number {
  return assinaturas
    .filter((a) => a.status !== "CANCELADA")
    .reduce((soma, a) => soma + Number(a.valorMensal.toString()), 0);
}
```

Atualize `src/lib/platform-metrics.test.ts` para a nova assinatura da função, incluindo um caso que prove que assinatura `INADIMPLENTE` **continua** na soma e `CANCELADA` sai.

- [ ] **Step 7: Atualizar os outros seis consumidores**

Cada um passa a ler ou escrever `Assinatura` em vez das colunas do `Tenant`:

- `src/app/platform/page.tsx` — trocar o `select: { status: true, valorMensal: true }` de tenant por uma consulta a `prismaUnscoped.assinatura.findMany({ select: { status: true, valorMensal: true } })` e passar para `calcularMrr`.
- `src/app/platform/clientes/page.tsx` — `include: { assinatura: true }` no findMany de tenant; passar `t.assinatura?.valorMensal` e `t.assinatura?.diaVencimento` para `MensalidadeInline`.
- `src/app/api/platform/clientes/[id]/route.ts` — o PATCH passa a fazer `upsert` na `Assinatura` do tenant. Mantenha `min(1).max(28)` no `diaVencimento` — use `DIA_VENCIMENTO_MAX` da Task 2 em vez do literal.
- `src/app/api/platform/leads/[id]/converter/route.ts` — criar a `Assinatura` na mesma transação do tenant (ver Task 8, que acrescenta cortesia; aqui basta não quebrar).
- `src/components/platform/MensalidadeInline.tsx` e `ConverterLead.tsx` — só ajustar tipos das props se necessário; o corpo do POST/PATCH não muda de formato.

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit && npm test
```

Expected: `tsc` sem saída; suíte verde. `tsc` é o que prova que os sete consumidores foram atualizados — qualquer um esquecido vira erro de propriedade inexistente.

- [ ] **Step 9: Commit**

```bash
git add prisma src/lib/platform-metrics.ts src/lib/platform-metrics.test.ts src/app/platform src/app/api/platform src/components/platform
git commit -m "$(cat <<'EOF'
Move a mensalidade do Tenant para uma assinatura de verdade

valorMensal e diaVencimento viviam no Tenant, eram preenchidos na conversão
e nunca mais lidos por nada além do cálculo de MRR. Não havia cobrança, nem
vencimento, nem histórico.

A migração faz backfill antes do DROP e na mesma transação: se o backfill
falhar, nenhuma coluna cai. Sete arquivos liam esses campos, e todos vêm no
mesmo commit — separados, existiria um commit em que o projeto não compila.

O MRR muda de definição junto: soma assinatura não cancelada em vez de tenant
ativo. Inadimplente ainda deve, e tirá-lo da soma esconderia justamente o
número que importa quando a inadimplência cresce.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: O job diário

**Files:**
- Create: `src/app/api/cron/assinaturas/route.ts`
- Test: `src/app/api/cron/assinaturas/route.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `statusPelaRegua` (Task 1); `competenciaDe`, `vencimentoDaCompetencia` (Task 2); models da Task 3.
- Produces: `POST /api/cron/assinaturas`.

- [ ] **Step 1: Ler a documentação de Cron Jobs**

O projeto não tem cron nenhum hoje e `vercel.json` não tem a chave `crons`. Consulte `node_modules/next/dist/docs/01-app/` sobre Route Handlers e confirme o formato de `crons` em `vercel.json` antes de escrever.

- [ ] **Step 2: Escrever o teste que falha**

Mocke `prismaUnscoped` como em `src/app/api/leads/publico/route.test.ts` (mesmo padrão de `vi.mock`). Cubra:

```ts
it("recusa sem o CRON_SECRET", async () => {
  const res = await POST(requisicao({ secret: "errado" }));
  expect(res.status).toBe(401);
  expect(create).not.toHaveBeenCalled();
});

it("gera cobrança do mês para assinatura cuja cortesia já passou", async () => { /* ... */ });

it("não gera para assinatura ainda em cortesia", async () => {
  // inicioCobranca no futuro: a assinatura existe, aparece nas telas, e não
  // cobra. Sem esta checagem, a cortesia que o Rodrigo negocia caso a caso
  // seria cobrada no primeiro dia.
});

it("não gera para assinatura CANCELADA", async () => { /* ... */ });

it("rodar duas vezes não duplica cobrança", async () => {
  // O create do segundo passe rejeita com violação de unique; a rota tem de
  // tratar isso como "já existe", não como erro.
});

it("move status pela régua e persiste", async () => { /* ... */ });

it("nunca move assinatura CANCELADA", async () => { /* ... */ });
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run src/app/api/cron/assinaturas/route.test.ts`

- [ ] **Step 4: Implementar a rota**

```ts
/**
 * Job diário da assinatura. Duas responsabilidades, nesta ordem: gerar a
 * cobrança do mês e mover o status pela régua.
 *
 * Nenhuma das duas depende de ter rodado ontem — se um dia falhar, o dia
 * seguinte corrige tudo. Job de cobrança que acumula estado é job que erra
 * depois de um incidente, justamente quando ninguém está olhando.
 */
export async function POST(req: NextRequest) {
  const autorizado =
    process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!autorizado) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // ... gerar cobranças, depois aplicar a régua
}
```

Na geração, trate a violação de unique como sucesso silencioso (a cobrança do mês já existia):

```ts
try {
  await prismaUnscoped.cobranca.create({ data: { /* ... */ } });
} catch (erro) {
  // P2002 = unique violada. Outro passe do job já criou esta competência;
  // é o desfecho esperado, não erro.
  if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== "P2002") throw erro;
}
```

- [ ] **Step 5: Agendar em `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/assinaturas", "schedule": "0 9 * * *" }]
}
```

9h UTC é 6h em Brasília — antes do restaurante abrir, então uma mudança de status nunca acontece no meio do serviço.

- [ ] **Step 6: Verificar e commitar**

```bash
npx vitest run src/app/api/cron/assinaturas/route.test.ts && npx tsc --noEmit && npm test
git add src/app/api/cron vercel.json
git commit -m "$(cat <<'EOF'
Gera a cobrança do mês e aplica a régua todo dia

Duas operações idempotentes: nenhuma depende de ter rodado ontem, então um
dia de falha se corrige sozinho no dia seguinte. Job de cobrança que acumula
estado erra depois de um incidente, que é quando ninguém está olhando.

A duplicação é barrada pelo unique da competência, e a violação é tratada
como desfecho esperado em vez de erro.

Roda às 6h de Brasília, antes de o restaurante abrir: mudança de status nunca
acontece no meio do serviço.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: O bloqueio, e o primeiro teste do proxy

**Files:**
- Modify: `src/proxy.ts`
- Create: `src/proxy.test.ts`

**Interfaces:**
- Consumes: model `Assinatura` (Task 3).
- Produces: bloqueio do `/adm` quando `assinatura.status === "BLOQUEADA"`.

**Esta é a tarefa de maior risco do plano.** Um erro aqui derruba o cardápio de um cliente pagante.

- [ ] **Step 1: Escrever o teste que falha — a garantia mais importante primeiro**

Crie `src/proxy.test.ts`. Mocke `@/lib/auth`, `@/lib/auth-platform` e `@/lib/prisma` (padrão de `src/app/api/leads/publico/route.test.ts`). Os casos, em ordem de importância:

```ts
// O teste que justifica este arquivo existir.
it.each([
  "/",
  "/cart",
  "/checkout",
  "/track/pedido-1",
  "/mesa/abc/cardapio",
  "/dashboard",
  "/motoboy/pedidos",
])("assinatura BLOQUEADA não afeta %s", async (caminho) => {
  // Inadimplência bloqueia gestão, nunca operação. Se este teste falhar,
  // um restaurante pagante ficou sem vender por causa de uma fatura.
});

it("assinatura BLOQUEADA redireciona /adm para /adm/assinatura", async () => { /* ... */ });

it("/adm/assinatura escapa do bloqueio", async () => {
  // Senão o dono é mandado para a página que precisa ver, em loop.
});

it.each(["ATIVA", "INADIMPLENTE"])("status %s não bloqueia o /adm", async (status) => {
  // INADIMPLENTE avisa, não impede.
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL nos casos de bloqueio (os de storefront devem passar desde já — eles descrevem o comportamento atual, e existem para detectar regressão).

- [ ] **Step 3: Implementar**

Em `src/proxy.ts`, inclua a assinatura no `select` que já existe (linha ~128) e acrescente a checagem **dentro** do bloco `isAdminRoute` que já existe:

```ts
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      assinatura: { select: { status: true } },
    },
  });
```

```ts
  // Admin routes: require ADMIN role
  if (isAdminRoute) {
    if (!session) { /* ... como está ... */ }
    if (session.user.role !== "ADMIN") { /* ... como está ... */ }

    // Inadimplência bloqueia gestão, nunca operação. A checagem mora DENTRO
    // de isAdminRoute de propósito: cardápio, checkout, mesa, cozinha e
    // motoboy não têm como cair por causa de uma fatura — o código nem chega
    // perto deles. src/proxy.test.ts existe para manter isso verdadeiro.
    //
    // A própria tela de assinatura escapa, senão o dono é redirecionado em
    // loop para a página que precisa ver para resolver.
    const bloqueada = tenant.assinatura?.status === "BLOQUEADA";
    const ehTelaDeAssinatura = nextUrl.pathname.startsWith("/adm/assinatura");
    if (bloqueada && !ehTelaDeAssinatura) {
      return NextResponse.redirect(urlNoHost("/adm/assinatura"));
    }
  }
```

- [ ] **Step 4: Verificar e commitar**

```bash
npx vitest run src/proxy.test.ts && npx tsc --noEmit && npm test
git add src/proxy.ts src/proxy.test.ts
git commit -m "$(cat <<'EOF'
Bloqueia a gestão de quem está muito atrasado, nunca o cardápio

Quinze dias de atraso tiram o /adm do dono. Cardápio, checkout, mesa, cozinha
e motoboy seguem funcionando: bloquear gestão é pressão, derrubar o
restaurante em horário de pico transfere o prejuízo para o cliente dele.

A checagem mora dentro do bloco isAdminRoute justamente para que não exista
caminho de código em que uma fatura alcance o storefront.

Este é o primeiro teste de proxy.ts do projeto, e ele existe para responder
sozinho à pergunta "isso pode derrubar o cardápio de um cliente?".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: A tela do restaurante

**Files:**
- Create: `src/app/adm/assinatura/page.tsx`
- Create: `src/components/adm/AvisoDeCobranca.tsx`
- Modify: o layout de `/adm` para montar a faixa

**Interfaces:**
- Consumes: models da Task 3; `diasDeAtraso` (Task 1).
- Produces: `/adm/assinatura`, e a faixa de aviso no `/adm`.

- [ ] **Step 1: A tela**

`/adm/assinatura` mostra: status legível, valor, próximo vencimento, e a lista de cobranças com competência, vencimento, status e data de pagamento. Ela é lida com o `x-tenant-id` que o proxy injeta, como as outras telas de `/adm`.

Quando o status é `BLOQUEADA`, a tela explica que a gestão está bloqueada, que os pedidos continuam entrando, e como regularizar. **Nunca** sugira que o cardápio saiu do ar — ele não saiu.

- [ ] **Step 2: A faixa**

```tsx
// A faixa NÃO deriva do status da assinatura. Nos seis primeiros dias de
// atraso o status ainda é ATIVA de propósito, e uma faixa que lesse
// assinatura.status ficaria muda justamente na fase em que um aviso ainda
// resolve sem atrito. Ela olha a cobrança vencida mais antiga.
const vencida = cobrancas.find((c) => c.status !== "PAGA" && c.vencimento < agora);
```

O tom sobe com `diasDeAtraso`: informativo até 6, firme de 7 a 14, e a partir de 15 explica o bloqueio.

- [ ] **Step 3: Verificar e commitar**

```bash
npx tsc --noEmit && npm test
```

Commit com mensagem no padrão do repositório, explicando por que a faixa não lê o status.

---

### Task 7: A operação, do seu lado

**Files:**
- Modify: `src/app/platform/clientes/page.tsx`
- Create: `src/app/api/platform/cobrancas/[id]/baixa/route.ts`
- Create: `src/components/platform/DarBaixa.tsx`
- Test: `src/app/api/platform/cobrancas/[id]/baixa/route.test.ts`

**Interfaces:**
- Consumes: models da Task 3; `statusPelaRegua` (Task 1).
- Produces: `POST /api/platform/cobrancas/[id]/baixa`.

- [ ] **Step 1: A baixa manual**

A rota marca a cobrança como `PAGA` com `pagoEm`, e **recalcula o status da assinatura pela régua** — se não havia outra vencida, ela volta a `ATIVA` na hora, e o bloqueio se desfaz na próxima requisição.

É esta rota que torna a parte A utilizável sem gateway nenhum: você recebe o PIX, confere e dá baixa.

Testes: exige sessão de plataforma (401 sem); baixa em cobrança já paga é idempotente; a assinatura volta a `ATIVA` quando não resta vencida; **continua `BLOQUEADA` se ainda houver outra cobrança vencida há 15+ dias** — esse é o caso que um `update` ingênuo erra.

- [ ] **Step 2: A situação na lista**

`/platform/clientes` ganha, por cliente, o status da assinatura e há quantos dias está vencido, além do botão de baixa na cobrança em aberto.

- [ ] **Step 3: Verificar e commitar**

```bash
npx tsc --noEmit && npm test
```

---

### Task 8: A cortesia na conversão

**Files:**
- Modify: `src/app/api/platform/leads/[id]/converter/route.ts`
- Modify: `src/components/platform/ConverterLead.tsx`

**Interfaces:**
- Consumes: models da Task 3; `DIA_VENCIMENTO_MAX` (Task 2).
- Produces: conversão cria `Assinatura` com cortesia.

- [ ] **Step 1: Estender o schema da rota**

```ts
const schema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  nome: z.string().min(2).optional(),
  valorMensal: z.number().min(0).max(99999999.99).optional(),
  diaVencimento: z.number().int().min(1).max(DIA_VENCIMENTO_MAX).optional(),
  // Cortesia negociada caso a caso. Zero é uma resposta válida e diferente de
  // omitir: zero é "começa cobrando", omitir é "não me perguntaram".
  diasDeCortesia: z.number().int().min(0).max(365).optional(),
});
```

`inicioCobranca` = hoje + `diasDeCortesia`, arredondado para o próximo `diaVencimento`. A `Assinatura` é criada **na mesma transação** que já cria tenant e admin — senão um cliente pode existir sem assinatura, e o job nunca vai cobrá-lo.

- [ ] **Step 2: O formulário**

`ConverterLead` ganha os campos de dia de vencimento e dias de cortesia, ao lado do de mensalidade que já existe.

- [ ] **Step 3: Verificar e commitar**

```bash
npx tsc --noEmit && npm test
```

---

## Ordem e dependências

```
Task 1 (régua) ──┐
Task 2 (competência) ──┼─► Task 3 (modelo + migração) ─► Task 4 (job)
                       │                                └► Task 5 (bloqueio)
                       │                                └► Task 6 (tela do restaurante)
                       │                                └► Task 7 (operação)
                       │                                └► Task 8 (cortesia)
```

Tasks 1 e 2 são independentes e podem vir em qualquer ordem. Task 3 é o gargalo: tudo depois dela depende dos models. Tasks 4 a 8 são independentes entre si.

**Task 3 é a única destrutiva.** Antes de ela chegar em produção, confirme que o backup do dia está no Blob (`npm run db:recuperar` lista) — o spec exige isso e não é formalidade: é a única forma de desfazer um backfill que perdeu dado.
