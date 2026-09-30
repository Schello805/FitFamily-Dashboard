#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte im Projektverzeichnis mit sudo ausführen: sudo ./scripts/install-ubuntu.sh"
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_DIR="/opt/fitfamily"
APP_USER="fitfamily"

if [[ "$APP_DIR" != "$EXPECTED_DIR" ]]; then
  echo "Das Projekt muss unter $EXPECTED_DIR liegen (aktuell: $APP_DIR)."
  exit 1
fi

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "package.json fehlt in $APP_DIR."
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]]; then
  echo "Node.js 22 oder neuer wird benötigt. Bitte zuerst installieren und erneut starten."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1 || ! command -v openssl >/dev/null 2>&1; then
  echo "Bitte npm und openssl installieren und erneut starten."
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_DIR/data" "$APP_DIR/backups"
if [[ ! -f "$APP_DIR/.env.local" ]]; then
  install -m 0600 "$APP_DIR/.env.example" "$APP_DIR/.env.local"
  session_secret="$(openssl rand -hex 32)"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$session_secret|" "$APP_DIR/.env.local"
  lan_ip="$(hostname -I | awk '{print $1}')"
  if [[ -n "$lan_ip" ]]; then
    sed -i "s|^APP_URL=.*|APP_URL=http://$lan_ip:3000|" "$APP_DIR/.env.local"
  fi
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 0600 "$APP_DIR/.env.local"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

install -m 0644 "$APP_DIR/deploy/systemd/fitfamily.service" /etc/systemd/system/fitfamily.service
systemctl daemon-reload
systemctl enable --now fitfamily.service

echo "FitFamily läuft als lokaler Dienst unter http://localhost:3000."
echo "Für Handys im Heimnetz in .env.local APP_URL auf die LAN-Adresse dieses PCs setzen."
