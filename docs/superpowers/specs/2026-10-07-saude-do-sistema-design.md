# A saúde do sistema

Data: 2026-10-07

## Problema

Hoje a Muno não sabe quando para de funcionar.

Erro que importa passa por `reportarErro()` (`src/lib/observabilidade.ts`) e vira uma
linha JSON no log da Vercel e, se `ERROR_WEBHOOK_URL` estiver definida, uma mensagem
num canal. Nada fica gravado. Para saber o que aconteceu ontem é preciso abrir o painel
da Vercel de propósito, e o log de função tem retenção curta.

Pior que o erro é a ausência. Três falhas caras não geram erro nenhum:

* **O cron diário para de rodar.** Ele gera cobrança, move a régua, espelha o Asaas,
  expurga o funil e aplica retenção. Se a Vercel não o chamar, nada quebra: só deixa de
  acontecer.
* **Cliente pagou e o restaurante não nasceu.** Uma `Inscricao` em `PAGA` que nunca
  chega a `PROVISIONADA` é o risco aberto desde a auditoria de 27/08/2026. Hoje só se
  descobre quando o cliente reclama.
* **Pedidos param de entrar.** Um sábado às 20h sem pedido na plataforma inteira é o
  sintoma mais caro possível, e ele aparece só como silêncio.

O `/api/health` atual responde se o banco atende uma consulta. É necessário, e não diz
nada sobre nenhum dos três.

## O que se quer

Uma tela no console da plataforma (`admin.munoapp.com.br`) que responda de relance
"está tudo funcionando? algo parou?", e uma linha do tempo do que aconteceu. E um aviso
que chegue ao dono sem que ele abra a tela.

Só para o admin da plataforma. Restaurante não vê nada disto.

## Decisões

1. **Semáforo e feed, juntos.** O semáforo pega "parou"; o feed responde "o que
   aconteceu com o cliente X ontem?".
2. **O feed só leva eventos de sistema.** Webhook, cron, provisionamento, pagamento de
   assinatura, e-mail, erro de rota. Pedido não vira evento: ele já mora em `Order`, e
   um feed com cada pedido seria ruído. A operação dos restaurantes entra como agregado
   lido direto de `Order`.
3. **Quem avisa é um monitor externo.** "Parou" é ausência, e ausência não dispara
   código; alguém precisa perguntar periodicamente. Um cron nosso exigiria plano Pro da
   Vercel para rodar com frequência e cairia junto com o app. Um monitor externo
   (UptimeRobot, Better Stack, plano grátis, a cada 5 minutos) consulta uma rota nossa e
   avisa por e-mail ou push. Quem vigia não pode morar dentro do que é vigiado.
4. **Tabela própria no banco**, e não log drain para serviço externo. A tela mora no
   console, e um drain resolveria o problema em outro lugar, cobrando por volume.

## Arquitetura

```
reportarErro()  ─┐
registrarSaude() ┴─>  EventoSistema  ─┐
Inscricao, Order (já existem) ────────┼─>  avaliarSaude(dados, agora)  ─┬─>  /platform/saude
select 1 ─────────────────────────────┘                                 └─>  /api/health/sistema  <─ monitor externo
```

Quatro unidades, cada uma com uma responsabilidade:

| Unidade | Arquivo | Faz |
|---|---|---|
| Gravação | `src/lib/saude/registrar.ts` | `registrarSaude()`: grava um evento, nunca lança |
| Coleta | `src/lib/saude/coletar.ts` | `coletarDadosDeSaude(agora)`: as consultas ao banco |
| Avaliação | `src/lib/saude/avaliar.ts` | `avaliarSaude(dados, agora)`: função pura, peças e cores |
| Limiares | `src/lib/saude/limiares.ts` | as constantes de todas as regras, num lugar só |

A tela e a rota do monitor chamam `coletar` e depois `avaliar`. Não existem duas versões
da regra: se a tela diz vermelho, o monitor diz 503.

## Os dados

### O model

```prisma
enum NivelEvento {
  OK
  AVISO
  ERRO
}

// Registro de plataforma, como Lead: não pertence a um restaurante. O tenantId é
// só um rótulo para filtrar, sem relação, para que remover um cliente não apague
// o histórico de falhas que o envolveu.
model EventoSistema {
  id       String      @id @default(cuid())
  origem   String
  nivel    NivelEvento
  mensagem String
  tenantId String?
  extra    Json?
  criadoEm DateTime    @default(now())

  @@index([origem, criadoEm])
  @@index([nivel, criadoEm])
  @@index([tenantId, criadoEm])
}
```

