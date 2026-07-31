# Login obrigatório no checkout de delivery e retirada

Data: 2026-07-31

## Problema

Hoje o pedido de delivery e retirada pode ser fechado sem conta. `POST /api/orders`
grava `userId: session?.user.id ?? null` (`src/app/api/orders/route.ts:126`), então o
pedido nasce órfão e o cliente só tem acesso a ele pelo link `/track/{orderId}` que
recebe no redirect.

Esse link não é salvo em lugar nenhum — não há cookie, localStorage, e-mail nem SMS.
Fechou a aba, o pedido some. `/pedidos` exige login e filtra por `userId`
(`src/app/(client)/pedidos/page.tsx:34-40`), então nem logar depois faz o pedido
reaparecer: não existe nenhum mecanismo de vínculo retroativo no código.

Quatro consequências:

1. **Pedido irrecuperável.** Perdeu o link, perdeu o pedido.
2. **Chat é um beco sem saída.** `OrderTracker.tsx:443` mostra "Chat com o restaurante"
   para todo mundo. Clicando, `chat/page.tsx:53` manda pro login e, na volta,
   `order.userId (null) !== session.user.id` derruba em `redirect("/pedidos")`
   (`chat/page.tsx:67-68`) — uma lista vazia. O cliente perde o pedido de vista por
   ter tentado falar com o restaurante.
3. **Sem notificações.** `useOrderNotifications.ts` depende de `session.user.id`.
4. **IDOR.** `GET /api/orders/[id]` (`src/app/api/orders/[id]/route.ts:17-29`) devolve o
   pedido inteiro — `customerPhone`, `deliveryAddress`, `user { name, email }` — para
   qualquer requisição que tenha o id, sem nenhuma checagem.

## Princípio

Um pedido de delivery ou retirada sempre tem dono. O acesso a um pedido é decidido pela
presença do dono, não pelo canal nem pela data:

> Pedido **com** dono → só o dono ou um ADMIN acessa.
> Pedido **sem** dono → acesso livre por link direto.

Essa regra única cobre os três casos de uma vez, sem condicional espalhada pelo código:
pedido novo de delivery/retirada tem dono e fica protegido; pedido de mesa nunca tem dono
e continua público; pedido legado órfão não tem dono, continua acessível como sempre foi,
e a janela fecha sozinha conforme os pedidos antigos envelhecem.

## Escopo

**Dentro:** delivery (`DELIVERY`) e retirada (`PICKUP`) passam a exigir conta no checkout.

**Fora:** o fluxo de mesa (`DINE_IN`, via QR code em `/mesa/[token]/…`) continua
inteiramente sem login. O cliente está fisicamente no restaurante, o pedido chega à
cozinha vinculado à mesa, e não há acompanhamento remoto a proteger.

O fluxo de mesa já é separado: `mesa/[token]/checkout/page.tsx:93` redireciona para
`/mesa/{token}/pedido/{orderId}`, tela própria que não usa o `OrderTracker`. Logo
`/track/[orderId]` atende exclusivamente delivery e retirada, e `GET /api/orders/[id]`
tem um único consumidor em todo o código — a página de mesa.

## As duas camadas

O gate é aplicado em duas camadas com papéis distintos. Não são alternativas.

**Camada de UX — `src/proxy.ts`.** Bloqueia a rota antes de renderizar qualquer coisa,
seguindo o padrão que já existe ali para `/adm` e `/dashboard` (`proxy.ts:66-83`). O bloco
entra logo depois do guard de `isKitchenRoute`, para que o tratamento de `tenantMismatch`
(`proxy.ts:50-54`) já tenha rodado:

```ts
const isCheckoutRoute = nextUrl.pathname === "/checkout";

if (isCheckoutRoute && !session) {
  return NextResponse.redirect(
    new URL("/login?callbackUrl=/checkout", nextUrl)
  );
}
```

A comparação exata (`===`) já exclui `/mesa/{token}/checkout` — sem regex.

**Camada de verdade — `POST /api/orders`.** É o que efetivamente impede um pedido órfão,
inclusive contra requisição direta que não passa pela UI:

- `deliveryType !== "DINE_IN"` sem sessão → **401**.
- `customerPhone` obrigatório quando `deliveryType === "DELIVERY"`. Hoje é opcional no
  schema e no form, o que permite fechar uma entrega sem nenhum canal de contato.

Uma versão anterior desta spec também exigia que `DINE_IN` viesse com um `tableId`
existente. Removido por decisão do dono do projeto: o fluxo de mesa não deve ser tocado, e
o checkout de mesa não bloqueia o submit quando `tableInfo` é `null`
(`mesa/[token]/checkout/page.tsx:82`, com o fallback engolindo erro em `.catch(() => {})`),
então validar no servidor faria um cliente de rede ruim ver "Mesa inválida" sem saída.

Continua possível criar um pedido `DINE_IN` sem sessão — exatamente como hoje, sem
regressão. Isso **não** abre caminho para delivery sem login: qualquer `deliveryType`
diferente de `DINE_IN` cai no 401, e um `DINE_IN` forjado sai com `deliveryAddress: null` e
`deliveryFee: 0` (`api/orders/route.ts:121-123`), logo não vira entrega em endereço nenhum.

