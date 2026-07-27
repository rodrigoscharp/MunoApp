# Pagamentos Self-Service — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada lojista conecta o próprio gateway de pagamento por chave de API numa tela do `/adm`, recebendo o dinheiro direto na conta dele, sem nenhum dado da plataforma no fluxo.

**Architecture:** A camada `src/lib/payments/` deixa de assumir OAuth. Cada adapter passa a declarar um `meta` (campos de credencial, métodos cobertos) que faz a tela de configuração se montar sozinha, e implementa `validateCredentials`/`createCharge`/`handleWebhook`. As credenciais viram um blob JSON criptografado por tenant em `PaymentConnection`, e o webhook passa a ser por tenant, validado com o segredo daquele lojista.

**Tech Stack:** Next.js 16.2.2 (App Router, webpack), React 19.2.4, Prisma 6, TypeScript 6, Zod 4, Tailwind 4, Vitest (novo).

## Global Constraints

- **Nenhum dado de pagamento da plataforma pode sobrar no código.** Ao final, nenhuma referência a `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET` ou `PLATFORM_COMMISSION_PERCENT` deve existir.
- **Sem comissão/split.** Nenhum `application_fee` ou `marketplace_fee` em nenhuma cobrança.
- **Webhook sem segredo configurado é recusado**, nunca processado. O `tenantId` na URL é público e não autentica nada.
- **Credencial nunca sai da API em claro**, nem para o ADMIN do próprio tenant. Só `••••` + últimos 4 caracteres.
- Antes de escrever qualquer código de Next.js, ler o guia relevante em `node_modules/next/dist/docs/` (regra do `AGENTS.md` — esta versão tem breaking changes).
- Mensagens de commit e comentários de código em português, seguindo a convenção do repositório.
- Toda credencial persistida usa `encryptSecret`/`decryptSecret` de `src/lib/crypto.ts` (AES-256-GCM), que exige `PAYMENT_TOKEN_ENCRYPTION_KEY` (32 bytes hex).

## Estrutura de arquivos

**Criados:**
| Arquivo | Responsabilidade |
|---|---|
| `vitest.config.ts` | Config do runner: ambiente node, alias `@/`, env de teste |
| `src/lib/payments/credentials.ts` | Serializa/criptografa/mascara o blob de credenciais |
| `src/lib/payments/asaas-adapter.ts` | Adapter Asaas |
| `src/app/api/payments/charge/route.ts` | Cria cobrança (substitui `mercadopago/route.ts`) |
| `src/app/api/payments/webhook/[provider]/[tenantId]/route.ts` | Webhook por tenant |
| `src/app/api/payments/connections/route.ts` | CRUD de conexões do tenant logado |
| `src/app/api/payments/methods/route.ts` | Métodos habilitados (público, pro checkout) |
| `src/app/adm/pagamentos/page.tsx` | Tela de configuração |
| `src/components/adm/PaymentGatewayCard.tsx` | Card de um gateway, com formulário e estados |

**Modificados:** `package.json`, `prisma/schema.prisma`, `src/lib/payments/types.ts`, `src/lib/payments/factory.ts`, `src/lib/payments/mercadopago-adapter.ts`, `src/app/(client)/checkout/page.tsx`, `src/app/api/orders/route.ts`, `src/components/adm/AdminSidebar.tsx`, `vercel.json`.

**Apagados:** `src/app/api/payments/mercadopago/`, `src/app/api/payments/webhook/route.ts`, `src/app/api/payments/connect/`, `src/app/api/payments/callback/`, `src/app/api/cron/refresh-payment-tokens/`, `src/lib/oauth-state.ts`.

---

### Task 1: Infraestrutura de teste

O projeto não tem runner nenhum hoje. Esta task existe para as próximas poderem seguir TDD.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `src/lib/payments/smoke.test.ts` (temporário, apagado no fim da task)

