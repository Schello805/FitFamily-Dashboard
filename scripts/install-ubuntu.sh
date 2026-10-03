#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Interaktives Installations- & Konfigurations-Skript
# Fragt alle relevanten Betriebsparameter ab (Kiosk-Modus, Auto-Login, Netzwerk, PIN, etc.)

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Fehler: Bitte mit sudo ausführen: sudo ./scripts/install-ubuntu.sh"
  exit 1
fi

# Terminal-Eingabe für interaktive Prompts sicherstellen (auch bei curl | sudo bash)
if [[ ! -t 0 && -e /dev/tty ]]; then
  exec < /dev/tty
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_DIR="/opt/fitfamily"
APP_USER="fitfamily"

if [[ "$APP_DIR" != "$EXPECTED_DIR" ]]; then
  echo "Fehler: Die Systeminstallation benötigt einen Checkout unter $EXPECTED_DIR."
  exit 1
fi

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Fehler: package.json fehlt in $APP_DIR."
  exit 1
fi

echo "=========================================================="
echo " FitFamily Dashboard – Geführte System-Installation      "
echo "=========================================================="

# 1. Systemvoraussetzungen prüfen
echo ""
echo "-> 1/6: Systemumgebung prüfen..."
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 22 ]]; then
  echo "Fehler: Node.js 22 oder neuer wird benötigt. Bitte zuerst installieren."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1 || ! command -v openssl >/dev/null 2>&1; then
  echo "Fehler: npm und openssl werden benötigt. Bitte zuerst installieren."
  exit 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
  echo "   Systembenutzer '$APP_USER' wurde angelegt."
fi

mkdir -p "$APP_DIR/data" "$APP_DIR/backups"
chmod +x "$APP_DIR/scripts/"*.sh || true
git config --system --add safe.directory "$APP_DIR" 2>/dev/null || true

# 2. Desktop-Benutzer ermitteln
DESKTOP_USER="${SUDO_USER:-$USER}"
if [[ "$DESKTOP_USER" == "root" || "$DESKTOP_USER" == "fitfamily" ]]; then
  DETECTED_USER="$(find /home -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null | grep -v 'lost+found' | head -n 1 || true)"
  DESKTOP_USER="${DETECTED_USER:-$DESKTOP_USER}"
fi

# 3. Interaktive Konfigurations-Abfrage
echo ""
echo "=========================================================="
echo " Schritt 1: Betriebsmodus des Dashboards auswählen"
echo "=========================================================="
echo " Wie soll FitFamily auf diesem PC betrieben werden?"
echo ""
echo "  [1] Touchscreen-Terminal / Kiosk-Modus (EMPFOHLEN für Touch-PC / Wandmonitor)"
echo "      -> Automatischer PC-Start direkt ins Dashboard (ohne Passwortabfrage)"
echo "      -> Vollbild-Kiosk (Chromium ohne Adressleiste, Tabs oder Popups)"
echo "      -> Bildschirm schaltet nicht ab (Dauerbetrieb ohne Standby)"
echo "      -> Touch-Tastatur & PIN-Zahlenfeld für Bildschirmeingaben aktiv"
echo ""
echo "  [2] Normaler Desktop-PC (Fenster-Modus / flexibel)"
echo "      -> FitFamily läuft als Hintergrunddienst"
echo "      -> Desktop-Icon auf dem Schreibtisch zum manuellen Starten per Klick"
echo "      -> Normale Ubuntu-Passwortabfrage beim Starten bleibt erhalten"
echo ""
echo "  [3] Reiner Server / Headless (ohne Monitor)"
echo "      -> Läuft nur als Hintergrunddienst für Smartphones/Tablets im WLAN"
echo "      -> Kein automatischer Browserstart auf diesem Computer"
echo ""
read -r -p "Auswahl [1-3, Standard: 1]: " input_mode
OPERATION_MODE="${input_mode:-1}"

