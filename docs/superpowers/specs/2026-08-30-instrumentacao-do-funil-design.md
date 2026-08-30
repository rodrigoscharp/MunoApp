# O funil ganha memória: da visita ao membro pagante

Data: 2026-08-30

## Problema

O console da plataforma só enxerga a faixa do meio do funil: a pessoa que já se
identificou. Quem chegou na landing e foi embora nunca existiu para o banco, e o
que acontece depois da venda também não aparece.

Três fatos, verificados no repositório em 30/08/2026:

1. **Não há nenhuma instrumentação de visita.** Sem `@vercel/analytics`, sem
   Posthog, sem nada em `package.json`. A landing é HTML estático servido do
   filesystem por `public/vendas/`, e ninguém conta quem chegou. "Quantos
   acessam" não é uma consulta que falta, é um dado que nunca foi gravado.
2. **Nenhum arquivo calcula taxa de conversão.** `src/lib/platform-metrics.ts`
   tem MRR, leads abertos, pauta e série semanal. Conversão não existe em lugar
   nenhum do código.
3. **O checkout abandonado se desfaz em silêncio.** A `Inscricao` não paga é
   apagada pelo cron quando vence, e é apagada de propósito: enquanto a linha
   existir, o `slug @unique` continua segurando o endereço. O efeito colateral é
   que o degrau onde mais gente cai não deixa rastro nenhum.

E há um vazamento que já contamina os números de hoje. O lead da landing tem
telefone e nenhum e-mail; o do checkout tem e-mail e nenhum telefone.
`provisionamento.ts` só casa por e-mail, então a mesma pessoa que pediu WhatsApp
e depois comprou vira dois leads, e o da landing fica aberto para sempre. Todo
denominador de conversão sai inflado, e ninguém percebe.

Some-se a isso a mudança de natureza do produto. Com o checkout self-service no
ar, a Muno virou automática: ninguém do lado da plataforma precisa mover um lead
para ele virar cliente. Mas `LeadStatus` continua sendo **digitado à mão** em
`src/components/platform/LeadAcoes.tsx`. O funil da tela reflete a memória do
operador, não o que aconteceu.

## Decisão

Uma sessão anônima nasce no primeiro contato com o domínio raiz e atravessa a
landing, o checkout, o pagamento e o provisionamento. Os eventos dessa sessão
ficam numa tabela própria, e `Lead` e `Inscricao` passam a guardar o mesmo id.

É isso que permite dizer "de 340 visitas vindas do Instagram, 11 viraram lead e
4 viraram membro". Um contador de pageview solto nunca responde isso, porque
não liga o visitante ao pagamento. Foi por essa razão que o Vercel Web Analytics
foi descartado como base: ele conta bem e não cruza nada.

Este documento cobre **só a instrumentação**, ou seja, fazer o dado existir e
estar correto. Ele termina sem nenhuma tela nova. As telas de conversão, coorte
e origem são a spec seguinte, e a saúde do cliente depois da venda é a terceira.
A separação é deliberada: assim a verificação deste passo é "o evento certo
aparece na hora certa e nenhuma venda depende dele", que é uma afirmação
demonstrável.

## O fluxo

```
proxy (host raiz)  →  Set-Cookie: muno_s=<uuid>
     ↓
landing JS         →  POST /api/funil/evento  { tipo, detalhe }
     ↓                                         (o cookie viaja sozinho)
/api/assinar       →  Inscricao.sessaoId  e  Lead.sessaoId
     ↓
webhook do Asaas   →  PAGOU         (servidor, casa pela Inscricao)
provisionamento    →  PROVISIONADO  (dentro da transação que já existe)
cron das 9h        →  ABANDONOU     (quando apaga a Inscricao vencida)
```

### O proxy não fala com o banco

Ele gera o uuid e devolve o cookie. Nada além disso.

