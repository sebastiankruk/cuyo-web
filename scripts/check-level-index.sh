#!/usr/bin/env bash
# Assert that the committed level catalogue matches summary.ld and the level files.
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
# `levels-src/generated/level-index.ts` carries the per-difficulty numexplode, the
# track membership and the descriptions, all resolved from the level files. If it goes
# stale the catalogue shows last build's numbers for a level that has since changed -
# and no other check would notice, because the corpus tests read the level files
# directly rather than the catalogue.
#
# Regenerated into place and diffed, with the committed file restored either way.

set -euo pipefail

cd "$(dirname "$0")/.."

COMMITTED="levels-src/generated/level-index.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [[ ! -f "$COMMITTED" ]]; then
  echo "check-level-index: $COMMITTED is missing." >&2
  echo "check-level-index: run 'make level-index'." >&2
  exit 1
fi

cp "$COMMITTED" "$TMP"

node --experimental-transform-types --disable-warning=ExperimentalWarning \
  levels-src/emit-level-index.ts >/dev/null

# Both sides go through Prettier before the comparison. Without this the check fails on
# formatting the moment anyone runs `prettier --write` over the repository, which is
# not a catalogue being stale - it is a generator whose output does not match the
# formatter. Prettier is idempotent, so formatting an already-clean file is a no-op
# and the comparison stays about content.
npx --no-install prettier --write "$TMP" "$COMMITTED" >/dev/null 2>&1 || true

if ! diff -u "$TMP" "$COMMITTED" > /dev/null; then
  cp "$TMP" "$COMMITTED"
  echo "check-level-index: the committed catalogue is stale." >&2
  diff -u "$TMP" "$COMMITTED" | head -40 >&2 || true
  echo "check-level-index: run 'make level-index' and commit the result." >&2
  exit 1
fi

rm -f "$TMP"
trap - EXIT

if [[ "${CUYO_AI_MODE:-}" != "1" ]]; then
  echo "check-level-index: catalogue is up to date"
fi
