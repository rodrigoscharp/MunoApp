# A porta de entrada da Muno no domínio raiz

Data: 2026-08-10

## Problema

`munoapp.com.br` serve o restaurante de demonstração. Quem ouvir a marca e digitar o
endereço cai num cardápio de hambúrguer com endereço em Ubatuba, telefone e horário de
funcionamento — e como o tenant de seed se chama "Muno Food Restaurante" e a landing se
chama "MUNOFOOD", a pessoa não percebe que errou. Ela conclui que a Muno *é* uma
hamburgueria. Isso é pior que um 404, que ao menos avisaria.

O mecanismo está em `src/proxy.ts:14`: `resolveSlugFromHost` devolve `null` para o domínio
raiz e a linha 101 cai em `slug = "default"`. Não existe página institucional no `src/app`
— só storefront de tenant, `/adm`, `/dashboard`, `/motoboy` e `/platform`. O raiz não tem o
que servir, então serve o seed.

A página de vendas existe e está pronta, em `join.munoapp.com.br`, noutro repositório.
Está no endereço errado.

## Decisão

O raiz passa a ser a página de vendas. Restaurantes seguem nos subdomínios, que é como o
app já funciona.

```
munoapp.com.br         -> muno-landing-page   (canônico, dispara o fetch de lead)
www.munoapp.com.br     -> muno-landing-page   (308 para o raiz)
join.munoapp.com.br    -> muno-landing-page   (308 para o raiz)
app.munoapp.com.br     -> muno                (API: endpoint de lead)
admin.munoapp.com.br   -> muno                (plataforma / CRM)
<slug>.munoapp.com.br  -> muno                (restaurantes)
```

## O host da API não custa código

A captação de lead publicada hoje chama `www.munoapp.com.br/api/leads/publico`. Mover o
`www` para o projeto da landing tiraria esse endereço do app e mataria a captação.

O endpoint ganha `app.munoapp.com.br`. **Isso não exige código**: a guarda criada para tirar
a rota do pipeline de tenant sai antes da busca no banco, então ela responde em qualquer
subdomínio coberto pelo curinga. Verificado em produção antes de escrever este documento —
`OPTIONS https://app.munoapp.com.br/api/leads/publico` já devolve `204` com
`access-control-allow-origin` correto.

`app` já consta em `RESERVED_SLUGS` (`src/lib/tenant-provisioning.ts`), então nenhum
restaurante pode tomá-lo.

`app.munoapp.com.br/` devolve o 404 "Restaurante não encontrado", porque nenhum tenant tem
esse slug. É aceitável: o host só existe para a API. Fica registrado por ser estranho de
ler em log, não por ser defeito.

## A única mudança de código

`origemPermitida` compara `origin` com um único `process.env.LANDING_ORIGIN`. Durante a
transição a landing existe em `join.munoapp.com.br` **e** em `munoapp.com.br`; com um valor
só, uma das duas toma 403 e perde lead em silêncio.

`LANDING_ORIGIN` passa a aceitar lista separada por vírgula:

```
LANDING_ORIGIN=https://munoapp.com.br,https://www.munoapp.com.br,https://join.munoapp.com.br
```

O formato tem precedente no próprio projeto: `ROOT_DOMAIN` já é lista lida assim
(`src/proxy.ts:8`). Não é convenção nova.

Requisitos do parsing:

- Valor único continua funcionando. É o formato que está em produção agora, e a variável
  só é trocada depois do deploy — se o parsing quebrasse o formato antigo, a captação
  cairia entre um passo e outro.
- Espaço em volta da vírgula é tolerado.
- Entrada vazia é ignorada, não vira origem permitida. `"a,,b"` não pode liberar `""`.
- A comparação continua exata por item — nada de `startsWith` ou de casar sufixo, que
  liberaria `munoapp.com.br.attacker.com`.

O resto da função não muda: produção segue falhando fechada sem a variável, e a liberação
de `localhost` segue restrita a fora de produção.

## Ordem, desenhada para não ter janela

| # | Onde | O quê | Por que aqui |
|---|---|---|---|
| 1 | MunoApp | parsing de lista + `LANDING_ORIGIN` com as três origens | Nada quebra: `join.` continua na lista |
| 2 | Landing | `ENDPOINT_LEAD` → `app.munoapp.com.br` | O host já responde e a origem `join.` já é aceita |
| 3 | Vercel | raiz e `www` para o projeto da landing, apex canônico | As três origens já estão liberadas quando o endereço muda |
| 4 | Vercel | `join.munoapp.com.br` redireciona para o raiz | Preserva link já compartilhado |

Cada passo é seguro isolado e nenhum depende do seguinte. Invertendo 1 e 3, a landing passa
a chamar de uma origem que o app ainda não conhece — 403 e lead perdido, sem nada quebrar
visivelmente.

## O que não muda, e por quê

**`ROOT_DOMAIN` fica `www.munoapp.com.br,munoapp.com.br`.** Parece candidato a limpeza já
que o app deixa de servir o raiz, mas `buildTenantBaseUrl` usa a **última** entrada para
montar a URL do restaurante (`src/lib/tenant-provisioning.ts:64-67`). Reduzir a lista
geraria `pizzaria.www.munoapp.com.br` — subdomínio de dois níveis, que o certificado
curinga não cobre. O ramo de `resolveSlugFromHost` que detecta domínio raiz vira código
morto e inofensivo.

**O tenant `default` continua onde está.** Ele só era problema por ser o que o raiz servia;
depois da mudança existe apenas em `default.munoapp.com.br`, que ninguém digita. Removê-lo
vira faxina, não correção, e faxina em produção sem necessidade é risco sem retorno.

## Fora de escopo

Página institucional própria dentro do app, aposentar `join.munoapp.com.br`, e mexer em
`NEXT_PUBLIC_APP_URL` (que monta webhook de gateway em
`src/app/api/payments/connections/route.ts:33`). Este último é a armadilha vizinha: hoje
nenhum restaurante tem gateway conectado, então nada quebra, mas quem for mexer no domínio
de novo precisa olhar para ela.

## Testes

Em `src/app/api/leads/publico/route.test.ts`:

- origem no meio da lista é aceita
- origem fora da lista toma 403
- lista com espaços em volta das vírgulas funciona
- valor único (formato atual) continua funcionando
- item vazio na lista não libera origem vazia
- produção sem `LANDING_ORIGIN` segue recusando (caso já existente, tem de continuar verde)