# Benutzer bestätigen für Modus 1 und 2
if [[ "$OPERATION_MODE" =~ ^[12]$ ]]; then
  echo ""
  echo "-> Ubuntu-Benutzerkonto für Schreibtisch & Autostart:"
  read -r -p "   Benutzername [$DESKTOP_USER]: " input_user
  DESKTOP_USER="${input_user:-$DESKTOP_USER}"
fi

echo ""
echo "=========================================================="
echo " Schritt 2: Heimnetzwerk & Handy-Verbindung (QR-Code)"
echo "=========================================================="
# Echte LAN-IP ermitteln
detected_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -z "$detected_ip" || "$detected_ip" == "0.0.0.0" ]] && detected_ip="localhost"
default_url="http://${detected_ip}:3000"

# Vorhandene APP_URL aus bestehender .env.local auslesen falls vorhanden
if [[ -f "$APP_DIR/.env.local" ]]; then
  existing_url="$(grep -E '^APP_URL=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
  if [[ -n "$existing_url" && ! "$existing_url" =~ (0\.0\.0\.0|localhost) ]]; then
    default_url="$existing_url"
  fi
fi

echo " Unter welcher Adresse erreichen Smartphones im WLAN dieses Dashboard?"
echo " (Diese Adresse wird im QR-Code auf dem Bildschirm codiert)"
echo ""
read -r -p " Erreichbare Heimnetz-Adresse [$default_url]: " input_url
APP_URL="${input_url:-$default_url}"

echo ""
echo "=========================================================="
echo " Schritt 3: Ersteinrichtung"
echo "=========================================================="
echo " Der Eltern-PIN wird bei der Ersteinrichtung im Browser festgelegt."

echo ""
echo "=========================================================="
echo " Schritt 4: Optionale Erweiterungen (Enter zum Überspringen)"
echo "=========================================================="
existing_openai="$(grep -E '^OPENAI_API_KEY=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
existing_gemini="$(grep -E '^GEMINI_API_KEY=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
existing_nas="$(grep -E '^NAS_BACKUP_PATH=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
NAS_BACKUP_PATH="$existing_nas"
BACKUP_ENCRYPTION_KEY="$(grep -E '^BACKUP_ENCRYPTION_KEY=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
TRUST_PROXY="$(grep -E '^TRUST_PROXY=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
APP_HOST=0.0.0.0
[[ "$TRUST_PROXY" == true ]] && APP_HOST=127.0.0.1

echo " (Hinweis: NAS-Backups & KI-Schlüssel können jederzeit bequem"
echo "  in der Web-Verwaltung unter '/verwaltung' eingerichtet werden.)"
echo ""
read -r -p " 1. OpenAI API-Key für KI-Trainingspläne [${existing_openai:+(bereits gesetzt)}]: " input_openai
OPENAI_API_KEY="${input_openai:-$existing_openai}"

read -r -p " 2. Google Gemini API-Key (Alternative zu OpenAI) [${existing_gemini:+(bereits gesetzt)}]: " input_gemini
GEMINI_API_KEY="${input_gemini:-$existing_gemini}"

# Geheimes Session-Token beibehalten oder neu generieren
existing_secret="$(grep -E '^SESSION_SECRET=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2- || true)"
if [[ -n "$existing_secret" && "$existing_secret" != "change-me-with-at-least-32-random-characters" ]]; then
  SESSION_SECRET="$existing_secret"
else
  SESSION_SECRET="$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | awk '{print $1}')"
fi

# 4. Konfiguration (.env.local) schreiben
cat <<EOF > "$APP_DIR/.env.local"
# FitFamily Konfiguration – Automatisch generiert
NODE_ENV=production
PORT=3000
HOST=$APP_HOST
DATABASE_URL=file:/opt/fitfamily/data/fitfamily.db
APP_URL=$APP_URL
SESSION_SECRET=$SESSION_SECRET
OPENAI_API_KEY=$OPENAI_API_KEY
GEMINI_API_KEY=$GEMINI_API_KEY
NAS_BACKUP_PATH=$NAS_BACKUP_PATH
BACKUP_ENCRYPTION_KEY=$BACKUP_ENCRYPTION_KEY
TRUST_PROXY=${TRUST_PROXY:-false}
EOF
chown root:fitfamily "$APP_DIR/.env.local"
chmod 0640 "$APP_DIR/.env.local"
echo ""
echo "-> Konfiguration (.env.local) erfolgreich gespeichert."

