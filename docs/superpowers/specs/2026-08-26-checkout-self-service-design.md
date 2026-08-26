# Checkout self-service: da landing ao restaurante no ar, sem ninguém no meio

Data: 2026-08-26

## Problema

Vender uma Muno hoje exige o Rodrigo em três momentos: conversar no WhatsApp,
conferir o PIX na mão, e preencher o formulário de conversão no CRM. Os dez CTAs
da landing terminam todos no mesmo lugar — `#contato`, que abre uma conversa.

O código não esconde isso. `src/lib/assinatura/baixa.ts` abre dizendo *"enquanto
não há gateway, é assim que o dinheiro entra no sistema: o operador confere o PIX
e dá baixa"*, e a conversão de lead em cliente
(`/api/platform/leads/[id]/converter`) exige sessão de plataforma.

O objetivo é o funil fechar sozinho: o cliente escolhe o plano, paga, e recebe a
Muno dele funcionando — sem ninguém do lado da plataforma tocar em nada.

O Projeto A (`2026-08-26-landing-para-dentro-do-app-design.md`) já trouxe a
landing para este repositório e criou `PRECOS` em `src/lib/plans.ts` como fonte
única de preço, com teste que falha se a página divergir. Este projeto usa isso.

## Preços

| Plano | Mensal | Anual (11 meses, 1 grátis) |
|---|---|---|
| `MEMBRO` | R$ 119,99 | R$ 1.319,89 |
| `MEMBRO_MESA_QR` | R$ 149,99 | R$ 1.649,89 |

Em centavos inteiros, em `PRECOS`. O teste de drift passa a cobrir os quatro
valores.

**Mensal só aceita cartão.** É o único ciclo que o Asaas cobra sozinho:
assinatura em PIX gera um QR novo a cada período, que o cliente precisa pagar na
mão — quem esquece é bloqueado pela régua, e a plataforma volta a ser cobradora.
O anual aceita cartão ou PIX, porque é uma cobrança só, à vista.

## A decisão estruturante: quem é a verdade sobre a cobrança

**O Asaas manda na recorrência; a `Cobranca` local espelha.**

O risco de não decidir isto é concreto: dois relógios para a mesma dívida. O
Asaas cobra o cartão e o cron local cria a cobrança do mês assim mesmo; ninguém
dá baixa nela; em quinze dias a régua bloqueia um restaurante que está em dia.

Como fica:

* O Asaas cobra, tenta de novo quando falha, lida com cartão vencido e emite
  recibo. Nada disso é código nosso.
* O webhook espelha cada evento numa `Cobranca`: `PAYMENT_CREATED` vira
  PENDENTE, `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` viram PAGA.
* **A régua, o proxy e o CRM não mudam.** Eles continuam lendo `Cobranca` e
  `Assinatura.status`, sem saber que existe gateway. Cartão que falha vira
  cobrança vencida, e o bloqueio de 15 dias acontece pelo caminho de sempre.
* `Assinatura` ganha `asaasSubscriptionId`. O cron **pula a geração de cobrança**
  para quem tem esse id, e **continua rodando a régua** para todos.

Essa última linha é a que impede o bug dos dois relógios. Ela precisa de teste.

## Os modelos

### `Inscricao` — o estado entre "escolheu" e "existe"

```
id, nome, slug @unique, email, plano, ciclo,
-- sem cpfCnpj: o documento vai direto para o Asaas e não é persistido
asaasCustomerId, asaasPaymentId, asaasSubscriptionId,
status: AGUARDANDO_PAGAMENTO | PAGA | PROVISIONADA,
tenantId @unique?, expiraEm, createdAt, updatedAt
```

Existe por dois motivos, e nenhum é "guardar dados do formulário":

1. **É a reserva do slug.** Sem ela, o cliente paga e só então descobre que
   "pizzaria" já era. A checagem de disponibilidade consulta três fontes:
   `Inscricao.slug`, `Tenant.slug` e `RESERVED_SLUGS`.