* `tenantId` é opcional e sem `@relation`. Por isso o model **não** entra em
  `src/lib/tenant-scoped-models.ts` (que é para `tenantId` obrigatório) nem em
  `ORDEM_DE_EXCLUSAO` de `src/lib/tenant-removal.ts`. Conferir que o teste de remoção
  aceita isso; se ele exigir toda coluna `tenantId`, registrar a exceção ali com o mesmo
  motivo do `Lead`.
* A migração liga `ENABLE ROW LEVEL SECURITY` sem policy, como toda tabela nova
  (AGENTS.md, "Toda tabela nova precisa de RLS").
* Leitura e escrita só por `prismaUnscoped`, com entrada em `USO_DE_PRISMA_UNSCOPED`
  (`src/security/invariantes.test.ts`) para cada arquivo que o importar.
* A migração só adiciona (enum e tabela). Segura para rollback de deploy.

### `origem`

String livre no formato `area/detalhe`, a mesma convenção que `reportarErro` já usa
(`cron/assinaturas:faxina`, `webhook/pagamento`). As peças do semáforo casam por
prefixo, então uma origem nova de erro aparece no feed sem mudar a avaliação.

### `mensagem` e `extra`

Mesma regra do `reportarErro`: a mensagem passa por `semEmail()` e é cortada em 500
caracteres; `extra` leva só ids e contagens. Nunca e-mail, telefone, corpo, cabeçalho
ou query string.

## A gravação

`registrarSaude({ origem, nivel, mensagem, tenantId?, extra? })`:

* **Nunca lança.** Engole qualquer falha, como `registrarEvento` do funil. Gravar
  saúde não pode derrubar pagamento.
* **Falha de gravação não chama `reportarErro`.** Se o problema é o banco, chamar
  `reportarErro`, que chama `registrarSaude`, seria um laço. A falha vai só para
  `console.error`.
* **Timeout curto** (2 segundos) via `Promise.race`, para não segurar um webhook se o
  banco estiver lento.

`reportarErro()` passa a chamar `registrarSaude({ nivel: "ERRO", ... })` depois do
`console.error` e antes do webhook. Os 18 pontos que já o usam entram no feed sem
mudança. O `tenantId`, quando houver em `extra`, é promovido para a coluna.

### O cuidado com `instrumentation.ts`

`onRequestError` pode rodar fora do runtime Node, onde o Prisma não carrega. Em
`reportarErro`, o `registrarSaude` entra por `import()` dinâmico, e só quando
`process.env.NEXT_RUNTIME !== "edge"`. O plano verifica com `next build` que nenhum
bundle de edge passa a importar `@prisma/client`.

### Os pontos de sucesso

Sem eles não existe "última vez que funcionou". São poucos e escolhidos:

| Origem | Onde | `extra` |
|---|---|---|
| `cron/assinaturas` | fim do handler do cron, com um campo dizendo se alguma etapa caiu no `catch` | contagens que o handler já devolve; `etapasComErro` |
| `webhook/asaas` | depois de processar o evento no webhook de assinaturas | tipo do evento, `assinaturaId` |
| `webhook/pagamento` | depois de processar o webhook de pagamento de restaurante | `provider`, `tenantId`, `orderId` |
| `provisionamento` | quando o restaurante nasce | `inscricaoId`, `tenantId` |

O cron registra `OK` mesmo quando uma etapa falhou, com `etapasComErro > 0` e nível
`AVISO`. "O cron rodou" e "tudo no cron deu certo" são perguntas diferentes, e a
primeira é a que pega a Vercel parando de chamá-lo.

## A avaliação

`avaliarSaude(dados, agora)` devolve:

```ts
type Cor = "verde" | "amarelo" | "vermelho" | "neutro";
type Peca = {
  chave: ChavePeca;
  nome: string;
  cor: Cor;
  motivo: string;          // uma linha, pronta para a tela
  ultimoSinal: Date | null;
};
type Saude = { geral: Cor; resumo: string; pecas: Peca[] };
```

