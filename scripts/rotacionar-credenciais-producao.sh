#!/usr/bin/env bash
#
# Regrava as credenciais de gateway de PRODUÇÃO com a chave atual, com backup antes.
#
#   npm run credenciais:rotacionar:prod -- --confirmar
#
# As duas chaves (PAYMENT_TOKEN_ENCRYPTION_KEY e _ANTERIOR) precisam estar no
# .env.prod. Mesma forma de tenant:remove:prod: backup obrigatório e primeiro.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "erro: .env.prod não encontrado." >&2
  exit 1
fi

./scripts/backup-producao.sh

# shellcheck disable=SC1091
set -a; . ./.env.prod; set +a

npx tsx scripts/rotacionar-credenciais.ts "$@"
