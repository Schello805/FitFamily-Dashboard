#!/usr/bin/env bash
set -euo pipefail

# Runs as the logged-in desktop user. Keep a dedicated browser profile so that
# the Gymondo login remains independent of the fullscreen FitFamily kiosk.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
GYMONDO_URL="https://www.gymondo.com/"
PROFILE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/fitfamily-gymondo"
mkdir -p "$PROFILE_DIR"

if command -v chromium-browser >/dev/null 2>&1; then
  browser="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  browser="chromium"
elif command -v google-chrome >/dev/null 2>&1; then
  browser="google-chrome"
elif command -v firefox >/dev/null 2>&1; then
  # Firefox uses the named profile; this is the closest equivalent to Chromium.
  exec firefox --new-window "$GYMONDO_URL"
else
  exit 1
fi

# Deliberately no --kiosk: the normal window controls make returning to the
# dashboard as easy as closing this window after the workout.
nohup "$browser" \
  --user-data-dir="$PROFILE_DIR" \
  --new-window \
  --start-maximized \
  --no-first-run \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  "$GYMONDO_URL" >/dev/null 2>&1 &
