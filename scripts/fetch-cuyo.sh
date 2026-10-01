#!/usr/bin/env bash
# Fetch the upstream Cuyo source tree the corpus tests read.
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
# The corpus tests in engine/level-format read `.context/upstream-cuyo/data` and
# fail loudly when it is absent, because "the parser handles every real level" is
# the assertion and cannot be evaluated without the real levels. That makes this
# script a prerequisite for `npm test`, not an optional extra - which in turn
# means CI has to be able to run it from a clean checkout.
#
# Where the tarball comes from, and why not a git clone:
#
# Cuyo's own home page is a parked domain and there is no public upstream
# repository to clone. The tree in `.context/upstream-cuyo` was placed there by
# hand. But Debian has packaged whose 2.1.0 since long enough that the original
# tarball sits in the archive pool, which is a stable, checksummed, indefinitely
# retained URL - exactly the properties a CI fetch needs and a project's own site
# no longer has.
#
# That this is the same tree is not an assumption. The 1233 files of the Debian
# tarball were compared against the checked-out tree with `diff -rq` and are
# byte-identical, including data/, src/ and docs/. The SHA-256 below is from
# Debian's own `cuyo_2.1.0-2.1.dsc`, not computed here, so the fetch is verified
# against something Debian signed rather than against itself.
#
# Licence: the upstream tree is GPL-2.0-or-later, the same as this project. See
# ATTRIBUTION.md. It is deliberately not committed - it is 11 MB of GPL content,
# 6 MB of which is artwork this project does not ship.
set -euo pipefail

# The URL, its expected SHA-256 and its size in bytes. All three come from
# Debian's .dsc. Override the URL to fetch from a mirror, but do not drop the
# checksum: it is the only thing making this a fetch of a *known* tarball.
CUYO_URL="${CUYO_URL:-https://deb.debian.org/debian/pool/main/c/cuyo/cuyo_2.1.0.orig.tar.gz}"
CUYO_SHA256="${CUYO_SHA256:-6c0809a59a2d236f15d8fbd68d61fb1465e51f6c327d7f7ae4db9f4e44dad89f}"
CUYO_BYTES="${CUYO_BYTES:-4251290}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT/.context/upstream-cuyo}"

# `set -e` plus an explicit message: a bare exit code tells an agent nothing about
# which of the four failure modes it hit.
die() { echo "fetch-cuyo: $*" >&2; exit 1; }

if [ -d "$TARGET/data" ]; then
  echo "fetch-cuyo: $TARGET already present"
  exit 0
fi

have() { command -v "$1" >/dev/null 2>&1; }
have curl   || die "curl is required"
have tar    || die "tar is required"
have sha256sum || have shasum || die "sha256sum or shasum is required"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "fetch-cuyo: downloading $CUYO_URL"
curl -sSL --fail --max-time 300 -o "$tmp/cuyo.tar.gz" "$CUYO_URL" \
  || die "download failed. Cuyo's own site (cuyo.de) is a parked domain and
       there is no public upstream repository to clone; if this URL has moved,
       fetch cuyo_2.1.0.orig.tar.gz from a Debian mirror by hand, verify it
       against the SHA-256 in this script, and unpack it into $TARGET."

actual_bytes="$(wc -c < "$tmp/cuyo.tar.gz" | tr -d ' ')"
[ "$actual_bytes" = "$CUYO_BYTES" ] \
  || die "size mismatch: expected $CUYO_BYTES bytes, got $actual_bytes"

if have sha256sum; then
  actual_sha="$(sha256sum "$tmp/cuyo.tar.gz" | cut -d' ' -f1)"
else
  actual_sha="$(shasum -a 256 "$tmp/cuyo.tar.gz" | cut -d' ' -f1)"
fi
[ "$actual_sha" = "$CUYO_SHA256" ] \
  || die "checksum mismatch: expected $CUYO_SHA256, got $actual_sha"

# The tarball's top-level directory is `cuyo-2.1.0/`, so strip one component and
# write straight into TARGET. `--strip-components=1` rather than a wildcard in
# the extraction path: a tarball from an untrusted source could otherwise name
# paths outside TARGET.
mkdir -p "$TARGET"
tar xzf "$tmp/cuyo.tar.gz" -C "$TARGET" --strip-components=1 \
  || die "extraction failed"

[ -d "$TARGET/data" ] || die "$TARGET/data is missing after extraction"

echo "fetch-cuyo: $TARGET ready ($(find "$TARGET" -type f | wc -l | tr -d ' ') files)"