Isso não é economia de esforço, é a única forma segura. `src/proxy.ts` roda em
toda requisição de todos os hosts, e `src/proxy.test.ts` afirma hoje que o host
raiz **não chama** `prisma.tenant.findUnique`. Um write no middleware
transformaria cada visita de cardápio numa ida ao Postgres e quebraria a
garantia que aquele teste existe para proteger. Quem grava é a rota de ingestão,
e a linha da sessão nasce no primeiro evento que chega.

### O cookie

```
muno_s=<uuid v4>
  Path=/           HttpOnly        SameSite=Lax
  Secure           (só em produção)
  Max-Age=31536000 (um ano)
  sem atributo Domain
```

**Sem `Domain` é o ponto.** Um cookie em `.munoapp.com.br` seria enviado em toda
requisição de todo cardápio de todo restaurante, engordando header de página que
não tem nada a ver com o funil. Host-only, ele fica no apex, que é exatamente
onde a landing e o checkout vivem.

`HttpOnly` porque o JavaScript nunca precisa ler o valor: a rota de ingestão é
same-origin e o navegador manda o cookie sozinho no `fetch`.

O cookie é plantado em dois pontos do proxy, e só quando `resolvedSlug === null`,
que é a condição de host raiz já usada hoje:

- no `rewrite` de `/` para `/vendas/index.html`
- no `next()` do bloco de `/assinar`, `/assinar/...` e `/api/assinar`

O bloco de `/assinar` aparece **antes** do teste de `resolvedSlug === null` no
arquivo, mas `resolvedSlug` já está resolvido desde a linha 72, então a condição
de host é verificável ali. Sem essa condição, o cookie seria plantado também em
subdomínio de cliente, que é justamente o que a ausência de `Domain` evita.

Se o cookie já veio na requisição, não se planta outro. Reescrever o valor a
cada visita mataria a sessão e transformaria um visitante recorrente em vários.

## Modelo de dados

```prisma
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

model SessaoFunil {
  id          String        @id          // o uuid do cookie, sem @default
  utmSource   String?
  utmMedium   String?
  utmCampaign String?
  referrer    String?                    // só o host, nunca a URL inteira
  dispositivo String?                    // "celular" | "desktop"
  eventos     EventoFunil[]
  leads       Lead[]
  inscricoes  Inscricao[]
  createdAt   DateTime      @default(now())

  @@index([createdAt])
}

model EventoFunil {
  id        String       @id @default(cuid())
  sessaoId  String?
  sessao    SessaoFunil? @relation(fields: [sessaoId], references: [id])
  tipo      TipoEvento
  detalhe   String?                      // passo do checkout, plano escolhido
  createdAt DateTime     @default(now())

  @@index([createdAt])
  @@index([sessaoId])
  @@index([tipo, createdAt])
}

model ResumoDiario {
  dia    DateTime   @db.Date
  tipo   TipoEvento
  origem String                          // utmSource normalizado, ou "direto"
  n      Int

  @@id([dia, tipo, origem])
}
```

Campos novos em modelos existentes:

```prisma
// model Lead
sessaoId String?
sessao   SessaoFunil? @relation(fields: [sessaoId], references: [id])
@@index([sessaoId])

// model Inscricao
sessaoId String?
sessao   SessaoFunil? @relation(fields: [sessaoId], references: [id])
@@index([sessaoId])
```

`Lead.sessaoId` **não** é `@unique`, ao contrário de `Lead.tenantId`. A mesma
sessão pode gerar o lead de WhatsApp e o lead de checkout, e uma constraint aqui
derrubaria o segundo `create` no meio de uma compra que já virou cobrança.

`sessaoId` é nulável em tudo, e é isso que mantém o sistema honesto: quem
bloqueia cookie, quem chega por outro caminho e todo lead gravado antes desta
mudança continuam existindo, só sem origem. Um campo obrigatório transformaria um
bloqueador de anúncios em erro 500 no checkout, trocando receita por relatório.

