<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# O banco

O desenvolvimento roda contra um Postgres local (`docker compose up -d`), nunca
contra o Supabase. Até 02/08/2026 o `DATABASE_URL` do `.env` apontava para o
banco de produção, com os pedidos de todos os restaurantes — `prisma migrate
dev` ali dentro é um reset a um prompt de distância.

```
docker compose up -d     sobe o Postgres local (porta 5433)
npm run db:reset         recria o schema e roda o seed
npm run db:migrate       cria uma migração nova
```

`db:migrate`, `db:push` e `db:reset` passam por `scripts/guard-local-db.js`, que
aborta se o `DATABASE_URL` não for localhost. Não contorne a trava: se ela
disparou, o alvo está errado.

Produção migra sozinha: o build da Vercel roda `scripts/migrate-on-deploy.js`,
que aplica as migrações pendentes com `prisma migrate deploy` antes de publicar.
Só no deploy de produção — preview builda e não migra, porque preview e produção
usam o mesmo banco e um PR não pode alterar o schema antes do review. Migração
que falha derruba o deploy, em vez de publicar código esperando coluna que não
existe.

Isso significa que **basta commitar a migração junto do código**: não há passo
manual. Se precisar aplicar fora do deploy, `npm run db:deploy` com as
credenciais de `.env.prod`, que nada carrega sozinho.

Não há Point-in-Time Recovery contratado no Supabase — é add-on pago e a decisão
foi não gastar por ora. A rede é um dump lógico em `backups/` (gitignored: o
arquivo tem telefone e endereço de cliente):

```
npm run db:backup        dump de produção + envio para o Blob
npm run db:recuperar     lista os dumps na nuvem; com argumento, baixa um
npm run db:espelhar      traz produção para o banco local, anonimizada
npm run db:deploy        migra produção, com backup obrigatório antes
```

O backup diário roda no **GitHub Actions** (`.github/workflows/backup.yml`, 06:00
UTC), não nesta máquina: dump de produção, compressão e envio para um store
**privado** do Vercel Blob, mantendo os 7 mais recentes. Depende dos secrets
`DIRECT_URL` e `BLOB_READ_WRITE_TOKEN` no repositório. Para disparar na mão:
`gh workflow run backup.yml`.

Rodar `npm run db:backup` localmente faz a mesma coisa e também sobe para o
Blob — o script funciona nos dois ambientes, usando `docker exec` quando o
container de dev está de pé e `docker run postgres:17` quando não está.

Na sua máquina o `.env.prod` **manda**, mesmo que já exista `DIRECT_URL` no
ambiente, e o script recusa qualquer host local. Os dois vieram do mesmo susto
em 05/08/2026: chamado de dentro do `db:espelhar --agora`, que já tinha
carregado o `.env`, o backup herdava o `DIRECT_URL` do Postgres de
desenvolvimento e ia dumpar o banco errado — com nome de produção, subindo para
o Blob e ocupando uma vaga da retenção. No CI não há `.env.prod` e nada muda.

Dump que falha não deixa arquivo, e o envio ignora `.sql` sem a linha final do
`pg_dump`. Um dump truncado na nuvem parece proteção e só se revela no dia da
restauração.

A retenção no Blob é por contagem de arquivos remotos, nunca por comparação com
`backups/`. No CI o repositório vem limpo e só existe o dump do dia; espelhar o
diretório local apagaria os outros seis da nuvem toda madrugada.

Recuperar numa máquina zerada: clonar o repo, `vercel link`, `vercel env pull
.env.local --yes`, apagar dali `DATABASE_URL`/`DIRECT_URL` (ver o aviso abaixo) e
`npm run db:recuperar`.

## A armadilha do .env.local

`vercel env pull`, `vercel link` e `vercel blob create-store` escrevem
`DATABASE_URL` **de produção** no `.env.local`, e o Next carrega esse arquivo com
prioridade sobre o `.env`. Sem perceber, o desenvolvimento inteiro passa a rodar
contra o banco dos restaurantes. Já aconteceu uma vez, em 02/08/2026.

Por isso `npm run dev` também passa pelo `guard-local-db.js` e se recusa a subir
apontando para fora de localhost. Depois de qualquer comando da Vercel, confira
o `.env.local`: só devem sobrar `BLOB_READ_WRITE_TOKEN` e `VERCEL_OIDC_TOKEN`.

**Para investigar problema de cliente, use `db:espelhar`, não produção.** Ele
restaura o dump mais recente no banco local e apaga nome, telefone, e-mail,
endereço, conteúdo de chat e credencial de gateway, preservando volume,
relacionamentos e status. Você fica com a forma real dos dados sem carregar dado
pessoal. As senhas viram `dev123`. O script se recusa a rodar contra qualquer
host que não seja localhost, porque ele derruba o banco de destino antes de
restaurar.