2. **É o que torna o webhook idempotente.** O Asaas reentrega quando não recebe
   200. Sem um registro que diga "isto já foi provisionado", a segunda entrega
   cria um segundo restaurante para quem pagou uma vez.

**Slug abandonado não fica preso para sempre.** `expiraEm` marca a validade, e o
cron diário **apaga** inscrição não paga e vencida. A limpeza é do cron, e não um
TTL no banco, pela mesma razão que o resto do job: converge sozinho e não acumula
estado. Janela de 1 hora para cartão e 24 horas quando há PIX pendente — PIX
gerado à noite é pago de manhã.

Apagar, e não marcar como expirada: enquanto a linha existir, o `slug @unique`
continua segurando o nome, que é exatamente o que a expiração existe para soltar.
Não há perda comercial nisso — o `Lead` criado no início do checkout permanece, e
é ele que registra que alguém tentou assinar e não concluiu. Por isso o status não
tem `EXPIRADA`: seria um valor que nunca chega a ser lido.

**RLS obrigatório.** `Inscricao` não tem `tenantId` obrigatório e não entra em
`tenant-scoped-models.ts` — é registro de plataforma, como `Lead`. Mas ela nasce
em `public`, então nasce **aberta para a chave anônima do Supabase**, com escrita.
A migração liga RLS sem policy nenhuma, negando tudo para `anon`, como
`20260810200000_rls_nas_tabelas_de_plataforma` fez com `Tenant` e `PlatformAdmin`.
Sem isso, qualquer visitante de qualquer cardápio consegue ler e inserir
inscrições.

**Remoção de tenant: `Inscricao` só perde o vínculo**, como o `Lead`. Ela é
registro comercial da plataforma — apagá-la junto reescreveria o histórico de
vendas por causa de um cliente que saiu. Como ela tem `tenantId`,
`tenant-removal.test.ts` vai quebrar até ela ser tratada: isso é o teste
funcionando, não um obstáculo.

### `Assinatura` ganha dois campos

* `asaasSubscriptionId String? @unique` — nulo para os clientes que já existem,
  cobrados por PIX manual. É o que separa os dois mundos.
* `ciclo Ciclo @default(MENSAL)` — `MENSAL | ANUAL`.

### `Lead` continua sendo criado

Toda inscrição gera um `Lead` com `origem = "checkout"`, vinculado ao tenant no
fim. Sem isso, todo cliente self-service some do funil e `FunilBarras` e
`LeadsPorSemana` passam a medir só quem veio pelo WhatsApp.

## O cliente Asaas da plataforma

`src/lib/assinatura/asaas.ts`, novo. Uma chave só, em env: `ASAAS_API_KEY`,
`ASAAS_ENV` (`sandbox` | `production`), `ASAAS_WEBHOOK_TOKEN`.

**Não é o `asaas-adapter.ts`.** Aquele implementa `PaymentProvider`, lê credencial
criptografada de `PaymentConnection` por tenant, e serve o restaurante cobrando o
cliente dele. Este serve a Muno cobrando o restaurante. Reaproveito as convenções
(header `access_token`, URLs de sandbox/produção, tradução de
`errors[].description`, comparação de token com `timingSafeEqual`) mas não o
objeto: fundir os dois faria a credencial da plataforma trafegar pelo caminho
desenhado para credencial de tenant.

Superfície mínima — nada além do que este projeto usa:

```
criarCliente, criarAssinatura, criarCobrancaAvulsa,
cancelarAssinatura, estornar, verificarWebhook
```

Testado como o adapter vizinho já é: `fetch` simulado, sem falar com o Asaas.

## O fluxo

```
landing → /assinar?plano&ciclo → 3 campos, slug conferido ao vivo
        → Inscricao (slug reservado) → Asaas → cliente paga
        → webhook → provisionTenant() → Assinatura + Cobranca(PAGA) → e-mail
        → primeiro acesso → onboarding de identidade → cardápio no ar
```

**Antes de pagar, quatro campos:** nome do restaurante, e-mail, o endereço
`.munoapp.com.br` com disponibilidade conferida ao vivo, e CPF ou CNPJ. Só isso. O
resto do cadastro vira onboarding depois do primeiro acesso — formulário longo
antes de pedir cartão derruba conversão, e o mínimo aqui é o que garante que
**nunca existe pagamento sem tenant**.

