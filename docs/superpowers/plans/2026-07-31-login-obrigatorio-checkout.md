# Login obrigatório no checkout — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir conta para fechar pedidos de delivery e retirada, mantendo o fluxo de mesa sem login, e fechar o IDOR que expõe dados pessoais de qualquer pedido a quem tiver o id.

**Architecture:** Duas camadas independentes. O `src/proxy.ts` bloqueia `/checkout` para visitante deslogado (experiência); o `POST /api/orders` recusa com 401 qualquer pedido que não seja `DINE_IN` sem sessão (garantia real, inclusive contra requisição direta). O acesso de leitura a um pedido passa por um predicado puro único, `canViewOrder`, cujo único sinal é a presença do dono — o que cobre pedido novo, pedido de mesa e pedido legado sem condicional espalhada.

**Tech Stack:** Next.js 16 (App Router), NextAuth v5 beta, Prisma 6, Zod, react-hook-form, zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-login-obrigatorio-checkout-design.md`

## Global Constraints

- Este projeto **não é o Next.js do seu treino**. Antes de escrever código de framework, leia o guia relevante em `node_modules/next/dist/docs/` (instrução de `AGENTS.md`).
- O fluxo de mesa (`DINE_IN`, rotas `/mesa/[token]/…`) **não muda em nenhuma tarefa**. Pedido de mesa continua sem login e acessível por link.
- `prisma` (de `@/lib/prisma`) já filtra por tenant automaticamente dentro de `withTenant` — ele mescla `tenantId` no `where` (`src/lib/prisma.ts:55-60`). Nunca adicione `tenantId` manualmente ao usar esse cliente. `prismaUnscoped` é o cliente sem escopo.
- `session.user` tem a forma `{ id: string; role: string; tenantId: string; name?: string | null; email?: string | null }` (`src/types/next-auth.d.ts`). `role` é `string`, não um enum.
- Mensagens de UI e de erro de API em português.
- Não mexer em `deliveryFee` nem em `/api/payments/mercadopago` — são bugs conhecidos, registrados na seção "Fora de escopo" da spec, e não fazem parte deste trabalho.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/order-access.ts` | **Novo.** Predicado puro `canViewOrder`. Sem I/O, sem Prisma, sem NextAuth — por isso testável em milissegundos. | 1 |
| `src/lib/order-access.test.ts` | **Novo.** Testes do predicado. | 1 |
| `vitest.config.mts` | **Novo.** Restringe a varredura a `src/`. | 1 |
| `src/app/api/orders/[id]/route.ts` | Aplica o predicado na leitura; 404 quando nega. | 2 |
| `src/app/api/orders/route.ts` | Gate de criação: 401 fora de DINE_IN, telefone em DELIVERY. | 3 |
| `src/proxy.ts` | Guard de rota do `/checkout`. | 4 |
| `src/app/(client)/track/[orderId]/page.tsx` | Aplica o predicado; deixa de renderizar o banner; passa `canChat`. | 5 |
| `src/components/tracking/LoginPromptBanner.tsx` | **Deletado.** | 5 |
| `src/components/tracking/OrderTracker.tsx` | Nova prop `canChat` controlando o link de chat. | 5 |
| `src/app/(client)/checkout/page.tsx` | Prefill do nome, telefone obrigatório em DELIVERY, tratamento de 401. | 6 |

As tarefas 2 e 5 consomem a tarefa 1. As tarefas 3, 4 e 6 são independentes entre si.

---

### Task 1: Predicado de acesso `canViewOrder` + Vitest

**Files:**
- Create: `src/lib/order-access.ts`
- Create: `src/lib/order-access.test.ts`
- Create: `vitest.config.mts`
- Modify: `package.json` (bloco `scripts`)

**Interfaces:**
- Consumes: nada.
- Produces: `canViewOrder(order: { userId: string | null }, viewer: { id: string; role: string } | null): boolean` — usado pelas Tasks 2 e 5.

**Contexto:** o projeto não tem nenhuma infra de teste hoje. Esta tarefa instala o Vitest e cobre só o predicado. O `vitest.config.mts` **é obrigatório**: sem ele o Vitest varre o repositório inteiro e encontra os worktrees em `.claude/worktrees/`, que têm código próprio e dariam falsos positivos.

