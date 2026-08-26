# A landing de vendas passa a morar dentro do app

Data: 2026-08-26

## Problema

A página de vendas mora em `~/Dev/MunoSellPage`, repositório separado, publicado
no projeto `muno-landing-page` da Vercel. Isso foi decidido em 10/08
(`2026-08-10-porta-de-entrada-no-dominio-raiz.md`) e resolveu o problema da
época: o raiz servia o restaurante do seed.

Duas semanas depois, o próximo passo do produto é um checkout self-service — o
cliente escolhe o plano, paga, preenche os dados e recebe a Muno dele
funcionando, sem ninguém do lado da plataforma tocar em nada. Esse checkout
precisa do banco, do Prisma e de segredo de gateway. A landing estática não tem
nada disso.

O problema imediato não é o checkout, é o **preço**. A mensalidade vai subir para
R$ 119,99 (Membro) e R$ 149,99 (Membro + Mesas QR), com opção anual. Hoje o valor
vive em dois repositórios publicados separadamente:

- `index.html` da MunoSellPage diz `R$ 99,99/mês`
- `MENSALIDADE_SUGERIDA` em `src/components/platform/ConverterLead.tsx` diz `"99"`

**Eles já divergem hoje**, sem consequência, porque nada cobra automaticamente:
o operador lê o número na tela e digita o que quiser. No dia em que um gateway
emitir a cobrança sozinho, essa divergência vira cobrança com valor diferente do
anunciado na página. Não é detalhe estético.

## Decisão

A landing muda de casa: passa a ser servida pelo projeto `muno`, a partir de
`public/vendas/` no repositório do MunoApp. O apex, `www` e `join` mudam de
projeto na Vercel.

Este documento cobre **só a mudança de casa**. Preço novo, ciclo anual e checkout
são o projeto seguinte. A separação é deliberada: assim a verificação deste passo
é "a página está idêntica e o restaurante de ninguém caiu", que é uma afirmação
que dá para provar.

## Estática, não React

A landing continua sendo um documento HTML estático. Não vira página do App
Router.

O motivo é concreto. O app é Tailwind v4 (`@import "tailwindcss"` e `@theme
inline` em `src/app/globals.css`); a landing é Tailwind v3 servido por
`cdn.tailwindcss.com`, configurado por um objeto `tailwind.config` inline. Como
página React ela herdaria o `globals.css` pelo `layout.tsx` raiz e carregaria os
dois preflights na mesma página, com as duas versões gerando as **mesmas
classes** (`.text-sm`, `.shadow-sm`, `.rounded-lg`) com valores diferentes.
Vence quem carregar por último.

Isso não quebra o build. Não dá erro de tipo, não derruba teste. Dá página torta
em silêncio, e a única forma de achar é olhando. Servida como documento estático,
a landing fica fora do layout raiz e o conflito não existe.

O preço dessa escolha: a landing nunca lê o banco e segue em JavaScript puro. Para
uma página de marketing, é o que ela já é hoje.

## Por que `public/` funciona

Documentado em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
seção *Execution order*:

```
3. Proxy (rewrites, redirects, etc.)
5. Filesystem routes (public/, _next/static/, pages/, app/, etc.)
```

A reescrita do proxy acontece antes das rotas de filesystem, então
`NextResponse.rewrite("/vendas/index.html")` resolve para `public/vendas/index.html`.

Ela **não** pode ser uma rota do App Router: `src/app/(client)/page.tsx` já
resolve `/`, e dois route groups não podem produzir o mesmo caminho — o Next
recusa o build com "two parallel pages resolve to the same path".

## A guarda de raiz, e por que ela é o risco deste projeto

Hoje `resolveSlugFromHost` (`src/proxy.ts`) devolve `null` no domínio raiz e a
linha seguinte faz `slug = resolvedSlug ?? "default"`. O spec de 10/08 chama esse
ramo de *"código morto e inofensivo"*, porque o raiz deixou de ser servido por
este projeto.

Depois desta mudança ele deixa de ser morto.

**A guarda precisa cobrir todo caminho do host raiz, não só `/`.** Uma guarda que
trate apenas a home deixa `munoapp.com.br/promocao` cair em `slug = "default"` e
servir a hamburgueria de Ubatuba — o mesmo bug de 10/08, deslocado para um path
em vez da home, e por isso ainda mais difícil de notar.

O ramo, para `resolvedSlug === null`, em ordem:

1. Estático (`/_next/`, ou caminho com extensão) → segue, o filesystem serve.
2. `/`, com ou sem barra final → reescreve para `/vendas/index.html`.
3. Qualquer outro caminho → 404. Nunca `slug = "default"`.

Posição no arquivo: **depois** das guardas de `/api/leads/publico` e `/api/cron/`,
**antes** do `prisma.tenant.findUnique`. A ordem não é estética — com a landing
agora same-origin com o app, o `POST /api/leads/publico` sai do apex, e um ramo de
raiz colocado antes dessa guarda mataria a captação de lead.

