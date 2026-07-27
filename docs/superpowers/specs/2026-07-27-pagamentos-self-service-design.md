# Pagamentos self-service: cada lojista conecta o próprio gateway

Data: 2026-07-27

## Problema

Hoje o pagamento online só funciona com Mercado Pago, e a conexão da conta do
lojista depende de uma aplicação registrada pela plataforma. Não existe nenhuma
tela no `/adm` que dispare esse fluxo — o `/api/payments/connect` existe mas
nenhuma UI chama. Na prática, colocar um cliente novo pra receber pagamento é
trabalho manual do fundador, cliente por cliente.

Pior: quando o tenant não tem conexão, o adapter cai no
`MERCADOPAGO_ACCESS_TOKEN` da plataforma. O dinheiro do pedido do cliente final
cai na conta da Muno, e o repasse vira problema manual.

## Princípio

**Nenhum dado da plataforma participa do fluxo de pagamento.** Nem conta, nem
aplicação registrada em gateway, nem token. O lojista cola as credenciais do
gateway dele, o dinheiro cai direto na conta dele, e a Muno nunca é parte da
transação.

Isso é possível porque o modelo de receita da Muno é **mensalidade fixa**, não
percentual sobre vendas. Não há comissão a extrair, então não há motivo para
split de marketplace — e sem split, não há motivo para OAuth.

## Escopo

**Entra:** infraestrutura multi-gateway por chave de API, tela de configuração
self-service no `/adm`, e dois adapters — Mercado Pago (migrado de OAuth para
chave) e Asaas (novo, prova que a abstração funciona).

**Não entra:** ampliar o enum `PaymentMethod`. Os métodos seguem `PIX`,
`CREDIT_CARD` e `CASH`. Quem processa é que passa a variar.

## Modelo de dados

`PaymentConnection` perde tudo que era específico de OAuth:

```prisma
model PaymentConnection {
  id                String   @id @default(cuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  provider          String   // 'mercado_pago' | 'asaas'
  credentials       String   // JSON criptografado (AES-256-GCM, src/lib/crypto.ts)
  externalAccountId String?  // id da conta no gateway, quando a validação devolver
  status            String   // 'pending_webhook' | 'active' | 'invalid' | 'disabled'
  lastCheckedAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([tenantId, provider])
  @@index([tenantId])
}
```

Removidos: `accessToken`, `refreshToken`, `expiresAt`, `mpUserId`.

As credenciais viram um blob JSON criptografado porque cada gateway pede campos
diferentes: o Mercado Pago quer access token + webhook secret, o Asaas quer
chave de API + ambiente (sandbox/produção). Um campo por credencial no schema
obrigaria migration a cada gateway novo.

**Migration:** o banco de produção não tem nenhuma `PaymentConnection` hoje
(confirmado com o fundador em 2026-07-27), então a migration é destrutiva sem
consequência — dropa as colunas antigas e cria as novas, sem backfill.

**Um gateway ativo por tenant de cada vez.** O `@@unique([tenantId, provider])`
permite linhas de providers diferentes; a regra de no máximo um `status:
"active"` por tenant é imposta na camada de serviço: ativar um desativa o
anterior, com confirmação na tela. Multi-gateway simultâneo (PIX num, cartão
noutro) é complexidade que ninguém pediu.

## Interface dos adapters

A interface atual (`src/lib/payments/types.ts`) obriga todo adapter a
implementar `getOnboardingUrl`, `exchangeAuthorizationCode` e `refreshToken`.
Nenhum dos três faz sentido fora de OAuth. Substituir por:

```ts
interface CredentialField {
  key: string;
  label: string;
  help: string;              // instrução de onde tirar no painel do gateway
  type: "text" | "secret" | "select";
  options?: { value: string; label: string }[];  // para type: "select"
  required: boolean;
}

interface PaymentProviderMeta {
  id: string;                    // 'mercado_pago' | 'asaas'
  label: string;                 // 'Mercado Pago'
  docsUrl: string;               // link para o painel/doc do gateway
  methods: PaymentMethod[];      // métodos que este gateway cobre
  credentialFields: CredentialField[];
}

type CredentialCheck =
  | { ok: true; externalAccountId?: string }
  | { ok: false; reason: string };

interface PaymentProvider {
  meta: PaymentProviderMeta;
  validateCredentials(credentials: Record<string, string>): Promise<CredentialCheck>;
  createCharge(order: ChargeableOrder, connection: PaymentConnection): Promise<Charge>;
  handleWebhook(
    payload: unknown,
    headers: Headers,
    connection: PaymentConnection
  ): Promise<WebhookResult | null>;
}
```

Três mudanças de assinatura que importam:

1. `connection` deixa de ser nullable em `createCharge`. Sem conexão não existe
   cobrança — o fallback para a conta da plataforma deixa de existir.
2. `handleWebhook` passa a receber a `connection`, porque o segredo de
   assinatura agora é de cada lojista, não da plataforma. Recebe `Headers`
   inteiro em vez de `signature`/`requestId` soltos, já que cada gateway assina
   com headers diferentes.
3. `meta.credentialFields` é o que permite a tela se montar sozinha. Adapter
   novo aparece no painel sem escrever UI nova.

`ChargeableOrder`, `Charge`, `WebhookResult` e `InvalidWebhookSignatureError`
seguem como estão.

## Registry

`getPaymentProviderForTenant` (em `src/lib/payments/factory.ts`) hoje cai no
provider default quando não há conexão. Passa a retornar `null`, e cada caller
trata a ausência explicitamente. Some o `DEFAULT_PROVIDER`.