**Interfaces:**
- Consumes: nada.
- Produces: comando `npm test` (roda uma vez) e `npm run test:watch`. Alias `@/` funciona dentro dos testes. A env `PAYMENT_TOKEN_ENCRYPTION_KEY` já vem preenchida nos testes.

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Chave fixa de 32 bytes só pra teste — src/lib/crypto.ts exige uma.
    env: {
      PAYMENT_TOKEN_ENCRYPTION_KEY: "0".repeat(64),
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Adicionar os scripts no `package.json`**

Dentro de `"scripts"`, junto dos existentes:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Escrever um teste de fumaça que prova alias + env**

Criar `src/lib/payments/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

describe("infra de teste", () => {
  it("resolve o alias @/ e enxerga a chave de criptografia", () => {
    const encrypted = encryptSecret("segredo");
    expect(encrypted).not.toContain("segredo");
    expect(decryptSecret(encrypted)).toBe("segredo");
  });
});
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 1 teste.

Se falhar com "PAYMENT_TOKEN_ENCRYPTION_KEY não configurado", o bloco `env` do config não está sendo aplicado — confira que está dentro de `test`, não na raiz.

- [ ] **Step 6: Apagar o teste de fumaça e commitar**

```bash
rm src/lib/payments/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "Adiciona Vitest para a camada de pagamentos"
```

---

### Task 2: Blob de credenciais

Isola a serialização/criptografia/mascaramento do JSON de credenciais, para nenhuma rota precisar lidar com isso na mão.

**Files:**
- Create: `src/lib/payments/credentials.ts`
- Test: `src/lib/payments/credentials.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` de `src/lib/crypto.ts`.
- Produces:
  - `encryptCredentials(creds: Record<string, string>): string`
  - `decryptCredentials(payload: string): Record<string, string>`
  - `maskCredentials(creds: Record<string, string>, fields: CredentialField[]): Record<string, string>` — devolve o valor em claro para campos `type: "text"`/`"select"` e `"••••1234"` para `type: "secret"`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/payments/credentials.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  encryptCredentials,
  decryptCredentials,
  maskCredentials,
} from "@/lib/payments/credentials";
import type { CredentialField } from "@/lib/payments/types";

const fields: CredentialField[] = [
  { key: "accessToken", label: "Access token", help: "", type: "secret", required: true },
  { key: "environment", label: "Ambiente", help: "", type: "select", required: true },
];

describe("credentials", () => {
  it("faz round-trip de encrypt/decrypt", () => {
    const creds = { accessToken: "APP_USR-123456789", environment: "production" };
    const payload = encryptCredentials(creds);

    expect(payload).not.toContain("APP_USR");
    expect(decryptCredentials(payload)).toEqual(creds);
  });

  it("mascara só os campos secretos, preservando os últimos 4", () => {
    const masked = maskCredentials(
      { accessToken: "APP_USR-123456789", environment: "production" },
      fields
    );

    expect(masked.accessToken).toBe("••••6789");
    expect(masked.environment).toBe("production");
  });

  it("não vaza tamanho de segredo curto", () => {
    const masked = maskCredentials({ accessToken: "ab" }, fields);

    expect(masked.accessToken).toBe("••••");
  });

  it("rejeita payload corrompido", () => {
    expect(() => decryptCredentials("lixo")).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test src/lib/payments/credentials.test.ts`
Expected: FAIL — o módulo `credentials` não existe.

> `CredentialField` ainda não existe em `types.ts`; ele é criado na Task 3. Para esta task, adicione **apenas** este bloco ao final de `src/lib/payments/types.ts` (o resto do arquivo é reescrito na Task 3):
>
> ```ts
> export interface CredentialField {
>   key: string;
>   label: string;
>   help: string;
>   type: "text" | "secret" | "select";
>   options?: { value: string; label: string }[];
>   required: boolean;
> }
> ```

- [ ] **Step 3: Implementar `src/lib/payments/credentials.ts`**

```ts
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { CredentialField } from "./types";

// As credenciais de cada gateway viram um único blob JSON criptografado,
// porque cada um pede campos diferentes (o MP quer token + webhook secret,
// o Asaas quer chave + ambiente). Uma coluna por campo obrigaria migration
// a cada gateway novo.
export function encryptCredentials(creds: Record<string, string>): string {
  return encryptSecret(JSON.stringify(creds));
}

export function decryptCredentials(payload: string): Record<string, string> {
  return JSON.parse(decryptSecret(payload)) as Record<string, string>;
}

// Nunca devolvemos segredo em claro pra UI — nem pro ADMIN do próprio
// tenant. Segredo com menos de 5 caracteres vira só bolinhas, pra não
// entregar o valor inteiro tentando mostrar "os últimos 4".
export function maskCredentials(
  creds: Record<string, string>,
  fields: CredentialField[]
): Record<string, string> {
  const secretKeys = new Set(fields.filter((f) => f.type === "secret").map((f) => f.key));

  return Object.fromEntries(
    Object.entries(creds).map(([key, value]) => {
      if (!secretKeys.has(key)) return [key, value];
      return [key, value.length > 4 ? `••••${value.slice(-4)}` : "••••"];
    })
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test src/lib/payments/credentials.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/credentials.ts src/lib/payments/credentials.test.ts src/lib/payments/types.ts
git commit -m "Adiciona blob criptografado de credenciais de gateway"
```

---

### Task 3: Virar a camada de pagamento para modo chave

**Esta task é grande de propósito.** Trocar a interface, o schema e o adapter são mudanças atômicas: qualquer recorte menor deixa o repositório sem compilar entre tasks. Os passos abaixo são pequenos; só não podem ser commitados separados.

**Files:**
- Modify: `prisma/schema.prisma` (model `PaymentConnection`)
- Modify: `src/lib/payments/types.ts` (reescrito)
- Modify: `src/lib/payments/factory.ts` (reescrito)
- Modify: `src/lib/payments/mercadopago-adapter.ts` (reescrito)
- Delete: `src/app/api/payments/connect/`, `src/app/api/payments/callback/`, `src/app/api/cron/refresh-payment-tokens/`, `src/lib/oauth-state.ts`
- Modify: `vercel.json` (remove o cron)
- Test: `src/lib/payments/factory.test.ts`, `src/lib/payments/mercadopago-adapter.test.ts`

**Interfaces:**
- Consumes: `encryptCredentials`/`decryptCredentials` da Task 2.
- Produces:
  - `PaymentProviderMeta`, `PaymentProvider`, `CredentialCheck` em `types.ts`
  - `listPaymentProviders(): PaymentProvider[]`
  - `getPaymentProvider(id: string): PaymentProvider`
  - `getActiveConnection(tenantId: string): Promise<PaymentConnection | null>` — só `status: "active"`
  - `getEnabledPaymentMethods(tenantId: string): Promise<PaymentMethod[]>` — sempre inclui `"CASH"`
  - `MercadoPagoAdapter` com `meta.id === "mercado_pago"`

- [ ] **Step 1: Reescrever o model no `prisma/schema.prisma`**

Substituir o model `PaymentConnection` inteiro por:

```prisma
model PaymentConnection {
  id                String   @id @default(cuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  provider          String   // 'mercado_pago' | 'asaas'
  credentials       String   // JSON criptografado (AES-256-GCM), ver src/lib/payments/credentials.ts
  externalAccountId String?  // id da conta no gateway, quando a validação devolver
  status            String   // 'pending_webhook' | 'active' | 'invalid' | 'disabled'
  lastCheckedAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([tenantId, provider])
  @@index([tenantId])
}
```

- [ ] **Step 2: Gerar e aplicar a migration**

```bash
npx prisma migrate dev --name pagamento_por_chave_de_api
```

O banco não tem nenhuma `PaymentConnection` (confirmado na spec), então a perda das colunas antigas não tem consequência. Se o Prisma pedir confirmação de perda de dados, aceite.

- [ ] **Step 3: Reescrever `src/lib/payments/types.ts`**

Manter `ChargeableOrder`, `Charge`, `WebhookResult` e `InvalidWebhookSignatureError` exatamente como estão hoje. Substituir a interface `PaymentProvider` e adicionar os novos tipos:

```ts
import type { PaymentMethod } from "@prisma/client";

export interface CredentialField {
  key: string;
  label: string;
  help: string;
  type: "text" | "secret" | "select";
  options?: { value: string; label: string }[];
  required: boolean;
}

export interface PaymentProviderMeta {
  id: string;
  label: string;
  docsUrl: string;
  methods: PaymentMethod[];
  credentialFields: CredentialField[];
}

export type CredentialCheck =
  | { ok: true; externalAccountId?: string }
  | { ok: false; reason: string };

export interface PaymentProvider {
  meta: PaymentProviderMeta;

  // Só confirma o que a API do gateway sabe responder (token válido, de qual
  // conta). O webhook secret NÃO é verificável por API — ele só se prova na
  // primeira notificação recebida.
  validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck>;

  // connection não é nullable: sem conexão não existe cobrança. Não há mais
  // fallback para conta da plataforma.
  createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge>;

  // Recebe a connection porque o segredo de assinatura é de cada lojista.
  // Recebe Headers inteiro porque cada gateway assina com headers diferentes.
  handleWebhook(
    payload: unknown,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null>;
}
```

- [ ] **Step 4: Escrever os testes do factory (vão falhar)**

Criar `src/lib/payments/factory.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prismaUnscoped: { paymentConnection: { findFirst } },
}));

const { getEnabledPaymentMethods, getActiveConnection, listPaymentProviders, getPaymentProvider } =
  await import("@/lib/payments/factory");

beforeEach(() => findFirst.mockReset());

describe("getEnabledPaymentMethods", () => {
  it("sem conexão ativa, só dinheiro", async () => {
    findFirst.mockResolvedValue(null);

    expect(await getEnabledPaymentMethods("tenant-1")).toEqual(["CASH"]);
  });

  it("conexão pending_webhook não habilita pagamento online", async () => {
    // getActiveConnection filtra por status 'active', então o findFirst
    // não devolve nada mesmo existindo linha em pending_webhook.
    findFirst.mockResolvedValue(null);

    expect(await getEnabledPaymentMethods("tenant-1")).toEqual(["CASH"]);
  });

  it("conexão ativa habilita os métodos do gateway mais dinheiro", async () => {
    findFirst.mockResolvedValue({ provider: "mercado_pago", status: "active" });

    const methods = await getEnabledPaymentMethods("tenant-1");

    expect(methods).toContain("PIX");
    expect(methods).toContain("CREDIT_CARD");
    expect(methods).toContain("CASH");
  });
});

describe("getActiveConnection", () => {
  it("consulta apenas conexões com status active", async () => {
    findFirst.mockResolvedValue(null);
    await getActiveConnection("tenant-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", status: "active" },
    });
  });
});

describe("registry", () => {
  it("lista os gateways disponíveis", () => {
    expect(listPaymentProviders().map((p) => p.meta.id)).toContain("mercado_pago");
  });

  it("explode em gateway desconhecido", () => {
    expect(() => getPaymentProvider("nubank")).toThrow();
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `npm test src/lib/payments/factory.test.ts`
Expected: FAIL — `getEnabledPaymentMethods` não existe.

- [ ] **Step 6: Reescrever `src/lib/payments/factory.ts`**

```ts
import type { PaymentConnection, PaymentMethod } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma";
import { MercadoPagoAdapter } from "./mercadopago-adapter";
import type { PaymentProvider } from "./types";

const adapters: Record<string, PaymentProvider> = {
  mercado_pago: new MercadoPagoAdapter(),
};

export function listPaymentProviders(): PaymentProvider[] {
  return Object.values(adapters);
}

export function getPaymentProvider(id: string): PaymentProvider {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`Provider de pagamento desconhecido: ${id}`);
  return adapter;
}

