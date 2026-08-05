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

Toda tabela com `tenantId` obrigatório precisa de três coisas, senão vaza entre
restaurantes: entrada em `src/lib/tenant-scoped-models.ts`, `@@index([tenantId])`
no schema, e a policy RLS na migração (copiar de
`20260801193000_rls_em_orderitem_e_deliverytracking`). O teste
`src/lib/tenant-scoped-models.test.ts` cobre a primeira.