### Atribuição é de primeiro toque

A sessão guarda o UTM que a criou e não é sobrescrita depois. Quem chega pelo
anúncio, sai, e volta digitando o endereço continua creditado ao anúncio, que foi
quem pagou pela visita. Na prática: a rota de ingestão usa `upsert` na
`SessaoFunil` e o ramo de `update` **não** toca em `utmSource`, `utmMedium`,
`utmCampaign` nem `referrer`.

## Onde cada evento nasce

| Evento | Nasce em | Gatilho |
|---|---|---|
| `VISITA` | `public/vendas/js/main.js` | no load, com o UTM lido da URL |
| `VIU_PRECO` | landing | `IntersectionObserver` na seção de planos |
| `CLICOU_ASSINAR` | landing | clique no botão que leva a `/assinar` |
| `ABRIU_WHATSAPP` | landing | no mesmo submit que já grava o lead |
| `CHECKOUT_PASSO` | `src/components/assinar/FormularioAssinatura.tsx` | `detalhe` = `endereco`, `documento` ou `pagamento` |
| `CHECKOUT_CRIADO` | `src/app/api/assinar/route.ts` | logo depois do `create` da `Inscricao` |
| `PAGOU` | `src/app/api/assinaturas/webhook/asaas/route.ts` | casa pela `Inscricao.sessaoId` |
| `PROVISIONADO` | `src/lib/assinatura/provisionamento.ts` | dentro da transação que já existe |
| `ABANDONOU` | `src/app/api/cron/assinaturas/route.ts` | ao apagar a `Inscricao` vencida |

`ABRIU_WHATSAPP` e o `Lead` da landing nascem do mesmo clique e ambos são
gravados. Não é redundância: o lead é a pessoa, o evento é o momento dentro da
sessão. Sem o evento, a jornada perde o degrau entre `VIU_PRECO` e o lead, e
justamente a sessão que fez as duas coisas fica sem ordem cronológica.

### Nada disso pode derrubar uma venda

Todo evento disparado do navegador vai por `fetch` com `keepalive`, sem `await`,
com `.catch(() => {})`, no mesmo padrão que a captura de lead já usa em
`main.js`. Todo evento gravado no servidor entra em `try/catch` que apenas
registra no log.

Em particular, o `CHECKOUT_CRIADO` segue a posição que o `Lead` já ocupa em
`/api/assinar`: **antes** de qualquer chamada ao Asaas e fora do `try` que fala
com o gateway. Se ele estivesse dentro, uma falha ao gravar evento acionaria o
`catch` que apaga a `Inscricao`, com a cobrança viva do outro lado, e o cliente
pagaria por um restaurante que nunca nasce. O caminho que gera receita não pode
depender do que gera relatório.

## A rota de ingestão

`POST /api/funil/evento`, pública e sem autenticação, seguindo o desenho de
`/api/leads/publico`:

- **Guarda de saída no proxy**, ao lado da guarda de `/api/leads/publico` na
  linha 169, antes do `findUnique`. Sem ela, no host raiz o
  `resolvedSlug === null` derruba a rota em 404 e o painel fica vazio sem
  ninguém entender por quê.
- **`origemPermitida()` com `LANDING_ORIGIN`**, a mesma função e a mesma lista.
  O navegador manda `Origin` em POST mesmo na própria origem.
- **Limitador por IP**, `criarLimitador`, com teto mais alto que o de lead
  porque uma sessão legítima emite vários eventos. Proposta: 60 em 10 minutos.
- **Sem cookie, responde 204 e não grava.** Evento sem sessão não tem para onde
  ir, e criar sessão a partir do corpo deixaria a tabela aberta para qualquer um
  inventar id.
- **`tipo` validado por enum do zod.** Aqui o enum é seguro, ao contrário de
  `Lead.plano`: emissor e receptor são publicados juntos, no mesmo deploy.

Corpo aceito:

```json
{ "tipo": "VIU_PRECO", "detalhe": "opcional, até 60 caracteres",
  "utm": { "source": "...", "medium": "...", "campaign": "..." },
  "referrer": "instagram.com", "dispositivo": "celular" }
```

Os campos de atribuição só são usados quando a sessão é criada. O cliente manda
sempre; o servidor decide se aproveita.

## O status que ninguém digita mais

Nasce `src/lib/funil.ts`, puro, sem Prisma e sem HTTP, no mesmo espírito de
`lead-landing.ts` e `platform-metrics.ts`:

```ts
estagioDoLead(lead, eventos) →
  "VISITANTE" | "IDENTIFICOU" | "CHECKOUT" | "PAGOU" | "CLIENTE"
  | "ABANDONOU" | "PERDIDO"
```

A regra:

- `origem === "checkout"`: o estágio é **sempre derivado** dos eventos e do
  `tenantId`. Os botões de status somem da tela desse lead, porque mover à mão
  um funil automático só cria divergência entre o que a tela diz e o que
  aconteceu.
- `origem === "landing"` ou `"manual"`: o botão continua. São as conversas de
  WhatsApp, e nenhum evento captura "ela pediu para eu voltar em janeiro".

O campo `Lead.status` **não** é removido nem migrado. Ele continua sendo a
verdade do lead conduzido à mão, e para o lead de checkout passa a ser um reflexo
que o servidor mantém. Remover a coluna obrigaria a reescrever `montarPauta`,
`contarLeadsAbertos`, `FunilBarras` e a tela do funil de uma vez, sem nenhuma
tela nova em troca.

### O lead de checkout que morre sozinho

Hoje o cron apaga a `Inscricao` vencida e o `Lead` correspondente fica
`NEGOCIACAO` para sempre, inflando "leads abertos" na visão geral. Passa a, na
mesma transação: gravar `ABANDONOU` e fechar o lead com `status: "PERDIDO"` e
`motivoPerda: "Checkout expirado sem pagamento"`.

Só o lead daquela sessão, e só se ele ainda estiver aberto. Um lead que já foi
`FECHADO` não volta atrás, e um lead que você moveu à mão não é sobrescrito por
um relógio.

## Volume, expurgo, e o dia em que o cron apaga o que você queria

O cron das 9h ganha dois passos, nesta ordem e na mesma transação:

1. **Resumir** para `ResumoDiario` todo evento com mais de 90 dias, agrupado por
   dia, tipo e origem.
2. **Apagar** os eventos crus daquele intervalo.

Resumir antes de apagar, e as duas coisas juntas ou nenhuma. O resumo é
idempotente pela chave `@@id([dia, tipo, origem])` com `upsert`, então o cron
rodando duas vezes no mesmo dia não duplica contagem, e uma falha no meio não
deixa um dia contado pela metade nem um dia apagado sem resumo.

`SessaoFunil` sem nenhum evento vivo e sem `Lead` nem `Inscricao` apontando para
ela é apagada junto. Sessão de visitante que nunca voltou não precisa viver para
sempre; o que ela representa já está no resumo.

Ordem de grandeza com 10 mil visitas por mês: cerca de 30 mil linhas cruas vivas
a qualquer momento, e uma série de dois anos cabendo em poucos milhares de linhas
de resumo.

## LGPD

Gravado: um uuid aleatório, a campanha, o host de referência e "celular ou
desktop".

Não gravado: IP, user-agent cru, a URL de referência completa, e nada que
identifique uma pessoa. Nenhum dado sai para terceiro, porque não há terceiro.

Uma linha discreta no rodapé da landing, com link para a política, dizendo que a
página usa um identificador anônimo para medir de onde vêm as visitas. Sem
pop-up de consentimento: um modal na frente da página de vendas derruba a
conversão que este projeto existe para medir.

Bot que não executa JavaScript não gera evento, o que já filtra a maior parte do
tráfego de crawler sem nenhuma lista de user-agent para manter.

