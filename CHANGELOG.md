# Changelog

All notable changes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[semver](https://semver.org/) with a `0.` major: anything may change until 1.0.

Versions are cut when the app is worth _using_, not when a group of tasks closes.
A version's entry says what a player can now do, because "42 tasks done" is not
something a player can tell.

## [Unreleased]

Nothing yet.

### Fixed

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
