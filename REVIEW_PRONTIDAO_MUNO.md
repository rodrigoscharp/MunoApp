# Revisão de prontidão para produção: Muno

Revisão somente leitura do `main` em `a316c5c` (inclui o PR #7), feita em 02/10/2026. Nada foi alterado no código nem enviado ao repositório; este arquivo é a única saída. Nada foi executado contra banco de produção (o `DATABASE_URL` do `.env` é `localhost:5433`).

Execuções locais:

| Verificação | Resultado |
|---|---|
| `npx vitest run` | 154 arquivos, 2488 testes, todos passam |
| `npx tsc --noEmit` | 0 erros (também sem a pasta `.next`, como no CI) |
| `eslint src` | 0 erros, 8 avisos (`react-hooks/incompatible-library`, variável sem uso em teste, `window.location.href` em `useOrderNotifications.ts:205`) |
| `npm run build` | passa (com `VERCEL_ENV` indefinido; o gate dos termos só vale em produção) |
| `npm audit --omit=dev` | 3 achados (1 low, 2 moderate), nenhum high; o gate do CI (`--audit-level=high`) passa |
| Deploy de produção do PR #7 | falhou de propósito no gate `[legal]`, antes de qualquer migração (ver C1) |

---

## 1. Veredito

**PRONTO COM RESSALVAS.** O núcleo (isolamento entre restaurantes, checkout, cobrança, pedido, dinheiro) está bem construído e coberto por testes, e não há nenhum vazamento entre tenants nem perda de dinheiro conhecida. Mas não dá para publicar hoje: os documentos legais ainda têm 22 campos por preencher (o build de produção os recusa), e há duas lacunas no ciclo de vida da assinatura (cancelar não chega ao Asaas; cancelamento externo vira acesso gratuito) que convém decidir antes do primeiro cliente pagante.

## 2. Resumo executivo

1. Nenhum achado de segurança Crítico ou Alto. O isolamento por extensão do Prisma, o RLS como trava contra a chave anon, os webhooks autenticados, a sessão reconferida e os tópicos de tempo real secretos estão corretos e testados.
2. O único bloqueador de lançamento é jurídico: `termos.html` e `privacidade.html` com campos `<mark>` em aberto, enquanto o checkout já exige o aceite.
3. O ciclo de vida da assinatura tem duas pontas soltas: cancelar ou alterar no CRM não cancela nem altera a cobrança no Asaas, e `SUBSCRIPTION_DELETED` vira `CANCELADA`, estado que o proxy trata como acesso liberado.
4. Se algo quebrar às 21h de sábado, o dono provavelmente não fica sabendo: o alerta é opcional (`ERROR_WEBHOOK_URL`) e as falhas de venda saem só em log.
5. Backup diário com RPO de até 24h, sem PITR, restore testado uma vez com 60 KB, e o bucket de imagens fora da cópia.
6. Escala: aguenta 10 restaurantes sem mudar nada. Antes de 100, tratar o lookup de tenant a cada requisição no proxy, o pool de conexões e o teto de conexões de Realtime.
7. Testes: 2488 passam, mas nenhum fala com Postgres real. Corridas, constraints e RLS só são verificados por leitura.
8. O rate limit é em memória por instância e o console da plataforma não tem segundo fator.
9. LGPD: base técnica boa (aceite gravado, anonimização, expurgo do funil), faltando aviso ao consumidor final, retenção automática e os textos.
10. Custo estimado de infraestrutura: cerca de US$ 50/mês com 10 restaurantes, US$ 100 a 180 com 100, US$ 350 a 900 com 1.000 (estimativas).

## 3. Placar por área

| Área | Nota | Em uma frase |
|---|---|---|
| Segurança | 8 | Isolamento e webhooks sólidos; faltam limite de taxa compartilhado, 2FA no console e CSP em enforce. |
| Fluxos | 7 | Checkout resiliente e preço sempre do servidor; lacunas no cancelamento e em alguns estados de borda da cobrança recorrente. |
| Testes | 7 | Suíte ampla e de comportamento, mas inteiramente sobre Prisma mockado. |
| Escalabilidade | 6 | Bom até dezenas de restaurantes; proxy, pool e Realtime pedem trabalho antes de 100. |
| Operação | 5 | Backup e deploy bem pensados, mas sem alerta garantido, sem PITR e sem restore ensaiado em escala. |
| Conformidade | 4 | Mecanismos existem; textos em branco, sem aviso ao consumidor e retenção manual. |
| Manutenibilidade | 7 | Código documentado e invariantes testadas; poucos arquivos grandes e dependências com atraso. |

---

## 4. Achados

Esforço: P = horas, M = dias, G = semanas. IDs: C crítico, A alto, M médio, B baixo, I info.

| ID | Sev. | Área | Descrição | Evidência | Impacto real no negócio | Correção sugerida | Esf. |
|---|---|---|---|---|---|---|---|
| C1 | Crítico | Conformidade | `termos.html` tem 14 campos `<mark>` (razão social, CNPJ, endereço, prazos, reembolso e arrependimento, foro) e `privacidade.html` tem 8 (encarregado, e-mail, prazos, data). O checkout já exige o aceite desses textos. | `public/vendas/termos.html`, `public/vendas/privacidade.html`; gate em `scripts/verificar-env-producao.js`; aceite em `src/app/api/assinar/route.ts:156-157` | Impede publicar (o build de produção falha) e, se fosse contornado, o cliente aceitaria contrato sem parte nem encarregado. É o bloqueador de lançamento. | Preencher, revisar com advogado (incluindo direito de arrependimento do art. 49 do CDC) e atualizar `TERMOS_VERSAO` em `src/lib/termos.ts`. | P (depende do jurídico) |
| A1 | Alto | Fluxos | Marcar a assinatura como cancelada, ou mudar `valorMensal` e `diaVencimento`, só altera o banco local. `asaas.ts` só tem GET e POST. | `src/app/api/platform/clientes/[id]/route.ts:53-60` e `:97-122`; `src/lib/assinatura/asaas.ts:40` | Cliente cancelado no CRM continua sendo cobrado no cartão: chargeback, reclamação e risco jurídico. | Implementar cancelar e alterar assinatura no módulo do Asaas e chamá-las antes de gravar o estado local; se o gateway falhar, a rota falha. | M |
| A2 | Alto | Fluxos | `SUBSCRIPTION_DELETED` e `SUBSCRIPTION_INACTIVATED` marcam `CANCELADA`, e o proxy só bloqueia `BLOQUEADA`. O mesmo status significa "cortesia" para a equipe e "parou de pagar" para o espelho. O cron e a baixa não mexem em `CANCELADA`. Introduzido no PR #7. | `src/lib/assinatura/espelho.ts:60-74`; `src/proxy.ts:424-439`; `src/app/api/cron/assinaturas/route.ts:49` | Quem cancela o cartão ou tem a assinatura inativada pelo Asaas segue usando o produto de graça, para sempre. | Separar os estados (por exemplo um status próprio com prazo de graça e depois bloqueio), ou aplicar a régua a partir do evento. Primeiro decidir, como produto, o que é cancelamento. | M |
| A3 | Alto | Operação | O alerta só existe se `ERROR_WEBHOOK_URL` estiver definida, e ela não está na lista de variáveis recomendadas. A falha de criar cliente ou assinatura no Asaas (502), pagamento sem `Inscricao` e falhas da faxina saem só em `console.error`. `onRequestError` só pega exceção não tratada. | `src/lib/observabilidade.ts:53`; `scripts/verificar-env-producao.js:48-55`; `src/app/api/assinar/route.ts:333,370`; `src/app/api/assinaturas/webhook/asaas/route.ts:124`; `src/app/api/cron/assinaturas/route.ts:239,249`; 59 `console.error` fora de testes, 8 arquivos usam `reportarErro` | Chave do Asaas revogada ou gateway fora do ar às 21h de sábado derruba toda venda nova, e o dono só descobre por reclamação. | Trocar `console.error` por `reportarErro` nesses pontos, colocar `ERROR_WEBHOOK_URL` entre as exigidas quando `ASAAS_ENV=production`, monitor externo em `/api/health` e outro que teste um checkout de sandbox. | P |
| A4 | Alto | Operação | Backup lógico diário às 03:00 BRT, sem PITR. Restore em produção testado uma vez (02/08, dump de 60 KB). O comando impresso restaura sem `--clean`. O dump é só do schema `public`: o bucket `product-images` e o schema `auth` ficam de fora. O envio lê e comprime o arquivo inteiro em memória, com timeout de 10 min. | `.github/workflows/backup.yml:16,26`; `scripts/enviar-backup.ts:101`; `scripts/backup-producao.sh:23`; `scripts/recuperar-backup.ts` | Um incidente no sábado à noite restaura o estado de sexta e perde o serviço do dia. RTO realista de 2 a 6 horas (estimativa), sem runbook. Em 100 a 300 restaurantes o dump deixa de caber. | Contratar PITR ao ter clientes pagantes; drill de restauração trimestral em projeto descartável; `pg_dump -Fc` com streaming; copiar o bucket de imagens. | M |
| A5 | Alto (marco 100) | Escalabilidade | Toda requisição de tenant faz `prisma.tenant.findUnique` com join de assinatura, sem cache. Há dois `PrismaClient` por instância (dois pools). Nenhum `pool_timeout`, `connect_timeout` nem `statement_timeout`. | `src/proxy.ts:337-347`; `src/lib/prisma.ts:56,63-65`; `.env.example:3-4` | Cada tick de polling da cozinha (30s) custa o lookup mais cerca de 5 consultas; com centenas de telas isso vira centenas de consultas por segundo. Consulta lenta segura a função até o limite da plataforma. | Cachear `slug` para tenant por 30 a 60s (aceitando que o bloqueio por inadimplência demore até um minuto), compartilhar o pool entre os dois clientes, definir `connection_limit` e timeouts. | M |
| M1 | Médio | Segurança | Rate limit em memória por instância; o login limita por `tenant:email` (10 em 10 min) e não por IP, então dá para travar a conta de outra pessoa; o console da plataforma limita só por e-mail e hoje tem um único admin. Senha mínima de 6 caracteres. | `src/lib/rate-limit.ts:27`; `src/lib/auth.ts:10,47`; `src/lib/auth-platform.ts:57`; `register/route.ts:11`; `reset-password/route.ts:10` | Força bruta mais fácil do que o `max: 10` sugere e negação de serviço no login do dono ou do console. | Limite no Vercel Firewall ou Upstash/KV, limite também por IP, senha mínima de 8. | M |
| M2 | Médio | Segurança | O console da plataforma entra só com e-mail e senha; sessão de 7 dias. | `src/lib/auth-platform.ts:53-68` | Quem entra enxerga todos os restaurantes, leads e cobranças e altera mensalidades. | 2FA TOTP, ou restringir `admin.munoapp.com.br` por IP. | M |
| M3 | Médio | Segurança, Fluxos | `POST /api/orders` é público (mesa dispensa login), sem limite de taxa e sem checar horário de funcionamento no servidor. A proteção contra clique duplo lê e depois escreve, então dois cliques com ~100 ms de diferença criam dois pedidos. | `src/app/api/orders/route.ts:25-27,183-190,255-291,411`; horário só na UI em `(client)/page.tsx:45` | Spam na fila da cozinha por quem tem o QR de uma mesa; pedido fora do horário via API; pedido duplicado. | Limite por IP e por mesa, chave de idempotência do cliente com `@@unique([tenantId, idempotencyKey])`, validar horário no servidor. | M |
| M4 | Médio | Segurança | Abacate Pay: o HMAC do corpo só é conferido `if (signature)`; sem o header vale só o segredo na query string, que vaza em log. O adapter não devolve o valor, então a conferência de valor é pulada. | `src/lib/payments/abacatepay-adapter.ts:165-178,192-198`; `payments/webhook/[provider]/[tenantId]/route.ts:73` | Quem obtiver o segredo de um lojista marca pedidos dele como pagos por qualquer valor (dano restrito a esse lojista). | Exigir o HMAC se o provedor o envia (confirmar na documentação) e conferir valor quando disponível. | P |
| M5 | Médio | Segurança | CSP só em Report-Only. A landing carrega `cdn.tailwindcss.com` (Play CDN), `unpkg.com/lucide@latest` e jsdelivr, sem `integrity`. | `next.config.js:51`; `public/vendas/index.html:50,69,72` | Não há sink de XSS no app (o único `dangerouslySetInnerHTML` é o script estático do tema, `src/app/layout.tsx:97`), mas um CDN comprometido executaria script no apex, que também serve `/assinar` (CPF/CNPJ). | Empacotar ou fixar versão com SRI, gerar o CSS do Tailwind no build, depois promover a CSP a enforce com política separada para a landing. | M |
| M6 | Médio | Fluxos | Se o `update` que grava `asaasSubscriptionId` na `Inscricao` falhar, o provisionamento usa só `inscricao.asaasSubscriptionId` e cria a `Assinatura` com o campo nulo. O cron passa a gerar cobrança local que o Asaas nunca baixa, e a régua bloqueia um cliente que pagou. | `assinar/route.ts:343-349,358-362`; `provisionamento.ts:160`; `cron/assinaturas/route.ts:84,229-233` | Janela estreita, mas o dano cai em cliente pagante. | Usar `inscricao.asaasSubscriptionId ?? pagamento.subscription` e gravar na `Inscricao`; consultar o Asaas por `externalReference` antes de apagar. | P |
| M7 | Médio | Fluxos | A faxina apaga a `Inscricao` vencida sem cancelar a assinatura no Asaas; pagamento que chega depois cai em "sem Inscricao" e só gera `console.error`. Timeout do Asaas (15s) em `/api/assinar` também apaga a `Inscricao` com possível assinatura já criada no gateway. | `cron/assinaturas/route.ts:259-264`; `webhook/asaas/route.ts:123-130`; `assinar/route.ts:327-345` | Assinaturas abandonadas acumulam no Asaas (e-mails de cobrança vencida a quem desistiu); raramente, cliente pago sem restaurante. | Cancelar no gateway antes de apagar (depende de A1); tratar timeout como estado incerto e deixar a reconciliação decidir. | P a M |
| M8 | Médio | Fluxos | Competência ocupada por cobrança `CANCELADA` com outro id faz o espelho descartar o evento novo (apagar e recriar o pagamento do mês deixa o atraso invisível). Estorno e chargeback da assinatura não são tratados: a cobrança fica `PAGA`. | `src/lib/assinatura/espelho.ts:114-125,34-35,79`; `reconciliacao-cobrancas.ts:16-22` | Inadimplente nunca bloqueado em caso de borda; restaurante estornado segue ativo. | Tratar ocupante `CANCELADA` como livre; reabrir a cobrança e alertar em estorno (nomes exatos dos status: a verificar no sandbox). | P a M |
| M9 | Médio | Fluxos | `PATCH /api/orders/[id]` aceita qualquer transição de status; só a UI define a ordem. Id inexistente vira 500. | `src/app/api/orders/[id]/route.ts:96-101` | Dá para reabrir pedido entregue ou cancelar pedido pago online sem fluxo de estorno nem alerta. | Tabela de transições no servidor com `updateMany` pelo estado de origem; alerta ao cancelar pedido `PAID` online; 404 para id inexistente. | M |
| M10 | Médio | Fluxos | `close-bill` lê o total fora da transação e é não idempotente (duas chamadas criam `Payment` em dobro); `charge` não é idempotente e um segundo `approved` num pedido já `PAID` é ignorado em silêncio. | `tables/[id]/close-bill/route.ts:46-72`; `payments/charge/route.ts:60-66,100-103`; `payments/webhook/.../route.ts:81-92` | Pedido novo da mesa marcado como pago sem entrar na conta; cliente que paga duas cobranças e ninguém é avisado. | Transação interativa que relê o total; reutilizar a cobrança existente ou alertar no segundo `approved`. | P |
| M11 | Médio | Escalabilidade | Cada tela de cozinha, painel, motoboy e acompanhamento mantém um websocket; o plano Pro vem com cerca de 500 simultâneos (estimativa). O broadcast é `await` dentro do fluxo do pedido e o cliente de Realtime acumula tópicos novos sem remover. | `useKitchenOrders.ts`, `useOrderNotifications.ts`, `useOrderRealtime.ts`; `src/lib/realtime.ts`; `orders/route.ts:411` | O teto aparece entre 50 e 100 restaurantes (estimativa); Realtime lento soma até cerca de 10s ao "finalizar pedido". | Monitorar o painel e subir o teto cedo; `after()` do Next ou `Promise.race` com 2s no broadcast; `removeChannel` depois do envio. | P |
| M12 | Médio | Escalabilidade | O gráfico traz uma linha por pedido de 30 dias para somar em JavaScript; o filtro de receita usa `OR`/`NOT` e o índice `[tenantId,status,createdAt]` serve mal; a cozinha recarrega a lista completa com `include` a cada evento. | `src/app/api/analytics/route.ts`; `src/lib/faturamento.ts:54-56`; `orders/route.ts:110-124` | Painel e cozinha ficam mais lentos conforme o histórico cresce. | Agregar por dia no banco, índice `[tenantId,createdAt]`, `select` enxuto na cozinha. | P |
| M13 | Médio | Conformidade | O consumidor final não vê nenhum aviso de privacidade: `/privacidade` e `/termos` só respondem no host raiz e os formulários de registro e checkout do cardápio não linkam nada, embora a política diga que o restaurante é o controlador. | `src/proxy.ts:309,333`; só `FormularioAssinatura.tsx` linka | O restaurante coleta nome, telefone, endereço e chat sem texto para apresentar. | Servir o aviso em cada host e linkar nos formulários. | P |
| M14 | Médio | Conformidade | Retenção e direitos do titular são manuais: nenhuma rotina apaga pedido, chat ou token expirado; o pedido do titular é atendido por CLI; `Order.notes` e a observação por item podem conter restrição alimentar (dado de saúde, art. 11 da LGPD), que a política não menciona. | `src/lib/anonimizacao-cliente.ts`; cron sem retenção | Funciona para poucas dezenas de pedidos de titular por mês; a tabela de pedidos cresce sem limite. | Cron de retenção, anonimizar e exportar pelo `/adm`, citar dado sensível na política. | M |
| M15 | Médio | Operação | Preview e produção usam o mesmo banco; o deploy da Vercel não espera o `testes.yml`; rollback de deploy não desfaz migração e não há regra escrita de "expandir, depois contrair" (7 migrações com `DROP` no histórico); `migrate deploy` roda antes do `next build`. | `scripts/migrate-on-deploy.js:11-16`; `package.json` (script `build`); `.github/workflows/testes.yml` | Teste manual em preview cria dado real; migração pode ir a produção antes da suíte terminar; build que falha depois da migração deixa banco novo com código velho. | Exigir checks no PR (branch protection: a verificar), regra de migração aditiva primeiro, banco próprio para preview. | M |
| M16 | Médio | Conformidade, Onboarding | O acesso do cliente que pagou depende do e-mail de boas-vindas: `resend.ts` usa `"placeholder"` quando falta a chave, `RESEND_FROM_EMAIL` ausente cai em `onboarding@resend.dev` (só entrega ao dono da conta), e a tela de obrigado não mostra o endereço do restaurante nem oferece reenvio. | `src/lib/resend.ts`; `email-boas-vindas.ts`; `ConfirmacaoAssinatura.tsx`; `forgot-password/route.ts:270` | Quem pagou e não recebeu o e-mail fica parado até chamar a Muno. | Mostrar o endereço e um botão de reenviar acesso; exigir `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no gate de produção. | P |
| M17 | Médio | Escalabilidade, Segurança | `remotePatterns` aceita `**.supabase.co` e `**.supabase.com` (qualquer projeto Supabase usa a sua cota de otimização); as imagens já saem em WebP de até 1280 px e ainda passam pelo otimizador; nada apaga o arquivo antigo ao trocar ou excluir o item. | `next.config.js:7-14`; `ProductCard.tsx:31`; ausência de `storage.remove` | Custo de otimização cresce com o número de itens e o `/_next/image` vira otimizador gratuito para terceiros. | Restringir ao host do projeto e a `/storage/v1/object/public/product-images/**`; apagar o arquivo antigo. | P |
| M18 | Médio | Testes | 65 arquivos usam `vi.mock("@/lib/prisma")` e nenhum teste fala com Postgres. Nenhuma `@@unique`, corrida ou policy de RLS é exercitada; o isolamento é testado contra cliente mockado. Não há `provisionamento.test.ts` próprio. | busca por `postgresql://`, `localhost:5433` e `new PrismaClient` em `*.test.*`; `src/security/*` | As garantias de concorrência vivem em comentários. Uma regressão numa `@@unique` ou no escopo de tenant passa verde. | Postgres no CI e testes de integração (plano na seção 7). | M |
| B1 | Baixo | Segurança | O tópico de tempo real é credencial ao portador e não roda; sem `REALTIME_TOPIC_SECRET` deriva de `PAYMENT_TOKEN_ENCRYPTION_KEY`; o canal do Supabase continua aberto à chave anon e quem tem o nome publica nele (efeito cosmético: o status exibido pode ser falso). Os eventos só levam `orderId`, status e `deliveryType`. | `src/lib/realtime-topic.ts:18-33`; `useOrderRealtime.ts:21-22`; `realtime.ts:53-77` | Motoboy demitido mantém o tópico até o segredo mudar. | Definir `REALTIME_TOPIC_SECRET`, documentar a rotação; a evolução é canal privado com RLS em `realtime.messages`. | P a M |
| B2 | Baixo | Segurança | Credenciais de gateway com chave única e payload `iv.tag.cipher` sem versão de chave. | `src/lib/crypto.ts:24-31` | Rotacionar exige recriptografar tudo de uma vez; erro na ordem quebra todo webhook com 500. | Prefixo de versão e aceitar duas chaves durante a rotação. | M |
| B3 | Baixo | Segurança | Reset de senha lê o token, troca a senha e só então apaga o token (duas requisições simultâneas passam). No login, usuário inexistente retorna antes do `bcrypt.compare` (enumeração por tempo); o cadastro devolve 409 para e-mail existente, com limite. | `reset-password/route.ts:38-58`; `auth.ts:57`; `register/route.ts:24` | Janela estreita (token de 256 bits). | `bcrypt.compare` falso quando o usuário não existe. | P |
| B4 | Baixo | Segurança | Upload sem cota nem limite de taxa por restaurante. | `src/app/api/upload/route.ts` | Um dono mal-intencionado enche o bucket público. | Cota por restaurante. | P |
| B5 | Baixo | Segurança | Pedido sem dono (mesa e legado) ainda devolve `customerName` e `notes` a quem tiver o id (o telefone já é removido). | `orders/[id]/route.ts:38-45` | Dado de baixa sensibilidade, id é cuid. | Remover também esses dois campos para não dono. | P |
| B6 | Baixo | Segurança | Rebaixar papel, apagar usuário ou trocar a senha só valem na próxima reconferência (até 5 min). | `src/lib/auth.ts:16,105` | Escolha de projeto, documentada. | Nenhuma por ora. | n/a |
| B7 | Baixo | Fluxos | Aritmética do pedido em `number`, sem arredondar o total; o Postgres arredonda de volta para duas casas. | `orders/route.ts:299-302,330` | Hoje correto com preços de duas casas; risco futuro com desconto fracionado. | Calcular em centavos inteiros. | P |
| B8 | Baixo | Fluxos | Webhook e reconciliação disputam o provisionamento; o perdedor bate no unique de `Assinatura.tenantId` e o webhook responde 500 (o Asaas reentrega e a idempotência resolve). | `webhook/asaas/route.ts:134-156`; `provisionamento.ts:135-248` | `PAGOU` duplicado no funil e ruído de log; sem restaurante duplicado. | Teste de concorrência com banco real. | P |
| B9 | Baixo | Fluxos | O `diaVencimento` local tem teto 28 e vem do dia do pagamento; o Asaas usa o dia do checkout sem teto. Para quem assina nos dias 29 a 31 a tela mostra o próximo vencimento errado, e na virada do mês podem nascer duas cobranças `PAGA` para o mesmo pagamento (não afeta a régua). | `provisionamento.ts:124`; `asaas.ts:81-83`; `competencia.ts:72` | Cosmético. | Derivar da data do primeiro pagamento do Asaas. | P |
| B10 | Baixo | Fluxos | Retry de checkout após 502 fica preso no slug por 1h (cartão) ou 24h (PIX), e cada tentativa cria um cliente novo no Asaas. | `assinar/route.ts:357-371` | Quem erra a primeira tentativa não repete com o mesmo endereço. | Reaproveitar a `Inscricao` do mesmo e-mail. | P |
| B11 | Baixo | Fluxos | O valor do webhook da assinatura da plataforma não é conferido contra o preço do plano; cupom de 100% em retirada gera pedido de total zero que o gateway rejeita e o pedido é cancelado; o PagBank recebe itens e total separados (a verificar se valida a soma). | `provisionamento.ts:171`; `charge/route.ts:111-125`; `pagbank-adapter.ts:168-170` | Mitigado por autenticação por token e pelo gateway. | Conferir valor; tratar total zero sem cobrança. | P |
| B12 | Baixo | Operação | O cron agenda `0 9 * * *` em UTC (06:00 BRT) e a documentação diz "9h"; o cron não tem heartbeat; o alerta de backup só vira issue no repositório e o GitHub desativa agendamentos após 60 dias sem atividade. | `vercel.json:12`; `backup.yml:55-62` | Se a Vercel não disparar o cron ou o GitHub pausar o backup, ninguém é avisado. | Monitor externo de "último dump" e de execução do cron; corrigir a documentação. | P |
| B13 | Baixo | Manutenibilidade | `tsx` está em `dependencies` (arrasta o `esbuild` do audit); token de reset expirado só é apagado no próximo pedido do mesmo e-mail. | `package.json`; `forgot-password/route.ts:246` | Ruído. | Mover `tsx` para `devDependencies` se o CI de backup permitir; limpeza no cron. | P |
| I1 | Info | Manutenibilidade | `npm audit` (prod): `esbuild` 0.27.3 a 0.28.0 (dev server no Windows) e `uuid` <11.1.1 via `mercadopago` (o código não passa `buf`). Corrigir o segundo exige a 3.x do `mercadopago` (quebra de API). | `npm audit --omit=dev` | Nenhum atingível aqui. | `npm audit fix` para o `esbuild`; adiar o `mercadopago`. | P |
| I2 | Info | Manutenibilidade | Atrasos relevantes: `next-auth` em 5.0.0-beta.32, `@prisma/client` 6.19.3 (estável atual 7.x), `@supabase/supabase-js` 2.101 contra 2.117, `lucide-react` muito atrás. Maiores arquivos: `TableManager.tsx` (830 linhas), `checkout/page.tsx` (574), `OrderTracker.tsx` (502), `proxy.ts` (464), `FormularioAssinatura.tsx` (452), `assinar/route.ts` (423), `orders/route.ts` (415). | `package.json`, `wc -l` | Sem urgência; `proxy.ts` e `assinar/route.ts` merecem extração antes de crescer. | Planejar atualizações no trimestre. | M |

---

## 5. O que está bem feito

- **Isolamento entre restaurantes.** A extensão do Prisma injeta `tenantId` em toda operação com `where`, inclusive `updateManyAndReturn`, `upsert` e `createMany*`, impede mover linha entre tenants e falha fechada sem contexto (`src/lib/prisma.ts:44-107`, `src/lib/tenant-context.ts`). Os 15 models com `tenantId` estão na lista e têm `@@index([tenantId])`, com teste que confere a lista contra o schema. O `AGENTS.md` é honesto sobre o que o RLS faz e não faz.
- **RLS como trava contra a chave anon.** `ENABLE ROW LEVEL SECURITY` em todas as tabelas criadas pelas migrações (24 comandos), protegido por `src/security/invariantes.test.ts`, que também trava `prismaUnscoped` fora da lista, imports de servidor em componente `"use client"`, `NEXT_PUBLIC_*` fora da lista fechada e os headers de segurança.
- **Proxy.** `x-tenant-id` do navegador é apagado ou sobrescrito, `tenantMismatch` trata sessão de outro restaurante, o host raiz nunca vira restaurante (404 fora da landing), `/platform` só responde no subdomínio do console, e a inadimplência fecha só `/adm` (`src/proxy.ts:94-98,193-198,302-325,396-405,436-439`).
- **Matriz de acesso.** `src/security/politica-de-acesso.ts` cobre as 56 rotas e quebra o teste se uma rota nova não declarar quem pode chamá-la.
- **Webhooks.** Segredo obrigatório por adapter, comparado em tempo constante; Mercado Pago confirma o pagamento na API com o token do lojista; Stripe com janela de 5 minutos; `updateMany` pelo estado de origem (idempotente, sem reabrir pedido cancelado); valor pago menor que o total não quita e gera alerta; pagamento aprovado em pedido cancelado gera alerta de estorno. O webhook do Asaas da plataforma autentica por token em tempo constante e falha fechado.
- **Checkout resiliente.** Preço calculado no servidor; a `Inscricao` nasce antes do gateway; ordem dos eventos do funil documentada (`CHECKOUT_CRIADO` fora do `try` que fala com o Asaas, `PAGOU` antes de provisionar, `PROVISIONADO` dentro da transação); provisionamento retomável por `tenantId` e por slug; reconciliação pelo cron, pela volta do cliente e por `externalReference`.
- **Cobrança recorrente.** O espelho reconhece a cobrança pelo `asaasPaymentId` (vencimento remarcado não duplica), `PAGA` nunca reabre, e o cron reconcilia com o Asaas todo dia, em lotes de 5 e com `maxDuration = 300`. A régua deriva do vencimento mais antigo em aberto, então pagar uma fatura não zera outras em atraso.
- **Pedido.** Frete, desconto e preço vêm do banco; o zod descarta campos extras; mesa e cupom são conferidos no tenant; tetos por campo; cupom de uso único com compensação pós-escrita; cozinha sem acesso a dinheiro.
- **Dinheiro.** Todos os campos monetários são `Decimal(10,2)`; planos em centavos inteiros com teste que compara a landing contra a tabela de preços (`src/lib/plans.ts`); `FILTRO_DE_RECEITA` dá uma definição única de receita.
- **Sessão e senha.** JWT de 7 dias reconferido a cada 5 minutos (existência, tenant, `passwordChangedAt`); cookie da plataforma separado; troca de senha encerra as sessões abertas; bcrypt com custo 12; token de reset de 256 bits, uso único, 1 hora; `forgot-password` responde igual para e-mail inexistente.
- **Credenciais dos lojistas.** AES-256-GCM com IV aleatório e `authTag` verificado, chave só no ambiente, interface recebe mascarado, credencial validada no gateway antes de salvar.
- **Segredos.** Só `.env.example` versionado; nenhum achado no histórico do git (JWT do Supabase, `sb_secret_`, `service_role`, URLs com senha); `SUPABASE_SERVICE_ROLE_KEY` só em `supabase-admin.ts`.
- **Upload e SSRF.** Conteúdo decodificado com `sharp`, regravado em WebP sem EXIF, limite de pixels, pasta por restaurante; o fetch do ícone passa por allowlist, `redirect: "error"`, teto de bytes e timeout.
- **Backup e deploy.** Dump validado pelo fim do arquivo, recusa de host local, retenção por contagem remota, store privado, checagem de idade de 26h e issue automática; migração só no deploy de produção, com `DIRECT_URL`, e falha de migração derruba o deploy; gate de build para termos e variáveis.
- **Falhas de terceiros.** Timeout de 15s em todos os gateways, `reportarErro` sem PII, webhook que devolve 500 em falha real, polling de reserva em todo canal de tempo real e pausado com a aba escondida.
- **LGPD no que existe.** Aceite gravado com data e versão, CPF/CNPJ não persistido, expurgo de eventos do funil em 90 dias com resumo, anonimização com confirmação repetida e versão de produção com backup, política que descreve papéis, bases legais e retenção de backup.
- **Testes e CI.** 2488 testes de comportamento com nomes que descrevem regras de negócio, mais as invariantes de `src/security/`; CI com lint, `tsc`, testes e `npm audit`.

---

## 6. Plano de ação

### Antes do primeiro cliente pagante

1. **C1.** Preencher `termos.html` e `privacidade.html`, passar por advogado e publicar (o deploy de produção só passa depois disso).
2. **A2 e A1.** Decidir o que é cancelamento. No mínimo: separar o estado "cancelado pelo gateway" de "cortesia" e dar prazo de graça; e implementar cancelar e alterar assinatura no Asaas, chamando-os a partir do CRM. Até lá, cancelar no painel do Asaas à mão.
3. **A3.** Definir `ERROR_WEBHOOK_URL` na Vercel, trocar `console.error` por `reportarErro` nas falhas de venda e pagamento sem inscrição, configurar monitor externo em `/api/health`.
4. Validar no sandbox do Asaas renovação, atraso, cancelamento e os nomes dos eventos e status (estorno, chargeback, ordem de `/subscriptions/{id}/payments`).
5. Conferir na Vercel e no Supabase os itens da seção 8 (planos, variáveis, `connection_limit`, `DIRECT_URL`, domínio do Resend verificado).
6. **M6 e M16.** Fechar a janela do `asaasSubscriptionId` nulo e mostrar o endereço do restaurante com reenvio de acesso na tela de obrigado.
7. **M4.** Confirmar e apertar a assinatura do webhook do Abacate Pay (ou desligar o gateway até confirmar).

### Nos primeiros 30 dias

1. **A4.** Contratar PITR, fazer o primeiro drill de restauração num projeto descartável e escrever o runbook de incidente.
2. **M1, M2 e M3.** Rate limit compartilhado (Firewall ou Upstash/KV) para login, reset e pedido; limite por IP e por mesa; 2FA ou restrição de IP no console da plataforma; validar horário no servidor; idempotência de pedido.
3. **M7, M8, M9 e M10.** Fechar os estados de borda da cobrança (faxina com cancelamento no gateway, competência cancelada, estorno), máquina de estados no PATCH de pedido, idempotência em `charge` e `close-bill`.
4. **M13 e M14.** Aviso de privacidade em cada host, cron de retenção e botão de anonimizar no `/adm`.
5. **M5 e M17.** Empacotar ou fixar com SRI os scripts da landing, restringir `remotePatterns`, apagar imagens órfãs.
6. **M15.** Branch protection com checks obrigatórios e regra de migração aditiva.
7. **M18.** Postgres no CI e os primeiros testes de integração (seção 7, itens 1 a 5).

### Antes de chegar a 100 restaurantes

1. **A5.** Cache do tenant no proxy, pool único com timeouts, revisão do `connection_limit`.
2. **M11.** Monitorar Realtime, subir o teto do plano, `after()` no broadcast.
3. **M12.** Agregação no banco, índice `[tenantId,createdAt]`, cozinha com `select` enxuto.
4. **A4.** Backup em `pg_dump -Fc` com streaming, cópia do bucket de imagens, preview com banco próprio.
5. **B1 e B2.** Canal privado com RLS em `realtime.messages`, `REALTIME_TOPIC_SECRET` próprio, versão de chave nas credenciais.
6. Promover a CSP a enforce; atualizar `next-auth`, Prisma e `mercadopago` conforme conveniência.

---

## 7. Plano de testes priorizado

O que existe: webhook de assinatura (35 casos), espelho, régua, competência, reconciliação, cron (41 casos), pedidos (55 casos), `charge`, webhook de pagamento do pedido, `close-bill`, os cinco adapters, extensão do Prisma, matriz de acesso e invariantes de `src/security/`, `proxy.test.ts` (isolamento e bloqueio) e a costura de ponta a ponta em `funil-de-aquisicao.test.ts`. A qualidade é boa: testam regras de negócio, não só estrutura. O limite é estrutural: tudo roda sobre Prisma mockado.

Sem teste hoje: concorrência real (dois eventos do Asaas, webhook contra reconciliação, dois `close-bill`, dois `POST /api/orders`), transições inválidas no `PATCH` de pedido, ciclo de vida da assinatura com cancelamento e pagamento recriado, propagação ao Asaas (inexistente), ciclo anual de ponta a ponta e RLS consultado como `anon`.

Ordem sugerida, por risco:

1. **Postgres real no CI.** Serviço `postgres` no workflow, `prisma migrate deploy`, testes `*.integration.test.ts` com guarda de localhost como `scripts/guard-local-db.js`. Os itens abaixo dependem disto.
2. **Provisionamento concorrente.** Dois `provisionarInscricao` em `Promise.all` sobre a mesma `Inscricao`: exatamente 1 `Tenant`, 1 `Assinatura`, 1 `Cobranca`; a segunda chamada é no-op ou lança.
3. **Ciclo da assinatura contra o banco.** Primeiro pagamento; `PAYMENT_CREATED` do mês 2; `PAYMENT_OVERDUE` com vencimento de 16 dias atrás vira `BLOQUEADA` e `/adm` redireciona; `PAYMENT_RECEIVED` volta a `ATIVA`. Casos extras: pagamento apagado e recriado na mesma competência (M8), `asaasSubscriptionId` nulo (M6), `SUBSCRIPTION_DELETED` seguido de pagamento (A2), estorno.
4. **Pedido concorrente.** Dois `POST /api/orders` iguais em paralelo devem gerar 1 pedido (hoje falha, M3; serve de regressão para a idempotência).
5. **`close-bill`.** Duas chamadas simultâneas mais um pedido novo no meio: 1 conjunto de `Payment`, nenhum pedido pago fora da conta.
6. **PATCH de pedido.** `DELIVERED` para `PENDING` dá 409; cancelar pedido `PAID` online gera alerta; id inexistente dá 404.
7. **Isolamento de tenant com banco.** Dois tenants, um pedido cada: consulta no contexto do tenant A nunca devolve o do B, inclusive em `updateMany`, `upsert` e `$transaction`; teste de que `anon` não lê nenhuma tabela do schema `public` (RLS de verdade).
8. **Dinheiro.** Propriedade com `fast-check`: para quaisquer preços de duas casas, quantidades e cupons, o total bate com a soma exata em centavos.
9. **Cancelamento e alteração propagados ao Asaas** (junto com A1), validando o corpo enviado com `fetch` mockado.
10. **Gate dos termos e variáveis de produção.** Já coberto em `src/lib/assinatura/env-producao.test.ts`; manter ao incluir `ERROR_WEBHOOK_URL`.

---

## 8. Itens "a verificar" (dependem de acesso que esta revisão não teve)

1. **Vercel.** Plano (Hobby proíbe uso comercial e limita cron e duração); `ERROR_WEBHOOK_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `ASAAS_WEBHOOK_TOKEN`, `LANDING_ORIGIN`, `PAYMENT_TOKEN_ENCRYPTION_KEY`, `REALTIME_TOPIC_SECRET` e `AUTH_SECRET` ou `NEXTAUTH_SECRET` definidos em produção; preview sem migração; `x-forwarded-for` sobrescrito pela borda; cota de Image Optimization.
2. **Supabase.** Plano e tamanho do compute; PITR (o `AGENTS.md` diz que não há); `DATABASE_URL` real (pooler em modo transação, `connection_limit`, `pool_timeout`) e `DIRECT_URL` (se for o host direto IPv6, runners do GitHub e builds da Vercel não alcançam); "Allow public access" do Realtime; `realtime.messages` sem escrita pela chave anon; bucket `product-images` só com leitura pública; policies RLS ativas em produção; limites de conexões simultâneas de Realtime.
3. **Asaas.** Eventos de assinatura (`SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`) e de pagamento cadastrados no webhook de produção com o token certo; por quanto tempo o PIX continua pagável depois do vencimento; ordem e paginação de `/subscriptions/{id}/payments?limit=24`; nomes dos status de estorno e chargeback; quanto tempo a fila fica pausada após falhas (o Asaas interrompe após 15).
4. **Outros gateways.** Se o PagBank valida a soma de itens contra o total do QR; se o Abacate Pay sempre envia `x-webhook-signature`; se todo lojista com Abacate Pay configurou o `webhookSecret`; se o evento `charge.refunded` da Stripe chega com o formato que o adapter espera (`stripe-adapter.ts` retorna `null` sem `client_reference_id`).
5. **GitHub.** Branch protection exigindo os checks do `testes.yml`; execução recente do `backup.yml`; store do Blob privado.
6. **Resend.** Domínio do remetente verificado e limite diário do plano.
7. **Operação.** Monitor externo apontando para `/api/health` e para o cron; drill de restauração com o dump mais recente; se a UI da cozinha impede avançar pedido PIX ainda não pago (o servidor aceita, M9).
8. **Produto.** Se "cliente cancelado mantém acesso" (A2) era intencional para algum caso; decisão sobre login obrigatório do consumidor final no checkout.
9. **Jurídico.** Aconselhamento sobre o cookie analítico `muno_s` (base de legítimo interesse ou consentimento), sobre dado sensível em observações de pedido e sobre o direito de arrependimento.
10. **Custos.** As estimativas por marco (seção 2) são do conhecimento geral dos planos e da premissa de cerca de 40 pedidos por dia por restaurante com 60% concentrados em 3 horas no sábado; precisam de medição real.

### Estimativa de escala por marco (premissa acima, não medição)

| Marco | Banco | Conexões e carga | Realtime | Custo mensal de infra |
|---|---|---|---|---|
| 10 | Cerca de 0,4 GB/ano | Sem problema | Folgado | cerca de US$ 50 (Vercel Pro 20, Supabase Pro 25) |
| 100 | 4 a 5 GB/ano, perto do disco incluso em 1 a 2 anos | Aqui A5 aparece: pool e lookup do proxy a cada tick | O teto de cerca de 500 conexões começa a apertar | US$ 100 a 180 |
| 1.000 | Cerca de 40 GB/ano, estoura o disco incluso em 3 a 4 meses | Centenas de consultas por segundo só de polling | Exige plano maior ou menos conexões fixas | US$ 350 a 900 |

Caro de mudar depois: cache do tenant no proxy e modelo de pools (A5), backup lógico contra PITR (A4), política de retenção de pedidos (M14), isolamento de preview e produção no banco (M15). Pode esperar: índice `[tenantId,createdAt]` (M12), imagens órfãs (M17), limitador compartilhado (M1), `after()` no broadcast (M11).

---

## 9. Situação depois das correções

Atualizado depois dos PRs #7, #8 e do que vem na branch `fix/revisao-itens-restantes`. "Feito" significa corrigido em código e coberto por teste; o que depende de conta, painel ou decisão está em "Falta".

| ID | Situação | O que foi feito / o que falta |
|---|---|---|
| C1 | Falta (sua) | Gate de build continua barrando o deploy até os campos `<mark>` dos termos serem preenchidos. |
| A1 | Feito | CRM cancela e atualiza a assinatura no Asaas antes de gravar (502 se o gateway recusar; 409 para dia de vencimento e plano anual). |
| A2 | Feito | Cancelamento pelo gateway grava `encerraEm` (fim do período pago) e o proxy fecha a gestão; `CANCELADA` fica só como decisão do operador. Corte por atraso em 10 dias úteis. |
| A3 | Feito, falta configurar | Falhas de venda, pagamento sem inscrição, faxina, pagamento duplicado e estorno passam por `reportarErro`. Falta definir `ERROR_WEBHOOK_URL` (o build avisa se faltar) e o monitor em `/api/health`. |
| A4 | Parcial | Alerta e checagem de idade do backup existem. Falta contratar PITR, ensaiar o restore, copiar o bucket de imagens e trocar o dump para streaming (hoje cabe com folga). |
| A5 | Feito | Cache de 30s do restaurante no proxy e um pool de conexões só. Falta `connection_limit` na `DATABASE_URL` (Vercel). |
| M1 | Parcial | Limite por IP no login (restaurante e console), bcrypt falso, senha nova de 8 caracteres. Falta o limitador compartilhado (Upstash/KV ou Firewall). |
| M2 | Parcial | `PLATFORM_ALLOWED_IPS` restringe o console por IP. Falta o segundo fator. |
| M3 | Feito | Chave de idempotência (unique no banco), horário validado no servidor, 60 pedidos/10 min por IP e restaurante, soma em centavos. |
| M4 | Falta | Confirmar com o Abacate Pay se o HMAC sempre vem no header antes de torná-lo obrigatório. |
| M5 | Parcial | Landing sem nenhum script de terceiro. CSP segue em Report-Only. |
| M6, M7, M8 | Feito | `asaasSubscriptionId` herdado do pagamento; timeout vira estado incerto; faxina cancela no Asaas; competência cancelada reaproveitada; estorno e chargeback reabrem a cobrança. |
| M9, M10 | Feito | Máquina de estados no PATCH, fechamento de conta em transação interativa, alerta de pagamento duplicado. |
| M11 | Parcial | Broadcast com timeout de 2s, nunca lança e solta o canal. Falta monitorar o limite de conexões de Realtime. |
| M12 | Parcial | Índice `(tenantId, createdAt)`, ranking em 30 dias. Falta agregar o gráfico no banco. |
| M13, M14 | Feito | `/privacidade` nos domínios dos restaurantes, linkada no cadastro e no checkout; retenção opcional (`RETENCAO_PEDIDOS_MESES`) e limpeza de tokens no cron. O prazo é decisão sua. |
| M15 | Parcial | Regra de migração escrita no `AGENTS.md`. Falta branch protection e banco próprio para preview. |
| M16 | Feito | Tela de obrigado com link para criar a senha; o build exige `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e a chave de criptografia. |
| M17 | Parcial | `remotePatterns` restrito ao projeto e ao bucket. Imagens órfãs seguem. |
| M18 | Feito | 30 testes de integração contra Postgres real, rodando no CI (isolamento, RLS, assinatura, concorrência, conta da mesa, reset de senha). |
| B2 | Feito | `PAYMENT_TOKEN_ENCRYPTION_KEY_ANTERIOR` e `npm run credenciais:rotacionar`. |
| B3, B4, B5, B7, B13 | Feito | Reset atômico, bcrypt falso, cota de 500 imagens por restaurante, nome e observações fora da leitura anônima, centavos, `tsx` em `devDependencies`. |
| B1, B9, B10, B11, B12, I2 | Falta | Canal privado com RLS, dia 29 a 31, retry do checkout, valor do webhook da assinatura, heartbeat do cron, atualização de dependências. |

**Para vender:** (1) preencher os termos, (2) validar Asaas no sandbox, (3) variáveis na Vercel (`ERROR_WEBHOOK_URL`, `RESEND_FROM_EMAIL`, `AUTH_SECRET`, `connection_limit=1`, `PLATFORM_ALLOWED_IPS`), (4) uma compra de ponta a ponta.
