#!/usr/bin/env bash
set -euo pipefail

# FitFamily Dashboard – Vollautomatischer Ubuntu-Setup-Oneliner
# Aufruf: curl -fsSL https://raw.githubusercontent.com/Schello805/FitFamily-Dashboard/main/scripts/setup-ubuntu.sh | sudo bash

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Fehler: Dieses Skript muss mit Root-Rechten ausgeführt werden."
  echo "Bitte ausführen mit: sudo bash $0 oder per 'curl ... | sudo bash'"
  exit 1
fi

# Terminal-Eingabe für interaktive Prompts sicherstellen (auch bei curl | sudo bash)
if [[ ! -t 0 && -e /dev/tty ]]; then
  exec < /dev/tty
fi

echo "========================================================"
echo " FitFamily Dashboard – Automatische Ubuntu-Installation "
echo "========================================================"

echo ""
echo "-> 1/3: Grundlegende Systempakete aktualisieren..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git openssl ca-certificates cifs-utils

echo ""
echo "-> 2/3: Node.js 22 LTS prüfen und einrichten..."
needs_node=false
if ! command -v node >/dev/null 2>&1; then
  needs_node=true
else
  NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  if [[ "$NODE_MAJOR" -lt 22 ]]; then
    needs_node=true
  fi
fi

if [[ "$needs_node" == true ]]; then
  echo "   Node.js 22 wird via NodeSource eingerichtet..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "   Node.js $(node -v) und npm $(npm -v) sind einsatzbereit."

echo ""
echo "-> 3/3: FitFamily Repository laden & Installation starten..."
TARGET_DIR="/opt/fitfamily"
REPO_URL="https://github.com/Schello805/FitFamily-Dashboard.git"

git config --system --add safe.directory "$TARGET_DIR" 2>/dev/null || true

if [[ ! -d "$TARGET_DIR/.git" ]]; then
  mkdir -p "$TARGET_DIR"
  git clone "$REPO_URL" "$TARGET_DIR"
else
  echo "   Bestehendes Verzeichnis /opt/fitfamily gefunden. Aktualisiere..."
  git -C "$TARGET_DIR" fetch origin main
  git -C "$TARGET_DIR" checkout main
  git -C "$TARGET_DIR" reset --hard origin/main
fi

chmod +x "$TARGET_DIR/scripts/"*.sh
exec "$TARGET_DIR/scripts/install-ubuntu.sh"
