# A suíte de segurança

Data: 2026-09-15

## Problema

A Muno tem 135 arquivos de teste, e boa parte deles protege alguma coisa de segurança:
o escopo de tenant do Prisma, o `authorize` das credenciais, o CRON_SECRET, o token do
webhook do Asaas, as guardas do proxy. Todos protegem **o que já existe**. Nenhum pega a
rota que ainda vai nascer.

A falha que se quer evitar é silenciosa por natureza. Uma rota nova que esquece o
`auth()` responde 200 e funciona na tela, o teste dela (se alguém escrever) cobre o
caminho feliz, e o buraco só aparece quando alguém de fora o encontra. O mesmo vale para
um `prismaUnscoped` novo sem `tenantId` no `where`, para uma migração que cria tabela sem
RLS (o AGENTS.md conta o caso de `Tenant`, `Lead` e `PlatformAdmin`, abertas para a
internet com escrita até 10/08/2026), e para um componente cliente que importa o módulo
com a chave do Supabase.

A exploração para este documento também encontrou problemas que existem hoje:

1. **Open redirect no login e no cadastro.** `LoginForm.tsx:74` e `RegisterForm.tsx:72`
   fazem `router.push(callbackUrl)` com o valor cru da query string.
   `pizzaria.munoapp.com.br/login?callbackUrl=https://golpe.example` leva o cliente, recém
   autenticado e confiando no domínio do restaurante, para qualquer lugar.
2. **O escopo do Prisma não cobre `data.tenantId` nas escritas de update.** A extensão
   em `src/lib/prisma.ts` injeta `tenantId` no `where`, mas um
   `update({ where: { id }, data: { tenantId: "outro" } })` move a linha para outro
   restaurante. Hoje nenhuma rota faz isso porque o zod descarta campo desconhecido antes,
   o que é coincidência e não garantia.
3. **`x-tenant-id` enviado pelo navegador atravessa os ramos do proxy que pulam o
   pipeline de tenant.** O proxy só sobrescreve o header no caminho normal. Em
   `/api/assinar`, `/api/leads/publico`, `/api/funil/evento`, `/api/cron/*`, nos dois
   webhooks e no host da plataforma, o valor do cliente chega intacto à rota. Nenhuma
   delas o lê hoje; a primeira que ler vai confiar num tenant forjado.
4. **`/api/auth/register` não tem rate limit**, e o 409 "Email já cadastrado" permite
   descobrir quem tem conta em cada restaurante sem limite de tentativas.
5. **Nenhum teste roda antes do deploy.** O único workflow do GitHub é `backup.yml`, e o
   build da Vercel não chama `vitest`. A suíte só protege quem lembra de rodá-la.

## Decisão

Uma pasta `src/security/` com testes de **invariante**: regras sobre o projeto inteiro,
que falham quando um arquivo novo as viola, sem que ninguém precise lembrar de escrever um
teste para ele. Junto, a correção dos cinco problemas acima, cada um com teste que falha
antes da correção.

## A matriz de acesso

### O manifesto

`src/security/politica-de-acesso.ts` declara o nível de cada handler de API, com a chave
`"MÉTODO /api/caminho"` escrita como o caminho do arquivo (`/api/coupons/[id]`):

```ts
type Papel = "CUSTOMER" | "ADMIN" | "KITCHEN" | "MOTOBOY";

type Nivel =
  | { tipo: "PUBLICO"; motivo: string }
  | { tipo: "DONO_DO_RECURSO"; motivo: string }
  | { tipo: "SEGREDO"; motivo: string }
  | { tipo: "AUTENTICADO"; aceita: Array<Papel | "PLATAFORMA"> };
```

* `PUBLICO` exige um motivo escrito. É o que força quem abre uma rota a dizer por quê.
  Rotas mistas entram aqui: o `POST /api/orders` aceita pedido de mesa sem login e exige
  conta para delivery, e o motivo aponta para o `route.test.ts` que cobre essa divisão.
* `SEGREDO` é rota que autentica por segredo compartilhado e não por sessão: o cron
  (`CRON_SECRET`) e o webhook do Asaas (`asaas-access-token`).
* `AUTENTICADO` lista **explicitamente** quem é aceito, em vez de uma hierarquia. As rotas
  divergem (a cozinha aceita `ADMIN` e `KITCHEN`, o upload aceita `ADMIN` e a plataforma),
  e uma hierarquia implícita esconderia exatamente a divergência que interessa.
* `DONO_DO_RECURSO` entrou na escrita do plano. As rotas que decidem pelo dono do
  pedido (`canViewOrder`, o chat do pedido, a cobrança) precisam ler o registro
  antes de decidir, então não cabem em "nenhum acesso ao banco" e também não são
  públicas. A matriz não as exercita; o motivo aponta o teste que cobre.

