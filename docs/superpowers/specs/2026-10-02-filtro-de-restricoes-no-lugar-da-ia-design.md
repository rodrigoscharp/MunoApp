# Filtro de restrições alimentares no lugar da IA

## Problema

O cardápio tem um card "Muno, o assistente" (`MenuAIAssistant.tsx`) que chama a
Groq (`llama-3.3-70b-versatile`) a cada mensagem, mandando até 150 itens do
cardápio no prompt (`/api/ai/menu-recommendation`). Dois problemas:

1. **Custo variável.** É a única rota do app cujo custo marginal não é CPU, e por
   isso ela já precisou de limitador por IP. O valor por conversa é pequeno, mas
   não é zero, e cresce com o número de restaurantes.
2. **O modelo adivinha onde não pode.** Para "sem glúten" e "sem lactose" a IA
   lê o nome e a descrição do prato e infere. Se errar, quem paga é um cliente
   alérgico. Ninguém no restaurante declarou aquilo.

Metade do card nem usa a IA para valer: "Sou vegano", "Sem glúten" e "Sem
lactose" são restrições objetivas. A outra metade ("Pouca fome", "Faminto",
"Algo leve") é subjetiva e não tem dado nenhum por trás.

## Decisão

O dono do restaurante **declara** os fatos sobre a receita ao cadastrar o item.
O cardápio mostra três botões que filtram por esses fatos. Sem chat, sem texto
livre, sem modelo.

```
admin salva item  ->  contém glúten? contém lactose? é vegano?
                              |
cliente clica [Sem lactose]   v
        -> itens com containsLactose === false  ->  cards no próprio box
```

O card continua no mesmo lugar da página, com o mesmo `ItemCard` e o mesmo
"+ Adicionar". Muda o que alimenta a resposta: dado declarado, não inferência.

## Dados

`MenuItem` ganha três colunas **anuláveis**, sem valor padrão:

```prisma
containsGluten  Boolean?
containsLactose Boolean?
isVegan         Boolean?
```

**`null` significa "o restaurante não informou", e isso é o coração da
decisão.** Um `Boolean @default(false)` faria todo item já cadastrado aparecer
como "sem lactose" e "sem glúten" no dia do deploy, sem que ninguém tenha
verificado nada. Para quem tem intolerância, é o pior erro possível: o app
afirma uma coisa que o restaurante nunca disse. A regra do filtro é de uma linha
e vale para os três botões: **só passa quem tem declaração explícita.**

| Botão       | Item passa quando          |
| ----------- | -------------------------- |
| Vegano      | `isVegan === true`         |
| Sem glúten  | `containsGluten === false` |
| Sem lactose | `containsLactose === false`|

Botões ativos se combinam por E: Sem glúten + Sem lactose mostra só o item que
atende os dois.

A migração só adiciona três colunas anuláveis em tabela que já existe. Por isso:

* não pede RLS novo (a tabela já tem) nem mexe em `tenant-scoped-models.ts`;
* é retrocompatível: o código antigo ignora as colunas, então o deploy da
  Vercel, que migra antes de publicar, não abre janela de quebra;
* nenhum backfill. Todo item existente nasce `null` e continua fora do filtro até
  o dono preencher.

Os nomes seguem o schema, que é em inglês (`name`, `description`, `available`).

## Admin

O `MenuItemModal` ganha uma seção **"Informações para o cliente"** com três
perguntas:

* Contém glúten?
* Contém lactose?
* É vegano?

Cada uma é um grupo de rádio **Sim / Não / Não informado**, e o padrão é "Não
informado", inclusive ao editar um item antigo. Um checkbox não serviria: ele só
tem dois estados e empurraria o dono a responder "não" por omissão.

Uma linha de ajuda abaixo da seção: "Marque 'Não' só se tiver certeza,
incluindo contaminação cruzada na cozinha. Quem tem alergia vai confiar nisso."

O formulário trabalha com o tri-estado como string e converte para
`boolean | null` ao montar o payload. A conversão nos dois sentidos fica em
`src/lib/restricoes.ts`, com teste, porque é exatamente o ponto onde "não
informado" pode virar `false` sem ninguém notar.

Na API:

* `POST /api/menu` (`menuItemSchema`) e `PUT /api/menu/[id]` (`updateSchema`)
  aceitam os três campos como `z.boolean().nullable().optional()`.
* No PUT, ausente deixa como está e `null` limpa. O modal sempre manda os três,
  então o dono consegue voltar um item para "não informado".
* `MenuManager.tsx` e o tipo local `MenuItem` do modal ganham os campos.
  `adm/menu/page.tsx` já repassa as colunas inteiras.

## Cardápio

`MenuAIAssistant.tsx` é substituído por `FiltroDeRestricoes.tsx`. Sai o chat, o
campo de texto, o histórico, o `fetch` e o ícone de IA. Entram três botões que
alternam entre ativo e inativo.

* **Onde aparecem os itens.** Dentro do próprio card, abaixo dos botões,
  reaproveitando o `ItemCard`. A lista de categorias do cardápio não é tocada.
  A lista do box tem altura máxima com rolagem, para um filtro que casa 40
  itens não empurrar a página.
