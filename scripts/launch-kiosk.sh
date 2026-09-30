#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Kiosk-Launcher für Touchscreen / Desktop
URL="http://localhost:3000"

# Bis zu 10 Sekunden warten, falls der lokale Dienst gerade erst startet
for _ in {1..10}; do
  if curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null | grep -qE "^(200|307|308)$"; then
    break
  fi
  sleep 1
done

# Browser im Kiosk-Modus starten (bevorzugt Chromium/Chrome mit optimierten Touch- und Tastatur-Flags)
KIOSK_FLAGS="--kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 --overscroll-history-navigation=0 --enable-virtual-keyboard --touch-events=enabled"

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
