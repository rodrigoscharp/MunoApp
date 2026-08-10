# Assinatura, parte A: a régua

Data: 2026-08-10

## Problema

A landing vende por R$ 99,99/mês e o sistema não sabe cobrar. `Tenant.plano` é um `String`
com default `"free"` — um rótulo, não uma assinatura. Existem `valorMensal` e
`diaVencimento` no `Tenant`, preenchidos na conversão do lead, e nada os lê depois.

Na prática isso significa que a mensalidade vive na cabeça do Rodrigo: quem paga, quanto,
desde quando, quem está atrasado. Com um cliente é gerenciável. É o tipo de coisa que
quebra em silêncio no décimo, e o sintoma é receita que some sem ninguém notar.

## Escopo

**Dentro:** o modelo de assinatura e cobrança, a régua de inadimplência, o job diário que a
move, o bloqueio do `/adm`, e as telas para operar isso à mão.

**Fora — vai para a parte B:** integração com o Asaas. Cobrança nascendo e se liquidando
sozinha, cartão recorrente, PIX, boleto, webhook. A parte A é pré-requisito: o webhook do
Asaas precisa de uma `Cobranca` existente para marcar como paga.

A parte A entrega software utilizável sozinha — é o mesmo controle que existiria com baixa
manual, que aguenta os primeiros clientes enquanto B fica pronto.

**Também fora:** cancelamento self-service pelo restaurante, mudança de plano, e nota
fiscal.

## Decisões tomadas com o Rodrigo em 10/08/2026

| Decisão | Escolha |
|---|---|
| Formas de pagamento | cartão automático **e** PIX/boleto, o restaurante escolhe (parte B) |
| Inadimplência | avisa aos 7 dias, bloqueia o `/adm` aos 15, **nunca** derruba o cardápio |
| Provedor | Asaas, integração própria (parte B) |
| Início da cobrança | cortesia definida caso a caso, na conversão do lead |

## Modelo

```prisma
enum AssinaturaStatus { ATIVA INADIMPLENTE BLOQUEADA CANCELADA }
enum CobrancaStatus   { PENDENTE PAGA VENCIDA CANCELADA }

model Assinatura {
  id             String   @id @default(cuid())
  tenantId       String   @unique
  tenant         Tenant   @relation(fields: [tenantId], references: [id])
  valorMensal    Decimal  @db.Decimal(10, 2)
  diaVencimento  Int
  inicioCobranca DateTime           // primeiro vencimento; depois da cortesia
  status         AssinaturaStatus @default(ATIVA)
  cobrancas      Cobranca[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Cobranca {
  id           String   @id @default(cuid())
  assinaturaId String
  assinatura   Assinatura @relation(fields: [assinaturaId], references: [id])
  competencia  String            // "2026-08"
  valor        Decimal  @db.Decimal(10, 2)
  vencimento   DateTime
  status       CobrancaStatus @default(PENDENTE)
  pagoEm       DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([assinaturaId, competencia])
  @@index([status, vencimento])
}
```

`@@unique([assinaturaId, competencia])` é a peça central: impede cobrar o mesmo mês duas
vezes quando o job diário rodar duplicado — e job rodando duas vezes é quando, não se.
A idempotência é do banco, não do código que chama.

Nenhum dos dois é modelo tenant-scoped no sentido do `tenant-scoped-models.ts`: assinatura é
relação comercial entre a plataforma e o restaurante, lida sempre por `prismaUnscoped` do
lado da plataforma. Vale a mesma leitura que o `Lead` já tem.

### A migração destrutiva, e por que ela é a opção segura

`Tenant.valorMensal` e `Tenant.diaVencimento` passam a viver na `Assinatura`. Manter os dois
lugares cria duas fontes de verdade para o mesmo número — é assim que se cobra o valor
errado, e o erro só aparece na fatura do cliente.

A migração faz, em uma transação: cria as tabelas, copia os valores de todo `Tenant` que
tenha `valorMensal` preenchido para uma `Assinatura` nova, e **derruba as duas colunas do
`Tenant`**.

Isso é DDL destrutivo em produção, que este projeto trata com cuidado. Três coisas o tornam
aceitável, e a implementação precisa garantir as três:

1. O backfill roda **antes** do `DROP`, na mesma transação — falhou o backfill, nada cai.
2. A contagem de `Assinatura` criadas tem de bater com a de `Tenant` com `valorMensal` não
   nulo. Um teste confere isso contra o banco local espelhado antes do deploy.
3. O backup diário do dia anterior está no Blob. Sem isso, não se faz.

`inicioCobranca` dos tenants migrados recebe o próximo `diaVencimento` a partir da data da
migração — eles já são clientes, então não ganham cortesia retroativa.

### Os sete consumidores que vêm junto

Derrubar as colunas não é uma linha de SQL: sete lugares leem ou escrevem esses campos hoje,
e todos passam a falar com `Assinatura`. A migração e o refactor são a **mesma tarefa** — se
forem separados, existe um commit em que o projeto não compila.

| Arquivo | O que faz hoje |
|---|---|
| `src/lib/platform-metrics.ts` | `calcularMrr` soma `valorMensal` de tenants ativos |
| `src/app/platform/page.tsx` | dashboard, seleciona `valorMensal` para a receita |
| `src/app/platform/clientes/page.tsx` | mostra valor e dia por cliente |
| `src/app/api/platform/clientes/[id]/route.ts` | PATCH de valor e dia |
| `src/app/api/platform/leads/[id]/converter/route.ts` | grava `valorMensal` na conversão |
| `src/components/platform/MensalidadeInline.tsx` | edição inline na lista |
| `src/components/platform/ConverterLead.tsx` | campo de mensalidade na conversão |

