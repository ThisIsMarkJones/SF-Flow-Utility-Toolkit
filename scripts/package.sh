#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Mark Jones. SF Flow Utility Toolkit.
#
# Builds a store ZIP from an allowlist of the extension's own files.
# Never includes tests/, node_modules/, docs/, dist/, scripts/ or dotfiles.
#
# Usage: scripts/package.sh <chrome|firefox> [--out DIR] [--force]
#   chrome  -> manifest.chrome.json packaged as manifest.json (Chrome Web Store, Edge Add-ons)
#   firefox -> manifest.firefox.json packaged as manifest.json (Firefox Add-ons)
#   --out   output directory (default: dist)
#   --force overwrite an existing ZIP of the same version
#
# Prints the ZIP's file list, and fails if any file the manifest references is missing.

set -euo pipefail

# The extension's own files and folders. Add new top-level entries here.
ALLOWLIST=(
  background.js
  main.js
  assets
  config
  features
  icons
  lib
  settings
  styles
  ui
  utils
  LICENSE
  NOTICE
)

usage() { sed -n '8,14p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

BROWSER="${1:-}"; shift || true
OUT_DIR="dist"; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT_DIR="${2:?--out needs a directory}"; shift 2 ;;
    --force) FORCE=1; shift ;;
    *) usage ;;
  esac
done
case "$BROWSER" in
  chrome) SUFFIX="chrome-edge" ;;
  firefox) SUFFIX="firefox" ;;
  *) usage ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_MANIFEST="$ROOT/manifest.$BROWSER.json"
[ -f "$SRC_MANIFEST" ] || { echo "Missing $SRC_MANIFEST" >&2; exit 1; }
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
command -v zip >/dev/null || { echo "zip is required" >&2; exit 1; }

VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$SRC_MANIFEST")"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
ZIP="$OUT_DIR/sf-flow-utility-toolkit-v$VERSION-$SUFFIX.zip"
if [ -e "$ZIP" ] && [ "$FORCE" -ne 1 ]; then
  echo "Refusing to overwrite $ZIP (use --force)." >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

for entry in "${ALLOWLIST[@]}"; do
  [ -e "$ROOT/$entry" ] || { echo "Allowlisted entry missing: $entry" >&2; exit 1; }
  # rsync keeps the tree but drops dotfiles (.DS_Store and the like) at any depth.
  rsync -a --exclude='.*' "$ROOT/$entry" "$STAGE/"
done

# Browser manifest becomes manifest.json, without the repo-only "_comment" key.
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  delete m._comment;
  fs.writeFileSync(process.argv[2], JSON.stringify(m, null, 2) + "\n");
' "$SRC_MANIFEST" "$STAGE/manifest.json"

# Every file the manifest points at must be in the package.
node -e '
  const fs = require("fs"), path = require("path");
  const dir = process.argv[1];
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const refs = new Set();
  const add = (p) => { if (typeof p === "string" && !p.includes("*")) refs.add(p); };
  (m.content_scripts || []).forEach((cs) => [...(cs.js || []), ...(cs.css || [])].forEach(add));
  add(m.background && m.background.service_worker);
  ((m.background && m.background.scripts) || []).forEach(add);
  Object.values(m.icons || {}).forEach(add);
  Object.values((m.action && m.action.default_icon) || {}).forEach(add);
  add(m.action && m.action.default_popup);
  add(m.options_page);
  add(m.options_ui && m.options_ui.page);
  (m.web_accessible_resources || []).forEach((w) => (typeof w === "string" ? [w] : w.resources || []).forEach(add));
  const missing = [...refs].filter((p) => !fs.existsSync(path.join(dir, p)));
  if (missing.length) { console.error("Manifest references files not in the package:\n  " + missing.join("\n  ")); process.exit(1); }
' "$STAGE"

rm -f "$ZIP"
(cd "$STAGE" && zip -q -X -r "$ZIP" .)

echo "Built $ZIP"
echo "Files:"
unzip -Z1 "$ZIP" | grep -v '/$' | sort | sed 's/^/  /'
echo "$(unzip -Z1 "$ZIP" | grep -vc '/$') files"
