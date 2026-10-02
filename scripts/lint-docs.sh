#!/usr/bin/env bash
# Lint the project's markdown, quietly under CUYO_AI_MODE=1.
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
# markdownlint-cli2 has no quiet flag and prints three lines of header on every
# run - its own version, the resolved glob list, and the file count - none of
# which changes between runs and all of which costs tokens on every `make lint`.
# The failures themselves, the summary line and the exit status are what matter,
# and all three are kept.
#
# The glob list is deliberately long. It is the set of files this project
# considers documentation, and .markdownlint-cli2.jsonc holds the exclusions
# instead - so `make lint-docs`, CI and an editor all read one list.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1

FILTER='^(markdownlint-cli2 v|Finding: |Linting: )'

if [ "${CUYO_AI_MODE:-}" = "1" ]; then
  npx --loglevel=error markdownlint-cli2 "**/*.md" 2>&1 | grep -vE "$FILTER"
  # PIPESTATUS, not `$?`: the exit status an agent acts on is the linter's, not
  # grep's. grep returns 1 when it filters everything away, which is exactly what
  # a clean run in AI mode looks like, so reading `$?` here would report a clean
  # tree as broken.
  exit "${PIPESTATUS[0]}"
else
  npx markdownlint-cli2 "**/*.md"
fi