#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Automatisches Update- & Self-Healing-Skript
# Kann im Terminal aufgerufen werden: sudo /opt/fitfamily/scripts/update.sh oder npm run update

NO_RESTART=0
for arg in "$@"; do
  if [[ "$arg" == "--no-restart" ]]; then
    NO_RESTART=1
  fi
done

if [[ $EUID -ne 0 ]]; then
  echo "Für Updates und Dienst-Neustart sind Root-Rechte erforderlich."
  exec sudo bash "$0" "$@"
fi

APP_DIR=""
# 1. Prüfe ob der systemd-Dienst läuft und ein WorkingDirectory hat
if command -v systemctl >/dev/null 2>&1; then
  SYSTEMD_WD="$(systemctl show fitfamily -p WorkingDirectory --value 2>/dev/null || true)"
  if [[ -n "$SYSTEMD_WD" && -d "$SYSTEMD_WD" && -f "$SYSTEMD_WD/package.json" ]]; then
    APP_DIR="$SYSTEMD_WD"
  fi
fi

# 2. Prüfe ob das Skript innerhalb des Projektverzeichnisses aufgerufen wird
if [[ -z "$APP_DIR" && -f "$(dirname "${BASH_SOURCE[0]}")/../package.json" ]]; then
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# 3. Fallback auf /opt/fitfamily
if [[ -z "$APP_DIR" && -d "/opt/fitfamily" ]]; then
  APP_DIR="/opt/fitfamily"
fi

# 4. Suche in typischen Benutzerverzeichnissen
if [[ -z "$APP_DIR" ]]; then
  FOUND_DIR="$(find /home /opt -maxdepth 3 -name "package.json" -exec grep -l '"name": "sportboard"' {} + 2>/dev/null | head -n1 || true)"
  if [[ -n "$FOUND_DIR" ]]; then
    APP_DIR="$(dirname "$FOUND_DIR")"
  fi
fi

if [[ -z "$APP_DIR" || ! -d "$APP_DIR" ]]; then
  echo "Fehler: Projektverzeichnis konnte nicht gefunden werden." >&2
  exit 1
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
git -c safe.directory='*' fetch origin main
git -c safe.directory='*' checkout -f main
git -c safe.directory='*' reset --hard origin/main

echo ""
echo "-> 3/6: Abhängigkeiten & Dashboard bauen..."
npm install --prefer-offline --no-audit --no-fund
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
cat > /etc/sudoers.d/fitfamily << EOF
fitfamily ALL=(ALL) NOPASSWD: /bin/systemctl restart fitfamily, /usr/bin/systemctl restart fitfamily, $APP_DIR/scripts/update.sh, $APP_DIR/scripts/update.sh *, /bin/bash $APP_DIR/scripts/update.sh, /bin/bash $APP_DIR/scripts/update.sh *, /usr/bin/bash $APP_DIR/scripts/update.sh, /usr/bin/bash $APP_DIR/scripts/update.sh *, /opt/fitfamily/scripts/update.sh, /opt/fitfamily/scripts/update.sh *, /opt/fitfamily/scripts/repair.sh, /opt/fitfamily/scripts/repair.sh *
EOF
chmod 0440 /etc/sudoers.d/fitfamily

chmod +x "$APP_DIR/scripts/"*.sh || true
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
if [[ -f "$APP_DIR/.env.local" ]]; then
  if grep -q "APP_URL=http://0.0.0.0" "$APP_DIR/.env.local" 2>/dev/null; then
    REAL_LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [[ -n "$REAL_LAN_IP" && "$REAL_LAN_IP" != "0.0.0.0" ]]; then
      sed -i "s|APP_URL=http://0.0.0.0:3000|APP_URL=http://${REAL_LAN_IP}:3000|g" "$APP_DIR/.env.local"
    fi
  fi
  chmod 0600 "$APP_DIR/.env.local"
fi

# Desktop-Icon & Autostart sicherstellen
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  "$APP_DIR/scripts/create-desktop-shortcut.sh" || true
fi

echo ""
echo "-> 5/6: Firewall prüfen (Port 3000)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 3000/tcp comment 'FitFamily Dashboard' >/dev/null 2>&1 || true
fi

if [[ "$NO_RESTART" -eq 1 ]]; then
  echo ""
  echo "-> 6/6: Update erfolgreich abgeschlossen! (Neustart wird vom aufrufenden Prozess durchgeführt)"
  exit 0
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
