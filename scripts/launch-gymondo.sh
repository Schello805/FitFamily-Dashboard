#!/usr/bin/env bash
set -euo pipefail

# Runs as the logged-in desktop user. Keep a dedicated browser profile so that
# the Gymondo login remains independent of the fullscreen FitFamily kiosk.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
GYMONDO_URL="https://www.gymondo.com/"
PROFILE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/fitfamily-gymondo"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/fitfamily"
LOG_FILE="$LOG_DIR/gymondo-launch.log"

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

# Ubuntu's Chromium package is commonly a Snap. A Snap may not access an
# arbitrary hidden directory in $HOME, so keep its separate login profile in
# Chromium's permitted persistent Snap data directory.
if [[ -x /snap/bin/chromium ]] && { [[ "$browser" == "chromium-browser" ]] || [[ "$(command -v "$browser")" == "/snap/bin/chromium" ]]; }; then
  browser="/snap/bin/chromium"
  PROFILE_DIR="$HOME/snap/chromium/common/fitfamily-gymondo"
fi
mkdir -p "$PROFILE_DIR" "$LOG_DIR"

# Deliberately no --kiosk: the normal window controls make returning to the
# dashboard as easy as closing this window after the workout. The Lenovo uses
# Wayland; Chromium otherwise often defaults to a missing X11 DISPLAY when it
# is launched by a system helper.
browser_flags=(
  "--user-data-dir=$PROFILE_DIR"
  --new-window
  --start-maximized
  --no-first-run
  --disable-session-crashed-bubble
  --hide-crash-restore-bubble
)
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  browser_flags+=(--ozone-platform=wayland)
fi

nohup "$browser" \
  "${browser_flags[@]}" \
  "$GYMONDO_URL" >> "$LOG_FILE" 2>&1 &
