# Adding a level

This port reads the same `.ld` files the original does, so **a level you write for Cuyo
is a level this port can load, unchanged.** There is no second format and no conversion
step. If it works in upstream Cuyo it works here.

Two things differ from the original, and both are about this repository rather than
about the game. Read those before you start.

## Where level files live

Upstream's own levels are **not committed here**. They live in a local-only checkout at
`.context/upstream-cuyo/data/`, fetched by `make corpus`, because they are GPL-2.0 content
and this repository ships none of it. `make corpus` fetches and checksum-verifies
upstream 2.1.0; see the README for why that is not a `git clone`.

So there are two kinds of contribution, and they land in different places.

### A level for everyone to play

Put it in **`public/levels/`**, and add it to the catalogue.

`public/levels/` is generated — `make level-data` recreates it from the upstream
checkout — so a file committed there survives only until the next run. That is fine for
testing a level locally, and wrong for contributing one. For that, see below.

### A level offered to this project

Add it under **`levels/`** — a new directory, tracked in git — and open a pull request.

`levels/` holds _your_ levels, under the same licence as the rest of this repository. The
build reads both: `levels/` for contributed levels and the upstream checkout for the
original 79. Nothing else changes.

## The format

The authoritative reference is upstream's own documentation, which ships with the source:

```sh
man .context/upstream-cuyo/docs/cuyo.6      # the .ld format, the whole language
man .context/upstream-cuyo/docs/cual.6      # the scripting language
```

This port also carries a prose spec at
[`openspec/changes/cuyo-web/specs/level-format`](../openspec/changes/cuyo-web/specs/level-format),
which is written for someone implementing a parser rather than someone writing a level.
Start with the man page; use the spec when you want to know what this port does with a
detail.

### The shape of a minimal level

```text
MyLevel={
  name="My Level"
  author="Your Name"
  numexplode=4
  pics=inGruen,inGelb,inSchwarz,inRosaNasen
  greypic=inGrau
  startpic=inGras
  emptypic=leer
  startdist=".........."
}
```

That is a real, playable level: ten empty cells, no blobs, so nothing to clear. From
there:

- `numexplode=4` — how many same-colour blobs must touch before they detonate. Most
  levels use 4; `numexplode[1]=6` makes version 1 harder, which is how upstream does
  difficulty.
- `pics` — the colour kinds, comma-separated, **no `.xpm` extension**. Reusing a name
  that already exists is fine and often what you want: two kinds sharing a picture
  render identically. The same picture may be repeated — upstream does it constantly —
  and a `*` multiplier is the idiomatic way to express it.
- `greypic`, `startpic`, `emptypic` — the grey, goal and empty pictures. `startpic` is
  the goal blob: clear them all to win.
- `startdist` — the starting board. One string per row, **top row first, aligned to the
  bottom**. Each row is exactly 10 or 20 characters:

  | Character                 | Meaning                                            |
  | ------------------------- | -------------------------------------------------- |
  | `.`                       | empty                                              |
  | `+`                       | a colour kind, at random by `colourprob`           |
  | `-`                       | a grey blob, at random by `greyprob`               |
  | `*`                       | a goal blob, at random by `goalprob`               |
  | `0`-`9`, `A`-`Z`, `a`-`z` | a specific kind and version, resolved by `distkey` |
  | `%`                       | an info blob carrying the connection mode          |
  | `&`                       | an info blob carrying whether `chaingrass` is set  |

  A row of 20 describes both players: the first 10 the left player's board, the second
  10 the right's. A row of 10 describes both. The last row may instead be 4 or 8
  characters, which is where those info blobs go.

  **`0`-`9`/`A`-`Z`/`a`-`z` are not positions in `pics`.** They are matched against each
  kind's `distkey`, ordered `0`–`9`, then `A`–`Z`, then `a`–`z`. The character picks the
  kind — the _largest_ `distkey` that does not sort after it — and the distance between
  them is the blob's `version`. So with `apple` at `distkey = "A"` and `orange` at
  `"O"`, `"C"` is an apple of version 2, `"N"` an apple of version 13, `"S"` an orange of
  version 4, and `"8"` denotes nothing at all and is an error.

  If a kind declares no `distkey`, it cannot be named this way — which is why almost
  every level uses `+` and `*` instead of spelling out cells.