## Gateways da v1

- **`mercado_pago`** — migrado de OAuth para chave. Campos: access token de
  produção (do painel do próprio lojista) e webhook secret. A lógica de
  `createCharge` e de parsing do webhook é reaproveitada; sai o
  `application_fee`/`marketplace_fee` e todo o código de OAuth.
- **`asaas`** — novo. Campos: chave de API e ambiente (sandbox/produção).

## Tela `/adm/pagamentos`

Um card por gateway do registry, renderizado a partir do `meta`. Estados:
*Conectado*, *Não conectado*, *Credencial inválida*.

### Fluxo de conexão em duas etapas

Existe uma dependência circular no onboarding: o webhook secret só é gerado
pelo gateway **depois** que o lojista cadastra a URL de webhook no painel dele,
e a URL só é exibida depois que a conexão existe. Por isso o fluxo é dividido:

1. **Etapa 1 — credencial de cobrança.** Lojista cola o access token / chave de
   API. Clica em **"Salvar e testar"**: a rota chama `validateCredentials`
   antes de gravar, e credencial que não passa no teste nunca entra no banco.
   A conexão é criada com `status: "pending_webhook"`.
2. **Etapa 2 — webhook.** A tela passa a exibir a URL de webhook daquele tenant
   para copiar, com o passo a passo de onde colar no painel do gateway. O
   lojista volta com o secret gerado lá e cola no segundo campo. A conexão vira
   `status: "active"`.

Enquanto a conexão estiver em `pending_webhook`, **o pagamento online continua
desligado** e o checkout só oferece dinheiro. Sem o secret não há como validar
notificação, e sem notificação validada o pedido nunca seria confirmado como
pago — pior que não oferecer.

A tela deixa esse estado intermediário explícito: "Falta configurar o webhook —
seu restaurante ainda não aceita pagamento online".

### Limite da validação

`validateCredentials` só confirma o que a API do gateway sabe responder: que o
token é válido e a que conta pertence. **O webhook secret não é verificável por
API** — ele só se prova na primeira notificação recebida. O card mostra
"aguardando primeira notificação" até que uma chegue com assinatura válida,
e registra o momento em `lastCheckedAt`.

Segredo nunca volta para a tela depois de salvo: exibe `••••` + últimos 4
caracteres. A resposta da API jamais inclui credencial em claro.

Quando nenhum gateway está conectado, a tela mostra aviso de que o restaurante
só consegue receber dinheiro na entrega.

## Rotas

| Ação | Antes | Depois |
|---|---|---|
| Cobrar | `/api/payments/mercadopago` | `/api/payments/charge` |
| Webhook | `/api/payments/webhook` | `/api/payments/webhook/[provider]/[tenantId]` |
| Conexões | — | `/api/payments/connections` (GET, POST, DELETE) |
| Métodos habilitados | — | `/api/payments/methods` (GET, pública) |

O nome `mercadopago` está cravado no checkout (`src/app/(client)/checkout/page.tsx:112`)
e precisa acompanhar a renomeação.

O webhook passa a carregar o `tenantId` na URL porque, sem aplicação de
plataforma, não há mais um segredo global — a validação de assinatura depende
de saber de qual lojista é a notificação antes de validar. Isso também elimina
o lookup de tenant pelo `orderId` que a rota faz hoje.

**Apagados:** `/api/payments/connect`, `/api/payments/callback`,
`/api/cron/refresh-payment-tokens` e sua entrada no `vercel.json`.

## Checkout

Os métodos oferecidos passam a depender do tenant: sem conexão `active`, só
`CASH`. Com conexão `active`, os `meta.methods` do gateway conectado mais
`CASH`.

O `checkout/page.tsx` é client component, então busca os métodos habilitados
numa rota pública `GET /api/payments/methods` ao montar — mesmo padrão que o
`CartUpsell` usa com `/api/menu`. A rota resolve o tenant pelo subdomínio da
requisição e devolve apenas a lista de métodos, nunca dados da conexão.

**A `/api/orders` valida isso no servidor** e rejeita pedido com `PIX` ou
`CREDIT_CARD` quando o tenant não tem conexão ativa que cubra o método. A UI
esconder o botão não é garantia — o endpoint é público.

## Segurança

- `credentials` criptografado com o `src/lib/crypto.ts` existente (AES-256-GCM),
  mesmo tratamento que os tokens OAuth recebiam.
- Nenhum caminho da API devolve credencial em claro, nem para o próprio ADMIN
  do tenant.
- **O `tenantId` na URL do webhook é um cuid público, não um segredo.** Portanto:
  se o tenant não tiver webhook secret configurado, o endpoint **recusa a
  notificação** — nunca processa sem validar assinatura. Sem essa regra,
  qualquer um que descubra o id marca pedido como pago.
- Assinatura inválida continua respondendo 401, nunca 200 (comportamento atual,
  preservado).

## Variáveis de ambiente

Removidas: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_CLIENT_ID`,
`MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET`,
`PLATFORM_COMMISSION_PERCENT`.

Nenhuma variável nova: toda credencial de gateway passa a viver no banco, por
tenant.

## Fora de escopo

- Painel de plataforma para o fundador ver/gerenciar as conexões de todos os
  tenants. Depende de definir o papel de founder admin, que é outro projeto.
- Ampliar `PaymentMethod` (débito, vale-refeição, maquininha).
- Múltiplos gateways ativos ao mesmo tempo no mesmo tenant.
- Reconciliação/relatório financeiro por gateway.
