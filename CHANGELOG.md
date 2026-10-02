# Changelog

All notable changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semver](https://semver.org/) with a `0.` major: anything may change until 1.0.

Versions are cut when the app is worth _using_, not when a group of tasks closes.
A version's entry says what a player can now do, because "42 tasks done" is not
something a player can tell.

## [Unreleased]

### Changed

- **The licence is now AGPL-3.0-or-later**, was GPL-2.0-or-later. The AGPL is GPL plus
  one clause: a modified version of this program that you let other people use over a
  network has to offer them its source. Copies already released under GPL-2.0-or-later
  keep that grant permanently - it cannot be withdrawn - so this applies from the next
  version onwards. It is permitted because Cuyo is GPL-2.0-**or-later**; it would not be
  permitted against GPL-2.0-**only** material, so a patch offered under v2-only cannot be
  accepted. See [LICENSING.md](LICENSING.md).
- **The catalogue screen now carries a licence notice**, because AGPL section 5(d)
  requires one and plain GPL-2 did not: who holds the copyright, that the work is free
  software under the AGPL, that there is no warranty, where to read the licence, and a
  link to the source. That last one is also how this project honours section 13 for
  itself.
- **Every level in a board now has its own colour, chosen so that no two kinds in a level
  look the same.** Colours used to be derived from each picture's name, independently,
  which meant two kinds in one level could come out nearly identical — across the 79
  levels, 17 pairs were under 25° apart and the worst was 2°, in a level whose kinds are
  arrows. A palette is a set of colours for a level's kinds, so it is now chosen as one.
  You will see a level with six kinds change colour entirely, and the same six kinds look
  the same in every level, which they did not before.
- **Colours are picked by perceptual distance, not by hue.** Hue is one dimension and a
  level can have as many kinds as it likes. In the 14-colour level, spreading hue evenly
  still left two kinds 13° apart — which sounds fine and is not: measured as colour
  difference, those two are 6.5 ΔE, and nobody can tell them apart. Colours are now
  chosen to be as far apart as possible in CIELAB, which for that level gives 38.6.
  Dark-background levels get their own set, chosen to be visible against the board.
- **Levels with more than about forty colours are still hard to read, and the game says so
  rather than pretending.** Two of the 79 have more: one with 42 and one with **153**.
  Colour cannot separate 153 things — that needs distinct shapes, which is the next piece
  of work on the roadmap. Every other level is verified to keep its kinds at least 20 ΔE
  apart, which is a difference you can see at cell size.
- **The blobs that say "clear me" and the ones that say "grey" are marked with a mark
  again, rather than being mostly mark.** The mark was 91% as wide as the blob it sat
  on, so a row of goal blobs read as a row of white circles in green pills. The shape
  still distinguished goal from grey, so nothing looked broken — it just stopped looking
  like a marked blob, which is the whole point of the mark. It is now 43% of the blob.
- **The shading on every blob — the highlight along the top, the seam between touching
  blobs — now weighs the same whatever colour it is on.** The darkening was a fixed step
  rather than a fraction of the way to the darker end, so a dark blob got a seam that
  was effectively invisible (ΔE 1 against its own fill) and a pale one got a heavy black
  line (ΔE 22). Both are now a steady weight. You will see the seams on dark blobs
  clearly for the first time, and the highlights on pale blobs will be gentler.
- **The mark is now dark on a pale blob and light on a dark one**, whichever gives more
  contrast, instead of always being near-white. On the palest grey the mark was ΔE 14
  from the blob it sat on — at six pixels across, not something to rely on. It is ΔE 30
  or better on every colour the game draws.
- **The colours are now chosen to be clear of the goal and grey colours too, not only
  clear of each other.** The goal colour is a fixed green, and the ordinary colours used
  to be chosen without reference to it and then have it dropped in beside them. Whether
  you could tell a goal blob from an ordinary one was therefore luck: in _Frightened
  balls_ the goal green sat ΔE 10 from an ordinary kind — close to the same colour. The
  ordinary colours now avoid it, and that level's is ΔE 40.

### Fixed

- **The "How to play" rules opened off the left edge of the screen**, so every line of
  them lost its first few characters and the first word of the panel was cut in half. It
  was positioned relative to the button that opens it, which sits a couple of hundred
  pixels from the left of a phone screen, while the panel is up to 20rem wide — so it
  began about 30px off-screen and the play area's own clipping finished the job. It is
  now positioned against the screen, centred, inset from both edges, and scrolls if it is
  taller than the space under the bar. Narrower phones were worse, not better.
- **The level's name was missing from the play screen on a phone.** It had been hidden to
  make room for the score, which is exactly the screen where you want to know which level
  you are in. It now truncates with an ellipsis, the author drops first, and the "How to
  play" button becomes a `?` because the words did not fit.
- **Swiping rotated the piece.** Touching the board rotated it, and so did every swipe,
  because the gesture decoder was asked what to do with the tiny `pointermove` events a
  browser sends the instant a finger lands, and it answered "rotate" — a short press _is_
  a tap. A tap now turns the piece exactly once, decided when you lift your finger, and a
  swipe steers. An upward flick also rotates, since a piece cannot rise and there is
  nothing else that gesture could mean.
- `make check` was red on `main` for a reason unrelated to any change: `openspec` was
  not a dependency, so `npx openspec` resolved from a global install locally and from
  nothing in CI. It is now pinned as a devDependency and invoked with `--no-install`, so
  the spec check can never quietly validate against a different version than the
  repository declares.

## [0.2.0] - 2026-10-01

The first version that plays the real game.

### Playable

- All 79 upstream levels, from the catalogue in `summary.ld`, grouped by track with
  Standard first.
- A level's `.ld` file is fetched when it is chosen and cached for the session.
- Real rules: per-difficulty `numexplode`, `chaingrass`, neighbour modes, the chase
  border, greys and goal blobs.
- Start layouts are built from the level's own `startdist`, with upstream's
  neighbour-avoidance heuristic applied so a layout does not hand the player a free
  group on the first move.
- Explosions, chain reactions, gravity, grey spawning and the time bonus.

### Touch

- Drag the board to steer, one cell per cell width, following your finger and stopping
  at a wall.
- Tap to rotate.
- Drag down to drop.
- On-screen pads with delayed auto-repeat, for one-handed play.
- Chase border and board follow the visible viewport, so the browser's own bars never
  cover the bottom of the board.

### Readable

- Goal and grey blobs are marked on the board, as a dot and a square.
- A "How to play" panel states how the level connects, how many blobs detonate, and
  what has to be cleared. `Hormones` connects diagonally; that used to be invisible.
- Each level's own description is on its card.

### Known gaps

- Artwork is generated from each picture's name, not upstream's sprites. Kinds are
  usually distinguishable but are not always, and nothing looks like the original.
- `DreiD` needs a third board dimension and is listed but not playable. The catalogue
  says so rather than offering it.
- `UnterWasser` is in no track in `summary.ld` and so is unreachable from the upstream
  menu. It is listed.
- No menus, pause, settings, audio, progress saving or offline play.
- Levels with a Cual block (`rollenspiel.ld` and others) ignore it.

[Unreleased]: https://github.com/sebastiankruk/cuyo-web/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sebastiankruk/cuyo-web/releases/tag/v0.2.0
