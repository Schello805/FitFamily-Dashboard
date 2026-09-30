#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Automatisches Update- & Self-Healing-Skript
# Kann im Terminal aufgerufen werden: sudo /opt/fitfamily/scripts/update.sh oder npm run update

if [[ $EUID -ne 0 ]]; then
  echo "Für Updates und Dienst-Neustart sind Root-Rechte erforderlich."
  exec sudo bash "$0" "$@"
fi

APP_DIR="/opt/fitfamily"
if [[ ! -d "$APP_DIR" && -f "$(dirname "$0")/../package.json" ]]; then
  APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi

APP_USER="fitfamily"

cd "$APP_DIR"

echo "=========================================================="
echo " FitFamily Dashboard – Automatisches Update & Check       "
echo "=========================================================="

echo ""
echo "-> 1/6: Sicherheitskopie der Datenbank anlegen..."
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$APP_DIR/backups"
if [[ -f "$APP_DIR/data/fitfamily.db" ]]; then
  cp "$APP_DIR/data/fitfamily.db" "$APP_DIR/backups/fitfamily-backup-pre-update-$TIMESTAMP.db"
  echo "   Gesichert: backups/fitfamily-backup-pre-update-$TIMESTAMP.db"
fi

echo ""
echo "-> 2/6: Neueste Änderungen von GitHub laden..."
git config --system --add safe.directory "$APP_DIR" 2>/dev/null || git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
git fetch origin main
git checkout main
git pull --ff-only origin main

echo ""
echo "-> 3/6: Abhängigkeiten & Dashboard bauen..."
npm ci
npm run build

echo ""
echo "-> 4/6: Konfiguration & Berechtigungen prüfen..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi

# Systemd Service-Definition aktualisieren
if [[ -f "$APP_DIR/deploy/systemd/fitfamily.service" ]]; then
  cp "$APP_DIR/deploy/systemd/fitfamily.service" /etc/systemd/system/fitfamily.service
  systemctl daemon-reload
fi

# Sudoers für 1-Click Update
cat > /etc/sudoers.d/fitfamily << 'EOF'
fitfamily ALL=(ALL) NOPASSWD: /bin/systemctl restart fitfamily, /usr/bin/systemctl restart fitfamily, /opt/fitfamily/scripts/update.sh, /opt/fitfamily/scripts/repair.sh
EOF
chmod 0440 /etc/sudoers.d/fitfamily

chmod +x "$APP_DIR/scripts/"*.sh || true
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
if [[ -f "$APP_DIR/.env.local" ]]; then
  chmod 0600 "$APP_DIR/.env.local"
fi

echo ""
echo "-> 5/6: Firewall prüfen (Port 3000)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 3000/tcp comment 'FitFamily Dashboard' >/dev/null 2>&1 || true
fi

echo ""
echo "-> 6/6: Dienst aktivieren & neu starten..."
systemctl enable --now fitfamily.service
systemctl restart fitfamily.service
sleep 2

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -z "$LAN_IP" ]] && LAN_IP="localhost"

echo ""
if systemctl is-active --quiet fitfamily.service; then
  echo "=========================================================="
  echo " Update erfolgreich abgeschlossen! FitFamily läuft!"
  echo " Stand: $(git rev-parse --short HEAD)"
  echo ""
  echo " - Am Monitor:          http://localhost:3000"
  echo " - Im Heimnetz (Handy): http://${LAN_IP}:3000"
  echo "=========================================================="
else
  echo "=========================================================="
  echo " ACHTUNG: Dienst ist nicht aktiv. Fehlerprotokoll:"
  echo "=========================================================="
  journalctl -u fitfamily -n 25 --no-pager
fi
