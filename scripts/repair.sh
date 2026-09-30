#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Reparatur- und Auto-Fix-Skript
# Bringt die Installation, Dateirechte, Firewall, Systemd-Dienst und Build automatisch in Ordnung.

if [[ $EUID -ne 0 ]]; then
  echo "Dieses Skript benötigt Root-Rechte. Starte mit sudo neu..."
  exec sudo bash "$0" "$@"
fi

APP_DIR="/opt/fitfamily"
APP_USER="fitfamily"

echo "=========================================================="
echo " FitFamily Dashboard – Automatische Reparatur             "
echo "=========================================================="

# 1. Verzeichnis & Git initialisieren
mkdir -p "$APP_DIR"
cd "$APP_DIR"

echo "-> 1/7: Git-Konfiguration & neueste Version laden..."
git config --system --add safe.directory "$APP_DIR" 2>/dev/null || true

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone https://github.com/Schello805/FitFamily-Dashboard.git "$APP_DIR"
else
  git fetch origin main
  git checkout main
  git pull --ff-only origin main
fi

# 2. Systembenutzer anlegen falls fehlend
echo "-> 2/7: Systembenutzer '$APP_USER' prüfen..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
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

# 4. Abhängigkeiten & Build
echo "-> 4/7: Abhängigkeiten installieren & Dashboard bauen..."
npm ci
npm run build

# 5. Systemd Service & Sudoers einrichten
echo "-> 5/7: Hintergrunddienst & Berechtigungen einrichten..."
cp "$APP_DIR/deploy/systemd/fitfamily.service" /etc/systemd/system/fitfamily.service

cat > /etc/sudoers.d/fitfamily << 'EOF'
fitfamily ALL=(ALL) NOPASSWD: /bin/systemctl restart fitfamily, /usr/bin/systemctl restart fitfamily, /opt/fitfamily/scripts/update.sh, /opt/fitfamily/scripts/repair.sh
EOF
chmod 0440 /etc/sudoers.d/fitfamily

# Dateirechte setzen
chmod +x "$APP_DIR/scripts/"*.sh || true
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 0600 "$APP_DIR/.env.local"

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
