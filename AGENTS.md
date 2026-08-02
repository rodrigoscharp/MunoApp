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
npm run db:backup        dump avulso
npm run db:espelhar      traz produção para o banco local, anonimizada
npm run db:deploy        migra produção, com backup obrigatório antes
```

Um agendamento do launchd roda `scripts/backup-producao.sh` todo dia às 03:00 e
mantém 7 dias; o log fica em `backups/agendamento.log`. Como roda nesta máquina,
só acontece com ela ligada — é a limitação de não ter backup no servidor.

**Para investigar problema de cliente, use `db:espelhar`, não produção.** Ele
restaura o dump mais recente no banco local e apaga nome, telefone, e-mail,
endereço, conteúdo de chat e credencial de gateway, preservando volume,
relacionamentos e status. Você fica com a forma real dos dados sem carregar dado
pessoal. As senhas viram `dev123`. O script se recusa a rodar contra qualquer
host que não seja localhost, porque ele derruba o banco de destino antes de
restaurar.

Toda tabela com `tenantId` obrigatório precisa de três coisas, senão vaza entre
restaurantes: entrada em `src/lib/tenant-scoped-models.ts`, `@@index([tenantId])`
no schema, e a policy RLS na migração (copiar de
`20260801193000_rls_em_orderitem_e_deliverytracking`). O teste
`src/lib/tenant-scoped-models.test.ts` cobre a primeira.
