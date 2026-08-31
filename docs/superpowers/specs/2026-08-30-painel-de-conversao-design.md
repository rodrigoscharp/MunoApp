# O painel que usa o que a instrumentação captura

Data: 2026-08-30

## Problema

A instrumentação do funil entrou no ar hoje
(`2026-08-30-instrumentacao-do-funil-design.md`) e a tela `/conversao` nasceu
junto, com taxa de conversão, coorte de entrada, a escada da visita ao
restaurante no ar, e receita por plano.

Ela responde bem uma pergunta e deixa a original sem resposta.

**O que a tela chama de "origem" é `Lead.origem`**, ou seja, `landing`,
`checkout` ou `manual`: por qual porta a pessoa entrou. Dá para ver que o
checkout converte mais que a landing, o que é verdadeiro e pouco acionável,
porque quem entra pelo checkout já decidiu comprar.

A pergunta que motivou o projeto era outra: **qual anúncio traz cliente**. O
dado para respondê-la está sendo gravado desde hoje em `SessaoFunil`
(`utmSource`, `utmMedium`, `utmCampaign`, `referrer`, `dispositivo`) e **não
aparece em tela nenhuma**.

Não é o único. O inventário do que se grava e não se vê:

| Dado | Onde vive | Pergunta que ele responde |
|---|---|---|
| `utmSource`, `utmMedium`, `utmCampaign` | `SessaoFunil` | qual campanha se paga |
| `referrer` | `SessaoFunil` | veio do Instagram, do Google, de indicação |
| `dispositivo` | `SessaoFunil` | celular contra desktop |
| `CHECKOUT_PASSO.detalhe` | `EventoFunil` | em qual campo a venda morre |
| `createdAt` dos eventos | `EventoFunil`, `ResumoDiario` | a tendência, não só o acumulado |
| `estagioDoLead` | `src/lib/funil/estagio.ts` | nada: é código morto, com teste e sem consumidor |

E há uma pergunta que nenhum dado atual responde: **a receita cresce ou só troca
de dono**. `Assinatura` sabe quanto cada cliente paga hoje e não sabe quando
alguém parou de pagar.

## Decisão

`/conversao` fica mais funda, em vez de nascer uma tela nova ao lado.

Uma tela nova criaria a pergunta "em qual das duas eu olho", e o valor deste
painel está justamente em cruzar dois números com o olho: a campanha que traz
volume ao lado do passo do checkout que derruba esse volume. Separá-los em
páginas transformaria a comparação em navegação.

**Sem abas.** Aba esconde metade dos números pelo mesmo motivo que a página
separada esconde, só que dentro da mesma URL. A rolagem é o preço, e a ordem dos
blocos é o que a torna suportável: cada um responde uma pergunta e passa a bola
para o seguinte.

```
conversão                                          [30 dias ▾]
──────────────────────────────────────────────────────────────
taxa lead→cliente │ vaza em │ MRR líquido │ tempo até fechar
──────────────────────────────────────────────────────────────
aquisição por campanha        (utm, referrer, dispositivo)
──────────────────────────────────────────────────────────────
onde a venda vaza             │  a escada
──────────────────────────────────────────────────────────────
coorte de entrada             │  receita: novo, perdido, líquido
──────────────────────────────────────────────────────────────
tendência semanal do funil
```

De onde vem, onde perde, quem fecha, quanto rende, está crescendo.

## A janela de período

Um seletor governa a tela inteira, na URL: `?periodo=30d`, `90d`, `mes`,
`tudo`, com `30d` como padrão.

Sem janela, "aquisição por campanha desde sempre" soma o anúncio de abril com o
de ontem e não decide nada. Na URL, e não em estado de cliente, pelo mesmo
motivo do filtro de estágio em `/leads`: um recorte vira um link que se manda
para alguém.

A janela vale para todos os blocos **menos dois**, e a exceção precisa estar
escrita na tela:

* **Coorte de entrada** tem o próprio eixo de tempo, que é o mês de entrada do
  lead. Aplicar a janela nela seria filtrar o eixo pelo eixo.
