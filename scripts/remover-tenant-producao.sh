#!/usr/bin/env bash
#
# Remove um tenant de PRODUÇÃO, com backup antes.
#
#   npm run tenant:remove:prod -- --slug "restaurante-x" --confirmar "restaurante-x"
#
# Mesma forma do db:deploy: o backup é obrigatório e vem primeiro, porque não há
# Point-in-Time Recovery contratado. Aqui isso pesa mais que numa migração — uma
# migração ruim costuma falhar antes de mudar dado, esta operação apaga pedido,
# cliente e cardápio de um restaurante inteiro, sem desfazer.
#
# Carrega .env.prod explicitamente em vez de confiar no DATABASE_URL do
# ambiente: o comando decide sozinho em que banco está mexendo.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "erro: .env.prod não encontrado." >&2
  exit 1
fi

./scripts/backup-producao.sh

# shellcheck disable=SC1091
set -a; . ./.env.prod; set +a

npx tsx scripts/remove-tenant.ts "$@"
