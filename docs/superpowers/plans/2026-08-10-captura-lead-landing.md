# Captura de lead da landing no CRM — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar como `Lead` no CRM quem preenche o formulário da landing, sem nunca atrapalhar a abertura do WhatsApp.

**Architecture:** Uma rota pública em `src/app/api/leads/publico/route.ts` que sai do pipeline de tenant por uma guarda no `src/proxy.ts`, gravando com `prismaUnscoped`. A lógica de decisão (rate limit, deduplicação, normalização de telefone) vive em libs puras e testadas isoladamente; a rota é fina. A landing, em outro repositório, chama a rota em paralelo à abertura do WhatsApp.

**Tech Stack:** Next.js 16.2.2 (App Router, `src/app`), Prisma 6, Zod 4, Vitest 4, Postgres local via Docker.

**Spec:** `docs/superpowers/specs/2026-08-10-captura-lead-landing-design.md`

## Global Constraints

- **O proxy deste projeto é `src/proxy.ts`, não `middleware.ts`.** Next 16. Antes de escrever a rota, ler `node_modules/next/dist/docs/01-app/` sobre Route Handlers — a API difere do que você provavelmente conhece.
- **Banco de desenvolvimento é local**, nunca produção. `docker compose up -d` sobe o Postgres na porta 5433. `db:migrate` passa por `scripts/guard-local-db.js` e aborta se `DATABASE_URL` não for localhost. Se a trava disparar, o alvo está errado — não contorne.
- **Vitest só varre `src/**/*.test.ts`.** Teste fora de `src/` não roda.
- **Código, comentários, nomes de variável e mensagens de commit em português**, como o resto do repositório. Comentários explicam *por quê*, não *o quê*.
- **Toda mensagem de commit termina com** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **`Lead` não é modelo tenant-scoped.** Não adicione entrada em `src/lib/tenant-scoped-models.ts`, nem `@@index([tenantId])`, nem policy RLS. O `tenantId` dele é vínculo opcional com o cliente convertido.
- **Valores fixos do spec:** origem gravada `"landing"`; janela de deduplicação 24h; rate limit 5 envios por 10 minutos por IP; caminho da rota `/api/leads/publico`; env de CORS `LANDING_ORIGIN`.
- **Tarefa 6 exige acesso ao repositório da landing** (`~/Dev/MunoSellPage`). Rode `/add-dir ~/Dev/MunoSellPage` antes dela.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | coluna `plano` no `Lead` |
| `src/app/platform/leads/page.tsx` | mostrar o plano na listagem do funil |
| `src/app/platform/leads/[id]/page.tsx` | mostrar o plano no detalhe do lead |
| `src/lib/rate-limit.ts` | limitador genérico de janela deslizante, em memória, relógio injetado |
| `src/lib/lead-landing.ts` | normalização/validação de telefone e decisão criar-vs-atualizar |
| `src/app/api/leads/publico/route.ts` | rota fina: CORS, honeypot, rate limit, validação, gravação |
| `src/proxy.ts` | guarda que tira a rota do pipeline de tenant |
| `~/Dev/MunoSellPage/index.html` | campo honeypot no formulário |
| `~/Dev/MunoSellPage/js/main.js` | chamada ao endpoint em paralelo ao WhatsApp |

`rate-limit.ts` e `lead-landing.ts` são separados de propósito: o limitador não sabe o que é lead e serve a qualquer rota pública futura; a decisão de gravação não sabe o que é HTTP.

---

### Task 1: Coluna `plano` no Lead

**Files:**
- Modify: `prisma/schema.prisma` (model `Lead`, após a linha `origem`)
- Create: `prisma/migrations/<timestamp>_plano_no_lead/migration.sql` (gerada pelo Prisma)
- Modify: `src/app/platform/leads/page.tsx:50-52`
- Modify: `src/app/platform/leads/[id]/page.tsx:29-31`

**Interfaces:**
- Consumes: nada.
- Produces: campo `Lead.plano: string | null`, usado pelas tarefas 3, 4 e pelas telas.

- [ ] **Step 1: Subir o banco local**

```bash
docker compose up -d
```

Espere o container ficar de pé antes de seguir.

- [ ] **Step 2: Adicionar o campo no schema**

Em `prisma/schema.prisma`, no model `Lead`, entre `origem` e `status`:

```prisma
  origem      String     @default("manual")
  // Nulável e sem default: lead digitado à mão fica sem plano, e isso é
  // informação — significa "não perguntei", não "não quis". Um default faria o
  // CRM afirmar sobre todo lead histórico algo que ninguém perguntou.
  // String livre, não enum: os dois repositórios são publicados separadamente,
  // e um enum transformaria a próxima mudança no select da landing em 400
  // silencioso, perdendo o lead.
  plano       String?
  status      LeadStatus @default(NOVO)
```

- [ ] **Step 3: Gerar a migração**

```bash
npm run db:migrate -- --name plano_no_lead
```

Expected: a trava `guard-local-db.js` aprova (DATABASE_URL em localhost), o Prisma cria a pasta da migração e aplica.

