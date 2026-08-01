# Console da plataforma: identidade visual e painéis

Data: 2026-08-01

## Problema

A área de plataforma funciona, mas não tem forma. O shell tem 28 linhas: um cabeçalho com o
e-mail do operador e nada mais — sem navegação, sem sair da conta, sem noção de onde se está.
A home é o funil de leads, então o dia começa numa lista em vez de num resumo.

E não há resposta para "como a Muno está indo". Os dados existem espalhados (leads, tenants,
pedidos) mas ninguém os junta. Faturamento não existe em lugar nenhum: `Tenant.plano` é uma
string com default `"free"` e não há valor associado a cliente algum.

## Direção visual

### O salão veste terracota; a sala de máquinas veste verde

O app do cliente é creme (`#F5F2EE`) com terracota (`#D4612A`) — cor de apetite. O console do
operador é o outro lado da porta e usa o **verde da marca** (`--color-forest: #2B5240`), que já
existe em `src/app/globals.css` e está praticamente sem uso.

Isso não é troca de paleta: é usar o segundo polo de um sistema que já existia. O ganho prático
é que você nunca confunde em qual lado está, e a terracota fica reservada para **uma coisa só**
dentro do console — a ação.

```
--console-verde:    #2B5240   /* menu lateral, fundo do login */
--console-verde-esc:#1E3D2F   /* estados ativos e hover no menu */
--console-fundo:    #F2F3F5   /* superfície de trabalho, neutro FRIO */
--console-cartao:   #FFFFFF
--console-linha:    #E3E5E9   /* fios de 1px */
--console-tinta:    #17191C   /* texto */
--brand:            #D4612A   /* SÓ ação: botão primário, item ativo do menu */
```

O fundo é neutro frio de propósito. Creme aqui puxaria o console para o mesmo lugar do app do
cliente e apagaria a distinção que a cor existe para criar.

### Todo número em monoespaçada

`Geist Mono` entra ao lado da `Geist Sans` que já está no projeto, com numerais tabulares
(`font-variant-numeric: tabular-nums`). Toda contagem, valor, data e slug usa a mono.

Isso é a personalidade da tela, não enfeite: números que alinham em coluna fazem a interface ler
como painel de instrumento em vez de página de marketing. Rótulos de métrica em caixa alta com
`tracking` largo, na mono, pequenos.

### A assinatura: a pauta vem antes dos números

A visão geral **não abre com uma grade de estatísticas**. Abre com uma pauta — o que precisa da
sua atenção, derivado do dado.

A razão é honesta: com 0 leads e 1 cliente, uma grade de números é decoração. Uma pauta é útil no
banco vazio ("Nenhum lead ainda. Cadastre o primeiro.") e continua útil com 40 leads ("3 parados
há mais de 5 dias"). Os números vêm depois dela, como referência.

**Regras da pauta.** A primeira e a última são exclusivas: se não há lead nenhum, só a primeira
aparece; se nenhuma das do meio bater, só a última. As três do meio se acumulam, nessa ordem.

| Condição | Linha |
|---|---|
| Nenhum lead existe | "Nenhum lead cadastrado ainda." + ação **Cadastrar o primeiro** |
| Leads `FECHADO` com `tenantId` nulo | "N fechados sem cliente criado" — venda fechada que não virou restaurante |
| Leads abertos com `updatedAt` > 5 dias | "N leads sem contato há mais de 5 dias" |
| Leads em `NEGOCIACAO` | "N em negociação" |
| Nenhuma das anteriores | "Tudo em dia." |

A segunda regra existe por causa de um invariante decidido na spec anterior: `tenantId` só é
preenchido pela rota de conversão, então `FECHADO` sem tenant significa exatamente "fechei e não
criei o cliente". A pauta transforma esse invariante em aviso.

## Estrutura

Menu lateral fixo, três destinos:

| Rota | Conteúdo |
|---|---|
| `/` | Visão geral: pauta + os três blocos de números |
| `/leads` | O funil que hoje mora na home, sem mudanças de comportamento |
| `/clientes` | Restaurantes: quando entraram, pedidos, mensalidade, status |

O rodapé do menu traz o operador e **Sair** — hoje `signOutPlatform` está exportado e nunca é
usado, então não existe forma de deslogar.

**No celular o menu não é lateral.** Abaixo de `md` ele vira uma barra fixa no rodapé com os três
destinos, e o "Sair" sobe para o topo da tela. Um menu lateral fixo come metade da largura útil de
um telefone — e o celular é onde um lead vai ser atualizado logo depois de uma ligação, que é o
cenário que já guiou as decisões do funil.

A home passa a ser a visão geral, então o funil muda de `/` para `/leads`. O link de volta em
`/leads/[id]` acompanha.

## Os números

Três blocos, cada um com uma métrica grande e uma linha de apoio:

**Vendas** — leads abertos (fora de `FECHADO` e `PERDIDO`); apoio: entraram este mês.
**Clientes** — tenants com `status = "active"`; apoio: pedidos somados de todos.
**Receita** — MRR: soma de `valorMensal` dos tenants ativos; apoio: quantos têm plano definido.

Todos saem de `count`/`aggregate` do Prisma via `prismaUnscoped`, sem model novo além dos campos
abaixo.

## Schema

`Tenant` ganha dois campos:

```prisma
  valorMensal   Decimal?  @db.Decimal(10, 2)
  diaVencimento Int?
```

Opcionais de propósito: o tenant `default` e qualquer cliente antigo continuam válidos sem eles,
e a migration segue puramente aditiva.

O formulário de conversão de lead ganha um campo de mensalidade (opcional). A página de clientes
permite editar mensalidade e dia de vencimento de um cliente existente, via `PATCH`.

**O que isto é:** receita **contratada** — quanto os clientes ativos somam por mês.
**O que isto não é:** quem pagou e quem está devendo. Registrar recebimento, conciliar e cobrar
inadimplente é um módulo próprio, fora daqui.

## Login

A mesma linguagem: verde ocupando a tela, cartão claro centralizado, terracota só no botão. Deixa
de ser uma tela de login genérica e passa a ser a porta deste console.

## Segurança

Nada muda no modelo: todas as telas e rotas novas continuam usando `authPlatform` e
`prismaUnscoped`, com 401 antes de ler dado. `/clientes` lê `Tenant` — que nunca foi tenant-scoped
— e o `PATCH` de mensalidade aceita **apenas** `valorMensal` e `diaVencimento`, nunca `slug`,
`status` ou qualquer campo que mude identidade do cliente.

## Testes

Vitest, seguindo a convenção do projeto: só lógica pura.

- **Regras da pauta** — a função que, dada uma lista de leads, devolve as linhas. Cada regra da
  tabela acima, mais o caso vazio e o "tudo em dia".
- **Cálculo do MRR** — soma de `Decimal`, ignorando tenants inativos e os sem `valorMensal`.

Telas e rotas ficam fora, como no resto do projeto.

## Fora de escopo

- **Gráficos e séries temporais.** Com 0 leads e 1 cliente, uma linha do tempo é uma reta. Quando
  houver histórico, os dados já estarão lá para desenhá-la.
- **Controle de pagamento recebido e inadimplência** — ver acima.
- **Detalhe de cliente** (drill-down por restaurante). A lista basta enquanto forem poucos.
- **Filtros e busca no funil.** Registrado que o rewrite do proxy descarta query string; quando
  filtros entrarem, isso precisa ser resolvido junto.
