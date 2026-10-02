# Attribution

Cuyo was written by **Immanuel Halupczok** and maintained by the **Cuyo
developers**. The upstream release this project is a port of is version **2.1.0**,
whose complete source is present, unmodified, in `.context/upstream-cuyo/`.

## Where upstream lives

| | |
| --- | --- |
| Project home | <https://savannah.gnu.org/projects/cuyo/> — GNU Savannah, group 857, registered 5 December 2001, non-GNU software and documentation |
| Official site | <https://www.karimmi.de/cuyo/> |
| Version control | CVS, hosted on Savannah. There is no git repository and no public mirror of one. |
| Mailing list | `cuyo@karimmi.de` |
| Licence | GNU General Public License v2 or later, per the Savannah registration |

The Debian package `cuyo` (`2.1.0-2.1`, maintainer Emmanuel Arias) is the
provenance actually used here, because the tarball is the one artifact that can
still be fetched by a machine. Savannah's download area redirects to a generic
releases index rather than serving the tarball, and there is no CVS client in
this environment, so `scripts/fetch-cuyo.sh` fetches
`cuyo_2.1.0.orig.tar.gz` from Debian's archive pool and verifies it against the
size and SHA-256 in Debian's own `cuyo_2.1.0-2.1.dsc`.

That this is upstream's own 2.1.0 and not a repackaging is verified rather than
assumed: all **1233 files** of the Debian tarball were compared against the tree
in `.context/upstream-cuyo/` with `diff -rq` and are byte-identical — `data/`,
`src/`, `docs/` and the rest. Since it is an `.orig.tar.gz`, it also predates
Debian's patches, so the comparison is against upstream's output.

Note that `cuyo.de` — the domain in older references — is now a parked domain and
has nothing to do with the project. `karimmi.de` and Savannah are the live
addresses.

## What is reused

| Asset | Origin | Licence |
| --- | --- | --- |
| Level description files (`*.ld`) | Cuyo 2.1.0, `data/` | GPL-2.0-or-later; per-file copyright headers in `AUTHORS` |
| Game rules and mechanics | Cuyo 2.1.0, `src/` | GPL-2.0-or-later |
| `docs/cual.6`, `docs/cuyo.6` | Cuyo 2.1.0 | GPL-2.0-or-later |

The level data carries its own authorship: `AUTHORS` credits Immanuel Halupczok
for the artwork and the Cual code, and the developers named in the `ChangeLog`
and per-file headers for maintenance from 2002 onwards.

## What is *not* reused

The **912** XPM spritesheets in `data/pics/`, the `.it` music module, and the
original bitmap font are **not** part of this project. All artwork here is new
work authored for it.

A build assertion enforces that: `scripts/check-no-upstream-art.sh` compares a
SHA-256 of every bundled file against a SHA-256 of every upstream sprite —
decompressed as well as compressed — so renaming or re-compressing a sprite does
not get it past, and a new upstream sprite is covered the day it is added.

## Documentation used as the specification

Behaviour was derived from the upstream sources and manual pages rather than by
diffing against a running original, because upstream cannot be built in this
environment: no SDL 1.2, no C++ compiler, no bison/flex. The manual pages contain
normative worked examples which are encoded as tests — see task group 12.

## This project

New code in this directory is authored for the Cuyo web port and is licensed
**AGPL-3.0-or-later**, which is compatible with the GPL-2.0-or-later material
above because of its "or later" clause. It is *not* compatible with GPL-2.0-only
material, which is worth stating plainly: a patch offered under v2-only cannot be
included. See [LICENSING.md](LICENSING.md) for the compatibility argument, the
reason for choosing the AGPL over the GPL, and the note that copies already
distributed under GPL-2.0-or-later keep that grant permanently.