Toda tabela com `tenantId` obrigatório precisa de três coisas: entrada em
`src/lib/tenant-scoped-models.ts`, `@@index([tenantId])` no schema, e a policy
RLS na migração (copiar de
`20260801193000_rls_em_orderitem_e_deliverytracking`). O teste
`src/lib/tenant-scoped-models.test.ts` cobre a primeira.

**As três não fazem a mesma coisa, e confundi-las custa caro.** Quem separa um
restaurante do outro é a **extensão do Prisma** em `src/lib/prisma.ts`, guiada
pela lista de `tenant-scoped-models.ts`: é ela que injeta `tenantId` no `where`.
O RLS **não** escopa nada — as policies comparam com
`current_setting('app.current_tenant')`, e **essa variável nunca é definida em
lugar nenhum do código**. Sempre nula, a comparação é sempre falsa, e o efeito
real de toda policy é negar tudo para quem não tem `BYPASSRLS`.

Isso é o comportamento desejado, mas por um motivo diferente do que o nome
sugere. O RLS aqui é a trava contra a **chave pública do Supabase**, não contra
um tenant enxergar o outro:

* `anon` e `authenticated` recebem `SELECT, INSERT, UPDATE, DELETE, TRUNCATE`
  em todo o schema `public` por padrão do Supabase, e a API REST responde com a
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, que vai no bundle do navegador de todo
  cardápio.
* A aplicação conecta como `postgres`, que tem `BYPASSRLS` — por isso ligar RLS
  não muda nada para ela.
* **Tabela nova em `public` sem RLS nasce aberta para a internet inteira, com
  escrita.** Foi o que aconteceu com `Tenant`, `Lead`, `LeadNote` e
  `PlatformAdmin` até 10/08/2026: dava para ler os administradores da
  plataforma e inserir um novo, o que entrega o console. Fechado na migração
  `20260810200000_rls_nas_tabelas_de_plataforma`.

Duas consequências práticas:

1. **Toda tabela nova precisa de RLS, tenha `tenantId` ou não.** Se não tiver
   como escopar, ligue sem policy nenhuma — nega tudo para `anon` e não afeta a
   aplicação.
2. **Não confie no RLS para pegar bug de escopo entre tenants.** Ele não pega.
   Uma consulta que esqueceu o `tenantId` e usou `prismaUnscoped` devolve dado
   de outro restaurante sem o banco reclamar. O que protege é a lista de
   modelos, o cliente certo, e o teste ao lado.

## Remover um cliente

```
npm run tenant:remove -- --slug "x"                      mostra o que seria apagado
npm run tenant:remove -- --slug "x" --confirmar "x"      apaga (banco do .env)
npm run tenant:remove:prod -- --slug "x" --confirmar "x" produção, com backup antes
```

Sem `--confirmar` repetindo o slug, o comando só conta e sai — a confirmação
existe para pegar o erro de ter escolhido o tenant errado, e para isso é preciso
ler o nome na tela.

Nenhuma relação com `Tenant` tem `onDelete: Cascade`, de propósito: assim um
`tenant.delete()` acidental não leva os pedidos de um restaurante junto. O preço
é que apagar de verdade é apagar model por model, na ordem das foreign keys —
`ORDEM_DE_EXCLUSAO` em `src/lib/tenant-removal.ts`. O teste ao lado confere a
lista nos dois eixos, cobertura e ordem, lendo as relações do próprio
`schema.prisma`: **model novo com `tenantId` quebra o teste, não a remoção**.

O `Lead` é a exceção — ele só perde o vínculo. Lead é registro de prospecção da
plataforma, não dado do restaurante, e apagá-lo junto reescreveria o histórico
comercial por causa de um cliente que saiu.

# Os domínios

Desde 26/08/2026, **tudo** é servido por este projeto:

```
munoapp.com.br         a landing de vendas, em public/vendas/
www.  / join.          a mesma landing, 308 para o apex (vercel.json)
app.munoapp.com.br     a API pública
admin.munoapp.com.br   plataforma/CRM
<slug>.munoapp.com.br  restaurantes
```

Na Vercel, `munoapp.com.br` e `*.munoapp.com.br` pertencem ao projeto `muno`.
O projeto `muno-landing-page` existe sem domínio, congelado como rollback.

## O domínio raiz não pode virar um restaurante

Esta é a parte perigosa do `src/proxy.ts`, e vale ler antes de mexer nele.

Até 10/08/2026 o raiz caía em `slug = resolvedSlug ?? "default"` e servia o
restaurante do seed: quem ouvia a marca e digitava o endereço encontrava uma
hamburgueria em Ubatuba e concluía que a Muno era isso. A correção da época foi
tirar o raiz deste projeto, e o ramo virou código morto.