* **Os três botões aparecem sempre** que o cardápio tem itens, mesmo que o
  restaurante ainda não tenha declarado nada. Revisto em 02/10/2026, depois de
  o card sumir por inteiro nos restaurantes sem declaração (a regra original
  era "botão sem dado não aparece"): os botões são o atalho de quem tem
  restrição, e escondê-los até alguém preencher o formulário faz o filtro
  parecer inexistente. Só o cardápio vazio não renderiza o card.
* **Filtro que ninguém declarou.** Clicar num botão sem nenhum item declarado
  mostra "Este restaurante ainda não informou quais itens atendem a esse
  filtro.", e não "nenhum prato serve": dizer o contrário afirmaria algo que
  ninguém verificou. Vale também numa combinação em que algum dos filtros ligados
  não tem declaração.
* **Combinação sem resultado.** Quando todos os filtros ligados têm item
  declarado mas nenhum item atende a todos: "Nenhum item atende a todos os
  filtros marcados." com a opção de limpar.
* **Aviso fixo** sempre que houver filtro ativo: "Informado pelo restaurante. Em
  caso de alergia, confirme com a equipe antes de pedir."
* **Dispensar.** O card continua podendo ser fechado. A chave do `localStorage`
  muda de `muno-ai-dismissed` para `muno-filtro-dispensado`: quem fechou o
  assistente de IA não fechou este, e uma chave nova evita herdar esse estado.
  Leitura e escrita seguem em `try/catch`, como no resto do app.
* **Textos.** Título "Filtrar por restrição" e subtítulo "Veja só o que serve
  para você". Nenhuma menção a IA ou assistente.

A lógica de filtro é uma função pura em `src/lib/restricoes.ts`, que recebe os
itens e os filtros ativos e devolve os itens. Fica fora do componente para ser
testável sem renderizar nada, e é a única definição de "o que passa".

O cardápio é servido por `unstable_cache` com `revalidate: 60`, então uma
edição do dono aparece em até um minuto. Já é assim para preço e nome, e não
muda.

## Remoção

* `src/app/api/ai/menu-recommendation/` (rota e teste);
* a entrada `POST /api/ai/menu-recommendation` em
  `src/security/politica-de-acesso.ts`. A matriz de acesso quebra se a política
  listar rota que não existe, então os dois saem juntos;
* `GROQ_API_KEY` do `.env.example` e da tabela de variáveis do `README.md`, e
  `ai/` da árvore de rotas do mesmo arquivo;
* a menção a `MenuAIAssistant` no comentário de `src/lib/pwa/dispensa.ts`;
* `GROQ_API_KEY` no projeto da Vercel. Isso é manual e fica com o dono do
  projeto, depois que o deploy estiver no ar. Não faz parte do código.

## Landing

A landing hoje vende o que deixa de existir, em três lugares de
`public/vendas/index.html`:

* a frase "cardápio digital com IA integrada" (linha 361);
* o card "EXCLUSIVO MUNO / Assistente de IA" (linhas 365 a 405);
* a linha "IA de recomendação de pratos" da tabela comparativa (linha 638).

O que existe agora é um filtro de restrições alimentares declarado pelo
restaurante. O texto novo é proposto no PR e **aprovado antes de publicar**, e
segue a regra da casa: sem travessão, e sem "IA". `plans.test.ts` lê esse
arquivo para conferir preços e precisa continuar verde.

Anunciar IA que não existe seria publicidade enganosa. O deploy do código e o da
landing não podem sair separados por muito tempo.

## Testes

* `restricoes.test.ts`: `null` nunca passa em nenhum filtro; `false` passa em
  sem glúten e sem lactose e não em vegano; `true` em `isVegan` passa só em
  vegano; combinação é E; conversão tri-estado e `boolean | null` nos dois
  sentidos, com "não informado" voltando `null` e nunca `false`.
* `menu/route.test.ts` e `menu/[id]/route.test.ts`: aceitam `true`, `false` e
  `null`; recusam string; PUT sem os campos não os altera.
* `MenuItemModal.test.tsx`: abre com "Não informado" em item antigo; salvar sem
  mexer manda `null`; marcar "Não" manda `false`.
* `FiltroDeRestricoes.test.tsx`: mostra os três botões mesmo sem nenhum item
  declarado e não renderiza só com o cardápio vazio; alternar filtra; filtro sem
  declaração e combinação sem resultado têm mensagens distintas; o aviso aparece
  com filtro ativo.
* A suíte de segurança (`src/security/`) passa sem a rota de IA.

## Fora de escopo

* **Vegano não implica "sem lactose".** Seria razoável derivar, mas é a mesma
  lógica de adivinhar que estamos tirando. Se o dono quer o item no filtro de
  lactose, ele marca. Pode virar um segundo passo se os donos reclamarem.
* **Nível de fome, "algo leve" e texto livre.** Saem junto com a IA. Não há dado
  para filtrar. Um campo de porte seria um trabalho à parte.
* **IA para preencher os campos no admin.** Sugerir "contém glúten" lendo a
  descrição repete o problema de adivinhar, só que no momento de cadastrar.
* **Mais restrições** (amendoim, ovo, crustáceos, sem açúcar). A estrutura
  comporta, mas cada uma é uma coluna e uma decisão de produto.
* **Filtrar a lista inteira do cardápio** em vez de listar dentro do card.