- [ ] **Step 1: Instalar o Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Criar o `vitest.config.mts`**

Crie `vitest.config.mts` na raiz:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Restrito a src/ de propósito: a raiz contém worktrees em
    // .claude/worktrees/ com cópias do projeto, que seriam varridas de outra forma.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Adicionar o script de teste**

Em `package.json`, dentro de `"scripts"`, adicione a linha abaixo logo após `"lint": "eslint",`:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Escrever o teste que falha**

Crie `src/lib/order-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canViewOrder } from "./order-access";

const dono = { id: "u1", role: "CUSTOMER" };
const outroCliente = { id: "u2", role: "CUSTOMER" };
const admin = { id: "u3", role: "ADMIN" };

describe("canViewOrder", () => {
  it("libera pedido sem dono para visitante anônimo", () => {
    expect(canViewOrder({ userId: null }, null)).toBe(true);
  });

  it("libera pedido sem dono para qualquer usuário logado", () => {
    expect(canViewOrder({ userId: null }, outroCliente)).toBe(true);
  });

  it("nega pedido com dono para visitante anônimo", () => {
    expect(canViewOrder({ userId: "u1" }, null)).toBe(false);
  });

  it("libera pedido com dono para o próprio dono", () => {
    expect(canViewOrder({ userId: "u1" }, dono)).toBe(true);
  });

  it("nega pedido com dono para outro cliente", () => {
    expect(canViewOrder({ userId: "u1" }, outroCliente)).toBe(false);
  });

  it("libera pedido com dono para ADMIN", () => {
    expect(canViewOrder({ userId: "u1" }, admin)).toBe(true);
  });
});
```

- [ ] **Step 5: Rodar o teste e confirmar que falha**

Run: `npm test`
Expected: FAIL — o Vitest não resolve `./order-access` porque o arquivo ainda não existe.

- [ ] **Step 6: Implementar o predicado**

Crie `src/lib/order-access.ts`:

```ts
/**
 * Decide quem pode ver um pedido.
 *
 * A presença do dono é o único sinal. Pedido de delivery/retirada sempre nasce
 * com dono e fica protegido. Pedido de mesa (DINE_IN) nunca tem dono, e pedidos
 * criados antes do login obrigatório também não têm — ambos seguem acessíveis
 * por link direto, como sempre foram.
 */
export function canViewOrder(
  order: { userId: string | null },
  viewer: { id: string; role: string } | null
): boolean {
  if (order.userId === null) return true;
  if (!viewer) return false;
  return viewer.role === "ADMIN" || viewer.id === order.userId;
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `npm test`
Expected: PASS — 6 testes passando.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/order-access.ts src/lib/order-access.test.ts
git commit -m "Adiciona predicado de acesso a pedido e configura Vitest"
```

---

### Task 2: Fechar o IDOR em `GET /api/orders/[id]`

**Files:**
- Modify: `src/app/api/orders/[id]/route.ts:8-31`

**Interfaces:**
- Consumes: `canViewOrder` da Task 1.
- Produces: nada.

**Contexto:** hoje esse GET não tem checagem nenhuma e devolve `customerPhone`, `deliveryAddress` e `user { name, email }` para qualquer requisição com o id. `auth` já está importado no arquivo (linha 3). O único consumidor deste endpoint em todo o código é a página de mesa `src/app/mesa/[token]/pedido/[orderId]/page.tsx:41`, que lê pedidos `DINE_IN` — pedidos sem dono, que o predicado libera. Por isso essa mudança não quebra nada.

- [ ] **Step 1: Importar o predicado**

Em `src/app/api/orders/[id]/route.ts`, logo após a linha `import { broadcastTenantEvent } from "@/lib/realtime";`, adicione:

```ts
import { canViewOrder } from "@/lib/order-access";
```

- [ ] **Step 2: Buscar a sessão e aplicar o predicado**

Substitua o corpo do callback do `withTenant` no `GET` (linhas 15-30) por:

