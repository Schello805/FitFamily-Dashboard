#!/usr/bin/env bash
set -euo pipefail

# This root-owned helper is run by a systemd timer. It catches the case that
# systemd cannot see: a live Node process whose local HTTP server no longer
# answers. The regular service Restart=on-failure still handles process exits.
exec 9>/run/lock/fitfamily-update.lock
if ! flock -n 9; then
  # A release switch intentionally stops the app for a short moment.
  exit 0
fi

healthy() {
  /usr/bin/curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/dashboard >/dev/null
}

if healthy; then
  exit 0
fi

# Do not restart for a one-off busy event.
sleep 5
if healthy; then
  /usr/bin/logger -t fitfamily-watchdog "Dashboard antwortete beim zweiten Versuch wieder; kein Neustart nötig."
  exit 0
fi

/usr/bin/logger -t fitfamily-watchdog "Dashboard antwortet zweimal nicht; starte fitfamily.service neu."
/usr/bin/systemctl restart fitfamily.service

for _attempt in $(seq 1 15); do
  if healthy; then
    /usr/bin/logger -t fitfamily-watchdog "Dashboard nach Neustart wieder erreichbar."
    exit 0
  fi
  sleep 2
done

/usr/bin/logger -p daemon.err -t fitfamily-watchdog "Dashboard ist nach Watchdog-Neustart weiterhin nicht erreichbar."
exit 1
