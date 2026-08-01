# Plataforma Muno: admin próprio, CRM de leads e onboarding em um clique

Data: 2026-07-31

## Problema

A Muno não tem lugar próprio. Todo login existente é de restaurante — `User.tenantId` é
obrigatório e `Role` é tenant-scoped, então não existe identidade que enxergue a plataforma
inteira. O funil de vendas mora fora do sistema, e onboarding de cliente novo é manual.

Pior: por acreditar que subdomínio não funcionava, o processo de adicionar um cliente virou
"criar repositório novo". Isso não é só trabalhoso — com o banco compartilhado que já estava
planejado, é uma arquitetura que **garante quedas proporcionais ao número de clientes**: uma
migration publicada de um repo altera o schema sob o Prisma Client gerado de todos os outros
deploys, derrubando cada um até ser republicado.

A causa raiz do bloqueio foi diagnosticada em 2026-07-31 e **não é código** (ver Pré-requisito).

## Escopo

**Dentro:** autenticação de plataforma, CRM de leads, e provisionamento de tenant pela
interface.

**Fora:** painel operacional cross-tenant (métricas de todos os restaurantes) e captura
pública de leads por formulário. Ambos ficam para sub-projetos posteriores; ver "Fora de
escopo".

## Pré-requisito de infraestrutura

Nada neste documento funciona sem isto, e nenhum passo é código:

1. **Atrelar `*.munoapp.com.br`** ao projeto na Vercel (Settings → Domains). Hoje o DNS
   aponta para a Vercel, mas nenhum projeto reivindica o hostname: `teste.munoapp.com.br`
   devolve `DEPLOYMENT_NOT_FOUND`, erro da própria Vercel, não o 404 do app. É este o motivo
   real de subdomínio nunca ter funcionado.
2. **`ROOT_DOMAIN=www.munoapp.com.br,munoapp.com.br`** — nessa ordem.

O wildcard do passo 1 já cobre `admin.munoapp.com.br`; não é preciso atrelar esse host
separadamente.

### A armadilha da ordem do ROOT_DOMAIN

`resolveSlugFromHost` (`src/proxy.ts:9-19`) percorre os domínios raiz e, para cada um,
devolve `null` se o host for exatamente igual, ou o prefixo se for sufixo. **Vence o
primeiro que casar.** Os dois erros possíveis falham de formas diferentes:

| Valor | `www.munoapp.com.br` | `pizzaria.munoapp.com.br` |
|---|---|---|
| só `munoapp.com.br` | slug `"www"` → sem tenant → **site cai** | correto |
| só `www.munoapp.com.br` | correto | não casa → fallback → **serve o restaurante "default"** |
| `www.munoapp.com.br,munoapp.com.br` | correto | correto |

O segundo caso é o perigoso: falha em silêncio, servindo o cardápio de outro restaurante
para um cliente pagante que acha que está no site dele.

## Arquitetura

### O problema é roteamento, não autenticação

O Next roteia por caminho, não por host: `admin.munoapp.com.br/leads` e
`pizzaria.munoapp.com.br/leads` chegam como o mesmo `/leads`. A separação acontece no
`src/proxy.ts`, em três movimentos:

**1. Desviar antes de resolver tenant.** Hoje o fluxo resolve o slug e busca o tenant,
devolvendo 404 se não achar — o que aconteceria com `admin`. O desvio vem antes:

```ts
const PLATFORM_SUBDOMAIN = "admin";

const slug = resolveSlugFromHost(host);
if (slug === PLATFORM_SUBDOMAIN) return handlePlatformRequest(req, nextUrl);
```

Nesse ramo **não se resolve tenant e não se injeta `x-tenant-id`**. É isso que mantém o
`AsyncLocalStorage` de tenant vazio e obriga o código de plataforma a usar `prismaUnscoped`
deliberadamente, em vez de silenciosamente herdar o escopo de alguém.