```ts
  return withTenant(tenantId, async () => {
    const { id } = await params;
    const session = await auth();

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { menuItem: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // 404 em vez de 403 de propósito: um 403 confirmaria que o pedido existe,
    // que é metade do valor de um IDOR.
    if (!order || !canViewOrder(order, session?.user ?? null)) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    return NextResponse.json(order);
  });
```

- [ ] **Step 3: Verificar que compila e passa no lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Verificar o comportamento manualmente**

Suba o servidor com `npm run dev`. Pegue no banco (`npm run db:studio`) o id de um pedido com `userId` preenchido e o id de um pedido de mesa (`userId` nulo). Sem estar logado:

```bash
curl -i http://localhost:3000/api/orders/<ID_COM_DONO>
curl -i http://localhost:3000/api/orders/<ID_DE_MESA>
```

Expected: o primeiro responde `404`; o segundo responde `200` com o pedido.

Se o banco não tiver pedido com dono, crie um logando na aplicação e fechando um pedido de retirada antes de testar.

- [ ] **Step 5: Commit**

Repare que o caminho tem colchetes, que o git interpreta como classe de caracteres em
pathspec — `git add 'src/app/api/orders/[id]/route.ts'` **não** casa com o arquivo. Adicione
o diretório:

```bash
git add src/app/api/orders
git commit -m "Restringe leitura de pedido ao dono ou admin"
```

---

### Task 3: Gate de criação no `POST /api/orders`

**Files:**
- Modify: `src/app/api/orders/route.ts:8-24` (schema) e `:81-113` (início do handler)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

**Contexto:** esta é a camada que de fato impede um pedido órfão de delivery ou retirada — o guard do proxy (Task 4) é só experiência e não protege contra requisição direta. São duas regras.

**O fluxo de mesa não é tocado.** Uma versão anterior deste plano validava que `DINE_IN` viesse com um `tableId` existente. Isso foi removido por decisão do dono do projeto: o checkout de mesa não bloqueia o submit quando `tableInfo` é `null` (`mesa/[token]/checkout/page.tsx:82`, com o fetch de fallback engolindo erro em `.catch(() => {})`), então validar no servidor faria um cliente de rede ruim ver "Mesa inválida" sem saída. Sem a validação, continua possível criar um pedido `DINE_IN` sem sessão — exatamente como hoje, sem regressão. E isso **não** abre caminho para delivery sem login: `deliveryType` diferente de `DINE_IN` cai no 401, e um `DINE_IN` forjado sai com `deliveryAddress: null` e `deliveryFee: 0` (linhas 121-123), então não vira entrega em endereço nenhum.

- [ ] **Step 1: Tornar o telefone obrigatório em DELIVERY no schema**

Em `src/app/api/orders/route.ts`, o `orderSchema` termina hoje em `});` na linha 24. Substitua esse fechamento por um `.refine` encadeado:

```ts
}).refine(
  (data) =>
    data.deliveryType !== "DELIVERY" ||
    (data.customerPhone?.trim().length ?? 0) >= 8,
  { path: ["customerPhone"], message: "Telefone é obrigatório para entrega" }
);
```

- [ ] **Step 2: Adicionar o gate de sessão**

Em `src/app/api/orders/route.ts`, logo após a linha que desestrutura `parsed.data` (linha 90, a que começa com `const { items, paymentMethod, ...`), insira:

```ts
    // Delivery e retirada exigem conta. Mesa (DINE_IN) não: o cliente está no
    // restaurante e o pedido é identificado pela mesa.
    if (deliveryType !== "DINE_IN" && !session) {
      return NextResponse.json(
        { error: "Faça login para finalizar o pedido" },
        { status: 401 }
      );
    }
```

Não adicione nenhuma validação de `tableId` — ver o Contexto acima.

- [ ] **Step 3: Verificar que compila e passa no lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Verificar o comportamento manualmente**

Com `npm run dev` rodando, sem estar logado:

```bash
curl -i -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"menuItemId":"qualquer","quantity":1}],"paymentMethod":"CASH","deliveryType":"PICKUP","customerName":"Teste"}'
```

Expected: `401` com `{"error":"Faça login para finalizar o pedido"}`.

Agora o mesmo com entrega e sem telefone, para conferir o `.refine`:

