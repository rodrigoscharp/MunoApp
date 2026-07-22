# Cart Upsell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show up to 3 "que tal adicionar?" suggestions inside the cart (drawer + `/cart` page) for menu categories the customer hasn't ordered from yet, letting them add the cheapest available item with one click.

**Architecture:** A pure function `getUpsellSuggestions` computes suggestions from cart item ids + the tenant's menu categories (fetched from the existing `/api/menu` endpoint). A single client component `CartUpsell` owns the fetch, dismiss state, and rendering, and is dropped into both `CartDrawer.tsx` and `app/(client)/cart/page.tsx` — no other files need to change.

**Tech Stack:** Next.js App Router, React 19, Zustand (`useCart`), Tailwind CSS, lucide-react icons, TypeScript. No new dependencies.

## Global Constraints

- No AI/LLM calls for suggestion selection (spec: rule-based only, no Groq/AI usage).
- No Prisma schema changes — no new `isUpsellCategory` field or similar (spec: generic "missing category" logic only).
- No changes to `CartItem` type or `useCart.addItem` signature — category is resolved via a separate `/api/menu` fetch, not stored in the cart (spec decision).
- Scope is `CartDrawer.tsx` and `app/(client)/cart/page.tsx` only. `MesaCartDrawer` / table checkout is explicitly out of scope for this version.
- Suggested item = cheapest available item in a category with zero items currently in the cart.
- Max 3 suggestions shown, ordered by the category's existing `position` field (already the order `/api/menu` returns).
- Add-to-cart button adds quantity 1 directly, no modal, no notes.
- Dismiss ("x") hides a suggestion only for the current mount lifetime of the component (no persistence) — acceptable to reset on full page navigation.
- No new test framework (no jest/vitest). Pure-logic verification uses a disposable `tsx` + `node:assert` script that is deleted after it passes — this repo has no existing test suite or convention to extend.

---

### Task 1: Pure upsell-suggestion logic

**Files:**
- Create: `src/lib/upsell.ts`
- Verify with (temporary, deleted at the end of this task): `scripts/_verify-upsell.ts`

**Interfaces:**
- Produces: `export interface UpsellSuggestion { id: string; name: string; price: number; imageUrl: string | null }` and `export function getUpsellSuggestions(cartItemIds: string[], categories: CategoryWithItems[], dismissedIds?: Set<string>, limit?: number): UpsellSuggestion[]`. `CategoryWithItems` is imported from `@/types` (already defined in `src/types/index.ts:49-55`, includes `items: MenuItemWithCategory[]` each with `available`/`price`/`imageUrl`).
- Consumes: nothing from other tasks — this is the foundational pure function.

- [ ] **Step 1: Write the verification script (acts as the failing test)**

Create `scripts/_verify-upsell.ts`:

```ts
import assert from "node:assert";
import { getUpsellSuggestions } from "../src/lib/upsell";
import { CategoryWithItems } from "../src/types";

function makeCategory(
  id: string,
  position: number,
  items: { id: string; price: number; available?: boolean }[]
): CategoryWithItems {
  return {
    id,
    name: id,
    slug: id,
    position,
    items: items.map((it) => ({
      id: it.id,
      name: it.id,
      description: null,
      price: it.price,
      imageUrl: null,
      available: it.available ?? true,
      categoryId: id,
      category: { id, name: id, slug: id },
    })),
  };
}

// Case 1: every category already represented in cart -> no suggestions
{
  const categories = [makeCategory("main", 0, [{ id: "burger", price: 20 }])];
  const result = getUpsellSuggestions(["burger"], categories);
  assert.deepStrictEqual(result, [], "case1: expected no suggestions");
}

// Case 2: one missing category -> suggests its cheapest item
{
  const categories = [
    makeCategory("main", 0, [{ id: "burger", price: 20 }]),
    makeCategory("drinks", 1, [
      { id: "soda", price: 6 },
      { id: "juice", price: 8 },
    ]),
  ];
  const result = getUpsellSuggestions(["burger"], categories);
  assert.strictEqual(result.length, 1, "case2: expected 1 suggestion");
  assert.strictEqual(result[0].id, "soda", "case2: expected cheapest item (soda)");
}

// Case 3: multiple missing categories -> capped at 3, in category position order
{
  const categories = [
    makeCategory("drinks", 0, [{ id: "soda", price: 6 }]),
    makeCategory("dessert", 1, [{ id: "pudding", price: 10 }]),
    makeCategory("sides", 2, [{ id: "fries", price: 12 }]),
    makeCategory("extra", 3, [{ id: "sauce", price: 3 }]),
  ];
  const result = getUpsellSuggestions([], categories);
  assert.strictEqual(result.length, 3, "case3: expected limit of 3");
  assert.deepStrictEqual(
    result.map((r) => r.id),
    ["soda", "pudding", "fries"],
    "case3: expected first 3 categories by position"
  );
}

// Case 4: category with zero items is ignored, not suggested as empty
{
  const categories = [makeCategory("empty", 0, [])];
  const result = getUpsellSuggestions([], categories);
  assert.deepStrictEqual(result, [], "case4: expected empty category to be skipped");
}

// Case 5: dismissed item id is excluded even though its category is still missing
{
  const categories = [makeCategory("drinks", 0, [{ id: "soda", price: 6 }])];
  const result = getUpsellSuggestions([], categories, new Set(["soda"]));
  assert.deepStrictEqual(result, [], "case5: expected dismissed item to be excluded");
}

console.log("All upsell logic checks passed");
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx tsx scripts/_verify-upsell.ts`
Expected: fails to run — `src/lib/upsell.ts` does not exist yet, so the import throws (e.g. `Cannot find module '../src/lib/upsell'`).

