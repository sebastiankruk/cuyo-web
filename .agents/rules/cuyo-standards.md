# Cuyo Web — engineering standards

## What this project is

A browser reimplementation of [Cuyo](https://www.cuyo.de/), the abstract
falling-blob puzzle game by Immanuel Halupczok, playable on phones and tablets.
The upstream C++ source is the reference for the rules; it is not modified.

## Licence

**AGPL-3.0-or-later**, chosen by the project owner. Upstream Cuyo is
GPL-2.0-**or-later**, which is what makes combining them legal; it is not
compatible with GPL-2.0-**only**, so do not copy a v2-only notice into anything
here. This project reproduces Cuyo's game mechanics and reuses its `.ld` level
files, so upstream's attribution still applies. See `LICENSING.md` and
`ATTRIBUTION.md`.

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

`make` wraps the npm scripts and adds nothing but the AI mode, so `npm run …` is
always equivalent and neither has to be learned twice.

```sh
make check         # lint + test + build, exactly what CI runs
make dev-lan       # dev server reachable from a phone, not just loopback
make lint          # eslint, tsc, markdownlint, openspec validate --strict
make test          # engine + level-format tests
make build         # typecheck + production bundle
make corpus        # fetch the upstream tree the corpus tests read
make help          # everything else
```

Equivalents without make: `npm run lint`, `npm run lint:docs`,
`npm run lint:specs`, `npm run lint:shell`, `npm test`,
`npm run typecheck`, `npm run build`, `npm run fetch:corpus`.

Level corpus tests read `.context/upstream-cuyo/data`; override with
`CUYO_DATA_DIR`. If the upstream tree is absent they fail loudly rather than
skipping, because "the parser handles every real level" is the assertion and it
cannot be evaluated without them — so on a fresh clone run `make corpus` first.
`scripts/fetch-cuyo.sh` fetches it from Debian's archive pool. Upstream's
canonical home is GNU Savannah (`savannah.gnu.org/projects/cuyo/`, group 857,
registered 2001) and its official site is `karimmi.de/cuyo/` — but Savannah's
download area redirects the tarball to a generic index and the project is in CVS
with no public git mirror, so there is nothing to clone and nothing to download.
Debian's pool is the only place the artifact is both fetchable by a machine and
verifiable by a checksum. See ATTRIBUTION.md and the script's header.

### AiOps Environment Mode Directive

- **Always set `CUYO_AI_MODE=1`** before running make or npm commands. This
  project is worked on by an agent that pays for every line of tool output, and
  the flag exists for exactly that: `CUYO_AI_MODE=1 make check`,
  `CUYO_AI_MODE=1 make lint`, `CUYO_AI_MODE=1 make test`, `CUYO_AI_MODE=1 npm test`.
- **What it does**: drops the `echo` banners, the npm `notice` preamble, make's echo
  of its own command lines, and vite's build chatter. Measured: `make check` is 1868
  bytes with banners and 614 without, 52 lines against 18. `make test` alone is 484
  against 406.
- **What it must never do**: change what a command does, or hide a failure. Every
  target propagates its exit status unchanged, and `scripts/lint-docs.sh` reads
  `PIPESTATUS` rather than `$?` precisely so that a filtered-clean run is not
  reported as a broken one.
- **It does not touch the vitest reporter, on purpose.** Forcing a terser
  reporter is a regression: vitest's default already goes compact when stdout is
  not a TTY — 467 bytes for this suite — and the smallest forced choice,
  `--reporter=dot`, costs 1474 bytes because it prints a dot per test. The
  numbers are recorded in `vite.config.ts` so nobody re-adds it.
- Two CI jobs hold this honest: one asserts the terse output really is terse and
  one asserts the human-facing banners are still there. An agent-only path that
  nobody exercises rots silently.

### What CI gates

`.github/workflows/quality.yml` runs one job per gate so a failure names itself:
`lint` (eslint + tsc), `docs` (markdownlint), `shell` (pinned shellcheck),
`specs` (`openspec validate --strict --all`), `test`, `build` (including an
assertion that no upstream artwork reached `dist/`), and the two agent-mode jobs
above.

**Add a check to CI and to `make lint` in the same commit.** A gate that exists in
only one of the two is either dead weight or a surprise.

## OpenSpec

Planning lives in `openspec/`, in git, and is canonical. `.agents/` holds the
skills, workflows and these rules as the single source of truth; every other
tool directory (`.opencode/`, `.github/`, `.gemini/`, `.agent`) contains only
relative symlinks into it. Do not add a second copy of a skill or workflow.