## As travas do repositório

- **RLS nos três modelos novos, sem policy nenhuma**, copiando
  `20260801193000_rls_em_orderitem_e_deliverytracking` na forma e
  `20260810200000_rls_nas_tabelas_de_plataforma` na intenção. Eles não têm
  `tenantId` e nascem em `public`: sem RLS, a `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  que vai no bundle de todo cardápio lê e escreve neles pela API REST do
  Supabase. Ligar sem policy nega tudo para `anon` e não afeta a aplicação, que
  conecta como `postgres` com `BYPASSRLS`.
- **Não entram em `src/lib/tenant-scoped-models.ts`.** São registro de
  plataforma, como `Lead` e `Inscricao`, e são lidos por `prismaUnscoped`.
- **`src/lib/tenant-removal.ts` não muda.** Nenhum modelo novo tem `tenantId`,
  então `ORDEM_DE_EXCLUSAO` e o teste que a confere continuam válidos. O
  `sessaoId` do `Lead` acompanha o lead, que já sobrevive à remoção do tenant
  perdendo só o vínculo.
- **A migração vai commitada junto do código.** O build de produção roda
  `scripts/migrate-on-deploy.js` antes de publicar; não há passo manual.

## Testes

Puros, sem banco:

- `src/lib/funil.test.ts`: `estagioDoLead` em cada combinação de origem e
  eventos, incluindo lead de checkout com evento fora de ordem e lead sem
  sessão nenhuma.
- Normalização de origem para o resumo: `utmSource` ausente vira `"direto"`,
  maiúsculas e espaços colapsam, para que `Instagram` e `instagram` não virem
  duas linhas.

De rota:

- `src/app/api/funil/evento/route.test.ts`: origem recusada devolve 403; sem
  cookie devolve 204 sem gravar; `tipo` inválido devolve 400; teto do limitador;
  sessão existente não tem o UTM sobrescrito.

De proxy, somando a `src/proxy.test.ts`:

- o cookie aparece na resposta do host raiz em `/` e em `/assinar`
- o cookie **não** aparece em host de tenant
- cookie já presente na requisição não é reescrito
- o host raiz continua **não** chamando `prisma.tenant.findUnique`
- `/api/funil/evento` sai do pipeline de tenant

De integração, no banco local:

- o cron resume e apaga na mesma transação, e rodar duas vezes não duplica
- o cron fecha como `PERDIDO` só o lead de checkout ainda aberto

## Fora de escopo

- **Telas, gráficos e coortes.** Spec B. Esta entrega termina com o dado
  correto e nenhuma tela nova.
- **`PRIMEIRO_PEDIDO` e saúde do cliente.** Spec C. Nasce em código
  tenant-scoped, tem outro dono e outro ciclo de vida.
- **CAC, gasto de anúncio, LTV.** Dependem de um dado que hoje não entra em
  lugar nenhum do sistema, o quanto foi gasto em tráfego.
- **Unificação retroativa dos leads duplicados de landing e checkout.** A sessão
  resolve daqui para a frente. O passado fica como está, e uma limpeza
  retroativa por telefone e e-mail é um projeto próprio, com risco próprio.

## Riscos

**A landing depende de JavaScript para contar visita.** Quem bloqueia script não
é contado, e o denominador sai um pouco menor que a realidade. A alternativa
seria contar no proxy, que custaria um write por requisição em todos os hosts.
Aceito conscientemente.

**Cookie bloqueado quebra a costura, não a venda.** Sem `muno_s`, o checkout
funciona igual e a sessão simplesmente não existe. Aparece como lead sem origem,
que é informação, e não como erro.

**O resumo é uma perda de resolução deliberada.** Passados 90 dias, não dá mais
para reconstruir a jornada de uma pessoa específica, só a contagem por dia, tipo
e origem. É a troca escolhida contra uma tabela que só cresce.