// Só conexões 'active' contam. 'pending_webhook' significa que o lojista
// ainda não configurou o segredo do webhook — sem isso não conseguiríamos
// confirmar o pagamento, então é melhor não oferecer pagamento online.
export async function getActiveConnection(tenantId: string): Promise<PaymentConnection | null> {
  return prismaUnscoped.paymentConnection.findFirst({
    where: { tenantId, status: "active" },
  });
}

export async function getEnabledPaymentMethods(tenantId: string): Promise<PaymentMethod[]> {
  const connection = await getActiveConnection(tenantId);
  if (!connection) return ["CASH"];

  return [...getPaymentProvider(connection.provider).meta.methods, "CASH"];
}
```

- [ ] **Step 7: Escrever os testes do adapter Mercado Pago (vão falhar)**

Criar `src/lib/payments/mercadopago-adapter.test.ts`. Estes cobrem a regra de segurança mais importante do projeto:

```ts
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { MercadoPagoAdapter } from "@/lib/payments/mercadopago-adapter";
import { encryptCredentials } from "@/lib/payments/credentials";
import { InvalidWebhookSignatureError } from "@/lib/payments/types";
import type { PaymentConnection } from "@prisma/client";

const WEBHOOK_SECRET = "segredo-do-lojista";
const DATA_ID = "123456";