O webhook de pagamento por tenant é `PUBLICO`, não `SEGREDO`: ele responde 200 idêntico
para qualquer chamada sem conexão cadastrada, de propósito, para não revelar quais tenants
têm gateway. A autenticação dele é a assinatura verificada dentro de cada adapter, que já
tem teste próprio.

Os dois `[...nextauth]` ficam fora da matriz: são handlers do NextAuth, não código nosso,
e sustentam o próprio login.

### O teste

`src/security/matriz-de-acesso.test.ts` faz três coisas.

**Cobertura nas duas direções.** Varre `src/app/api/**/route.ts`, importa cada módulo e
lista os métodos HTTP exportados. Todo handler precisa de entrada no manifesto, e toda
entrada precisa de handler. Rota nova sem política quebra o teste; política órfã, de rota
apagada, também.

**Negação.** Para cada handler `AUTENTICADO`, chama o handler com cada sessão que **não**
está em `aceita`: nenhuma sessão, cada um dos quatro papéis de tenant, e sessão de
plataforma. Para `SEGREDO`, chama sem o segredo. Em todos os casos exige:

* status 401 ou 403. Um 400 de validação do corpo não prova recusa: numa rota que valida
  o corpo logo depois do papel, apagar a checagem de papel também dá 400, sem tocar o
  banco;
* **nenhum acesso** a `prisma`, `prismaUnscoped` ou `supabaseAdmin`.

Os três clientes são mockados por um `Proxy` que registra qualquer propriedade lida. A
segunda exigência é a que importa: uma rota que consulta o banco e só depois checa o
papel já vazou tempo de resposta, contagem ou efeito colateral, mesmo que devolva 403 no
fim.

**Controle positivo.** Para cada handler `AUTENTICADO`, chama com uma sessão aceita e
exige que a resposta **não** seja 401 nem 403. Sem isso a matriz passaria contra uma rota
que recusa todo mundo, e um harness quebrado (import errado, mock que não pega) passaria
em silêncio.

A requisição do harness é sempre a mesma: `x-tenant-id` presente, `x-tenant-plano` com o
plano mais alto (para que a trava de plano não mascare a falta de trava de papel), corpo
JSON `{}`, e `"id-teste"` em todo segmento dinâmico dos `params`.

Uma rota que precise de exceção ao harness (por exemplo, 403 legítimo com sessão aceita
porque o recurso é de outro cliente) declara isso no manifesto, com motivo. Exceção sem
motivo não compila.

### O que a matriz não cobre, e quem cobre

A matriz testa o handler isolado, e o handler não compara `session.user.tenantId` com o
`x-tenant-id`. Um ADMIN do restaurante A com o cookie colado no host do restaurante B
passaria pela checagem de papel. Quem barra isso é o proxy, com o `tenantMismatch`, e hoje
o teste dele só cobre navegação de página. Ver "As extensões" abaixo.

## Os invariantes estáticos

`src/security/invariantes.test.ts` lê arquivos como texto. Varre `src/`, excluindo
`src/generated/` e arquivos de teste.

| Invariante | Por quê |
|---|---|
| Todo arquivo que importa `prismaUnscoped` está em `USO_DE_PRISMA_UNSCOPED`, com motivo | O escopo ali é manual e nada corrige um esquecimento. A lista força a revisão de todo uso novo. |
| Arquivo com `"use client"` não importa `@/lib/prisma`, `@/lib/crypto`, `@/lib/supabase-admin`, `@/lib/auth-platform` nem `@/lib/resend` | Esses módulos carregam credencial ou acesso irrestrito ao banco, e no bundle do navegador viram código público. |
| Todo `NEXT_PUBLIC_*` citado está em lista fechada | Variável com esse prefixo é embutida no bundle. Um `NEXT_PUBLIC_ASAAS_API_KEY` é publicação da chave. |
| Nenhum `$queryRawUnsafe`, `$executeRawUnsafe`, `eval(` ou `new Function(` | São as portas de injeção que o Prisma e o React fecham por padrão. |
| `dangerouslySetInnerHTML` só em `src/app/layout.tsx` | O único uso hoje é o script de tema, com conteúdo fixo. |
| Toda tabela de `CREATE TABLE` nas migrações tem `ENABLE ROW LEVEL SECURITY` em alguma migração | Tabela em `public` sem RLS nasce aberta para a chave anônima do Supabase, com escrita. |
| `next.config.js` mantém `poweredByHeader: false`, HSTS com `includeSubDomains`, `nosniff` e `X-Frame-Options: DENY` | São uma linha cada e somem numa limpeza de config sem ninguém notar. |

A lista de `prismaUnscoped` vai nascer com os 42 arquivos que o importam hoje. Isso não significa
que todos estão certos; revisar cada um é trabalho separado, e a lista é o que torna essa
revisão possível e impede que ela cresça no escuro enquanto não acontece.

## As extensões dos testes existentes

