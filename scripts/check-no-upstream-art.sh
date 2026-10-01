#!/usr/bin/env bash
# Assert that no upstream sprite reached the build output.
#
# Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
#
# Cuyo ships 912 original spritesheets under data/pics, GPL-2.0-or-later, and
# this project's artwork is entirely new. One reaching `dist/` would be a licence
# problem rather than merely a size one, so it is a build failure.
#
# What is checked, and what each check is for. Two earlier attempts at this were
# written, and both would have passed while shipping artwork:
#
#  - Naming seven sprites by hand. Three of the seven names did not exist
#    upstream - they came from the hand-written level fixtures - so the list
#    covered less than it appeared to.
#  - Looking for `*.xpm` in dist. Every upstream sprite is `.xpm.gz`, so a copied
#    file did not match.
#
# And a name-based check is not sufficient on its own: pasting a sprite in as
# `logo.png` renames it. So the check that matters is by *content* - a SHA-256 of
# every upstream sprite, decompressed as well as compressed, against a SHA-256 of
# every file in the bundle. That is immune to renaming and re-compression, and it
# needs no list to keep in step with upstream.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1
cd "$ROOT" || exit 1

DIST="${1:-dist}"
UPSTREAM="${2:-$ROOT/.context/upstream-cuyo/data/pics}"

fail() { echo "check-no-upstream-art: $*" >&2; exit 1; }

[ -d "$DIST" ] || fail "$DIST does not exist; run 'make build' first"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Both spellings of every upstream sprite: as shipped, and decompressed. The
# second catches a sprite that was un-gzipped on the way into the bundle.
upstream_hashes="$tmp/upstream.sha256"
: > "$upstream_hashes"
if [ -d "$UPSTREAM" ]; then
  while IFS= read -r sprite; do
    sha256sum "$sprite" | cut -d' ' -f1 >> "$upstream_hashes"
    case "$sprite" in
      *.gz) gzip -cd "$sprite" 2>/dev/null | sha256sum | cut -d' ' -f1 >> "$upstream_hashes" ;;
    esac
  done < <(find "$UPSTREAM" -maxdepth 1 -type f)
fi
sort -u -o "$upstream_hashes" "$upstream_hashes"

# Cheap first pass: nothing sprite-shaped, whatever the extension.
strays="$(find "$DIST" \( -name '*.xpm' -o -name '*.xpm.gz' \) -print)"
if [ -n "$strays" ]; then
  echo "check-no-upstream-art: sprite-shaped files in $DIST:" >&2
  echo "$strays" >&2
  fail "upstream artwork must not ship; the artwork here is new"
fi

# The check that matters: content, not name.
hits=0
if [ -s "$upstream_hashes" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    for digest in $(sha256sum "$file" | cut -d' ' -f1) \
                  $(case "$file" in
                       *.gz) gzip -cd "$file" 2>/dev/null | sha256sum | cut -d' ' -f1 ;;
                     esac); do
      if grep -qxF "$digest" "$upstream_hashes"; then
        echo "check-no-upstream-art: upstream artwork reached the bundle:" >&2
        echo "  sha256 $digest" >&2
        echo "  in     $file" >&2
        hits=$((hits + 1))
      fi
    done
  done < <(find "$DIST" -type f)
  if [ "$hits" -gt 0 ]; then
    fail "$hits upstream file(s) in $DIST"
  fi
  echo "check-no-upstream-art: $(wc -l < "$upstream_hashes" | tr -d ' ') upstream digests checked against $(find "$DIST" -type f | wc -l | tr -d ' ') bundled files"
else
  echo "check-no-upstream-art: no upstream tree at $UPSTREAM; extension check only"
fi

echo "check-no-upstream-art: clean"