`geral` é a pior cor entre as peças (`neutro` não conta). `resumo` é a frase da faixa do
topo: "Tudo funcionando", ou o motivo da peça mais grave.

### As peças

| Peça | Fonte | Amarelo | Vermelho |
|---|---|---|---|
| Banco | `select 1` cronometrado | resposta > 500 ms | consulta falhou |
| Cron diário | último evento de `cron/assinaturas` | último sinal > 26 h, ou último sinal com `etapasComErro > 0` | último sinal > 50 h, ou nenhum |
| Webhook Asaas | eventos `webhook/asaas` | algum `ERRO` nas últimas 24 h | evento mais recente é `ERRO` |
| Provisionamento | `Inscricao` com `status = PAGA` | a mais antiga paga há > 15 min | a mais antiga paga há > 1 h |
| Pagamentos dos restaurantes | eventos `webhook/pagamento` | algum `ERRO` nas últimas 24 h | 3 ou mais `ERRO` na última hora |
| E-mail | `ERRO` de origens de envio de e-mail | algum nas últimas 24 h | 3 ou mais na última hora |
| Erros de rota | `ERRO` de `onRequestError` | 1 ou mais na última hora | 10 ou mais na última hora |
| Pedidos | `Order`, agregado por hora | ver abaixo | nunca |

Notas:

* **"Pago há" de uma inscrição** usa `Inscricao.updatedAt`, que é quando ela virou
  `PAGA`. Enquanto estiver em `PAGA` nada mais a altera.
* **Webhook Asaas não fica vermelho por falta de evento.** Dia sem webhook é normal
  quando ninguém pagou nada. Sem evento nenhum, a peça é verde com "sem eventos nas
  últimas 24 h".
* **As origens de e-mail e de rota** são listadas em `limiares.ts` (por exemplo,
  `auth/forgot-password`, `boas-vindas`, `instrumentation`). Conferir no plano os nomes
  exatos usados hoje em cada `reportarErro`.
* **Pedidos nunca fica vermelho.** Queda de volume tem causa inocente (feriado, chuva,
  restaurante que fechou cedo), e um vermelho que dispara por motivo inocente ensina a
  ignorar o alarme. Amarelo quando a última hora completa teve 0 pedidos na plataforma
  inteira e a mesma hora, nos 4 mesmos dias da semana anteriores, teve média de 5 ou
  mais. Abaixo dessa média, `neutro`: o gráfico aparece, sem cor.
* As horas são de Brasília (`FUSO` de `src/lib/platform-series.ts`).

Todos os números desta tabela vivem em `limiares.ts`, para serem ajustados depois de
ver o comportamento real, sem procurar no código.

### Fora do semáforo, de propósito

* **Realtime.** Toda tela tem polling de reserva, e testar o Broadcast a partir do
  servidor não diz nada sobre o navegador.
* **Reconciliação automática.** A peça de provisionamento avisa; não conserta. Re-provisionar
  sozinho é o trabalho seguinte, com spec própria.

## A tela

`src/app/platform/saude/page.tsx`, com item "Saúde" no `MenuLateral`.

1. **Faixa do topo** com a cor geral e o `resumo`.
2. **Grade das peças**: nome, cor, motivo, "último sinal há X".
3. **Pedidos por hora**: hoje contra a média das 4 semanas anteriores no mesmo dia da
   semana. Reusar `GraficoBarras` ou `GraficoAtividade`.
4. **Feed**: os 100 eventos mais recentes, mais novo primeiro. Filtros de nível, origem
   (por prefixo) e restaurante na query string. Padrão: `AVISO` e `ERRO`; um controle
   mostra também os `OK`. Cada linha: hora, nível, origem, mensagem, nome do restaurante
   quando houver `tenantId` (buscado por id, numa consulta só).

O item "Saúde" do menu lateral leva um ponto com a cor geral, visível de qualquer tela
do console. Para isso o layout do console calcula a saúde. Se isso pesar no tempo de
carregamento de todas as telas, o ponto sai e fica só na própria página; decidir no
plano medindo, não por palpite.

A página se atualiza a cada 60 segundos com um componente cliente pequeno que chama
`router.refresh()`. Sem realtime: um minuto de atraso é aceitável aqui.

