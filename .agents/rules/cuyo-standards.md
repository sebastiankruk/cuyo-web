# Cuyo Web — engineering standards

## What this project is

A browser reimplementation of [Cuyo](https://www.cuyo.de/), the abstract
falling-blob puzzle game by Immanuel Halupczok, playable on phones and tablets.
The upstream C++ source is the reference for the rules; it is not modified.

## Licence

GPL-2.0-or-later, inherited from upstream. This project reproduces Cuyo's game
mechanics and reuses its `.ld` level files, so the same licence and attribution
apply. See `LICENSE-OR-LATER.md` and `ATTRIBUTION.md`.

The original spritesheets are **not** used. Artwork here is new. A build
assertion enforces that nothing from `.context/upstream-cuyo/data/pics` reaches
`dist/`.

## Architecture

Four packages, one deployable static app:

| Directory | Contents | May use DOM? |
| --- | --- | --- |
| `engine/` | Headless simulation: game rules, `.ld` format, Cual runtime | **No** |
| `render/` | Canvas renderer, art compositor, effects | Yes |
| `app/` | React shell, screens, input, game loop | Yes |
| `levels-src/` | Build-time only: validates levels, emits index and art keys | No |
| `.context/` | Local-only: upstream source, AI memory, notes. Not in git. | — |

### The engine boundary is a hard rule

`engine/` must run in plain Node with no host globals, so that every rule can be
tested without a browser. `eslint.config.js` rejects `window`, `document`,
`navigator`, `localStorage` and `Image` inside `engine/`. This is enforced, not
conventional — do not route around it with `@ts-ignore` or a cast.

## Fidelity is the point

Upstream **cannot be built or run** in this environment: no C++ compiler, no
SDL 1.2, no bison/flex. The man pages `cual.6` and `cuyo.6` plus the C++ sources
are therefore the specification, and tests are the only oracle. Pixel-exact
parity is not claimed; parity of *rules* is.

### Transcribe-against-source

Anything copied out of C++ is the highest-risk code in the project, because a
mistake does not crash — it makes a level play wrongly. Two rules follow:

1. **Cite the source.** Every transcribed constant and table carries the
   `src/file.cpp:function` line it came from.
2. **Test against the original representation, not against the port.** Encode
   upstream's own encoding and decode it the way the C++ does, so a transcription
   slip fails loudly.

The neighbour-offset tables are the worked example: the tests embed
`NachbarIterator::setXY`'s `bx`/`by` digit strings and decode them, rather than
restating the TypeScript arrays. This caught a real bug in the `hex4` table,
where offsets had `dy = ±1` where upstream has `0`.

### When a clean implementation would diverge

Reproduce the original even when it looks wrong, and say so in a comment. The
lexer keeps `0`/`1` as a distinct token and a single letter as a shorthand
because upstream's rule ordering does, even though both are more permissive
today.

## Testing

- Engine tests run in Node (`environment: "node"` in `vite.config.ts`) with no
  browser harness.
- `render/` keeps pure geometry, colour and layout maths free of canvas calls so
  it is unit-testable in Node; only `fill`/`stroke` touch a context. A canvas
  context in a Node test is a smell pointing at logic in the wrong place.
- Coverage floors are set per tier (see `design.md` decision 12) and are a
  ratchet: they may rise, never fall. A floor catches wholly untested files; it
  is not evidence that the interesting paths run.
- `tsc --noEmit` and `eslint` are real gates, not formalities. The impossible
  type comparison in the rotate logic was found by the compiler, not a test.

## Commands

```sh
npm run dev        # dev server
npm test           # engine + level-format tests
npm run lint       # ESLint, including the engine boundary rule
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle
```

Level corpus tests read `.context/upstream-cuyo/data`; override with
`CUYO_DATA_DIR`. If the upstream tree is absent they fail loudly rather than
skipping, because "the parser handles every real level" is the assertion and it
cannot be evaluated without them.

## OpenSpec

Planning lives in `openspec/`, in git, and is canonical. `.agents/` holds the
skills, workflows and these rules as the single source of truth; every other
tool directory (`.opencode/`, `.github/`, `.gemini/`, `.agent`) contains only
relative symlinks into it. Do not add a second copy of a skill or workflow.
