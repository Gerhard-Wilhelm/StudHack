#!/bin/bash
# Richtet den täglichen Stud.IP-Scan als launchd-Job ein (macOS, nur für deinen Nutzer).
#
#   scripts/scan_einrichten.sh              einrichten oder aktualisieren (täglich 07:30)
#   scripts/scan_einrichten.sh --entfernen  wieder abschalten
#   launchctl kickstart -k gui/$(id -u)/de.studhack.scan   sofort einmal ausführen
#
# Verpasste Läufe (Mac im Ruhezustand) holt launchd beim Aufwachen nach.
set -euo pipefail

LABEL="de.studhack.scan"
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "--entfernen" ]]; then
  launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Täglicher Scan abgeschaltet."
  exit 0
fi

if [[ ! -x "$PROJECT/.venv/bin/python" ]]; then
  echo "Fehlt: $PROJECT/.venv (siehe README, Einrichtung)." >&2
  exit 1
fi

mkdir -p "$PROJECT/logs" "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PROJECT/.venv/bin/python</string>
    <string>-m</string>
    <string>scanner.auto</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>7</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$PROJECT/logs/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$PROJECT/logs/launchd.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Täglicher Scan eingerichtet (07:30). Sofort testen mit:"
echo "  launchctl kickstart -k $DOMAIN/$LABEL"
echo "Protokoll: $PROJECT/logs/scan.log"
