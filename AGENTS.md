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

Produção só recebe `npm run db:deploy` (`prisma migrate deploy`), que aplica
migrações pendentes sem nunca resetar nem derrubar coluna. As credenciais estão
em `.env.prod`, que nada carrega sozinho.

Toda tabela com `tenantId` obrigatório precisa de três coisas, senão vaza entre
restaurantes: entrada em `src/lib/tenant-scoped-models.ts`, `@@index([tenantId])`
no schema, e a policy RLS na migração (copiar de
`20260801193000_rls_em_orderitem_e_deliverytracking`). O teste
`src/lib/tenant-scoped-models.test.ts` cobre a primeira.
