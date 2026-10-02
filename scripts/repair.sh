#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Reparatur- und Auto-Fix-Skript
# Bringt die Installation, Dateirechte, Firewall, Systemd-Dienst und Build automatisch in Ordnung.

if [[ $EUID -ne 0 ]]; then
  echo "Dieses Skript benötigt Root-Rechte. Starte mit sudo neu..."
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

if [[ -z "$APP_DIR" ]]; then
  APP_DIR="/opt/fitfamily"
fi

APP_USER="fitfamily"

echo "-> 1/7: Git-Konfiguration & neueste Version laden..."
git config --system --add safe.directory "$APP_DIR" 2>/dev/null || true

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone https://github.com/Schello805/FitFamily-Dashboard.git "$APP_DIR"
else
  git fetch origin main
  git checkout -f main
  git reset --hard origin/main
fi

# 2. Systembenutzer anlegen falls fehlend
echo "-> 2/7: Systembenutzer '$APP_USER' prüfen..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" || true
  echo "   Systembenutzer '$APP_USER' angelegt."
fi

# 3. Konfiguration .env.local sicherstellen
echo "-> 3/7: Konfiguration (.env.local) prüfen..."
if [[ ! -f "$APP_DIR/.env.local" ]]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -z "$LAN_IP" ]] && LAN_IP="127.0.0.1"
  SECRET="$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | awk '{print $1}')"
  cat > "$APP_DIR/.env.local" << EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
APP_URL=http://${LAN_IP}:3000
ADMIN_PIN=1234
SESSION_SECRET=${SECRET}
EOF
  echo "   Neue .env.local mit Standard-PIN 1234 angelegt."
fi

if grep -q "APP_URL=http://0.0.0.0" "$APP_DIR/.env.local" 2>/dev/null; then
  REAL_LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$REAL_LAN_IP" && "$REAL_LAN_IP" != "0.0.0.0" ]]; then
    sed -i "s|APP_URL=http://0.0.0.0:3000|APP_URL=http://${REAL_LAN_IP}:3000|g" "$APP_DIR/.env.local"
  fi
fi

# 4. Abhängigkeiten & Build
echo "-> 4/7: Abhängigkeiten installieren & Dashboard bauen..."
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
rm -rf "$APP_DIR/.next"

if id -u "$APP_USER" >/dev/null 2>&1; then
  sudo -u "$APP_USER" npm ci --prefer-offline --no-audit --no-fund
  sudo -u "$APP_USER" npm run build
else
  npm ci --prefer-offline --no-audit --no-fund
  npm run build
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# 5. Systemd Service & Sudoers einrichten
echo "-> 5/7: Hintergrunddienst & Berechtigungen einrichten..."
cp "$APP_DIR/deploy/systemd/fitfamily.service" /etc/systemd/system/fitfamily.service

SUDOERS_TMP="/etc/sudoers.d/fitfamily.tmp.$$"
cat > "$SUDOERS_TMP" <<EOF
fitfamily ALL=(ALL) NOPASSWD: /bin/systemctl, /usr/bin/systemctl, /bin/chown, /usr/bin/chown, /bin/rm, /usr/bin/rm, /bin/mv, /usr/bin/mv, /bin/mount, /usr/bin/mount, /bin/umount, /usr/bin/umount, /bin/mkdir, /usr/bin/mkdir, $APP_DIR/scripts/update.sh, $APP_DIR/scripts/repair.sh, $APP_DIR/scripts/backup.sh
EOF
chmod 0440 "$SUDOERS_TMP"
visudo -cf "$SUDOERS_TMP"
mv "$SUDOERS_TMP" /etc/sudoers.d/fitfamily

# Dateirechte setzen
chmod +x "$APP_DIR/scripts/"*.sh || true
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 0600 "$APP_DIR/.env.local"

# Desktop-Icon & Autostart sicherstellen
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
  "$APP_DIR/scripts/create-desktop-shortcut.sh" || true
fi

# 6. Firewall für Heimnetz freigeben
echo "-> 6/7: Firewall prüfen (Port 3000)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 3000/tcp comment 'FitFamily Dashboard' >/dev/null 2>&1 || true
  echo "   Port 3000 in UFW-Firewall freigegeben."
fi

# 7. Dienst aktivieren und starten
echo "-> 7/7: Dienst starten & Status prüfen..."
systemctl daemon-reload
systemctl enable --now fitfamily.service
systemctl restart fitfamily.service
sleep 2

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -z "$LAN_IP" ]] && LAN_IP="localhost"

echo ""
if systemctl is-active --quiet fitfamily.service; then
  echo "=========================================================="
  echo " ERFOLGREICH REPARIERT! FitFamily läuft!"
  echo ""
  echo " - Am Monitor:          http://localhost:3000"
  echo " - Im Heimnetz (Handy): http://${LAN_IP}:3000"
  echo "=========================================================="
else
  echo "=========================================================="
  echo " ACHTUNG: Dienst konnte nicht sauber gestartet werden."
  echo " Letzte Logs:"
  echo "=========================================================="
  journalctl -u fitfamily -n 25 --no-pager
fi
