#!/usr/bin/env bash
#
# Aplica migrações pendentes em PRODUÇÃO, com backup antes.
#
#   npm run db:deploy
#
# Normalmente você não precisa disto: o build da Vercel já migra a cada deploy
# de produção (scripts/migrate-on-deploy.js). Isto existe para quando você
# precisa migrar sem publicar código — corrigir uma migração que falhou no
# build, por exemplo.
#
# Carrega .env.prod explicitamente em vez de confiar no DATABASE_URL do
# ambiente. É o inverso da trava do guard-local-db.js: lá o alvo tem que ser
# local, aqui tem que ser produção, e nos dois casos o comando decide sozinho
# em vez de depender de qual .env estava carregado na hora.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "erro: .env.prod não encontrado." >&2
  exit 1
fi

# O backup vem primeiro e é obrigatório: se ele falhar, o set -e aborta antes de
# tocar no schema. Migrar sem cópia é a situação que não queremos poder criar.
./scripts/backup-producao.sh

# shellcheck disable=SC1091
set -a; . ./.env.prod; set +a

echo
echo "Aplicando migrações pendentes em produção..."
npx prisma migrate deploy