# 5. Privileged helpers are root-owned and accept only fixed operations.
"$APP_DIR/scripts/install-privileged-helpers.sh"

# 6. Abhängigkeiten installieren & App bauen
echo ""
echo "-> 2/6: Abhängigkeiten installieren & Dashboard bauen..."
chown -hR root:fitfamily "$APP_DIR"
chmod -R go-w "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data" "$APP_DIR/backups"
cd "$APP_DIR"
# Preserve the legacy build as a rollback target during migration.
if [[ ! -e "$APP_DIR/current" && -f "$APP_DIR/.next/BUILD_ID" ]]; then
  ln -s "$APP_DIR" "$APP_DIR/current"
fi

# 7. Systemd Service einrichten & aktivieren
echo ""
echo "-> 3/6: Hintergrunddienst einrichten..."
install -m 0644 "$APP_DIR/deploy/systemd/fitfamily.service" /etc/systemd/system/fitfamily.service
install -m 0644 "$APP_DIR/deploy/systemd/fitfamily-backup.service" /etc/systemd/system/fitfamily-backup.service
install -m 0644 "$APP_DIR/deploy/systemd/fitfamily-backup.timer" /etc/systemd/system/fitfamily-backup.timer
systemctl daemon-reload
systemctl enable fitfamily.service
/usr/local/libexec/fitfamily-update --install-local
systemctl enable --now fitfamily-backup.timer

# 8. Firewall prüfen
echo ""
echo "-> 4/6: Lokale Firewall prüfen (Port 3000)..."
echo "   Firewall unverändert. Zugriff nur für das eigene Heimnetz erlauben (siehe Anleitung)."

# 9. Betriebsmodus-spezifische Einrichtung
echo ""
echo "-> 5/6: Betriebsmodus einrichten..."

if [[ "$OPERATION_MODE" == "1" ]]; then
  echo "   Konfiguriere Touchscreen-Terminal & Kiosk-Autostart für '$DESKTOP_USER'..."
  
  # Chromium prüfen/installieren
  if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1; then
    echo "   Chromium wird für den Touch-Kiosk installiert..."
    apt-get update -qq && apt-get install -y -qq chromium-browser || apt-get install -y -qq chromium || true
  fi

  # Kiosk-Autostart und Desktop-Shortcut anlegen
  SUDO_USER="$DESKTOP_USER" "$APP_DIR/scripts/create-desktop-shortcut.sh" || true

  # GDM3 Auto-Login aktivieren
  GDM_CUSTOM="/etc/gdm3/custom.conf"
  if [[ -f "$GDM_CUSTOM" ]]; then
    cp "$GDM_CUSTOM" "${GDM_CUSTOM}.bak.$(date +%Y%m%d)" 2>/dev/null || true
    if grep -q "AutomaticLoginEnable" "$GDM_CUSTOM"; then
      sed -i "s/^#\?\s*AutomaticLoginEnable\s*=.*/AutomaticLoginEnable = true/" "$GDM_CUSTOM"
      sed -i "s/^#\?\s*AutomaticLogin\s*=.*/AutomaticLogin = $DESKTOP_USER/" "$GDM_CUSTOM"
    else
      if grep -q "\[daemon\]" "$GDM_CUSTOM"; then
        sed -i "/\[daemon\]/a AutomaticLoginEnable = true\nAutomaticLogin = $DESKTOP_USER" "$GDM_CUSTOM"
      else
        cat <<EOF >> "$GDM_CUSTOM"

