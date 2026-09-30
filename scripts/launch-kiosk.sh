#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Kiosk-Launcher für Touchscreen / Desktop
URL="http://localhost:3000"

# Bis zu 30 Sekunden warten, bis der lokale Dienst bereit ist
for _ in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null | grep -qE "^(200|307|308)$"; then
    break
  fi
  sleep 1
done

# Bildschirmschoner / Standby in X11 unterdrücken (falls X-Server aktiv)
if command -v xset >/dev/null 2>&1; then
  xset s off -dpms 2>/dev/null || true
fi

# Absturz-Wiederherstellungsabfrage ("Chromium wurde nicht ordnungsgemäß beendet") nach hartem Ausschalten bereinigen
for prefs_file in "$HOME/.config/chromium/Default/Preferences" "$HOME/.config/google-chrome/Default/Preferences" "$HOME/snap/chromium/current/.config/chromium/Default/Preferences"; do
  if [[ -f "$prefs_file" ]]; then
    sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$prefs_file" 2>/dev/null || true
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "$prefs_file" 2>/dev/null || true
  fi
done

# Kiosk-Flags für Touchscreens: Vollbild, keine Adressleiste, keine Wiederherstellungs-Popups, kein Zoom durch versehentliches Pinchen
KIOSK_FLAGS="--kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --hide-crash-restore-bubble --check-for-update-interval=31536000 --overscroll-history-navigation=0 --enable-virtual-keyboard --touch-events=enabled --disable-pinch --disable-features=Translate"

if command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser $KIOSK_FLAGS "$URL"
elif command -v chromium >/dev/null 2>&1; then
  exec chromium $KIOSK_FLAGS "$URL"
elif command -v google-chrome >/dev/null 2>&1; then
  exec google-chrome $KIOSK_FLAGS "$URL"
elif command -v firefox >/dev/null 2>&1; then
  exec firefox --kiosk "$URL"
else
  exec xdg-open "$URL"
fi
