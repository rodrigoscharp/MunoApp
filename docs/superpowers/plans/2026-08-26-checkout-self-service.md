# Checkout self-service — o caminho da receita

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente escolhe o plano na landing, paga, e recebe por e-mail a Muno dele funcionando — sem ninguém da plataforma tocar em nada.

**Architecture:** O Asaas manda na recorrência e a `Cobranca` local espelha, então régua, proxy e CRM seguem sem saber que existe gateway. Um model `Inscricao` reserva o slug antes do pagamento e é o que torna o webhook idempotente. O provisionamento reaproveita `provisionTenant()` inteiro — não existe caminho novo de criação de tenant.

**Tech Stack:** Next.js 16 (App Router, webpack), React 19, Prisma 6 + Postgres, NextAuth v5, Zod, Vitest, Resend, Asaas.

**Spec:** `docs/superpowers/specs/2026-08-26-checkout-self-service-design.md`

## A decisão que dispensa mexer nos headers de segurança

**O cartão é digitado no domínio do Asaas, não no nosso.** As rotas criam a
cobrança e redirecionam o cliente para a `invoiceUrl` que o Asaas devolve.

Isso resolve de uma vez as duas armadilhas que a spec listou em
`next.config.js`: `Permissions-Policy: payment=()` desliga a Payment Request API
e `X-Frame-Options: DENY` impede embutir checkout de terceiro em iframe — as
duas só doeriam se tokenizássemos o cartão numa página nossa. **Nenhum header de
segurança é afrouxado neste plano.** Se alguma task parecer pedir isso, a task
está errada.

De quebra, número de cartão nunca toca nosso servidor nem nossos logs.

**Ponto a confirmar com a chave de sandbox:** se `POST /subscriptions` devolve a
`invoiceUrl` da primeira cobrança direto, ou se é preciso buscar
`GET /subscriptions/{id}/payments` para obtê-la. A Task 9 trata os dois casos.

## Global Constraints

- **Preços, em centavos inteiros:** `MEMBRO` mensal `11999`, anual `131989`; `MEMBRO_MESA_QR` mensal `14999`, anual `164989`.
- **Mensal aceita só cartão.** Anual aceita cartão ou PIX.
- **Toda tabela nova precisa de RLS**, tenha `tenantId` ou não. Sem policy é o correto para tabela de plataforma: nega tudo para `anon`, e a aplicação passa porque conecta como `postgres` (`BYPASSRLS`).
- **O documento do pagador não é persistido.** Vai do checkout direto ao Asaas; guardamos só `asaasCustomerId`.
- **Nenhuma linha do caminho do dinheiro sem teste antes.** TDD é obrigatório neste plano.
- **Migrações:** `npm run db:migrate` (passa por `guard-local-db.js`). Nunca `prisma migrate` direto.
- **Rodar a suíte inteira** (`npm test`) antes de cada commit que toque `src/proxy.ts` ou o cron: é por onde passa toda requisição do produto.
- Comentários e mensagens de commit em **português**, explicando o *porquê*, no tom do restante do repositório.

---

### Task 1: Preços novos em `PRECOS` e na landing

O teste de drift criado no Projeto A acopla os dois de propósito: mudar um sem o outro derruba o build. Por isso esta task muda os dois juntos.

**Files:**
- Modify: `src/lib/plans.ts`
- Modify: `public/vendas/index.html` (4 ocorrências de `R$ 99,99`)
- Test: `src/lib/plans.test.ts`