function connectionWith(creds: Record<string, string>): PaymentConnection {
  return {
    id: "conn-1",
    tenantId: "tenant-1",
    provider: "mercado_pago",
    credentials: encryptCredentials(creds),
    externalAccountId: null,
    status: "active",
    lastCheckedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function signedHeaders(secret: string, requestId = "req-1", ts = "1700000000"): Headers {
  const manifest = `id:${DATA_ID};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId });
}

const payload = { type: "payment", data: { id: DATA_ID } };
const adapter = new MercadoPagoAdapter();

describe("handleWebhook — assinatura", () => {
  it("RECUSA quando o lojista não configurou webhook secret", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1" });

    await expect(
      adapter.handleWebhook(payload, signedHeaders(WEBHOOK_SECRET), connection)
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa assinatura forjada", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });

    await expect(
      adapter.handleWebhook(payload, signedHeaders("secret-errado"), connection)
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa header x-signature ausente", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });

    await expect(
      adapter.handleWebhook(payload, new Headers(), connection)
    ).rejects.toThrow(InvalidWebhookSignatureError);
  });

  it("recusa v1 de tamanho diferente sem estourar RangeError", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });
    const headers = new Headers({ "x-signature": "ts=1,v1=abc", "x-request-id": "req-1" });

    await expect(adapter.handleWebhook(payload, headers, connection)).rejects.toThrow(
      InvalidWebhookSignatureError
    );
  });

  it("ignora payload que não é notificação de pagamento", async () => {
    const connection = connectionWith({ accessToken: "APP_USR-1", webhookSecret: WEBHOOK_SECRET });

    const result = await adapter.handleWebhook(
      { type: "plan", data: { id: "1" } },
      signedHeaders(WEBHOOK_SECRET),
      connection
    );

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 8: Rodar e ver falhar**

Run: `npm test src/lib/payments/mercadopago-adapter.test.ts`
Expected: FAIL — o adapter ainda tem a assinatura antiga.

- [ ] **Step 9: Reescrever `src/lib/payments/mercadopago-adapter.ts`**

Partindo do arquivo atual, aplicar estas mudanças:

1. **Apagar** as constantes `PLATFORM_ACCESS_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET`, `WEBHOOK_SECRET`, `PLATFORM_COMMISSION_PERCENT`, a função `calculateCommission` e os métodos `getOnboardingUrl`, `exchangeAuthorizationCode`, `refreshToken`. Remover os imports de `OAuth`, `signOAuthState`, `prismaUnscoped`, `encryptSecret`.
2. **Manter** `mapPaymentStatus` intacto.
3. Adicionar o `meta` e trocar as assinaturas:

```ts
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

function configFor(connection: PaymentConnection): MercadoPagoConfig {
  const { accessToken } = decryptCredentials(connection.credentials);
  if (!accessToken) throw new Error("Conexão do Mercado Pago sem access token.");
  return new MercadoPagoConfig({ accessToken });
}

// A URL do webhook carrega o tenant porque, sem aplicação de plataforma, o
// segredo de assinatura é de cada lojista — precisamos saber de quem é a
// notificação antes de conseguir validá-la.
function notificationUrl(connection: PaymentConnection): string {
  return `${APP_URL}/api/payments/webhook/mercado_pago/${connection.tenantId}`;
}

function isValidSignature(secret: string, headers: Headers, dataId: string): boolean {
  const signature = headers.get("x-signature");
  const requestId = headers.get("x-request-id");
  if (!signature) return false;

  const parts = Object.fromEntries(
    signature.split(",").map((p) => {
      const [key, value] = p.split("=");
      return [key?.trim(), value?.trim()];
    })
  );
  const ts = parts.ts;
  const hash = parts.v1;
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${requestId ?? ""};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  // timingSafeEqual lança RangeError com buffers de tamanhos diferentes
  // (ex.: v1 forjado curto) — tratamos como assinatura inválida.
  const expectedBuf = Buffer.from(expected);
  const hashBuf = Buffer.from(hash);
  if (expectedBuf.length !== hashBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, hashBuf);
}

export class MercadoPagoAdapter implements PaymentProvider {
  meta: PaymentProviderMeta = {
    id: "mercado_pago",
    label: "Mercado Pago",
    docsUrl: "https://www.mercadopago.com.br/developers/panel/app",
    methods: ["PIX", "CREDIT_CARD"],
    credentialFields: [
      {
        key: "accessToken",
        label: "Access token de produção",
        help: "No painel do Mercado Pago: Suas integrações → sua aplicação → Credenciais de produção.",
        type: "secret",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Chave secreta do webhook",
        help: "Gerada ao cadastrar a URL de notificação na sua aplicação, em Webhooks.",
        type: "secret",
        required: false,
      },
    ],
  };

  async validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck> {
    const accessToken = credentials.accessToken;
    if (!accessToken) return { ok: false, reason: "Informe o access token." };

    try {
      const res = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { ok: false, reason: "O Mercado Pago recusou esse access token." };

      const user = (await res.json()) as { id?: number | string };
      return { ok: true, externalAccountId: user.id ? String(user.id) : undefined };
    } catch {
      return { ok: false, reason: "Não foi possível falar com o Mercado Pago agora." };
    }
  }

  async createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge> {
    // ... corpo atual, com três mudanças:
    //  - const mp = configFor(connection)
    //  - remover applicationFee e os spreads de application_fee/marketplace_fee
    //  - notification_url: notificationUrl(connection)
  }

  async handleWebhook(
    payload: unknown,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null> {
    const body = payload as { type?: string; data?: { id?: string } };
    if (body?.type !== "payment" || !body?.data?.id) return null;

    const { accessToken, webhookSecret } = decryptCredentials(connection.credentials);

    // Sem segredo configurado, NÃO processa. O tenantId da URL é público e
    // não autentica nada — aceitar aqui deixaria qualquer um marcar pedido
    // como pago.
    if (!webhookSecret) {
      console.error(
        `[mercadopago] Tenant ${connection.tenantId} recebeu webhook sem webhookSecret configurado — recusando.`
      );
      throw new InvalidWebhookSignatureError();
    }

    if (!isValidSignature(webhookSecret, headers, body.data.id)) {
      console.error("[mercadopago] Assinatura do webhook inválida — rejeitando notificação.");
      throw new InvalidWebhookSignatureError();
    }

    // Agora consultamos com o token do próprio lojista: o pagamento é da
    // conta dele, não existe mais token de plataforma.
    const paymentApi = new Payment(new MercadoPagoConfig({ accessToken }));
    const payment = await paymentApi.get({ id: body.data.id });

    const orderId = payment.external_reference;
    if (!orderId) return null;

    return {
      orderId,
      providerPaymentId: String(payment.id),
      status: mapPaymentStatus(payment.status),
    };
  }
}
```

- [ ] **Step 10: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: PASS — credentials (4), factory (6), mercadopago-adapter (5).

- [ ] **Step 11: Apagar a superfície de OAuth**

```bash
rm -rf src/app/api/payments/connect src/app/api/payments/callback src/app/api/cron/refresh-payment-tokens
rm src/lib/oauth-state.ts
```

No `vercel.json`, remover a chave `"crons"` inteira (era só o refresh de token).

- [ ] **Step 12: Verificar que nada quebrou**

Run: `npx tsc --noEmit`
Expected: erros **apenas** em `src/app/api/payments/mercadopago/route.ts` e `src/app/api/payments/webhook/route.ts` — as duas rotas antigas, que são substituídas na Task 4. Qualquer erro fora desses dois arquivos é regressão.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Migra camada de pagamento de OAuth para chave de API

Sem comissão sobre vendas (a receita da Muno é mensalidade fixa), o split
de marketplace perde a razão de existir — e com ele todo o fluxo OAuth,
que obrigava a plataforma a manter uma aplicação registrada no gateway.

Cada lojista passa a colar a própria credencial. A cobrança e a consulta
do webhook usam o token dele, e o dinheiro cai na conta dele."
```

---

### Task 4: Rotas de cobrança e webhook

**Files:**
- Create: `src/app/api/payments/charge/route.ts`
- Create: `src/app/api/payments/webhook/[provider]/[tenantId]/route.ts`
- Delete: `src/app/api/payments/mercadopago/`, `src/app/api/payments/webhook/route.ts`
- Modify: `src/app/(client)/checkout/page.tsx:112` (nome da rota)

**Interfaces:**
- Consumes: `getActiveConnection`, `getPaymentProvider` (Task 3).
- Produces: `POST /api/payments/charge` com o mesmo contrato de request/response da rota `mercadopago` atual. `POST /api/payments/webhook/[provider]/[tenantId]`.

- [ ] **Step 1: Ler o guia de route handlers desta versão do Next**

Read: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`

Confirmar como parâmetros dinâmicos chegam ao handler nesta versão — em Next 15+ `params` é uma Promise e precisa de `await`. Não escreva a rota antes de checar isso.

- [ ] **Step 2: Criar `src/app/api/payments/charge/route.ts`**

Copiar `src/app/api/payments/mercadopago/route.ts` e trocar a resolução do provider:

```ts
const connection = await getActiveConnection(tenantId);
if (!connection) {
  return NextResponse.json(
    { error: "Este restaurante não aceita pagamento online no momento." },
    { status: 409 }
  );
}

const provider = getPaymentProvider(connection.provider);
const charge = await provider.createCharge(
  {
    id: order.id,
    total: Number(order.total),
    customerName,
    paymentMethod,
    items: order.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
    })),
  },
  connection
);
```

O primeiro argumento é o `ChargeableOrder` — o mesmo objeto que a rota antiga já montava. Confira os nomes de campo contra o model `Order`/`OrderItem` em `prisma/schema.prisma` antes de assumir: `total` e `unitPrice` são `Decimal` no Prisma e precisam de `Number()`, senão o gateway recebe string (foi exatamente esse o bug do commit `efcccd1`).

- [ ] **Step 3: Criar a rota de webhook por tenant**

`src/app/api/payments/webhook/[provider]/[tenantId]/route.ts`. Partir do corpo de `src/app/api/payments/webhook/route.ts` (a parte de atualizar pedido e `broadcastTenantEvent` é reaproveitada tal e qual), trocando só a resolução de provider/connection e o tratamento de tenant:

```ts
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string; tenantId: string }> }
) {
  const { provider: providerId, tenantId } = await params;

  const connection = await prismaUnscoped.paymentConnection.findUnique({
    where: { tenantId_provider: { tenantId, provider: providerId } },
  });
  // Não revela se o tenant existe — resposta idêntica em qualquer caso.
  if (!connection) return NextResponse.json({ received: true });

  const body = await req.json();

  let result;
  try {
    result = await getPaymentProvider(providerId).handleWebhook(body, req.headers, connection);
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
    }
    throw err;
  }
  if (!result) return NextResponse.json({ received: true });

  // O tenant agora vem da URL e já foi validado pela assinatura — não é
  // mais preciso descobri-lo pelo orderId.
  // ... resto do corpo atual, dentro de runWithTenant(tenantId, ...)
}
```

> **Atenção:** o `orderId` que vem do gateway precisa continuar sendo consultado **dentro** de `runWithTenant(tenantId, ...)`, para o pedido de um tenant nunca ser atualizado por notificação de outro.

- [ ] **Step 3b: Registrar que o webhook do lojista funciona**

Ainda dentro do `POST`, logo depois de `handleWebhook` retornar sem lançar (ou seja, assinatura validada), carimbar a conexão:

```ts
await prismaUnscoped.paymentConnection.update({
  where: { id: connection.id },
  data: { lastCheckedAt: new Date() },
});
```

É a única prova possível de que o webhook secret que o lojista colou está certo — ele não é verificável por API. A Task 6 usa esse campo para mostrar "aguardando primeira notificação" enquanto for `null`.

- [ ] **Step 4: Apagar as rotas antigas e apontar o checkout**

```bash
rm -rf src/app/api/payments/mercadopago src/app/api/payments/webhook/route.ts
```

Em `src/app/(client)/checkout/page.tsx:112`, trocar `"/api/payments/mercadopago"` por `"/api/payments/charge"`.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: zero erros, todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Torna cobrança e webhook agnósticos de gateway"
```