- [ ] **Step 4: Conferir o SQL gerado**

```bash
cat prisma/migrations/*_plano_no_lead/migration.sql
```

Expected, exatamente uma alteração aditiva:

```sql
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "plano" TEXT;
```

Se aparecer qualquer `DROP`, pare: o schema divergiu e a migração vai destruir dado em produção.

- [ ] **Step 5: Mostrar o plano na listagem do funil**

Em `src/app/platform/leads/page.tsx`, linha 50-52, trocar:

```tsx
                  <p className="text-xs text-neutral-400 mt-1">
                    {[lead.cidade, lead.origem].filter(Boolean).join(" · ")}
                  </p>
```

por:

```tsx
                  <p className="text-xs text-neutral-400 mt-1">
                    {[lead.cidade, lead.origem, lead.plano]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
```

- [ ] **Step 6: Mostrar o plano no detalhe do lead**

Em `src/app/platform/leads/[id]/page.tsx`, linha 29-31, trocar:

```tsx
  const contato = [lead.contato, lead.telefone, lead.email, lead.cidade].filter(
    Boolean
  );
```

por:

```tsx
  const contato = [
    lead.contato,
    lead.telefone,
    lead.email,
    lead.cidade,
    lead.plano,
  ].filter(Boolean);
```

- [ ] **Step 7: Verificar que nada quebrou**

```bash
npx tsc --noEmit && npm test
```

Expected: `tsc` sem saída; 223 testes passando, 21 arquivos. Nenhum teste novo aqui — a coluna ganha cobertura nas tarefas 3 e 4.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/app/platform/leads
git commit -m "$(cat <<'EOF'
Dá ao lead um campo para o plano de interesse

O formulário da landing pergunta qual plano interessa e hoje essa resposta
só existe dentro da mensagem do WhatsApp. Como coluna, ela separa quem pediu
Enterprise de quem pediu o plano mensal sem abrir lead por lead.

Nulável de propósito: lead digitado à mão continua sem plano, o que significa
"não perguntei" e não "não quis".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Limitador de taxa em memória

**Files:**
- Create: `src/lib/rate-limit.ts`
- Test: `src/lib/rate-limit.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `criarLimitador({ max: number, janelaMs: number }): Limitador`
  - `Limitador.permitir(chave: string, agora: number): boolean`
  - `Limitador.chaves: number` (getter, quantidade de chaves vivas no mapa)

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { criarLimitador } from "./rate-limit";

describe("criarLimitador", () => {
  it("permite até o teto e barra o seguinte", () => {
    const limitador = criarLimitador({ max: 3, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 10)).toBe(true);
    expect(limitador.permitir("ip-1", 20)).toBe(true);
    expect(limitador.permitir("ip-1", 30)).toBe(false);
  });

  it("conta cada chave separadamente", () => {
    const limitador = criarLimitador({ max: 1, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 1)).toBe(false);
    expect(limitador.permitir("ip-2", 1)).toBe(true);
  });

  it("libera de novo quando a janela passa", () => {
    const limitador = criarLimitador({ max: 1, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 999)).toBe(false);
    expect(limitador.permitir("ip-1", 1000)).toBe(true);
  });

  it("é janela deslizante, não balde que zera de tempos em tempos", () => {
    const limitador = criarLimitador({ max: 2, janelaMs: 1000 });

    expect(limitador.permitir("ip-1", 0)).toBe(true);
    expect(limitador.permitir("ip-1", 900)).toBe(true);
    // 1000 expira só a marca de 0; a de 900 continua viva.
    expect(limitador.permitir("ip-1", 1000)).toBe(true);
    expect(limitador.permitir("ip-1", 1001)).toBe(false);
  });

  it("poda chave inativa para o mapa não crescer sem limite", () => {
    const limitador = criarLimitador({ max: 5, janelaMs: 1000 });

    limitador.permitir("ip-1", 0);
    limitador.permitir("ip-2", 0);
    expect(limitador.chaves).toBe(2);

    // Uma chamada de outro IP, muito depois: as duas primeiras já morreram.
    limitador.permitir("ip-3", 5000);
    expect(limitador.chaves).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/lib/rate-limit.test.ts
```

Expected: FAIL — `Failed to resolve import "./rate-limit"`.

- [ ] **Step 3: Implementar**

Criar `src/lib/rate-limit.ts`:

```ts
/**
 * Limitador de taxa por janela deslizante, guardado em memória.
 *
 * Duas honestidades sobre este mecanismo, para quem for reavaliar depois:
 *
 * 1. O estado é por instância da função. O Fluid Compute reaproveita
 *    instâncias, então o limite morde na prática, mas várias instâncias
 *    significam vários contadores. Isto é proporcional ao volume de um
 *    primeiro lançamento, não a um ataque.
 * 2. Não substitui autenticação. Serve para conter envio repetido e ruído de
 *    bot em rota pública de escrita.
 *
 * O relógio é parâmetro, não `Date.now()` interno, para o teste não depender
 * de `sleep` — teste com espera real é lento e intermitente.
 */

export interface LimiteConfig {
  max: number;
  janelaMs: number;
}

export interface Limitador {
  permitir(chave: string, agora: number): boolean;
  readonly chaves: number;
}

export function criarLimitador({ max, janelaMs }: LimiteConfig): Limitador {
  const registros = new Map<string, number[]>();

  // Poda a cada chamada, e não por timer: sem processo de fundo, o mapa
  // encolhe no mesmo caminho que o faz crescer.
  function podar(agora: number): void {
    for (const [chave, marcas] of registros) {
      const vivas = marcas.filter((marca) => agora - marca < janelaMs);
      if (vivas.length === 0) registros.delete(chave);
      else registros.set(chave, vivas);
    }
  }

  return {
    permitir(chave: string, agora: number): boolean {
      podar(agora);
      const marcas = registros.get(chave) ?? [];
      if (marcas.length >= max) return false;
      marcas.push(agora);
      registros.set(chave, marcas);
      return true;
    },
    get chaves(): number {
      return registros.size;
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run src/lib/rate-limit.test.ts
```

Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
git commit -m "$(cat <<'EOF'
Cria um limitador de taxa para rotas públicas

Janela deslizante em memória, com o relógio como parâmetro para o teste não
depender de espera real.

O estado é por instância da função, não global — o que basta para conter
envio repetido e ruído de bot, e não pretende ser defesa contra ataque.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Telefone e decisão de gravação

**Files:**
- Create: `src/lib/lead-landing.ts`
- Test: `src/lib/lead-landing.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ORIGEM_LANDING: "landing"`
  - `JANELA_DEDUPE_MS: number` (24h em milissegundos)
  - `normalizarTelefone(bruto: string): string`
  - `telefoneValido(bruto: string): boolean`
  - `type LeadCandidato = { id: string; telefone: string | null; origem: string; createdAt: Date }`
  - `type Decisao = { acao: "criar" } | { acao: "atualizar"; id: string }`
  - `decidirGravacao(candidatos: LeadCandidato[], telefone: string, agora: Date): Decisao`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/lead-landing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  JANELA_DEDUPE_MS,
  ORIGEM_LANDING,
  decidirGravacao,
  normalizarTelefone,
  telefoneValido,
  type LeadCandidato,
} from "./lead-landing";

const AGORA = new Date("2026-08-10T12:00:00Z");

function candidato(over: Partial<LeadCandidato> = {}): LeadCandidato {
  return {
    id: "lead-1",
    telefone: "(11) 99999-9999",
    origem: ORIGEM_LANDING,
    createdAt: new Date(AGORA.getTime() - 60_000),
    ...over,
  };
}

describe("normalizarTelefone", () => {
  it("reduz a dígitos, seja qual for a formatação", () => {
    expect(normalizarTelefone("(11) 99999-9999")).toBe("11999999999");
    expect(normalizarTelefone("11 99999 9999")).toBe("11999999999");
    expect(normalizarTelefone("+55 (11) 99999-9999")).toBe("5511999999999");
  });
});

describe("telefoneValido", () => {
  it.each(["(11) 99999-9999", "1199999999", "+55 11 99999-9999"])(
    "aceita %s",
    (entrada) => {
      expect(telefoneValido(entrada)).toBe(true);
    }
  );

  it.each([
    ["((((((((((", "só pontuação"],
    ["119999", "dígitos de menos"],
    ["551199999999999", "dígitos demais"],
    ["", "vazio"],
  ])("recusa %s (%s)", (entrada) => {
    expect(telefoneValido(entrada)).toBe(false);
  });

  it("valida pelos dígitos, não pelo tamanho do texto", () => {
    // 15 caracteres, 11 dígitos: válido. Validar o texto cru recusaria isto.
    expect(telefoneValido("(11) 99999-9999")).toBe(true);
    // 10 caracteres, 0 dígitos: inválido.
    expect(telefoneValido("((((((((((")).toBe(false);
  });
});