O MRR é o que merece atenção: hoje ele soma tenant ativo com `valorMensal` não nulo. Com
`Assinatura`, a pergunta certa passa a ser outra — soma assinatura **não cancelada**, e o
`status` do tenant deixa de participar da conta. São definições diferentes de receita
recorrente, e a nova é a correta: restaurante inadimplente ainda deve, e sair da soma
esconderia justamente o que você precisa ver.

## A régua

Função pura em `src/lib/assinatura/regua.ts`. Recebe a cobrança em aberto mais antiga e a
data de hoje, devolve o status que a assinatura deve ter:

```
sem cobrança vencida        -> ATIVA
vencida há 1..6 dias        -> ATIVA        (aviso na tela, sem restrição)
vencida há 7..14 dias       -> INADIMPLENTE (aviso forte no /adm)
vencida há 15 dias ou mais  -> BLOQUEADA
qualquer pagamento          -> ATIVA        (imediato)
```

Sem relógio interno: a data é parâmetro, como no `rate-limit.ts`. Testável sem esperar.

O status é **persistido**, não calculado a cada requisição. Duas razões: o proxy precisa ler
um campo e não uma regra, e um bloqueio que existe como linha no banco é auditável e se
desfaz com um update — enquanto um bloqueio calculado se desfaz mudando código.

## O job diário

Rota `POST /api/cron/assinaturas`, protegida por `CRON_SECRET` (a variável já existe no
ambiente e nenhum código a usa ainda), agendada em `vercel.json`.

Duas responsabilidades, nessa ordem:

1. **Gerar cobrança do mês** para toda assinatura cujo `status` não seja `CANCELADA`, cuja
   competência atual ainda não exista, e **cujo `inicioCobranca` já tenha chegado**. Essa
   última condição é a cortesia: durante ela a assinatura existe, aparece nas telas e não
   gera cobrança. O `@@unique` cobre a corrida.
2. **Mover status** de assinaturas com cobrança vencida, aplicando a régua. `CANCELADA`
   nunca é movida por régua — só por ação humana.

Roda diariamente. Se falhar num dia, o dia seguinte corrige tudo — nenhuma das duas
operações depende de ter rodado ontem. Essa propriedade é deliberada: job de cobrança que
acumula estado é job que erra depois de um incidente.

### O dia 31 não é problema, e é de propósito

A primeira versão deste spec especificava uma regra de fim de mês para `diaVencimento = 31`
em fevereiro. Ela não é necessária: `src/app/api/platform/clientes/[id]/route.ts` já valida
`min(1).max(28)`, então nenhum vencimento pode cair num dia que não existe em algum mês.

**O teto de 28 é mantido**, e a `Assinatura` valida igual. Custa ao cliente não poder vencer
dia 30, e elimina uma classe inteira de bug de data — troca que vale, ainda mais num número
que vira fatura.

## O bloqueio

O `proxy.ts` já consulta o tenant antes de liberar a requisição (`src/proxy.ts:113`). A
assinatura entra no mesmo `select` — nenhuma consulta a mais.

```ts
if (isAdminRoute && assinatura?.status === "BLOQUEADA") -> /adm/assinatura
```

Três garantias que a implementação precisa sustentar, em ordem de importância:

1. **O storefront nunca é afetado.** A checagem só existe dentro do ramo `isAdminRoute`.
   Cardápio, carrinho, checkout, acompanhamento, mesa e motoboy não têm como cair por
   inadimplência — o código nem chega perto deles. É o teste mais importante do projeto.
2. **A tela de assinatura escapa do próprio bloqueio.** Senão o dono é redirecionado para a
   página que ele precisa ver para resolver, em loop.
3. **A cozinha (`/dashboard`) continua livre.** Bloquear gestão é pressão; bloquear a
   cozinha durante o serviço é sabotagem.

## Telas

**`/adm/assinatura`** (restaurante) — status, valor, próximo vencimento, histórico de
cobranças. É a tela que o bloqueio deixa passar.

**Aviso no `/adm`** — faixa a partir do primeiro dia de atraso, com o tom subindo conforme
a régua.

Atenção a um detalhe fácil de errar: nos seis primeiros dias de atraso o status ainda é
`ATIVA`, de propósito — atraso curto não merece marca no cadastro. Logo **a faixa não pode
ser derivada do status da assinatura**; ela olha a cobrança vencida mais antiga. Quem
implementar lendo só `assinatura.status` vai produzir uma tela que não avisa ninguém até o
sétimo dia, e o bug é silencioso porque a tela funciona.

**`/platform/clientes`** (plataforma) — situação de cada cliente, quem está devendo e há
quanto tempo, e a ação de **dar baixa manual** numa cobrança. É o que torna a parte A
utilizável sem gateway nenhum.

**Conversão do lead** — ganha `diaVencimento` e **dias de cortesia**, ao lado do
`valorMensal` que a rota já aceita. É onde a decisão caso a caso acontece.

## Testes

| Arquivo | Cobre |
|---|---|
| `src/lib/assinatura/regua.test.ts` | cada faixa da régua e suas bordas (6/7, 14/15 dias), relógio injetado |
| `src/lib/assinatura/competencia.test.ts` | dia 31 em fevereiro e em bissexto, virada de ano, idempotência da competência |
| `src/app/api/cron/assinaturas/route.test.ts` | recusa sem `CRON_SECRET`; rodar duas vezes não duplica cobrança |
| `src/proxy.test.ts` (novo) | **bloqueio não alcança rota de storefront**; `/adm/assinatura` escapa; `/dashboard` livre |

O teste do proxy é o que mais importa e o projeto não tem nenhum hoje. Ele existe para que
a pergunta "isso pode derrubar o cardápio de um cliente?" tenha resposta automática, e não
uma releitura cuidadosa a cada mudança.