**`src/proxy.test.ts`**

* Uma rota `/api/*` de tenant (por exemplo, `/api/coupons`) com sessão de outro tenant
  não é encaminhada com `x-tenant-id`.
* Em cada ramo que pula o pipeline, e no host da plataforma, um `x-tenant-id` e um
  `x-tenant-plano` enviados pelo cliente não chegam ao request encaminhado.

**`src/lib/prisma.test.ts`**

* `update`, `updateMany`, `updateManyAndReturn` e o `update` do `upsert` com
  `data.tenantId` de outro tenant entregam o `tenantId` do contexto.
* O mesmo com a forma relacional, `data.tenant.connect`.

## As correções

**1. Open redirect.** Nova função `destinoSeguro(valor, padrao)` em
`src/lib/redirect-seguro.ts`. Ela só aceita valor que comece com `/` e que, resolvido
contra uma origem fictícia com `new URL`, continue nessa origem. A resolução por `URL`, e
não por prefixo, é o ponto: ela trata `//golpe.example`, `/\golpe.example` e caractere de
controle da mesma forma que o navegador trata. Qualquer outra coisa devolve `padrao`.
`LoginForm` e `RegisterForm` passam a usá-la. Testes: `https://x`, `//x`, `/\x`,
`javascript:alert(1)`, `\t//x`, valor nulo, e os destinos legítimos de hoje (`/checkout`,
`/pedidos/abc/chat`, `/adm`).

**2. Extensão do Prisma.** Nas operações de update, quando `data` traz `tenantId` ou
`tenant`, o `tenantId` passa a ser o do contexto e `tenant` é removido. É a mesma regra
que o `create` já segue. Não se injeta `tenantId` em todo update, só quando a chamada
tentou mexer nele, para não alterar os argumentos de nenhuma escrita legítima.

**3. Proxy.** Os ramos que devolvem `NextResponse.next()` sem passar pelo pipeline de
tenant passam a encaminhar o request sem `x-tenant-id` e sem `x-tenant-plano`. A
implementação precisa confirmar, no teste, que o Next de fato remove o header, e não só o
omite da lista de sobrescritos.

**4. Rate limit no cadastro.** `/api/auth/register` ganha dois `criarLimitador`, os dois
por tenant e IP, com a mesma forma de obter o IP que as rotas com limite já usam. Um só
limitador, contando todo POST, refusava o sexto cliente real atrás do mesmo IP de
operadora — CGNAT põe muita gente atrás de poucos IPs públicos, e uma promoção de
restaurante esbarra nisso na primeira hora. `limitadorGeral` (20 por 10 min, como o
forgot-password) cobre todo POST e contém bot; `limitadorDeEmailExistente` (5 por 10 min)
é consumido só quando o e-mail já existe, bem antes do 409 — é essa resposta que uma
enumeração está lendo, e estourado o limite ela vira o mesmo 429 genérico, para não
revelar a existência do e-mail a quem já passou de 5 tentativas. O 409 em si continua: a
tela de cadastro depende dele para dizer "este e-mail já tem conta".

**5. CI.** `.github/workflows/testes.yml`, em todo push e pull request: `npm ci`,
`npm run lint`, `npm test`, e `npm audit --omit=dev --audit-level=high` com
`continue-on-error`. O audit avisa e não reprova porque há quatro vulnerabilidades high
abertas hoje (`prisma`, `@prisma/config`, `deepmerge-ts`, `ws`), e reprovar todo PR até
elas subirem faria alguém desligar o passo inteiro.

## Ordem

Cada correção segue o mesmo ciclo: o teste entra vermelho, a correção o deixa verde, o
resto da suíte continua verde.

1. Invariantes estáticos. Não exigem correção e dão a lista de `prismaUnscoped`.
2. Prisma (correção 2), por ser a menor e isolada.
3. Proxy (correção 3) e a extensão do `tenantMismatch` em API.
4. Open redirect (correção 1).
5. Rate limit do cadastro (correção 4).
6. Matriz de acesso. Vem depois das correções porque é a peça maior, e porque o controle
   positivo pode revelar rota que precise de exceção declarada.
7. CI (correção 5), por último, para que o primeiro run já rode a suíte completa.

## Fora de escopo

* **Subir as dependências vulneráveis.** `prisma` e `@supabase/supabase-js` mexem no
  acesso ao banco e no realtime, e merecem mudança própria.
* **Checar `session.user.tenantId` dentro de cada handler.** Seria defesa em profundidade
  real, mas toca cerca de 40 arquivos. O proxy já barra, e o teste novo trava isso.
* **Revisar cada um dos 42 usos de `prismaUnscoped`.** A lista fechada é o que viabiliza
  essa revisão depois.
* **`app.current_tenant` no RLS.** O AGENTS.md explica por que as policies negam tudo e por
  que isso é o comportamento desejado.
