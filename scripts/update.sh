#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Automatisches Update-Skript
# Kann im Terminal aufgerufen werden: sudo /opt/fitfamily/scripts/update.sh oder npm run update

APP_DIR="/opt/fitfamily"
if [[ ! -d "$APP_DIR" && -f "$(dirname "$0")/../package.json" ]]; then
  APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi

cd "$APP_DIR"

echo "=========================================================="
echo " FitFamily Dashboard – Automatisches Update               "
echo "=========================================================="

echo ""
echo "-> 1/5: Sicherheitskopie der Datenbank anlegen..."
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$APP_DIR/backups"
if [[ -f "$APP_DIR/data/fitfamily.db" ]]; then
  cp "$APP_DIR/data/fitfamily.db" "$APP_DIR/backups/fitfamily-backup-pre-update-$TIMESTAMP.db"
  echo "   Gesichert: backups/fitfamily-backup-pre-update-$TIMESTAMP.db"
fi

echo ""
echo "-> 2/5: Neueste Änderungen von GitHub laden..."
git config --system --add safe.directory "$APP_DIR" 2>/dev/null || git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git fetch origin main
git checkout main
git pull --ff-only origin main

echo ""
echo "-> 3/5: Abhängigkeiten aktualisieren..."
npm ci

echo ""
echo "-> 4/5: Dashboard neu bauen..."
npm run build

echo ""
echo "-> 5/5: Dienst neu starten..."
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet fitfamily 2>/dev/null; then
  echo "   Starte fitfamily.service neu..."
  if [[ "$(id -u)" -eq 0 ]]; then
    systemctl restart fitfamily
  else
    sudo systemctl restart fitfamily
  fi
  echo "   FitFamily Dienst wurde erfolgreich neu gestartet!"
else
  echo "   Hinweis: fitfamily.service ist derzeit nicht aktiv."
fi

echo ""
echo "=========================================================="
echo " Update erfolgreich abgeschlossen!"
echo " Aktueller Stand: $(git rev-parse --short HEAD)"
echo "=========================================================="