O documento não é escolha nossa: `POST /customers` do Asaas exige `cpfCnpj`, e sem
cliente não há cobrança. **CPF e CNPJ, os dois** — o pagador aqui é o restaurante,
normalmente CNPJ, às vezes MEI ou pessoa física; aceitar só CPF excluiria a maior
parte dos clientes.

`src/lib/cpf.ts` valida CPF e abre dizendo que o documento **não é persistido**:
*"viaja do checkout direto pra rota de cobrança e de lá pro gateway"*. A mesma
regra vale aqui, pelo mesmo motivo — `Inscricao` **não** guarda o documento, só o
`asaasCustomerId` que o Asaas devolve. O arquivo ganha `isValidCnpj` e um
`isValidCpfCnpj` que aceita os dois pelo número de dígitos.

**O webhook é a parte que não pode errar**, porque roda sozinho e é reentregue.
Rota `/api/assinaturas/webhook/asaas`, com guarda em `src/proxy.ts` que a tira do
pipeline de tenant — o Asaas chama o host do deploy, que não é subdomínio de
restaurante nenhum, e pelo caminho normal a rota resolveria um slug inexistente e
morreria com 404 silencioso. É a mesma guarda, pelo mesmo motivo, que
`/api/leads/publico` e `/api/cron/` já têm.

Regras do handler:

* **Idempotente pela `Inscricao`**: já `PROVISIONADA` responde 200 e não faz nada.
* **Reaproveita `provisionTenant()` inteiro.** Ele já é transacional, já cria o
  `Setting` de identidade e já traduz P2002 para erro de slug em uso. Não existe
  caminho de provisionamento novo neste projeto.
* **A `Cobranca` nasce PAGA**, espelhando o pagamento.

## O e-mail: link para criar a senha, não a senha

O caminho de hoje gera a senha, mostra uma vez na tela e nunca mais — o comentário
em `ConverterLead.tsx` diz que ela "não é recuperável depois". Mandar essa senha
por e-mail a faria viver para sempre numa caixa de entrada, e criaria um desfecho
sem saída: envio que falha **depois** do tenant criado deixaria uma credencial que
ninguém tem.

O e-mail traz o endereço da Muno, o login, e um botão "criar minha senha" com
token de uso único. `PasswordResetToken`, a página `/redefinir-senha` e a rota
`/api/auth/reset-password` já existem — nada novo é construído.

**Validade de 7 dias**, e não a de 1 hora do "esqueci a senha". Aquela é curta
porque a pessoa acabou de pedir; esta precisa sobreviver a quem paga meia-noite e
lê o e-mail de manhã. Reenvio pelo CRM, na tela do cliente.

## Onboarding: identidade, e só

Depois do primeiro acesso, um passo guiado para telefone, endereço, logo e horário
de funcionamento — exatamente o que o `Setting` `restaurant_info` guarda e que hoje
nasce em `SEM_CADASTRO`. É o que faz o cardápio parar de parecer inacabado.

Cardápio, zonas de entrega e gateway ficam para o `/adm`, onde já existem telas
para isso. Cadastrar cardápio é trabalhoso, e empurrar isso para alguém que acabou
de pagar é o passo onde a pessoa desiste.

## Cancelamento e reembolso

A landing assina duas promessas: **"cancele quando quiser sem fidelidade"** e
**"7 dias de garantia total"**. Elas foram escritas quando só havia plano mensal, e
o anual à vista entra em conflito direto com a primeira.

A decisão é honrar o texto: **reembolso proporcional dos meses não usados.**

```
reembolso = valorPago − (mesesUsados × preçoMensalCheio)
```

Membro anual cancelado no 3º mês: `1.319,89 − 3 × 119,99` = **R$ 959,92**.

Os meses usados entram pelo preço **cheio**. O mês grátis foi ganho ao se
comprometer com o ano, e quem sai antes não fica com ele. A conta trava em zero:
no 11º mês dá exatamente zero, e nunca vira negativa. **Nos 7 primeiros dias a
garantia manda** e devolve tudo, sem essa conta.