- `neighbours` — how blobs connect. `0` is sides (the usual), `1` is diagonals only,
  `2`/`3` hex, `4` knight, `5` sides and diagonals. **This is the setting players get
  wrong most often**, and it is worth setting deliberately: a level that joins
  diagonally will not respond to a row of blobs.
- `chaingrass=1` — goal blobs need an explosion _next to_ them rather than forming their
  own group. Harder, and a common way to finish a level that has become too easy.
- `mirror=1` — play upside down.
- `bgcolor=255,255,255`, `topcolor=200,200,200`, `toptime=50` — the board's colours and
  how fast the chase border descends.

### Cual blocks

A level can carry a `<< … >>` Cual block that runs its own rules per blob. About twenty
upstream levels do. **This port does not execute Cual yet** — the runtime is planned but
not written, so a level using it loads and then plays by the ordinary rules, which is
subtly wrong rather than obviously broken.

So: **please avoid Cual in contributed levels for now.** Ordinary levels are fully
supported and there are 79 of them to learn from. This is stated plainly because
submitting a Cual level would look like it works and quietly not.

## Artwork

Picture names are **logical keys, not file paths**. Nothing is looked up on disk: the
build generates a manifest of every key the bundled levels reference
(`levels-src/generated/art-manifest.ts`) and the renderer draws each one procedurally.

That means a contributed level works with artwork you have not drawn — but it also means
your level will not look like upstream's. Two kinds that share a name share a colour; two
different names may come out too similar to tell apart at cell size.

That gap is the current work item on the roadmap. If you contribute a level with
specific artwork needs, say so in the pull request and it will be taken into account.

## Adding your level to the catalogue

The catalogue comes from a generated index, so a level that is not in the source data is
not listed. To add one:

1. Put the file in `levels/`.
2. Add a section to it in `levels-src/` — specifically, add the level's `filename` to the
   list the index generator reads.

Then:

```sh
make level-index     # regenerate the catalogue from the level files
make check           # validates every level, and fails on the first error
```

`make check` is the real test. It parses and compiles every level in the catalogue for
every supported version and both halves of a two-player `startdist`, and it is the same
thing CI runs. A level that loads and looks wrong in a browser but passes here means a
bug in this port, not in your level — please report it.

## What a good contribution looks like

- **Plays.** Clearable, winnable, and not trivially so. `numexplode` and `startdist` are
  where most of the design lives.
- **Says what makes it different.** `description` is shown on the level's card, and for a
  level that breaks a convention — diagonals, hex, mirrored — it is the only place a
  player learns why.
- **Credits itself.** `author` is displayed.
- **Avoids Cual**, for the reason above.
- **Names reused pictures rather than inventing new ones** where the colour already fits.
  There are 226 keys in use; most are variations on a handful of ideas.

## Licence

Contributed levels are part of this repository and are covered by
[GPL-2.0-or-later](../LICENSE-OR-LATER.md), the same as everything else here. By opening
a pull request you are agreeing to that.

If your level is derived from an upstream level, say so in the pull request and name it.
Upstream is GPL-2.0-or-later by Immanuel Halupczok, so derivation is fine — it just has
to be recorded in [ATTRIBUTION.md](../ATTRIBUTION.md).

## Checklist

```sh
make level-index
make check
make dev            # play it
```

- [ ] Loads and plays
- [ ] Winnable, and not trivially
- [ ] `description` explains anything unusual about it
- [ ] `author` filled in
- [ ] No Cual block
- [ ] Licence is GPL-2.0-or-later, or derivation from an upstream level is declared
