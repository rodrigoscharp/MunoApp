# Saúde do sistema: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela "Saúde" no console da plataforma com semáforo das peças críticas e feed de eventos, mais uma rota que um monitor externo consulta para avisar quando algo fica vermelho.

**Architecture:** Eventos de sistema gravados numa tabela nova `EventoSistema` por `registrarSaude()` (que `reportarErro()` passa a chamar). `coletarDadosDeSaude()` lê o banco; `avaliarSaude()`, função pura, transforma a leitura em peças coloridas. A tela e a rota `/api/health/sistema` usam as duas, então nunca discordam.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts`), Prisma 6 + Postgres (Supabase), Vitest 4, Tailwind v4 com os tokens `console-*`.

**Spec:** `docs/superpowers/specs/2026-10-07-saude-do-sistema-design.md`

## Global Constraints

- Branch: `feat/saude-do-sistema`. Nada vai para `main` sem revisão.
- Banco de desenvolvimento é o Postgres local (`docker compose up -d`, porta 5433). Nunca rodar migração contra produção; `npm run db:migrate` passa pela trava `guard-local-db.js`.
- Toda tabela nova: `ENABLE ROW LEVEL SECURITY` na migração, sem policy.
- Migração só adiciona (tabela, enum, índice). Nada de `DROP` ou `RENAME`.
- Todo arquivo que importa `prismaUnscoped` precisa de entrada em `USO_DE_PRISMA_UNSCOPED` (`src/security/invariantes.test.ts`), com motivo.
- Toda rota de API nova precisa de entrada em `src/security/politica-de-acesso.ts`, e recusar antes de tocar o banco.
- Todo ramo novo de `src/proxy.ts` que sai antes do pipeline de tenant encaminha com `semTenant`.
- `extra` e `mensagem` de evento: só ids e contagens. Nunca e-mail, telefone, corpo, cabeçalho ou query string. Mensagem passa por `semEmail()` e é cortada em 500 caracteres.
- Gravar evento nunca lança e nunca chama `reportarErro` em caso de falha.
- Cópia da interface em português, sem travessão em prosa (use vírgula ou conjunção).
- Horas exibidas e agregadas em `America/Sao_Paulo` (`FUSO` de `src/lib/platform-series.ts`).
- Testes: `npm test` (unidade) e `npm run test:integracao` (Postgres local, banco `muno_teste`). Lint: `npm run lint`.
- Commits em português, descritivos, terminando com `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

1. **Banco fora do ar.** A tela e a rota do monitor não podem responder 500; a rota responde 503 com `["banco"]` e as outras peças ficam `neutro`. Testes: Task 4 (`avaliarSaude` com `leitura: null`) e Task 7 (rota com coleta que reporta banco caído).
2. **Primeiro deploy.** A tabela nasce vazia; o cron só roda às 09:00 UTC. Sem tolerância, o monitor gritaria "cron vermelho" a noite inteira depois do deploy. Regra: sem nenhum sinal do cron e com o evento mais antigo da tabela mais novo que 50 h, a peça é amarela ("aguardando a primeira execução"). Teste na Task 4.
3. **Origem classificada na peça errada.** `webhook/asaas:boas-vindas` é falha de e-mail, não de webhook; se cair no webhook, um e-mail que falhou acende o webhook de vermelho. Teste na Task 3 (`classificarOrigem`).
4. **Token do monitor vazio ou malformado.** `HEALTH_MONITOR_TOKEN=""`, `Authorization: Bearer ` sem valor, token de tamanho diferente: todos 401, sem tocar o banco e sem lançar no `timingSafeEqual`. Teste na Task 7.
5. **Madrugada e restaurante pequeno.** Média histórica abaixo de 5 pedidos na hora deixa a peça `neutro`, nunca amarela; zero pedidos às 4h não pode acender nada. Teste na Task 4.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | `NivelEvento`, `EventoSistema`, índice `Order.createdAt` |
| `prisma/migrations/20261007120000_saude_do_sistema/migration.sql` | cria o acima, liga RLS |
| `src/lib/saude/limiares.ts` | todas as constantes das regras |
| `src/lib/saude/origens.ts` | `ChavePeca`, `classificarOrigem()` |
| `src/lib/saude/tempo.ts` | `tempoDesde()` |
| `src/lib/saude/registrar.ts` | `registrarSaude()` |
| `src/lib/saude/avaliar.ts` | `avaliarSaude()`, tipos `DadosDeSaude`, `Saude`, `Peca`, `Cor` |
| `src/lib/saude/pedidos.ts` | `montarPedidosPorHora()`, `horaEmBrasilia()` |
| `src/lib/saude/filtros.ts` | `lerFiltros()`, `hrefDoFiltro()` do feed |
| `src/lib/saude/coletar.ts` | `coletarDadosDeSaude()`, `coletarPedidosPorHora()`, `listarEventos()` |
| `src/lib/saude/expurgo.ts` | `expurgarEventosDeSaude()` |
| `src/test-setup/sem-saude.ts` | mock global de `registrarSaude` nos testes de unidade |
| `src/lib/observabilidade.ts` | `reportarErro` grava `ERRO`; exporta `semEmail` |
| `src/app/api/cron/assinaturas/route.ts` | etapa de expurgo + sinal `OK`/`AVISO` |
| `src/app/api/assinaturas/webhook/asaas/route.ts` | sinal `OK` |
| `src/app/api/payments/webhook/[provider]/[tenantId]/route.ts` | sinal `OK` + `reportarErro` no `catch` |
| `src/lib/assinatura/provisionamento.ts` | sinal `OK` |
| `src/app/api/health/sistema/route.ts` | rota do monitor |
| `src/proxy.ts` | ramo de `/api/health/sistema` |
| `src/app/platform/saude/page.tsx` | a tela |
| `src/components/platform/saude/*` | grade, feed, auto-atualização, cores |
| `src/components/platform/MenuLateral.tsx`, `IconesConsole.tsx` | item "Saúde" |
| `AGENTS.md` | seção nova "A saúde do sistema" |

---

### Task 1: Model, migração e índice

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261007120000_saude_do_sistema/migration.sql`

**Interfaces:**
- Produces: model Prisma `eventoSistema` (`id`, `origem`, `nivel: NivelEvento`, `mensagem`, `tenantId: string | null`, `extra: Json | null`, `criadoEm`), enum `NivelEvento` = `"OK" | "AVISO" | "ERRO"`, exportado por `@prisma/client`.

- [ ] **Step 1: Subir o banco local**

Run: `docker compose up -d`
Expected: container `muno-db-dev` up.

- [ ] **Step 2: Acrescentar ao fim de `prisma/schema.prisma`**

```prisma
enum NivelEvento {
  OK
  AVISO
  ERRO
}

// Registro de plataforma, como Lead: não pertence a um restaurante. O tenantId é
// só um rótulo para filtrar, sem relação, para que remover um cliente não apague
// o histórico de falhas que o envolveu. Por ser opcional, o model fica fora de
// TENANT_SCOPED_MODELS e de ORDEM_DE_EXCLUSAO, que tratam tenantId obrigatório.
//
// Quem escreve é registrarSaude() (src/lib/saude/registrar.ts), e só ele.
// Expurgado com 30 dias pelo cron diário.
model EventoSistema {
  id       String      @id @default(cuid())
  origem   String
  nivel    NivelEvento
  mensagem String
  tenantId String?
  extra    Json?
  criadoEm DateTime    @default(now())

  @@index([origem, criadoEm])
  @@index([nivel, criadoEm])
  @@index([tenantId, criadoEm])
  @@index([criadoEm])
}
```

E, dentro de `model Order`, logo depois de `@@index([couponId, userId])`:

```prisma
  @@index([createdAt]) // volume da plataforma inteira, na tela de saúde
```

- [ ] **Step 3: Gerar a migração sem aplicar**

Run: `npm run db:migrate -- --create-only --name saude_do_sistema`
Expected: pasta nova `prisma/migrations/<timestamp>_saude_do_sistema/`. Renomear a pasta para `20261007120000_saude_do_sistema` (mantém a ordem com as anteriores).

- [ ] **Step 4: Acrescentar RLS ao fim do `migration.sql` gerado**

```sql
-- Tabela da plataforma, nunca lida pela chave pública. RLS sem policy: nega
-- tudo para anon e authenticated, e não muda nada para a aplicação, que
-- conecta como postgres (BYPASSRLS). Ver 20260810200000_rls_nas_tabelas_de_plataforma.
ALTER TABLE "EventoSistema" ENABLE ROW LEVEL SECURITY;
```

Conferir que o arquivo tem `CREATE TYPE "NivelEvento"`, `CREATE TABLE "EventoSistema"`, os quatro `CREATE INDEX` de `EventoSistema` e `CREATE INDEX "Order_createdAt_idx"`. Nenhum `DROP`.

- [ ] **Step 5: Aplicar e gerar o client**

Run: `npm run db:migrate`
Expected: "All migrations have been successfully applied" (ou "Already in sync" depois de aplicar), e o client gerado.

- [ ] **Step 6: Rodar os testes de schema e da suíte de segurança**

Run: `npx vitest run src/lib/tenant-scoped-models.test.ts src/lib/tenant-removal.test.ts src/security/invariantes.test.ts`
Expected: PASS. (`tenantId String?` não conta como obrigatório; a migração tem `ENABLE ROW LEVEL SECURITY`.)

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261007120000_saude_do_sistema
git commit -m "Saúde: tabela EventoSistema e índice de pedidos por data

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `registrarSaude` e o mock global dos testes

**Files:**
- Create: `src/lib/saude/registrar.ts`
- Create: `src/lib/saude/registrar.test.ts`
- Create: `src/test-setup/sem-saude.ts`
- Modify: `vitest.config.mts`
- Modify: `src/lib/observabilidade.ts` (só exportar `semEmail`)
- Modify: `src/security/invariantes.test.ts` (`USO_DE_PRISMA_UNSCOPED`)

**Interfaces:**
- Consumes: `prismaUnscoped.eventoSistema` (Task 1).
- Produces:
  ```ts
  export type EventoDeSaude = {
    origem: string;
    nivel: NivelEvento;            // de @prisma/client
    mensagem: string;
    tenantId?: string | null;
    extra?: Record<string, string | number | boolean | null | undefined>;
  };
  export async function registrarSaude(evento: EventoDeSaude): Promise<void>;
  ```
  E `export function semEmail(texto: string): string` em `src/lib/observabilidade.ts`.

**Por que o mock global:** `reportarErro` é chamado por dezenas de testes que não mockam o Prisma. Sem o mock, cada um tentaria gravar no Postgres local de verdade (o Prisma lê `.env` sozinho). O setup mocka `registrarSaude` em toda a suíte de unidade; o próprio teste do registrar usa `vi.importActual`.

- [ ] **Step 1: Exportar `semEmail`**

Em `src/lib/observabilidade.ts`, trocar `function semEmail(` por `export function semEmail(`.

- [ ] **Step 2: Criar o setup global**

`src/test-setup/sem-saude.ts`:

```ts
import { vi } from "vitest";

/**
 * Nos testes de unidade, ninguém grava evento de saúde.
 *
 * reportarErro() chama registrarSaude(), e dezenas de testes passam por
 * reportarErro sem mockar o Prisma. Sem isto, cada um tentaria escrever no
 * Postgres local de verdade, porque o Prisma lê o .env sozinho. Quem precisa
 * do comportamento real (src/lib/saude/registrar.test.ts) usa vi.importActual.
 */
vi.mock("@/lib/saude/registrar", () => ({
  registrarSaude: vi.fn(async () => {}),
}));
```

Em `vitest.config.mts`, dentro de `test`, depois de `exclude`:

```ts
    // Mock global de registrarSaude: ver o comentário no arquivo.
    setupFiles: ["src/test-setup/sem-saude.ts"],
```

- [ ] **Step 3: Escrever o teste que falha**

`src/lib/saude/registrar.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { eventoSistema: { create: (...a: unknown[]) => create(...a) } },
}));

