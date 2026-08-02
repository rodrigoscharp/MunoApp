#!/usr/bin/env bash
#
# Dump lógico do banco de produção para um arquivo local.
#
# Não substitui Point-in-Time Recovery — PITR recupera para qualquer instante e
# é add-on pago do Supabase. Isto é o que dá para ter de graça hoje: uma cópia
# consistente, tirada quando você mandar. Entre não ter nada e ter isto, a
# diferença é conseguir ou não voltar depois de um erro.
#
# Usa o pg_dump do container de desenvolvimento (mesma major do servidor), então
# não exige instalar cliente Postgres na máquina.
#
#   ./scripts/backup-producao.sh              dump para backups/
#   ./scripts/backup-producao.sh /outro/lugar
#
# Restaurar num banco vazio:
#   psql "postgresql://..." < backups/muno-AAAAMMDD-HHMMSS.sql
#
# Espere exatamente um erro, 'schema "public" already exists' — o Postgres já cria
# esse schema sozinho. Qualquer erro além dele merece olhada.
#
# Testado de ponta a ponta em 02/08/2026: dump de produção restaurado num banco
# limpo devolveu as mesmas contagens de Order, Tenant, MenuItem, Coupon e User.
#
# O arquivo tem pedido, telefone e endereço de cliente. Em repouso ele fica
# protegido pelo FileVault do disco, então laptop perdido não entrega nada — mas
# isso vale só enquanto o arquivo estiver AQUI. Copiar para pendrive, anexar num
# chat ou sincronizar backups/ com nuvem tira o dado dessa proteção. Para
# desenvolver com dados de verdade existe `npm run db:espelhar`, que restaura
# no banco local já anonimizado.
#
# backups/ está no .gitignore.

set -euo pipefail

cd "$(dirname "$0")/.."

DESTINO="${1:-backups}"
CONTAINER="muno-db-dev"

# No GitHub Actions as credenciais chegam por secret, já no ambiente. Só cai no
# .env.prod quando roda na máquina do desenvolvedor.
if [ -z "${DIRECT_URL:-}" ] && [ -f .env.prod ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env.prod; set +a
fi

if [ -z "${DIRECT_URL:-}" ]; then
  echo "erro: DIRECT_URL não definida (nem no ambiente, nem em .env.prod)." >&2
  echo "      O dump precisa da conexão direta (5432), não do pooler de transação (6543)." >&2
  exit 1
fi

mkdir -p "$DESTINO"
ARQUIVO="$DESTINO/muno-$(date +%Y%m%d-%H%M%S).sql"

echo "Copiando produção para $ARQUIVO ..."

# O pg_dump sai de um container postgres:17 — mesma major do servidor, sem
# exigir cliente Postgres instalado. Na máquina do desenvolvedor reaproveita o
# container que já está de pé; no CI sobe um descartável.
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  PGDUMP=(docker exec -i "$CONTAINER" pg_dump)
else
  PGDUMP=(docker run --rm -i postgres:17 pg_dump)
fi

# --no-owner e --no-acl: o dump volta em qualquer banco, sem depender das roles
# que o Supabase cria. -n public: só o schema da aplicação, sem os internos do
# Supabase (auth, storage), que não são nossos para restaurar.
"${PGDUMP[@]}" \
  --no-owner --no-acl --schema=public \
  "$DIRECT_URL" > "$ARQUIVO"

# Um dump truncado por queda de rede é pior que dump nenhum: parece proteção e
# não é. O pg_dump fecha com esta linha, então a ausência dela condena o arquivo.
# tail -20 e não -5: o marcador não é a última linha. O pg_dump 17.6 passou a
# emitir um '\unrestrict' depois dele, e com uma margem apertada a checagem
# passaria a reprovar dump bom no dia que a próxima versão acrescentar mais uma.
if ! tail -20 "$ARQUIVO" | grep -q "PostgreSQL database dump complete"; then
  echo "erro: dump incompleto, descartando $ARQUIVO" >&2
  mv "$ARQUIVO" "$ARQUIVO.incompleto"
  exit 1
fi

TAMANHO=$(du -h "$ARQUIVO" | cut -f1)
TABELAS=$(grep -c "^COPY " "$ARQUIVO" || true)

echo "Pronto: $ARQUIVO ($TAMANHO, $TABELAS tabelas com dados)"

# Retenção: 7 dias. Cada dump é uma cópia de telefone e endereço de cliente, e a
# janela útil de um backup diário é curta — um erro que ninguém notou em uma
# semana não vai ser desfeito restaurando. Guardar 30 era um mês de dado pessoal
# parado no disco para cobrir um cenário que não existe.
MANTER=7
EXCEDENTE=$(ls -t "$DESTINO"/muno-*.sql 2>/dev/null | tail -n +$((MANTER + 1)) || true)
if [ -n "$EXCEDENTE" ]; then
  echo "$EXCEDENTE" | xargs rm -f
  echo "Removidos $(echo "$EXCEDENTE" | wc -l | tr -d ' ') dump(s) antigos (mantendo $MANTER)."
fi

# Sobe para o Vercel Blob: é o que faz o backup sobreviver à perda da máquina.
# Falha aqui não invalida o dump local, que já está gravado e íntegro — por isso
# o '|| true'. O que não pode é a cópia local sumir por causa de rede.
if ! npx tsx scripts/enviar-backup.ts; then
  echo "aviso: envio para o Blob falhou. O dump local está íntegro em $ARQUIVO," >&2
  echo "       mas ainda só existe nesta máquina." >&2
fi