```bash
curl -i -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"menuItemId":"qualquer","quantity":1}],"paymentMethod":"CASH","deliveryType":"DELIVERY","customerName":"Teste"}'
```

Expected: `400`, com uma issue de validação apontando para `customerPhone`. O 400 vem antes do 401 porque o Zod roda primeiro — isso é esperado.

Por fim, confirme que o fluxo de mesa real continua funcionando: abra `/mesa/<token>/checkout` no navegador com um token válido de mesa (pegue em `npm run db:studio`, model `Table`, campo `token`) e feche um pedido. Deve criar normalmente e redirecionar para a tela de acompanhamento da mesa.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/orders/route.ts
git commit -m "Exige sessão para criar pedido de delivery ou retirada"
```

---

### Task 4: Guard de rota do `/checkout` no proxy

**Files:**
- Modify: `src/proxy.ts:75-83`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

**Contexto:** o `src/proxy.ts` já tem exatamente esse padrão de guard para `/adm` e `/dashboard`. A comparação exata de path (`===`) é o que mantém `/mesa/{token}/checkout` de fora, sem precisar de regex. O bloco vai **depois** do guard de `isKitchenRoute`, para que o tratamento de `tenantMismatch` (linhas 50-54) já tenha rodado — lá, uma sessão de outro tenant já foi redirecionada, então `session` truthy neste ponto significa sessão válida para este tenant.

- [ ] **Step 1: Adicionar o guard**

Em `src/proxy.ts`, entre o fim do bloco `if (isKitchenRoute) { … }` e a linha `return NextResponse.next(forward);`, insira:

```ts
  // Checkout de delivery/retirada exige conta. A comparação exata de path deixa
  // /mesa/{token}/checkout de fora: pedido de mesa não exige login.
  if (nextUrl.pathname === "/checkout" && !session) {
    return NextResponse.redirect(new URL("/login?callbackUrl=/checkout", nextUrl));
  }
```

- [ ] **Step 2: Verificar que compila e passa no lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Verificar o comportamento manualmente**

Com `npm run dev` rodando e **deslogado**, adicione um item ao carrinho e clique em "Finalizar pedido".

Expected: você cai em `/login?callbackUrl=/checkout`. Ao fazer login, volta para `/checkout` **com o carrinho intacto** — o `useCart` usa `zustand/persist` (localStorage), então o conteúdo sobrevive ao redirect sem nenhum código extra.

Depois, ainda deslogado, abra `/mesa/<token>/checkout` diretamente.

Expected: a página abre normalmente, sem redirect.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "Redireciona visitante deslogado do checkout para o login"
```

---

### Task 5: Proteger o track, remover o banner e esconder o chat sem dono

**Files:**
- Modify: `src/app/(client)/track/[orderId]/page.tsx`
- Delete: `src/components/tracking/LoginPromptBanner.tsx`
- Modify: `src/components/tracking/OrderTracker.tsx:34-38` (interface `Props`), `:171` (assinatura), `:444`

**Interfaces:**
- Consumes: `canViewOrder` da Task 1.
- Produces: nada.

**Contexto:** as três mudanças são um único deliverable porque saem da mesma página e de seus filhos diretos. O `OrderTracker` tem **um único consumidor** em todo o código, a própria página de track, então adicionar uma prop obrigatória é seguro.

Sobre a remoção do banner: ele só renderiza para visitante deslogado. Depois desta mudança, a única situação em que isso ainda acontece é um pedido legado órfão — e aí logar não vincula pedido nenhum, porque não existe mecanismo de claim no código. Ele passaria a prometer, em 100% dos casos em que aparece, algo que não entrega.

- [ ] **Step 1: Aplicar o predicado na página de track**

Em `src/app/(client)/track/[orderId]/page.tsx`, remova a linha de import do `LoginPromptBanner` e adicione o import do predicado. O bloco de imports fica:

```tsx
import { prismaUnscoped } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRequestTenantId } from "@/lib/tenant-request";
import { canViewOrder } from "@/lib/order-access";
import { OrderTracker } from "@/components/tracking/OrderTracker";
import { PixPayment } from "@/components/tracking/PixPayment";
```

- [ ] **Step 2: Trocar a checagem de existência pela checagem de acesso**