* **MRR** é um retrato de agora, não um acumulado. O que a janela recorta ali é
  o *movimento* (novo, perdido, líquido), nunca o saldo.

## Os blocos

### Aquisição por campanha

Uma tabela, uma linha por combinação de origem, com quatro colunas: sessões,
leads, clientes e receita mensal somada.

A chave da linha é `utmSource / utmCampaign`, com `utmMedium` visível quando
existe. Quem chegou sem UTM cai em `direto`, e quem chegou com referrer e sem
UTM aparece pelo host do referrer, porque "veio do Instagram sem parâmetro" é
informação diferente de "digitou o endereço".

Duas quebras auxiliares, no mesmo bloco e menores: **referrer** e
**dispositivo**. Dispositivo importa porque a landing é otimizada para celular e
o checkout é um formulário longo: se a conversão do celular for muito menor que
a do desktop, o problema é de formulário, não de anúncio.

**A ligação entre sessão e cliente passa por `Lead.sessaoId` e
`Inscricao.sessaoId`.** Uma sessão conta como cliente quando o lead dela tem
`tenantId`. Sessão sem lead conta só como sessão, que é o denominador.

### Onde a venda vaza

O que `CHECKOUT_PASSO` grava em `detalhe`: `endereco`, `documento`,
`pagamento`. Três degraus internos entre "iniciou o checkout" e "pagou", com a
passagem de um para o outro e a perda absoluta, no mesmo formato que a escada já
usa.

É o bloco que responde "o que consertar primeiro no produto". Se 90% confirmam
o endereço e 60% passam do documento, o problema é o campo de CPF/CNPJ, e isso
é uma tarde de trabalho, não uma campanha nova.

### A escada e a coorte

Ficam como estão, com um ajuste: passam a respeitar a janela de período, exceto
a coorte, pela razão acima.

### Receita: novo, perdido, líquido

Quatro números do período: **MRR novo** (assinaturas criadas na janela),
**MRR perdido** (assinaturas canceladas na janela), **líquido** (a diferença) e
**churn** (perdido sobre o MRR do início da janela).

É o bloco que separa crescer de trocar de cliente. Dez clientes novos e nove
cancelamentos é um mês que parece ótimo em qualquer tela que só conte clientes.

### Tendência semanal do funil

Uma série por semana com visitas, checkouts criados e pagamentos, lida de
`EventoFunil` dentro dos 90 dias e de `ResumoDiario` fora deles. É o bloco que
mostra direção, e não posição: 12 clientes é um número; 12 clientes com a
entrada caindo há três semanas é um aviso.

## As três decisões que custam algo

### O detalhe de campanha tem horizonte de 90 dias

`ResumoDiario` guarda `(dia, tipo, origem)`, e `origem` é o `utmSource`
normalizado. **Meio, campanha, referrer e dispositivo morrem no expurgo.**

Aceitamos isso, com o aviso escrito no bloco. A alternativa é alargar a chave do
resumo para incluir meio e campanha, o que multiplica as linhas dele pela
cardinalidade das campanhas e pede migração. Decisão de campanha mais velha que
90 dias raramente muda o que se faz hoje, e a série por `utmSource` continua
sobrevivendo para sempre.

### Churn pede uma coluna nova

Não existe registro de **quando** uma assinatura foi cancelada. `updatedAt`
serviria e mentiria: ele muda a cada edição de mensalidade, então uma assinatura
cancelada em junho e reajustada em agosto contaria como churn de agosto. Um
número aproximado que não se anuncia aproximado é pior que número nenhum.

Entra `Assinatura.canceladaEm DateTime?`, com migração e RLS já existentes na
tabela. Um único lugar do código cancela e reativa,
`src/app/api/platform/clientes/[id]/route.ts`: ali `canceladaEm` é preenchida no
cancelamento e **zerada na reativação**, senão um cliente que voltou continua
contando como perdido para sempre.

As assinaturas canceladas antes desta migração ficam com `canceladaEm` nula, e o
cálculo de churn as ignora em vez de chutar uma data. O bloco diz quantas ficaram
de fora quando houver alguma.

### Tempo entre degraus fica de fora

