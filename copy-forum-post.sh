#!/bin/bash
# Copies a forum post to the clipboard.
# Usage: ./copy-forum-post.sh [file]
# Without argument: reads from stdin.
set -euo pipefail

copy_to_clipboard() {
  if command -v wl-copy >/dev/null 2>&1; then
    wl-copy
  elif command -v xclip >/dev/null 2>&1; then
    xclip -selection clipboard
  elif command -v xsel >/dev/null 2>&1; then
    xsel --clipboard --input
  else
    echo "❌ No clipboard tool (wl-copy, xclip, xsel) found." >&2
    exit 1
  fi
}

if [[ $# -ge 1 ]]; then
  if [[ ! -f "$1" ]]; then
    echo "❌ File not found: $1" >&2
    exit 1
  fi
  copy_to_clipboard < "$1"
  echo "✅ Forum post → clipboard ($(wc -c < "$1" | tr -d ' ') characters)"
else
  copy_to_clipboard
  echo "✅ Forum post → clipboard (stdin)"
fi

echo "   Thread: https://community.homey.app/t/m-spa-app-for-homey/153741"