// O setup global mocka este módulo; aqui se testa o de verdade.
const { registrarSaude } = await vi.importActual<typeof import("./registrar")>("./registrar");

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  create.mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("registrarSaude", () => {
  it("grava origem, nível, mensagem, tenant e extra", async () => {
    create.mockResolvedValue({});
    await registrarSaude({
      origem: "webhook/asaas",
      nivel: "OK",
      mensagem: "PAYMENT_CONFIRMED processado",
      tenantId: "t1",
      extra: { inscricaoId: "i1", vazio: undefined },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        origem: "webhook/asaas",
        nivel: "OK",
        mensagem: "PAYMENT_CONFIRMED processado",
        tenantId: "t1",
        extra: { inscricaoId: "i1" },
      },
    });
  });

  it("mascara e-mail e corta a mensagem em 500 caracteres", async () => {
    create.mockResolvedValue({});
    await registrarSaude({ origem: "x", nivel: "ERRO", mensagem: `ana@pizzaria.com ${"a".repeat(600)}` });
    const { mensagem } = create.mock.calls[0][0].data;
    expect(mensagem).not.toContain("ana@pizzaria.com");
    expect(mensagem.length).toBe(500);
  });

  it("sem tenant e sem extra grava nulo", async () => {
    create.mockResolvedValue({});
    await registrarSaude({ origem: "x", nivel: "OK", mensagem: "m" });
    expect(create.mock.calls[0][0].data).toMatchObject({ tenantId: null, extra: undefined });
  });

  it("nunca lança quando o banco rejeita", async () => {
    create.mockRejectedValue(new Error("connection refused"));
    await expect(registrarSaude({ origem: "x", nivel: "ERRO", mensagem: "m" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it("desiste depois de 2 segundos, sem lançar", async () => {
    vi.useFakeTimers();
    create.mockReturnValue(new Promise(() => {}));
    const promessa = registrarSaude({ origem: "x", nivel: "ERRO", mensagem: "m" });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promessa).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/lib/saude/registrar.test.ts`
Expected: FAIL, módulo `./registrar` não existe.

- [ ] **Step 5: Implementar**

`src/lib/saude/registrar.ts`:

```ts
import type { NivelEvento, Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { semEmail } from "@/lib/observabilidade";

/**
 * O único ponto que escreve EventoSistema.
 *
 * Duas regras, as mesmas de registrarEvento do funil: nunca lança (gravar
 * saúde não pode derrubar um pagamento) e nunca leva dado pessoal (só ids e
 * contagens em `extra`; a mensagem passa por semEmail).
 *
 * Uma terceira, própria daqui: a falha de gravação NÃO chama reportarErro.
 * reportarErro chama esta função, e quando o problema é o banco isso viraria
 * um laço. A falha fica só no console.
 */
export type EventoDeSaude = {
  origem: string;
  nivel: NivelEvento;
  mensagem: string;
  tenantId?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

/** Um webhook não pode ficar preso esperando um banco lento só para registrar. */
const TIMEOUT_MS = 2000;

function semIndefinidos(extra: EventoDeSaude["extra"]): Prisma.InputJsonObject | undefined {
  if (!extra) return undefined;
  return Object.fromEntries(
    Object.entries(extra).filter(([, v]) => v !== undefined)
  ) as Prisma.InputJsonObject;
}

export async function registrarSaude(evento: EventoDeSaude): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const gravacao = prismaUnscoped.eventoSistema.create({
      data: {
        origem: evento.origem.slice(0, 200),
        nivel: evento.nivel,
        mensagem: semEmail(evento.mensagem).slice(0, 500),
        tenantId: evento.tenantId ?? null,
        extra: semIndefinidos(evento.extra),
      },
    });
    const limite = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(() => rejeitar(new Error("timeout ao gravar evento de saúde")), TIMEOUT_MS);
    });
    await Promise.race([gravacao, limite]);
  } catch (erro) {
    console.error(
      `[saude] falha ao registrar ${evento.origem}`,
      erro instanceof Error ? erro.message : erro
    );
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 6: Registrar o uso de `prismaUnscoped`**

Em `src/security/invariantes.test.ts`, dentro de `USO_DE_PRISMA_UNSCOPED`, depois da entrada de `src/lib/retencao.ts`:

```ts
  "src/lib/saude/registrar.ts":
    "evento de saúde da plataforma, gravado por qualquer rota, sem tenant",
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run src/lib/saude/registrar.test.ts src/security/invariantes.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/saude/registrar.ts src/lib/saude/registrar.test.ts src/test-setup/sem-saude.ts vitest.config.mts src/lib/observabilidade.ts src/security/invariantes.test.ts
git commit -m "Saúde: registrarSaude, que grava evento sem nunca lançar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Limiares, classificação de origem e tempo relativo

**Files:**
- Create: `src/lib/saude/limiares.ts`
- Create: `src/lib/saude/origens.ts`
- Create: `src/lib/saude/origens.test.ts`
- Create: `src/lib/saude/tempo.ts`
- Create: `src/lib/saude/tempo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // limiares.ts
  export const LIMIARES: { bancoLentoMs: 500; cronAmareloH: 26; cronVermelhoH: 50;
    janelaDeEventosH: 50; provisionamentoAmareloMin: 15; provisionamentoVermelhoMin: 60;
    pagamentosVermelhoNaHora: 3; emailVermelhoNaHora: 3; rotasAmareloNaHora: 1;
    rotasVermelhoNaHora: 10; pedidosMediaMinima: 5; semanasDeComparacao: 4;
    diasDeRetencao: 30; eventosNoFeed: 100; eventosLidosNoFeed: 500 };
  // origens.ts
  export type ChavePeca = "banco" | "cron" | "webhook-asaas" | "provisionamento"
    | "pagamentos" | "email" | "rotas" | "pedidos";
  export const ORIGEM_DO_CRON = "cron/assinaturas";
  export const ORIGEM_DO_PROVISIONAMENTO = "provisionamento";
  export function classificarOrigem(origem: string): ChavePeca | null;
  // tempo.ts
  export function tempoDesde(d: Date, agora: Date): string;
  ```

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/saude/origens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classificarOrigem } from "./origens";

describe("classificarOrigem", () => {
  it.each([
    // E-mail vem antes do webhook: a falha de boas-vindas do webhook é de e-mail.
    ["webhook/asaas:boas-vindas", "email"],
    ["cron/reconciliacao:boas-vindas", "email"],
    ["assinar/reconciliar:boas-vindas", "email"],
    ["forgot-password:envio", "email"],
    ["webhook/asaas", "webhook-asaas"],
    ["webhook/asaas:pagamento-sem-inscricao", "webhook-asaas"],
    ["route:/api/assinaturas/webhook/asaas", "webhook-asaas"],
    ["webhook/pagamento", "pagamentos"],
    ["webhook/pagamento:valor-menor", "pagamentos"],
    ["route:/api/payments/webhook/[provider]/[tenantId]", "pagamentos"],
    ["cron/assinaturas", "cron"],
    ["cron/assinaturas:faxina", "cron"],
    ["cron/reconciliacao-cobrancas", "cron"],
    ["route:/api/cron/assinaturas", "cron"],
    ["route:/api/orders/[id]", "rotas"],
    ["render:/adm/menu", "rotas"],
    ["action:/adm/restaurante", "rotas"],
    ["proxy:/", "rotas"],
  ])("%s é %s", (origem, peca) => {
    expect(classificarOrigem(origem)).toBe(peca);
  });

  it.each(["assinar:criar-assinatura", "orders:cancelado-pago", "provisionamento", "qualquer-coisa"])(
    "%s não pertence a peça nenhuma, só ao feed",
    (origem) => {
      expect(classificarOrigem(origem)).toBeNull();
    }
  );
});
```

`src/lib/saude/tempo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tempoDesde } from "./tempo";

const AGORA = new Date("2026-10-07T15:00:00Z");
const antes = (ms: number) => new Date(AGORA.getTime() - ms);
const MIN = 60_000;

describe("tempoDesde", () => {
  it.each([
    [30_000, "agora"],
    [5 * MIN, "há 5 min"],
    [59 * MIN, "há 59 min"],
    [60 * MIN, "há 1 h"],
    [47 * 60 * MIN, "há 47 h"],
    [48 * 60 * MIN, "há 2 dias"],
  ])("%i ms atrás é %s", (ms, texto) => {
    expect(tempoDesde(antes(ms), AGORA)).toBe(texto);
  });

  it("data no futuro (relógio adiantado) vira agora", () => {
    expect(tempoDesde(new Date(AGORA.getTime() + MIN), AGORA)).toBe("agora");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/saude/origens.test.ts src/lib/saude/tempo.test.ts`
Expected: FAIL, módulos não existem.

- [ ] **Step 3: Implementar**

`src/lib/saude/limiares.ts`:

```ts
/**
 * Todos os números das regras de saúde, num lugar só.
 *
 * Foram escolhidos antes de existir dado real. Ajuste aqui depois de ver o
 * comportamento em produção; nenhum outro arquivo deve ter um limiar escrito.
 */
export const LIMIARES = {
  /** Banco respondendo mais devagar que isto fica amarelo. */
  bancoLentoMs: 500,
  /** O cron roda uma vez por dia; 26 h dá duas horas de folga. */
  cronAmareloH: 26,
  /** Perdeu dois dias seguidos. */
  cronVermelhoH: 50,
  /** Quantas horas de evento a avaliação lê. Cobre a janela do cron. */
  janelaDeEventosH: 50,
  provisionamentoAmareloMin: 15,
  provisionamentoVermelhoMin: 60,
  pagamentosVermelhoNaHora: 3,
  emailVermelhoNaHora: 3,
  rotasAmareloNaHora: 1,
  rotasVermelhoNaHora: 10,
  /** Abaixo desta média histórica na hora, zero pedidos não é sinal de nada. */
  pedidosMediaMinima: 5,
  semanasDeComparacao: 4,
  diasDeRetencao: 30,
  eventosNoFeed: 100,
  /** O filtro por peça é feito em memória sobre este tanto de linhas. */
  eventosLidosNoFeed: 500,
} as const;
```

`src/lib/saude/origens.ts`:

```ts
/**
 * A que peça do semáforo pertence um evento, pela origem.
 *
 * As origens seguem a convenção que reportarErro já usava ("area/detalhe",
 * "area/detalhe:subcaso"), mais as do onRequestError ("route:/api/...",
 * "render:/...", "action:/...", "proxy:/..."). Casa por prefixo, então um
 * reportarErro novo aparece no feed sem mudar nada aqui.
 *
 * A ORDEM IMPORTA. E-mail vem primeiro porque o provisionamento reporta a
 * falha de boas-vindas como "<quem chamou>:boas-vindas", e quem chamou pode
 * ser o webhook do Asaas. Se o webhook viesse antes, um e-mail que falhou
 * acenderia o webhook.
 */
export type ChavePeca =
  | "banco"
  | "cron"
  | "webhook-asaas"
  | "provisionamento"
  | "pagamentos"
  | "email"
  | "rotas"
  | "pedidos";

/** O sinal de vida do cron diário. As etapas usam "cron/assinaturas:<etapa>". */
export const ORIGEM_DO_CRON = "cron/assinaturas";
export const ORIGEM_DO_PROVISIONAMENTO = "provisionamento";

const ERRO_NAO_TRATADO = /^(render|route|action|proxy):/;

export function classificarOrigem(origem: string): ChavePeca | null {
  if (origem.endsWith(":boas-vindas") || origem.startsWith("forgot-password")) return "email";
  if (origem.startsWith("webhook/asaas") || origem.startsWith("route:/api/assinaturas/webhook")) {
    return "webhook-asaas";
  }
  if (origem.startsWith("webhook/pagamento") || origem.startsWith("route:/api/payments/webhook")) {
    return "pagamentos";
  }
  if (origem.startsWith("cron/") || origem.startsWith("route:/api/cron")) return "cron";
  if (ERRO_NAO_TRATADO.test(origem)) return "rotas";
  return null;
}
```

`src/lib/saude/tempo.ts`:

```ts
const MIN = 60_000;
const HORA = 60 * MIN;

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function tempoDesde(d: Date, agora: Date): string {
  const ms = agora.getTime() - d.getTime();
  if (ms < MIN) return "agora";
  if (ms < HORA) return `há ${Math.floor(ms / MIN)} min`;
  if (ms < 48 * HORA) return `há ${Math.floor(ms / HORA)} h`;
  return `há ${Math.floor(ms / (24 * HORA))} dias`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/saude/origens.test.ts src/lib/saude/tempo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/saude/limiares.ts src/lib/saude/origens.ts src/lib/saude/origens.test.ts src/lib/saude/tempo.ts src/lib/saude/tempo.test.ts
git commit -m "Saúde: limiares, classificação de origem e tempo relativo

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `avaliarSaude`, a regra das peças

**Files:**
- Create: `src/lib/saude/avaliar.ts`
- Create: `src/lib/saude/avaliar.test.ts`

**Interfaces:**
- Consumes: `LIMIARES`, `ChavePeca`, `classificarOrigem`, `ORIGEM_DO_PROVISIONAMENTO` (Task 3), `tempoDesde` (Task 3), `NivelEvento` (Task 1).
- Produces:
  ```ts
  export type Cor = "verde" | "amarelo" | "vermelho" | "neutro";
  export type Peca = { chave: ChavePeca; nome: string; cor: Cor; motivo: string; ultimoSinal: Date | null };
  export type Saude = { geral: Cor; resumo: string; pecas: Peca[] };
  export type EventoResumido = { origem: string; nivel: NivelEvento; criadoEm: Date };
  export type LeituraDeSaude = {
    eventos: EventoResumido[];               // últimas LIMIARES.janelaDeEventosH horas
    ultimoCron: EventoResumido | null;       // último OK/AVISO de ORIGEM_DO_CRON, sem limite de tempo
    primeiroEvento: Date | null;             // evento mais antigo da tabela
    inscricoesPagas: { total: number; maisAntiga: Date | null };
    pedidos: { naUltimaHora: number; mesmaHoraAntes: number[]; ultimoPedido: Date | null };
  };
  export type DadosDeSaude = { banco: { ok: boolean; ms: number }; leitura: LeituraDeSaude | null };
  export function avaliarSaude(dados: DadosDeSaude, agora: Date): Saude;
  ```
  `pecas` sempre na ordem: banco, cron, webhook-asaas, provisionamento, pagamentos, email, rotas, pedidos.

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/saude/avaliar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avaliarSaude, type DadosDeSaude, type EventoResumido, type LeituraDeSaude } from "./avaliar";
import type { ChavePeca } from "./origens";

const AGORA = new Date("2026-10-10T23:00:00Z"); // sábado, 20h em Brasília
const H = 3_600_000;
const MIN = 60_000;
const ha = (ms: number) => new Date(AGORA.getTime() - ms);
const ev = (origem: string, nivel: EventoResumido["nivel"], msAtras: number): EventoResumido => ({
  origem,
  nivel,
  criadoEm: ha(msAtras),
});

function leitura(parcial: Partial<LeituraDeSaude> = {}): LeituraDeSaude {
  return {
    eventos: [],
    ultimoCron: ev("cron/assinaturas", "OK", 10 * H),
    primeiroEvento: ha(10 * 24 * H),
    inscricoesPagas: { total: 0, maisAntiga: null },
    pedidos: { naUltimaHora: 12, mesmaHoraAntes: [10, 11, 9, 12], ultimoPedido: ha(2 * MIN) },
    ...parcial,
  };
}
const dados = (parcial: Partial<LeituraDeSaude> = {}, banco = { ok: true, ms: 20 }): DadosDeSaude => ({
  banco,
  leitura: leitura(parcial),
});
const peca = (d: DadosDeSaude, chave: ChavePeca) => avaliarSaude(d, AGORA).pecas.find((p) => p.chave === chave)!;

describe("avaliarSaude: estado geral", () => {
  it("tudo verde diz que está tudo funcionando", () => {
    const s = avaliarSaude(dados(), AGORA);
    expect(s.geral).toBe("verde");
    expect(s.resumo).toBe("Tudo funcionando");
    expect(s.pecas.map((p) => p.chave)).toEqual([
      "banco", "cron", "webhook-asaas", "provisionamento", "pagamentos", "email", "rotas", "pedidos",
    ]);
  });

  it("geral é a pior cor, e o resumo cita a peça e quantas mais", () => {
    const s = avaliarSaude(
      dados({
        inscricoesPagas: { total: 1, maisAntiga: ha(2 * H) },
        eventos: [ev("route:/api/orders/[id]", "ERRO", 5 * MIN)],
      }),
      AGORA
    );
    expect(s.geral).toBe("vermelho");
    expect(s.resumo).toMatch(/^Provisionamento: /);
    expect(s.resumo).toMatch(/\(e mais 1\)$/);
  });

  it("neutro não conta para o geral", () => {
    const s = avaliarSaude(dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 1, 0, 0], ultimoPedido: null } }), AGORA);
    expect(peca(dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 1, 0, 0], ultimoPedido: null } }), "pedidos").cor).toBe("neutro");
    expect(s.geral).toBe("verde");
  });
});

describe("banco", () => {
  it("fora do ar: banco vermelho e as outras peças neutras", () => {
    const s = avaliarSaude({ banco: { ok: false, ms: 3000 }, leitura: null }, AGORA);
    expect(s.geral).toBe("vermelho");
    expect(s.pecas[0]).toMatchObject({ chave: "banco", cor: "vermelho" });
    expect(s.pecas.slice(1).every((p) => p.cor === "neutro")).toBe(true);
  });
  it("lento é amarelo", () => {
    expect(peca(dados({}, { ok: true, ms: 501 }), "banco").cor).toBe("amarelo");
    expect(peca(dados({}, { ok: true, ms: 500 }), "banco").cor).toBe("verde");
  });
});

describe("cron", () => {
  it.each([
    [25 * H, "verde"],
    [27 * H, "amarelo"],
    [49 * H, "amarelo"],
    [51 * H, "vermelho"],
  ])("último sinal há %i ms é %s", (ms, cor) => {
    expect(peca(dados({ ultimoCron: ev("cron/assinaturas", "OK", ms) }), "cron").cor).toBe(cor);
  });

  it("rodou com etapa em erro (AVISO) é amarelo", () => {
    expect(peca(dados({ ultimoCron: ev("cron/assinaturas", "AVISO", H) }), "cron").cor).toBe("amarelo");
  });

  it("erro do cron depois do último sinal (morreu no meio) é amarelo", () => {
    const d = dados({ ultimoCron: ev("cron/assinaturas", "OK", 20 * H), eventos: [ev("route:/api/cron/assinaturas", "ERRO", H)] });
    expect(peca(d, "cron").cor).toBe("amarelo");
  });

  it("erro de etapa ANTES do sinal não pesa: o sinal já veio como AVISO ou OK", () => {
    const d = dados({ ultimoCron: ev("cron/assinaturas", "OK", H), eventos: [ev("cron/assinaturas:faxina", "ERRO", H + MIN)] });
    expect(peca(d, "cron").cor).toBe("verde");
  });

  it("sem sinal nenhum, com a tabela nova (primeiro deploy), é amarelo", () => {
    const d = dados({ ultimoCron: null, primeiroEvento: ha(3 * H) });
    expect(peca(d, "cron")).toMatchObject({ cor: "amarelo", motivo: "aguardando a primeira execução registrada" });
    expect(peca(dados({ ultimoCron: null, primeiroEvento: null }), "cron").cor).toBe("amarelo");
  });

  it("sem sinal nenhum, com a tabela antiga, é vermelho", () => {
    expect(peca(dados({ ultimoCron: null, primeiroEvento: ha(51 * H) }), "cron").cor).toBe("vermelho");
  });
});

describe("webhook do Asaas", () => {
  it("sem evento é verde: dia sem pagamento é normal", () => {
    expect(peca(dados(), "webhook-asaas").cor).toBe("verde");
  });
  it("evento mais recente com erro é vermelho", () => {
    const d = dados({ eventos: [ev("webhook/asaas", "OK", 2 * H), ev("webhook/asaas:pagamento-sem-inscricao", "ERRO", H)] });
    expect(peca(d, "webhook-asaas").cor).toBe("vermelho");
  });
  it("erro nas últimas 24 h seguido de sucesso é amarelo", () => {
    const d = dados({ eventos: [ev("route:/api/assinaturas/webhook/asaas", "ERRO", 2 * H), ev("webhook/asaas", "OK", H)] });
    expect(peca(d, "webhook-asaas").cor).toBe("amarelo");
  });
  it("erro de boas-vindas não acende o webhook", () => {
    const d = dados({ eventos: [ev("webhook/asaas:boas-vindas", "ERRO", H)] });
    expect(peca(d, "webhook-asaas").cor).toBe("verde");
    expect(peca(d, "email").cor).toBe("amarelo");
  });
});

describe("provisionamento", () => {
  it.each([
    [10 * MIN, "verde"],
    [16 * MIN, "amarelo"],
    [61 * MIN, "vermelho"],
  ])("inscrição paga há %i ms é %s", (ms, cor) => {
    expect(peca(dados({ inscricoesPagas: { total: 1, maisAntiga: ha(ms) } }), "provisionamento").cor).toBe(cor);
  });
  it("sem inscrição paga esperando é verde", () => {
    expect(peca(dados(), "provisionamento").cor).toBe("verde");
  });
});

describe("pagamentos, e-mail e rotas", () => {
  it("pagamentos: 3 erros na hora é vermelho, 1 em 24 h é amarelo", () => {
    const tres = [1, 2, 3].map((i) => ev("webhook/pagamento", "ERRO", i * MIN));
    expect(peca(dados({ eventos: tres }), "pagamentos").cor).toBe("vermelho");
    expect(peca(dados({ eventos: [ev("webhook/pagamento", "ERRO", 5 * H)] }), "pagamentos").cor).toBe("amarelo");
  });
  it("e-mail: 3 na hora é vermelho", () => {
    const tres = [1, 2, 3].map((i) => ev("forgot-password:envio", "ERRO", i * MIN));
    expect(peca(dados({ eventos: tres }), "email").cor).toBe("vermelho");
  });
  it("rotas: 1 na hora é amarelo, 10 é vermelho, erro de ontem não conta", () => {
    expect(peca(dados({ eventos: [ev("render:/adm", "ERRO", 5 * MIN)] }), "rotas").cor).toBe("amarelo");
    const dez = Array.from({ length: 10 }, (_, i) => ev("render:/adm", "ERRO", (i + 1) * MIN));
    expect(peca(dados({ eventos: dez }), "rotas").cor).toBe("vermelho");
    expect(peca(dados({ eventos: [ev("render:/adm", "ERRO", 2 * H)] }), "rotas").cor).toBe("verde");
  });
  it("evento OK nunca conta como erro", () => {
    const oks = Array.from({ length: 10 }, (_, i) => ev("webhook/pagamento", "OK", (i + 1) * MIN));
    expect(peca(dados({ eventos: oks }), "pagamentos").cor).toBe("verde");
  });
});

describe("pedidos", () => {
  it("zero na última hora quando o normal é 5 ou mais é amarelo", () => {
    const d = dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [5, 6, 4, 5], ultimoPedido: ha(3 * H) } });
    expect(peca(d, "pedidos").cor).toBe("amarelo");
  });
  it("madrugada (média abaixo de 5) é neutro, mesmo com zero", () => {
    const d = dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 0, 1, 0], ultimoPedido: ha(6 * H) } });
    expect(peca(d, "pedidos").cor).toBe("neutro");
  });
  it("nunca fica vermelho", () => {
    const d = dados({ pedidos: { naUltimaHora: 0, mesmaHoraAntes: [100, 100, 100, 100], ultimoPedido: null } });
    expect(peca(d, "pedidos").cor).toBe("amarelo");
  });
  it("sem histórico (lista vazia) é neutro", () => {
    const d = dados({ pedidos: { naUltimaHora: 3, mesmaHoraAntes: [], ultimoPedido: ha(MIN) } });
    expect(peca(d, "pedidos").cor).toBe("neutro");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/saude/avaliar.test.ts`
Expected: FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/saude/avaliar.ts`:

```ts
import type { NivelEvento } from "@prisma/client";
import { LIMIARES } from "./limiares";
import { classificarOrigem, ORIGEM_DO_PROVISIONAMENTO, type ChavePeca } from "./origens";
import { tempoDesde } from "./tempo";

/**
 * A regra da saúde, sem banco: recebe o que coletar.ts leu e devolve as
 * peças coloridas. A tela e a rota do monitor chamam esta mesma função, então
 * se uma diz vermelho a outra diz 503.
 *
 * Os números vêm todos de LIMIARES. Nenhum limiar escrito aqui.
 */
export type Cor = "verde" | "amarelo" | "vermelho" | "neutro";
export type Peca = { chave: ChavePeca; nome: string; cor: Cor; motivo: string; ultimoSinal: Date | null };
export type Saude = { geral: Cor; resumo: string; pecas: Peca[] };
export type EventoResumido = { origem: string; nivel: NivelEvento; criadoEm: Date };
export type LeituraDeSaude = {
  eventos: EventoResumido[];
  ultimoCron: EventoResumido | null;
  primeiroEvento: Date | null;
  inscricoesPagas: { total: number; maisAntiga: Date | null };
  pedidos: { naUltimaHora: number; mesmaHoraAntes: number[]; ultimoPedido: Date | null };
};
export type DadosDeSaude = { banco: { ok: boolean; ms: number }; leitura: LeituraDeSaude | null };

const NOMES: Record<ChavePeca, string> = {
  banco: "Banco",
  cron: "Cron diário",
  "webhook-asaas": "Webhook do Asaas",
  provisionamento: "Provisionamento",
  pagamentos: "Pagamentos dos restaurantes",
  email: "E-mail",
  rotas: "Erros de rota",
  pedidos: "Pedidos",
};
const ORDEM: ChavePeca[] = ["banco", "cron", "webhook-asaas", "provisionamento", "pagamentos", "email", "rotas", "pedidos"];
const GRAVIDADE: Record<Cor, number> = { neutro: -1, verde: 0, amarelo: 1, vermelho: 2 };

const H = 3_600_000;
const MIN = 60_000;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function avaliarSaude(dados: DadosDeSaude, agora: Date): Saude {
  const desde = (d: Date) => agora.getTime() - d.getTime();
  const peca = (chave: ChavePeca, cor: Cor, motivo: string, ultimoSinal: Date | null = null): Peca => ({
    chave,
    nome: NOMES[chave],
    cor,
    motivo,
    ultimoSinal,
  });

  const banco = !dados.banco.ok
    ? peca("banco", "vermelho", "o banco não respondeu")
    : dados.banco.ms > LIMIARES.bancoLentoMs
      ? peca("banco", "amarelo", `respondendo devagar (${dados.banco.ms} ms)`, agora)
      : peca("banco", "verde", `respondeu em ${dados.banco.ms} ms`, agora);

  const l = dados.leitura;
  if (!l) {
    const resto = ORDEM.slice(1).map((c) => peca(c, "neutro", "sem leitura: o banco não respondeu"));
    return fechar([banco, ...resto]);
  }

  // Mais recente primeiro, independente da ordem em que vieram.
  const eventos = [...l.eventos].sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
  const da = (chave: ChavePeca) => eventos.filter((e) => classificarOrigem(e.origem) === chave);
  const erros = (lista: EventoResumido[], janelaMs: number) =>
    lista.filter((e) => e.nivel === "ERRO" && desde(e.criadoEm) <= janelaMs).length;
  const ultimoOk = (lista: EventoResumido[]) => lista.find((e) => e.nivel === "OK")?.criadoEm ?? null;

  return fechar([
    banco,
    avaliarCron(l, da("cron")),
    avaliarWebhookAsaas(da("webhook-asaas")),
    avaliarProvisionamento(l),
    avaliarPorErros("pagamentos", da("pagamentos"), LIMIARES.pagamentosVermelhoNaHora),
    avaliarPorErros("email", da("email"), LIMIARES.emailVermelhoNaHora),
    avaliarRotas(da("rotas")),
    avaliarPedidos(l.pedidos),
  ]);

  function avaliarCron(leitura: LeituraDeSaude, doCron: EventoResumido[]): Peca {
    const sinal = leitura.ultimoCron;
    if (!sinal) {
      // Primeiro deploy: a tabela é nova e o cron ainda não rodou. Gritar
      // vermelho a noite inteira ensinaria a ignorar o alarme no dia um.
      const tabelaNova = !leitura.primeiroEvento || desde(leitura.primeiroEvento) <= LIMIARES.cronVermelhoH * H;
      return tabelaNova
        ? peca("cron", "amarelo", "aguardando a primeira execução registrada")
        : peca("cron", "vermelho", "nenhuma execução registrada");
    }
    const quando = tempoDesde(sinal.criadoEm, agora);
    const horas = desde(sinal.criadoEm) / H;
    if (horas > LIMIARES.cronVermelhoH) return peca("cron", "vermelho", `sem rodar, última execução ${quando}`, sinal.criadoEm);
    if (horas > LIMIARES.cronAmareloH) return peca("cron", "amarelo", `atrasado, última execução ${quando}`, sinal.criadoEm);
    if (sinal.nivel === "AVISO") return peca("cron", "amarelo", `rodou ${quando} com etapa em erro`, sinal.criadoEm);
    // Erro depois do sinal é execução que morreu antes de terminar: as etapas
    // erram DURANTE a execução, e o sinal é gravado no fim.
    const morreu = doCron.some((e) => e.nivel === "ERRO" && e.criadoEm > sinal.criadoEm);
    if (morreu) return peca("cron", "amarelo", "falhou depois da última execução completa", sinal.criadoEm);
    return peca("cron", "verde", `rodou ${quando}`, sinal.criadoEm);
  }

  function avaliarWebhookAsaas(lista: EventoResumido[]): Peca {
    const sinal = ultimoOk(lista);
    // Dia sem webhook é normal quando ninguém pagou: ausência não é falha aqui.
    if (lista.length === 0) return peca("webhook-asaas", "verde", `sem eventos nas últimas ${LIMIARES.janelaDeEventosH} h`);
    if (lista[0].nivel === "ERRO") {
      return peca("webhook-asaas", "vermelho", `o último evento falhou (${tempoDesde(lista[0].criadoEm, agora)})`, sinal);
    }
    const n = erros(lista, 24 * H);
    if (n > 0) return peca("webhook-asaas", "amarelo", `${plural(n, "erro", "erros")} nas últimas 24 h`, sinal);
    return peca("webhook-asaas", "verde", sinal ? `último evento ${tempoDesde(sinal, agora)}` : "sem falhas", sinal);
  }

  function avaliarProvisionamento(leitura: LeituraDeSaude): Peca {
    const sinal = eventos.find((e) => e.origem === ORIGEM_DO_PROVISIONAMENTO && e.nivel === "OK")?.criadoEm ?? null;
    const { total, maisAntiga } = leitura.inscricoesPagas;
    if (total === 0 || !maisAntiga) return peca("provisionamento", "verde", "nenhum pagamento esperando restaurante", sinal);
    const minutos = desde(maisAntiga) / MIN;
    const motivo = `${plural(total, "pagamento", "pagamentos")} sem restaurante, o mais antigo ${tempoDesde(maisAntiga, agora)}`;
    if (minutos > LIMIARES.provisionamentoVermelhoMin) return peca("provisionamento", "vermelho", motivo, sinal);
    if (minutos > LIMIARES.provisionamentoAmareloMin) return peca("provisionamento", "amarelo", motivo, sinal);
    return peca("provisionamento", "verde", "provisionando", sinal);
  }

  function avaliarPorErros(chave: "pagamentos" | "email", lista: EventoResumido[], vermelhoNaHora: number): Peca {
    const sinal = ultimoOk(lista);
    const naHora = erros(lista, H);
    const noDia = erros(lista, 24 * H);
    if (naHora >= vermelhoNaHora) return peca(chave, "vermelho", `${plural(naHora, "erro", "erros")} na última hora`, sinal);
    if (noDia > 0) return peca(chave, "amarelo", `${plural(noDia, "erro", "erros")} nas últimas 24 h`, sinal);
    return peca(chave, "verde", "nenhuma falha nas últimas 24 h", sinal);
  }

  function avaliarRotas(lista: EventoResumido[]): Peca {
    const naHora = erros(lista, H);
    const ultimo = lista.find((e) => e.nivel === "ERRO")?.criadoEm ?? null;
    if (naHora >= LIMIARES.rotasVermelhoNaHora) return peca("rotas", "vermelho", `${naHora} erros na última hora`, ultimo);
    if (naHora >= LIMIARES.rotasAmareloNaHora) return peca("rotas", "amarelo", `${plural(naHora, "erro", "erros")} na última hora`, ultimo);
    return peca("rotas", "verde", "nenhum erro na última hora", ultimo);
  }

  function avaliarPedidos(p: LeituraDeSaude["pedidos"]): Peca {
    const media = p.mesmaHoraAntes.length
      ? p.mesmaHoraAntes.reduce((a, b) => a + b, 0) / p.mesmaHoraAntes.length
      : 0;
    const agoraTexto = `${plural(p.naUltimaHora, "pedido", "pedidos")} na última hora`;
    // Nunca vermelho: queda de volume tem causa inocente (feriado, chuva), e
    // vermelho por motivo inocente ensina a ignorar o alarme.
    if (media < LIMIARES.pedidosMediaMinima) return peca("pedidos", "neutro", agoraTexto, p.ultimoPedido);
    const normal = Math.round(media);
    if (p.naUltimaHora === 0) {
      return peca("pedidos", "amarelo", `nenhum pedido na última hora, o normal seria perto de ${normal}`, p.ultimoPedido);
    }
    return peca("pedidos", "verde", `${agoraTexto}, o normal é perto de ${normal}`, p.ultimoPedido);
  }
}

function fechar(pecas: Peca[]): Saude {
  const pior = pecas.reduce<Cor>((acc, p) => (GRAVIDADE[p.cor] > GRAVIDADE[acc] ? p.cor : acc), "neutro");
  if (pior === "verde" || pior === "neutro") return { geral: pior, resumo: "Tudo funcionando", pecas };
  const problemas = pecas
    .filter((p) => p.cor === "vermelho" || p.cor === "amarelo")
    .sort((a, b) => GRAVIDADE[b.cor] - GRAVIDADE[a.cor]);
  const [primeira] = problemas;
  const mais = problemas.length > 1 ? ` (e mais ${problemas.length - 1})` : "";
  return { geral: pior, resumo: `${primeira.nome}: ${primeira.motivo}${mais}`, pecas };
}
```

Nota sobre `sort` estável: `Array.prototype.sort` é estável, então entre peças da mesma cor vale a ordem de `ORDEM`. É isso que faz o teste "o resumo cita o Provisionamento" passar (provisionamento vermelho, rotas amarelo).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/saude/avaliar.test.ts`
Expected: PASS. Se o teste "neutro não conta para o geral" falhar por geral `"verde"` vs `"neutro"`: todas as outras peças estão verdes no cenário, então `"verde"` é o esperado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/saude/avaliar.ts src/lib/saude/avaliar.test.ts
git commit -m "Saúde: avaliarSaude, a regra de cor de cada peça

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `reportarErro` passa a gravar no banco

**Files:**
- Modify: `src/lib/observabilidade.ts`
- Modify: `src/lib/observabilidade.test.ts`

**Interfaces:**
- Consumes: `registrarSaude` (Task 2), mockado globalmente nos testes.
- Produces: todo `reportarErro` vira um `EventoSistema` com `nivel: "ERRO"`; `extra.tenantId` (string) vira a coluna `tenantId`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/observabilidade.test.ts`, acrescentar ao import do topo e ao fim do arquivo:

```ts
import { registrarSaude } from "@/lib/saude/registrar";
```

```ts
describe("reportarErro grava o evento de saúde", () => {
  it("grava ERRO com origem, mensagem, tenant e extra", async () => {
    await reportarErro({ origem: "webhook/pagamento", erro: new Error("boom"), extra: { tenantId: "t1", orderId: "o1" } });
    expect(registrarSaude).toHaveBeenCalledWith({
      origem: "webhook/pagamento",
      nivel: "ERRO",
      mensagem: "boom",
      tenantId: "t1",
      extra: { tenantId: "t1", orderId: "o1" },
    });
  });

  it("grava mesmo quando o aviso ao canal é suprimido pelo limite de um minuto", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hooks.example/abc");
    await reportarErro({ origem: "cron", erro: new Error("igual") });
    await reportarErro({ origem: "cron", erro: new Error("igual") });
    expect(registrarSaude).toHaveBeenCalledTimes(2);
  });

  it("erro sem mensagem grava a origem no lugar", async () => {
    await reportarErro({ origem: "cron/assinaturas:faxina" });
    expect(vi.mocked(registrarSaude).mock.calls[0][0].mensagem).toBe("cron/assinaturas:faxina");
  });

  it("falha ao gravar não lança nem reporta de novo", async () => {
    vi.mocked(registrarSaude).mockRejectedValueOnce(new Error("banco fora"));
    await expect(reportarErro({ origem: "x", erro: new Error("a") })).resolves.toBeUndefined();
    expect(registrarSaude).toHaveBeenCalledTimes(1);
  });

  it("no runtime edge não tenta gravar", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await reportarErro({ origem: "proxy:/", erro: new Error("a") });
    expect(registrarSaude).not.toHaveBeenCalled();
  });
});
```

E no `beforeEach` existente do arquivo, acrescentar a primeira linha:

```ts
  vi.mocked(registrarSaude).mockClear();
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/observabilidade.test.ts`
Expected: FAIL nos cinco testes novos (`registrarSaude` nunca chamado). Se falhar com "registrarSaude is not a mock", o `setupFiles` da Task 2 não está valendo: conferir `vitest.config.mts`.

- [ ] **Step 3: Implementar**

Em `src/lib/observabilidade.ts`, acrescentar antes de `export async function reportarErro`:

```ts
/**
 * Grava o erro em EventoSistema, para a tela de saúde do console.
 *
 * Import dinâmico, e só fora do edge: onRequestError (src/instrumentation.ts)
 * também pode rodar no runtime edge, onde o Prisma não carrega. Um import
 * estático levaria o Prisma para esse bundle.
 *
 * Não reporta a própria falha: registrarSaude já engole e loga, e reportar
 * daqui chamaria esta função de novo.
 */
async function gravarEventoDeSaude(
  origem: string,
  mensagem: string,
  extra: ErroReportado["extra"]
): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const { registrarSaude } = await import("@/lib/saude/registrar");
    await registrarSaude({
      origem,
      nivel: "ERRO",
      mensagem: mensagem || origem,
      tenantId: typeof extra?.tenantId === "string" ? extra.tenantId : null,
      extra,
    });
  } catch {
    // gravar evento nunca pode causar erro
  }
}
```

E dentro de `reportarErro`, logo depois da linha `console.error(JSON.stringify(...))`:

```ts
    // Antes do limite de envio: o canal recebe uma mensagem por minuto, mas a
    // tela de saúde conta todas.
    await gravarEventoDeSaude(origem, mensagem, extra);
```

Atualizar o comentário do topo do arquivo, trocando "Aqui o erro vira uma linha JSON estável (...)" por:

```
 * Aqui o erro vira uma linha JSON estável (fácil de filtrar no painel e de
 * enviar a um dreno de logs), um EventoSistema que a tela de saúde do console
 * mostra, e, se `ERROR_WEBHOOK_URL` estiver definida, uma mensagem para um
 * canal (Slack, Discord, ou qualquer endpoint que aceite `{ "text": "..." }`).
```

- [ ] **Step 4: Rodar e ver passar, com a suíte inteira**

Run: `npx vitest run src/lib/observabilidade.test.ts && npm test`
Expected: PASS. A suíte inteira confirma que nenhum outro teste passou a tocar o banco.

- [ ] **Step 5: Commit**

```bash
git add src/lib/observabilidade.ts src/lib/observabilidade.test.ts
git commit -m "Saúde: todo reportarErro vira evento gravado

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Coleta, expurgo e pedidos por hora

**Files:**
- Create: `src/lib/saude/pedidos.ts`
- Create: `src/lib/saude/pedidos.test.ts`
- Create: `src/lib/saude/filtros.ts`
- Create: `src/lib/saude/filtros.test.ts`
- Create: `src/lib/saude/coletar.ts`
- Create: `src/lib/saude/expurgo.ts`
- Create: `src/test-integracao/saude.integration.test.ts`
- Modify: `src/security/invariantes.test.ts`

**Interfaces:**
- Consumes: `LIMIARES`, `ORIGEM_DO_CRON`, `classificarOrigem`, `ChavePeca` (Task 3); `DadosDeSaude`, `LeituraDeSaude` (Task 4); `FUSO`, `chaveDoDia` de `src/lib/platform-series.ts`.
- Produces:
  ```ts
  // pedidos.ts
  export type LinhaPorHora = { dia: string; hora: number; n: number };
  export type BarraDePedidos = { hora: number; hoje: number; media: number };
  export function horaEmBrasilia(d: Date): number;
  export function montarPedidosPorHora(linhas: LinhaPorHora[], hoje: string, anteriores: string[], horaAtual: number): BarraDePedidos[];
  // filtros.ts
  export type FiltroDePeca = ChavePeca | "outros";
  export type FiltrosDoFeed = { todos: boolean; peca: FiltroDePeca | null; tenantId: string | null };
  export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosDoFeed;
  export function hrefDoFiltro(atual: FiltrosDoFeed, mudanca: Partial<FiltrosDoFeed>): string;
  // coletar.ts
  export async function coletarDadosDeSaude(agora: Date): Promise<DadosDeSaude>;   // nunca lança
  export async function coletarPedidosPorHora(agora: Date): Promise<BarraDePedidos[]>;
  export type LinhaDoFeed = { id: string; origem: string; nivel: NivelEvento; mensagem: string;
    tenantId: string | null; restaurante: string | null; criadoEm: Date };
  export async function listarEventos(filtros: FiltrosDoFeed): Promise<LinhaDoFeed[]>;
  // expurgo.ts
  export async function expurgarEventosDeSaude(agora: Date): Promise<number>;
  ```

- [ ] **Step 1: Testes de unidade que falham (pedidos e filtros)**

`src/lib/saude/pedidos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { horaEmBrasilia, montarPedidosPorHora } from "./pedidos";

describe("horaEmBrasilia", () => {
  it("converte UTC para a hora de São Paulo", () => {
    expect(horaEmBrasilia(new Date("2026-10-10T23:30:00Z"))).toBe(20);
    expect(horaEmBrasilia(new Date("2026-10-11T02:59:00Z"))).toBe(23);
    expect(horaEmBrasilia(new Date("2026-10-11T03:00:00Z"))).toBe(0);
  });
});

describe("montarPedidosPorHora", () => {
  const anteriores = ["2026-10-03", "2026-09-26", "2026-09-19", "2026-09-12"];

  it("uma barra por hora, de 0 até a hora atual, com a média das semanas", () => {
    const barras = montarPedidosPorHora(
      [
        { dia: "2026-10-10", hora: 1, n: 3 },
        { dia: "2026-10-03", hora: 1, n: 4 },
        { dia: "2026-09-26", hora: 1, n: 8 },
        { dia: "2026-10-10", hora: 2, n: 1 },
      ],
      "2026-10-10",
      anteriores,
      2
    );
    expect(barras).toEqual([
      { hora: 0, hoje: 0, media: 0 },
      { hora: 1, hoje: 3, media: 3 }, // (4 + 8 + 0 + 0) / 4
      { hora: 2, hoje: 1, media: 0 },
    ]);
  });

  it("ignora linhas de dias que não estão na comparação", () => {
    const barras = montarPedidosPorHora([{ dia: "2026-10-09", hora: 0, n: 50 }], "2026-10-10", anteriores, 0);
    expect(barras).toEqual([{ hora: 0, hoje: 0, media: 0 }]);
  });
});
```

`src/lib/saude/filtros.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hrefDoFiltro, lerFiltros } from "./filtros";

describe("lerFiltros", () => {
  it("padrão: só avisos e erros, sem peça, sem restaurante", () => {
    expect(lerFiltros({})).toEqual({ todos: false, peca: null, tenantId: null });
  });
  it("lê os três", () => {
    expect(lerFiltros({ todos: "1", peca: "email", tenant: "t1" })).toEqual({ todos: true, peca: "email", tenantId: "t1" });
  });
  it("peça desconhecida é ignorada", () => {
    expect(lerFiltros({ peca: "<script>" }).peca).toBeNull();
  });
  it("aceita outros", () => {
    expect(lerFiltros({ peca: "outros" }).peca).toBe("outros");
  });
  it("valor repetido na URL usa o primeiro", () => {
    expect(lerFiltros({ peca: ["cron", "email"] }).peca).toBe("cron");
  });
});

describe("hrefDoFiltro", () => {
  const base = { todos: false, peca: null, tenantId: null };
  it("sem filtro volta para /saude", () => {
    expect(hrefDoFiltro(base, {})).toBe("/saude");
  });
  it("combina a mudança com o atual", () => {
    expect(hrefDoFiltro({ ...base, peca: "cron" }, { todos: true })).toBe("/saude?todos=1&peca=cron");
  });
  it("limpa um campo com null", () => {
    expect(hrefDoFiltro({ ...base, tenantId: "t1" }, { tenantId: null })).toBe("/saude");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/saude/pedidos.test.ts src/lib/saude/filtros.test.ts`
Expected: FAIL, módulos não existem.

- [ ] **Step 3: Implementar `pedidos.ts` e `filtros.ts`**

`src/lib/saude/pedidos.ts`:

```ts
import { FUSO } from "@/lib/platform-series";

export type LinhaPorHora = { dia: string; hora: number; n: number };
export type BarraDePedidos = { hora: number; hoje: number; media: number };

/** 0 a 23, no relógio de São Paulo. */
export function horaEmBrasilia(d: Date): number {
  return Number(d.toLocaleString("en-US", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }));
}

/**
 * Hoje, hora a hora até agora, contra a média da mesma hora nos dias de
 * comparação (os mesmos dias da semana anteriores). Dia sem pedido conta como
 * zero na média: é o que aconteceu, não falta de dado.
 */
export function montarPedidosPorHora(
  linhas: LinhaPorHora[],
  hoje: string,
  anteriores: string[],
  horaAtual: number
): BarraDePedidos[] {
  const n = (dia: string, hora: number) =>
    linhas.find((l) => l.dia === dia && l.hora === hora)?.n ?? 0;
  return Array.from({ length: horaAtual + 1 }, (_, hora) => ({
    hora,
    hoje: n(hoje, hora),
    media: anteriores.length
      ? Math.round(anteriores.reduce((s, dia) => s + n(dia, hora), 0) / anteriores.length)
      : 0,
  }));
}
```

`src/lib/saude/filtros.ts`:

```ts
import type { ChavePeca } from "./origens";

/** Os filtros do feed vivem na URL: o rewrite do console preserva a query string. */
export type FiltroDePeca = ChavePeca | "outros";
export type FiltrosDoFeed = { todos: boolean; peca: FiltroDePeca | null; tenantId: string | null };

const PECAS_DO_FEED: readonly FiltroDePeca[] = ["cron", "webhook-asaas", "pagamentos", "email", "rotas", "outros"];

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosDoFeed {
  const peca = primeiro(sp.peca);
  return {
    todos: primeiro(sp.todos) === "1",
    peca: PECAS_DO_FEED.includes(peca as FiltroDePeca) ? (peca as FiltroDePeca) : null,
    tenantId: primeiro(sp.tenant) || null,
  };
}

export function hrefDoFiltro(atual: FiltrosDoFeed, mudanca: Partial<FiltrosDoFeed>): string {
  const f = { ...atual, ...mudanca };
  const q = new URLSearchParams();
  if (f.todos) q.set("todos", "1");
  if (f.peca) q.set("peca", f.peca);
  if (f.tenantId) q.set("tenant", f.tenantId);
  const s = q.toString();
  return s ? `/saude?${s}` : "/saude";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/saude/pedidos.test.ts src/lib/saude/filtros.test.ts`
Expected: PASS.

- [ ] **Step 5: Teste de integração que falha (coleta e expurgo)**

`src/test-integracao/saude.integration.test.ts`:

```ts
/**
 * A coleta da saúde e o expurgo sobre o banco real: as janelas de tempo, o
 * fuso das horas e o deleteMany por data.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prismaUnscoped } from "@/lib/prisma";
import { coletarDadosDeSaude, coletarPedidosPorHora, listarEventos } from "@/lib/saude/coletar";
import { expurgarEventosDeSaude } from "@/lib/saude/expurgo";
import { criarTenant, limparTenants, pedidoMinimo } from "./apoio";

const AGORA = new Date();
const H = 3_600_000;
const ha = (ms: number) => new Date(AGORA.getTime() - ms);

beforeEach(async () => {
  await prismaUnscoped.eventoSistema.deleteMany({});
});
afterAll(async () => {
  await prismaUnscoped.eventoSistema.deleteMany({});
  await limparTenants();
});

describe("expurgarEventosDeSaude", () => {
  it("apaga só o que passou de 30 dias", async () => {
    await prismaUnscoped.eventoSistema.createMany({
      data: [
        { origem: "x", nivel: "OK", mensagem: "velho", criadoEm: ha(31 * 24 * H) },
        { origem: "x", nivel: "OK", mensagem: "novo", criadoEm: ha(29 * 24 * H) },
      ],
    });
    expect(await expurgarEventosDeSaude(AGORA)).toBe(1);
    const restantes = await prismaUnscoped.eventoSistema.findMany();
    expect(restantes.map((e) => e.mensagem)).toEqual(["novo"]);
  });
});

describe("coletarDadosDeSaude", () => {
  it("lê a janela de eventos, o último sinal do cron e o primeiro evento", async () => {
    await prismaUnscoped.eventoSistema.createMany({
      data: [
        { origem: "cron/assinaturas", nivel: "OK", mensagem: "rodou", criadoEm: ha(60 * H) },
        { origem: "cron/assinaturas:faxina", nivel: "ERRO", mensagem: "x", criadoEm: ha(2 * H) },
        { origem: "webhook/asaas", nivel: "OK", mensagem: "y", criadoEm: ha(H) },
      ],
    });
    const d = await coletarDadosDeSaude(AGORA);
    expect(d.banco.ok).toBe(true);
    // O sinal de 60 h fica fora da janela de 50 h, mas é o último sinal do cron.
    expect(d.leitura!.eventos.map((e) => e.origem).sort()).toEqual(["cron/assinaturas:faxina", "webhook/asaas"]);
    expect(d.leitura!.ultimoCron?.origem).toBe("cron/assinaturas");
    expect(d.leitura!.primeiroEvento?.getTime()).toBe(ha(60 * H).getTime());
  });

  it("conta pedidos na última hora e na mesma hora das semanas anteriores", async () => {
    const tenant = await criarTenant("saude");
    await prismaUnscoped.order.createMany({
      data: [
        pedidoMinimo(tenant.id, { createdAt: ha(10 * 60_000) }),
        pedidoMinimo(tenant.id, { createdAt: ha(7 * 24 * H + 10 * 60_000) }),
        pedidoMinimo(tenant.id, { createdAt: ha(7 * 24 * H + 20 * 60_000) }),
      ],
    });
    const d = await coletarDadosDeSaude(AGORA);
    expect(d.leitura!.pedidos.naUltimaHora).toBeGreaterThanOrEqual(1);
    expect(d.leitura!.pedidos.mesmaHoraAntes).toHaveLength(4);
    expect(d.leitura!.pedidos.mesmaHoraAntes[0]).toBeGreaterThanOrEqual(2);
  });
});

describe("coletarPedidosPorHora", () => {
  it("agrupa na hora de São Paulo", async () => {
    const barras = await coletarPedidosPorHora(AGORA);
    expect(barras.length).toBeGreaterThan(0);
    expect(barras.at(-1)!.hoje).toBeGreaterThanOrEqual(0);
  });
});

describe("listarEventos", () => {
  it("padrão esconde OK; filtra por peça; traz o nome do restaurante", async () => {
    const tenant = await criarTenant("feed");
    await prismaUnscoped.eventoSistema.createMany({
      data: [
        { origem: "webhook/pagamento", nivel: "ERRO", mensagem: "a", tenantId: tenant.id },
        { origem: "webhook/pagamento", nivel: "OK", mensagem: "b", tenantId: tenant.id },
        { origem: "forgot-password:envio", nivel: "ERRO", mensagem: "c" },
        { origem: "x", nivel: "ERRO", mensagem: "d", tenantId: "removido" },
      ],
    });
    const padrao = await listarEventos({ todos: false, peca: null, tenantId: null });
    expect(padrao.map((e) => e.mensagem).sort()).toEqual(["a", "c", "d"]);
    expect(padrao.find((e) => e.mensagem === "a")!.restaurante).toBe(tenant.nome);
    expect(padrao.find((e) => e.mensagem === "d")!.restaurante).toBe("restaurante removido");

    const pagamentos = await listarEventos({ todos: true, peca: "pagamentos", tenantId: null });
    expect(pagamentos.map((e) => e.mensagem).sort()).toEqual(["a", "b"]);

    const outros = await listarEventos({ todos: false, peca: "outros", tenantId: null });
    expect(outros.map((e) => e.mensagem)).toEqual(["d"]);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `docker exec muno-db-dev psql -U muno -d muno -c "create database muno_teste" ; npm run test:integracao -- src/test-integracao/saude.integration.test.ts`
Expected: FAIL, módulos `coletar` e `expurgo` não existem. (O `create database` só é necessário uma vez; se já existir, o erro dele é inofensivo.)

- [ ] **Step 7: Implementar `expurgo.ts` e `coletar.ts`**

`src/lib/saude/expurgo.ts`:

```ts
import { prismaUnscoped } from "@/lib/prisma";
import { LIMIARES } from "./limiares";

/** Apaga eventos de saúde com mais de 30 dias. Roda no cron diário. */
export async function expurgarEventosDeSaude(agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() - LIMIARES.diasDeRetencao * 24 * 3_600_000);
  const { count } = await prismaUnscoped.eventoSistema.deleteMany({ where: { criadoEm: { lt: limite } } });
  return count;
}
```

`src/lib/saude/coletar.ts`:

```ts
import type { NivelEvento } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { FUSO, chaveDoDia } from "@/lib/platform-series";
import type { DadosDeSaude, LeituraDeSaude } from "./avaliar";
import type { FiltrosDoFeed } from "./filtros";
import { LIMIARES } from "./limiares";
import { classificarOrigem, ORIGEM_DO_CRON } from "./origens";
import { horaEmBrasilia, montarPedidosPorHora, type BarraDePedidos, type LinhaPorHora } from "./pedidos";

/**
 * Tudo que a saúde lê do banco. Cross-tenant por natureza, só para o console
 * da plataforma e para a rota do monitor, por isso prismaUnscoped.
 */

const H = 3_600_000;
const SEMANA = 7 * 24 * H;

/** Nunca lança: banco fora do ar é uma resposta, não uma exceção. */
export async function coletarDadosDeSaude(agora: Date): Promise<DadosDeSaude> {
  const inicio = Date.now();
  try {
    await prismaUnscoped.$queryRaw`select 1`;
  } catch {
    return { banco: { ok: false, ms: Date.now() - inicio }, leitura: null };
  }
  const ms = Date.now() - inicio;

  try {
    return { banco: { ok: true, ms }, leitura: await ler(agora) };
  } catch {
    // O banco respondeu ao select 1 e falhou na leitura: para quem olha, é o
    // mesmo problema.
    return { banco: { ok: false, ms }, leitura: null };
  }
}

async function ler(agora: Date): Promise<LeituraDeSaude> {
  const contarPedidos = (fim: Date) =>
    prismaUnscoped.order.count({ where: { createdAt: { gte: new Date(fim.getTime() - H), lt: fim } } });
  const semanas = Array.from({ length: LIMIARES.semanasDeComparacao }, (_, i) => new Date(agora.getTime() - (i + 1) * SEMANA));

  // Dois Promise.all aninhados, e não um só com spread: o tamanho variável
  // de `semanas` faria o TypeScript perder o tipo de cada posição da tupla.
  const [fixos, mesmaHoraAntes] = await Promise.all([
    Promise.all([
      prismaUnscoped.eventoSistema.findMany({
        where: { criadoEm: { gte: new Date(agora.getTime() - LIMIARES.janelaDeEventosH * H) } },
        select: { origem: true, nivel: true, criadoEm: true },
        orderBy: { criadoEm: "desc" },
      }),
      prismaUnscoped.eventoSistema.findFirst({
        where: { origem: ORIGEM_DO_CRON, nivel: { in: ["OK", "AVISO"] } },
        select: { origem: true, nivel: true, criadoEm: true },
        orderBy: { criadoEm: "desc" },
      }),
      prismaUnscoped.eventoSistema.findFirst({ select: { criadoEm: true }, orderBy: { criadoEm: "asc" } }),
      prismaUnscoped.inscricao.count({ where: { status: "PAGA" } }),
      // updatedAt é quando ela virou PAGA: nada mais a altera enquanto espera.
      prismaUnscoped.inscricao.findFirst({
        where: { status: "PAGA" },
        select: { updatedAt: true },
        orderBy: { updatedAt: "asc" },
      }),
      prismaUnscoped.order.findFirst({ select: { createdAt: true }, orderBy: { createdAt: "desc" } }),
      contarPedidos(agora),
    ]),
    Promise.all(semanas.map(contarPedidos)),
  ]);
  const [eventos, ultimoCron, primeiro, pagas, maisAntiga, ultimoPedido, naUltimaHora] = fixos;

  return {
    eventos,
    ultimoCron,
    primeiroEvento: primeiro?.criadoEm ?? null,
    inscricoesPagas: { total: pagas, maisAntiga: maisAntiga?.updatedAt ?? null },
    pedidos: { naUltimaHora, mesmaHoraAntes, ultimoPedido: ultimoPedido?.createdAt ?? null },
  };
}

/** Hoje, hora a hora em São Paulo, contra a média dos mesmos dias da semana anteriores. */
export async function coletarPedidosPorHora(agora: Date): Promise<BarraDePedidos[]> {
  const hoje = chaveDoDia(agora);
  const anteriores = Array.from({ length: LIMIARES.semanasDeComparacao }, (_, i) =>
    chaveDoDia(new Date(agora.getTime() - (i + 1) * SEMANA))
  );
  // Meia-noite de São Paulo do dia mais antigo. O Brasil não tem horário de
  // verão desde 2019, então -03:00 vale o ano inteiro.
  const desde = new Date(`${anteriores.at(-1)}T00:00:00-03:00`);

  // "createdAt" é timestamp sem fuso guardando UTC: o primeiro AT TIME ZONE
  // diz isso ao Postgres, o segundo converte para o relógio de São Paulo.
  const linhas = await prismaUnscoped.$queryRaw<LinhaPorHora[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO}, 'YYYY-MM-DD') AS dia,
           EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${FUSO})::int AS hora,
           COUNT(*)::int AS n
    FROM "Order"
    WHERE "createdAt" >= ${desde} AND "createdAt" < ${agora}
    GROUP BY 1, 2`;

  return montarPedidosPorHora(linhas, hoje, anteriores, horaEmBrasilia(agora));
}

export type LinhaDoFeed = {
  id: string;
  origem: string;
  nivel: NivelEvento;
  mensagem: string;
  tenantId: string | null;
  restaurante: string | null;
  criadoEm: Date;
};

export async function listarEventos(filtros: FiltrosDoFeed): Promise<LinhaDoFeed[]> {
  const linhas = await prismaUnscoped.eventoSistema.findMany({
    where: {
      ...(filtros.todos ? {} : { nivel: { in: ["AVISO", "ERRO"] } }),
      ...(filtros.tenantId ? { tenantId: filtros.tenantId } : {}),
    },
    select: { id: true, origem: true, nivel: true, mensagem: true, tenantId: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
    take: LIMIARES.eventosLidosNoFeed,
  });

  // A peça é decidida por prefixo em classificarOrigem; filtrar aqui, e não no
  // where, mantém uma regra só.
  const daPeca = filtros.peca
    ? linhas.filter((l) => (classificarOrigem(l.origem) ?? "outros") === filtros.peca)
    : linhas;
  const recorte = daPeca.slice(0, LIMIARES.eventosNoFeed);

  const ids = [...new Set(recorte.map((l) => l.tenantId).filter((id): id is string => !!id))];
  const tenants = ids.length
    ? await prismaUnscoped.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
    : [];
  const nomes = new Map(tenants.map((t) => [t.id, t.nome]));

  return recorte.map((l) => ({
    ...l,
    restaurante: l.tenantId ? (nomes.get(l.tenantId) ?? "restaurante removido") : null,
  }));
}
```

Atenção: o `filter` de `"outros"` compara `classificarOrigem(...) ?? "outros"`, então "outros" pega tudo que não é de peça nenhuma, inclusive `provisionamento`. É o esperado.

- [ ] **Step 8: Registrar o uso de `prismaUnscoped`**

Em `src/security/invariantes.test.ts`, depois da entrada de `src/lib/saude/registrar.ts`:

```ts
  "src/lib/saude/coletar.ts":
    "leitura da saúde da plataforma inteira, só para o console e o monitor",
  "src/lib/saude/expurgo.ts":
    "cron diário apagando eventos de saúde antigos, sem tenant",
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npm run test:integracao -- src/test-integracao/saude.integration.test.ts && npx vitest run src/security/invariantes.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/saude/pedidos.ts src/lib/saude/pedidos.test.ts src/lib/saude/filtros.ts src/lib/saude/filtros.test.ts src/lib/saude/coletar.ts src/lib/saude/expurgo.ts src/test-integracao/saude.integration.test.ts src/security/invariantes.test.ts
git commit -m "Saúde: coleta do banco, expurgo e pedidos por hora

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Rota do monitor e o ramo no proxy

**Files:**
- Create: `src/app/api/health/sistema/route.ts`
- Create: `src/app/api/health/sistema/route.test.ts`
- Modify: `src/proxy.ts` (depois do ramo de `/api/health`, perto da linha 247)
- Modify: `src/proxy.test.ts` (as duas listas `it.each` que contêm `"/api/health"`, linhas ~321 e ~774)
- Modify: `src/security/politica-de-acesso.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `coletarDadosDeSaude` (Task 6), `avaliarSaude` (Task 4).
- Produces: `GET /api/health/sistema` → 401 `{ error }` | 200 `{ ok: true, vermelhas: [] }` | 503 `{ ok: false, vermelhas: ChavePeca[] }`.

- [ ] **Step 1: Escrever o teste que falha**

`src/app/api/health/sistema/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { DadosDeSaude } from "@/lib/saude/avaliar";

const coletar = vi.fn<(agora: Date) => Promise<DadosDeSaude>>();
vi.mock("@/lib/saude/coletar", () => ({ coletarDadosDeSaude: (a: Date) => coletar(a) }));

const { GET } = await import("./route");

const TOKEN = "segredo-do-monitor-com-tamanho";
const req = (opcoes: { header?: string; query?: string } = {}) =>
  new NextRequest(`https://munoapp.com.br/api/health/sistema${opcoes.query ? `?token=${opcoes.query}` : ""}`, {
    headers: opcoes.header ? { authorization: opcoes.header } : {},
  });