Trazer a landing para cá ressuscitou esse ramo. A guarda que o substitui trata
`resolvedSlug === null` e **cobre todo caminho do host raiz**, não só a home:

1. estático → segue para o filesystem
2. `/` → reescreve para `/vendas/index.html`
3. **qualquer outro caminho → 404**

O item 3 é o que importa. Uma guarda que tratasse só o `/` deixaria
`munoapp.com.br/promocao` reabrir exatamente o mesmo buraco, num caminho onde
ninguém repara. O fallback `?? "default"` foi removido junto: hoje não existe
linha capaz de transformar o raiz num tenant, e `src/proxy.test.ts` afirma isso
verificando que o raiz **não chama** `prisma.tenant.findUnique`.

Há o espelho, também no proxy: `/vendas/...` em host que não é raiz responde
404. A landing mora em `public/`, que responde em qualquer host — sem isso, a
página de vendas da Muno abre dentro do domínio do cliente.

**Em desenvolvimento vale o mesmo.** `ROOT_DOMAIN` não está no `.env`, então o
padrão é `localhost:3000`, que é raiz: `localhost:3000` mostra a landing e o
storefront do seed é **`default.localhost:3000`**. É atrito de propósito —
aplicar a guarda só em produção faria dev e produção divergirem no exato ramo
onde o bug mora.

## A landing é estática, e continua sendo

Ela é um documento HTML em `public/vendas/`, servido pelo filesystem. Não é
página do App Router, por dois motivos:

* `src/app/(client)/page.tsx` já resolve `/`. Dois route groups não podem
  produzir o mesmo caminho — o Next recusa o build.
* O app é Tailwind v4; a landing é Tailwind v3 por CDN. Como página React ela
  herdaria o `globals.css` pelo layout raiz e carregaria os dois preflights
  juntos, com as duas versões gerando as mesmas classes (`.text-sm`,
  `.shadow-sm`) com valores diferentes. Não quebra o build: entorta a página em
  silêncio.

Os arquivos vieram de `~/Dev/MunoSellPage` sem alteração, exceto por dois
pontos: as referências de asset viraram absolutas (`/vendas/css/...`), porque a
URL exibida continua sendo `/`, e o endpoint de lead virou relativo — o
endereço absoluto de produção faria a página, aberta em localhost, gravar lead
no banco dos clientes.

**Preço não se digita duas vezes.** `PRECOS` em `src/lib/plans.ts` é a fonte
única; a sugestão de mensalidade do CRM sai dela, e `src/lib/plans.test.ts` lê
`public/vendas/index.html` e falha se a página anunciar um valor que a tabela
não conhece — nas duas direções. Antes disso os dois viviam em repositórios
separados e já divergiam: a página dizia 99,99 e o CRM sugeria 99.

**`ROOT_DOMAIN` continua `www.munoapp.com.br,munoapp.com.br`.** Não é sobra:
`buildTenantBaseUrl` (`src/lib/tenant-provisioning.ts`) usa a **última** entrada
para montar a URL do restaurante, e encurtar a lista geraria
`pizzaria.www.munoapp.com.br` — dois níveis, fora do certificado curinga.

## A captação de lead

A landing grava lead em `/api/leads/publico`, hoje same-origin. Três coisas
precisam continuar verdadeiras:

1. **A rota sai do pipeline de tenant** por uma guarda em `src/proxy.ts`, antes
   do `findUnique`. Foi feita assim de propósito: pelo caminho normal a rota
   dependeria de um tenant existir, e morreria junto com o `default` no dia em
   que ele for removido. É também o que a mantém viva no host raiz, onde não
   existe tenant nenhum.
2. **`LANDING_ORIGIN` continua existindo**, mesmo com a landing same-origin. O
   navegador manda `Origin` em POST inclusive na mesma origem, e
   `origemPermitida()` compara com essa lista — esvaziá-la faz produção recusar
   a própria landing. Ela é lista separada por vírgula (mesmo formato de
   `ROOT_DOMAIN`) e precisa conter o apex. `localhost` passa fora de produção
   sem entrar na lista.
3. **`app` e `join` estão em `RESERVED_SLUGS`.** `join` porque a Vercel o
   redireciona para o apex antes de o app ver a requisição; `app` porque é o
   host da API.

Mexer em domínio aqui pede os dois roteiros, nesta ordem de leitura:
`docs/superpowers/specs/2026-08-10-porta-de-entrada-no-dominio-raiz.md`, que
tirou o raiz deste projeto, e
`docs/superpowers/specs/2026-08-26-landing-para-dentro-do-app-design.md`, que o
trouxe de volta. Os dois existem pelo mesmo motivo: a ordem dos passos é o que
evita a janela em que a landing fica fora do ar.
