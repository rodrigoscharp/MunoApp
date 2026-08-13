# Personalização do lead no funil

Data: 2026-08-11

## Problema

Hoje um restaurante convertido de lead (`POST /api/platform/leads/[id]/converter`) nasce com
o storefront mostrando dados da Muno, não dele. `provisionTenant`
(`src/lib/tenant-provisioning.ts:74`) só grava `Tenant.nome` e `Tenant.slug` — nome do
restaurante, endereço, telefone e logo que aparecem para o cliente final vêm de um `Setting`
com `key: "restaurant_info"` (`src/lib/restaurant.ts`), e esse `Setting` **nunca é criado no
provisionamento**. `getRestaurantInfo` (`src/lib/restaurant.ts:44`) cai no fallback `DEFAULT`
quando o `Setting` não existe:

```ts
const DEFAULT: RestaurantInfo = {
  name: "Muno Food Restaurante",
  address: "Rua Paraty 1772, Ubatuba-SP",
  phone: "(12) 99999-0000",
  logoUrl: "/munowbg.png",
};
```

Ou seja: todo restaurante novo mostra "Muno Food Restaurante" em Ubatuba, com a logo da Muno,
até o cliente entrar em `RestaurantInfoControl.tsx` e editar na mão. Mesmo o **nome**, que já é
conhecido no momento da conversão, fica errado até lá.

A ideia: permitir que quem cadastra o lead no funil da plataforma já preencha endereço e logo
(campos opcionais — "nem sempre será feito isso"), e usar isso — junto do nome e telefone, que
já são coletados hoje e não propagam para lugar nenhum — para que o `Setting` nasça correto no
momento da conversão, em vez de nascer ausente.

## Escopo

**Dentro:** dois campos novos no `Lead` (endereço, logo), no formulário de cadastro
(`NovoLeadForm.tsx`) e na validação da rota de criação; propagação de nome/endereço/telefone/logo
para o `Setting("restaurant_info")` do tenant no momento da conversão; ajuste na rota de upload
para aceitar sessão de plataforma.

**Fora:** editar esses campos na tela de conversão (`ConverterLead.tsx`) — se o lead foi
cadastrado sem eles, o fluxo continua igual ao de hoje (fallback pro `DEFAULT`), e dá pra editar
depois pelo próprio painel do cliente, que já existe. Busca automática de endereço/logo (Google
Places, site do restaurante) — o pedido foi por preenchimento manual, não integração externa.

## Modelo

Dois campos novos no `Lead` (`prisma/schema.prisma:356`), seguindo o padrão dos opcionais que já
existem (`contato`, `cidade`):

```prisma
model Lead {
  ...
  cidade      String?
  endereco    String?
  logoUrl     String?
  origem      String     @default("manual")
  ...
}
```

Nada de coluna JSON: são só dois campos, e o `Lead` não usa JSON em nenhum outro lugar do
schema — colunas simples bastam e continuam legíveis num `SELECT * FROM "Lead"` na hora de
depurar.

`Lead` não está em `src/lib/tenant-scoped-models.ts` (é registro de prospecção da plataforma,
sem tenant ainda) — as três exigências do AGENTS.md para tabela com `tenantId` obrigatório não
se aplicam aqui, é só a migração da coluna.

## Formulário de cadastro (`NovoLeadForm.tsx`)

Dois campos novos, ambos opcionais, ao lado dos que já existem em `CAMPOS`
(`src/components/platform/NovoLeadForm.tsx:7`):

- **Endereço**: input de texto livre, mesmo formato do `RestaurantInfo.address` — sem CEP
  estruturado, sem lat/lng, é texto solto que vai para uma etiqueta.
- **Logo**: upload de arquivo, não campo de URL. Reaproveita a mesma experiência de
  `RestaurantInfoControl.tsx` (escolhe arquivo → sobe → guarda a URL pública), então extraio a
  lógica de `fetch("/api/upload", ...)` hoje duplicada dentro de `uploadLogo` para uma função
  pequena compartilhada, em vez de reescrever o mesmo `FormData` dentro do formulário de lead.

O `POST /api/platform/leads` (`src/app/api/platform/leads/route.ts:6`) ganha `endereco` e
`logoUrl` no `createSchema`, como `z.string().optional()` — mesmo tratamento dos demais campos
livres (`trim()` vazio vira `null`, linha 42-44 do arquivo).

### A rota de upload precisa aceitar sessão de plataforma

`POST /api/upload` (`src/app/api/upload/route.ts:6`) hoje só aceita `auth()` — sessão do tenant,
cookie `muno.session-token` implícito — com `role === "ADMIN"`. No momento de cadastrar um lead
não existe tenant nem essa sessão: quem está logado é um admin de plataforma, autenticado por
`authPlatform()` (`src/lib/auth-platform.ts:16`), sessão com cookie próprio
(`muno-platform.session-token`) e sem conceito de `role` — só `id`/`nome`/`email` de
`PlatformAdmin`.

O guard da rota passa a aceitar as duas sessões:

```ts
const tenantSession = await auth();
if (tenantSession?.user.role !== "ADMIN") {
  const platformSession = await authPlatform();
  if (!platformSession?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
}
```

