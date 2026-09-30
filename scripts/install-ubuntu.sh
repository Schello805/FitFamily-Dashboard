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

# Terminal-Eingabe sicherstellen (auch bei curl | bash)
if [[ ! -t 0 && -e /dev/tty ]]; then
  exec < /dev/tty
fi

mkdir -p "$APP_DIR/data" "$APP_DIR/backups"

echo ""
echo "=== FitFamily Konfiguration (.env.local) ==="
reconfigure=true
if [[ -f "$APP_DIR/.env.local" ]]; then
  existing_url="$(grep -E '^APP_URL=' "$APP_DIR/.env.local" | cut -d= -f2- || true)"
  echo "Bestehende Konfiguration (.env.local) gefunden (APP_URL: ${existing_url:-nicht gesetzt})."
  read -r -p "Möchtest du diese Einstellungen beibehalten? [J/n]: " keep_existing
  if [[ ! "$keep_existing" =~ ^[nN] ]]; then
    reconfigure=false
    echo "-> Bestehende Konfiguration bleibt unverändert."
  fi
fi

if [[ "$reconfigure" == true ]]; then
  detected_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$detected_ip" ]]; then
    default_url="http://$detected_ip:3000"
  else
    default_url="http://localhost:3000"
  fi

  echo ""
  echo "1. Heimnetz-Adresse (APP_URL) für Handys & QR-Code:"
  read -r -p "   Adresse [$default_url]: " input_url
  app_url="${input_url:-$default_url}"

  echo ""
  echo "2. KI-Integrationen (optional, Enter zum Überspringen):"
  read -r -p "   OpenAI API-Key (optional): " input_openai
  read -r -p "   Google Gemini API-Key (optional): " input_gemini

  echo ""
  echo "3. Datensicherung (optional, Enter zum Überspringen):"
  read -r -p "   NAS-Backuppfad (z. B. /mnt/nas/fitfamily): " input_nas

  existing_secret="$(grep -E '^SESSION_SECRET=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
  if [[ -n "$existing_secret" && "$existing_secret" != "change-me-with-at-least-32-random-characters" ]]; then
    session_secret="$existing_secret"
  else
    session_secret="$(openssl rand -hex 32)"
  fi

  cat <<EOF > "$APP_DIR/.env.local"
# FitFamily Konfiguration – Lokale Umgebungsvariablen
DATABASE_URL=file:./data/fitfamily.db
APP_URL=$app_url
SESSION_SECRET=$session_secret
OPENAI_API_KEY=$input_openai
GEMINI_API_KEY=$input_gemini
NAS_BACKUP_PATH=$input_nas
EOF
  echo "-> .env.local wurde erfolgreich eingerichtet."
fi

chmod +x "$APP_DIR/scripts/"*.sh || true
git config --system --add safe.directory "$APP_DIR" 2>/dev/null || true
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 0600 "$APP_DIR/.env.local"

# Sudoers-Berechtigung einrichten (erlaubt 1-Click-Web-Update und automatisches Service-Restart)
cat > /etc/sudoers.d/fitfamily << 'EOF'
fitfamily ALL=(ALL) NOPASSWD: /bin/systemctl restart fitfamily, /usr/bin/systemctl restart fitfamily, /opt/fitfamily/scripts/update.sh
EOF
chmod 0440 /etc/sudoers.d/fitfamily

cd "$APP_DIR"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

install -m 0644 "$APP_DIR/deploy/systemd/fitfamily.service" /etc/systemd/system/fitfamily.service
systemctl daemon-reload
systemctl enable --now fitfamily.service

effective_url="$(grep -E '^APP_URL=' "$APP_DIR/.env.local" | cut -d= -f2- || true)"
echo ""
echo "=========================================================="
echo " FitFamily läuft jetzt als lokaler Dienst im Hintergrund!"
echo " Monitor (lokal):  http://localhost:3000"
if [[ -n "$effective_url" ]]; then
  echo " Mobil (Heimnetz): $effective_url"
fi
echo ""
echo " Updates:"
echo " - Im Browser: /verwaltung (1-Click Update)"
echo " - Im Terminal: sudo /opt/fitfamily/scripts/update.sh"
echo "=========================================================="