**2. Reescrever para um prefixo.** `admin.munoapp.com.br/leads` vira internamente
`/platform/leads` via `NextResponse.rewrite`. As telas moram em `src/app/platform/`; a URL
no navegador continua limpa.

**3. Trancar a porta dos fundos.** Como `/platform/*` passa a existir como caminho real,
qualquer request a ele que **não** venha do subdomínio `admin` recebe 404. Sem isso o CRM
fica acessível a partir do domínio de qualquer restaurante.

`admin` já consta em `RESERVED_SLUGS` (`scripts/create-tenant.ts:8`), então nenhum
restaurante pode tomar esse subdomínio.

### Autenticação: instância separada do NextAuth

`src/lib/auth-platform.ts` com `NextAuth({...})` próprio: provider de credenciais contra
`PlatformAdmin`, handlers em `/api/platform/auth/[...nextauth]`, e o detalhe que dá o
isolamento — **nome de cookie próprio**:

```ts
cookies: { sessionToken: { name: "muno-platform.session-token" } }
```

Cookies distintos significam que uma sessão de restaurante nunca é aceita como sessão de
plataforma, e vice-versa, sem depender de nenhuma checagem que alguém possa esquecer.
`src/lib/auth.ts` não é tocado — ele acabou de passar por revisão de segurança no trabalho
de login obrigatório e não há motivo para reabri-lo.

Descartadas: adicionar um provider à instância existente (as duas identidades passariam a
dividir cookie e token; um bug de checagem vira escalada de privilégio entre tenants) e
autenticação própria do zero (reimplementar expiração, CSRF e logout que o NextAuth já
resolve).

**Não existe tela de cadastro.** O `PlatformAdmin` nasce por script
(`npm run platform:create-admin`). Nenhuma rota cria um.

## Modelo de dados

`PlatformAdmin`, `Lead` e `LeadNote` **não entram** em `TENANT_SCOPED_MODELS`
(`src/lib/prisma.ts:6-18`), pela mesma razão que `Tenant` não está lá: não carregam
`tenantId` próprio, e a extensão tentaria filtrar por um campo inexistente.

```prisma
model PlatformAdmin {
  id        String   @id @default(cuid())
  nome      String
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
}

enum LeadStatus { NOVO CONTATADO NEGOCIACAO FECHADO PERDIDO }

model Lead {
  id          String     @id @default(cuid())
  restaurante String
  contato     String?
  email       String?
  telefone    String?
  cidade      String?
  origem      String     @default("manual")
  status      LeadStatus @default(NOVO)
  motivoPerda String?
  tenantId    String?    @unique
  tenant      Tenant?    @relation(fields: [tenantId], references: [id])
  notas       LeadNote[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([status])
}

model LeadNote {
  id        String   @id @default(cuid())
  leadId    String
  lead      Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  texto     String
  createdAt DateTime @default(now())

  @@index([leadId])
}
```

`Tenant` ganha o lado inverso da relação: `lead Lead?`.

Quatro decisões que valem justificativa:

- **Só `restaurante` é obrigatório.** Você conhece alguém num evento e tem um nome e nada
  mais. Um formulário que exige e-mail e telefone faz o lead não ser cadastrado — e um lead
  não cadastrado é pior que um incompleto.
- **`LeadNote` separado, não um campo de texto.** O valor de um funil é a cronologia
  ("liguei dia 3, pediu retorno dia 10"). Um textarea único vira um blob que se para de
  atualizar.
- **`tenantId` com `@unique`.** Impede converter o mesmo lead duas vezes **no banco**, não
  só na aplicação — garantia que não depende de ninguém lembrar de checar.
- **`origem` como `String`, não enum.** Os canais ainda não são conhecidos; um enum exigiria
  migration a cada canal novo testado.

## Telas

Três, em `src/app/platform/`:

1. **`/`** — o funil: lista agrupada pelos cinco status, com contador em cada.
   **Não kanban com arrastar** — drag-and-drop é caro de construir e ruim no celular, que é
   onde o lead vai ser atualizado logo depois de uma ligação.
