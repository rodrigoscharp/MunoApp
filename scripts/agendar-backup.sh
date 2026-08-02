#!/usr/bin/env bash
#
# Agenda o backup de produção para rodar todo dia, via launchd (macOS).
#
#   ./scripts/agendar-backup.sh            instala, roda às 03:00
#   ./scripts/agendar-backup.sh 21 30      instala, roda às 21:30
#   ./scripts/agendar-backup.sh --remover  desinstala
#
# Roda na sua máquina, então só acontece com ela ligada — o launchd executa
# assim que a máquina acorda, se o horário passou enquanto estava dormindo.
# É a limitação de fazer isso de graça: um backup em servidor exigiria o plano
# pago do Supabase ou uma máquina que não desliga.
#
# O dump precisa do container do Postgres de pé (é de lá que sai o pg_dump).
# Se ele estiver parado no horário, o log registra a falha e nada é apagado —
# a retenção só roda depois de um dump íntegro.

set -euo pipefail

cd "$(dirname "$0")/.."
RAIZ="$(pwd)"

ROTULO="com.muno.backup-producao"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"

if [ "${1:-}" = "--remover" ]; then
  launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Agendamento removido."
  exit 0
fi

HORA="${1:-3}"
MINUTO="${2:-0}"

mkdir -p "$HOME/Library/LaunchAgents" "$RAIZ/backups"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RAIZ/scripts/backup-producao.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$RAIZ</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HORA</integer>
    <key>Minute</key><integer>$MINUTO</integer>
  </dict>
  <!-- Se a máquina estava dormindo na hora marcada, roda ao acordar. -->
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$RAIZ/backups/agendamento.log</string>
  <key>StandardErrorPath</key><string>$RAIZ/backups/agendamento.log</string>
  <!-- docker está no PATH do usuário, não no mínimo do launchd. -->
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

printf 'Agendado: todo dia às %02d:%02d\n' "$HORA" "$MINUTO"
echo "Log:      backups/agendamento.log"
echo "Remover:  ./scripts/agendar-backup.sh --remover"