Os filtros dependem de o rewrite do console preservar a query string, o que já é
garantido e testado em `src/proxy.test.ts`.

A página exige `authPlatform()`, como as outras do console.

## A rota do monitor

`GET /api/health/sistema`, servida no **host raiz** (`munoapp.com.br`), como o
`/api/health`.

* **Não pode morar no `admin.`.** O proxy fecha aquele host com
  `PLATFORM_ALLOWED_IPS` (404 para IP de fora) e exige sessão de plataforma antes de
  chegar a qualquer rota. O monitor externo não tem nenhum dos dois.
* No host raiz, todo caminho fora da landing responde 404 (AGENTS.md, "O domínio raiz
  não pode virar um restaurante"). A rota precisa de um ramo próprio em `src/proxy.ts`,
  ao lado do de `/api/health` e **antes** da guarda do raiz, encaminhando com
  `NextResponse.next(semTenant)`; `invariantes.test.ts` exige o `semTenant`. Caso novo
  em `src/proxy.test.ts`: o caminho chega à rota no host raiz e não chama
  `prisma.tenant.findUnique`.
* Autentica pelo segredo `HEALTH_MONITOR_TOKEN`, aceito em `Authorization: Bearer
  <token>` ou em `?token=<token>`. O segundo existe porque o plano grátis de alguns
  monitores não envia cabeçalho. A comparação é em tempo constante.
* Sem segredo configurado ou sem token válido: 401 **antes** de qualquer consulta ao
  banco, que é o que a matriz de acesso exige. O mesmo cuidado do `CRON_SECRET`: sem a
  variável, a rota recusa tudo, nunca compara com `"Bearer undefined"`.
* Entrada em `src/security/politica-de-acesso.ts` como `SEGREDO`.
* Responde 503 se alguma peça estiver vermelha e 200 caso contrário. Amarelo não
  derruba o monitor.
* Corpo: `{ ok, vermelhas: ["provisionamento", ...] }`. Só as chaves, para a mensagem
  do alarme dizer o que caiu. Nenhum detalhe a mais.
* `Cache-Control: no-store`.
* O `/api/health` atual não muda; os dois podem ser vigiados.

`HEALTH_MONITOR_TOKEN` entra em `.env.example`. Ele não é `NEXT_PUBLIC_*`.

## A manutenção

* **Expurgo de 30 dias** no cron diário, numa etapa nova com `try` próprio, como as
  outras. Falha ali vira `reportarErro` e não interrompe cobrança. Um `deleteMany` por
  `criadoEm`, que o índice atende.
* Volume esperado: dezenas de linhas por dia, centenas em dia de incidente.

## Os testes

Unidade:

* `avaliarSaude`: cada limiar de cada peça, nos dois lados da fronteira; `geral` como a
  pior cor; `neutro` não conta para `geral`; pedidos nunca vermelho.
* `registrarSaude`: não lança quando o Prisma rejeita nem quando passa do timeout.
* `reportarErro`: chama `registrarSaude` com `ERRO`; falha em `registrarSaude` não gera
  nova chamada a `reportarErro`; `tenantId` de `extra` é promovido.
* Rota do monitor: 401 sem variável, sem token e com token errado, sem tocar o banco;
  200 com tudo verde ou amarelo; 503 com uma vermelha, listando a chave.

A suíte de segurança cobre o resto sem teste novo: RLS da tabela, `prismaUnscoped` com
motivo, política da rota, `NEXT_PUBLIC_*` em lista fechada.

Integração (`*.integration.test.ts`): o expurgo apaga só o que passou de 30 dias.

## Fora do escopo

* Reconciliação automática de inscrição paga e não provisionada.
* Sentry, log drain ou qualquer serviço pago.
* Aviso enviado por nós (WhatsApp, e-mail). Quem avisa é o monitor externo.
* Saúde por restaurante (gateway desconectado, cardápio vazio). Cabe depois, como peças
  novas, sem mudar a estrutura.

## Depois do deploy

1. Definir `HEALTH_MONITOR_TOKEN` na Vercel (produção).
2. Criar no UptimeRobot ou Better Stack um monitor HTTP para
   `https://munoapp.com.br/api/health/sistema?token=...`, a cada 5 minutos,
   alertando em status diferente de 200.
3. Esperar o primeiro cron e conferir que a peça "Cron diário" ficou verde.
