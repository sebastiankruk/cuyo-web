#!/usr/bin/env bash
# Assert that no upstream sprite reached the build output.
#
# Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 2 of the License, or
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
# every file in the bundle. That is immune to renaming and re-compression.
#
# The digests come from `scripts/upstream-art-digests.sha256`, which is committed.
# They used to be computed from a fetched upstream tree, on the argument that this
# way there is "no list to keep in step with upstream". That argument was wrong in a
# way worth recording: CI has no upstream tree, so the content check never ran there.
# The gate was decorative in the one place it mattered, and the cheap extension pass
# was all that ever ran in CI. Committing 110 kB of digests is the same trade the
# level files made, and for the same reason - a check that cannot run is not a check.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1
cd "$ROOT" || exit 1

DIST="${1:-dist}"
DIGESTS="scripts/upstream-art-digests.sha256"
UPSTREAM="${2:-$ROOT/.context/upstream-cuyo/data/pics}"

fail() { echo "check-no-upstream-art: $*" >&2; exit 1; }

[ -d "$DIST" ] || fail "$DIST does not exist; run 'make build' first"
[ -s "$DIGESTS" ] || fail "$DIGESTS is missing or empty; run 'make art-digests'"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The committed digests, comments stripped, sorted and deduplicated so a hand-edit
# that reorders or repeats one cannot change the answer.
upstream_hashes="$tmp/upstream.sha256"
grep -v '^#' "$DIGESTS" | grep -E '^[0-9a-f]{64}$' | sort -u > "$upstream_hashes"
count="$(wc -l < "$upstream_hashes" | tr -d ' ')"
[ "$count" -gt 1000 ] || fail "$DIGESTS has only $count digests; expected the full set"

# Cheap first pass: nothing sprite-shaped, whatever the extension.
strays="$(find "$DIST" \( -name '*.xpm' -o -name '*.xpm.gz' \) -print)"
if [ -n "$strays" ]; then
  echo "check-no-upstream-art: sprite-shaped files in $DIST:" >&2
  echo "$strays" >&2
  fail "upstream artwork must not ship; the artwork here is new"
fi

# The check that matters: content, not name.
hits=0
bundled=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  bundled=$((bundled + 1))
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

echo "check-no-upstream-art: $count upstream digests checked against $bundled bundled files"

# When a tree is present, the committed digests are verified against it. That is the
# one thing they cannot do alone: they assert what upstream's artwork *is*, and
# nothing here asserts that the list still matches. Without this a stale list would
# quietly check less than it appears to.
if [ -d "$UPSTREAM" ]; then
  live="$tmp/live.sha256"
  : > "$live"
  while IFS= read -r sprite; do
    sha256sum "$sprite" | cut -d' ' -f1 >> "$live"
    case "$sprite" in
      *.gz) gzip -cd "$sprite" 2>/dev/null | sha256sum | cut -d' ' -f1 >> "$live" ;;
    esac
  done < <(find "$UPSTREAM" -maxdepth 1 -type f)
  sort -u -o "$live" "$live"
  if ! cmp -s "$live" "$upstream_hashes"; then
    diff "$upstream_hashes" "$live" | head -20 >&2
    fail "$DIGESTS does not match the tree at $UPSTREAM; run 'make art-digests'"
  fi
  echo "check-no-upstream-art: digests verified against $UPSTREAM"
else
  echo "check-no-upstream-art: no tree at $UPSTREAM, so the digest list is unverified"
  echo "  Run 'make fetch-corpus' to check it. The content check above still ran."
fi

echo "check-no-upstream-art: clean"
