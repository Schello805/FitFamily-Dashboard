#!/usr/bin/env bash
set -euo pipefail
# Explicit offline operation; this script is never included in web sudoers.
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Aufruf: sudo /usr/local/libexec/fitfamily-restore /pfad/fitfamily-recovered.db' >&2; exit 1; }
APP_DIR=/opt/fitfamily
SOURCE="$(realpath "$1")"
[[ -f "$SOURCE" ]] || exit 1
exec 9>/run/lock/fitfamily-update.lock
flock -n 9 || { echo 'Ein Update oder eine Wiederherstellung läuft bereits.' >&2; exit 1; }
STAGING="$(mktemp -d /var/lib/fitfamily/restore.XXXXXXXX)"
chown fitfamily:fitfamily "$STAGING"
# The service account reads and validates the input, never privileged code.
runuser -u fitfamily -- cp "$SOURCE" "$STAGING/recovered.db"
runuser -u fitfamily -- node "$APP_DIR/current/scripts/sqlite-maintenance.mjs" prepare-restore "$STAGING/recovered.db"
chown -hR root:fitfamily "$STAGING"
chmod 0750 "$STAGING"
[[ ! -L "$STAGING/recovered.db" ]] || exit 1
SNAPSHOT=""
SERVICE_STOPPED=0
rollback() {
  local exit_code=$?
  if [[ $exit_code -ne 0 && $SERVICE_STOPPED -eq 1 ]]; then
    systemctl stop fitfamily.service || true
    if [[ -n "$SNAPSHOT" && -f "$STAGING/previous.db" ]]; then
      cp --remove-destination "$STAGING/previous.db" "$APP_DIR/data/fitfamily.db"
      chown fitfamily:fitfamily "$APP_DIR/data/fitfamily.db"
      chmod 0600 "$APP_DIR/data/fitfamily.db"
      rm -f "$APP_DIR/data/fitfamily.db-wal" "$APP_DIR/data/fitfamily.db-shm"
    fi
    systemctl start fitfamily.service || true
    echo 'Wiederherstellung fehlgeschlagen; vorheriger Stand wurde wieder gestartet.' >&2
  fi
}
trap rollback EXIT
systemctl stop fitfamily.service
SERVICE_STOPPED=1
if [[ -f "$APP_DIR/data/fitfamily.db" ]]; then
  # Temporarily let the service account create the SQLite snapshot in a private directory.
  chown fitfamily:fitfamily "$STAGING"
  runuser -u fitfamily -- node "$APP_DIR/current/scripts/sqlite-maintenance.mjs" snapshot "file:$APP_DIR/data/fitfamily.db" "$STAGING/previous.db"
  chown -hR root:fitfamily "$STAGING"
  [[ -f "$STAGING/previous.db" && ! -L "$STAGING/previous.db" ]] || exit 1
  SNAPSHOT="$APP_DIR/backups/fitfamily-pre-restore-$(date +%Y%m%d_%H%M%S).db"
  runuser -u fitfamily -- cp "$STAGING/previous.db" "$SNAPSHOT"
fi
cp --remove-destination "$STAGING/recovered.db" "$APP_DIR/data/fitfamily.db"
chown fitfamily:fitfamily "$APP_DIR/data/fitfamily.db"
chmod 0600 "$APP_DIR/data/fitfamily.db"
# Only remove the fixed old WAL files after the old process has stopped.
rm -f "$APP_DIR/data/fitfamily.db-wal" "$APP_DIR/data/fitfamily.db-shm"
systemctl start fitfamily.service
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3000/api/dashboard >/dev/null && systemctl is-active --quiet fitfamily.service; then
    trap - EXIT
    echo "Geprüfte Datenbank eingespielt und Dienst geprüft. Vorheriger Stand: ${SNAPSHOT:-keine vorherige Datenbank}."
    exit 0
  fi
  sleep 1
done
exit 1