const saudavel = (): DadosDeSaude => ({
  banco: { ok: true, ms: 10 },
  leitura: {
    eventos: [],
    ultimoCron: { origem: "cron/assinaturas", nivel: "OK", criadoEm: new Date(Date.now() - 3_600_000) },
    primeiroEvento: new Date(Date.now() - 100 * 3_600_000),
    inscricoesPagas: { total: 0, maisAntiga: null },
    pedidos: { naUltimaHora: 0, mesmaHoraAntes: [0, 0, 0, 0], ultimoPedido: null },
  },
});

beforeEach(() => {
  coletar.mockReset();
  vi.stubEnv("HEALTH_MONITOR_TOKEN", TOKEN);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health/sistema: quem entra", () => {
  it.each([
    ["sem token", {}],
    ["token errado no header", { header: "Bearer outro-segredo-de-mesmo-tamanho" }],
    ["token de tamanho diferente", { header: "Bearer x" }],
    ["Bearer vazio", { header: "Bearer " }],
    ["token errado na query", { query: "nada" }],
  ])("401 %s, sem coletar", async (_nome, opcoes) => {
    const res = await GET(req(opcoes));
    expect(res.status).toBe(401);
    expect(coletar).not.toHaveBeenCalled();
  });

  it("401 quando a variável não está configurada, mesmo com token vazio", async () => {
    vi.stubEnv("HEALTH_MONITOR_TOKEN", "");
    const res = await GET(req({ header: "Bearer " }));
    expect(res.status).toBe(401);
    expect(coletar).not.toHaveBeenCalled();
  });

  it("aceita o token no header e na query", async () => {
    coletar.mockResolvedValue(saudavel());
    expect((await GET(req({ header: `Bearer ${TOKEN}` }))).status).toBe(200);
    expect((await GET(req({ query: TOKEN }))).status).toBe(200);
  });
});

