#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Desktop-Icon & Autostart im Kiosk-Modus einrichten
TARGET_USER="${SUDO_USER:-$USER}"
USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
APP_DIR="/opt/fitfamily"
DESKTOP_DIR="$USER_HOME/Desktop"
APPS_DIR="$USER_HOME/.local/share/applications"
AUTOSTART_DIR="$USER_HOME/.config/autostart"

# Standardverzeichnis für Desktop-Icons prüfen (falls XDG anders konfiguriert)
if command -v xdg-user-dir >/dev/null 2>&1; then
  CUSTOM_DESKTOP="$(sudo -u "$TARGET_USER" xdg-user-dir DESKTOP 2>/dev/null || true)"
  if [[ -n "$CUSTOM_DESKTOP" && -d "$CUSTOM_DESKTOP" ]]; then
    DESKTOP_DIR="$CUSTOM_DESKTOP"
  fi
fi

mkdir -p "$DESKTOP_DIR" "$APPS_DIR" "$AUTOSTART_DIR"

SHORTCUT_FILE="$DESKTOP_DIR/fitfamily.desktop"
MENU_FILE="$APPS_DIR/fitfamily.desktop"
AUTOSTART_FILE="$AUTOSTART_DIR/fitfamily.desktop"

# Desktop-Datei kopieren
install -m 0755 "$APP_DIR/deploy/desktop/fitfamily.desktop" "$SHORTCUT_FILE"
install -m 0644 "$APP_DIR/deploy/desktop/fitfamily.desktop" "$MENU_FILE"
install -m 0644 "$APP_DIR/deploy/desktop/fitfamily.desktop" "$AUTOSTART_FILE"

chown "$TARGET_USER:$TARGET_USER" "$SHORTCUT_FILE" "$MENU_FILE" "$AUTOSTART_FILE"

# Unter GNOME das Desktop-Icon als vertrauenswürdig markieren
if command -v gio >/dev/null 2>&1; then
  sudo -u "$TARGET_USER" gio set "$SHORTCUT_FILE" metadata::trusted true 2>/dev/null || true
  sudo -u "$TARGET_USER" gio set "$AUTOSTART_FILE" metadata::trusted true 2>/dev/null || true
fi

echo "FitFamily Desktop-Icon & Autostart erfolgreich eingerichtet:"
echo " - Desktop-Icon:    $SHORTCUT_FILE"
echo " - Anwendungsmenü:  $MENU_FILE"
echo " - Kiosk-Autostart: $AUTOSTART_FILE"