2. **`/leads/[id]`** — dados do lead, cronologia de notas, e as ações: mudar status,
   anotar, converter.
3. **`/login`**.

## Conversão: o onboarding

Esta é a parte que responde ao problema original, não um detalhe do CRM.

`scripts/create-tenant.ts` vira uma casca fina. A lógica sai para
`src/lib/tenant-provisioning.ts`:

```ts
provisionTenant(input: {
  nome: string;
  slug: string;
  email: string;
  senha?: string;          // omitida => gerada
}): Promise<{
  tenant: Tenant;
  admin: User;
  url: string;
  senha: string;           // sempre devolvida, para exibir uma única vez
}>
```

CLI e API passam a chamar **a mesma função**. Isso não é organização: é impedir que a
validação de slug reservado exista em duas cópias que divergem com o tempo.

`POST /api/platform/leads/[id]/converter` então:

1. valida os dados e o estado do lead;
2. provisiona **numa transação** — tenant e admin juntos, senão uma falha na criação do
   admin deixa um tenant órfão ocupando o slug para sempre;
3. liga `lead.tenantId`, marca `FECHADO`;
4. devolve URL e credenciais.

**A senha é gerada, não digitada.** Uma senha forte aleatória exibida uma vez é melhor que a
inventada na pressa, e elimina a fricção de pensar numa.

Falhas previstas: slug já em uso → 409 com mensagem clara (é o erro mais provável na
prática); lead já convertido → 409, com o `@unique` como rede de segurança.

**Regra de status.** Qualquer transição manual entre os cinco status é permitida — vendas
não é linear, e um lead volta de `NEGOCIACAO` para `CONTATADO` sem drama. A única restrição:
`tenantId` só é preenchido pela rota de conversão, que também marca `FECHADO`. Marcar
`FECHADO` na mão não provisiona nada e deixa `tenantId` nulo, o que é justamente o sinal de
"fechei mas ainda não criei o cliente".

## Segurança

- Sessões isoladas por cookies distintos (acima).
- `/platform/*` inacessível de qualquer host que não seja o subdomínio `admin`.
- Código de plataforma usa `prismaUnscoped` conscientemente, porque não há tenant em
  contexto.
- Sem rota de criação de `PlatformAdmin`.
- Rotas de plataforma exigem sessão de plataforma; a única exceção é `/platform/login`.

## Testes

Vitest já está instalado (`vitest.config.mts`, `npm test`). Cobrir o que é lógica pura e de
risco:

- **Validação de slug**: formato aceito/rejeitado, slugs reservados, sensibilidade a caixa.
- **Geração de senha**: comprimento e alfabeto do gerador usado no provisionamento.

Provisionamento real e rotas de API dependem de banco e sessão — ficam fora, como no
trabalho anterior.

## Fora de escopo

- **Painel operacional cross-tenant** (pedidos, faturamento e status de gateway de todos os
  restaurantes). Com um único tenant no banco hoje, exibiria uma tela vazia. Sub-projeto
  próprio depois de existirem clientes.
- **Captura pública de leads.** Não há landing page para apontar para um endpoint. O campo
  `origem` já nasce no modelo, então adicionar depois é um endpoint novo e zero migration.
- **Domínio próprio por cliente** (`pizzariadojoao.com.br` em vez de subdomínio). É o upsell
  natural desse modelo e a arquitetura comporta, via um campo `customDomain` consultado no
  `resolveSlugFromHost`. Fica registrado como direção, não como trabalho agora.
- **Cache da resolução de tenant.** `src/proxy.ts` consulta o banco a cada requisição para
  resolver o tenant. Com poucos clientes é irrelevante; com dezenas e tráfego de almoço vira
  uma ida ao Postgres antes de qualquer página. Candidato a Edge Config quando o volume
  justificar.
