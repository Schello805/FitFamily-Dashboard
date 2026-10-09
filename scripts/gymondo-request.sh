#!/usr/bin/env bash
set -euo pipefail

# Root-owned fixed helper. It accepts no arguments and only starts the reviewed
# Gymondo launcher for the current local desktop session.
[[ $EUID -eq 0 && $# -eq 0 ]] || exit 1
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP_DIR=/opt/fitfamily/current
fail() { echo "$1" >&2; exit 1; }
[[ -f "$APP_DIR/scripts/launch-gymondo.sh" ]] || fail "FitFamily-Version enthält keinen Gymondo-Starter."

target_user=""
if [[ -r /etc/fitfamily-kiosk-user ]]; then
  candidate="$(head -n 1 /etc/fitfamily-kiosk-user | tr -d '[:space:]')"
  if [[ "$candidate" =~ ^[a-z_][a-z0-9_-]*$ ]] && id "$candidate" >/dev/null 2>&1; then
    target_user="$candidate"
  fi
fi

session_id=""
while read -r candidate_session _ candidate_user _; do
  [[ -n "$candidate_session" && "$candidate_user" != "root" && "$candidate_user" != "fitfamily" ]] || continue
  [[ "$(loginctl show-session "$candidate_session" -p Active --value 2>/dev/null || true)" == "yes" ]] || continue
  [[ "$(loginctl show-session "$candidate_session" -p Remote --value 2>/dev/null || true)" == "no" ]] || continue
  target_user="$candidate_user"
  session_id="$candidate_session"
  break
done < <(loginctl list-sessions --no-legend 2>/dev/null || true)

[[ -n "$target_user" ]] || fail "Keine aktive lokale Desktop-Anmeldung gefunden."
user_home="$(getent passwd "$target_user" | cut -d: -f6)"
user_uid="$(id -u "$target_user")"
runtime_dir="/run/user/$user_uid"
[[ -d "$user_home" ]] || fail "Das Home-Verzeichnis der Desktop-Anmeldung fehlt."
[[ -d "$runtime_dir" ]] || fail "Die grafische Desktop-Sitzung ist noch nicht bereit."

wayland_display="$(find "$runtime_dir" -maxdepth 1 -type s -name 'wayland-*' -printf '%f\n' 2>/dev/null | head -n 1 || true)"
display=""
if [[ -n "$session_id" ]]; then
  display="$(loginctl show-session "$session_id" -p Display --value 2>/dev/null || true)"
fi

# The dashboard service has no graphical session of its own. Start as the
# logged-in person and pass the session sockets explicitly for both Wayland and X11.
runuser -u "$target_user" -- env \
  HOME="$user_home" \
  XDG_RUNTIME_DIR="$runtime_dir" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=$runtime_dir/bus" \
  WAYLAND_DISPLAY="$wayland_display" \
  DISPLAY="$display" \
  setsid /bin/bash "$APP_DIR/scripts/launch-gymondo.sh" || fail "Der Browser konnte nicht für die Desktop-Anmeldung gestartet werden."