`userId: session?.user.id ?? null` permanece como está — passa a resultar em `null`
apenas para `DINE_IN`.

## Predicado de acesso

Função pura em `src/lib/order-access.ts`, consumida pela API e pela página de track:

```ts
export function canViewOrder(
  order: { userId: string | null },
  viewer: { id: string; role: Role } | null
): boolean {
  if (order.userId === null) return true;      // mesa e pedidos legados
  if (!viewer) return false;
  return viewer.role === "ADMIN" || viewer.id === order.userId;
}
```

`GET /api/orders/[id]` retorna **404** quando o predicado falha, não 403. Um 403
confirmaria que aquele pedido existe, que é metade do valor de um IDOR.

`/track/[orderId]` aplica o mesmo predicado e chama `notFound()`.

## Fluxo resultante

Delivery e retirada:

1. Carrinho → "Finalizar pedido" → `/checkout`
2. Proxy vê que não há sessão → `/login?callbackUrl=/checkout`
3. Login ou cadastro — `LoginForm.tsx:23,50` e `register/page.tsx:30,67` já honram
   `callbackUrl`, e o registro já faz `signIn` automático. Sem mudança necessária.
4. Volta ao `/checkout` **com o carrinho intacto**: `useCart` usa `zustand/persist`, que
   guarda em localStorage e sobrevive ao redirect. Sem mudança necessária.
5. Pedido criado com `userId` → `/track/{id}` protegido, `/pedidos` lista, chat funciona,
   sino notifica.

Mesa: inalterado.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/lib/order-access.ts` | **Novo.** `canViewOrder`, função pura. |
| `src/proxy.ts` | Guard de `/checkout`, junto dos guards existentes. |
| `src/app/api/orders/route.ts` (POST) | 401 sem sessão fora de DINE_IN; DINE_IN exige `tableId` válido no tenant; `customerPhone` obrigatório em DELIVERY. |
| `src/app/api/orders/[id]/route.ts` (GET) | Aplica `canViewOrder`; 404 quando falha. |
| `src/app/(client)/track/[orderId]/page.tsx` | Aplica `canViewOrder` → `notFound()`. Remove o `LoginPromptBanner`. |
| `src/components/tracking/LoginPromptBanner.tsx` | **Deletado.** |
| `src/components/tracking/OrderTracker.tsx` | Nova prop `canChat`; esconde o link de chat (linha 443) quando o pedido não tem dono. |
| `src/app/(client)/checkout/page.tsx` | Prefill do nome via `useSession`; telefone obrigatório em DELIVERY; trata 401 de sessão expirada. |

### Por que o `LoginPromptBanner` sai

Ele só renderiza para visitante deslogado (`track/[orderId]/page.tsx:34`). Depois desta
mudança, a única situação em que isso ainda acontece é um pedido legado órfão — e aí
logar não vincula pedido nenhum, porque não existe mecanismo de claim. O banner passaria
a prometer, em 100% dos casos em que aparece, algo que não entrega. Ele também já promete
hoje "atualizações ao vivo e mapa do entregador" que o visitante deslogado já tem, já que
o realtime é por `tenantId`/`orderId` e não depende de sessão.

## Casos de borda

- **Sessão expira entre o login e o "Confirmar".** O POST devolve 401 e o checkout hoje
  mostraria o erro genérico de `page.tsx:107`. Passa a exibir "sua sessão expirou" e
  redirecionar para o login com `callbackUrl`, preservando o carrinho.
- **Sessão de outro tenant.** `proxy.ts:50-54` já a trata como deslogada, então cai no
  gate corretamente. Sem mudança.
- **ADMIN abrindo o track de um cliente.** Permitido pelo predicado — é o comportamento
  desejado para suporte.
- **Pedido legado órfão.** Continua acessível por link, sem chat e sem banner.

## Verificação

Instalar Vitest e testar apenas `canViewOrder`, que é o coração da mudança. Casos:

| Pedido | Visitante | Esperado |
|---|---|---|
| `userId: null` | anônimo | permite |
| `userId: null` | qualquer usuário | permite |
| `userId: "u1"` | anônimo | nega |
| `userId: "u1"` | `u1` (CUSTOMER) | permite |
| `userId: "u1"` | `u2` (CUSTOMER) | nega |
| `userId: "u1"` | `u2` (ADMIN) | permite |

Poucos testes, alto valor, sem montar infra de integração. Testes das rotas de API ficam
fora — exigiriam mockar next-auth e Prisma, o que é um projeto à parte.

## Fora de escopo

Dois problemas reais encontrados durante a análise, independentes deste design, que valem
issues próprias:

- `deliveryFee` vem do cliente e é gravado sem conferência
  (`api/orders/route.ts:102` — `clientFee ?? 0`), permitindo adulterar o valor do frete.
- `/api/payments/mercadopago` aceita qualquer `orderId` sem checar dono.
