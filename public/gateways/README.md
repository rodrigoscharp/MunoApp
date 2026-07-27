# Logos dos gateways

Solte aqui o logo de cada gateway e ele aparece automaticamente na tela
`/adm/pagamentos`. Nenhuma alteração de código é necessária — o componente
`GatewayMark` procura por este caminho e, se o arquivo não existir, mostra um
quadrado com a cor da marca e as iniciais.

## Nomes dos arquivos

O nome precisa bater exatamente com o `id` do adapter, incluindo o underscore:

| Gateway       | Arquivo               | Situação   |
| ------------- | --------------------- | ---------- |
| Mercado Pago  | `mercado_pago.svg`    | presente   |
| Asaas         | `asaas.svg`           | **falta**  |
| Stripe        | `stripe.svg`          | presente   |
| Abacate Pay   | `abacate_pay.svg`     | **falta**  |
| PagBank       | `pagbank.svg`         | presente   |

Gateway novo segue a mesma regra: `<meta.id>.svg`.

## Formato

Use a versão **símbolo** da marca, não o logotipo horizontal com o nome
escrito ao lado. A marca é renderizada num quadrado (44px na grade, 36px no
cabeçalho do painel) com `object-contain` — um logotipo deitado encolhe até
virar um risco ilegível nesse espaço.

**O símbolo precisa ser branco e monocromático.** Ele é desenhado por cima do
quadrado na cor da marca, então um SVG colorido ou preto some no fundo. Se o
arquivo que você tem é colorido, troque o `fill` para `#ffffff`.

SVG é o formato preferido por escalar sem perda. PNG funciona, mas troque a
extensão no `GatewayMark` se for usar.

## Procedência dos arquivos atuais

`mercado_pago.svg`, `stripe.svg` e `pagbank.svg` vieram do
[Simple Icons](https://simpleicons.org) (`cdn.simpleicons.org/<slug>/white`),
que distribui os arquivos sob CC0. O `pagbank.svg` é o símbolo do PagSeguro,
marca anterior do PagBank — é o que o Simple Icons publica.

Asaas e Abacate Pay não existem lá e seguem mostrando as iniciais. Para
completar, baixe o símbolo do kit oficial de cada um.

O CC0 cobre o arquivo, não a marca: elas seguem pertencendo às respectivas
empresas. O uso aqui é para identificar a integração, o que é uso nominativo
— mas confira as diretrizes de marca de cada uma antes de publicar.
