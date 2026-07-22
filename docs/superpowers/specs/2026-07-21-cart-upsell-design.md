# Cart Upsell — Design Spec

**Data:** 2026-07-21
**Status:** Aprovado, aguardando plano de implementação

## Objetivo

Ao abrir o carrinho, se o cliente já tem itens de algumas categorias do cardápio mas não de outras (ex: tem prato principal mas não bebida), mostrar até 3 sugestões de item — um da categoria ausente — incentivando a adicionar mais ao pedido. A sugestão não bloqueia nem intercepta o fluxo de finalizar pedido; é uma seção sempre visível dentro do próprio carrinho.

## Escopo

**Incluído:**
- Componente novo `CartUpsell` usado em `CartDrawer` (gaveta lateral) e na página `/cart`.
- Lógica: categoria "ausente" = nenhum item dessa categoria está no carrinho. Sugestão = item disponível mais barato dessa categoria.
- Botão de adicionar direto ao carrinho (quantidade 1, sem observações, sem abrir modal de customização).
- Botão de dispensar ("x") por sugestão, válido durante a sessão atual do carrinho.

**Fora de escopo (por decisão explícita):**
- `MesaCartDrawer` / checkout de mesa (QR code) — não recebe a feature nesta primeira versão.
- Qualquer chamada a IA/LLM para escolher a sugestão.
- Novo campo no schema Prisma (ex: `isUpsellCategory`) — a lógica é genérica, baseada em categorias ausentes do cardápio existente.
- Guardar `categoryId` no `CartItem` / mudar `useCart` — a categoria é resolvida a partir de um fetch de `/api/menu`, não do estado do carrinho.
- Reabrir sugestões dispensadas dentro da mesma sessão (só voltam ao recarregar a página / limpar o carrinho).

## Arquitetura

### Novo componente: `src/components/cart/CartUpsell.tsx`

Componente client (`"use client"`), sem props — lê tudo de hooks/fetch:

1. `items = useCart((s) => s.items)` e `addItem = useCart((s) => s.addItem)`.
2. `useEffect` no mount: `fetch("/api/menu")` → `CategoryWithItems[]` (endpoint já existente, escopado por tenant via header `x-tenant-id` setado pelo proxy). Guarda resultado em estado local. Falha no fetch → captura erro, mantém estado `null`, componente não renderiza nada (falha silenciosa).
3. Estado local `dismissed: Set<string>` (ids de `MenuItem` dispensados nesta sessão).
4. Cálculo de sugestões (recomputado a cada render, não precisa de memo pesado dado o volume de dados):
   - `cartIds = new Set(items.map(i => i.id))`
   - Filtra categorias com `items.length > 0` e nenhum item presente em `cartIds`.
   - A API já retorna categorias ordenadas por `position asc` e itens filtrados por `available: true` — não precisa reordenar nem refiltrar disponibilidade.
   - Para cada categoria ausente, seleciona o item de menor `price` (`reduce`).
   - Remove os que estão em `dismissed`.
   - Limita a 3 (`.slice(0, 3)`).
5. Se `items.length === 0`, ou não há categorias carregadas, ou a lista de sugestões é vazia → retorna `null` (não renderiza nada).
6. Cada card de sugestão mostra nome, preço, botão "+" (chama `addItem({ id, name, price, imageUrl }, 1)`) e botão "x" (adiciona o id ao `dismissed`).

### Pontos de integração

- **`CartDrawer.tsx`**: `<CartUpsell />` inserido entre a lista de itens (`<div className="flex-1 overflow-y-auto ...">`) e o rodapé (`{items.length > 0 && (...)}` com Total/"Fazer Pedido"). Como o conteúdo do drawer fica sempre montado no DOM (só a transform CSS anima abrir/fechar — ver `Header.tsx` que mantém `<CartDrawer open={cartOpen} .../>` sempre na árvore), o estado `dismissed` sobrevive a abrir/fechar o drawer repetidamente na mesma visita à página.
- **`app/(client)/cart/page.tsx`**: `<CartUpsell />` inserido entre o card de lista de itens e o card de Total/ações. Aqui o estado `dismissed` reseta se o usuário navegar para fora da página e voltar (comportamento aceito — página remonta ao navegar).

### Visual

Segue o padrão manual de UI já usado no projeto (sem shadcn/Radix — confirmado que não há essa dependência instalada):
- Título pequeno acima dos cards: "Que tal adicionar?" (`text-xs font-semibold text-neutral-400 uppercase tracking-wide`).
- Cada sugestão: card `bg-neutral-50 rounded-xl px-3 py-2`, nome + preço à esquerda, botão circular "+" (`bg-brand`, ícone `Plus` do lucide-react) e botão "x" discreto (`text-neutral-300`, ícone `X` do lucide-react) à direita.

## Casos de borda

| Caso | Comportamento |
|---|---|
| Carrinho vazio | `CartUpsell` retorna `null` |
| Cardápio com só 1 categoria | Nenhuma categoria "ausente" possível → retorna `null` |
| Categoria sem itens disponíveis | Ignorada (já filtrado pela API) |
| Fetch de `/api/menu` falha | Falha silenciosa, sem crash, sem retry automático |
| Cliente dispensa todas as sugestões | Seção some até reload/nova sessão |
| Cliente adiciona item de uma categoria antes ausente | Na próxima renderização essa categoria deixa de aparecer como sugestão (já tem item dela no carrinho) |

## Testes

- Unit/lógica: função pura de "calcular sugestões dado `items` do carrinho + categorias do cardápio" deve ser extraída e testável isoladamente (ex: `getUpsellSuggestions(cartItems, categories, dismissedIds)`), cobrindo: nenhuma categoria ausente, múltiplas categorias ausentes (ordem e limite de 3), categoria sem itens disponíveis, item já dispensado.
- Manual: abrir carrinho com itens de 1 categoria só, ver sugestão aparecer; adicionar sugestão, ver ela sumir da lista (categoria deixa de estar ausente); dispensar uma sugestão, reabrir o drawer, confirmar que continua dispensada; recarregar a página, confirmar que ela volta a aparecer.
