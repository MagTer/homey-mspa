#!/bin/bash
# Arctic (Homey CLI): Build + lokales Install — M-Spa Fork
# Primär (LAN): Homey Pro (Early 2023) → 192.168.188.62
# WLAN Backup-IP: 192.168.188.86
# Siehe PROJEKT-REGELN.md → "Netzwerk / IPs (Arctic)"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use 2>/dev/null || true
fi

# Compose: generiertes app.json (gitignored) aus Quelle bootstrapen, falls fehlend
if [[ ! -f app.json && -f .homeycompose/app.json ]]; then
  echo "=== Bootstrap app.json aus .homeycompose/app.json ==="
  cp .homeycompose/app.json app.json
fi

echo "=== Build ==="
npm run build

echo "=== Lokal installieren (Homey 2023 LAN @ 192.168.188.62, WLAN-Backup .86) ==="
homey app install

echo "✅ Lokales Homey-Update fertig (M-Spa / com.mspa.hot-tub)."