E o espelho, no caminho de tenant: caminho começando com `/vendas/` num host que
não é raiz responde 404. Sem isso, `pizzaria.munoapp.com.br/vendas/index.html`
serve a página de vendas da Muno dentro do domínio do cliente, e o Google indexa
a mesma landing em quantos subdomínios existirem.

## Dev passa a ser igual a produção

`ROOT_DOMAIN` não está no `.env`, então em desenvolvimento o padrão é
`localhost:3000` — que é domínio raiz. Consequência: `localhost:3000` passa a
servir a landing, e o storefront do seed vira `default.localhost:3000`.

É atrito real no dia a dia, e foi aceito de propósito. A alternativa — aplicar a
guarda só em produção — faria dev e produção divergirem exatamente no ramo de
código onde mora o bug que 10/08 consertou. Bug que só existe em produção é o
pior tipo.

## O teste que impede o drift de preço

Estar no mesmo repositório não impede a divergência, só a torna detectável. O que
impede é um teste.

- `src/lib/plans.ts` ganha `PRECOS`, tabela por `PlanoTenant`, com os valores
  **de hoje**. Sem ciclo anual — isso é do projeto seguinte.
- `MENSALIDADE_SUGERIDA` em `ConverterLead.tsx` passa a derivar de `PRECOS` em vez
  de repetir os números. Corrige de graça o `99` contra o `99,99`.
- Um teste lê `public/vendas/index.html` do disco e afirma que o preço formatado
  de cada plano aparece no HTML.

A partir daí, preço alterado em um lugar só derruba o build. É isso que torna o
projeto do checkout uma edição em um arquivo.

## Ordem, desenhada para não ter janela

| # | Onde | O quê | Por que aqui |
|---|---|---|---|
| 1 | MunoApp | Este spec | Antes do código |
| 2 | MunoApp | `public/vendas/`, guarda no proxy, testes, `vercel.json`, docs — deploy | A página passa a responder em `app.munoapp.com.br/`; o apex ainda é do outro projeto e o público não vê diferença |
| 3 | — | Conferir `app.munoapp.com.br/` contra a landing atual, lado a lado | O passo 4 é o irreversível; só se avança com a página provada de pé |
| 4 | Vercel | Apex, `www` e `join` saem de `muno-landing-page` e entram em `muno` | Único passo com janela. Os arquivos já estão publicados esperando |
| 5 | Vercel | `muno-landing-page` sem domínios, projeto e último deploy preservados | Volta em minutos se o apex der problema |
| 6 | +1 semana | Arquivar o repo MunoSellPage | Fim da janela de rollback |

Inverter 2 e 4 aponta o apex para um projeto que ainda não tem a página: a landing
sai do ar até o deploy seguinte.

## O que não muda, e por quê

**`ROOT_DOMAIN` continua `www.munoapp.com.br,munoapp.com.br`.** Mesmo motivo de
10/08: `buildTenantBaseUrl` usa a **última** entrada, e encurtar a lista geraria
`pizzaria.www.munoapp.com.br` — dois níveis, fora do certificado curinga.

**`LANDING_ORIGIN` e o CORS de `/api/leads/publico` ficam.** A landing passa a ser
same-origin e não precisa mais deles, mas a variável some só quando não houver mais
nenhuma cópia publicada da landing antiga — e o passo 5 mantém uma de pé de
propósito. Remover no mesmo passo em que se corta a rede de segurança é trocar duas
mudanças arriscadas de lugar.

**O tenant `default` continua onde está.** Segue valendo o que 10/08 disse: removê-lo
é faxina, não correção.

**HSTS continua sem `preload`.** O comentário em `next.config.js` justifica a
ausência dizendo que "o apex pertence a outro projeto", o que deixa de ser verdade —
o texto é corrigido. A decisão não: entrar na lista dos navegadores continua sendo
difícil de desfazer.

## Fora de escopo

Preços novos, ciclo anual, toggle mensal/anual, checkout, gateway, conversão para
React, aposentar o tenant `default`, e mexer em `NEXT_PUBLIC_APP_URL` — que segue
sendo a armadilha vizinha, e agora com data marcada: o webhook do gateway a usa.

## Testes

Em `src/proxy.test.ts`:

- o raiz reescreve para `/vendas/index.html`
- o raiz **não** consulta `prisma.tenant.findUnique` — é esta asserção, e não a do
  rewrite, que prova que o seed não pode mais vazar no domínio raiz
- caminho qualquer no raiz responde 404, e não o tenant `default`
- asset da landing no raiz passa sem rewrite
- `POST /api/leads/publico` no raiz continua passando
- `/vendas/...` em host de tenant responde 404
- host de tenant segue resolvendo o tenant

Em `src/lib/plans.test.ts`: o preço de cada plano em `PRECOS` aparece em
`public/vendas/index.html`.
