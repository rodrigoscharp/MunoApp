# Redesign do upsell no carrinho — carrossel com foto

Data: 2026-07-27
Escopo: `src/components/cart/CartUpsell.tsx` e seus dois pontos de uso.

## Problema

O bloco de sugestões entregue em `192e5a2` funciona, mas é visualmente fraco: linhas de
texto cinza sobre `bg-neutral-50`, sem imagem. O produto sugerido não tem apelo nenhum —
num app de comida, a foto é o que vende.

O `imageUrl` já era carregado em `UpsellSuggestion` (`src/lib/upsell.ts`), apenas não era
usado na UI.

## Decisão

Carrossel horizontal de mini-cards, padrão consagrado em apps de delivery. A foto passa a
ser o elemento dominante do card.

### Card (`w-32`, ~128px)

- Foto `aspect-square` via `next/image` com `fill` + `sizes="128px"` + `object-cover`.
- Sem foto: mesmo ícone SVG de fallback já usado em `ProductCard.tsx`, para não criar um
  segundo padrão de estado vazio.
- Botão `+` circular sobreposto no canto inferior direito da foto, `bg-brand` com sombra e
  `active:scale-90` — mesma linguagem do botão do `ProductCard`.
- Nome em `text-xs` com `line-clamp-2` e altura fixa (`h-8`), para que o preço de todos os
  cards caia na mesma linha independentemente do tamanho do nome.
- Preço em `text-sm font-bold text-brand`.

### Trilho

`flex gap-3 overflow-x-auto` com `snap-x` e scrollbar oculta. O terceiro card aparecendo
parcialmente é a própria affordance de arrasto — sem seta nem gradiente, que exigiriam
saber se o conteúdo de fato transborda.

## Mudanças de comportamento

1. **Removido o `✕` de dispensar por item.** No formato de card ele polui, e a lista já se
   auto-ajusta: ao adicionar, a categoria passa a ter item no carrinho e a sugestão sai
   pela regra existente em `getUpsellSuggestions`. O estado `dismissed` deixa de existir no
   componente. O parâmetro `dismissedIds` continua em `src/lib/upsell.ts` com default vazio.
2. **Adicionar segue em um toque** (1 unidade, sem `AddToCartModal`). Um modal no meio do
   upsell mata a conversão.

## Alinhamento nos dois contextos

O componente cravava `px-6`, o que na página `/cart` (container `px-4`) deixava o bloco
desalinhado dos cards vizinhos. Passa a aceitar `className` opcional:

- `CartDrawer`: default `px-6 py-4`, igual ao resto da gaveta.
- `/cart`: `mb-4` sem padding horizontal, alinhando o carrossel com a borda dos cards
  brancos acima e abaixo.

## Fora de escopo

- Não dispara `triggerCartFly` a partir do upsell: dentro da gaveta o ícone do carrinho
  está coberto, a partícula voaria para um alvo invisível.
- Nenhuma mudança na regra de sugestão (`src/lib/upsell.ts`).
