# Captura de lead da landing no CRM

Data: 2026-08-10

## Problema

A landing de vendas existe, está no ar em `join.munoapp.com.br` e tem formulário. O que ela
não tem é memória: o submit em `js/main.js:193` monta uma mensagem e chama
`window.open("https://wa.me/...")`. Nada é gravado em lugar nenhum.

Quem preenche e não conclui o envio no WhatsApp — bloqueador de popup, desktop sem WhatsApp
instalado, desistência antes de apertar enviar — desaparece sem deixar rastro. O `Lead`
(`prisma/schema.prisma:358`) continua alimentado à mão, e o CRM só sabe dos leads que você
digitou.

Isso é aceitável enquanto o volume é zero. Deixa de ser no dia do primeiro post no Instagram,
que é justamente quando o volume chega e quando saber a taxa de conversão importa.

Este documento é o sub-projeto que o spec de 2026-07-31 (`plataforma-crm-leads`) deixou
explicitamente fora de escopo, sob o nome "captura pública de leads por formulário".

## Escopo

**Dentro:** um endpoint público que grava `Lead`, a mudança no `js/main.js` da landing para
chamá-lo, e a coluna `plano`.

**Fora:** funil e analytics — quantas visitas o post trouxe, quantas viraram formulário, taxa
de conversão. Isso exige registrar visita, não só submissão, e é um projeto diferente. Decidido
com o Rodrigo em 2026-08-10: por ora, só os leads caindo no CRM.

**Também fora:** trocar o WhatsApp por outro canal de atendimento. O WhatsApp continua sendo o
destino; a gravação é um efeito colateral dele.

## Dois repositórios

A landing mora em `~/Dev/MunoSellPage` (remote `rodrigoscharp/MUNO-Landing-Page`), fora deste
repositório, com o domínio apontado para outro projeto na Vercel. A implementação atravessa os
dois e gera dois commits independentes, um em cada.

Consequência que vale registrar: **os dois lados podem ser publicados fora de ordem.** O
endpoint precisa ir ao ar primeiro. Se a landing for publicada antes, o `fetch` falha, cai no
`.catch()` e o usuário nem percebe — o WhatsApp abre igual. É a ordem segura de errar, mas a
ordem certa é endpoint primeiro.

## Modelo

Uma coluna nova, nulável:

```prisma
model Lead {
  origem      String     @default("manual")
  plano       String?    // "Membro MUNO" | "Enterprise"
  status      LeadStatus @default(NOVO)
}
```

Nulável e sem default de propósito: lead digitado à mão continua sem plano, e isso é
informação — significa "não perguntei", não "não quis". Um default `"Membro MUNO"` faria o CRM
afirmar sobre todo lead histórico algo que ninguém perguntou.

`Lead` não está em `src/lib/tenant-scoped-models.ts` e o `tenantId` dele é vínculo opcional com
o cliente convertido, não escopo multi-tenant. Portanto **não** se aplicam as três exigências
do AGENTS.md (entrada no arquivo de modelos, `@@index([tenantId])`, policy RLS): esta migração
é só a coluna.

Migração: `prisma/migrations/<timestamp>_plano_no_lead/`.

## Fronteira: a mudança no proxy

Todo host passa por `src/proxy.ts`, e hoje não existe caminho público de escrita. Três formas
foram consideradas; a escolhida sai do pipeline de tenant explicitamente.

Guarda no ramo de tenant, **antes** da consulta ao banco (hoje a linha 113):

```ts
// Espelho da guarda de /platform/* logo acima, na direção oposta: aquela nega
// o que é da plataforma quando vem de fora dela; esta libera o que não
// pertence a tenant nenhum. Sair antes do findUnique é o ponto — assim a
// captura de lead não passa a depender de existir algum restaurante ativo,
// nem do tenant "default", que está para ser removido.
if (nextUrl.pathname === "/api/leads/publico") {
  return NextResponse.next();
}
```

Sem `x-tenant-id` injetado, o que obriga a rota a usar `prismaUnscoped` conscientemente — a
mesma disciplina que o comentário da linha 46 já estabelece para a área de plataforma.

### Por que não as outras duas

