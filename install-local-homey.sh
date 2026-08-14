#!/bin/bash
# Build the app and install it on a local Homey Pro via the Homey CLI.
#
# Requires the Homey CLI (npm i -g homey) and a logged-in session (homey login).
# The CLI discovers the Homey on your network by itself; run `homey select` once
# if you have more than one.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use 2>/dev/null || true
fi

echo "=== Build ==="
npm run build

echo "=== Install on local Homey ==="
homey app install

echo "Done (com.mspa.hot-tub)."