---

### Task 5: API de conexões e de métodos habilitados

**Files:**
- Create: `src/app/api/payments/connections/route.ts`
- Create: `src/app/api/payments/methods/route.ts`

**Interfaces:**
- Consumes: `listPaymentProviders`, `getPaymentProvider`, `getEnabledPaymentMethods` (Task 3); `encryptCredentials`, `maskCredentials` (Task 2).
- Produces:
  - `GET /api/payments/connections` → `{ providers: { meta, connection: { status, externalAccountId, lastCheckedAt, credentials (mascaradas), webhookUrl } | null }[] }`
  - `POST /api/payments/connections` body `{ provider, credentials }` → valida, grava, devolve o mesmo shape do GET
  - `DELETE /api/payments/connections?provider=` → desconecta
  - `GET /api/payments/methods` → `{ methods: PaymentMethod[] }` (público)

- [ ] **Step 1: Criar `src/app/api/payments/connections/route.ts`**

Todos os handlers exigem `session.user.role === "ADMIN"` (mesmo padrão da rota `connect` que foi apagada — copiar o guard dela do histórico do git, ou de outra rota `/adm`).

Regras do `POST`:

```ts
const provider = getPaymentProvider(body.provider);

// Credencial que não passa no teste do gateway NUNCA entra no banco.
const check = await provider.validateCredentials(body.credentials);
if (!check.ok) {
  return NextResponse.json({ error: check.reason }, { status: 422 });
}

// Só vira 'active' quando o webhook secret estiver presente — sem ele não
// conseguiríamos confirmar pagamento nenhum.
const status = body.credentials.webhookSecret ? "active" : "pending_webhook";

await prismaUnscoped.$transaction([
  // Um gateway ativo por tenant: ativar um desativa os outros.
  prismaUnscoped.paymentConnection.updateMany({
    where: { tenantId, provider: { not: body.provider } },
    data: { status: "disabled" },
  }),
  prismaUnscoped.paymentConnection.upsert({
    where: { tenantId_provider: { tenantId, provider: body.provider } },
    update: {
      credentials: encryptCredentials(body.credentials),
      externalAccountId: check.externalAccountId ?? null,
      status,
      // Trocar credencial invalida a prova do webhook: o secret pode ter
      // mudado junto. Volta a null até chegar notificação assinada.
      lastCheckedAt: null,
    },
    create: {
      tenantId,
      provider: body.provider,
      credentials: encryptCredentials(body.credentials),
      externalAccountId: check.externalAccountId ?? null,
      status,
    },
  }),
]);
```

