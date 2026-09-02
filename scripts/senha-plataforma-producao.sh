#!/usr/bin/env bash
#
# Redefine a senha de um admin de plataforma em PRODUÇÃO.
#
#   npm run platform:senha:prod -- --email "x@y.com" --confirmar "x@y.com"
#
# Mesma forma do tenant:remove:prod: carrega .env.prod explicitamente em vez de
# confiar no DATABASE_URL do ambiente, para o comando decidir sozinho em que
# banco está mexendo.
#
# SEM backup obrigatório, ao contrário do db:deploy e do tenant:remove:prod, e a
# diferença é deliberada: aqueles apagam ou reescrevem dado de cliente e não têm
# desfazer, enquanto este troca uma coluna de uma linha que o próprio dono
# controla. Exigir um dump de produção inteiro para trocar a própria senha
# transformaria a operação de emergência na mais lenta que existe.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "erro: .env.prod não encontrado." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env.prod; set +a

# A trava: este script existe para mexer em produção, e apontá-lo para o banco
# de desenvolvimento por engano faz alguém trocar uma senha e continuar sem
# conseguir entrar, procurando o problema no lugar errado.
HOST=$(printf '%s' "${DATABASE_URL:-}" | sed -E 's#^[^@]*@##; s#[:/].*$##')
case "$HOST" in
  localhost|127.0.0.1|"")
    echo "erro: .env.prod aponta para '$HOST'. Isto é local, não produção." >&2
    exit 1
    ;;
esac

npx tsx scripts/redefinir-senha-plataforma.ts "$@"