- [ ] **Step 3: Implement the minimal logic**

Create `src/lib/upsell.ts`:

```ts
import { CategoryWithItems } from "@/types";

export interface UpsellSuggestion {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
}

export function getUpsellSuggestions(
  cartItemIds: string[],
  categories: CategoryWithItems[],
  dismissedIds: Set<string> = new Set(),
  limit = 3
): UpsellSuggestion[] {
  const cartIdSet = new Set(cartItemIds);
  const suggestions: UpsellSuggestion[] = [];

  for (const category of categories) {
    if (category.items.length === 0) continue;

    const hasItemInCart = category.items.some((item) => cartIdSet.has(item.id));
    if (hasItemInCart) continue;

    const cheapest = category.items.reduce((min, item) =>
      item.price < min.price ? item : min
    );

    if (dismissedIds.has(cheapest.id)) continue;

    suggestions.push({
      id: cheapest.id,
      name: cheapest.name,
      price: cheapest.price,
      imageUrl: cheapest.imageUrl,
    });

    if (suggestions.length >= limit) break;
  }

  return suggestions;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx tsx scripts/_verify-upsell.ts`
Expected: prints `All upsell logic checks passed` and exits with code 0.

- [ ] **Step 5: Delete the verification script and commit only the implementation**

```bash
rm scripts/_verify-upsell.ts
git add src/lib/upsell.ts
git commit -m "$(cat <<'EOF'
Adiciona lógica de sugestão de upsell por categoria ausente

Função pura que recebe os ids do carrinho e as categorias do cardápio
e retorna até 3 itens (o mais barato de cada categoria sem nenhum item
no carrinho), verificada localmente com um script tsx descartável.
EOF
)"
```

---

### Task 2: `CartUpsell` component + wire into `CartDrawer`

**Files:**
- Create: `src/components/cart/CartUpsell.tsx`
- Modify: `src/components/cart/CartDrawer.tsx:44-96` (insert component between the items list and the footer)

**Interfaces:**
- Consumes: `getUpsellSuggestions(cartItemIds, categories, dismissedIds, limit?)` and `UpsellSuggestion` from `@/lib/upsell` (Task 1); `useCart` store (`items`, `addItem`) from `@/hooks/useCart`; `formatCurrency` from `@/lib/utils`; `CategoryWithItems` from `@/types`.
- Produces: `export function CartUpsell()` — a self-contained component with no props, safe to render anywhere the cart is shown.

- [ ] **Step 1: Create the component**