Na mesma página, substitua a linha `if (!order) notFound();` por:

```tsx
  if (!order || !canViewOrder(order, session?.user ?? null)) notFound();
```

`order.userId` já vem na consulta: o `findUnique` usa `include`, que traz todos os campos escalares do pedido.

- [ ] **Step 3: Remover o banner e passar `canChat`**

Ainda na mesma página, apague o bloco:

```tsx
      {/* Login prompt — exibido apenas para usuários não autenticados */}
      {!isLoggedIn && <LoginPromptBanner orderId={orderId} />}
```

A variável `isLoggedIn` (linha 18) fica sem uso — apague também a linha `const isLoggedIn = !!session?.user;`, senão o lint acusa. **Não** apague `const session = await auth();`, que agora é usado no Step 2.

Em seguida, adicione a prop `canChat` na chamada do `OrderTracker`, logo depois de `tenantId={order.tenantId}`:

```tsx
        canChat={order.userId !== null}
```

- [ ] **Step 4: Deletar o componente do banner**

```bash
git rm src/components/tracking/LoginPromptBanner.tsx
```

- [ ] **Step 5: Aceitar `canChat` no OrderTracker**

Em `src/components/tracking/OrderTracker.tsx`, na interface `Props` (linhas 34-38), adicione o campo:

```ts
interface Props {
  orderId: string;
  initialStatus: OrderStatus;
  order: OrderSummary;
  tenantId: string;
  canChat: boolean;
}
```

E na assinatura da função (linha 171):

```ts
export function OrderTracker({ orderId, initialStatus, order, tenantId, canChat }: Props) {
```

- [ ] **Step 6: Condicionar o link de chat**

No mesmo arquivo, na linha 444, o bloco do chat começa com `{!isCancelled && (`. Troque por:

```tsx
        {!isCancelled && canChat && (
```

Cuidado: há um `{!isCancelled && (` idêntico na linha 292, que é outro bloco. Altere **apenas** o da linha 444, o que fica sob o comentário `{/* ── Chat com o restaurante ── */}`.

- [ ] **Step 7: Verificar que compila e passa no lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros. Se aparecer erro de `isLoggedIn` ou `LoginPromptBanner` não usados, é sobra do Step 3 — remova.

- [ ] **Step 8: Verificar o comportamento manualmente**

Com `npm run dev` rodando:

1. Logado como cliente A, feche um pedido de retirada e confirme que `/track/<id>` abre e mostra o link "Chat com o restaurante".
2. Deslogue (ou use uma janela anônima) e abra o mesmo `/track/<id>`. Expected: página 404, e nenhum banner de login em lugar nenhum.
3. Logue como um cliente B diferente e abra o mesmo `/track/<id>`. Expected: 404.
4. Logue como ADMIN e abra o mesmo `/track/<id>`. Expected: abre normalmente.

- [ ] **Step 9: Commit**

O caminho da página tem colchetes, que o git lê como classe de caracteres em pathspec, e o
`LoginPromptBanner` já foi removido do índice pelo `git rm` do Step 4 — citá-lo de novo daria
erro de pathspec. Use `-A` sobre os diretórios:

```bash
git add -A "src/app/(client)/track" src/components/tracking
git commit -m "Protege acompanhamento de pedido e remove banner de login obsoleto"
```

---

### Task 6: Ajustar o checkout ao usuário logado

**Files:**
- Modify: `src/app/(client)/checkout/page.tsx:1-13` (imports), `:33-52` (hooks), `:67-71` (validação), `:105-108` (erro), `:240-247` (campo telefone)

**Interfaces:**
- Consumes: o 401 devolvido pela Task 3.
- Produces: nada.

**Contexto:** com o gate no lugar, quem chega no checkout está sempre logado. Três ajustes: preencher o nome pela sessão, exigir telefone em DELIVERY (espelhando a regra que a Task 3 impôs no servidor) e tratar o 401 de sessão expirada, que hoje cairia no erro genérico da linha 107 sem explicar nada ao cliente.

O `SessionProvider` já envolve o root layout (`src/app/layout.tsx:32`), então `useSession` funciona aqui sem configuração.

- [ ] **Step 1: Importar `useSession`**

