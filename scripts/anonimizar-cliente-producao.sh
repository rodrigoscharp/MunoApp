#!/usr/bin/env bash
#
# Anonimiza os dados de um cliente final num restaurante de PRODUÇÃO, com backup antes.
#
#   npm run cliente:anonimizar:prod -- --slug "x" --telefone "11999998888" --confirmar "x"
#
# Mesma forma de tenant:remove:prod: backup obrigatório e primeiro (não há
# Point-in-Time Recovery), e .env.prod carregado explicitamente em vez de
# confiar no DATABASE_URL do ambiente.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "erro: .env.prod não encontrado." >&2
  exit 1
fi

./scripts/backup-producao.sh

# shellcheck disable=SC1091
set -a; . ./.env.prod; set +a

npx tsx scripts/anonimizar-cliente.ts "$@"
