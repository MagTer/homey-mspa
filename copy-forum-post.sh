#!/bin/bash
# Kopiert einen Forum-Beitrag in die Zwischenablage.
# Nutzung: ./copy-forum-post.sh [datei]
# Ohne Argument: liest von stdin.
set -euo pipefail

copy_to_clipboard() {
  if command -v wl-copy >/dev/null 2>&1; then
    wl-copy
  elif command -v xclip >/dev/null 2>&1; then
    xclip -selection clipboard
  elif command -v xsel >/dev/null 2>&1; then
    xsel --clipboard --input
  else
    echo "❌ Kein Clipboard-Tool (wl-copy, xclip, xsel) gefunden." >&2
    exit 1
  fi
}

if [[ $# -ge 1 ]]; then
  if [[ ! -f "$1" ]]; then
    echo "❌ Datei nicht gefunden: $1" >&2
    exit 1
  fi
  copy_to_clipboard < "$1"
  echo "✅ Forum-Beitrag → Zwischenablage ($(wc -c < "$1" | tr -d ' ') Zeichen)"
else
  copy_to_clipboard
  echo "✅ Forum-Beitrag → Zwischenablage (stdin)"
fi

echo "   Thread: https://community.homey.app/t/m-spa-app-for-homey/153741"
