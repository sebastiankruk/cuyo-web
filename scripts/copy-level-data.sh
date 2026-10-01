#!/usr/bin/env bash
# Copy the level files the game fetches at runtime into public/levels/.
#
# Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published
# by the Free Software Foundation, either version 2 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# The catalogue lists 79 levels and each one is fetched only when chosen, so the
# browser needs the `.ld` files as static assets. They live in `levels/upstream/`
# and `levels/`, both committed, and are copied into `public/` where Vite serves them
# verbatim.
#
# `public/levels/` is generated and not committed: it would be a third copy of the same
# files, with no way to tell which directory a level came from by the time it got here.
# `.gitignore` excludes it.
#
# Only the files the catalogue references are copied, plus `globals.ld` which every
# level resolves its names against. `summary.ld` and `example.ld` are not copied:
# the first is compiled into the index and the second is documentation whose picture
# names would put keys in the manifest that no level uses.

set -euo pipefail

cd "$(dirname "$0")/.."

CONTRIB_DIR="levels"
VENDORED_DIR="levels/upstream"
OUT="public/levels"

if [[ ! -d "$VENDORED_DIR" ]]; then
  echo "copy-level-data: no vendored levels at $VENDORED_DIR." >&2
  echo "copy-level-data: the level files are committed, so this is an incomplete" >&2
  echo "               checkout rather than a missing fetch." >&2
  exit 1
fi

# The list of filenames comes from the generated catalogue rather than from the
# directory, so a file that no level index points at is not shipped.
if [[ ! -f levels-src/generated/level-index.ts ]]; then
  echo "copy-level-data: the level catalogue has not been generated." >&2
  echo "copy-level-data: run 'make level-index' first." >&2
  exit 1
fi

mkdir -p "$OUT"
rm -f "$OUT"/*.ld 2>/dev/null || true

copied=0
# `levels/` first, then the vendored copy, so a contributed file with the same name as
# a vendored one wins - matching level-sources.ts, so a level can be corrected in place
# without a rename.
while read -r name; do
  [[ -z "$name" ]] && continue
  if [[ -f "$CONTRIB_DIR/$name" ]]; then
    cp "$CONTRIB_DIR/$name" "$OUT/$name"
  elif [[ -f "$VENDORED_DIR/$name" ]]; then
    cp "$VENDORED_DIR/$name" "$OUT/$name"
  else
    echo "copy-level-data: $name is referenced but in neither $CONTRIB_DIR nor $VENDORED_DIR." >&2
    exit 1
  fi
  copied=$((copied + 1))
done < <(
  grep -o 'filename: "[^"]*"' levels-src/generated/level-index.ts \
    | sed 's/filename: "//; s/"$//' | sort -u
)

# A contributed level may name a picture nothing else uses, which the catalogue cannot
# tell us about. Anything in levels/ that the index does not name is still a level file
# the browser may be asked to load, so it is copied too.
while read -r path; do
  name="$(basename "$path")"
  [[ "$name" == "summary.ld" ]] && continue
  [[ -f "$OUT/$name" ]] && continue
  cp "$path" "$OUT/$name"
  copied=$((copied + 1))
done < <(find "$CONTRIB_DIR" -maxdepth 1 -name '*.ld' 2>/dev/null | sort)

cp "$VENDORED_DIR/globals.ld" "$OUT/globals.ld"

if [[ "${CUYO_AI_MODE:-}" != "1" ]]; then
  echo "copy-level-data: $copied level files plus globals.ld into $OUT/"
fi
