# Logos dos gateways

Solte aqui o logo de cada gateway e ele aparece automaticamente na tela
`/adm/pagamentos`. Nenhuma alteração de código é necessária — o componente
`GatewayMark` procura por este caminho e, se o arquivo não existir, mostra um
quadrado com a cor da marca e as iniciais.

## Nomes dos arquivos

O nome precisa bater exatamente com o `id` do adapter, incluindo o underscore:

| Gateway       | Arquivo               |
| ------------- | --------------------- |
| Mercado Pago  | `mercado_pago.svg`    |
| Asaas         | `asaas.svg`           |
| Stripe        | `stripe.svg`          |
| Abacate Pay   | `abacate_pay.svg`     |

Gateway novo segue a mesma regra: `<meta.id>.svg`.

## Formato

Use a versão **símbolo** da marca, não o logotipo horizontal com o nome
escrito ao lado. A marca é renderizada num quadrado (44px na grade, 36px no
cabeçalho do painel) com `object-contain` — um logotipo deitado encolhe até
virar um risco ilegível nesse espaço.

SVG é o formato preferido por escalar sem perda. PNG funciona, mas troque a
extensão no `GatewayMark` se for usar.

Os arquivos são assets de marca de terceiros: baixe cada um do kit oficial da
respectiva empresa e confira os termos de uso antes de publicar.