"Quanto demora da visita ao pagamento" é bonito e quase inútil no volume atual:
com quatro pagamentos, a mediana é ruído com aparência de fato. Fica fora, e
volta quando houver volume. O tile "tempo até fechar", que já existe e mede
lead até restaurante sobre dado antigo, permanece.

## Onde o código mora

Nenhuma conta em `page.tsx`. Três libs puras e testadas, no padrão de
`src/lib/platform-conversao.ts`:

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/funil/aquisicao.ts` | agrupar sessões por campanha, referrer e dispositivo, e cruzar com lead e cliente |
| `src/lib/funil/vazamento.ts` | os três passos do checkout, a passagem e a perda entre eles |
| `src/lib/platform-receita.ts` | MRR novo, perdido, líquido e churn na janela |
| `src/lib/platform-periodo.ts` | traduzir `?periodo=` em um intervalo, e o rótulo da janela |

`src/lib/platform-conversao.ts` ganha a janela como parâmetro nas funções que
passam a respeitá-la, sem mudar a assinatura das que não passam.

E o código morto morre: `estagioDoLead` passa a ser exibido na ficha do lead de
checkout (`/leads/[id]`), que é o consumidor que ele nunca teve. Sem isso, uma
função testada e correta segue sem servir a ninguém.

## Estados vazios

Aquisição, vazamento e tendência **nascem vazios** e só enchem com tráfego
posterior ao deploy da instrumentação. Cada um diz isso com todas as letras,
como a escada já faz, senão a tela parece quebrada exatamente no dia em que ela
estreia.

O estado vazio não é um traço nem um zero: é uma frase que explica por que está
vazio e o que faz encher.

## Testes

Puros, sem banco, um arquivo por lib:

* `aquisicao.test.ts`: agrupamento por campanha; sessão sem UTM caindo em
  `direto`; sessão com referrer e sem UTM aparecendo pelo host; sessão sem lead
  contando no denominador e não no numerador; ordenação por volume.
* `vazamento.test.ts`: passagem entre os três passos; passo ausente aparecendo
  zerado em vez de sumir; divisão por zero quando o passo anterior está vazio.
* `platform-receita.test.ts`: novo e perdido dentro e fora da janela; churn com
  MRR inicial zero devolvendo `null` e não zero; assinatura sem `canceladaEm`
  ficando de fora da conta de perdido.
* `platform-periodo.test.ts`: cada valor de `?periodo=`; valor inválido caindo
  no padrão em vez de quebrar a tela.

De rota, em `/leads/[id]`: o estágio derivado aparece para lead de checkout.

## Fora de escopo

* **Ativação e saúde do cliente** (primeiro pedido, cliente que parou de vender,
  onboarding concluído). É a spec C, e ela nasce em código tenant-scoped.
* **CAC e LTV.** Dependem do gasto com tráfego, que não entra em lugar nenhum do
  sistema hoje.
* **Exportação e envio por e-mail.** O painel é para olhar, não para distribuir.
* **Qualquer mudança no que é gravado.** Esta spec é de leitura: nada aqui muda
  a instrumentação, e o único write novo é `canceladaEm`.

## Riscos

**A tela fica longa.** Seis blocos numa página. A ordem narrativa é a mitigação,
e a alternativa (abas) foi recusada acima com razão explícita. Se na prática ela
ficar insuportável, o corte certo é mover a tendência para a visão geral, que já
é a tela de acompanhamento.

**A consulta cresce.** Tudo em um `Promise.all` de agregações, sem carregar
linha crua de evento, com `groupBy` no banco e teto de linhas nos agrupamentos
de campanha. Se a página passar a pesar, o primeiro suspeito é o cruzamento de
sessão com lead, que é o único que junta duas tabelas grandes.

**Os números novos podem contradizer os antigos e estarem certos.** "Origem" no
bloco de aquisição é UTM; "origem" no bloco que já existe é `Lead.origem`. São
duas coisas diferentes com o mesmo nome, e a tela precisa rotulá-las de forma
que ninguém as some: o bloco novo fala em **campanha**, o antigo em **porta de
entrada**.
