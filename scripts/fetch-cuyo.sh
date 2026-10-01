#!/usr/bin/env bash
# Fetch the upstream Cuyo source tree the corpus tests read.
#
# Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
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
# Cuyo's canonical home is GNU Savannah: https://savannah.gnu.org/projects/cuyo/
# - group 857, registered 2001 by Immanuel Halupczok, non-GNU software and
# documentation, GPL v2 or later. Its official site is
# https://www.karimmi.de/cuyo/. That is where the credit belongs, and ATTRIBUTION.md
# records it.
#
# But the tarball is not retrievable from there. Savannah's download area
# redirects `download/cuyo/cuyo-2.1.0.tar.bz2` to a generic releases index rather
# than serving the file, and the project's version control is CVS with no public
# git mirror - so `git clone` has nothing to fetch and a CVS checkout needs a
# client this environment does not have. (`cuyo.de`, which older references
# give, is a parked domain and never was the project address.)
#
# Debian has packaged whose 2.1.0 since long enough that the original tarball
# sits in the archive pool, at a URL Debian does not move and has no reason to
# remove. That is the one place the artifact is both fetchable by a machine and
# verifiable by a checksum, which is what CI needs.
#
# That this is upstream's own 2.1.0 is not an assumption. The 1233 files of the
# Debian tarball were compared against the checked-out tree with `diff -rq` and
# are byte-identical, including data/, src/ and docs/. It is an `.orig.tar.gz`, so
# the comparison is against upstream's output and not against Debian's patched
# build. The SHA-256 below comes from Debian's own `cuyo_2.1.0-2.1.dsc` rather
# than being computed here, so the fetch is checked against something Debian
# published rather than against itself.
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
# `--max-filesize` rather than only checking the length afterwards: if the URL ever
# redirects somewhere unexpected - Savannah's download area redirects to a generic
# releases index, which is how this was found - curl aborts instead of spending a
# minute downloading the wrong thing before the size check rejects it.
curl -sSL --fail --max-time 300 --max-filesize "$CUYO_BYTES" \
  -o "$tmp/cuyo.tar.gz" "$CUYO_URL" \
  || die "download failed. Upstream's canonical homes are
       https://savannah.gnu.org/projects/cuyo/ and https://www.karimmi.de/cuyo/,
       but neither serves the tarball: Savannah's download area redirects to a
       generic index and the project's version control is CVS with no git mirror.
       If this URL has moved, fetch cuyo_2.1.0.orig.tar.gz from any Debian
       mirror by hand, verify it against the SHA-256 in this script, and unpack
       it into $TARGET."

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