#!/usr/bin/env bash
# Assert that the committed art-key manifest matches the bundled level data.
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
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# `levels-src/generated/art-manifest.ts` is derived from the level files. If the two
# disagree, every picture a level names may be missing from the manifest, and the
# first sign of that is a level that renders blank in a browser - after the build has
# passed, and after the corpus test has reported something about art keys rather than
# about the manifest being stale.
#
# So the generated file is regenerated into a temporary path and compared. The
# committed file is never modified by this check.

set -euo pipefail

cd "$(dirname "$0")/.."

COMMITTED="levels-src/generated/art-manifest.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [[ ! -f "$COMMITTED" ]]; then
  echo "check-art-manifest: $COMMITTED is missing." >&2
  echo "check-art-manifest: run 'make art-manifest'." >&2
  exit 1
fi

# Written to the committed path, then copied aside and restored. The generator has no
# output-path option, and adding one for the sake of a check would be a worse trade
# than three lines of shell - but the restore is unconditional, so a failed
# regeneration cannot leave a half-written manifest behind.
cp "$COMMITTED" "$TMP"

node --experimental-transform-types --disable-warning=ExperimentalWarning \
  levels-src/emit-art-manifest.ts >/dev/null

# Both sides go through Prettier first, for the reason given in check-level-index.sh.
npx --no-install prettier --write "$TMP" "$COMMITTED" >/dev/null 2>&1 || true

if ! diff -u "$TMP" "$COMMITTED" > /dev/null; then
  cp "$TMP" "$COMMITTED"
  echo "check-art-manifest: the committed manifest is stale." >&2
  diff -u "$TMP" "$COMMITTED" | head -40 >&2 || true
  echo "check-art-manifest: run 'make art-manifest' and commit the result." >&2
  exit 1
fi

rm -f "$TMP"
trap - EXIT

if [[ "${CUYO_AI_MODE:-}" == "1" ]]; then
  exit 0
fi

echo "check-art-manifest: manifest is up to date"
