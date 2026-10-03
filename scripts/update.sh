#!/usr/bin/env bash
set -euo pipefail

# Installed as a root-owned helper. Git and package scripts ALWAYS run unprivileged.
if [[ $EUID -ne 0 ]]; then
  exec sudo /usr/local/libexec/fitfamily-update
fi
APP_DIR=/opt/fitfamily
APP_USER=fitfamily
source /usr/local/libexec/fitfamily-release-state
REPOSITORY=https://github.com/Schello805/FitFamily-Dashboard.git
LOCAL_INSTALL=0
JOB_ID="${1:-$(cat /proc/sys/kernel/random/uuid)}"
if [[ "$JOB_ID" == "--install-local" ]]; then
  LOCAL_INSTALL=1
  JOB_ID="$(cat /proc/sys/kernel/random/uuid)"
fi
[[ "$JOB_ID" =~ ^[a-f0-9-]{36}$ ]] || { echo 'Ungültige Update-ID.' >&2; exit 1; }
mkdir -p /var/lib/fitfamily "$APP_DIR/releases"
chmod 0755 /var/lib/fitfamily
exec 9>/run/lock/fitfamily-update.lock
STARTED_AT="$(date -u +%FT%TZ)"
NEW_COMMIT=""
NEW_VERSION=""
STAGE=""
SNAPSHOT_DIR=""
PREVIOUS="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
SWITCHED=0
SERVICE_STOPPED=0

write_status() {
  /usr/bin/python3 - "$1" "$2" "$JOB_ID" "$STARTED_AT" "$NEW_COMMIT" "$NEW_VERSION" <<'PY'
import json, os, sys, tempfile
state, message, job, started, commit, version = sys.argv[1:]
fd, temporary = tempfile.mkstemp(dir='/var/lib/fitfamily', prefix='.update-')
with os.fdopen(fd, 'w') as stream:
    json.dump(dict(state=state, message=message, jobId=job, startedAt=started, newCommit=commit, newVersion=version), stream)
os.chmod(temporary, 0o644)
os.replace(temporary, '/var/lib/fitfamily/update-' + job + '.json')
fd, latest = tempfile.mkstemp(dir='/var/lib/fitfamily', prefix='.update-')
with os.fdopen(fd, 'w') as stream:
    json.dump(dict(state=state, message=message, jobId=job, startedAt=started, newCommit=commit, newVersion=version), stream)
os.chmod(latest, 0o644)
os.replace(latest, '/var/lib/fitfamily/update-status.json')
PY
}
if ! flock -n 9; then
  write_status error 'Ein anderes Update läuft bereits.'
  exit 1
fi
STAGE="$(mktemp -d "$APP_DIR/releases/.building.XXXXXXXX")"

rollback() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    if [[ $SWITCHED -eq 1 && -n "$PREVIOUS" ]]; then
      systemctl stop fitfamily.service || true
      restore_release "$APP_DIR" "$PREVIOUS" "$JOB_ID"
      if [[ -n "$SNAPSHOT_DIR" && -f "$SNAPSHOT_DIR/fitfamily.db" ]]; then
        cp --remove-destination "$SNAPSHOT_DIR/fitfamily.db" "$APP_DIR/data/fitfamily.db"
        chown "$APP_USER:$APP_USER" "$APP_DIR/data/fitfamily.db"
        chmod 0600 "$APP_DIR/data/fitfamily.db"
        rm -f "$APP_DIR/data/fitfamily.db-wal" "$APP_DIR/data/fitfamily.db-shm"
      fi
      systemctl start fitfamily.service || true
      write_status error 'Update fehlgeschlagen; vorherige Version und Datenbank wurden wiederhergestellt.'
    else
      if [[ $SERVICE_STOPPED -eq 1 && $SWITCHED -eq 0 && -n "$PREVIOUS" ]]; then
        systemctl start fitfamily.service || true
      elif [[ $SWITCHED -eq 1 ]]; then
        systemctl stop fitfamily.service || true
      fi
      write_status error 'Update fehlgeschlagen; die aktive Version wurde nicht ausgetauscht. Siehe journalctl -u fitfamily-update.'
    fi
  fi
  # Retain failed stages for diagnostics; never delete the active release.
  chown -hR root:fitfamily "$STAGE" 2>/dev/null || true
}
trap rollback EXIT
write_status running 'Neue Version wird getrennt von der aktiven Version vorbereitet.'
chown "$APP_USER:$APP_USER" "$STAGE"
if [[ $LOCAL_INSTALL -eq 1 ]]; then
  # Bootstrap from the reviewed checkout; exclude all runtime state and build output.
  runuser -u "$APP_USER" -- tar -C "$APP_DIR" --exclude='./releases' --exclude='./current' --exclude='./data' --exclude='./backups' --exclude='./.env.local' --exclude='./node_modules' --exclude='./.next' --exclude='./.git' -cf - . | runuser -u "$APP_USER" -- tar -C "$STAGE" -xf -
  NEW_COMMIT="$(runuser -u "$APP_USER" -- git -c safe.directory="$APP_DIR" -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || true)"