O resto da rota não muda: o nome do arquivo já é `${Date.now()}-${random}.${ext}`, sem
`tenantId` no path, então o bucket `product-images` já é agnóstico de tenant — não precisa
segregar por pasta para este caso.

## Propagação na conversão

`provisionTenant` (`src/lib/tenant-provisioning.ts:74`) ganha três campos opcionais na entrada:

```ts
export async function provisionTenant(input: {
  nome: string;
  slug: string;
  email: string;
  senha?: string;
  endereco?: string;
  telefone?: string;
  logoUrl?: string;
}): Promise<{ tenant: Tenant; admin: User; url: string; senha: string }>
```

E, dentro da mesma transação que já cria `tenant` e `admin` (linha 87-130), cria também o
`Setting("restaurant_info")`:

```ts
await tx.setting.create({
  data: {
    tenantId: tenant.id,
    key: "restaurant_info",
    value: JSON.stringify({
      name: input.nome,
      address: input.endereco?.trim() || DEFAULT.address,
      phone: input.telefone?.trim() || DEFAULT.phone,
      logoUrl: input.logoUrl?.trim() || DEFAULT.logoUrl,
    }),
  },
});
```

`DEFAULT` passa a ser exportado de `src/lib/restaurant.ts` em vez de ficar privado ao módulo,
para não duplicar os quatro valores em dois arquivos.

**Decisão que vale registrar: o `Setting` passa a ser sempre criado, não só quando o lead trouxe
endereço/logo.** O nome (`input.nome`) é sempre conhecido no provisionamento — é o mesmo valor
que já vira `Tenant.nome` hoje — e por isso o `Setting.name` sempre estará correto a partir desta
mudança, mesmo para lead sem nenhum campo novo preenchido. Isso corrige de lambuja o gap descrito
no Problema (nome errado até edição manual) para *todo* tenant novo, não só os com endereço/logo.
`address`/`phone`/`logoUrl` continuam caindo no `DEFAULT` de sempre quando o lead não trouxe
informação — sem regressão para quem não usar os campos novos.

Como `provisionTenant` também é chamado por `scripts/create-tenant.ts` (CLI, sem lead nenhum por
trás), o efeito ali é o mesmo: o `Setting` passa a ser criado também para tenants provisionados
pela CLI, com `name` correto e o resto no `DEFAULT` — hoje esses tenants não tinham `Setting`
nenhum e dependiam do fallback do `getRestaurantInfo`. É uma mudança de comportamento pequena e
na mesma direção da correção, não um efeito colateral escondido.

O chamador em `src/app/api/platform/leads/[id]/converter/route.ts:53` passa a enviar os três
campos do lead:

```ts
const { tenant, admin, url, senha } = await provisionTenant({
  nome: parsed.data.nome ?? lead.restaurante,
  slug: parsed.data.slug,
  email: parsed.data.email,
  endereco: lead.endereco ?? undefined,
  telefone: lead.telefone ?? undefined,
  logoUrl: lead.logoUrl ?? undefined,
});
```

**Isso quebra a limpeza do tenant fantasma se eu não ajustar mais uma coisa.** O
`Setting` (`prisma/schema.prisma:190-200`) não tem `onDelete: Cascade` — nenhuma relação com
`Tenant` tem, de propósito (ver AGENTS.md, seção "Remover um cliente"). Antes desta mudança
`tenant.delete()` no desfazimento da corrida perdida (linha 117-126 do converter) nunca batia
nessa FK porque não existia `Setting` nenhum para o tenant recém-criado. Agora existe sempre, e
o delete falharia com violação de foreign key. A `$transaction` de limpeza (linha 117-126) ganha
um delete de `Setting` antes do `Tenant`, ao lado dos que já limpam `Assinatura` e `User`:

```ts
await prismaUnscoped.$transaction([
  prismaUnscoped.assinatura.deleteMany({ where: { tenantId: tenant.id } }),
  prismaUnscoped.setting.deleteMany({ where: { tenantId: tenant.id } }),
  prismaUnscoped.user.deleteMany({ where: { tenantId: tenant.id } }),
  prismaUnscoped.tenant.delete({ where: { id: tenant.id } }),
]);
```

## Testes

| Arquivo | Cobre |
|---|---|
| `src/app/api/platform/leads/route.test.ts` | aceita `endereco`/`logoUrl` opcionais, `trim()` vazio vira `null` |
| `src/lib/tenant-provisioning.test.ts` | `Setting("restaurant_info")` criado com `name` sempre correto; `address`/`phone`/`logoUrl` caem no `DEFAULT` quando não informados; criado também sem nenhum campo novo (via CLI) |
| `src/app/api/platform/leads/[id]/converter/route.test.ts` | lead com endereço/logo preenchidos produz `Setting` com esses valores; lead sem eles produz `Setting` com `DEFAULT` nesses campos; corrida perdida desfaz o tenant fantasma sem falhar por FK do `Setting` |
| `src/app/api/upload/route.test.ts` | aceita sessão de tenant ADMIN (comportamento atual) e sessão de plataforma (novo); recusa sem nenhuma das duas |

## Migração

Uma migração só, adicionando as duas colunas nuláveis ao `Lead`:
`prisma/migrations/<timestamp>_endereco_e_logo_no_lead/`. Vai junto do código; produção aplica
no deploy via `scripts/migrate-on-deploy.js`, sem passo manual.
