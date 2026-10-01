# `levels/`

**Contributed levels**, tracked in git.

Upstream Cuyo's own 79 levels are _not_ here. They are GPL-2.0 content this repository
deliberately does not commit; they live in a local-only checkout at
`.context/upstream-cuyo/data/`, fetched by `make corpus`. This directory is for levels
written for this project.

## How to add one

See [`docs/adding-levels.md`](../docs/adding-levels.md) — the format, the settings worth
setting deliberately, and the checklist.

The short version:

1. Write `MyLevel.ld` here, in the `.ld` format upstream uses.
2. Add it to `summary.ld` in this directory, with a `filename`, `name` and `author`, and
   list it under a `level[track]` entry so it appears in the catalogue.
3. `make level-index && make check && make dev`.

`make check` is the real test. It parses and compiles every level in the catalogue for
every supported version and both halves of a two-player `startdist`, and it is what CI
runs.

## Why `summary.ld` again

Because it is the format upstream already uses, and a contributor can copy an upstream
file and change its contents rather than learn a new one. A contributed level set is
indexed exactly as the original is: sections give identity and display names, and
`level[track]` lists give grouping and order.

## Two things to know before you write one

- **Picture names are logical keys, not file paths.** Nothing is read from disk. The build
  generates a manifest of every key the bundled levels reference and the renderer draws
  each one procedurally, so a level works without artwork you have not drawn. Two kinds
  sharing a name share a colour; two different names may come out too similar to tell
  apart at cell size. That gap is current work on the roadmap.
- **Cual blocks are not executed yet.** A level using one loads and then plays by the
  ordinary rules, which is subtly wrong rather than obviously broken. Please avoid Cual
  in contributions until the runtime lands.

## Licence

Contributed levels are covered by [GPL-2.0-or-later](../LICENSE-OR-LATER.md), the same as
the rest of this repository. If yours derives from an upstream level, say so in the pull
request and name it — upstream is GPL-2.0-or-later by Immanuel Halupczok, so derivation
is fine, it just has to be recorded in [ATTRIBUTION.md](../ATTRIBUTION.md).
