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
  if sudo -n true 2>/dev/null; then
    exec sudo -n /bin/bash "$0" "$@"
  else
    exec sudo /bin/bash "$0" "$@"
  fi
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
echo "-> 3/6: Konfiguration, Berechtigungen & Dashboard bauen..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" || true
fi

# Dateirechte vor dem Build korrigieren, damit Next.js nicht an Root-Artefakten scheitert
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
# Nur den Build-Cache löschen, aber .next/static erhalten, damit der laufende Dienst während des Builds keine 404-Fehler wirft
rm -rf "$APP_DIR/.next/cache" 2>/dev/null || true

if id -u "$APP_USER" >/dev/null 2>&1; then
  sudo -u "$APP_USER" npm install --prefer-offline --no-audit --no-fund
  sudo -u "$APP_USER" npm run build
else
  npm install --prefer-offline --no-audit --no-fund
  npm run build
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo ""
echo "-> 4/6: Hintergrunddienst & Sudoers prüfen..."
# Systemd Service-Definition aktualisieren
if [[ -f "$APP_DIR/deploy/systemd/fitfamily.service" ]]; then
  cp "$APP_DIR/deploy/systemd/fitfamily.service" /etc/systemd/system/fitfamily.service
  systemctl daemon-reload
fi

# Sudoers für 1-Click Update, Rechte-Self-Healing & NAS Mount
cat > /etc/sudoers.d/fitfamily << EOF
fitfamily ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/systemctl, /bin/chown, /usr/bin/chown, /bin/rm, /usr/bin/rm, /bin/mv, /usr/bin/mv, /bin/mount, /usr/bin/mount, /bin/umount, /usr/bin/umount, /bin/mkdir, /usr/bin/mkdir, $APP_DIR/scripts/*, /bin/bash $APP_DIR/scripts/*, /usr/bin/bash $APP_DIR/scripts/*, /opt/fitfamily/scripts/*, /bin/bash /opt/fitfamily/scripts/*, /usr/bin/bash /opt/fitfamily/scripts/*
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
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env.local" || true
  chmod 0640 "$APP_DIR/.env.local" || true
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