> `lastCheckedAt` significa **exclusivamente** "já chegou um webhook com assinatura válida". Não carimbe aqui: salvar credencial não prova nada sobre o webhook, e é a Task 4 Step 3b que preenche o campo.

Validar o body com Zod, seguindo o padrão de `src/app/api/orders/route.ts:16`.

A `webhookUrl` devolvida ao cliente é `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook/${provider}/${tenantId}`.

**Nenhuma resposta pode conter credencial em claro** — sempre passar por `maskCredentials(decryptCredentials(conn.credentials), provider.meta.credentialFields)`.

- [ ] **Step 2: Criar `src/app/api/payments/methods/route.ts`**

Rota pública (sem `auth()`), resolve o tenant pelo subdomínio via `getRequestTenantId()` de `src/lib/tenant-request.ts` — mesmo helper que `src/app/(client)/layout.tsx:13` usa:

```ts
export async function GET() {
  const tenantId = await getRequestTenantId();
  return NextResponse.json({ methods: await getEnabledPaymentMethods(tenantId) });
}
```

Devolve **só** a lista de métodos. Nada de status de conexão, id de conta ou nome de gateway — é endpoint público.

- [ ] **Step 3: Verificar manualmente**

Com `npm run dev` rodando:

```bash
curl -s localhost:3000/api/payments/methods
```

Expected: `{"methods":["CASH"]}` (nenhum tenant tem conexão ainda).

```bash
curl -s -X POST localhost:3000/api/payments/connections \
  -H 'Content-Type: application/json' -d '{"provider":"mercado_pago","credentials":{}}'
```

