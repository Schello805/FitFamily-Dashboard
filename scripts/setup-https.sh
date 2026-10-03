#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 && $# -eq 1 ]] || { echo 'Aufruf: sudo ./scripts/setup-https.sh <erreichbarer-lokaler-name-oder-IP>' >&2; exit 1; }
hostname_arg="$1"
[[ "$hostname_arg" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && ${#hostname_arg} -le 253 ]] || { echo 'Ungültiger Hostname.' >&2; exit 1; }
command -v caddy >/dev/null || { echo 'Bitte zuerst Caddy installieren: sudo apt install caddy' >&2; exit 1; }
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f /opt/fitfamily/.env.local && -L /opt/fitfamily/current ]] || { echo 'Bitte zuerst die aktuelle Systeminstallation durchführen.' >&2; exit 1; }
config_temp="$(mktemp /tmp/fitfamily-caddy.XXXXXXXX)"
trap 'rm -f "$config_temp"' EXIT
sed "s/fitfamily-host.example/$hostname_arg/g" "$source_dir/deploy/caddy/Caddyfile" > "$config_temp"
caddy validate --config "$config_temp" --adapter caddyfile
stamp="$(date +%Y%m%d_%H%M%S)"
if [[ -f /etc/caddy/Caddyfile ]]; then cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.pre-fitfamily-$stamp"; fi
cp /opt/fitfamily/.env.local "/opt/fitfamily/.env.local.pre-https-$stamp"
install -o root -g caddy -m 0644 "$config_temp" /etc/caddy/Caddyfile
/usr/bin/python3 - "$hostname_arg" <<'PY'
import pathlib, sys
filename = pathlib.Path('/opt/fitfamily/.env.local')
updates = dict(HOST='127.0.0.1', TRUST_PROXY='true', APP_URL='https://' + sys.argv[1])
lines = [line for line in filename.read_text().splitlines() if line.split('=', 1)[0] not in updates]
filename.write_text('\n'.join(lines + [key + '=' + value for key, value in updates.items()]) + '\n')
PY
chown root:fitfamily /opt/fitfamily/.env.local
chmod 0640 /opt/fitfamily/.env.local
systemctl enable --now caddy
systemctl restart caddy
systemctl restart fitfamily
echo "HTTPS eingerichtet: https://$hostname_arg"
echo 'Der lokale Name muss auf allen Handys diese Server-IP auflösen. Root-Zertifikat auf jedes Handy übertragen und vertrauen:'
echo '/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt'
echo 'Vorherige Konfigurationen liegen neben Caddyfile und .env.local (pre-fitfamily / pre-https). Firewall bleibt unverändert.'