Em `src/app/(client)/checkout/page.tsx`, adicione após a linha `import { useRouter } from "next/navigation";`:

```ts
import { useSession } from "next-auth/react";
```

- [ ] **Step 2: Preencher o nome a partir da sessão**

Dentro do componente, adicione a leitura da sessão logo após `const router = useRouter();`:

```ts
  const { data: session } = useSession();
```

Depois, no `useForm` (linha 43), inclua `setValue` na desestruturação:

```ts
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
```

Adicione `useRef` ao import do React da linha 3 (que hoje traz `useState, useEffect`), e coloque
este efeito logo antes do `useEffect` que busca as zonas de entrega:

```ts
  // A sessão chega de forma assíncrona, então o prefill é feito por efeito em vez
  // de defaultValues. O ref garante que isso rode uma única vez: o next-auth
  // refaz a sessão a cada foco na aba, e sem a trava o efeito sobrescreveria um
  // nome que o cliente tivesse editado.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    if (session?.user?.name) {
      setValue("customerName", session.user.name);
      prefilled.current = true;
    }
  }, [session, setValue]);
```

A trava do `useRef` não é estilo. `SessionProvider` é montado sem props em
`src/app/layout.tsx:32`, então `refetchOnWindowFocus` fica no padrão `true`: a cada volta de
foco na aba o next-auth refaz a sessão e entrega um objeto novo, mesmo com o nome idêntico.
Essa nova referência re-dispara o efeito pela dependência `[session, ...]` e o `setValue`
apaga o que o cliente tiver digitado.

- [ ] **Step 3: Exigir telefone em DELIVERY**

No início de `onSubmit`, o bloco de validação de entrega tem hoje duas checagens. Adicione a terceira, seguindo o mesmo padrão do arquivo:

```ts
    if (deliveryType === "DELIVERY") {
      if (!selectedZone) { setError("Selecione o bairro de entrega."); return; }
      if (!data.rua || !data.numero) { setError("Preencha rua e número."); return; }
      if (!data.customerPhone || data.customerPhone.trim().length < 8) {
        setError("Informe um telefone para contato na entrega.");
        return;
      }
    }
```

- [ ] **Step 4: Tratar a sessão expirada**

Ainda em `onSubmit`, logo antes do `if (!orderRes.ok) {` existente, insira:

```ts
      // Sessão expirou entre o login e a confirmação. O carrinho sobrevive ao
      // redirect (zustand/persist), então basta reautenticar e voltar.
      if (orderRes.status === 401) {
        setError("Sua sessão expirou. Faça login novamente para concluir o pedido.");
        router.push("/login?callbackUrl=/checkout");
        return;
      }
```

- [ ] **Step 5: Ajustar o rótulo do campo de telefone**

O rótulo é fixo em "Telefone (opcional)" (linha 241). Troque por um rótulo que reflita a regra:

```tsx
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Telefone {deliveryType === "DELIVERY" ? "*" : "(opcional)"}
              </label>
```

- [ ] **Step 6: Verificar que compila e passa no lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 7: Verificar o comportamento manualmente**

Com `npm run dev` rodando e logado:

1. Abra `/checkout`. Expected: o campo Nome já vem preenchido com o nome da conta.
2. Escolha "Entrega", selecione bairro, preencha rua e número, deixe o telefone vazio e confirme. Expected: a mensagem "Informe um telefone para contato na entrega." e nenhum pedido criado. O rótulo do campo mostra `Telefone *`.
3. Volte para "Retirar no local". Expected: o rótulo volta para `Telefone (opcional)` e o pedido fecha sem telefone.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(client)/checkout"
git commit -m "Adapta checkout ao usuário logado e exige telefone na entrega"
```

---

## Verificação final

Depois da Task 6, rode o conjunto todo:

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: 6 testes passando, sem erros de tipo, sem erros de lint.

E confirme o fluxo completo no navegador, deslogado, do começo ao fim: adicionar item → carrinho → Finalizar → login → volta ao checkout com o carrinho → fecha pedido de retirada → cai em `/track/{id}` → o pedido aparece em `/pedidos` → o chat abre sem redirecionar para lugar nenhum.