Create `src/components/cart/CartUpsell.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/utils";
import { getUpsellSuggestions } from "@/lib/upsell";
import { CategoryWithItems } from "@/types";

export function CartUpsell() {
  const items = useCart((s) => s.items);
  const addItem = useCart((s) => s.addItem);
  const [categories, setCategories] = useState<CategoryWithItems[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/menu")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: CategoryWithItems[]) => setCategories(data))
      .catch(() => setCategories(null));
  }, []);

  if (!categories || items.length === 0) return null;

  const suggestions = getUpsellSuggestions(
    items.map((i) => i.id),
    categories,
    dismissed
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="px-6 py-3 space-y-2">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
        Que tal adicionar?
      </p>
      {suggestions.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 bg-neutral-50 rounded-xl px-3 py-2"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {item.name}
            </p>
            <p className="text-xs text-neutral-500">{formatCurrency(item.price)}</p>
          </div>
          <button
            onClick={() =>
              addItem(
                { id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl },
                1
              )
            }
            className="w-8 h-8 rounded-full bg-brand hover:bg-brand-dark text-white flex items-center justify-center transition shrink-0"
            aria-label={`Adicionar ${item.name}`}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
            className="text-neutral-300 hover:text-neutral-500 transition shrink-0"
            aria-label="Dispensar sugestão"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `CartDrawer.tsx`**

In `src/components/cart/CartDrawer.tsx`, add the import at the top (after the existing imports, line 6):

```tsx
import { CartUpsell } from "@/components/cart/CartUpsell";
```

Then insert `<CartUpsell />` between the closing tag of the items list and the `{/* Footer */}` comment (around line 96-98):

```tsx
          )}
        </div>

        <CartUpsell />

        {/* Footer */}
        {items.length > 0 && (
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new type errors introduced (pre-existing errors, if any, are unrelated — only check that `CartUpsell.tsx` and the `CartDrawer.tsx` edit don't add errors).

- [ ] **Step 4: Manual smoke test in the browser**

Run: `npm run dev`, open the app, add one item from a single category to the cart, open the cart drawer (header cart icon). Confirm: a "Que tal adicionar?" section appears above the total with up to 3 cards from other categories; clicking "+" adds the item and the drawer's item list updates; clicking "x" removes that suggestion without closing the drawer; closing and reopening the drawer keeps the dismissed suggestion hidden.

- [ ] **Step 5: Commit**

```bash
git add src/components/cart/CartUpsell.tsx src/components/cart/CartDrawer.tsx
git commit -m "$(cat <<'EOF'
Adiciona sugestão de upsell na gaveta do carrinho

CartUpsell busca o cardápio e mostra até 3 itens de categorias ainda
ausentes do pedido, com botão de adicionar direto (qtd 1) e de
dispensar por sessão.
EOF
)"
```

---

### Task 3: Wire `CartUpsell` into the `/cart` page

**Files:**
- Modify: `src/app/(client)/cart/page.tsx:1-102`

**Interfaces:**
- Consumes: `CartUpsell` component from Task 2 (`@/components/cart/CartUpsell`), no props.

- [ ] **Step 1: Add the import**

In `src/app/(client)/cart/page.tsx`, add after the existing imports (line 6):

```tsx
import { CartUpsell } from "@/components/cart/CartUpsell";
```

- [ ] **Step 2: Insert the component between the items card and the total card**

Insert `<CartUpsell />` between the closing `</div>` of the items list (line 75, `mb-4` div) and the `{/* Total + actions */}` comment (line 77):

```tsx
      </div>

      <CartUpsell />

      {/* Total + actions */}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Manual smoke test in the browser**

Run: `npm run dev` (if not already running), add one item from a single category, navigate to `/cart`. Confirm the same "Que tal adicionar?" section renders between the item list and the total, with working add/dismiss buttons.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(client)/cart/page.tsx"
git commit -m "Adiciona sugestão de upsell na página /cart"
```

---

### Task 4: End-to-end edge-case verification

**Files:** none (manual QA pass only — no code changes)

**Interfaces:** none.

- [ ] **Step 1: Empty cart**

With the cart empty, open the drawer and visit `/cart`. Confirm no "Que tal adicionar?" section appears in either place (component returns `null`).

- [ ] **Step 2: Single-category menu (or cart already covers every category)**

Add one item from every category that has items in the tenant's menu. Open the drawer/`/cart`. Confirm no suggestions render (spec: no categories missing → `null`).

- [ ] **Step 3: Multiple missing categories, cap at 3**

Ensure the test tenant's menu has 4+ categories and clear the cart down to one category. Confirm exactly 3 suggestion cards render (not more), matching the first 3 missing categories by `position`.

- [ ] **Step 4: Add-from-suggestion updates the list**

Click "+" on a suggestion. Confirm the item appears in the cart's item list with quantity 1, and on the next render that category's suggestion card disappears (its category is no longer missing).

- [ ] **Step 5: Dismiss persists only for the session**

Click "x" on a suggestion. Confirm it disappears immediately. Close and reopen the cart drawer — confirm it stays dismissed. Reload the page — confirm it reappears (dismiss state is not persisted, per spec).

- [ ] **Step 6: `/api/menu` failure is silent**

Temporarily block or 500 the `/api/menu` request (e.g. via browser devtools network throttling/blocking, or by stopping the dev DB so `withTenant` errors) and confirm the cart still renders and functions normally, just without the upsell section — no crash, no visible error.

- [ ] **Step 7: Confirm `MesaCartDrawer` is untouched**

Open a table (`mesa/[token]`) cart flow and confirm no upsell section appears there — this task intentionally left it out of scope.

No commit for this task — it's verification only. If any step fails, fix the relevant code from Task 2 or 3 and re-run the failed step before moving on.
