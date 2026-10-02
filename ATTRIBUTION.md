# Attribution

Cuyo was written by **Immanuel Halupczok** and maintained by the **Cuyo
developers**. The upstream release this project is a port of is version **2.1.0**,
whose level files are committed verbatim in
[`levels/upstream/`](levels/upstream/) and whose complete source can be fetched,
unmodified, into `.context/upstream-cuyo/`.

## Where upstream lives

|                 |                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Project home    | <https://savannah.gnu.org/projects/cuyo/> — GNU Savannah, group 857, registered 5 December 2001, non-GNU software and documentation |
| Official site   | <https://www.karimmi.de/cuyo/>                                                                                                      |
| Version control | CVS, hosted on Savannah. There is no git repository and no public mirror of one.                                                    |
| Mailing list    | `cuyo@karimmi.de`                                                                                                                   |
| Licence         | GNU General Public License v2 or later, per the Savannah registration                                                               |

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

| Asset                            | Origin              | Licence                                                   | Where it is here                               |
| -------------------------------- | ------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Level description files (`*.ld`) | Cuyo 2.1.0, `data/` | GPL-2.0-or-later; per-file copyright headers in `AUTHORS` | `levels/upstream/`, committed verbatim         |
| Game rules and mechanics         | Cuyo 2.1.0, `src/`  | GPL-2.0-or-later                                          | Reimplemented, not copied                      |
| `docs/cual.6`, `docs/cuyo.6`     | Cuyo 2.1.0          | GPL-2.0-or-later                                          | Fetched with the source tree; read, not copied |

The level files are committed rather than fetched because they are
GPL-2.0-or-later and this project is too: 660 kB of text, against a build that
otherwise needs an archive-pool fetch before it can do anything.
`make check-levels-upstream` diffs the committed copy against a fetched upstream
tree in both directions, so "byte-identical to upstream" is a checked claim rather
than a remembered one.

The level data carries its own authorship: `AUTHORS` credits Immanuel Halupczok
for the artwork and the Cual code, and the developers named in the `ChangeLog`
and per-file headers for maintenance from 2002 onwards.

## What is *not* reused

The **912** XPM spritesheets in `data/pics/`, the `.it` music module, and the
original bitmap font are **not** part of this project. All artwork here is new
work authored for it.

This is a choice, not a legal necessity: upstream's artwork is GPL-2.0-or-later
and copying it would be permitted, exactly as copying the level files is. What it
would cost is 6 MB of someone else's pixels, and the thing that makes this project
worth having — that it is an independent reimplementation rather than a
repackaging. So the line drawn is between *the game's own text, which is the game*,
and *upstream's rendering of it, which this port replaces*.

A build assertion enforces it: `scripts/check-no-upstream-art.sh` compares a
SHA-256 of every bundled file against a SHA-256 of every upstream sprite —
decompressed as well as compressed — so renaming or re-compressing a sprite does
not get it past. Those 1749 digests are committed in
[`scripts/upstream-art-digests.sha256`](scripts/upstream-art-digests.sha256),
110 kB, so the check runs in CI.

They were originally computed from a fetched upstream tree instead, on the argument
that this way there was "no list to keep in step with upstream". That was wrong, and
worth recording: **CI has no upstream tree, so the content check never ran there.** The
gate reported *clean* with an upstream sprite sitting in `dist/`, in exactly the
configuration CI runs in. A digest list can go stale; a check that cannot run is not a
check.

## Documentation used as the specification

Behaviour was derived from the upstream sources and manual pages rather than by
diffing against a running original, because upstream cannot be built in this
environment: no SDL 1.2, no C++ compiler, no bison/flex. The manual pages contain
normative worked examples which are encoded as tests — see task group 12.

## This project

New code in this directory is authored for the Cuyo web port and is likewise
GPL-2.0-or-later. See [LICENSE-OR-LATER.md](LICENSE-OR-LATER.md).