**O estorno é automático**, com aviso no CRM. É a única forma de o fluxo ser
autônomo como o projeto exige. E porque é dinheiro saindo sozinho, a função do
cálculo nasce por teste antes do código, com os casos de borda explícitos: dia 1,
7º dia, 11º mês, 12º mês, e mensal.

A tela mora em `/adm/assinatura`, que o proxy já isenta do bloqueio — a tela que
resolve a pendência nunca pode ser bloqueada. O storefront **não cai** no
cancelamento: `CANCELADA` já significa "não paga mensalidade", não "está devendo",
e o proxy não bloqueia por isso.

## `proximoVencimento` precisa conhecer o ciclo

Hoje, sem cobrança em aberto, ele responde "mês que vem". Para um anual em dia isso
é mentira na tela do cliente: ele pagou o ano e a Muno diz que ele paga de novo em
30 dias. Passa a receber o ciclo e somar doze meses quando for anual.

## A landing

1. A seção de planos passa a ter **dois cards** e um **toggle mensal/anual** em JS
   puro, com o anual explicando o "1 mês grátis".
2. Os **dez CTAs** deixam de apontar para `#contato` e passam a levar para
   `/assinar?plano=…&ciclo=…`, com a escolha já carregada.
3. O **formulário de WhatsApp continua na página**, como saída secundária — "prefiro
   falar com alguém antes" — e continua gravando lead. Automatiza quem já se
   decidiu sem perder quem tem dúvida.
4. O texto **"cancele quando quiser sem fidelidade" não muda**, porque o reembolso
   proporcional o mantém verdadeiro.

Os preços do HTML e de `PRECOS` são conferidos pelo teste de drift criado no
Projeto A, agora nos quatro valores.

## Armadilhas conhecidas

* **`Permissions-Policy: payment=()`** em `next.config.js` desliga a Payment
  Request API, e **`X-Frame-Options: DENY`** impede embutir checkout de terceiro em
  iframe. Um dos dois vai atrapalhar dependendo de como o Asaas entregar o
  formulário de cartão. Descobrir isso **antes** de escolher entre tokenizar o
  cartão na nossa página ou redirecionar para o Asaas.
* **`NEXT_PUBLIC_APP_URL`** monta URL de webhook em
  `src/app/api/payments/connections/route.ts`. O spec de 10/08 já o marcou como "a
  armadilha vizinha"; agora tem data marcada. Conferir o valor em produção.
* **Slug tem duas fontes de unicidade** (`Inscricao` e `Tenant`) mais
  `RESERVED_SLUGS`. Checar as três na reserva **e** confiar no P2002 de
  `provisionTenant` na hora de criar — check-then-act não impede corrida.

## Fora de escopo

Cupom de desconto, upgrade e downgrade de plano entre ciclos, cobrança de setup,
plano Enterprise (segue "sob consulta"), migrar os clientes atuais de PIX manual
para o gateway, e onboarding de cardápio.

## Testes

Nenhuma linha do caminho do dinheiro sem teste antes.

* **Reembolso**: dia 1, dentro dos 7 dias, 3º mês, 11º mês, 12º mês, e mensal.
* **Cron**: assinatura com `asaasSubscriptionId` **não** gera cobrança; sem o id,
  gera como hoje; a régua roda para as duas.
* **Webhook**: entrega repetida provisiona uma vez só; token inválido é recusado;
  evento de assinatura desconhecida não explode.
* **Slug**: em uso por `Tenant`, por `Inscricao`, e em `RESERVED_SLUGS`.
* **`isValidCpfCnpj`**: CPF válido, CNPJ válido, dígito verificador errado nos
  dois, sequência repetida (`111...`), e contagem de dígitos fora de 11 e 14.
* **`proximoVencimento`**: anual em dia aponta para daqui a doze meses.
* **`tenant-removal`**: `Inscricao` perde o vínculo, não é apagada.
* **Drift de preço**: os quatro valores.
