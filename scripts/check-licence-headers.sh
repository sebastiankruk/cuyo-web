#!/usr/bin/env bash
# Assert that every source file carries this project's licence header.
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
# The short header, which every TypeScript source file carries as its first lines. Written out
# here rather than only in the test that checks it, because the test needs the text to compare
# against and a second copy of it in the test would be a second thing to keep right.
#
#   SPDX-License-Identifier: AGPL-3.0-or-later
#   Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
#   Licensed under the GNU Affero General Public License, version 3 or later.
#   See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
#   a port of.
#
# ## Why a header at all, and why this short one
#
# A per-file notice is what makes a licence *distributable*: someone who receives one file can see
# what they are obliged to do without finding the repository it came from. That matters most for
# this project precisely because most of it is not mine - upstream Cuyo is GPL-2.0-or-later and
# every level file under `levels/upstream/` is theirs, verbatim.
#
# So the header is short and it *names where the notices are*, rather than pasting the AGPL's
# seventeen sections into 161 files. Both forms are legally adequate; this one keeps the obligation
# and points at it, and a reader who follows the pointer gets the full text. The full text is
# asserted separately by `licence.test.ts`, which is the right place for it: one copy of the
# licence, checked once.
#
# `SPDX-License-Identifier` is on the first line because that is the line machines read. A tool
# scanning this repository for licences will find the identifier without parsing prose, and the
# two lines under it exist for the human who does not know what SPDX is.
#
# ## What is exempt, and why each exclusion is defensible
#
# - **Generated files** (`levels-src/generated/`) say "generated" in their path and are produced by
#   `make level-index` / `make art-manifest`. A header on them would be overwritten by the next
#   regeneration, so the emitter writes it instead and this check skips the directory.
# - **`.d.ts` files** carry no runtime code.
# - **`node_modules/`, `dist/`, `coverage/`, `.context/`** are not ours: dependencies, build
#   output, coverage, and the AI's own memory plus an upstream checkout.
# - **`levels/upstream/` and `levels/`** keep upstream's own per-file notices, which is exactly
#   what `ATTRIBUTION.md` and the `licence.test.ts` test called "grounds that in upstream's own
#   per-file notice" require. Adding ours on top would misattribute their work.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1
cd "$ROOT" || exit 1

SPDX="SPDX-License-Identifier: AGPL-3.0-or-later"
COPYRIGHT="Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)"

fail() { echo "check-licence-headers: $*" >&2; exit 1; }

# The files that must carry it: our own TypeScript, excluding the four exclusions above.
mapfile -t sources < <(
  find . \
    -path ./node_modules -prune -o \
    -path ./dist -prune -o \
    -path ./coverage -prune -o \
    -path ./.context -prune -o \
    -path ./levels -prune -o \
    -path ./levels-src/generated -prune -o \
    -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.d.ts' \
    -print | sort
)

count="${#sources[@]}"
# **The count is asserted, not assumed.** A check that finds nothing has passed, and a `find`
# that silently matched nothing - a wrong prune, a rename - would make this gate decorative in
# the one way it could not be noticed. The floor is *optional* and only the test sets it, because a
# check that cannot run against a three-file fixture cannot be tested; run on this repository, where
# there are 158 files, it asserts a real number.
#
# Usage: check-licence-headers.sh [minimum-expected-files]
floor="${1:-1}"
[ "$count" -ge "$floor" ] || fail "found only $count source files, expected at least $floor; the find expression is probably wrong"

missing_spdx=()
missing_copyright=()
for file in "${sources[@]}"; do
  head -5 "$file" | grep -qF "$SPDX" || missing_spdx+=("${file#./}")
  head -5 "$file" | grep -qF "$COPYRIGHT" || missing_copyright+=("${file#./}")
done

report() {
  local label="$1"; shift
  local -n list="$1"
  if [ "${#list[@]}" -gt 0 ]; then
    echo "check-licence-headers: ${#list[@]} of $count files $label:" >&2
    printf '  %s\n' "${list[@]}" >&2
    return 1
  fi
  return 0
}

status=0
report "have no SPDX line" missing_spdx || status=1
report "have no copyright line" missing_copyright || status=1

if [ "$status" -ne 0 ]; then
  cat >&2 <<EOF

  The header every source file needs, as its first lines:

    // SPDX-License-Identifier: AGPL-3.0-or-later
    // Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
    // Licensed under the GNU Affero General Public License, version 3 or later.
    // See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
    // a port of.

  The SPDX line goes first because it is the line a tool reads. Add it to the file rather
  than to the first line of its doc comment: the comment explains the file, the header
  explains the licence, and a licence inside a comment about something else is one refactor
  away from being deleted.
EOF
  exit 1
fi

exit 0