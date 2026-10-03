#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Vollautomatischer Kiosk- & Autostart-Einrichter
# Konfiguriert Ubuntu so, dass der PC nach dem Einschalten direkt ohne Passwort ins Dashboard im Vollbildmodus startet.

if [[ $EUID -ne 0 ]]; then
  echo "Dieses Skript benötigt Root-Rechte. Starte mit sudo neu..."
  exec sudo bash "$0" "$@"
fi

APP_DIR="/opt/fitfamily"
if [[ ! -d "$APP_DIR" && -f "$(dirname "$0")/../package.json" ]]; then
  APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
fi

# Vorab neueste Dateien aus Git laden, falls Git-Repo vorhanden
if [[ -d "$APP_DIR/.git" ]]; then
  echo "-> Aktualisiere $APP_DIR auf den neuesten Stand..."
  git config --system --add safe.directory "$APP_DIR" 2>/dev/null || true
  git -C "$APP_DIR" fetch origin main 2>/dev/null || true
  git -C "$APP_DIR" checkout main 2>/dev/null || true
  git -C "$APP_DIR" reset --hard origin/main 2>/dev/null || true
fi

echo "=========================================================="
echo " FitFamily Dashboard – Kiosk & Autostart einrichten      "
echo "=========================================================="

# 1. Desktop-Benutzer ermitteln
TARGET_USER="${SUDO_USER:-$USER}"
if [[ "$TARGET_USER" == "root" || "$TARGET_USER" == "fitfamily" ]]; then
  DETECTED_USER="$(find /home -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null | grep -v 'lost+found' | head -n 1 || true)"
  if [[ -n "$DETECTED_USER" ]]; then
    TARGET_USER="$DETECTED_USER"
  fi
fi

if [[ -z "$TARGET_USER" || "$TARGET_USER" == "root" ]]; then
  read -r -p "Bitte den Ubuntu-Benutzernamen für den automatischen Login eingeben: " TARGET_USER
fi

echo ""
echo "-> Ziel-Benutzer für Desktop & Kiosk: '$TARGET_USER'"

USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
if [[ -z "$USER_HOME" || ! -d "$USER_HOME" ]]; then
  echo "Fehler: Benutzerverzeichnis für '$TARGET_USER' nicht gefunden."
  exit 1
fi

# 2. Browser prüfen (Chromium bevorzugt für Touch-Kiosk)
echo ""
echo "-> 1/5: Browser für Kiosk-Modus prüfen..."
if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1; then
  echo "   Chromium wird für den Touch-Kiosk installiert..."
  apt-get update -qq
  apt-get install -y -qq chromium-browser || apt-get install -y -qq chromium || true
fi
echo "   Browser ist einsatzbereit."

# 3. Kiosk-Launcher & Autostart-Eintrag anlegen
echo ""
echo "-> 2/5: Kiosk-Launcher & Autostart konfigurieren..."
chmod +x "$APP_DIR/scripts/launch-kiosk.sh"
chmod +x "$APP_DIR/scripts/create-desktop-shortcut.sh"
SUDO_USER="$TARGET_USER" "$APP_DIR/scripts/create-desktop-shortcut.sh"

# 4. Automatisches Login in Ubuntu (GDM3 / LightDM) aktivieren
echo ""
echo "-> 3/5: Automatische Anmeldung (Auto-Login) bei Systemstart aktivieren..."
GDM_CUSTOM="/etc/gdm3/custom.conf"
if [[ -f "$GDM_CUSTOM" ]]; then
  # Sicherungskopie anlegen
  cp "$GDM_CUSTOM" "${GDM_CUSTOM}.bak.$(date +%Y%m%d)"
  
  # Bestehende Zeilen auskommentieren/ersetzen oder neu einfügen
  if grep -q "AutomaticLoginEnable" "$GDM_CUSTOM"; then
    sed -i "s/^#\?\s*AutomaticLoginEnable\s*=.*/AutomaticLoginEnable = true/" "$GDM_CUSTOM"
    sed -i "s/^#\?\s*AutomaticLogin\s*=.*/AutomaticLogin = $TARGET_USER/" "$GDM_CUSTOM"
  else
    if grep -q "\[daemon\]" "$GDM_CUSTOM"; then
      sed -i "/\[daemon\]/a AutomaticLoginEnable = true\nAutomaticLogin = $TARGET_USER" "$GDM_CUSTOM"
    else
      cat <<EOF >> "$GDM_CUSTOM"

[daemon]
AutomaticLoginEnable = true
AutomaticLogin = $TARGET_USER
EOF
    fi
  fi
  echo "   GDM3 Auto-Login für '$TARGET_USER' erfolgreich aktiviert."
fi

LIGHTDM_CONF="/etc/lightdm/lightdm.conf"
if [[ -f "$LIGHTDM_CONF" ]]; then
  sed -i "s/^#\?autologin-user=.*/autologin-user=$TARGET_USER/" "$LIGHTDM_CONF" 2>/dev/null || true
  sed -i "s/^#\?autologin-user-timeout=.*/autologin-user-timeout=0/" "$LIGHTDM_CONF" 2>/dev/null || true
  echo "   LightDM Auto-Login für '$TARGET_USER' aktiviert."
fi

# 5. Bildschirmschoner / Standby für Dauerbetrieb deaktivieren
echo ""
echo "-> 4/5: Bildschirmschoner & Energiesparmodus für Kiosk anpassen..."
USER_UID="$(id -u "$TARGET_USER" 2>/dev/null || echo 1000)"

# GSettings im Kontext des Benutzers anwenden
set_user_gsetting() {
  local schema="$1"
  local key="$2"
  local val="$3"
  sudo -u "$TARGET_USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$USER_UID/bus" gsettings set "$schema" "$key" "$val" 2>/dev/null || true
}

set_user_gsetting org.gnome.desktop.session idle-delay 0
set_user_gsetting org.gnome.desktop.screensaver lock-enabled false
set_user_gsetting org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
set_user_gsetting org.gnome.desktop.a11y.applications screen-keyboard-enabled true
echo "   Bildschirm-Timeout auf Dauerbetrieb gesetzt (kein automatisches Abdunkeln/Sperren)."

# 6. FitFamily Hintergrunddienst aktivieren
echo ""
echo "-> 5/5: FitFamily Systemdienst aktivieren..."
systemctl daemon-reload
systemctl enable fitfamily.service
if ! systemctl is-active --quiet fitfamily.service; then
  systemctl start fitfamily.service
fi

echo ""
echo "=========================================================="
echo " Fertig! Vollbild-Kiosk & Autostart sind aktiv."
echo ""
echo " Verhalten beim Einschalten des PCs:"
echo " 1. Ubuntu meldet Benutzer '$TARGET_USER' automatisch an."
echo " 2. FitFamily Hintergrunddienst startet automatisch."
echo " 3. Das Dashboard öffnet sich sofort im Vollbild-Kiosk."
echo ""
echo " Tastenkombinationen im Kiosk-Modus:"
echo " - Kiosk beenden / Minimieren:  Alt + F4  oder  F11"
echo " - Kiosk manuell starten:       Doppelklick auf Desktop-Icon"
echo "=========================================================="
