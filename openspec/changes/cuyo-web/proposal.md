## Why

Cuyo is a much-loved abstract falling-blob puzzle game, but version 2.1.0 (last
released 2014) is effectively unplayable on modern systems: it needs SDL 1.2 and a
2014-era autotools toolchain, neither of which is available on current Linux
distributions or mobile platforms. The source is the only remaining copy of the
game, and its content is far richer than what a single-player mode of a similar
modern game would offer - 48 levels in the "Standard" track and ~70 in "All",
each with bespoke rules, layouts and per-blob animations.

We want to make that game playable on phones and tablets again, with a modern
interface, while keeping the actual game - its rules, its levels and its
distinctive animation-driven behaviour - intact rather than approximating it.
Because levels are written in Cuyo Animation Language (Cual), a per-blob
scripting language, a faithful port has to include a Cual interpreter; otherwise
the levels would have to be rewritten and would lose their character.

## What Changes

- Add a browser-based reimplementation of the Cuyo game engine that reproduces the
  original mechanics exactly: 10x20 grid, two-blob falling piece with
  rotate/steer/soft-drop, kind-based connection rules (nine neighbour modes
  including hex), component-size explosions, grass/goal blobs, grey blobs from
  explosions and random drops, the descending chase border, chain reactions and
  the original scoring and win/loss conditions.
- Add a parser for the original `.ld` level description format, including its
  section structure, versioned (`[1]`, `[hard]`, `[main,easy]`, ...) definitions,
  kind declarations with the `*` multiplier, `distkey`/`version` handling and
  the `startdist` initial-layout encoding.
- Add a Cual interpreter (lexer, parser, bytecode tree-walking VM) supporting the
  language as documented in `docs/cual.6`: procedures, variables, scoped `[x=y]`
  blocks, `if`/`switch` with both arrow forms, comma-separated animation
  sequences, the `@`/`@@` foreign-variable access forms with begin/end-of-step
  snapshot semantics, neighbour-pattern expressions, `busy`, the draw commands
  `*` / `*@(...)` / `@(...) *`, and the event handlers (`init`, `turn`, `land`,
  `connect`, `row_up`/`row_down`, `key*`).
- Add the level catalog: the seven original level tracks, the three difficulty
  settings, and the version-selection rules that decide which variant of each
  definition applies.
- Add a single-player game with a modern mobile-first interface: full-screen
  canvas board, touch and gesture controls, an on-screen HUD (score, next piece,
  grey and grass counts, connection-mode indicator), level select with progress,
  pause, win/lose results, and settings.
- Add an installable, fully offline PWA; no server component is introduced.
- Ship a **new** visual identity for blobs, backgrounds and chrome rather than
  reusing the original 912 XPM spritesheets.

## Capabilities

### New Capabilities

- `game-core`: The headless game simulation - grid and blob state, the falling
  piece and its controls, connection/component computation, explosions and chain
  reactions, grass and grey mechanics, the descending border, the fixed-step
  loop, scoring, win/loss, and the deterministic RNG the whole simulation runs on.
- `level-format`: Parsing and semantic resolution of the original `.ld` level
  description format - sections, versioned definitions, kind lists and the `*`
  multiplier, colours, constants, startdist decoding, and level assembly.
- `cual-runtime`: The Cual animation/scripting language - syntax, evaluation
  semantics (including the step-boundary variable snapshots and the
  foreign-access forms), busyness, the draw commands, event dispatch, and the
  global/semiglobal blobs.
- `level-catalog`: The set of playable levels, the track and difficulty
  dimensions, version resolution across those dimensions, and per-level
  availability/unlock state.
- `presentation`: The canvas rendering pipeline - board layout, drawing the
  simulation state through Cual's draw commands, the new art set, animation and
  effects, HUD rendering, and text rendering.
- `mobile-experience`: Touch and gesture input, navigation between menus and
  game, the installable offline PWA shell, responsive layout across phone and
  tablet, accessibility options, and persistence of settings and progress.

### Modified Capabilities

None. This is a greenfield addition; the repository currently contains only the
original upstream Cuyo sources, which are not modified.

## Impact

- **New code, no upstream modification.** `cuyo-2.1.0/` stays untouched as the
  reference implementation and the source of the level files.
- **Licensing.** Cuyo is GPL-2.0-or-later and its level content, rules and
  artwork are derivative of it. This port reuses the original `.ld` level data
  and reproduces the original mechanics, so the new project must also be
  distributed under GPL-2.0-or-later with attribution to Immanuel Halupczok and
  the cuyo developers. The original spritesheets are *not* reused (new art), but
  the `.ld` files remain in scope of the upstream licence.
- **Stack.** TypeScript, Vite, React for menus/HUD, Canvas 2D for the board.
  No backend, no database, no network calls at runtime.
- **Content pipeline.** A build-time script reads `cuyo-2.1.0/data/*.ld` and
  produces a compiled level bundle, so level data ships as static JSON/TS rather
  than being parsed at startup.
- **Toolchain note.** The reference build was not reproduced: no C++ compiler,
  SDL 1.2 or bison/flex are available in this environment, so the original
  binary cannot be run side by side. Behaviour is instead reproduced from the
  sources and `docs/cual.6` / `docs/cuyo.6`, and verified with engine-level
  tests built from documented rules and expected outcomes.