else
  runuser -u "$APP_USER" -- git -c core.hooksPath=/dev/null clone --depth 1 --branch main --single-branch "$REPOSITORY" "$STAGE"
  NEW_COMMIT="$(runuser -u "$APP_USER" -- git -C "$STAGE" rev-parse --short HEAD)"
fi
cd "$STAGE"
runuser -u "$APP_USER" -- npm ci --prefer-offline --no-audit --no-fund
mkdir "$STAGE/.build-data"
chown "$APP_USER:$APP_USER" "$STAGE/.build-data"
runuser -u "$APP_USER" -- env DATABASE_URL="file:$STAGE/.build-data/fitfamily.db" npm run build
[[ -f "$STAGE/.next/BUILD_ID" ]] || { echo 'Build ist unvollständig.' >&2; exit 1; }
NEW_VERSION="$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("version", ""))' "$STAGE/package.json")"

# Quiesce writes only after the build succeeds, before taking the rollback snapshot.
systemctl stop fitfamily.service
SERVICE_STOPPED=1
# Snapshot through SQLite, including all committed WAL pages.
if [[ -f "$APP_DIR/data/fitfamily.db" ]]; then
  SNAPSHOT_DIR="$(mktemp -d /var/lib/fitfamily/pre-update.XXXXXXXX)"
  chown "$APP_USER:$APP_USER" "$SNAPSHOT_DIR"
  runuser -u "$APP_USER" -- node "$STAGE/scripts/sqlite-maintenance.mjs" snapshot "file:$APP_DIR/data/fitfamily.db" "$SNAPSHOT_DIR/fitfamily.db"
  chown -hR root:fitfamily "$SNAPSHOT_DIR"
  chmod 0750 "$SNAPSHOT_DIR"
  [[ -f "$SNAPSHOT_DIR/fitfamily.db" && ! -L "$SNAPSHOT_DIR/fitfamily.db" ]] || exit 1
  runuser -u "$APP_USER" -- cp "$SNAPSHOT_DIR/fitfamily.db" "$APP_DIR/backups/fitfamily-pre-update-$JOB_ID.db"
fi
runuser -u "$APP_USER" -- rm -rf "$STAGE/.build-data"
ln -s "$APP_DIR/data" "$STAGE/data"
ln -s "$APP_DIR/backups" "$STAGE/backups"
ln -s "$APP_DIR/.env.local" "$STAGE/.env.local"
chown -hR root:fitfamily "$STAGE"
# Code and package scripts cannot be replaced by the web service.
chmod -R go-w "$STAGE"
mkdir -p "$STAGE/.next/cache"
chown -R "$APP_USER:$APP_USER" "$STAGE/.next/cache"
write_status running 'Build und Sicherung geprüft; aktiviere neue Version.'
activate_release "$APP_DIR" "$STAGE" "$JOB_ID"
SWITCHED=1
systemctl restart fitfamily.service
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3000/api/dashboard >/dev/null && systemctl is-active --quiet fitfamily.service; then
    write_status success 'Update installiert und Dienst erfolgreich geprüft.'
    trap - EXIT
    exit 0
  fi
  sleep 1
done
echo 'Neue Version beantwortet die Gesundheitsprüfung nicht.' >&2
exit 1
