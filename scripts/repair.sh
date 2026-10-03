#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then
  exec sudo /usr/local/libexec/fitfamily-update
fi
if [[ ! -x /usr/local/libexec/fitfamily-update ]]; then
  echo 'Sichere Helfer fehlen. Bitte im aktuellen Checkout unter /opt/fitfamily einmal sudo ./scripts/install-ubuntu.sh ausführen.' >&2
  exit 1
fi
exec /usr/local/libexec/fitfamily-update