[daemon]
AutomaticLoginEnable = true
AutomaticLogin = $DESKTOP_USER
EOF
      fi
    fi
    echo "   Ubuntu Auto-Login für '$DESKTOP_USER' aktiviert."
  fi

  # LightDM Auto-Login (falls vorhanden)
  LIGHTDM_CONF="/etc/lightdm/lightdm.conf"
  if [[ -f "$LIGHTDM_CONF" ]]; then
    sed -i "s/^#\?autologin-user=.*/autologin-user=$DESKTOP_USER/" "$LIGHTDM_CONF" 2>/dev/null || true
    sed -i "s/^#\?autologin-user-timeout=.*/autologin-user-timeout=0/" "$LIGHTDM_CONF" 2>/dev/null || true
    echo "   LightDM Auto-Login für '$DESKTOP_USER' aktiviert."
  fi

  # Bildschirm-Timeout & Standby für Dauerbetrieb deaktivieren
  USER_UID="$(id -u "$DESKTOP_USER" 2>/dev/null || echo 1000)"
  sudo -u "$DESKTOP_USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_UID/bus" gsettings set org.gnome.desktop.session idle-delay 0 2>/dev/null || true
  sudo -u "$DESKTOP_USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_UID/bus" gsettings set org.gnome.desktop.a11y.applications screen-keyboard-enabled true 2>/dev/null || true
  sudo -u "$DESKTOP_USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_UID/bus" gsettings set org.gnome.desktop.screensaver lock-enabled false 2>/dev/null || true
  sudo -u "$DESKTOP_USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_UID/bus" gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null || true
  echo "   Bildschirm-Timeout auf Dauerbetrieb gesetzt (kein automatisches Schwarzbild)."

elif [[ "$OPERATION_MODE" == "2" ]]; then
  echo "   Konfiguriere normalen Desktop-Modus für '$DESKTOP_USER'..."
  # Nur Desktop-Shortcut anlegen, kein Autostart
  USER_HOME="$(getent passwd "$DESKTOP_USER" | cut -d: -f6)"
  if [[ -d "$USER_HOME/Desktop" ]]; then
    install -m 0755 "$APP_DIR/deploy/desktop/fitfamily.desktop" "$USER_HOME/Desktop/fitfamily.desktop"
    chown "$DESKTOP_USER:$DESKTOP_USER" "$USER_HOME/Desktop/fitfamily.desktop"
    sudo -u "$DESKTOP_USER" gio set "$USER_HOME/Desktop/fitfamily.desktop" metadata::trusted true 2>/dev/null || true
  fi
  # Autostart entfernen falls vorher vorhanden
  rm -f "$USER_HOME/.config/autostart/fitfamily.desktop" 2>/dev/null || true
  echo "   Desktop-Icon angelegt. Start erfolgt bei Bedarf per Klick."

else
  echo "   Reiner Server-Modus: Kein grafischer Kiosk eingerichtet."
fi

# 10. Status prüfen
echo ""
echo "-> 6/6: Erreichbarkeit prüfen..."
sleep 2

echo ""
echo "=========================================================="
if systemctl is-active --quiet fitfamily.service; then
  echo " ERFOLGREICH EINGERICHTET! FitFamily ist aktiv."
else
  echo " HINWEIS: Dienststatus wird geprüft..."
fi
echo "=========================================================="
echo ""
echo " Zugriffsadressen:"
echo " - Direkt an diesem PC:  http://localhost:3000"
echo " - Im Heimnetz (Handy):  $APP_URL"
echo ""
echo " Einstellungen:"
echo " - Eltern-PIN:           im Browser einrichten"
echo " - Verwaltung:           http://localhost:3000/verwaltung"
echo ""
if [[ "$OPERATION_MODE" == "1" ]]; then
  echo " Touchscreen-Kiosk Modus:"
  echo " - Beim Neustart: Startet vollautomatisch ins Dashboard"
  echo " - Kiosk beenden: Alt + F4 oder F11 auf der Tastatur"
  echo " - Kiosk starten: Doppelklick auf das FitFamily-Icon auf dem Desktop"
fi
echo ""
echo " Updates:"
echo " - Im Browser: /verwaltung (1-Click Update)"
echo " - Im Terminal: sudo /opt/fitfamily/scripts/update.sh"
echo "=========================================================="
