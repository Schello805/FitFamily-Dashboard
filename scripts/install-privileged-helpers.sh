#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte als root ausführen.' >&2; exit 1; }
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -d -m 0755 /usr/local/libexec /var/lib/fitfamily
install -o root -g root -m 0755 "$source_dir/scripts/update.sh" /usr/local/libexec/fitfamily-update
install -o root -g root -m 0644 "$source_dir/scripts/release-state.sh" /usr/local/libexec/fitfamily-release-state
install -o root -g root -m 0755 "$source_dir/scripts/request-update.sh" /usr/local/libexec/fitfamily-update-request
install -o root -g root -m 0755 "$source_dir/scripts/mount-nas.py" /usr/local/libexec/fitfamily-mount
install -o root -g root -m 0755 "$source_dir/scripts/restore-db.sh" /usr/local/libexec/fitfamily-restore
install -o root -g root -m 0755 "$source_dir/scripts/gymondo-request.sh" /usr/local/libexec/fitfamily-gymondo-request
sudoers_file="$(mktemp /etc/sudoers.d/.fitfamily.XXXXXXXX)"
trap 'rm -f "$sudoers_file"' EXIT
printf '%s\n' 'fitfamily ALL=(root) NOPASSWD: /usr/local/libexec/fitfamily-update-request "", /usr/local/libexec/fitfamily-mount "", /usr/local/libexec/fitfamily-gymondo-request ""' > "$sudoers_file"
chmod 0440 "$sudoers_file"
visudo -cf "$sudoers_file"
mv -f "$sudoers_file" /etc/sudoers.d/fitfamily
trap - EXIT