Expected: 403 (sem sessão de ADMIN). Se responder 422 ou 500, o guard de autenticação está faltando — corrija antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Adiciona API de conexões de pagamento e de métodos habilitados"
```

---

### Task 6: Tela `/adm/pagamentos`

**Files:**
- Create: `src/app/adm/pagamentos/page.tsx`
- Create: `src/components/adm/PaymentGatewayCard.tsx`
- Modify: `src/components/adm/AdminSidebar.tsx:34-37`

**Interfaces:**
- Consumes: as rotas da Task 5.
- Produces: tela funcional. Nenhum outro código depende dela.

- [ ] **Step 1: Adicionar o item no menu**

Em `src/components/adm/AdminSidebar.tsx`, no grupo que contém "Gerenciamento" (linha ~34), adicionar seguindo exatamente o shape dos vizinhos:

```ts
{ href: "/adm/pagamentos", label: "Pagamentos", icon: CreditCard, exact: false },
```

Importar `CreditCard` de `lucide-react` junto dos outros ícones.

- [ ] **Step 2: Criar o card de gateway**

`src/components/adm/PaymentGatewayCard.tsx` — client component que recebe `{ meta, connection }` e renderiza:

- **Não conectado:** formulário montado a partir de `meta.credentialFields` (campos `required` apenas), botão "Salvar e testar".
- **`pending_webhook`:** aviso destacado — "Falta configurar o webhook. Seu restaurante ainda não aceita pagamento online." — mais a `webhookUrl` num campo somente-leitura com botão de copiar, o passo a passo (`meta.docsUrl` como link) e o campo do webhook secret.
- **`active`:** selo de conectado, conta (`externalAccountId`), credenciais mascaradas e botão "Desconectar" com confirmação. Se `lastCheckedAt` for `null`, mostrar junto o aviso "aguardando primeira notificação do gateway" — o webhook secret não é verificável por API, então só a primeira notificação assinada prova que ele está certo. Com `lastCheckedAt` preenchido, mostrar a data.
- **`invalid`:** aviso de credencial recusada e o formulário de novo.

Erro do `POST` (422) aparece junto do formulário com o `reason` que veio da API — é o texto que diz ao lojista o que ele errou.

Seguir o vocabulário visual de `src/components/adm/` (cards `bg-white rounded-xl border border-neutral-200`, botões `bg-brand`).

- [ ] **Step 3: Criar a página**

`src/app/adm/pagamentos/page.tsx` busca `GET /api/payments/connections` e renderiza um `PaymentGatewayCard` por provider. Quando nenhum estiver `active`, um aviso no topo: "Seu restaurante só aceita dinheiro na entrega. Conecte um gateway para receber PIX e cartão."

- [ ] **Step 4: Verificar no navegador**

Logar no `/adm`, abrir `/adm/pagamentos` e conferir:
- o card do Mercado Pago aparece com os dois campos
- salvar um token inválido mostra a mensagem de erro e **não** cria conexão (confira com `npx prisma studio`)
- a tela nunca mostra o token em claro depois de salvo

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Adiciona tela de configuração de pagamentos no admin"
```

---

### Task 7: Checkout respeita os métodos habilitados

**Files:**
- Modify: `src/app/(client)/checkout/page.tsx`
- Modify: `src/app/api/orders/route.ts`
- Test: `src/app/api/orders/orders-payment.test.ts`

**Interfaces:**
- Consumes: `GET /api/payments/methods` (Task 5), `getEnabledPaymentMethods` (Task 3).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Escrever o teste da validação de servidor (vai falhar)**

Criar `src/app/api/orders/orders-payment.test.ts` cobrindo a regra isolada. Extrair a regra para uma função pura em `src/lib/payments/factory.ts` deixa isso testável sem subir a rota:

```ts
import { describe, expect, it } from "vitest";
import { assertMethodAllowed } from "@/lib/payments/factory";

describe("assertMethodAllowed", () => {
  it("aceita dinheiro sempre", () => {
    expect(() => assertMethodAllowed("CASH", ["CASH"])).not.toThrow();
  });

  it("recusa PIX quando o tenant não tem gateway ativo", () => {
    expect(() => assertMethodAllowed("PIX", ["CASH"])).toThrow();
  });

  it("aceita PIX quando habilitado", () => {
    expect(() => assertMethodAllowed("PIX", ["PIX", "CREDIT_CARD", "CASH"])).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test src/app/api/orders/orders-payment.test.ts`
Expected: FAIL — `assertMethodAllowed` não existe.

- [ ] **Step 3: Implementar em `src/lib/payments/factory.ts`**

```ts
export class PaymentMethodNotAllowedError extends Error {
  constructor(method: string) {
    super(`Este restaurante não aceita ${method} no momento.`);
    this.name = "PaymentMethodNotAllowedError";
  }
}

export function assertMethodAllowed(method: PaymentMethod, enabled: PaymentMethod[]): void {
  if (!enabled.includes(method)) throw new PaymentMethodNotAllowedError(method);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test src/app/api/orders/orders-payment.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Aplicar na rota de pedidos**

Em `src/app/api/orders/route.ts`, depois do parse do Zod (linha ~90) e antes de criar o pedido:

```ts
assertMethodAllowed(paymentMethod, await getEnabledPaymentMethods(tenantId));
```

Capturar `PaymentMethodNotAllowedError` e responder 422 com a mensagem. **Isto não é redundância com a UI:** o endpoint é público e a UI escondendo o botão não impede ninguém de chamar direto.

- [ ] **Step 6: Ajustar o checkout**

Em `src/app/(client)/checkout/page.tsx`, buscar os métodos no mount (mesmo padrão do `CartUpsell` com `/api/menu`) e renderizar só as opções habilitadas. Enquanto carrega, não mostrar nenhuma opção de pagamento online — melhor aparecer do que sumir na cara do cliente. Se o método selecionado deixar de estar disponível, cair para `CASH`.

- [ ] **Step 7: Verificar no navegador**

Sem nenhuma conexão ativa, `/checkout` deve oferecer só dinheiro. E direto na API:

```bash
curl -s -X POST localhost:3000/api/orders -H 'Content-Type: application/json' \
  -d '{"items":[...],"paymentMethod":"PIX","customerName":"Teste","customerPhone":"11999999999","deliveryType":"PICKUP"}'
