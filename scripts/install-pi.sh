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
chown -hR root:fitfamily "$APP_DIR"
chmod -R go-w "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data" "$APP_DIR/backups"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Projektdateien müssen zuerst nach $APP_DIR kopiert oder dort geklont werden."
  exit 1
fi

cd "$APP_DIR"
./scripts/install-privileged-helpers.sh
if [[ ! -e "$APP_DIR/current" && -f "$APP_DIR/.next/BUILD_ID" ]]; then
  ln -s "$APP_DIR" "$APP_DIR/current"
fi

install -m 0644 deploy/systemd/fitfamily.service /etc/systemd/system/fitfamily.service
install -m 0644 deploy/systemd/fitfamily-backup.service /etc/systemd/system/fitfamily-backup.service
install -m 0644 deploy/systemd/fitfamily-backup.timer /etc/systemd/system/fitfamily-backup.timer
systemctl daemon-reload
systemctl enable fitfamily.service
/usr/local/libexec/fitfamily-update --install-local
systemctl enable --now fitfamily-backup.timer
echo "FitFamily läuft auf Port 3000."
