#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo ausführen: sudo ./scripts/install-pi.sh"
  exit 1
fi

APP_DIR="/opt/fitfamily"
APP_USER="fitfamily"

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_DIR/data" "$APP_DIR/backups"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Projektdateien müssen zuerst nach $APP_DIR kopiert oder dort geklont werden."
  exit 1
fi

cd "$APP_DIR"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

install -m 0644 deploy/systemd/fitfamily.service /etc/systemd/system/fitfamily.service
install -m 0644 deploy/systemd/fitfamily-backup.service /etc/systemd/system/fitfamily-backup.service
install -m 0644 deploy/systemd/fitfamily-backup.timer /etc/systemd/system/fitfamily-backup.timer
systemctl daemon-reload
systemctl enable --now fitfamily.service
systemctl enable --now fitfamily-backup.timer
echo "FitFamily läuft auf Port 3000."
