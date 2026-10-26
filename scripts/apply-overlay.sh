#!/usr/bin/env bash
# Copies Wren's files onto a Firefox checkout.   usage: scripts/apply-overlay.sh /path/to/firefox
set -euo pipefail
target="${1:?usage: apply-overlay.sh /path/to/firefox}"
here="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$target/mach" ] || { echo "$target does not look like a Firefox checkout (no mach file)"; exit 1; }
cp -R "$here/overlay/." "$target/"
while IFS= read -r path; do
  [ -n "$path" ] && rm -f "$target/$path"
done < "$here/overlay-deleted.txt"
cp "$here/build/mozconfig.wren-full" "$target/mozconfig"
echo "done. build with: cd $target && ./mach build"
