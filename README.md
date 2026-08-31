<div align="center">

<img src="public/muno-marca.png" alt="Muno" width="300">

**A plataforma que põe o restaurante inteiro numa URL.**

Cardápio digital, pedido por QR na mesa, cozinha, entrega com GPS, pagamento
no gateway do próprio dono — e o CRM que vende tudo isso.

<br>

![Next.js](https://img.shields.io/badge/Next.js-16-23201E?style=flat-square&labelColor=23201E&color=D4612A)
![React](https://img.shields.io/badge/React-19-23201E?style=flat-square&labelColor=23201E&color=D4612A)
![TypeScript](https://img.shields.io/badge/TypeScript-6-23201E?style=flat-square&labelColor=23201E&color=D4612A)
![Prisma](https://img.shields.io/badge/Prisma-6-23201E?style=flat-square&labelColor=23201E&color=2B5240)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-23201E?style=flat-square&labelColor=23201E&color=2B5240)
![Tailwind](https://img.shields.io/badge/Tailwind-4-23201E?style=flat-square&labelColor=23201E&color=2B5240)
![Testes](https://img.shields.io/badge/testes-1749-23201E?style=flat-square&labelColor=23201E&color=2B5240)

</div>

---

## O que é

A Muno é **multi-tenant de verdade**: um deploy só atende todos os restaurantes,
e cada um vive no próprio subdomínio com o próprio cardápio, os próprios
clientes e o próprio gateway de pagamento. O dinheiro do pedido cai direto na
conta do restaurante — a Muno nunca é parte da transação.

```
munoapp.com.br              landing de vendas e checkout self-service
app.munoapp.com.br          API pública
admin.munoapp.com.br        console da plataforma — CRM e cobrança
<slug>.munoapp.com.br       o restaurante: cardápio, painel, cozinha, entrega
```

O `src/proxy.ts` resolve o tenant pelo subdomínio a cada requisição e injeta
`x-tenant-id` no pipeline. Daí para dentro, uma extensão do Prisma escopa
**toda** consulta automaticamente — quem esquecer o `tenantId` não vaza dado de
outro restaurante, porque não tem como.

O domínio raiz é a exceção: ele serve a landing e **não pode virar restaurante
nenhum**. Já virou uma vez, em 10/08/2026, quando quem digitava o endereço da
marca encontrava a hamburgueria do seed. Hoje não existe linha capaz de
transformar o raiz num tenant, e um teste afirma isso verificando que o raiz
sequer consulta a tabela.

---

## Funcionalidades

### A venda — landing e checkout self-service

A página de vendas mora em `public/vendas/`, servida pelo filesystem no domínio
raiz, e desde 26/08/2026 vive **neste** repositório: era um projeto separado, e
com isso o preço anunciado e o preço cobrado divergiam sem ninguém perceber.
Hoje `src/lib/plans.ts` é a fonte única, e um teste lê o HTML da landing e
falha se ela anunciar um valor que a tabela não conhece.

Dali saem dois caminhos:

- **Falar com um humano** — o formulário abre o WhatsApp e grava o lead no CRM
  em paralelo, com dedupe por telefone, honeypot e limite por IP. O envio nunca
  bloqueia a conversa: se a gravação falhar, o lead se perde e o WhatsApp abre
  do mesmo jeito
- **Assinar sozinho** — `/assinar` reserva o endereço do restaurante, cria a
  assinatura no Asaas e devolve para onde pagar. Pago, o webhook provisiona o
  restaurante inteiro e manda as credenciais por e-mail. A `Inscricao` segura o
  slug antes de qualquer cobrança existir, para ninguém pagar por um endereço
  que outra pessoa levou no meio do caminho

Quem acabou de nascer cai num roteiro de primeiros passos no `/adm`
(`src/lib/onboarding.ts`), que leva do restaurante vazio ao primeiro item no
cardápio.

### Cardápio digital — o cliente

| | |
|---|---|
| **Cardápio por categorias** | Navegação com âncora por seção, busca visual, foto por item |
| **Assistente de IA** | O "Muno" (Groq / LLaMA 3.3 70B) lê o cardápio e recomenda por nível de fome e restrição alimentar — vegano, sem glúten, sem lactose. Responde com os itens já prontos para adicionar ao carrinho |
| **Carrinho persistente** | Sobrevive a recarregar a página e ao redirect do login (Zustand + localStorage) |
| **Upsell no carrinho** | Sugere o item mais barato de categorias que ainda não estão no pedido |
| **Cupom de desconto** | Percentual, valor fixo ou frete grátis. Prévia no checkout, recálculo do zero no servidor |
| **Entrega ou retirada** | Frete pela zona cadastrada, escolhida pelo bairro — o preço vem do banco, nunca da requisição |
| **Pagamento** | PIX com QR e copia-e-cola, cartão via checkout do gateway, ou dinheiro na entrega |
| **Acompanhamento ao vivo** | Linha do tempo do status, previsão de entrega calculada por rota real (OSRM) e mapa com o motoboy em movimento |
| **Chat com o restaurante** | Por pedido, com respostas rápidas que mudam conforme o status |
| **Sino de notificações** | Avisa mudança de status e mensagem nova, com histórico local |
| **Horário de funcionamento** | Faixa no topo com aberto/fechado calculado em horário de Brasília |
| **Conta e histórico** | Cadastro, login, recuperação de senha por e-mail, pedidos anteriores |

### Mesa por QR Code

Cada mesa tem um token próprio. O cliente aponta a câmera e cai direto no
cardápio daquela mesa — **sem login**.

- Pedido identificado pela mesa, com o nome de quem pediu
- Vários pedidos na mesma mesa, de pessoas diferentes, na mesma conta
- Tela de conta ao vivo, agrupada por pessoa, atualizando sozinha
- Fechamento no balcão: 10% de serviço opcional, divisão em várias formas de
  pagamento e recibo impresso

> Exclusivo do plano **Membro + Mesas QR**. A trava é verificada na tela, na API
> e no `proxy` — não só escondendo o botão.

### Painel do restaurante — `/adm`

**Resultados**
- Dashboard com receita do dia e do mês, pedidos em aberto e itens no cardápio
- Gráfico de vendas dos últimos 30 dias, ranking de pratos e quebra por forma de
  pagamento — tudo no calendário de Brasília e com uma definição única de receita
- Lista completa de pedidos com itens, cliente, mesa e status
- Central de chats, com todas as conversas abertas

**Restaurante**
- **Cardápio** — categorias com ordenação, itens com foto, preço, descrição e
  disponibilidade; upload de imagem direto para o Supabase Storage
- **Mesas (QR)** — cadastro, QR pronto para imprimir, mapa do salão com as mesas
  posicionadas por arrastar sobre a planta, e status livre/ocupada com total em
  aberto
- **Motoboys** — cria o acesso do entregador e gerencia quem pode entrar
- **Pagamentos** — conecta o próprio gateway, em duas etapas, com validação da
  credencial contra a API antes de salvar
- **Gerenciamento** — nome, endereço, telefone, logo, planta do salão, tempo
  estimado de entrega, horário por dia da semana, zonas de entrega com preço,
  cupons e configuração de impressora
- **Assinatura** — a própria fatura: valor, vencimento, histórico e situação

### Cozinha — `/dashboard`

Quadro Kanban em quatro colunas (Pendente → Confirmado → Em preparo → Pronto),
com o pedido avançando e voltando por clique. Mostra número da mesa, tipo de
entrega e observação de cada item. Atualiza por Broadcast em tempo real, com
polling de 30s como rede de segurança.

### Entregador — `/motoboy`

- Lista de entregas disponíveis, com endereço e itens
- Aceitar corrida é atômico: dois entregadores nunca saem para o mesmo pedido
- Envio contínuo da posição GPS, que alimenta o mapa do cliente
- Mapa com a rota até o destino e conclusão da entrega

### Console da plataforma — `admin.munoapp.com.br`

O lado comercial da Muno, com login separado (cookie próprio, `PlatformAdmin`).

- **Visão geral** — MRR, leads da semana, funil por etapa e cobranças a receber
- **Conversão** — quanto do lead vira cliente, recortado por porta de entrada e
  por coorte de entrada, a escada da visita ao restaurante no ar com a perda em
  cada degrau, tempo mediano até fechar e receita por plano e ciclo
- **Leads** — captação automática pela landing (com dedupe por telefone,
  honeypot e limite por IP) ou cadastro manual; funil
  `NOVO → CONTATADO → NEGOCIAÇÃO → FECHADO / PERDIDO`, notas por lead e motivo
  de perda. A lista mostra a situação de cobrança de cada um: quanto paga, se
  está em dia, em atraso, bloqueado ou em cortesia
- **Fechar na mão, em um clique** — para o lead que veio pelo WhatsApp: provisiona
  o tenant inteiro, cria o restaurante, o usuário admin com senha gerada, o
  cadastro inicial, o plano e a assinatura com os dias de cortesia negociados.
  Devolve a URL pronta. Quem assina sozinho pelo `/assinar` não passa por aqui
- **Clientes** — todos os restaurantes ativos, com plano e mensalidade
- **Cobrança** — assinatura com valor e dia de vencimento, geração automática da
  fatura do mês por job diário, baixa manual do PIX e régua de inadimplência

O console tem **tema claro e escuro**, com a opção de seguir o sistema, aplicado
antes da primeira pintura para a tela não piscar a cada navegação.

O estágio do lead que veio do checkout **não se move à mão**: ele é derivado do
que aconteceu, e a recusa está na rota, não só no botão escondido. O lead de
WhatsApp continua sendo movido por você, porque nenhum evento captura "ela pediu
para eu voltar em janeiro".

**A régua**, que roda todo dia às 9h UTC:

| Atraso | Situação | O que acontece |
|---|---|---|
| 1 a 6 dias | `ATIVA` | Faixa informativa no `/adm` |
| 7 a 14 dias | `INADIMPLENTE` | Faixa firme |
| 15 dias ou mais | `BLOQUEADA` | Gestão fecha — cardápio, checkout, mesa, cozinha e entrega **continuam de pé** |

Inadimplência nunca derruba o storefront. E mesmo bloqueado, o dono continua
alcançando pedidos, chats e a própria fatura: quem pagaria o preço de fechar
essas telas seria o cliente do restaurante, que não deve nada a ninguém.

---

## O funil, medido

Desde 30/08/2026 a Muno mede a própria venda. Um cookie anônimo nasce no
domínio raiz e atravessa a landing, o checkout, o pagamento e o
provisionamento, ligando "visita vinda de um anúncio" a "membro pagante".

```
proxy (host raiz)  →  Set-Cookie: muno_s=<uuid>
landing e checkout →  VISITA, VIU_PRECO, CLICOU_ASSINAR, ABRIU_WHATSAPP,
                      CHECKOUT_PASSO
servidor           →  CHECKOUT_CRIADO, PAGOU, PROVISIONADO, ABANDONOU
cron das 9h        →  resume os 90 dias e apaga o evento cru
```

Três regras atravessam o desenho:

- **Nada de relatório derruba receita.** Todo evento do navegador é
  `keepalive` sem `await`; todo evento do servidor passa por uma função que
  nunca propaga exceção. Se a instrumentação cair, a venda acontece igual e só
  o número se perde.
- **O proxy não fala com o banco.** Ele gera o id e devolve o cookie. Um write
  ali custaria uma ida ao Postgres em cada visita de cardápio.
- **O evento cru vive 90 dias.** Depois disso vira contagem por dia, tipo e
  origem, resumida antes de ser apagada, na mesma transação. A série histórica
  nunca encolhe; o detalhe individual sim.

Nada disso escapa da regra do isolamento: as três tabelas novas são registro de
plataforma, sem `tenantId`, com RLS ligado e sem policy, que é o que nega tudo
para a chave pública do Supabase.

---

## Planos

| | Membro | Membro + Mesas QR |
|---|:---:|:---:|
| Cardápio digital, carrinho, checkout | ✓ | ✓ |
| Assistente de IA | ✓ | ✓ |
| Delivery com GPS e retirada | ✓ | ✓ |
| Cozinha, chat, cupons, analytics | ✓ | ✓ |
| Gateway de pagamento próprio | ✓ | ✓ |
| **Pedido por QR na mesa** | — | ✓ |
| **Mapa do salão e fechamento de conta** | — | ✓ |

O plano viaja no header `x-tenant-plano` junto com o tenant, e
`src/lib/plans.ts` é o único lugar que decide o que cada um libera. Header
ausente ou desconhecido cai para `MEMBRO` — nunca libera a feature paga por
omissão.

---

## Pagamentos

Cada restaurante conecta o **próprio** gateway em `/adm/pagamentos` e recebe
direto na conta dele. A Muno não intermedia dinheiro de pedido.

(A mensalidade **da Muno** é outra coisa, e corre pelo Asaas da própria
plataforma. Os dois usos de gateway não se cruzam.)

| Gateway | PIX | Cartão |
|---|:---:|:---:|
| Mercado Pago | ✓ | ✓ |
| Asaas | ✓ | ✓ |
| PagBank | ✓ | — |
| Abacate Pay | ✓ | — |
| Stripe | — | ✓ |

- Credencial validada contra a API do gateway **antes** de entrar no banco
- Guardada criptografada com AES-256-GCM; nenhuma resposta devolve o token em
  claro, nem para o admin dono da conta
- Webhook por tenant (`/api/payments/webhook/[gateway]/[tenantId]`), autenticado
  pela assinatura daquele lojista — a URL é pública e não autentica nada
- Sem gateway conectado, o checkout oferece só dinheiro na entrega

Gateway novo é um arquivo em `src/lib/payments/` implementando `PaymentProvider`,
mais uma linha no `factory.ts`.

---

## Arquitetura

**Isolamento entre restaurantes.** Três coisas trabalham juntas, e elas não
fazem a mesma coisa:

1. A **extensão do Prisma** (`src/lib/prisma.ts`), guiada por
   `tenant-scoped-models.ts`, injeta `tenantId` no `where` de toda operação.
   É ela que separa um restaurante do outro.
2. O **RLS** no Postgres é a trava contra a chave pública do Supabase, que vai
   no bundle de todo cardápio. Tabela nova em `public` sem RLS nasce aberta para
   a internet — com escrita.
3. Os **testes** ao lado (`tenant-scoped-models.test.ts`, `tenant-removal.test.ts`)
   leem o próprio `schema.prisma` e quebram quando um model novo esquece de
   entrar na lista.

**Tempo real sem expor o banco.** O servidor publica no canal Broadcast do
tenant depois de cada escrita relevante; o navegador assina o canal e busca o
conteúdo pela API protegida. As assinaturas antigas de `postgres_changes` liam
tabela direto com a chave `anon` e foram removidas.

**Segurança.** Senha com bcrypt custo 12 · sessão JWT com tenant embutido ·
sessão de outro tenant tratada como deslogada · rotas de API com 404 em vez de
403 onde um 403 confirmaria a existência do recurso · HSTS com `includeSubDomains`,
`X-Frame-Options`, `nosniff` e `Permissions-Policy`.

---

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 16 (App Router, React Server Components) |
| Interface | React 19, Tailwind CSS 4, Lucide, Sonner |
| Linguagem | TypeScript 6, modo estrito |
| Banco | PostgreSQL 17 (Supabase em produção, Docker no desenvolvimento) |
| ORM | Prisma 6, com extensão de tenant |
| Autenticação | NextAuth v5 — duas instâncias, restaurante e plataforma |
| Estado | Zustand com persistência |
| Formulários | React Hook Form + Zod |
| Tempo real | Supabase Realtime (Broadcast) |
| Mapas | Leaflet, OpenStreetMap, Nominatim e OSRM |
| Gráficos | Recharts |
| IA | Groq — LLaMA 3.3 70B |
| E-mail | Resend |
| Arquivos | Supabase Storage (imagens) e Vercel Blob (backups) |
| Testes | Vitest — 1749 testes |
| Deploy | Vercel, região `gru1` (São Paulo) |

---

## Estrutura

```
src/
├── proxy.ts                    # resolve o tenant pelo subdomínio, roteia e protege
├── app/
│   ├── (client)/               # cardápio, carrinho, checkout, pedidos, rastreio
│   ├── (chat)/                 # chat do pedido
│   ├── mesa/[token]/           # experiência de mesa por QR
│   ├── adm/                    # painel do restaurante
│   ├── dashboard/              # cozinha (KDS)
│   ├── motoboy/                # app do entregador
│   ├── platform/               # console da plataforma (CRM e cobrança)
│   ├── assinar/                # checkout self-service e a tela de obrigado
│   └── api/
│       ├── orders/ menu/ categories/ coupons/ tables/ delivery-zones/
│       ├── payments/           # cobrança, conexões, webhook por tenant
│       ├── motoboy/ chat/ analytics/ settings/ upload/ ai/
│       ├── platform/           # leads, clientes, cobranças
│       ├── leads/publico/      # captação vinda da landing
│       ├── funil/evento/       # ingestão dos eventos do funil
│       ├── assinar/            # checkout self-service
│       └── cron/assinaturas/   # job diário: cobrança, régua e expurgo
├── components/                 # por área: adm, menu, mesa, kitchen, motoboy, platform, assinar…
├── hooks/                      # carrinho, chat, cozinha, rastreio, notificações
└── lib/
    ├── prisma.ts               # cliente com escopo automático de tenant
    ├── tenant-*.ts             # contexto, provisionamento, remoção, URLs
    ├── payments/               # um adapter por gateway + fábrica
    ├── assinatura/             # régua de inadimplência, competência, baixa, situação
    ├── funil/                  # cookie, estágio, resumo, expurgo, registro de evento
    ├── platform-conversao.ts   # as contas da tela de conversão
    └── coupon, delivery-fee, faturamento, plans, realtime, business-hours…
public/
└── vendas/                     # a landing, HTML estático servido no domínio raiz
prisma/
├── schema.prisma               # 24 models
├── migrations/                 # 18 migrações, RLS incluído
└── seed.ts
```

---

## Modelo de dados

**O restaurante**
`Tenant` — a raiz. Nome, slug, plano e situação.

**Dele** (toda consulta escopada por `tenantId`, automaticamente)
`User` · `Category` · `MenuItem` · `Order` · `OrderItem` · `Table` · `Payment` ·
`Coupon` · `DeliveryZone` · `DeliveryTracking` · `ChatMessage` · `Setting` ·
`PasswordResetToken` · `PaymentConnection`

**Da plataforma** (sem `tenantId`, lidas por `prismaUnscoped`, com RLS sem policy)
`PlatformAdmin` · `Lead` · `LeadNote` · `Assinatura` · `Cobranca` · `Inscricao` ·
`SessaoFunil` · `EventoFunil` · `ResumoDiario`

Ciclo do pedido:

```
PENDING → CONFIRMED → IN_PREPARATION → READY → OUT_FOR_DELIVERY → DELIVERED
                                                                 ↘ CANCELLED
```

---

## Começando

### Pré-requisitos

Node.js 20+ e Docker. As contas de Supabase, Resend e Groq só são necessárias
para as features que dependem delas — o cardápio e os pedidos rodam sem nenhuma.

### 1. Instale

```bash
git clone https://github.com/rodrigoscharp/MunoApp.git
cd MunoApp
npm install          # o postinstall já gera o cliente Prisma
cp .env.example .env
```

### 2. Suba o banco local

> **O desenvolvimento roda contra um Postgres local, nunca contra produção.**
> Até 02/08/2026 o `DATABASE_URL` do `.env` apontava para o banco dos
> restaurantes, e `prisma migrate dev` ali é um reset a um prompt de distância.
> Por isso `db:migrate`, `db:push`, `db:reset` e o próprio `npm run dev` passam
> por `scripts/guard-local-db.js`, que aborta se o alvo não for localhost.

```bash
docker compose up -d     # Postgres 17 na porta 5433
npm run db:reset         # aplica as migrações e popula com o seed
```

Aponte o `.env` para ele:

```env
DATABASE_URL="postgresql://muno:muno@localhost:5433/muno"
DIRECT_URL="postgresql://muno:muno@localhost:5433/muno"
```

### 3. Rode

```bash
npm run dev
```

`http://localhost:3000` é o **domínio raiz**: ele mostra a landing de vendas, e
não um restaurante. O storefront do seed fica em
`http://default.localhost:3000`, e qualquer outro em `<slug>.localhost:3000`.

O console da plataforma responde em `http://admin.localhost:3000`.

É atrito de propósito: aplicar a guarda do domínio raiz só em produção faria
desenvolvimento e produção divergirem exatamente no ramo onde o bug mora.

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Postgres. Em desenvolvimento, sempre localhost |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Sessão. Gere com `openssl rand -base64 32` |
| `ROOT_DOMAIN` | Domínios raiz, separados por vírgula, para resolver o subdomínio |
| `NEXT_PUBLIC_APP_URL` | Base das URLs de webhook mostradas ao lojista |
| `PAYMENT_TOKEN_ENCRYPTION_KEY` | Criptografia das credenciais de gateway. `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Realtime e imagens no navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | Upload e publicação no Broadcast, no servidor |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | E-mail de recuperação de senha |
| `GROQ_API_KEY` | Assistente de IA do cardápio |
| `CRON_SECRET` | Autentica o job diário de cobrança |
| `LANDING_ORIGIN` | Origens autorizadas a gravar lead e evento de funil. Sem ela, produção recusa todas |
| `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN` | A cobrança **da Muno**, no checkout self-service. Nada a ver com o gateway do restaurante |
| `BLOB_READ_WRITE_TOKEN` | Envio dos backups |

> A chave do Asaas começa com `$`, e o `$` precisa vir **escapado como `\$`** no
> `.env`. O carregador do Next expande variáveis: um `$` solto vira referência a
> algo que não existe e a chave chega vazia na aplicação, enquanto um `curl`
> lendo o arquivo direto funciona. Aspas não protegem; só a barra invertida.

> Cuidado com o `.env.local`: `vercel env pull` e `vercel link` escrevem o
> `DATABASE_URL` **de produção** nele, e o Next o carrega com prioridade sobre o
> `.env`. Depois de qualquer comando da Vercel, confira que só sobraram
> `BLOB_READ_WRITE_TOKEN` e `VERCEL_OIDC_TOKEN`.

---

## Comandos

**Desenvolvimento**
```bash
npm run dev              # servidor local (passa pela trava de banco)
npm run build            # build de produção
npm test                 # 1749 testes
npm run test:watch
npm run lint
```

**Banco**
```bash
npm run db:reset         # recria o schema e roda o seed
npm run db:migrate       # cria uma migração nova
npm run db:seed
npm run db:studio        # Prisma Studio
npm run db:espelhar      # traz produção para o local, anonimizada
```

**Operação**
```bash
npm run tenant:create           # provisiona um restaurante
npm run tenant:remove -- --slug "x"       # mostra o que seria apagado
npm run platform:create-admin             # cria um admin da plataforma
npm run db:backup               # dump de produção + envio para o Blob
npm run db:recuperar            # lista e baixa os dumps da nuvem
npm run db:deploy               # migra produção, com backup obrigatório antes
```

---

## Deploy

Push na `main` publica na Vercel. O build roda `scripts/migrate-on-deploy.js`,
que aplica as migrações pendentes com `prisma migrate deploy` **antes** de
publicar — migração que falha derruba o deploy em vez de subir código esperando
coluna que não existe. Preview builda e não migra, porque preview e produção
usam o mesmo banco.

Basta commitar a migração junto do código: não há passo manual.

**Backup** roda no GitHub Actions todo dia às 6h UTC — dump de produção,
compressão e envio para um store privado do Vercel Blob, mantendo os 7 mais
recentes. Não há Point-in-Time Recovery contratado; o dump é a rede.

---

## Documentação

- **[`AGENTS.md`](AGENTS.md)** — o banco, os domínios, o isolamento entre
  restaurantes e as armadilhas que já custaram caro. Leitura obrigatória antes
  de mexer em qualquer uma dessas três coisas.
- **[`docs/superpowers/specs/`](docs/superpowers/specs/)** — as decisões de
  arquitetura, com o porquê de cada ordem de passos.
- **[`public/gateways/README.md`](public/gateways/README.md)** — como adicionar
  o logo de um gateway novo.

O código é comentado no mesmo espírito: os comentários explicam a **decisão** e
o que ela custou, não o que a linha faz.

---

<div align="center">

**Muno** — projeto privado, todos os direitos reservados.

</div>