**Rota na raiz pelo caminho de tenant** (`www.munoapp.com.br/api/leads`, sem tocar no proxy)
seria a menor mudança hoje. Ela cai no ramo de tenant, resolve o slug `default` e segue. O
problema é a linha 118: tenant inexistente ou inativo devolve 404 antes de a rota rodar. A
remoção do restaurante de demonstração já está na mesa — e derrubaria a captura de leads junto,
em silêncio. Acoplar captação de lead a uma decisão de produto sobre dado de seed é o tipo de
dependência que ninguém lembra na hora de remover.

**Rota pública sob `admin.`** seria semanticamente correta, mas abre um caminho público num
host que hoje é inteiramente fechado por sessão. Furo estreito e testável, porém no meio da
fronteira de segurança — custo alto para benefício nenhum sobre a escolhida.

### Efeito colateral aceito

A rota responde em qualquer host, inclusive nos subdomínios de restaurante
(`pizzaria.munoapp.com.br/api/leads/publico`). É inofensivo: mesma rota, mesmo CORS, mesma
gravação em `prismaUnscoped`, nenhum dado de tenant envolvido. Fica registrado por ser
superfície a mais, não por ser risco.

## A rota

`src/app/api/leads/publico/route.ts`, com `POST` e `OPTIONS`. Fina: valida, delega para lib,
responde.

```
POST { restaurante, telefone, plano?, website? }
  │
  ├─ honeypot: website preenchido ──────────────► 201 { ok: true }, sem gravar
  ├─ rate limit por IP estourado ───────────────► 429
  ├─ zod reprova ───────────────────────────────► 400
  │
  ├─ decidirGravacao(leads da landing nas últimas 24h, telefone)
  │     ├─ criar ─────► prismaUnscoped.lead.create({ origem: "landing", ... })
  │     └─ atualizar ─► prismaUnscoped.lead.update({ where: { id }, ... })
  │
  └─────────────────────────────────────────────► 201 { ok: true }
```

### Validação

```ts
z.object({
  restaurante: z.string().trim().min(2).max(120),
  telefone: z.string().trim().max(20).refine(temDigitosDeTelefone),  // 10–13 dígitos
  plano: z.string().trim().max(60).optional(),
  website: z.string().max(200).optional(),                           // honeypot
})
```

O `max` em todo campo de texto é o que impede um POST de 2 MB virar uma linha de 2 MB no banco.

Duas escolhas de validação que não são óbvias:

**`telefone` é checado pelos dígitos, não pelo comprimento da string.** `(11) 99999-9999` tem
15 caracteres e 11 dígitos; `11999999999` tem 11 dos dois. Validar o texto cru aceitaria
`((((((((((` e recusaria formatação legítima. O `max(20)` continua existindo só como teto de
tamanho.

**`plano` é string livre, não enum.** Um `z.enum(["Membro MUNO", "Enterprise"])` casaria com o
select de hoje e transformaria a próxima mudança na landing — um plano novo, um texto ajustado
— em 400 silencioso, perdendo exatamente os leads que este projeto existe para não perder. Os
dois repositórios são publicados separadamente e vão sair de sincronia uma hora; o campo
precisa aguentar isso. O preço é aceitar valor fora da lista, que no pior caso vira um rótulo
estranho no CRM — barato perto de perder o lead.

### Honeypot

Campo escondido que humano não vê e bot preenche. Preenchido, a resposta é **201, sem gravar**.
Devolver 400 ensinaria ao bot que aquele campo é a armadilha; o silêncio não ensina nada.

O teste precisa afirmar *que não gravou*, não só que respondeu 201 — é a única forma de o
teste falhar se alguém remover a checagem no futuro.

### Rate limit

`src/lib/rate-limit.ts`: janela deslizante em memória, `Map<ip, number[]>`, teto de **5 envios
por 10 minutos** por IP, com poda das entradas velhas a cada chamada para o mapa não crescer
sem limite.

Duas honestidades sobre esse mecanismo, registradas para quem for reavaliar depois:

1. **É por instância da função, não global.** Fluid Compute reaproveita instâncias, então o
   limite morde na prática, mas várias instâncias significam vários contadores. É proporcional
   ao volume de um primeiro post, não a um ataque.
2. **É o que sobrou de proteção real, junto do honeypot.** CORS não protege nada aqui — ver
   abaixo.

O relógio é injetado, para o teste não depender de `sleep`.

### CORS

`OPTIONS` responde ao preflight; `POST` reflete a origem apenas se ela casar com a lista
permitida. Nunca `*`.

- Produção: `LANDING_ORIGIN` (env), valendo `https://join.munoapp.com.br`.
- Desenvolvimento: qualquer origem `localhost`/`127.0.0.1`, para testar a landing local contra
  o `npm run dev`.