describe("decidirGravacao", () => {
  it("cria quando não há candidato nenhum", () => {
    expect(decidirGravacao([], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("atualiza o lead recente com o mesmo telefone", () => {
    const existente = candidato({ id: "lead-42" });

    expect(decidirGravacao([existente], "11999999999", AGORA)).toEqual({
      acao: "atualizar",
      id: "lead-42",
    });
  });

  it("reconhece o mesmo telefone escrito de outro jeito", () => {
    const existente = candidato({ id: "lead-42", telefone: "11999999999" });

    expect(decidirGravacao([existente], "(11) 99999-9999", AGORA)).toEqual({
      acao: "atualizar",
      id: "lead-42",
    });
  });

  it("cria quando o lead com aquele telefone é mais velho que a janela", () => {
    const antigo = candidato({
      createdAt: new Date(AGORA.getTime() - JANELA_DEDUPE_MS - 1),
    });

    expect(decidirGravacao([antigo], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("nunca toca em lead de origem manual", () => {
    // O nome ali foi digitado por uma pessoa; o formulário não o sobrescreve.
    const manual = candidato({ origem: "manual" });

    expect(decidirGravacao([manual], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("ignora candidato sem telefone", () => {
    const semTelefone = candidato({ telefone: null });

    expect(decidirGravacao([semTelefone], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("escolhe o mais recente quando há mais de um", () => {
    const velho = candidato({
      id: "lead-velho",
      createdAt: new Date(AGORA.getTime() - 10 * 60_000),
    });
    const novo = candidato({
      id: "lead-novo",
      createdAt: new Date(AGORA.getTime() - 60_000),
    });

    expect(decidirGravacao([velho, novo], "11999999999", AGORA)).toEqual({
      acao: "atualizar",
      id: "lead-novo",
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/lib/lead-landing.test.ts
```

Expected: FAIL — `Failed to resolve import "./lead-landing"`.

- [ ] **Step 3: Implementar**

Criar `src/lib/lead-landing.ts`:

```ts
/**
 * Regras da captura de lead vinda da landing de vendas.
 *
 * Funções puras, sem Prisma e sem HTTP: a rota busca os candidatos e aplica a
 * decisão, e este arquivo só decide.
 */

export const ORIGEM_LANDING = "landing";

/** Reenvio no mesmo dia é a mesma intenção; contato semanas depois é outra. */
export const JANELA_DEDUPE_MS = 24 * 60 * 60 * 1000;

const MIN_DIGITOS = 10; // fixo + DDD
const MAX_DIGITOS = 13; // +55, DDD e nove dígitos

export function normalizarTelefone(bruto: string): string {
  return bruto.replace(/\D/g, "");
}

/**
 * Valida pela contagem de dígitos, e não pelo comprimento do texto:
 * "(11) 99999-9999" tem 15 caracteres e 11 dígitos, enquanto "((((((((((" tem
 * 10 caracteres e nenhum. Medir o texto cru aceitaria o segundo e recusaria
 * formatação legítima.
 */
export function telefoneValido(bruto: string): boolean {
  const digitos = normalizarTelefone(bruto).length;
  return digitos >= MIN_DIGITOS && digitos <= MAX_DIGITOS;
}

export type LeadCandidato = {
  id: string;
  telefone: string | null;
  origem: string;
  createdAt: Date;
};

export type Decisao = { acao: "criar" } | { acao: "atualizar"; id: string };

/**
 * A dedução só considera leads da própria landing. Lead digitado à mão nunca é
 * sobrescrito pelo que a pessoa preencheu no formulário — o nome que você
 * escreveu vale mais que o que ela digitou com pressa no celular.
 */
export function decidirGravacao(
  candidatos: LeadCandidato[],
  telefone: string,
  agora: Date
): Decisao {
  const alvo = normalizarTelefone(telefone);

  const elegiveis = candidatos
    .filter(
      (c) =>
        c.origem === ORIGEM_LANDING &&
        c.telefone !== null &&
        normalizarTelefone(c.telefone) === alvo &&
        agora.getTime() - c.createdAt.getTime() < JANELA_DEDUPE_MS
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const recente = elegiveis[0];
  return recente ? { acao: "atualizar", id: recente.id } : { acao: "criar" };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run src/lib/lead-landing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-landing.ts src/lib/lead-landing.test.ts
git commit -m "$(cat <<'EOF'
Decide quando um envio da landing é lead novo e quando é o mesmo

Preencher e reenviar porque o WhatsApp não abriu é o caso mais comum do
formulário, e sem tratamento cada tentativa vira um lead.

A comparação é por dígitos do telefone, então "(11) 99999-9999" e
"11999999999" são a mesma pessoa. A janela de 24h separa o reenvio do
contato genuíno que volta semanas depois, e a dedução ignora lead de origem
manual: o nome que você digitou não é sobrescrito pelo do formulário.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: A rota pública

**Files:**
- Create: `src/app/api/leads/publico/route.ts`
- Test: `src/app/api/leads/publico/route.test.ts`
- Reference: `src/app/api/payments/connections/route.test.ts` (padrão de mock de Prisma)
- Reference: `node_modules/next/dist/docs/01-app/` (Route Handlers no Next 16)

**Interfaces:**
- Consumes: `criarLimitador` (Task 2); `ORIGEM_LANDING`, `JANELA_DEDUPE_MS`, `decidirGravacao`, `telefoneValido` (Task 3); coluna `plano` (Task 1).
- Produces: `POST` e `OPTIONS` em `/api/leads/publico`. Contrato consumido pela landing na Task 6:
  - Requisição: `POST` JSON `{ restaurante: string, telefone: string, plano?: string, website?: string }`
  - Respostas: `201 { ok: true }` | `400 { error }` | `403 { error }` | `429 { error }`

- [ ] **Step 1: Ler a documentação de Route Handlers**

```bash
ls node_modules/next/dist/docs/01-app/
```

Encontre e leia a página de Route Handlers. Esta versão do Next tem convenções que diferem de versões anteriores; confirme a assinatura de `export async function POST` e como devolver cabeçalhos antes de escrever.

- [ ] **Step 2: Escrever os testes que falham**

Criar `src/app/api/leads/publico/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const ORIGEM_OK = "https://join.munoapp.com.br";

// --- mocks -----------------------------------------------------------------

const findMany = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: {
    lead: {
      findMany: (...args: unknown[]) => findMany(...args),
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const { POST, OPTIONS } = await import("@/app/api/leads/publico/route");

// --- helpers ---------------------------------------------------------------

// IP diferente a cada chamada por padrão. O limitador é módulo-escopo e
// sobrevive entre os casos deste arquivo: com IP fixo, o sétimo teste levaria
// 429 por causa dos seis anteriores, e falharia por um motivo que nada tem a
// ver com o que ele afirma. Quem testa o 429 passa um IP fixo de propósito.
let contadorDeIp = 0;

function requisicao(
  body: unknown,
  { origem = ORIGEM_OK, ip = `203.0.113.${++contadorDeIp}` } = {}
): NextRequest {
  return new NextRequest("http://localhost/api/leads/publico", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: origem,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const VALIDO = {
  restaurante: "Burguer da Esquina",
  telefone: "(11) 99999-9999",
  plano: "Membro MUNO",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LANDING_ORIGIN = ORIGEM_OK;
  findMany.mockResolvedValue([]);
  create.mockResolvedValue({ id: "lead-novo" });
  update.mockResolvedValue({ id: "lead-existente" });
});

// --- testes ----------------------------------------------------------------

describe("POST /api/leads/publico", () => {
  it("grava o lead com origem landing", async () => {
    const res = await POST(requisicao(VALIDO));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      restaurante: "Burguer da Esquina",
      telefone: "(11) 99999-9999",
      plano: "Membro MUNO",
      origem: "landing",
    });
  });

  it("honeypot preenchido responde 201 e NÃO grava", async () => {
    // O 201 é deliberado: um 400 ensinaria ao bot qual campo é a armadilha.
    const res = await POST(requisicao({ ...VALIDO, website: "http://spam.example" }));

    expect(res.status).toBe(201);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("honeypot vazio não atrapalha o envio legítimo", async () => {
    const res = await POST(requisicao({ ...VALIDO, website: "" }));

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("recusa payload inválido com 400", async () => {
    const res = await POST(requisicao({ restaurante: "x", telefone: "((((" }));

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("recusa origem não permitida com 403", async () => {
    const res = await POST(requisicao(VALIDO, { origem: "https://site-aleatorio.example" }));

    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("devolve o cabeçalho de CORS da origem permitida", async () => {
    const res = await POST(requisicao(VALIDO));

    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGEM_OK);
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("atualiza em vez de criar quando a lib decide atualizar", async () => {
    findMany.mockResolvedValue([
      {
        id: "lead-42",
        telefone: "11999999999",
        origem: "landing",
        createdAt: new Date(),
      },
    ]);

    const res = await POST(requisicao(VALIDO));

    expect(res.status).toBe(201);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where).toEqual({ id: "lead-42" });
    expect(create).not.toHaveBeenCalled();
  });

  it("não mexe no status ao atualizar", async () => {
    // Se você já moveu o lead para CONTATADO, um reenvio não pode te devolver
    // para NOVO — isso desfaria trabalho seu.
    findMany.mockResolvedValue([
      {
        id: "lead-42",
        telefone: "11999999999",
        origem: "landing",
        createdAt: new Date(),
      },
    ]);

    await POST(requisicao(VALIDO));

    expect(update.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("barra com 429 ao estourar o teto do mesmo IP", async () => {
    // IP fixo e fora da faixa que o helper gera, para não colidir com os
    // outros casos deste arquivo.
    const ip = "198.51.100.7";
    for (let i = 0; i < 5; i++) {
      const ok = await POST(requisicao(VALIDO, { ip }));
      expect(ok.status).toBe(201);
    }

    const barrado = await POST(requisicao(VALIDO, { ip }));
    expect(barrado.status).toBe(429);
    expect(create).toHaveBeenCalledTimes(5);
  });
});

describe("OPTIONS /api/leads/publico", () => {
  it("responde ao preflight da origem permitida", async () => {
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/leads/publico", {
        method: "OPTIONS",
        headers: { origin: ORIGEM_OK },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGEM_OK);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("recusa preflight de origem estranha", async () => {
    const res = await OPTIONS(
      new NextRequest("http://localhost/api/leads/publico", {
        method: "OPTIONS",
        headers: { origin: "https://site-aleatorio.example" },
      })
    );

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npx vitest run src/app/api/leads/publico/route.test.ts
```

Expected: FAIL — não resolve `@/app/api/leads/publico/route`.

- [ ] **Step 4: Implementar a rota**

Criar `src/app/api/leads/publico/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import {
  JANELA_DEDUPE_MS,
  ORIGEM_LANDING,
  decidirGravacao,
  telefoneValido,
} from "@/lib/lead-landing";

/**
 * Captura de lead da landing de vendas, que mora em outro repositório e em
 * outro domínio.
 *
 * Esta rota sai do pipeline de tenant por uma guarda em src/proxy.ts, então
 * chega aqui SEM x-tenant-id — daí o prismaUnscoped explícito. Lead é dado da
 * plataforma, não de restaurante.
 */

// Módulo-escopo de propósito: o estado precisa sobreviver entre requisições da
// mesma instância. Ver a nota sobre o alcance disso em src/lib/rate-limit.ts.
const limitador = criarLimitador({ max: 5, janelaMs: 10 * 60 * 1000 });

const schema = z.object({
  restaurante: z.string().trim().min(2).max(120),
  telefone: z.string().trim().max(20).refine(telefoneValido, {
    message: "Telefone inválido",
  }),
  // String livre e não enum: os dois repositórios são publicados
  // separadamente, e um enum transformaria a próxima mudança no select da
  // landing em 400 silencioso — perdendo justamente o lead que esta rota
  // existe para não perder.
  plano: z.string().trim().max(60).optional(),
  website: z.string().max(200).optional(),
});

function origemPermitida(origem: string | null): boolean {
  if (!origem) return false;
  if (process.env.LANDING_ORIGIN && origem === process.env.LANDING_ORIGIN) {
    return true;
  }
  // Em desenvolvimento, a landing roda de um servidor local. Restrito a fora
  // de produção para que uma página em localhost não vire origem confiável no
  // ambiente real.
  if (process.env.NODE_ENV === "production") return false;
  try {
    const { hostname } = new URL(origem);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function cabecalhosCors(origem: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origem,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    // Sem Vary, um cache intermediário serviria a uma origem a resposta
    // liberada para outra.
    Vary: "Origin",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (!origemPermitida(origem)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: cabecalhosCors(origem as string),
  });
}

export async function POST(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (!origemPermitida(origem)) {
    return NextResponse.json({ error: "Origem não permitida" }, { status: 403 });
  }
  const cors = cabecalhosCors(origem as string);

  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em alguns minutos." },
      { status: 429, headers: cors }
    );
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: cors });
  }

  const parsed = schema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues },
      { status: 400, headers: cors }
    );
  }

  const { restaurante, telefone, plano, website } = parsed.data;

  // Honeypot: campo escondido que humano não vê e bot preenche. A resposta é
  // 201 sem gravar — um 400 ensinaria ao bot qual campo é a armadilha.
  if (website && website.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201, headers: cors });
  }

  const agora = new Date();
  const candidatos = await prismaUnscoped.lead.findMany({
    where: {
      origem: ORIGEM_LANDING,
      createdAt: { gte: new Date(agora.getTime() - JANELA_DEDUPE_MS) },
    },
    select: { id: true, telefone: true, origem: true, createdAt: true },
  });

  const decisao = decidirGravacao(candidatos, telefone, agora);

  if (decisao.acao === "atualizar") {
    // status fica de fora de propósito: reenvio não desfaz o lead que você já
    // moveu no funil.
    await prismaUnscoped.lead.update({
      where: { id: decisao.id },
      data: { restaurante, plano: plano ?? null },
    });
  } else {
    await prismaUnscoped.lead.create({
      data: { restaurante, telefone, plano: plano ?? null, origem: ORIGEM_LANDING },
    });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: cors });
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx vitest run src/app/api/leads/publico/route.test.ts
```

Expected: PASS, 11 testes.

Se o teste de 429 falhar por o limitador já estar saturado de testes anteriores, confirme que cada teste usa IP próprio — o limitador é módulo-escopo e sobrevive entre casos do mesmo arquivo.

- [ ] **Step 6: Suíte inteira e tipos**

```bash
npx tsc --noEmit && npm test
```

Expected: `tsc` sem saída; todos os arquivos passando.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/leads/publico
git commit -m "$(cat <<'EOF'
Abre uma rota pública para o formulário da landing gravar lead

A landing tinha formulário e não tinha memória: o submit abria o WhatsApp e
não guardava nada, então quem preenchia e não concluía o envio sumia sem
rastro.

A rota é fina de propósito — rate limit, deduplicação e validação de telefone
moram em libs testadas isoladas. Usa prismaUnscoped explicitamente porque
chega sem x-tenant-id: lead é dado da plataforma, não de restaurante.

O honeypot responde 201 sem gravar. Devolver 400 ensinaria ao bot qual campo
é a armadilha.

CORS aqui restringe navegador de terceiros, não curl — quem segura abuso é o
honeypot e o teto por IP.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Guarda no proxy

**Files:**
- Modify: `src/proxy.ts` (entre o bloco que devolve 404 para `/platform/*` e o `findUnique` do tenant)

**Interfaces:**
- Consumes: o caminho `/api/leads/publico` (Task 4).
- Produces: a rota passa a responder em qualquer host, sem resolução de tenant.

- [ ] **Step 1: Inserir a guarda**

Em `src/proxy.ts`, logo **antes** de `const tenant = await prisma.tenant.findUnique({`:

```ts
  // Captura de lead da landing. Espelho da guarda logo acima, na direção
  // oposta: aquela nega o que é da plataforma quando vem de fora dela; esta
  // libera o que não pertence a tenant nenhum.
  //
  // Sair ANTES do findUnique é o ponto. Pelo caminho normal a rota resolveria
  // o slug "default" e morreria junto com o restaurante de demonstração no dia
  // em que ele for removido — em silêncio, com 404, sem ninguém relacionar uma
  // coisa à outra.
  //
  // Sem x-tenant-id injetado, o que obriga a rota a usar prismaUnscoped
  // conscientemente, como a área de plataforma.
  if (nextUrl.pathname === "/api/leads/publico") {
    return NextResponse.next();
  }

```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sem saída.

- [ ] **Step 3: Subir o servidor de desenvolvimento**

```bash
docker compose up -d
npm run dev
```

Expected: o `guard-local-db.js` aprova e o Next sobe em `http://localhost:3000`.

- [ ] **Step 4: Provar que a rota responde sem depender de tenant**

Em outro terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/leads/publico \
  -H 'content-type: application/json' \
  -H 'origin: http://localhost:8080' \
  -d '{"restaurante":"Teste do Proxy","telefone":"(11) 98888-7777","plano":"Enterprise"}'
```

Expected: `201`.

Sem a guarda, esta chamada devolveria 404 quando o tenant `default` não existisse. Para provar que a guarda é o que a sustenta, comente o bloco, repita o curl com o banco sem o tenant `default` e observe o 404 — depois descomente.

- [ ] **Step 5: Conferir que o lead entrou**

```bash
npx prisma studio
```

Abra a tabela `Lead`: deve haver uma linha com `restaurante = "Teste do Proxy"`, `origem = "landing"`, `plano = "Enterprise"`.

Apague essa linha antes de seguir — é lixo de teste.

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts
git commit -m "$(cat <<'EOF'
Tira a captura de lead do pipeline de tenant

A rota pública da landing resolvia o slug "default" como qualquer requisição
da raiz, e por isso passaria a depender do restaurante de demonstração estar
lá. Removê-lo — que já está na mesa — derrubaria a captação de leads junto,
com 404 e sem ninguém relacionar uma coisa à outra.

Sair antes do findUnique corta essa dependência: a rota responde em qualquer
host, sem tenant, e sem x-tenant-id injetado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Landing chama o endpoint

**Files:**
- Modify: `~/Dev/MunoSellPage/index.html` (dentro do `<form id="leadForm">`, antes do `<button type="submit">`)
- Modify: `~/Dev/MunoSellPage/js/main.js` (bloco `Formulário → WhatsApp`, no fim do arquivo)

**Pré-requisito:** `/add-dir ~/Dev/MunoSellPage`. Este é outro repositório e gera commit próprio.

**Interfaces:**
- Consumes: o contrato de `POST /api/leads/publico` definido na Task 4.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: Adicionar o campo honeypot**

Em `~/Dev/MunoSellPage/index.html`, dentro do `<form id="leadForm" class="space-y-4">`, imediatamente antes do `<button type="submit" ...>`:

```html
          <!-- Honeypot: humano não vê, bot de formulário preenche. Escondido
               fora da tela em vez de display:none, que parte dos bots detecta
               e pula. aria-hidden e tabindex="-1" mantêm o campo fora do
               leitor de tela e da navegação por teclado. -->
          <div class="absolute left-[-9999px] w-px h-px overflow-hidden" aria-hidden="true">
            <label for="website">Não preencha este campo</label>
            <input type="text" id="website" name="website" tabindex="-1" autocomplete="off" />
          </div>
```

- [ ] **Step 2: Reescrever o handler do formulário**

Em `~/Dev/MunoSellPage/js/main.js`, substituir o bloco `/* ── Formulário → WhatsApp ─── */` inteiro por:

```js
  /* ── Formulário → WhatsApp + CRM ──────────────────── */
  const ENDPOINT_LEAD = 'https://www.munoapp.com.br/api/leads/publico';

  document.getElementById('leadForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('restaurantName').value.trim();
    const phone = document.getElementById('whatsappNumber').value.trim();
    const plan  = document.getElementById('planInterest').value;
    const trap  = document.getElementById('website')?.value ?? '';
    const msg   = `Olá! Tenho interesse no plano *${plan}* do MUNOFOOD para o estabelecimento *${name}*. Meu contato é ${phone}.`;

    // O window.open vem PRIMEIRO e síncrono, dentro do gesto do submit. Depois
    // de um await ou .then() o Safari do iOS trata a janela como não
    // solicitada e bloqueia — e iPhone é de onde vem o tráfego de Instagram.
    window.open(`https://wa.me/5512996419003?text=${encodeURIComponent(msg)}`, '_blank');

    // Grava em paralelo, sem esperar e sem poder atrapalhar: se o endpoint
    // estiver fora do ar, o lead se perde mas a conversa acontece. O caminho
    // que gera receita não depende do que gera relatório. keepalive para a
    // requisição sobreviver se a aba for descarregada.
    fetch(ENDPOINT_LEAD, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurante: name,
        telefone: phone,
        plano: plan,
        website: trap,
      }),
    }).catch(() => {});
  });
```

- [ ] **Step 3: Apontar o endpoint para o ambiente local**

Em `~/Dev/MunoSellPage/js/main.js`, troque **temporariamente** o valor da constante:

```js
  const ENDPOINT_LEAD = 'http://localhost:3000/api/leads/publico';
```

A rota aceita origem `localhost` fora de produção, então o CORS passa. O Step 5 devolve o valor de produção — não pule.

- [ ] **Step 4: Servir a landing local**

Com `npm run dev` do MunoApp rodando, em outro terminal:

```bash
cd ~/Dev/MunoSellPage && python3 -m http.server 8080
```

Abra `http://localhost:8080`.

- [ ] **Step 5: Verificar os três comportamentos no navegador**

1. Preencher e enviar → o WhatsApp abre em aba nova **e** o lead aparece no `prisma studio` com `origem = "landing"`.
2. Enviar de novo com o mesmo telefone → **nenhum lead novo**; o existente teve `restaurante`/`plano` atualizados.
3. No console do navegador, preencher o honeypot e enviar:

```js
document.getElementById('website').value = 'bot';
document.getElementById('leadForm').requestSubmit();
```

→ resposta 201 na aba Network e **nenhum lead novo** no banco.

- [ ] **Step 6: Restaurar o endpoint de produção**

Devolva `ENDPOINT_LEAD` para `https://www.munoapp.com.br/api/leads/publico`. Confirme antes de commitar:

```bash
grep -n "ENDPOINT_LEAD" ~/Dev/MunoSellPage/js/main.js
```

Expected: a constante apontando para `www.munoapp.com.br`, não localhost. Publicar com localhost quebra a captação inteira em produção, em silêncio.

- [ ] **Step 7: Commit no repositório da landing**

```bash
cd ~/Dev/MunoSellPage
git add index.html js/main.js
git commit -m "$(cat <<'EOF'
Registra no CRM quem preenche o formulário

O submit abria o WhatsApp e não guardava nada, então quem preenchia e não
concluía o envio — bloqueador de popup, desktop sem WhatsApp, desistência —
sumia sem deixar rastro.

A ordem importa: o window.open continua primeiro e síncrono, dentro do gesto
do submit, porque depois de um then() o Safari do iOS bloqueia a janela. A
gravação vai em paralelo e com catch vazio: endpoint fora do ar perde o lead,
nunca a conversa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Publicação

**Files:** nenhum. Passos manuais, na ordem.

- [ ] **Step 1: Configurar a origem permitida na Vercel**

```bash
npx vercel env add LANDING_ORIGIN production
```

Valor: `https://join.munoapp.com.br`

Sem esta variável a rota recusa toda origem cross-site — falha fechada, e a landing para de gravar sem quebrar nada visível.

- [ ] **Step 2: Conferir que o `.env.local` não foi contaminado**

```bash
cat .env.local
```

Expected: apenas `BLOB_READ_WRITE_TOKEN` e `VERCEL_OIDC_TOKEN`. Qualquer comando da Vercel pode escrever `DATABASE_URL` de produção ali, e o Next carrega esse arquivo com prioridade sobre o `.env`. Se aparecer `DATABASE_URL` ou `DIRECT_URL`, apague as duas linhas.

- [ ] **Step 3: Publicar o MunoApp primeiro**

```bash
git push
```

A Vercel roda `scripts/migrate-on-deploy.js` no build de produção e aplica a migração `plano_no_lead` antes de publicar. Migração que falha derruba o deploy em vez de publicar código esperando coluna inexistente.

- [ ] **Step 4: Confirmar que a rota está no ar**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS https://www.munoapp.com.br/api/leads/publico \
  -H 'origin: https://join.munoapp.com.br'
```

Expected: `204`.

Se vier `403`, o `LANDING_ORIGIN` não subiu — refaça o Step 1 e republique.

- [ ] **Step 5: Publicar a landing**

```bash
cd ~/Dev/MunoSellPage && git push
```

Esta ordem importa: landing primeiro significa `fetch` para um endpoint inexistente, que cai no `catch` e some. Erro sem consequência visível, mas com lead perdido.

- [ ] **Step 6: Teste de ponta a ponta em produção**

Abra `https://join.munoapp.com.br`, preencha com um nome reconhecível ("Teste de Lançamento") e envie. Confirme:

1. O WhatsApp abre com a mensagem preenchida.
2. O lead aparece em `https://admin.munoapp.com.br/leads`, com origem `landing` e o plano.

Apague o lead de teste pelo painel depois.

---

## Ordem e dependências

```
Task 1 (coluna) ─┐
Task 2 (limitador) ─┼─► Task 4 (rota) ─► Task 5 (proxy) ─► Task 6 (landing) ─► Task 7 (publicação)
Task 3 (decisão) ─┘
```

Tasks 1, 2 e 3 são independentes entre si e podem ser feitas em qualquer ordem. Task 4 precisa das três.
