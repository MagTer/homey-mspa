#!/bin/bash
# Arctic (Homey CLI): Build + local install — M-Spa fork
# Primary (LAN): Homey Pro (Early 2023) → 192.168.188.62
# WiFi backup IP: 192.168.188.86
# See PROJEKT-REGELN.md → "Netzwerk / IPs (Arctic)"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use 2>/dev/null || true
fi

# Compose: bootstrap generated app.json (gitignored) from source if missing
if [[ ! -f app.json && -f .homeycompose/app.json ]]; then
  echo "=== Bootstrap app.json from .homeycompose/app.json ==="
  cp .homeycompose/app.json app.json
fi

echo "=== Build ==="
npm run build

echo "=== Install locally (Homey 2023 LAN @ 192.168.188.62, WiFi backup .86) ==="
homey app install

echo "✅ Local Homey update done (M-Spa / com.mspa.hot-tub)."
