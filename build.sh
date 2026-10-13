#!/usr/bin/env bash
# Packages the extension for the Chrome Web Store.
#   ./build.sh   ->  dist/ai-form-filler-<version>.zip
#
# The store rejects archives that carry a top-level folder, so the files are
# zipped from inside a staging dir. Only what the extension actually loads at
# runtime is copied — the test suite, the icon generator and git metadata are
# not part of the product and would only enlarge the review surface.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -p "require('./manifest.json').version")
STAGE=$(mktemp -d)
OUT="dist/ai-form-filler-${VERSION}.zip"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p dist
rm -f "$OUT"

# every path the manifest references, and nothing else
for f in manifest.json background.js inject.js page-funcs.js offline.js LICENSE; do
  cp "$f" "$STAGE/"
done
cp -R icons "$STAGE/icons"
cp -R fonts "$STAGE/fonts"
rm -f "$STAGE/icons/"*.mjs   # belt and braces: no build scripts in the package

( cd "$STAGE" && zip -qr - . -x '.*' -x '__MACOSX/*' ) > "$OUT"

echo "→ $OUT  ($(du -h "$OUT" | cut -f1))"
echo
echo "contents:"
unzip -Z1 "$OUT" | sed 's/^/  /'