describe("GET /api/health/sistema: o que responde", () => {
  it("200 sem vermelhas, sem cache", async () => {
    coletar.mockResolvedValue(saudavel());
    const res = await GET(req({ query: TOKEN }));
    expect(await res.json()).toEqual({ ok: true, vermelhas: [] });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("amarelo não derruba o monitor", async () => {
    const d = saudavel();
    d.leitura!.eventos = [{ origem: "render:/adm", nivel: "ERRO", criadoEm: new Date() }];
    coletar.mockResolvedValue(d);
    expect((await GET(req({ query: TOKEN }))).status).toBe(200);
  });

  it("503 com a chave da peça vermelha", async () => {
    const d = saudavel();
    d.leitura!.inscricoesPagas = { total: 1, maisAntiga: new Date(Date.now() - 2 * 3_600_000) };
    coletar.mockResolvedValue(d);
    const res = await GET(req({ query: TOKEN }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, vermelhas: ["provisionamento"] });
  });

  it("banco fora do ar responde 503 com banco, sem 500", async () => {
    coletar.mockResolvedValue({ banco: { ok: false, ms: 3000 }, leitura: null });
    const res = await GET(req({ query: TOKEN }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, vermelhas: ["banco"] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/health/sistema/route.test.ts`
Expected: FAIL, módulo `./route` não existe.

- [ ] **Step 3: Implementar a rota**

`src/app/api/health/sistema/route.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { avaliarSaude } from "@/lib/saude/avaliar";
import { coletarDadosDeSaude } from "@/lib/saude/coletar";

/**
 * Para o monitor externo (UptimeRobot, Better Stack): 503 quando alguma peça
 * da saúde está vermelha, 200 caso contrário. Amarelo não derruba: o monitor
 * acorda alguém, e amarelo é para quando a pessoa abrir a tela.
 *
 * Mora no host raiz, como /api/health, porque o admin. fecha por IP e por
 * sessão, e o monitor não tem nenhum dos dois. A porta é o
 * HEALTH_MONITOR_TOKEN, aceito no header ou na query: o plano grátis de alguns
 * monitores não manda header.
 *
 * O corpo diz só QUAIS peças estão vermelhas, para a mensagem do alarme dizer
 * o que caiu. O motivo fica na tela do console.
 */
const SEM_CACHE = { "Cache-Control": "no-store" };

function autorizado(req: NextRequest): boolean {
  // `!esperado` não é redundante: sem ele, uma variável não configurada
  // compararia com string vazia e abriria a rota para "Bearer ".
  const esperado = process.env.HEALTH_MONITOR_TOKEN;
  if (!esperado) return false;
  const cabecalho = req.headers.get("authorization");
  const recebido = cabecalho?.startsWith("Bearer ")
    ? cabecalho.slice("Bearer ".length)
    : req.nextUrl.searchParams.get("token");
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // timingSafeEqual lança com tamanhos diferentes; o tamanho não é segredo.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: SEM_CACHE });
  }
  const agora = new Date();
  const saude = avaliarSaude(await coletarDadosDeSaude(agora), agora);
  const vermelhas = saude.pecas.filter((p) => p.cor === "vermelho").map((p) => p.chave);
  return NextResponse.json(
    { ok: vermelhas.length === 0, vermelhas },
    { status: vermelhas.length ? 503 : 200, headers: SEM_CACHE }
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/health/sistema/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Política de acesso**

Em `src/security/politica-de-acesso.ts`, logo depois da linha de `"GET /api/health"`:

```ts
  "GET /api/health/sistema": segredo("HEALTH_MONITOR_TOKEN no Authorization: Bearer ou em ?token=, enviado pelo monitor externo"),
```

- [ ] **Step 6: Teste do proxy que falha**

Em `src/proxy.test.ts`, nas duas listas `it.each` que contêm `"/api/health"`:
- na primeira (`"%s passa sem resolver tenant"`, ~linha 321), acrescentar `"/api/health/sistema",` depois de `"/api/health",`;
- na segunda (`"%s em host de restaurante"`, ~linha 774), acrescentar `["/api/health/sistema", "GET"],` depois de `["/api/health", "GET"],`.

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL no caso novo da primeira lista (o raiz responde 404 para caminho fora da landing).

- [ ] **Step 7: O ramo no proxy**

Em `src/proxy.ts`, logo depois do bloco `if (nextUrl.pathname === "/api/health") { ... }`:

```ts
  // O monitor externo da saúde do sistema. Mesmo motivo do /api/health: bate
  // no host raiz, que não tem tenant, e o raiz responde 404 para qualquer
  // caminho fora da landing. A porta é o HEALTH_MONITOR_TOKEN, não o proxy.
  if (nextUrl.pathname === "/api/health/sistema") {
    return NextResponse.next(semTenant);
  }
```

- [ ] **Step 8: `.env.example`**

Depois da linha `CRON_SECRET=""`:

```
# Segredo do monitor externo que consulta /api/health/sistema (UptimeRobot,
# Better Stack). Sem ele a rota recusa tudo. Gerar com: openssl rand -hex 24
HEALTH_MONITOR_TOKEN=""
```

- [ ] **Step 9: Rodar a suíte de segurança e o proxy**

Run: `npx vitest run src/proxy.test.ts src/security/`
Expected: PASS. A matriz de acesso exercita a rota nova como `SEGREDO` (401 sem tocar o banco) e o invariante de `semTenant` cobre o ramo novo.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/health/sistema src/proxy.ts src/proxy.test.ts src/security/politica-de-acesso.ts .env.example
git commit -m "Saúde: /api/health/sistema para o monitor externo

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Os sinais de sucesso e a etapa de expurgo no cron

**Files:**
- Modify: `src/app/api/cron/assinaturas/route.ts`
- Modify: `src/app/api/cron/assinaturas/route.test.ts`
- Modify: `src/app/api/assinaturas/webhook/asaas/route.ts`
- Modify: `src/app/api/assinaturas/webhook/asaas/route.test.ts`
- Modify: `src/app/api/payments/webhook/[provider]/[tenantId]/route.ts`
- Modify: `src/app/api/payments/webhook/[provider]/[tenantId]/route.test.ts`
- Modify: `src/lib/assinatura/provisionamento.ts` (coberto pelo teste do webhook do Asaas, que roda o provisionamento de verdade)

**Interfaces:**
- Consumes: `registrarSaude` (Task 2, mock global), `expurgarEventosDeSaude` (Task 6), `ORIGEM_DO_CRON`, `ORIGEM_DO_PROVISIONAMENTO` (Task 3).
- Produces: eventos `OK`/`AVISO` com as origens `cron/assinaturas`, `webhook/asaas`, `webhook/pagamento`, `provisionamento`.

- [ ] **Step 1: Testes do cron que falham**

Em `src/app/api/cron/assinaturas/route.test.ts`, acrescentar perto dos outros `vi.mock`:

```ts
const expurgarSaude = vi.fn();
vi.mock("@/lib/saude/expurgo", () => ({
  expurgarEventosDeSaude: (...a: unknown[]) => expurgarSaude(...a),
}));
```

E o import (o módulo já é mock pelo setup global):

```ts
import { registrarSaude } from "@/lib/saude/registrar";
```

No `beforeEach` existente (que já começa com `vi.clearAllMocks()`, o que limpa também as chamadas do mock global de `registrarSaude`), acrescentar no fim:

```ts
  expurgarSaude.mockResolvedValue(0);
```

Novos testes, no fim do arquivo. `requisicao()` é o helper do próprio arquivo, que já manda `Authorization: Bearer <SEGREDO>`:

```ts
describe("sinal de vida do cron", () => {
  it("grava OK com as contagens quando todas as etapas passam", async () => {
    const res = await POST(requisicao());
    expect(res.status).toBe(200);
    expect(registrarSaude).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "cron/assinaturas", nivel: "OK", mensagem: "rodou" })
    );
  });

  it("grava AVISO quando uma etapa cai no catch", async () => {
    expurgarSaude.mockRejectedValue(new Error("boom"));
    await POST(requisicao());
    expect(registrarSaude).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: "cron/assinaturas",
        nivel: "AVISO",
        extra: expect.objectContaining({ etapasComErro: 1 }),
      })
    );
  });

  it("expurgo de saúde que falha não derruba o job", async () => {
    expurgarSaude.mockRejectedValue(new Error("boom"));
    const res = await POST(requisicao());
    expect(res.status).toBe(200);
    expect((await res.json()).expurgoDeSaudeFalhou).toBe(true);
  });

  it("sem o segredo não grava sinal nenhum", async () => {
    await POST(requisicao({ secret: null }));
    expect(registrarSaude).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/app/api/cron/assinaturas/route.test.ts`
Expected: FAIL nos três primeiros novos (o de "sem o segredo" já passa).

- [ ] **Step 2: Implementar no cron**

Em `src/app/api/cron/assinaturas/route.ts`, imports:

```ts
import { registrarSaude } from "@/lib/saude/registrar";
import { expurgarEventosDeSaude } from "@/lib/saude/expurgo";
import { ORIGEM_DO_CRON } from "@/lib/saude/origens";
```

Depois do bloco `try { tokensApagados = ... } catch (erro) { ... faxinaDeDadosFalhou = true ... }` e antes de `const resposta = {`:

```ts
  // Eventos de saúde com mais de 30 dias. Conveniência, como o expurgo do
  // funil: não derruba a cobrança do dia.
  let eventosDeSaudeApagados = 0;
  let expurgoDeSaudeFalhou = false;
  try {
    eventosDeSaudeApagados = await expurgarEventosDeSaude(agora);
  } catch (erro) {
    expurgoDeSaudeFalhou = true;
    await reportarErro({ origem: "cron/assinaturas:saude", erro });
  }
```

Na `resposta`, depois de `...(faxinaDeDadosFalhou ? { faxinaDeDadosFalhou: true } : {}),`:

```ts
    eventosDeSaudeApagados,
    ...(expurgoDeSaudeFalhou ? { expurgoDeSaudeFalhou: true } : {}),
```

Depois de montar `resposta` e antes do `return NextResponse.json(`:

```ts
  // O sinal de vida que a tela de saúde lê. Gravado no fim, de propósito: "o
  // cron rodou" é o que pega a Vercel parando de chamá-lo, e uma execução que
  // morre no meio não chega aqui. Etapa que falhou vira AVISO, não ausência.
  const etapasComErro = [
    cobrancasDoAsaasFalhou,
    reconciliacaoFalhou,
    limpezaDeInscricoesFalhou,
    expurgoDoFunilFalhou,
    faxinaDeDadosFalhou,
    expurgoDeSaudeFalhou,
  ].filter(Boolean).length;
  await registrarSaude({
    origem: ORIGEM_DO_CRON,
    nivel: etapasComErro ? "AVISO" : "OK",
    mensagem: etapasComErro ? `rodou com ${etapasComErro} etapa(s) em erro` : "rodou",
    extra: { cobrancasCriadas, statusAtualizados, etapasComErro },
  });
```

Run: `npx vitest run src/app/api/cron/assinaturas/route.test.ts`
Expected: PASS, inclusive os testes antigos (a resposta só ganhou campos).

- [ ] **Step 3: Webhook do Asaas, teste que falha**

Em `src/app/api/assinaturas/webhook/asaas/route.test.ts`, importar `registrarSaude` de `@/lib/saude/registrar` (o `vi.clearAllMocks()` do `beforeEach` existente já limpa as chamadas). Acrescentar, dentro do `describe("POST /api/assinaturas/webhook/asaas")`. `requisicao`, `eventoPago`, `inscricaoAguardando` e os mocks são do próprio arquivo; `provisionarInscricao` roda de verdade aqui, sobre o Prisma mockado, então o mesmo teste cobre o sinal do provisionamento:

```ts
  it("grava o sinal do webhook e o do provisionamento depois de processar o pagamento", async () => {
    inscricaoFindFirst.mockResolvedValue(inscricaoAguardando());

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(registrarSaude).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "webhook/asaas", nivel: "OK", mensagem: "PAYMENT_CONFIRMED processado" })
    );
    expect(registrarSaude).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "provisionamento", nivel: "OK", tenantId: "tenant-1" })
    );
  });

  it("grava o sinal do webhook quando o evento vai para o espelho", async () => {
    espelharEventoDeAssinatura.mockResolvedValue(true);

    await POST(requisicao({ ...eventoPago(), event: "PAYMENT_OVERDUE" }));

    expect(registrarSaude).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "webhook/asaas", nivel: "OK", mensagem: "PAYMENT_OVERDUE espelhado" })
    );
  });

  it("token inválido não grava sinal", async () => {
    webhookAutorizado.mockReturnValue(false);
    await POST(requisicao(eventoPago(), "errado"));
    expect(registrarSaude).not.toHaveBeenCalled();
  });
```

Run: `npx vitest run src/app/api/assinaturas/webhook/asaas/route.test.ts`
Expected: FAIL nos dois primeiros novos (o terceiro já passa).

- [ ] **Step 4: Webhook do Asaas, implementação**

Import: `import { registrarSaude } from "@/lib/saude/registrar";`

Trocar `if (await espelharEventoDeAssinatura(corpo, new Date())) return ok();` por:

```ts
  if (await espelharEventoDeAssinatura(corpo, new Date())) {
    await registrarSaude({ origem: "webhook/asaas", nivel: "OK", mensagem: `${evento} espelhado` });
    return ok();
  }
```

E, depois de `await provisionarInscricao(inscricao, { ... });` e antes do `return ok();` final:

```ts
  await registrarSaude({
    origem: "webhook/asaas",
    nivel: "OK",
    mensagem: `${evento} processado`,
    extra: { inscricaoId: inscricao.id },
  });
```

Run: `npx vitest run src/app/api/assinaturas/webhook/asaas/route.test.ts`
Expected: o teste do espelho passa; o do pagamento processado ainda falha na asserção do provisionamento, que entra no Step 7.

- [ ] **Step 5: Webhook de pagamento, testes que falham**

Em `src/app/api/payments/webhook/[provider]/[tenantId]/route.test.ts`, importar `registrarSaude` de `@/lib/saude/registrar` (o `vi.clearAllMocks()` do `beforeEach` existente limpa as chamadas). O `reportarErro` real roda aqui e chama `registrarSaude` com `nivel: "ERRO"`, então o mock global basta para observar os dois casos, sem mockar `@/lib/observabilidade`. `TENANT`, `PROVIDER`, `req`, `params` e `handleWebhook` são do próprio arquivo; o `beforeEach` já deixa um pagamento `approved` pronto. Acrescentar no fim:

```ts
describe("sinais para a tela de saúde", () => {
  it("evento processado grava OK com provider e tenant", async () => {
    const res = await POST(req(), params);

    expect(res.status).toBe(200);
    expect(registrarSaude).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "webhook/pagamento", nivel: "OK", tenantId: TENANT, extra: { provider: PROVIDER } })
    );
  });

  it("falha genérica vira evento de erro, não só log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    handleWebhook.mockRejectedValue(new Error("credencial corrompida"));

    const res = await POST(req(), params);

    expect(res.status).toBe(500);
    expect(registrarSaude).toHaveBeenCalledWith(
      expect.objectContaining({ origem: "webhook/pagamento", nivel: "ERRO", tenantId: TENANT })
    );
  });

  it("assinatura inválida não grava nada: qualquer um pode chamar a URL", async () => {
    handleWebhook.mockRejectedValue(new InvalidWebhookSignatureError());
    await POST(req(), params);
    expect(registrarSaude).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run "src/app/api/payments/webhook/[provider]/[tenantId]/route.test.ts"`
Expected: FAIL nos dois primeiros (o terceiro já passa).

- [ ] **Step 6: Webhook de pagamento, implementação**

Import: `import { registrarSaude } from "@/lib/saude/registrar";`

Antes do `return NextResponse.json({ received: true });` que fecha o `try` (o último, depois do `runWithTenant`):

```ts
    await registrarSaude({
      origem: "webhook/pagamento",
      nivel: "OK",
      mensagem: `${providerId}: evento processado`,
      tenantId,
      extra: { provider: providerId },
    });
```

No `catch (err)` externo, depois do `console.error("Webhook error:", ...)`:

```ts
    // Até aqui o erro só ia para o log. Credencial que não abre (chave
    // rotacionada) derruba todos os pagamentos online de um restaurante, e
    // precisa aparecer na tela de saúde.
    await reportarErro({
      origem: "webhook/pagamento",
      erro: extractErrorMessage(err),
      extra: { provider: providerId, tenantId },
    });
```

Run: `npx vitest run "src/app/api/payments/webhook/[provider]/[tenantId]/route.test.ts"`
Expected: PASS.

- [ ] **Step 7: Provisionamento**

Em `src/lib/assinatura/provisionamento.ts`, import:

```ts
import { registrarSaude } from "@/lib/saude/registrar";
import { ORIGEM_DO_PROVISIONAMENTO } from "@/lib/saude/origens";
```

Depois do fim do `await prismaUnscoped.$transaction(...)` (a que contém `registrarEvento(tx, { tipo: "PROVISIONADO" ... })`) e antes do comentário "E-mail de boas-vindas":

```ts
  // Fora da transação: evento de saúde é relatório, e não pode desfazer um
  // restaurante que já nasceu.
  await registrarSaude({
    origem: ORIGEM_DO_PROVISIONAMENTO,
    nivel: "OK",
    mensagem: `restaurante ${inscricao.slug} no ar`,
    tenantId,
    extra: { inscricaoId: inscricao.id, via: origem },
  });
```

O teste do Step 3 ("grava o sinal do webhook e o do provisionamento") cobre este ponto: ele passa a ficar verde agora.

Run: `npx vitest run src/app/api/assinaturas/webhook/asaas/route.test.ts`
Expected: PASS.

- [ ] **Step 8: Suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/cron/assinaturas src/app/api/assinaturas/webhook/asaas "src/app/api/payments/webhook/[provider]/[tenantId]" src/lib/assinatura/provisionamento.ts
git commit -m "Saúde: sinais de vida do cron, dos webhooks e do provisionamento

O cron também passa a expurgar eventos de saúde com mais de 30 dias, e a
falha genérica do webhook de pagamento passa a ser reportada.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: A tela e o item no menu

**Files:**
- Create: `src/components/platform/saude/cores.ts`
- Create: `src/components/platform/saude/GradeDaSaude.tsx`
- Create: `src/components/platform/saude/FeedDeEventos.tsx`
- Create: `src/components/platform/saude/AtualizarSozinho.tsx`
- Create: `src/app/platform/saude/page.tsx`
- Modify: `src/components/platform/IconesConsole.tsx`
- Modify: `src/components/platform/MenuLateral.tsx`

**Interfaces:**
- Consumes: `coletarDadosDeSaude`, `coletarPedidosPorHora`, `listarEventos`, `LinhaDoFeed` (Task 6); `avaliarSaude`, `Saude`, `Peca`, `Cor` (Task 4); `lerFiltros`, `hrefDoFiltro`, `FiltrosDoFeed` (Task 6); `tempoDesde` (Task 3); `Painel`, `GraficoBarras` existentes.
- Produces: página `/saude` no host `admin.` (arquivo em `src/app/platform/saude/`), e `export const TOM_DA_COR: Record<Cor, string>`.

- [ ] **Step 1: Cores e o componente de auto-atualização**

`src/components/platform/saude/cores.ts`:

```ts
import type { Cor } from "@/lib/saude/avaliar";

/** Os mesmos tokens que a pauta da visão geral usa para o mesmo sentido. */
export const TOM_DA_COR: Record<Cor, string> = {
  verde: "bg-console-grafico",
  amarelo: "bg-console-aviso",
  vermelho: "bg-console-alerta",
  neutro: "bg-console-mudo",
};

export const ROTULO_DA_COR: Record<Cor, string> = {
  verde: "funcionando",
  amarelo: "atenção",
  vermelho: "parado",
  neutro: "sem cor",
};
```

`src/components/platform/saude/AtualizarSozinho.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Relê a página a cada minuto. Sem realtime de propósito: um minuto de atraso
 * é aceitável numa tela de saúde, e aba escondida não gasta consulta.
 */
export function AtualizarSozinho({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);
  return null;
}
```

- [ ] **Step 2: A grade das peças**

`src/components/platform/saude/GradeDaSaude.tsx`:

```tsx
import type { Saude } from "@/lib/saude/avaliar";
import { tempoDesde } from "@/lib/saude/tempo";
import { ROTULO_DA_COR, TOM_DA_COR } from "./cores";

export function GradeDaSaude({ saude, agora }: { saude: Saude; agora: Date }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {saude.pecas.map((p, i) => (
        <article
          key={p.chave}
          className="console-vidro console-entra rounded-[22px] p-4 sm:p-5"
          style={{ "--atraso": `${i * 40}ms` } as React.CSSProperties}
        >
          <header className="flex items-center gap-2.5">
            <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${TOM_DA_COR[p.cor]}`} />
            <h2 className="text-[15px] font-semibold text-console-tinta">{p.nome}</h2>
            <span className="sr-only">{ROTULO_DA_COR[p.cor]}</span>
          </header>
          <p className="mt-2 text-[13px] leading-snug text-console-segunda">{p.motivo}</p>
          <p className="mt-3 text-[12px] text-console-mudo">
            {p.ultimoSinal ? `último sinal ${tempoDesde(p.ultimoSinal, agora)}` : "sem sinal registrado"}
          </p>
        </article>
      ))}
    </section>
  );
}
```

- [ ] **Step 3: O feed**

`src/components/platform/saude/FeedDeEventos.tsx`:

```tsx
import Link from "next/link";
import type { LinhaDoFeed } from "@/lib/saude/coletar";
import { hrefDoFiltro, type FiltroDePeca, type FiltrosDoFeed } from "@/lib/saude/filtros";
import { tempoDesde } from "@/lib/saude/tempo";

const OPCOES: { valor: FiltroDePeca | null; rotulo: string }[] = [
  { valor: null, rotulo: "Tudo" },
  { valor: "cron", rotulo: "Cron" },
  { valor: "webhook-asaas", rotulo: "Asaas" },
  { valor: "pagamentos", rotulo: "Pagamentos" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "rotas", rotulo: "Rotas" },
  { valor: "outros", rotulo: "Outros" },
];

const TOM_DO_NIVEL = {
  OK: "text-console-mudo",
  AVISO: "text-console-aviso",
  ERRO: "text-console-alerta",
} as const;

const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Pilula({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "true" : undefined}
      className={`h-8 px-3 inline-flex items-center rounded-full text-[13px] transition-colors ${
        ativo ? "bg-console-cartao text-console-tinta font-semibold shadow-sm" : "text-console-segunda hover:text-console-tinta"
      }`}
    >
      {children}
    </Link>
  );
}

export function FeedDeEventos({
  linhas,
  filtros,
  agora,
}: {
  linhas: LinhaDoFeed[] | null;
  filtros: FiltrosDoFeed;
  agora: Date;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {OPCOES.map((o) => (
          <Pilula key={o.rotulo} href={hrefDoFiltro(filtros, { peca: o.valor })} ativo={filtros.peca === o.valor}>
            {o.rotulo}
          </Pilula>
        ))}
        <span className="mx-1 h-5 w-px bg-console-linha" aria-hidden />
        <Pilula href={hrefDoFiltro(filtros, { todos: !filtros.todos })} ativo={filtros.todos}>
          {filtros.todos ? "Mostrando os OK" : "Mostrar os OK"}
        </Pilula>
        {filtros.tenantId && (
          <Pilula href={hrefDoFiltro(filtros, { tenantId: null })} ativo>
            Só um restaurante ✕
          </Pilula>
        )}
      </div>

      {linhas === null ? (
        <p className="text-sm text-console-mudo py-6">Não foi possível ler os eventos agora.</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-console-mudo py-6">Nenhum evento com esses filtros.</p>
      ) : (
        <ol className="divide-y divide-console-linha">
          {linhas.map((l) => (
            <li key={l.id} className="py-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
              <span className={`font-semibold ${TOM_DO_NIVEL[l.nivel]}`}>{l.nivel}</span>
              <span className="text-console-tinta break-words">{l.mensagem}</span>
              <span />
              <span className="text-[12px] text-console-mudo">
                <time dateTime={l.criadoEm.toISOString()} title={HORA.format(l.criadoEm)}>
                  {tempoDesde(l.criadoEm, agora)}
                </time>
                {" · "}
                <code className="font-mono">{l.origem}</code>
                {l.restaurante && l.tenantId && (
                  <>
                    {" · "}
                    <Link href={hrefDoFiltro(filtros, { tenantId: l.tenantId })} className="underline underline-offset-2">
                      {l.restaurante}
                    </Link>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 4: A página**

`src/app/platform/saude/page.tsx`:

```tsx
import { authPlatform } from "@/lib/auth-platform";
import { avaliarSaude } from "@/lib/saude/avaliar";
import { coletarDadosDeSaude, coletarPedidosPorHora, listarEventos } from "@/lib/saude/coletar";
import { lerFiltros } from "@/lib/saude/filtros";
import { Painel } from "@/components/platform/Painel";
import { GraficoBarras } from "@/components/platform/GraficoBarras";
import { GradeDaSaude } from "@/components/platform/saude/GradeDaSaude";
import { FeedDeEventos } from "@/components/platform/saude/FeedDeEventos";
import { AtualizarSozinho } from "@/components/platform/saude/AtualizarSozinho";
import { TOM_DA_COR } from "@/components/platform/saude/cores";

/**
 * A saúde do sistema: semáforo das peças, volume de pedidos e o feed.
 *
 * A regra mora em src/lib/saude/avaliar.ts, a mesma que a rota do monitor
 * usa. Esta página só busca e desenha. Leitura que falha vira texto na tela,
 * nunca erro de página: é justamente quando algo está quebrado que esta tela
 * precisa abrir.
 */
export default async function SaudePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await authPlatform();
  if (!session?.user) return null;

  const agora = new Date();
  const filtros = lerFiltros(await searchParams);
  const [dados, porHora, eventos] = await Promise.all([
    coletarDadosDeSaude(agora),
    coletarPedidosPorHora(agora).catch(() => null),
    listarEventos(filtros).catch(() => null),
  ]);
  const saude = avaliarSaude(dados, agora);

  return (
    <div className="space-y-5">
      <AtualizarSozinho />
      <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.04em] leading-none pt-2 pb-1 sm:pb-3">
        Saúde
      </h1>

      <section className="console-vidro console-entra rounded-[22px] sm:rounded-[28px] p-4 sm:p-6 flex items-center gap-3">
        <span aria-hidden className={`size-3.5 shrink-0 rounded-full ${TOM_DA_COR[saude.geral]}`} />
        <p className="text-[17px] sm:text-[20px] font-semibold tracking-[-0.015em]">{saude.resumo}</p>
      </section>

      <GradeDaSaude saude={saude} agora={agora} />

      <Painel titulo="Pedidos por hora" subtitulo="hoje, na plataforma inteira; passe o cursor para ver a média das 4 semanas">
        {porHora === null ? (
          <p className="text-sm text-console-mudo py-6">Não foi possível ler os pedidos agora.</p>
        ) : (
          <GraficoBarras
            barras={porHora.map((b) => ({
              rotulo: `${String(b.hora).padStart(2, "0")}h`,
              valor: b.hoje,
              titulo: `média das 4 semanas: ${b.media}`,
            }))}
            unidade={["pedido", "pedidos"]}
            ultimaEmCurso
          />
        )}
      </Painel>

      <Painel titulo="Eventos" subtitulo="os 100 mais recentes; por padrão, só avisos e erros">
        <FeedDeEventos linhas={eventos} filtros={filtros} agora={agora} />
      </Painel>
    </div>
  );
}
```

Antes de seguir, abrir `src/components/platform/GraficoBarras.tsx` e conferir como `titulo` e `unidade` aparecem no balão. Se `titulo` substituir o valor no balão em vez de complementar, trocar para `titulo: \`${b.hoje} hoje · média ${b.media}\``.

- [ ] **Step 5: Ícone e item no menu**

Em `src/components/platform/IconesConsole.tsx`, acrescentar no fim, seguindo o formato dos outros ícones do arquivo (que usam `Base`):

```tsx
/** Linha de pulso dentro de um coração: a saúde do sistema. */
export function IconeSaude(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z" />
      <path d="M7.5 12h2.5l1.5-2.5 2 4 1.5-1.5h1.5" />
    </Base>
  );
}
```

Em `src/components/platform/MenuLateral.tsx`:
- importar `IconeSaude` junto dos outros ícones;
- em `ITENS`, depois do item `/clientes`: `{ tipo: "link", href: "/saude", rotulo: "Saúde", Icone: IconeSaude },`;
- em `DESTINOS_DO_CELULAR`, no fim: `{ href: "/saude", rotulo: "Saúde", Icone: IconeSaude },`;
- em `MenuInferior`, trocar `grid-cols-4` por `grid-cols-5`.

- [ ] **Step 6: Lint, testes e build**

Run: `npm run lint && npm test && npx tsc --noEmit`
Expected: sem erro.

Run: `npx prisma generate && node node_modules/next/dist/bin/next build --webpack`
Expected: build completo, `/platform/saude` e `/api/health/sistema` na lista de rotas. Nenhum aviso de módulo Node (`@prisma/client`) em bundle de edge. Se o build reclamar de variável de ambiente ausente, usar as do `.env` local; não usar `.env.prod`.

- [ ] **Step 7: Verificação no navegador**

Com `docker compose up -d` e o banco local migrado:

1. Gravar eventos de exemplo:
   ```bash
   docker exec muno-db-dev psql -U muno -d muno -c "insert into \"EventoSistema\" (id, origem, nivel, mensagem, \"criadoEm\") values ('s1','cron/assinaturas','OK','rodou', now() - interval '3 hours'), ('s2','webhook/pagamento','ERRO','credencial não abre', now() - interval '10 minutes'), ('s3','forgot-password:envio','ERRO','domain is not verified', now() - interval '2 hours');"
   ```
2. Subir o dev server pelo `preview_start` (configuração do `.claude/launch.json`; se não houver, criar uma com `npm run dev` na porta 3000) e entrar no console em `admin.localhost:3000` com o admin do seed (senha em `prisma/seed.ts`).
3. Abrir `/saude`. Conferir: faixa amarela citando "Pagamentos dos restaurantes"; grade com 8 peças; cron verde; e-mail amarelo; feed com as duas linhas de ERRO; "Mostrar os OK" faz aparecer a terceira; filtro "E-mail" deixa só uma.
4. `resize_window` para `mobile`: menu inferior com 5 itens cabendo, sem rolagem horizontal. Voltar para `desktop`.
5. Tema escuro (`colorScheme: "dark"`): pontos coloridos visíveis.
6. Screenshot como prova.
7. Apagar os eventos de exemplo: `docker exec muno-db-dev psql -U muno -d muno -c "delete from \"EventoSistema\" where id in ('s1','s2','s3');"`

- [ ] **Step 8: Commit**

```bash
git add src/components/platform/saude src/app/platform/saude src/components/platform/IconesConsole.tsx src/components/platform/MenuLateral.tsx
git commit -m "Saúde: a tela no console, com semáforo, pedidos por hora e feed

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: O ponto colorido no menu (condicional)

A spec pede medir antes de manter: o layout do console roda em toda tela, e calcular a saúde ali soma consultas a todo clique.

**Files:**
- Modify: `src/app/platform/layout.tsx`
- Modify: `src/components/platform/MenuLateral.tsx`

**Interfaces:**
- Consumes: `coletarDadosDeSaude`, `avaliarSaude`, `Cor`, `TOM_DA_COR`.
- Produces: prop `saude: Cor` em `MenuLateral` e `MenuInferior`.

- [ ] **Step 1: Medir**

Com o dev server da Task 9 de pé e dados realistas no banco local (`npm run db:espelhar`, que traz produção anonimizada), acrescentar temporariamente em `src/app/platform/layout.tsx`, logo depois de `const agora = new Date();`:

```ts
  const t0 = performance.now();
  await coletarDadosDeSaude(agora);
  console.log(`[saude] coleta no layout: ${Math.round(performance.now() - t0)} ms`);
```

Abrir três telas do console e ler o número no `preview_logs`.

Critério: **até 40 ms** de mediana, seguir para o Step 2. **Acima disso**, apagar as três linhas, não fazer este task, e registrar no commit da Task 11 que o ponto ficou de fora e por quê.

- [ ] **Step 2: Calcular no layout**

Trocar as três linhas de medição por uma entrada no `Promise.all` que já existe no layout (o que busca `novos`, `negociando` e `emAberto`), acrescentando `coletarDadosDeSaude(agora)` como quarto item, e depois:

```ts
  // O ponto do item "Saúde" no menu: a mesma regra da tela e do monitor.
  const corDaSaude = avaliarSaude(dadosDaSaude, agora).geral;
```

Imports: `coletarDadosDeSaude` de `@/lib/saude/coletar`, `avaliarSaude` de `@/lib/saude/avaliar`. Passar `saude={corDaSaude}` para `<MenuLateral ... />` e `<MenuInferior ... />`.

- [ ] **Step 3: Desenhar o ponto**

Em `src/components/platform/MenuLateral.tsx`:
- importar `type Cor` de `@/lib/saude/avaliar` e `TOM_DA_COR` de `./saude/cores`;
- `MenuLateral` e `MenuInferior` recebem `saude: Cor` além de `contagens`, e repassam a `ItemLink`;
- em `ItemLink`, depois do selo de contagem:

```tsx
      {item.href === "/saude" && (saude === "amarelo" || saude === "vermelho") && (
        <span aria-label={saude === "vermelho" ? "algo parou" : "pede atenção"} className={`size-2.5 rounded-full ${TOM_DA_COR[saude]}`} />
      )}
```

- em `MenuInferior`, no mesmo lugar do ponto de pendências, para `href === "/saude"`, o mesmo ponto com `absolute top-0.5 right-3 size-2 ring-2 ring-console-papel` e a cor de `TOM_DA_COR[saude]`.

Verde e neutro não desenham nada: ponto sempre aceso vira papel de parede.

- [ ] **Step 4: Verificar**

Run: `npm run lint && npx tsc --noEmit && npx vitest run src/security/invariantes.test.ts`
Expected: PASS (`src/app/platform/layout.tsx` já está em `USO_DE_PRISMA_UNSCOPED`; `MenuLateral` é `"use client"` e importa só tipos e um mapa de classes, nada de servidor).

No navegador, com o evento de erro da Task 9 Step 7 gravado de novo: ponto amarelo no item "Saúde" em `/leads`, no desktop e no celular. Apagar o evento: o ponto some.

- [ ] **Step 5: Commit**

```bash
git add src/app/platform/layout.tsx src/components/platform/MenuLateral.tsx
git commit -m "Saúde: ponto no item do menu quando algo pede atenção

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Documentação

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-10-07-saude-do-sistema-design.md` (seção "Depois do deploy" se a Task 10 foi pulada)

- [ ] **Step 1: Seção nova no `AGENTS.md`**

Acrescentar depois da seção "Erro que importa passa por reportarErro" (dentro de "# Tempo real, alarme e documentos legais"):

```markdown
## A saúde do sistema

`admin.munoapp.com.br/saude` mostra um semáforo das peças que param em
silêncio (cron, webhook do Asaas, provisionamento, pagamentos dos
restaurantes, e-mail, erros de rota, volume de pedidos) e um feed de eventos.
A spec é `docs/superpowers/specs/2026-10-07-saude-do-sistema-design.md`.

* **Todo `reportarErro` vira um `EventoSistema`.** Não é preciso fazer nada
  para um erro novo aparecer no feed. Para ele acender uma peça, a origem
  precisa casar com um prefixo de `classificarOrigem()`
  (`src/lib/saude/origens.ts`), e a ordem das regras ali importa.
* **"Funcionou" precisa ser dito.** Ausência de erro não prova nada; as peças
  leem o último `registrarSaude({ nivel: "OK" })`. Fluxo novo que deve ser
  vigiado ganha um sinal no ponto de sucesso, não só o `reportarErro` no
  `catch`.
* **A regra mora em `avaliarSaude()`**, função pura, e os números em
  `src/lib/saude/limiares.ts`. A tela e `/api/health/sistema` chamam a mesma
  função: não recrie a regra em outro lugar.
* **Quem avisa é um monitor externo**, não código nosso. Ele consulta
  `munoapp.com.br/api/health/sistema?token=<HEALTH_MONITOR_TOKEN>` a cada 5
  minutos e alerta em 503, que só acontece com peça vermelha. A rota mora no
  host raiz porque o `admin.` fecha por IP e por sessão.
* **Pedidos nunca fica vermelho**, de propósito: queda de volume tem causa
  inocente, e vermelho por motivo inocente ensina a ignorar o alarme.
* **Nos testes de unidade, `registrarSaude` é mock global**
  (`src/test-setup/sem-saude.ts`), porque o Prisma lê o `.env` sozinho e
  gravaria no banco local. O teste do próprio registrar usa `vi.importActual`.
* O cron diário apaga eventos com mais de 30 dias.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-10-07-saude-do-sistema-design.md
git commit -m "AGENTS.md: a saúde do sistema

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 3: Verificação final**

Run: `npm run lint && npm test && npm run test:integracao && npx tsc --noEmit`
Expected: tudo verde. Anotar a saída para o relatório.

## Depois do merge (fora do código, feito pelo dono)

1. Gerar o token: `openssl rand -hex 24`, e definir `HEALTH_MONITOR_TOKEN` na Vercel, só em produção.
2. Criar no UptimeRobot ou Better Stack um monitor HTTP para `https://munoapp.com.br/api/health/sistema?token=<token>`, a cada 5 minutos, alertando quando o status não for 200.
3. No dia seguinte ao deploy, depois das 06:00 de Brasília, abrir `/saude` e conferir que "Cron diário" ficou verde.