**CORS não é controle de segurança neste endpoint.** Ele restringe o navegador de terceiros,
não o `curl` — qualquer um pode postar direto. Quem segura abuso é o honeypot e o teto por IP.
Registrado porque a presença de uma allowlist convida à conclusão errada.

`LANDING_ORIGIN` precisa ser configurada na Vercel antes do deploy. Ausente, o comportamento é
recusar toda origem cross-site — falha fechada, e a landing para de gravar. Preferível ao
inverso.

### Deduplicação

`src/lib/lead-landing.ts`, função pura: recebe os leads candidatos e o telefone novo, devolve
`{ acao: "criar" }` ou `{ acao: "atualizar", id }`.

- **Compara telefone normalizado** — só os dígitos. `(11) 99999-9999` e `11999999999` são a
  mesma pessoa. O valor gravado continua sendo o que a pessoa digitou; a normalização existe
  só para comparar, para não divergir do formato dos leads digitados à mão.
- **Janela de 24h.** Reenvio no mesmo dia atualiza; contato genuíno semanas depois vira lead
  novo, e você vê os dois.
- **Só considera leads com `origem = "landing"`.** Um lead que você criou à mão para aquele
  telefone nunca é sobrescrito pelo que a pessoa digitou no formulário.
- **Ao atualizar, `status` não se mexe.** Se você já moveu para `CONTATADO`, um reenvio não te
  joga de volta para `NOVO` — isso desfaria trabalho seu.

Atualiza `restaurante`, `plano` e, por consequência, `updatedAt` (que é o que ordena a listagem
em `src/app/api/platform/leads/route.ts:22`, então o lead ressurge no topo).

## Lado da landing

### `index.html`

Um campo honeypot dentro do `#leadForm`, escondido fora da tela — não `display:none`, que
alguns bots pulam — com `tabindex="-1"`, `autocomplete="off"` e `aria-hidden="true"` para
leitor de tela e navegação por teclado não esbarrarem nele.

### `js/main.js`

A ordem do handler inverte:

```js
document.getElementById("leadForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  // ...

  // O window.open vem PRIMEIRO e síncrono, dentro do gesto do submit. Depois
  // de um await ou .then() o Safari do iOS trata a janela como não solicitada
  // e bloqueia — e iPhone é de onde vem o tráfego de Instagram.
  window.open(`https://wa.me/5512996419003?text=${encodeURIComponent(msg)}`, "_blank");

  // Grava em paralelo, sem esperar e sem poder atrapalhar. keepalive para a
  // requisição sobreviver se a aba for descarregada.
  fetch(ENDPOINT, { method: "POST", keepalive: true, /* ... */ }).catch(() => {});
});
```

**A propriedade que isto garante: a rota nunca bloqueia o WhatsApp.** Endpoint fora do ar,
banco caído, CORS mal configurado — o lead se perde, mas a conversa acontece. O caminho que
gera receita não pode depender do caminho que gera relatório.

O `ENDPOINT` fica constante no topo do `main.js`, apontando para
`https://www.munoapp.com.br/api/leads/publico`. A landing é HTML estático sem build, então não
há de onde ler variável de ambiente.

## Testes

Seguindo o padrão do repositório — lógica em lib testada isolada, rota testada fina:

| Arquivo | Cobre |
|---|---|
| `src/lib/rate-limit.test.ts` | permite N, barra N+1, libera após a janela, poda entradas velhas. Relógio injetado, sem `sleep` |
| `src/lib/lead-landing.test.ts` | normalização de telefone, criar vs atualizar, ignora lead de origem manual, preserva `status`, respeita a janela de 24h, aceita telefone formatado e recusa texto sem dígitos suficientes |
| `src/app/api/leads/publico/route.test.ts` | honeypot responde 201 **e não grava**, payload inválido 400, origem não permitida barrada, 429 ao estourar o teto |

## Ordem de publicação

1. Migração e endpoint no MunoApp — a migração vai junto do código e a Vercel aplica no deploy
   de produção (`scripts/migrate-on-deploy.js`).
2. `LANDING_ORIGIN` configurada na Vercel.
3. Landing publicada.

Invertido, a landing chama um endpoint que não existe, o `fetch` falha em silêncio e o WhatsApp
abre igual. Erro sem consequência para o usuário, mas com perda de lead — vale seguir a ordem.
