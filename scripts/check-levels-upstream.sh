#!/usr/bin/env bash
# Assert that the vendored level files are still upstream's, unaltered.
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
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# The 79 level files in `levels/upstream/` are committed, copied verbatim from the Cuyo
# 2.1.0 tarball. Committing them is what lets a fresh clone build and test, so this
# check is the thing standing in for the provenance a fetch used to provide: it says
# the committed bytes are the upstream bytes.
#
# It needs upstream's own copy to compare against, so it needs a checkout, so it skips
# when there is none - and says so, because a check that silently passes because it
# could not run is worse than no check. That is also why it is not in `make check`:
# CI has no upstream tree, and a gate that can only ever skip in CI gives false
# confidence. Run it deliberately, or after `make fetch-corpus`.
#
# A difference is not automatically a mistake. Patching a level to fix something is
# legitimate, and `levels/` exists precisely so a patched level is a *different file*
# rather than an edit to a vendored one. So this reports both directions:
#
# - a vendored file that differs from upstream's, which is the thing to look at
# - an upstream file with no vendored counterpart, which is a level that has gone
#   missing without anyone noticing

set -euo pipefail

cd "$(dirname "$0")/.."

CHECKOUT="${CUYO_DATA_DIR:-.context/upstream-cuyo/data}"
VENDORED="levels/upstream"

if [[ ! -f "$CHECKOUT/summary.ld" ]]; then
  if [[ "${CUYO_AI_MODE:-}" == "1" ]]; then
    echo "check-levels-upstream: skipped, no upstream checkout at $CHECKOUT"
  else
    echo "check-levels-upstream: skipped - no upstream checkout at $CHECKOUT"
    echo "  Run 'make fetch-corpus' to fetch it, then re-run this."
    echo "  Nothing in the build or the test suite needs it."
  fi
  exit 0
fi

# Upstream also ships these two, and they are not levels. `summary.ld` is the index
# and is compared, because it decides what the catalogue contains. `example.ld` is
# documentation and is skipped: its picture names are illustrative.
changed=0
missing=0
checked=0

for path in "$VENDORED"/*.ld; do
  name="$(basename "$path")"
  [[ "$name" == "example.ld" ]] && continue
  upstream="$CHECKOUT/$name"
  if [[ ! -f "$upstream" ]]; then
    echo "  not in upstream: $name"
    missing=$((missing + 1))
    continue
  fi
  if ! cmp -s "$path" "$upstream"; then
    echo "  differs from upstream: $name"
    changed=$((changed + 1))
  fi
  checked=$((checked + 1))
done

# The other direction. Only files upstream lists as levels, so its own summary, its
# globals and its example do not count as levels that have gone missing.
while read -r name; do
  [[ -z "$name" ]] && continue
  [[ "$name" == "example.ld" || "$name" == "globals.ld" ]] && continue
  if [[ ! -f "$VENDORED/$name" ]]; then
    echo "  vendored copy missing: $name"
    missing=$((missing + 1))
  fi
done < <(
  find "$CHECKOUT" -maxdepth 1 -name '*.ld' -printf '%f\n' 2>/dev/null | sort
)

if [[ "${CUYO_AI_MODE:-}" != "1" ]]; then
  echo "check-levels-upstream: $checked files compared against $CHECKOUT"
fi

if [[ "$missing" -gt 0 ]]; then
  echo "check-levels-upstream: $missing file(s) present on one side only." >&2
  echo "  A level that exists upstream but not here is a level the catalogue cannot" >&2
  echo "  serve. Re-copy it, or say in the commit why it is deliberately absent." >&2
  exit 1
fi

if [[ "$changed" -gt 0 ]]; then
  echo "check-levels-upstream: $changed vendored file(s) differ from upstream." >&2
  echo "  Patching a level is legitimate, but do it in levels/ so the vendored copy" >&2
  echo "  stays verbatim and 'git log' shows the patch separately." >&2
  exit 1
fi