**Interfaces:**
- Consumes: `PRECOS`, `formatarBRL` (já existem).
- Produces: `PRECOS[plano].mensalCentavos` com os valores novos.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/lib/plans.test.ts`, dentro do describe de drift:

```ts
it("cobra os preços de tabela de 2026-08", () => {
  expect(PRECOS.MEMBRO.mensalCentavos).toBe(11999);
  expect(PRECOS.MEMBRO_MESA_QR.mensalCentavos).toBe(14999);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/plans.test.ts`
Expected: FAIL — `expected 9999 to be 11999`.

- [ ] **Step 3: Atualizar `PRECOS`**

```ts
export const PRECOS: Record<PlanoTenant, { mensalCentavos: number }> = {
  MEMBRO: { mensalCentavos: 11999 },
  MEMBRO_MESA_QR: { mensalCentavos: 14999 },
};
```

- [ ] **Step 4: Rodar e ver o teste de drift falhar agora**

Run: `npx vitest run src/lib/plans.test.ts`
Expected: FAIL em "nenhum preço da página é desconhecido do código" — a página ainda diz `99,99`. **Este é o teste fazendo o trabalho dele.**

- [ ] **Step 5: Atualizar a landing**

Trocar as 4 ocorrências de `R$ 99,99` por `R$ 119,99` em `public/vendas/index.html` (linhas ~79, ~503, ~683, ~780). A linha 683 é a `<option>` do select do formulário; manter o resto do texto.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/plans.test.ts`
Expected: PASS, todos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/plans.ts src/lib/plans.test.ts public/vendas/index.html
git commit -m "Sobe a mensalidade para 119,99 e 149,99"
```

---

### Task 2: Ciclo anual em `PRECOS`, com dois cards e toggle na landing

**Files:**
- Modify: `src/lib/plans.ts`
- Modify: `public/vendas/index.html` (seção `#planos`, linhas ~484-530)
- Modify: `public/vendas/js/main.js` (toggle)
- Test: `src/lib/plans.test.ts`

**Interfaces:**
- Produces: `PRECOS[plano].anualCentavos`, `type Ciclo = "MENSAL" | "ANUAL"`, `precoDoCiclo(plano, ciclo): number`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe("precoDoCiclo", () => {
  it("o anual é onze mensalidades — um mês grátis", () => {
    expect(PRECOS.MEMBRO.anualCentavos).toBe(11999 * 11);
    expect(PRECOS.MEMBRO_MESA_QR.anualCentavos).toBe(14999 * 11);
  });

  it("devolve o preço do ciclo pedido", () => {
    expect(precoDoCiclo("MEMBRO", "MENSAL")).toBe(11999);
    expect(precoDoCiclo("MEMBRO", "ANUAL")).toBe(131989);
  });
});
```

E, no describe de drift, trocar a asserção de um preço só pela dos quatro:

```ts
it("os quatro preços de tabela aparecem na página", () => {
  const naPagina = precosNaPagina();
  for (const plano of Object.keys(PRECOS) as PlanoTenant[]) {
    expect(naPagina).toContain(formatarBRL(PRECOS[plano].mensalCentavos));
    expect(naPagina).toContain(formatarBRL(PRECOS[plano].anualCentavos));
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/plans.test.ts`
Expected: FAIL — `anualCentavos` é `undefined`.

- [ ] **Step 3: Implementar**

```ts
export type Ciclo = "MENSAL" | "ANUAL";

// Onze mensalidades pelo ano: um mês grátis. O desconto é ganho ao se
// comprometer com o período, e é essa mesma conta que o reembolso
// proporcional desfaz quando alguém sai antes do fim.
export const PRECOS: Record<
  PlanoTenant,
  { mensalCentavos: number; anualCentavos: number }
> = {
  MEMBRO: { mensalCentavos: 11999, anualCentavos: 11999 * 11 },
  MEMBRO_MESA_QR: { mensalCentavos: 14999, anualCentavos: 14999 * 11 },
};

export function precoDoCiclo(plano: PlanoTenant, ciclo: Ciclo): number {
  return ciclo === "ANUAL"
    ? PRECOS[plano].anualCentavos
    : PRECOS[plano].mensalCentavos;
}
```

- [ ] **Step 4: Reescrever a seção `#planos` da landing**

Dois cards lado a lado, cada um com `data-mensal` e `data-anual` nos elementos de preço, e um toggle acima:

```html
<div class="flex items-center justify-center gap-3 mb-8">
  <span id="labelMensal" class="text-sm font-semibold">Mensal</span>
  <button id="toggleCiclo" type="button" role="switch" aria-checked="false"
          aria-label="Alternar entre cobrança mensal e anual"
          class="relative w-14 h-7 rounded-full bg-gray-300 transition">
    <span id="toggleBolinha"
          class="absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition"></span>
  </button>
  <span id="labelAnual" class="text-sm font-semibold text-gray-400">
    Anual <span class="text-terracota">· 1 mês grátis</span>
  </span>
</div>
```

Cada card com o preço marcado assim (repetir para os dois planos, trocando os valores):

```html
<span class="preco text-5xl font-black text-white"
      data-mensal="R$ 119,99" data-anual="R$ 1.319,89">R$ 119,99</span>
<span class="periodo text-sm" data-mensal="/mês" data-anual="/ano">/mês</span>
<a class="cta-plano" data-plano="MEMBRO" href="/assinar?plano=MEMBRO&ciclo=MENSAL">
  Quero Ser Membro MUNO
</a>
```

Os quatro valores precisam bater com `formatarBRL` — `1.319,89` e `1.649,89` levam ponto de milhar.

- [ ] **Step 5: Implementar o toggle em `main.js`**

```js
  /* ── Toggle mensal/anual dos planos ───────────────── */
  // JS puro porque a landing é um documento estático servido de public/ — ela
  // não passa pelo React nem lê o banco. Ver o AGENTS.md sobre por que ela
  // continua assim.
  const toggleCiclo = document.getElementById('toggleCiclo');
  if (toggleCiclo) {
    const aplicar = (anual) => {
      document.querySelectorAll('[data-mensal]').forEach((el) => {
        el.textContent = anual ? el.dataset.anual : el.dataset.mensal;
      });
      document.querySelectorAll('.cta-plano').forEach((a) => {
        const plano = a.dataset.plano;
        a.href = `/assinar?plano=${plano}&ciclo=${anual ? 'ANUAL' : 'MENSAL'}`;
      });
      toggleCiclo.setAttribute('aria-checked', String(anual));
      toggleCiclo.classList.toggle('bg-terracota', anual);
      toggleCiclo.classList.toggle('bg-gray-300', !anual);
      document.getElementById('toggleBolinha').style.transform =
        anual ? 'translateX(28px)' : 'translateX(0)';
      document.getElementById('labelMensal').classList.toggle('text-gray-400', anual);
      document.getElementById('labelAnual').classList.toggle('text-gray-400', !anual);
    };

    toggleCiclo.addEventListener('click', () => {
      aplicar(toggleCiclo.getAttribute('aria-checked') !== 'true');
    });
    aplicar(false);
  }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/plans.test.ts`
Expected: PASS.

- [ ] **Step 7: Conferir no navegador**

`npm run dev`, abrir `localhost:3000`, rolar até os planos, clicar no toggle. Os quatro preços trocam, o `/ano` aparece, e os links dos botões mudam o `ciclo`. Console sem erro.

- [ ] **Step 8: Commit**

```bash
git add src/lib/plans.ts src/lib/plans.test.ts public/vendas/index.html public/vendas/js/main.js
git commit -m "Oferece os dois planos com ciclo mensal e anual na landing"
```

---

### Task 3: `Ciclo` e `asaasSubscriptionId` na `Assinatura`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_ciclo_e_gateway_na_assinatura/migration.sql` (gerada)
- Modify: `src/lib/assinatura/competencia.ts`
- Test: `src/lib/assinatura/competencia.test.ts`

**Interfaces:**
- Produces: `Assinatura.ciclo: Ciclo`, `Assinatura.asaasSubscriptionId: string | null`, e `proximoVencimento(assinatura, vencimentoEmAberto, agora)` passando a ler `assinatura.ciclo`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe("proximoVencimento com ciclo anual", () => {
  // Sem isto a tela diz ao cliente do anual que ele paga de novo em 30 dias,
  // quando ele acabou de pagar o ano inteiro.
  it("aponta para daqui a doze meses quando não há cobrança em aberto", () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    const assinatura = {
      diaVencimento: 10,
      inicioCobranca: new Date("2026-08-10T00:00:00Z"),
      ciclo: "ANUAL" as const,
    };

    expect(proximoVencimento(assinatura, null, agora)).toEqual(
      new Date(Date.UTC(2027, 7, 10))
    );
  });

  it("cobrança em aberto continua vindo primeiro, mesmo vencida", () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    const vencida = new Date(Date.UTC(2026, 7, 10));
    const assinatura = {
      diaVencimento: 10,
      inicioCobranca: new Date("2025-08-10T00:00:00Z"),
      ciclo: "ANUAL" as const,
    };

    expect(proximoVencimento(assinatura, vencida, agora)).toEqual(vencida);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/assinatura/competencia.test.ts`
Expected: FAIL — devolve setembro de 2026 em vez de agosto de 2027.

- [ ] **Step 3: Schema**

Em `prisma/schema.prisma`:

```prisma
enum Ciclo {
  MENSAL
  ANUAL
}
```

E dentro de `model Assinatura`:

```prisma
  ciclo               Ciclo   @default(MENSAL)
  // Presente = o Asaas cobra esta assinatura, e o cron NÃO gera cobrança para
  // ela. Nulo = cliente cobrado por PIX conferido na mão, como antes do
  // gateway. É este campo que impede dois relógios gerando a mesma dívida.
  asaasSubscriptionId String? @unique
```

- [ ] **Step 4: Migrar**

```bash
docker compose up -d
npm run db:migrate -- --name ciclo_e_gateway_na_assinatura
```

Os defaults cobrem as linhas existentes: todo cliente atual vira `MENSAL` sem gateway, que é exatamente o que ele é.

- [ ] **Step 5: Implementar**

Em `competencia.ts`, na assinatura de `proximoVencimento`, acrescentar `ciclo: Ciclo` ao tipo do primeiro parâmetro e, antes do cálculo mensal:

```ts
  // O anual não tem "mês que vem": quem pagou o ano só volta a pagar quando o
  // período fecha. Calcular pelo caminho mensal faria a tela do cliente
  // anunciar uma cobrança que não existe.
  if (assinatura.ciclo === "ANUAL") {
    const base = assinatura.inicioCobranca;
    return new Date(
      Date.UTC(
        base.getUTCFullYear() + 1,
        base.getUTCMonth(),
        assinatura.diaVencimento
      )
    );
  }
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS. Se algum chamador de `proximoVencimento` quebrar por falta do campo `ciclo`, passar `ciclo` na consulta Prisma daquele chamador — o `select` precisa incluí-lo.

- [ ] **Step 7: Commit**

```bash
git add prisma/ src/lib/assinatura/
git commit -m "Ensina a assinatura a ter ciclo anual e dono de cobrança"
```

---

### Task 4: O cron não gera cobrança para quem o Asaas já cobra

Esta é a task que impede o bug mais caro do projeto: cliente em dia bloqueado por uma fatura duplicada.

**Files:**
- Modify: `src/app/api/cron/assinaturas/route.ts`
- Test: `src/app/api/cron/assinaturas/route.test.ts`

**Interfaces:**
- Consumes: `Assinatura.asaasSubscriptionId` (Task 3).

- [ ] **Step 1: Escrever o teste que falha**

Seguir o padrão de mocks já usado no arquivo. Acrescentar:

```ts
describe("assinatura cobrada pelo gateway", () => {
  // Dois relógios para a mesma dívida é o defeito que este teste tranca: o
  // Asaas cobra o cartão, o cron cria a cobrança do mês assim mesmo, ninguém
  // dá baixa, e em 15 dias a régua bloqueia um restaurante adimplente.
  it("não gera cobrança quando há asaasSubscriptionId", async () => {
    findMany.mockResolvedValue([
      {
        id: "assin-gateway",
        status: "ATIVA",
        valorMensal: 119.99,
        diaVencimento: 10,
        inicioCobranca: new Date("2026-01-10T00:00:00Z"),
        asaasSubscriptionId: "sub_123",
      },
    ]);

    await executarComSegredo();

    expect(cobrancaCreate).not.toHaveBeenCalled();
  });

  it("continua gerando para quem não tem gateway", async () => {
    findMany.mockResolvedValue([
      {
        id: "assin-pix",
        status: "ATIVA",
        valorMensal: 119.99,
        diaVencimento: 10,
        inicioCobranca: new Date("2026-01-10T00:00:00Z"),
        asaasSubscriptionId: null,
      },
    ]);

    await executarComSegredo();

    expect(cobrancaCreate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/cron/assinaturas/route.test.ts`
Expected: FAIL — `cobrancaCreate` foi chamado uma vez no primeiro teste.

- [ ] **Step 3: Implementar**

No `select` do `findMany`, acrescentar `asaasSubscriptionId: true`. E no laço, logo depois da checagem de cortesia:

```ts
    // Quem o Asaas cobra, o Asaas gera. O webhook espelha cada cobrança dele
    // numa Cobranca local — gerar aqui também criaria a mesma dívida duas
    // vezes, e a segunda nunca receberia baixa.
    //
    // A régua abaixo continua rodando para esta assinatura, de propósito:
    // cartão que falha vira cobrança vencida pelo webhook, e o bloqueio
    // acontece pelo caminho de sempre.
    if (assinatura.asaasSubscriptionId) continue;
```

Conferir que o `continue` cai **antes** da criação da cobrança e **não** pula o recálculo de status, que acontece num segundo laço.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/cron/assinaturas/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/
git commit -m "Impede o cron de duplicar a cobrança que o Asaas já emite"
```

---

### Task 5: `isValidCnpj` e `isValidCpfCnpj`

**Files:**
- Modify: `src/lib/cpf.ts`
- Test: `src/lib/cpf.test.ts`

**Interfaces:**
- Produces: `isValidCnpj(value: string): boolean`, `isValidCpfCnpj(value: string): boolean`, `stripDocumento(value: string): string`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe("isValidCpfCnpj", () => {
  // O pagador aqui é o restaurante, normalmente CNPJ. Aceitar só CPF
  // excluiria a maior parte dos clientes.
  it("aceita CNPJ válido, com e sem máscara", () => {
    expect(isValidCpfCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCpfCnpj("11222333000181")).toBe(true);
  });

  it("aceita CPF válido", () => {
    expect(isValidCpfCnpj("529.982.247-25")).toBe(true);
  });

  it.each(["11222333000182", "52998224726"])(
    "recusa dígito verificador errado: %s",
    (doc) => expect(isValidCpfCnpj(doc)).toBe(false)
  );

  it("recusa sequência repetida", () => {
    expect(isValidCpfCnpj("11111111111111")).toBe(false);
  });

  it.each(["123", "1122233300018", "112223330001811"])(
    "recusa contagem de dígitos fora de 11 e 14: %s",
    (doc) => expect(isValidCpfCnpj(doc)).toBe(false)
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/cpf.test.ts`
Expected: FAIL — `isValidCpfCnpj is not a function`.

- [ ] **Step 3: Implementar**

```ts
export function stripDocumento(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string): boolean {
  const cnpj = stripDocumento(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digito = (base: string): number => {
    // Os pesos do CNPJ vão de 2 a 9 e recomeçam — não é uma contagem simples
    // como a do CPF.
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Aceita os dois, decidindo pela contagem de dígitos. */
export function isValidCpfCnpj(value: string): boolean {
  const digitos = stripDocumento(value);
  if (digitos.length === 11) return isValidCpf(value);
  if (digitos.length === 14) return isValidCnpj(value);
  return false;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/cpf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cpf.ts src/lib/cpf.test.ts
git commit -m "Valida CNPJ além de CPF, para o pagador da mensalidade"
```

---

### Task 6: O cliente Asaas da plataforma

**Files:**
- Create: `src/lib/assinatura/asaas.ts`
- Test: `src/lib/assinatura/asaas.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `criarCliente(input: { nome: string; email: string; cpfCnpj: string }): Promise<{ id: string }>`
  - `criarAssinatura(input: { customerId: string; valorCentavos: number; ciclo: Ciclo; billingType: "PIX" | "CREDIT_CARD"; descricao: string; externalReference: string }): Promise<{ id: string }>`
  - `listarCobrancasDaAssinatura(subscriptionId: string): Promise<{ data: { id: string; invoiceUrl: string }[] }>`
  - `webhookAutorizado(tokenRecebido: string | null): boolean`

**Os dois ciclos criam assinatura — não existe cobrança avulsa aqui.** Anual é
`cycle: "YEARLY"`. A razão é a trava da Task 4: ela pula a geração de cobrança do
cron quando existe `asaasSubscriptionId`, e um anual pago por cobrança avulsa
nasceria sem esse id — o cron geraria cobrança **mensal** para quem pagou o ano, e
a régua bloquearia o cliente em 15 dias. Assinatura anual também renova sozinha;
cobrança avulsa morreria em silêncio depois de doze meses.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("cliente Asaas da plataforma", () => {
  beforeEach(() => {
    vi.stubEnv("ASAAS_API_KEY", "chave-de-teste");
    vi.stubEnv("ASAAS_ENV", "sandbox");
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "token-secreto");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("cria cliente no host de sandbox, autenticando por access_token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "cus_1" }), { status: 200 })
    );

    const { criarCliente } = await import("./asaas");
    const cliente = await criarCliente({
      nome: "Pizzaria do João",
      email: "joao@pizzaria.com",
      cpfCnpj: "11222333000181",
    });

    expect(cliente.id).toBe("cus_1");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api-sandbox.asaas.com/v3/customers");
    expect((init!.headers as Record<string, string>).access_token).toBe(
      "chave-de-teste"
    );
  });

  it("manda o valor em reais, não em centavos", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sub_1" }), { status: 200 })
    );

    const { criarAssinatura } = await import("./asaas");
    await criarAssinatura({
      customerId: "cus_1",
      valorCentavos: 11999,
      ciclo: "MENSAL",
      descricao: "Membro MUNO",
      externalReference: "insc_1",
    });

    const corpo = JSON.parse(String(fetchSpy.mock.calls[0][1]!.body));
    expect(corpo.value).toBe(119.99);
    expect(corpo.cycle).toBe("MONTHLY");
  });

  it("o anual é assinatura YEARLY, e respeita o método escolhido", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "sub_2" }), { status: 200 })
    );

    const { criarAssinatura } = await import("./asaas");
    await criarAssinatura({
      customerId: "cus_1",
      valorCentavos: 131989,
      ciclo: "ANUAL",
      billingType: "PIX",
      descricao: "Membro MUNO",
      externalReference: "insc_1",
    });

    const corpo = JSON.parse(String(fetchSpy.mock.calls[0][1]!.body));
    expect(corpo.cycle).toBe("YEARLY");
    expect(corpo.billingType).toBe("PIX");
    expect(corpo.value).toBe(1319.89);
  });

  it("lista as cobranças de uma assinatura", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "pay_1", invoiceUrl: "https://x/i/1" }] }),
        { status: 200 }
      )
    );

    const { listarCobrancasDaAssinatura } = await import("./asaas");
    const { data } = await listarCobrancasDaAssinatura("sub_1");

    expect(data[0].invoiceUrl).toBe("https://x/i/1");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/sub_1/payments"
    );
  });

  it("propaga a descrição do erro do Asaas em vez de engolir", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ description: "CPF/CNPJ inválido" }] }),
        { status: 400 }
      )
    );

    const { criarCliente } = await import("./asaas");
    await expect(
      criarCliente({ nome: "x", email: "a@b.c", cpfCnpj: "1" })
    ).rejects.toThrow("CPF/CNPJ inválido");
  });

  it("recusa webhook com token errado, e aceita o certo", async () => {
    const { webhookAutorizado } = await import("./asaas");
    expect(webhookAutorizado("token-secreto")).toBe(true);
    expect(webhookAutorizado("outro")).toBe(false);
    expect(webhookAutorizado(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/assinatura/asaas.test.ts`
Expected: FAIL — módulo `./asaas` não existe.

- [ ] **Step 3: Implementar**

`src/lib/assinatura/asaas.ts`. Cabeçalho explicando por que não é o adapter vizinho:

```ts
import crypto from "node:crypto";
import type { Ciclo } from "@/lib/plans";

/**
 * O Asaas da própria Muno — ela cobrando o restaurante.
 *
 * NÃO é src/lib/payments/asaas-adapter.ts. Aquele implementa PaymentProvider,
 * lê credencial criptografada de PaymentConnection por tenant, e serve o
 * restaurante cobrando o cliente dele. Aqui existe uma conta só, a da
 * plataforma, com a chave em env. Fundir os dois faria a credencial da
 * plataforma trafegar pelo caminho desenhado para credencial de tenant.
 *
 * As convenções são as mesmas de propósito (header `access_token`, hosts de
 * sandbox e produção, tradução de errors[].description): é a mesma API.
 */

const BASE_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

function baseUrl(): string {
  return process.env.ASAAS_ENV === "production"
    ? BASE_URLS.production
    : BASE_URLS.sandbox;
}

async function chamar<T>(caminho: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${caminho}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY ?? "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const corpo = (await res.json().catch(() => null)) as
      | { errors?: { description?: string }[] }
      | null;
    throw new Error(
      corpo?.errors?.[0]?.description ??
        `Asaas respondeu ${res.status} em ${caminho}`
    );
  }
  return (await res.json()) as T;
}

/** O Asaas fala em reais com duas casas; nós guardamos centavos inteiros. */
function emReais(centavos: number): number {
  return centavos / 100;
}

function proximoVencimentoISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function criarCliente(input: {
  nome: string;
  email: string;
  cpfCnpj: string;
}): Promise<{ id: string }> {
  return chamar<{ id: string }>("/customers", {
    name: input.nome,
    email: input.email,
    cpfCnpj: input.cpfCnpj,
  });
}

/**
 * Os dois ciclos são assinatura, nunca cobrança avulsa.
 *
 * O anual em avulso nasceria sem asaasSubscriptionId, e o cron — que só pula a
 * geração de cobrança quando esse id existe — emitiria cobrança MENSAL para
 * quem pagou o ano inteiro, bloqueando o cliente em 15 dias pela régua.
 * Assinatura anual ainda renova sozinha; avulsa morreria calada aos 12 meses.
 *
 * billingType vem de fora porque o mensal só aceita cartão (é o único que o
 * Asaas cobra sozinho) e o anual aceita PIX — no anual, um QR por ano com
 * antecedência é aceitável; por mês, não.
 */
export async function criarAssinatura(input: {
  customerId: string;
  valorCentavos: number;
  ciclo: Ciclo;
  billingType: "PIX" | "CREDIT_CARD";
  descricao: string;
  externalReference: string;
}): Promise<{ id: string }> {
  return chamar<{ id: string }>("/subscriptions", {
    customer: input.customerId,
    billingType: input.billingType,
    value: emReais(input.valorCentavos),
    nextDueDate: proximoVencimentoISO(),
    cycle: input.ciclo === "ANUAL" ? "YEARLY" : "MONTHLY",
    description: input.descricao,
    externalReference: input.externalReference,
  });
}

/**
 * A primeira cobrança da assinatura é onde o cliente paga. Confirmar com a
 * chave de sandbox se POST /subscriptions já devolve a invoiceUrl direto; até
 * lá, este caminho funciona nos dois casos.
 */
export async function listarCobrancasDaAssinatura(
  subscriptionId: string
): Promise<{ data: { id: string; invoiceUrl: string }[] }> {
  return chamar(`/subscriptions/${subscriptionId}/payments`);
}

/**
 * O Asaas autentica webhook por token estático no header, não por assinatura
 * do corpo. timingSafeEqual porque comparação de string vaza o prefixo certo
 * pelo tempo de resposta.
 */
export function webhookAutorizado(tokenRecebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || !tokenRecebido) return false;
  const a = Buffer.from(tokenRecebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/assinatura/asaas.test.ts`
Expected: PASS.

- [ ] **Step 5: Documentar as variáveis**

Em `.env.example`:

```
# Asaas da plataforma — a Muno cobrando o restaurante. Não confundir com a
# credencial por tenant de PaymentConnection.
ASAAS_API_KEY=""
ASAAS_ENV="sandbox"
ASAAS_WEBHOOK_TOKEN=""
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/assinatura/asaas.ts src/lib/assinatura/asaas.test.ts .env.example
git commit -m "Cria o cliente Asaas da plataforma, separado do adapter de tenant"
```

---

### Task 7: O model `Inscricao`, com RLS e regra de remoção

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_inscricao/migration.sql` (gerada, depois editada à mão para o RLS)
- Modify: `src/lib/tenant-removal.ts`
- Test: `src/lib/tenant-removal.test.ts` (já existe e vai quebrar sozinho)

**Interfaces:**
- Produces: `model Inscricao`, `enum InscricaoStatus`.

- [ ] **Step 1: Rodar o teste que já existe e vê-lo quebrar depois do schema**

O `tenant-removal.test.ts` lê as relações do próprio `schema.prisma` e cobre cobertura e ordem. Model novo com `tenantId` quebra o teste — é o teste funcionando.

- [ ] **Step 2: Schema**

```prisma
enum InscricaoStatus {
  AGUARDANDO_PAGAMENTO
  PAGA
  PROVISIONADA
}

// Uma tentativa de assinatura vinda do checkout público.
//
// Existe por dois motivos, e nenhum é guardar dados de formulário:
//
// 1. É a reserva do slug. Sem ela o cliente paga e só então descobre que
//    "pizzaria" já era.
// 2. É o que torna o webhook idempotente. O Asaas reentrega quando não recebe
//    200, e sem um registro dizendo "isto já foi provisionado" a segunda
//    entrega cria um segundo restaurante para quem pagou uma vez.
//
// Não guarda CPF/CNPJ: o documento vai do checkout direto ao Asaas, e o que
// fica aqui é o asaasCustomerId. Mesma regra que src/lib/cpf.ts já registra.
//
// Não é modelo tenant-scoped — é registro de plataforma, como o Lead — e por
// isso não entra em src/lib/tenant-scoped-models.ts.
model Inscricao {
  id                  String          @id @default(cuid())
  nome                String
  slug                String          @unique
  email               String
  plano               PlanoTenant
  ciclo               Ciclo
  asaasCustomerId     String?
  asaasPaymentId      String?         @unique
  asaasSubscriptionId String?         @unique
  status              InscricaoStatus @default(AGUARDANDO_PAGAMENTO)
  // Slug abandonado não pode ficar preso. O cron apaga a inscrição não paga e
  // vencida — apagar, e não marcar, porque enquanto a linha existir o
  // slug @unique continua segurando o nome.
  expiraEm            DateTime
  tenantId            String?         @unique
  tenant              Tenant?         @relation(fields: [tenantId], references: [id])
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  @@index([status])
}
```

E em `model Tenant`, acrescentar `inscricao Inscricao?`.

- [ ] **Step 3: Migrar**

```bash
npm run db:migrate -- --name inscricao
```

- [ ] **Step 4: Acrescentar o RLS na migração gerada**

Editar o `migration.sql` recém-criado e acrescentar ao final:

```sql
-- Tabela nova em `public` nasce ABERTA para a chave anônima do Supabase, com
-- escrita: `anon` e `authenticated` recebem SELECT/INSERT/UPDATE/DELETE por
-- padrão, e a anon key vai no bundle do navegador de todo cardápio. Foi assim
-- que Tenant, Lead e PlatformAdmin ficaram expostos até 10/08/2026.
--
-- Sem policy é o correto aqui: Inscricao é tabela de plataforma, não de
-- restaurante, e não há como escopá-la por tenant. Sem policy permissiva,
-- quem não tem BYPASSRLS não enxerga linha nenhuma. A aplicação conecta como
-- `postgres`, que tem BYPASSRLS, e nada muda para ela.
ALTER TABLE "Inscricao" ENABLE ROW LEVEL SECURITY;
```

Reaplicar: `npm run db:reset`.

- [ ] **Step 5: Rodar o teste de remoção e ver falhar**

Run: `npx vitest run src/lib/tenant-removal.test.ts`
Expected: FAIL — `Inscricao` tem `tenantId` e não está coberta.

- [ ] **Step 6: Tratar `Inscricao` como o `Lead`**

`Inscricao` **não** entra em `ORDEM_DE_EXCLUSAO`. Em `removeTenant`, ao lado do
`updateMany` do `Lead` que já existe:

```ts
    // Inscricao segue a regra do Lead: registro comercial da plataforma, não
    // dado do restaurante. Apagá-la reescreveria o histórico de vendas ("esta
    // assinatura nunca existiu") por causa de um cliente que saiu. O tenantId
    // dela é opcional justamente para poder ficar solto.
    const { count: inscricoesDesvinculadas } = await tx.inscricao.updateMany({
      where: { tenantId: tenant.id },
      data: { tenantId: null },
    });
```

Acrescentar `inscricoesDesvinculadas` ao `ResumoDaRemocao` e ao objeto devolvido,
ao lado de `leadsDesvinculados`. Atualizar o comentário do cabeçalho de
`removeTenant`, que hoje diz "O Lead é a exceção" — passam a ser duas.

O teste ao lado lê as relações do próprio `schema.prisma`, então ele exige que
`Inscricao` seja explicitamente tratada; declarar a exceção é o que o faz passar.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add prisma/ src/lib/tenant-removal.ts
git commit -m "Cria a Inscricao, que reserva o slug antes do pagamento"
```

---

### Task 8: Disponibilidade de slug

**Files:**
- Create: `src/lib/inscricao/slug.ts`
- Create: `src/lib/inscricao/slug.test.ts`
- Create: `src/app/api/assinar/slug/route.ts`

**Interfaces:**
- Produces:
  - `type Disponibilidade = { livre: true } | { livre: false; motivo: "INVALIDO" | "RESERVADO" | "EM_USO" }`
  - `checarSlug(slug: string, buscas: { tenant: (s: string) => Promise<boolean>; inscricao: (s: string) => Promise<boolean> }): Promise<Disponibilidade>`
  - `sugerirSlug(nome: string): string` — movida para cá de `ConverterLead.tsx`, que passa a importá-la. A Task 10 usa a mesma função: duas cópias divergiriam, e o slug sugerido ao cliente ficaria diferente do sugerido a você no CRM.

- [ ] **Step 1: Escrever o teste que falha**

```ts
const livre = { tenant: async () => false, inscricao: async () => false };

describe("checarSlug", () => {
  it("recusa formato inválido antes de ir ao banco", async () => {
    let consultou = false;
    const espiao = {
      tenant: async () => { consultou = true; return false; },
      inscricao: async () => false,
    };

    expect(await checarSlug("Pizzaria do João", espiao)).toEqual({
      livre: false,
      motivo: "INVALIDO",
    });
    expect(consultou).toBe(false);
  });

  it.each(["admin", "app", "join", "www"])(
    "recusa o slug reservado %s",
    async (slug) => {
      expect(await checarSlug(slug, livre)).toEqual({
        livre: false,
        motivo: "RESERVADO",
      });
    }
  );

  // Duas fontes de unicidade: um slug pode estar preso por um restaurante que
  // já existe OU por uma inscrição que ainda não pagou.
  it("recusa slug de tenant existente", async () => {
    expect(
      await checarSlug("burguer", { ...livre, tenant: async () => true })
    ).toEqual({ livre: false, motivo: "EM_USO" });
  });

  it("recusa slug reservado por outra inscrição", async () => {
    expect(
      await checarSlug("burguer", { ...livre, inscricao: async () => true })
    ).toEqual({ livre: false, motivo: "EM_USO" });
  });

  it("aceita slug livre", async () => {
    expect(await checarSlug("pizzaria-do-joao", livre)).toEqual({ livre: true });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/inscricao/slug.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import { RESERVED_SLUGS, validateSlug, ProvisionError } from "@/lib/tenant-provisioning";

export type Disponibilidade =
  | { livre: true }
  | { livre: false; motivo: "INVALIDO" | "RESERVADO" | "EM_USO" };

/**
 * Recebe as buscas por parâmetro em vez de importar o Prisma: assim a regra é
 * testável sem banco, e a rota decide qual cliente usar.
 *
 * O formato é checado antes de qualquer consulta — endpoint público não
 * consulta banco por causa de texto que nunca poderia ser um slug.
 */
export async function checarSlug(
  slug: string,
  buscas: {
    tenant: (s: string) => Promise<boolean>;
    inscricao: (s: string) => Promise<boolean>;
  }
): Promise<Disponibilidade> {
  try {
    validateSlug(slug);
  } catch (err) {
    if (err instanceof ProvisionError) {
      return {
        livre: false,
        motivo: err.code === "SLUG_RESERVADO" ? "RESERVADO" : "INVALIDO",
      };
    }
    throw err;
  }

  // Reaproveita RESERVED_SLUGS via validateSlug acima: a lista mora num lugar
  // só, e um subdomínio novo da plataforma passa a valer aqui de graça.
  void RESERVED_SLUGS;

  if (await buscas.tenant(slug)) return { livre: false, motivo: "EM_USO" };
  if (await buscas.inscricao(slug)) return { livre: false, motivo: "EM_USO" };
  return { livre: true };
}
```

Mover `sugerirSlug` de `src/components/platform/ConverterLead.tsx` para este
arquivo, sem alterar o corpo, e importá-la lá:

```ts
/**
 * Vive aqui, e não no componente do CRM, porque o checkout público sugere o
 * mesmo slug. Duas cópias divergem, e o cliente veria um endereço sugerido
 * diferente do que você vê ao converter o lead dele.
 */
export function sugerirSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/inscricao/slug.test.ts`
Expected: PASS.

- [ ] **Step 5: A rota pública**

`src/app/api/assinar/slug/route.ts`, com limitador por IP como `/api/leads/publico` já faz:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { checarSlug } from "@/lib/inscricao/slug";

// Endpoint público consultado a cada tecla digitada: teto mais alto que o de
// lead, mas teto.
const limitador = criarLimitador({ max: 60, janelaMs: 60 * 1000 });

export async function GET(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  }

  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim().toLowerCase();

  const resultado = await checarSlug(slug, {
    tenant: async (s) =>
      (await prismaUnscoped.tenant.findUnique({ where: { slug: s }, select: { id: true } })) !== null,
    inscricao: async (s) =>
      (await prismaUnscoped.inscricao.findUnique({ where: { slug: s }, select: { id: true } })) !== null,
  });

  return NextResponse.json(resultado);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/inscricao/ src/app/api/assinar/slug/
git commit -m "Confere disponibilidade de slug antes de o cliente pagar"
```

---

### Task 9: A rota que cria a inscrição e a cobrança

**Files:**
- Create: `src/app/api/assinar/route.ts`
- Create: `src/app/api/assinar/route.test.ts`

**Interfaces:**
- Consumes: `checarSlug` (Task 8), `criarCliente`/`criarAssinatura`/`listarCobrancasDaAssinatura` (Task 6), `precoDoCiclo` (Task 2), `isValidCpfCnpj`/`stripDocumento` (Task 5), `Inscricao` (Task 7).
- Produces: `POST /api/assinar` → `201 { inscricaoId, checkoutUrl }`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe("POST /api/assinar", () => {
  it("recusa mensal em PIX — o Asaas não cobra PIX sozinho", async () => {
    const res = await POST(requisicao({
      nome: "Pizzaria", email: "a@b.c", slug: "pizzaria",
      cpfCnpj: "11222333000181", plano: "MEMBRO",
      ciclo: "MENSAL", metodo: "PIX",
    }));

    expect(res.status).toBe(400);
  });

  it("o anual também vira assinatura, não cobrança avulsa", async () => {
    await POST(requisicao({ ...corpoValido(), ciclo: "ANUAL", metodo: "PIX" }));

    // Sem asaasSubscriptionId, o cron emitiria cobrança mensal para quem pagou
    // o ano inteiro e a régua bloquearia o cliente em 15 dias.
    expect(criarAssinatura).toHaveBeenCalledWith(
      expect.objectContaining({ ciclo: "ANUAL", billingType: "PIX" })
    );
    const dados = inscricaoUpdate.mock.calls[0][0].data;
    expect(dados.asaasSubscriptionId).toBeTruthy();
  });

  it("recusa slug já reservado por outra inscrição", async () => {
    inscricaoFindUnique.mockResolvedValue({ id: "insc-outra" });

    const res = await POST(requisicao(corpoValido()));

    expect(res.status).toBe(409);
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("recusa documento inválido antes de falar com o Asaas", async () => {
    const res = await POST(requisicao({ ...corpoValido(), cpfCnpj: "123" }));

    expect(res.status).toBe(400);
    expect(criarCliente).not.toHaveBeenCalled();
  });

  it("cria a inscrição e devolve a URL de pagamento", async () => {
    const res = await POST(requisicao(corpoValido()));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.checkoutUrl).toBe("https://sandbox.asaas.com/i/123");
    expect(inscricaoCreate).toHaveBeenCalled();
  });

  // O documento é o único dado sensível do formulário, e a regra do repo é
  // não persistir.
  it("não grava o documento na Inscricao", async () => {
    await POST(requisicao(corpoValido()));

    const dados = inscricaoCreate.mock.calls[0][0].data;
    expect(JSON.stringify(dados)).not.toContain("11222333000181");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/assinar/route.test.ts`
Expected: FAIL — rota não existe.

- [ ] **Step 3: Implementar**

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prismaUnscoped } from "@/lib/prisma";
import { criarLimitador } from "@/lib/rate-limit";
import { checarSlug } from "@/lib/inscricao/slug";
import { isValidCpfCnpj, stripDocumento } from "@/lib/cpf";
import { precoDoCiclo, PLANO_LABELS } from "@/lib/plans";
import {
  criarAssinatura,
  criarCliente,
  listarCobrancasDaAssinatura,
} from "@/lib/assinatura/asaas";

const limitador = criarLimitador({ max: 5, janelaMs: 10 * 60 * 1000 });

const schema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  slug: z.string().trim().toLowerCase(),
  cpfCnpj: z.string().trim().refine(isValidCpfCnpj, "Documento inválido"),
  plano: z.enum(["MEMBRO", "MEMBRO_MESA_QR"]),
  ciclo: z.enum(["MENSAL", "ANUAL"]),
  metodo: z.enum(["CREDIT_CARD", "PIX"]),
});

// Cartão resolve em minutos; PIX gerado à noite é pago de manhã. Segurar o
// slug por uma hora num PIX legítimo devolveria o endereço para outra pessoa
// no meio do pagamento.
const VALIDADE_MS = { CREDIT_CARD: 60 * 60 * 1000, PIX: 24 * 60 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "desconhecido")
    .split(",")[0]
    .trim();
  if (!limitador.permitir(ip, Date.now())) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente de novo em alguns minutos." },
      { status: 429 }
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const { nome, email, slug, cpfCnpj, plano, ciclo, metodo } = parsed.data;

  // Mensal em PIX não existe: o Asaas só cobra sozinho no cartão. Assinatura
  // em PIX gera um QR novo a cada ciclo, que o cliente paga na mão — quem
  // esquece é bloqueado pela régua, e a plataforma volta a ser cobradora.
  if (ciclo === "MENSAL" && metodo === "PIX") {
    return NextResponse.json(
      { error: "O plano mensal só aceita cartão. Para pagar via PIX, escolha o plano anual." },
      { status: 400 }
    );
  }

  const disponibilidade = await checarSlug(slug, {
    tenant: async (s) =>
      (await prismaUnscoped.tenant.findUnique({ where: { slug: s }, select: { id: true } })) !== null,
    inscricao: async (s) =>
      (await prismaUnscoped.inscricao.findUnique({ where: { slug: s }, select: { id: true } })) !== null,
  });
  if (!disponibilidade.livre) {
    return NextResponse.json(
      { error: "Endereço indisponível", motivo: disponibilidade.motivo },
      { status: disponibilidade.motivo === "EM_USO" ? 409 : 400 }
    );
  }

  // A Inscricao nasce ANTES de qualquer chamada ao Asaas, e é isso que segura
  // o slug. Criar a cobrança primeiro abriria uma janela em que dois clientes
  // pagam pelo mesmo endereço — e aí um dos dois pagou por nada.
  //
  // O documento NÃO entra aqui: vai direto para o Asaas, e o que fica é o
  // asaasCustomerId. Mesma regra que src/lib/cpf.ts registra.
  let inscricao;
  try {
    inscricao = await prismaUnscoped.inscricao.create({
      data: {
        nome, email, slug, plano, ciclo,
        expiraEm: new Date(Date.now() + VALIDADE_MS[metodo]),
      },
    });
  } catch {
    // Perdeu a corrida entre o checarSlug e o create: o @unique pegou.
    return NextResponse.json(
      { error: "Endereço indisponível", motivo: "EM_USO" },
      { status: 409 }
    );
  }

  try {
    const cliente = await criarCliente({
      nome, email, cpfCnpj: stripDocumento(cpfCnpj),
    });

    const descricao = `Muno — ${PLANO_LABELS[plano]} (${ciclo === "ANUAL" ? "anual" : "mensal"})`;
    const valorCentavos = precoDoCiclo(plano, ciclo);

    // Os dois ciclos criam assinatura. Anual em cobrança avulsa nasceria sem
    // asaasSubscriptionId, e o cron emitiria cobrança mensal para quem pagou o
    // ano — bloqueando pela régua em 15 dias um cliente adimplente.
    const assinatura = await criarAssinatura({
      customerId: cliente.id, valorCentavos, ciclo, billingType: metodo,
      descricao, externalReference: inscricao.id,
    });
    const checkoutUrl = await urlDaPrimeiraCobranca(assinatura.id);

    await prismaUnscoped.inscricao.update({
      where: { id: inscricao.id },
      data: {
        asaasCustomerId: cliente.id,
        asaasSubscriptionId: assinatura.id,
      },
    });

    // O Lead mantém o funil inteiro. Sem ele, todo cliente self-service some
    // do CRM e FunilBarras passa a medir só quem veio pelo WhatsApp. Ele
    // também é o que sobra quando o cron apaga uma inscrição abandonada.
    await prismaUnscoped.lead.create({
      data: {
        restaurante: nome, email, plano: PLANO_LABELS[plano],
        origem: "checkout", status: "NEGOCIACAO",
      },
    });

    return NextResponse.json(
      { inscricaoId: inscricao.id, checkoutUrl },
      { status: 201 }
    );
  } catch (erro) {
    // Falhou no Asaas depois da Inscricao criada: solta o slug em vez de
    // deixá-lo preso até o cron passar.
    await prismaUnscoped.inscricao
      .delete({ where: { id: inscricao.id } })
      .catch(() => {});
    console.error("Falha ao criar cobrança no Asaas:", erro);
    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento. Tente de novo." },
      { status: 502 }
    );
  }
}
```

E o auxiliar, no mesmo arquivo da rota. `listarCobrancasDaAssinatura` já existe:
ela é produzida e testada na Task 6.

```ts
/** A URL onde o cliente paga a primeira cobrança da assinatura. */
async function urlDaPrimeiraCobranca(subscriptionId: string): Promise<string> {
  const { data } = await listarCobrancasDaAssinatura(subscriptionId);
  const primeira = data[0];
  if (!primeira?.invoiceUrl) {
    // Assinatura criada e nenhuma cobrança: não há para onde mandar o cliente.
    // O catch acima solta o slug e devolve 502 — melhor que uma tela em branco.
    throw new Error(
      `Assinatura ${subscriptionId} criada sem cobrança: não há onde mandar o cliente pagar.`
    );
  }
  return primeira.invoiceUrl;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/assinar/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/assinar/
git commit -m "Cria a inscrição e a cobrança no Asaas a partir do checkout"
```

---

### Task 10: A página `/assinar`

**Files:**
- Create: `src/app/(client)/assinar/page.tsx`
- Create: `src/components/assinar/FormularioAssinatura.tsx`
- Modify: `src/proxy.ts`
- Modify: `src/proxy.test.ts`

**Interfaces:**
- Consumes: `GET /api/assinar/slug`, `POST /api/assinar`.

- [ ] **Step 1: Escrever o teste do proxy que falha**

`/assinar` e `/api/assinar/*` são públicos e não pertencem a tenant nenhum — precisam sair do pipeline como `/api/leads/publico` já faz, senão só respondem em subdomínio de restaurante.

```ts
it.each(["/assinar", "/api/assinar", "/api/assinar/slug"])(
  "%s responde no domínio raiz, onde não existe tenant",
  async (caminho) => {
    const res = await proxy(requisicaoRaiz(caminho));

    expect(res.status).toBe(200);
    expect(findUnique).not.toHaveBeenCalled();
  }
);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL — a guarda de raiz devolve 404 para tudo que não é `/`.

- [ ] **Step 3: Guarda no proxy**

Antes do ramo `resolvedSlug === null`, ao lado das guardas de `/api/leads/publico` e `/api/cron/`:

```ts
  // O checkout público não pertence a tenant nenhum, e precisa responder no
  // domínio raiz — que é onde a landing manda o cliente. Mesma razão e mesma
  // posição da guarda de /api/leads/publico: sair antes do findUnique.
  if (
    nextUrl.pathname === "/assinar" ||
    nextUrl.pathname.startsWith("/api/assinar")
  ) {
    return NextResponse.next();
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: A página**

Server Component lendo `plano` e `ciclo` de `searchParams`, com fallback para `MEMBRO`/`MENSAL` quando vierem ausentes ou desconhecidos — link velho compartilhado não pode dar erro. Mostra o resumo do pedido com `precoDoCiclo` e renderiza o formulário.

- [ ] **Step 6: O formulário**

Client Component com quatro campos: nome, e-mail, endereço com sufixo
`.munoapp.com.br`, e CPF/CNPJ com máscara. O método de pagamento só aparece no
ciclo anual — no mensal é cartão, sem escolha.

O miolo não óbvio é a checagem ao vivo. Ela precisa de debounce e de uma guarda
contra resposta fora de ordem:

```tsx
const [slug, setSlug] = useState("");
const [estado, setEstado] = useState<"vazio" | "checando" | "livre" | "ocupado">("vazio");

useEffect(() => {
  if (!slug) return setEstado("vazio");
  setEstado("checando");

  // Cancela a resposta da consulta anterior. Sem isto, quem digita rápido pode
  // ver o resultado de um slug que já não está no campo — e o botão libera
  // para um endereço ocupado.
  const controller = new AbortController();
  const timer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/assinar/slug?slug=${encodeURIComponent(slug)}`, {
        signal: controller.signal,
      });
      const body = await res.json();
      setEstado(body.livre ? "livre" : "ocupado");
    } catch {
      // Abortada, ou rede caiu. "ocupado" é o fail-closed certo: melhor pedir
      // para tentar de novo que deixar pagar por um endereço que talvez não
      // esteja livre.
      if (!controller.signal.aborted) setEstado("ocupado");
    }
  }, 400);

  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}, [slug]);
```

O submit posta em `/api/assinar` e redireciona o navegador para a `checkoutUrl`
devolvida:

```tsx
const res = await fetch("/api/assinar", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nome, email, slug, cpfCnpj, plano, ciclo, metodo }),
});
const body = await res.json();
if (!res.ok) return setErro(body.error ?? "Não foi possível iniciar o pagamento.");

// window.location, e não router.push: a checkoutUrl é do domínio do Asaas. O
// cartão é digitado lá, nunca numa página nossa — é o que dispensa afrouxar o
// Permissions-Policy e o X-Frame-Options do next.config.js.
window.location.href = body.checkoutUrl;
```

Botão desabilitado enquanto `estado !== "livre"`. O slug inicial é sugerido do
nome com `sugerirSlug`, importada de `@/lib/inscricao/slug` (Task 8) — a mesma
que o CRM usa.

- [ ] **Step 7: Conferir no navegador**

`localhost:3000/assinar?plano=MEMBRO_MESA_QR&ciclo=ANUAL` — resumo com R$ 1.649,89, slug conferindo ao vivo, PIX e cartão oferecidos. Trocar para `ciclo=MENSAL`: só cartão.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(client\)/assinar/ src/components/assinar/ src/proxy.ts src/proxy.test.ts src/lib/inscricao/
git commit -m "Publica a página de checkout com slug conferido ao vivo"
```

---

### Task 11: O webhook que provisiona

A task mais perigosa do plano: roda sozinha, é reentregue, e cria coisas que custam dinheiro.

**Files:**
- Create: `src/app/api/assinaturas/webhook/asaas/route.ts`
- Create: `src/app/api/assinaturas/webhook/asaas/route.test.ts`
- Modify: `src/proxy.ts`, `src/proxy.test.ts`

**Interfaces:**
- Consumes: `webhookAutorizado` (Task 6), `provisionTenant` (existente).

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe("webhook do Asaas", () => {
  it("recusa token inválido", async () => {
    const res = await POST(requisicao({ event: "PAYMENT_CONFIRMED" }, "errado"));
    expect(res.status).toBe(401);
    expect(provisionTenant).not.toHaveBeenCalled();
  });

  // O Asaas reentrega quando não recebe 200. Sem idempotência, a segunda
  // entrega cria um segundo restaurante para quem pagou uma vez.
  it("entrega repetida provisiona uma vez só", async () => {
    inscricaoFindFirst.mockResolvedValue({
      id: "insc-1", status: "PROVISIONADA", slug: "pizzaria",
    });

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).not.toHaveBeenCalled();
  });

  it("provisiona, cria assinatura e cobrança paga", async () => {
    inscricaoFindFirst.mockResolvedValue({
      id: "insc-1", status: "AGUARDANDO_PAGAMENTO", slug: "pizzaria",
      nome: "Pizzaria", email: "a@b.c", plano: "MEMBRO", ciclo: "MENSAL",
      asaasSubscriptionId: "sub_1",
    });

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).toHaveBeenCalledOnce();
    expect(assinaturaCreate.mock.calls[0][0].data.asaasSubscriptionId).toBe("sub_1");
    expect(cobrancaCreate.mock.calls[0][0].data.status).toBe("PAGA");
  });

  // Evento de assinatura que não é nossa não pode virar 500: o Asaas fica
  // reentregando para sempre.
  it("evento de inscrição desconhecida responde 200 sem fazer nada", async () => {
    inscricaoFindFirst.mockResolvedValue(null);

    const res = await POST(requisicao(eventoPago()));

    expect(res.status).toBe(200);
    expect(provisionTenant).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/assinaturas/webhook/asaas/route.test.ts`
Expected: FAIL — rota não existe.

- [ ] **Step 3: Guarda no proxy**

Junto da guarda de `/api/cron/`, com o mesmo comentário de motivo: o Asaas chama o host do deploy, que não é subdomínio de restaurante.

```ts
  if (nextUrl.pathname.startsWith("/api/assinaturas/webhook/")) {
    return NextResponse.next();
  }
```

Acrescentar o caminho ao `it.each` de "rotas que não pertencem a tenant nenhum" em `src/proxy.test.ts`.

- [ ] **Step 4: Implementar o handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma";
import { webhookAutorizado } from "@/lib/assinatura/asaas";
import { provisionTenant } from "@/lib/tenant-provisioning";
import { PRECOS } from "@/lib/plans";
import { competenciaDe, DIA_VENCIMENTO_MAX } from "@/lib/assinatura/competencia";
import { enviarBoasVindas } from "@/lib/assinatura/email-boas-vindas";

const PAGOS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

/** Sempre 200: o Asaas reentrega enquanto não receber, para sempre. */
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  if (!webhookAutorizado(req.headers.get("asaas-access-token"))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => null)) as {
    event?: string;
    payment?: {
      id?: string;
      value?: number;
      subscription?: string;
      externalReference?: string;
    };
  } | null;

  const evento = corpo?.event;
  const pagamento = corpo?.payment;
  if (!evento || !pagamento) return ok();

  // Este handler só sabe provisionar. Os outros eventos (PAYMENT_CREATED,
  // PAYMENT_OVERDUE) espelham cobrança de assinatura já existente e são
  // tratados na renovação — sair aqui com 200 evita reentrega infinita.
  if (!PAGOS.has(evento)) return ok();

  const inscricao = await prismaUnscoped.inscricao.findFirst({
    where: {
      OR: [
        { id: pagamento.externalReference ?? "__nenhum__" },
        { asaasPaymentId: pagamento.id ?? "__nenhum__" },
        { asaasSubscriptionId: pagamento.subscription ?? "__nenhum__" },
      ],
    },
  });

  // Pagamento que não é de uma inscrição nossa. 200, e não 404: um 404 faria o
  // Asaas reentregar para sempre um evento que nunca vai casar.
  if (!inscricao) return ok();

  // Idempotência. O Asaas reentrega quando não recebe 200 — sem esta linha, a
  // segunda entrega cria um segundo restaurante para quem pagou uma vez.
  if (inscricao.status === "PROVISIONADA") return ok();

  const agora = new Date();

  // A senha gerada aqui é descartada de propósito: o acesso chega por link de
  // criação de senha. Ver o comentário em email-boas-vindas.ts.
  const { tenant } = await provisionTenant({
    nome: inscricao.nome,
    slug: inscricao.slug,
    email: inscricao.email,
    plano: inscricao.plano,
  });

  // valorMensal é sempre o valor de UM mês, inclusive no anual: é o número que
  // o CRM mostra e o que a régua usaria se um dia esta assinatura deixar o
  // gateway. O total pago do ano vive na Cobranca abaixo.
  const diaVencimento = Math.min(agora.getUTCDate(), DIA_VENCIMENTO_MAX);
  const assinatura = await prismaUnscoped.assinatura.create({
    data: {
      tenantId: tenant.id,
      valorMensal: PRECOS[inscricao.plano].mensalCentavos / 100,
      diaVencimento,
      inicioCobranca: agora,
      ciclo: inscricao.ciclo,
      // Sempre presente: os dois ciclos criam assinatura no Asaas. É este id
      // que faz o cron pular a geração de cobrança para este cliente.
      asaasSubscriptionId: inscricao.asaasSubscriptionId,
    },
  });

  // Espelha o pagamento. É isto que mantém a régua, o proxy e o CRM
  // funcionando sem saber que existe gateway.
  await prismaUnscoped.cobranca.create({
    data: {
      assinaturaId: assinatura.id,
      competencia: competenciaDe(agora),
      valor: pagamento.value ?? PRECOS[inscricao.plano].mensalCentavos / 100,
      vencimento: agora,
      status: "PAGA",
      pagoEm: agora,
    },
  });

  await prismaUnscoped.inscricao.update({
    where: { id: inscricao.id },
    data: { tenantId: tenant.id, status: "PROVISIONADA" },
  });

  await prismaUnscoped.lead.updateMany({
    where: { email: inscricao.email, origem: "checkout", tenantId: null },
    data: { tenantId: tenant.id, status: "FECHADO" },
  });

  // O e-mail não pode derrubar o webhook: o tenant já existe, e um throw aqui
  // faria o Asaas reentregar um evento que a idempotência acima já barra —
  // resultado: cliente com restaurante criado e nenhum e-mail, para sempre.
  // O reenvio fica disponível no CRM.
  try {
    await enviarBoasVindas({
      tenantId: tenant.id,
      slug: tenant.slug,
      email: inscricao.email,
      nome: inscricao.nome,
    });
  } catch (erro) {
    console.error(
      `Tenant ${tenant.slug} provisionado, mas o e-mail de boas-vindas falhou:`,
      erro
    );
  }

  return ok();
}
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/assinaturas/ src/proxy.ts src/proxy.test.ts
git commit -m "Provisiona o restaurante quando o Asaas confirma o pagamento"
```

---

### Task 12: O e-mail de boas-vindas

**Files:**
- Create: `src/lib/assinatura/email-boas-vindas.ts`
- Create: `src/lib/assinatura/email-boas-vindas.test.ts`
- Modify: `src/app/api/assinaturas/webhook/asaas/route.ts`

**Interfaces:**
- Produces: `enviarBoasVindas(input: { tenantId: string; slug: string; email: string; nome: string }): Promise<void>`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
describe("e-mail de boas-vindas", () => {
  // 7 dias, e não a 1 hora do "esqueci a senha": aquela é curta porque a
  // pessoa acabou de pedir. Esta precisa sobreviver a quem paga meia-noite e
  // lê o e-mail de manhã.
  it("cria token de sete dias", async () => {
    const agora = new Date("2026-08-26T12:00:00Z");
    vi.setSystemTime(agora);

    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { expiresAt } = tokenCreate.mock.calls[0][0].data;
    expect(expiresAt).toEqual(new Date("2026-09-02T12:00:00Z"));
  });

  it("manda o link no domínio do restaurante, não no da plataforma", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html).toContain("pizzaria.munoapp.com.br/redefinir-senha?token=");
  });

  // Se a senha aparecesse aqui, ela viveria para sempre na caixa de entrada.
  it("não contém senha nenhuma", async () => {
    await enviarBoasVindas({
      tenantId: "t1", slug: "pizzaria", email: "a@b.c", nome: "Pizzaria",
    });

    const { html } = enviarEmail.mock.calls[0][0];
    expect(html.toLowerCase()).not.toContain("sua senha é");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/assinatura/email-boas-vindas.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import { prismaUnscoped } from "@/lib/prisma";
import { getResend } from "@/lib/resend";
import { buildTenantBaseUrl } from "@/lib/tenant-provisioning";

/**
 * Sete dias, e não a uma hora do "esqueci a senha".
 *
 * Aquela é curta porque a pessoa acabou de pedir e está na frente da tela.
 * Esta precisa sobreviver a quem paga meia-noite e lê o e-mail de manhã — um
 * link expirado aqui é um cliente que pagou e não consegue entrar.
 */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

export async function enviarBoasVindas(input: {
  tenantId: string;
  slug: string;
  email: string;
  nome: string;
}): Promise<void> {
  // Link de criação de senha, e não a senha em si. Senha no corpo do e-mail
  // viveria para sempre na caixa de entrada, e um envio que falhasse depois do
  // tenant criado deixaria uma credencial que ninguém tem.
  const token = await prismaUnscoped.passwordResetToken.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      expiresAt: new Date(Date.now() + VALIDADE_MS),
    },
  });

  // buildTenantBaseUrl monta a URL a partir da última entrada de ROOT_DOMAIN —
  // o link precisa ser o do restaurante, não o da plataforma, senão o token
  // chega num host onde a sessão dele não vale.
  const base = buildTenantBaseUrl(input.slug);
  const link = `${base}/redefinir-senha?token=${token.token}`;

  await getResend().emails.send({
    from: "Muno <contato@munoapp.com.br>",
    to: input.email,
    subject: `A Muno do ${input.nome} está no ar`,
    html: `
      <h1>Bem-vindo à Muno, ${input.nome}!</h1>
      <p>Seu restaurante já está no ar em <a href="${base}">${base}</a>.</p>
      <p>Seu login é <strong>${input.email}</strong>. Crie sua senha para entrar:</p>
      <p><a href="${link}"
            style="background:#D4612A;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;display:inline-block">
        Criar minha senha
      </a></p>
      <p style="color:#666;font-size:13px">Este link vale por 7 dias.</p>
    `,
  });
}
```

- [ ] **Step 4: Ligar no webhook**

Chamar no passo 9 do handler, dentro de `try/catch`: **falha de e-mail não pode derrubar o webhook**, porque o tenant já existe e o Asaas reentregaria o evento. Erro vai para `console.error`, e o reenvio fica disponível no CRM.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assinatura/email-boas-vindas.ts src/lib/assinatura/email-boas-vindas.test.ts src/app/api/assinaturas/
git commit -m "Manda o acesso por link de criação de senha, não a senha"
```

---

### Task 13: O cron apaga inscrição vencida

**Files:**
- Modify: `src/app/api/cron/assinaturas/route.ts`
- Modify: `src/app/api/cron/assinaturas/route.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
it("apaga inscrição não paga e vencida, soltando o slug", async () => {
  await executarComSegredo();

  expect(inscricaoDeleteMany).toHaveBeenCalledWith({
    where: {
      status: "AGUARDANDO_PAGAMENTO",
      expiraEm: { lt: expect.any(Date) },
    },
  });
});

// Inscrição paga esperando o webhook não pode ser apagada junto: o slug dela
// está reservado com razão.
it("não apaga inscrição já paga", async () => {
  const { where } = inscricaoDeleteMany.mock.calls[0][0];
  expect(where.status).toBe("AGUARDANDO_PAGAMENTO");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/cron/assinaturas/route.test.ts`
Expected: FAIL — `inscricaoDeleteMany` não foi chamado.

- [ ] **Step 3: Implementar**

No início de `executar`, antes do laço das assinaturas:

```ts
  // Slug abandonado não fica preso para sempre. Apagar, e não marcar como
  // expirada: enquanto a linha existir o slug @unique continua segurando o
  // nome, que é o que esta limpeza existe para soltar. O Lead criado no
  // checkout preserva o registro de quem tentou e não concluiu.
  const { count: inscricoesExpiradas } =
    await prismaUnscoped.inscricao.deleteMany({
      where: {
        status: "AGUARDANDO_PAGAMENTO",
        expiraEm: { lt: agora },
      },
    });
```

Incluir `inscricoesExpiradas` no JSON de resposta do job, junto dos contadores que já existem.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/
git commit -m "Solta o slug de inscrição abandonada no job diário"
```

---

### Task 14: CTAs da landing apontam para o checkout

**Files:**
- Modify: `public/vendas/index.html`

- [ ] **Step 1: Trocar os CTAs**

Os dez `href="#contato"` viram `href="/assinar?plano=MEMBRO&ciclo=MENSAL"`, **exceto** o do formulário de WhatsApp, que continua sendo a saída secundária. Os botões dentro dos cards de plano já recebem `class="cta-plano"` e `data-plano` na Task 2 — o toggle atualiza o `ciclo` deles.

- [ ] **Step 2: Rebaixar o formulário**

O bloco `#contato` ganha um título que o posiciona como alternativa — "Prefere falar com a gente antes?" — em vez de ser o destino principal. Continua gravando lead.

- [ ] **Step 3: Conferir no navegador**

`localhost:3000`: todo botão grande leva ao checkout com o plano certo; o toggle muda o ciclo dos links; o formulário continua enviando e gravando lead (`npm run db:studio`).

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — inclusive o teste de drift.

- [ ] **Step 5: Commit**

```bash
git add public/vendas/index.html
git commit -m "Aponta os CTAs da landing para o checkout"
```

---

## Verificação final, antes de considerar pronto

- [ ] `npm test` — suíte inteira verde
- [ ] `npx tsc --noEmit` — sem erro
- [ ] `npm run build` — compila
- [ ] Com `ASAAS_ENV=sandbox` e chave de sandbox: assinar mensal em cartão de teste, ver o tenant nascer, receber o e-mail, criar a senha e entrar
- [ ] Repetir no anual em PIX
- [ ] Reenviar o mesmo webhook duas vezes e conferir que só existe um tenant
- [ ] `admin.localhost:3000` — o cliente novo aparece em Clientes com a assinatura certa, e o lead aparece como FECHADO

**O último bloco depende da conta Asaas do Rodrigo, que ainda não existe.** Tasks 1 a 14 são todas implementáveis e testáveis sem ela — o cliente do gateway é testado com `fetch` simulado, como `asaas-adapter.test.ts` já faz. Quando a chave sair, só o bloco acima resta.

## Próximo plano

Onboarding de identidade e cancelamento com reembolso proporcional, cobertos na mesma spec e independentes deste plano: o checkout funciona sem eles, e um tenant recém-criado fica idêntico aos que hoje são criados à mão.
