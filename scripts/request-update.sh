#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 && $# -eq 0 ]] || exit 1
IFS= read -r job_id
[[ "$job_id" =~ ^[a-f0-9-]{36}$ ]] || exit 1
# A separate systemd unit survives restart of the web service and can roll back.
exec /usr/bin/systemd-run --collect --unit="fitfamily-update-$job_id" /usr/local/libexec/fitfamily-update "$job_id"