```

Expected: 422. Se criar o pedido, a validação de servidor não está no caminho certo.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Checkout e API de pedidos respeitam os métodos habilitados do tenant"
```

---

### Task 8: Adapter Asaas

Prova que a abstração funciona com um gateway que nunca teve OAuth. Só depois desta task o projeto entrega a promessa de "leque maior".

**Files:**
- Create: `src/lib/payments/asaas-adapter.ts`
- Modify: `src/lib/payments/factory.ts` (registrar no `adapters`)
- Test: `src/lib/payments/asaas-adapter.test.ts`

**Interfaces:**
- Consumes: `PaymentProvider`, `PaymentProviderMeta`, `CredentialCheck` (Task 3).
- Produces: `AsaasAdapter` com `meta.id === "asaas"`.

- [ ] **Step 1: Ler a documentação da API do Asaas**

Confirmar, na doc oficial, antes de escrever qualquer código: endpoint de criação de cobrança PIX e cartão, header de autenticação (`access_token`), base URL de sandbox vs produção, e **como a assinatura do webhook é validada**. O modelo do Asaas difere do Mercado Pago; não presuma que é HMAC com o mesmo formato de manifesto.

Se a validação de webhook do Asaas for por token fixo em header em vez de HMAC, o campo de credencial muda de nome e o `isValidSignature` vira comparação com `crypto.timingSafeEqual` — mas **a regra de recusar quando não há segredo configurado é a mesma**.

- [ ] **Step 2: Escrever os testes espelhando os do Mercado Pago**

Criar `src/lib/payments/asaas-adapter.test.ts` com os mesmos casos de segurança da Task 3 Step 7, adaptados ao esquema de assinatura real do Asaas:
- recusa quando o lojista não configurou o segredo
- recusa assinatura/token forjado
- recusa header ausente
- ignora payload que não é evento de pagamento

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test src/lib/payments/asaas-adapter.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar o adapter**

`meta` do Asaas:

```ts
meta: PaymentProviderMeta = {
  id: "asaas",
  label: "Asaas",
  docsUrl: "https://www.asaas.com/integracoes/api",
  methods: ["PIX", "CREDIT_CARD"],
  credentialFields: [
    { key: "apiKey", label: "Chave de API", help: "No painel do Asaas: Integrações → API.", type: "secret", required: true },
    {
      key: "environment",
      label: "Ambiente",
      help: "Use sandbox para testar antes de receber de verdade.",
      type: "select",
      options: [
        { value: "sandbox", label: "Sandbox (teste)" },
        { value: "production", label: "Produção" },
      ],
      required: true,
    },
    { key: "webhookSecret", label: "Token do webhook", help: "Definido por você ao cadastrar o webhook no painel.", type: "secret", required: false },
  ],
};
```

`validateCredentials` bate num endpoint leve autenticado (equivalente ao `/users/me` do MP) escolhendo a base URL pelo `environment`.

- [ ] **Step 5: Registrar no factory**

Em `src/lib/payments/factory.ts`, adicionar ao objeto `adapters`:

```ts
asaas: new AsaasAdapter(),
```

- [ ] **Step 6: Rodar tudo**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 7: Verificar no navegador**

Abrir `/adm/pagamentos`: o card do Asaas deve aparecer **sem nenhuma alteração de UI** — é o teste real de que o `meta` monta a tela sozinho. Conectar em sandbox e conferir que o checkout passa a oferecer PIX.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Adiciona adapter do Asaas"
```

---

### Task 9: Limpeza final

**Files:**
- Modify: `.env.example` (se existir), `README.md`, `docs/`

- [ ] **Step 1: Caçar restos de configuração de plataforma**

```bash
grep -rn "MERCADOPAGO_ACCESS_TOKEN\|MERCADOPAGO_CLIENT_ID\|MERCADOPAGO_CLIENT_SECRET\|MERCADOPAGO_WEBHOOK_SECRET\|PLATFORM_COMMISSION_PERCENT" --exclude-dir=node_modules --exclude-dir=.next .
```

Expected: nenhum resultado em código. Ocorrências em `docs/superpowers/specs/` são históricas e ficam.

- [ ] **Step 2: Remover as variáveis da Vercel**

```bash
vercel env rm MERCADOPAGO_ACCESS_TOKEN production
```

E o mesmo para `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET`, `PLATFORM_COMMISSION_PERCENT`, nos ambientes em que existirem (`vercel env ls` mostra).

`PAYMENT_TOKEN_ENCRYPTION_KEY` **fica** — é o que protege as credenciais dos lojistas.

- [ ] **Step 3: Atualizar a documentação**

Onde o README ou docs descreverem o onboarding de pagamento como "conectar via Mercado Pago Marketplace", trocar pelo fluxo novo de duas etapas.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Remove configuração de pagamento da plataforma"
```
