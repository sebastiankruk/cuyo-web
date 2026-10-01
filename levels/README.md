# `levels/`

**Contributed levels, and any that replace a vendored one.** Tracked in git.

Upstream Cuyo's own 79 levels live in [`upstream/`](upstream/) in this same directory,
committed and byte-identical to upstream's. They are GPL-2.0-or-later and so is this
project, so shipping them costs 660 kB and saves a fresh clone a fetch.

**A file here with the same name as one in `upstream/` shadows it.** That is how you fix
an upstream level in place, without forking it under a new name — and the vendored
original stays verbatim, which is what `make check-levels-upstream` relies on.

| Directory   | Committed | What it is                                    |
| ----------- | --------- | --------------------------------------------- |
| `upstream/` | yes       | Upstream's 79 levels, verbatim. Do not edit.  |
| `.`         | yes       | New levels, and corrections to vendored ones. |

## How to add one

See [`docs/adding-levels.md`](../docs/adding-levels.md) — the format, the settings worth
setting deliberately, and the checklist. Upstream's own worked example is committed at
[`upstream/example.ld`](upstream/example.ld) and demonstrates every setting with
comments.

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

The two summaries are parsed separately and then merged — not concatenated and scanned.
Concatenating looks equivalent and is not: `level[track]` lists are found by their body,
so two files' lists would be indistinguishable.

## Two things to know before you write one

- **Picture names are logical keys, not file paths.** Nothing is read from disk. The build
  generates a manifest of every key the levels reference and the renderer draws each one
  procedurally, so a level works without artwork you have not drawn. Colours come from a
  palette built per level, so two kinds in one level are always far enough apart in hue
  to tell apart at cell size — naming the same picture twice gives you the same colour,
  which is occasionally what you want and usually is not.
- **Cual blocks are not executed yet.** A level using one loads and then plays by the
  ordinary rules, which is subtly wrong rather than obviously broken. Please avoid Cual
  in contributions until the runtime lands.

## Licence

Contributed levels are covered by [GPL-2.0-or-later](../LICENSE-OR-LATER.md), the same as
the rest of this repository. If yours derives from an upstream level, say so in the pull
request and name it — upstream is GPL-2.0-or-later by Immanuel Halupczok, so derivation
is fine, it just has to be recorded in [ATTRIBUTION.md](../ATTRIBUTION.md).
