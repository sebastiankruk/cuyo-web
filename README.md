# Cuyo — web

A browser reimplementation of [Cuyo](https://www.cuyo.de/), the abstract
falling-blob puzzle game by Immanuel Halupczok, built to be played on phones and
tablets.

Cuyo 2.1.0 (2014) needs SDL 1.2 and a 2014-era autotools toolchain, so it no
longer runs on current systems. This port reproduces the original rules and
levels with a modern, mobile-first interface.

**Licence:** GPL-2.0-or-later. This reuses Cuyo's game mechanics and its `.ld`
level files, so the same licence applies. See
[LICENSE-OR-LATER.md](LICENSE-OR-LATER.md) and [ATTRIBUTION.md](ATTRIBUTION.md).

## Layout

```text
engine/       headless simulation — game-core, level-format, cual-runtime
app/          React shell: screens, navigation, input, game loop
render/       canvas renderer, art atlas and compositor, effects
levels-src/   build-time only: validates the level set, emits index + art keys
scripts/      shell tooling: corpus fetch, doc lint, artwork assertion
openspec/     planning artifacts (proposal, specs, design, tasks)
.agents/      skills, workflows and engineering standards — single source of truth
.context/     local-only, not in git: upstream source, AI memory, notes, plans
```

`Makefile` wraps the npm scripts and adds the agent output mode; `npm run …` is
always equivalent.

`engine/` must run in plain Node with no host globals, so that every rule can be
tested without a browser. This is enforced by `eslint.config.js`, not merely by
convention — see [`.agents/rules/cuyo-standards.md`](.agents/rules/cuyo-standards.md).

Cuyo's picture names in `.ld` files are treated as *logical art keys*, not file
paths, and are resolved through an art-key manifest. The artwork is entirely new;
the original spritesheets are not shipped.

### `.agents` and its symlinks

`.agents/` holds the canonical content. Every other tool directory — `.opencode/`,
`.github/`, `.gemini/`, `.agent` — contains only **relative symlinks** into it, so
there is exactly one copy of each skill, workflow and rule. Do not add a second
copy.

### `.context` and the upstream source

The original Cuyo tree lives in `.context/upstream-cuyo/` and is **not** committed
(it is 11 MB of GPL content, 6 MB of which is artwork this project deliberately
does not ship). The level corpus tests read it, and the build will need it, so on
a fresh clone:

```sh
git clone git@github.com:sebastiankruk/cuyo-web.git
cd cuyo-web
npm install
make corpus          # fetches and checksum-verifies upstream 2.1.0
```

`make corpus` is not a `git clone` because there is nothing to clone. Cuyo's own
site — `cuyo.de` — is a parked domain, and no public upstream repository exists.
Debian has packaged whose 2.1.0, and its original tarball sits in the archive
pool at a URL Debian never moves: `scripts/fetch-cuyo.sh` fetches it, checks the
size and the SHA-256 from Debian's own `cuyo_2.1.0-2.1.dsc`, and unpacks it.

That this is the same tree as the one checked out here is not assumed. All 1233
files of the Debian tarball were compared against it with `diff -rq` and are
byte-identical — including `data/`, `src/` and `docs/`, which is the whole basis
for calling the transcriptions faithful.

Set `CUYO_DATA_DIR` to point elsewhere. The corpus tests fail loudly when the
upstream tree is absent rather than skipping, because "the parser handles every
real level" is the assertion and cannot be evaluated without it.

| Artifact | Contents |
| --- | --- |
| `proposal.md` | Motivation, scope, licensing |
| `specs/game-core` | The headless simulation |
| `specs/level-format` | The `.ld` level description format |
| `specs/cual-runtime` | Cual, the per-blob scripting language |
| `specs/level-catalog` | Level tracks, difficulty, progress |
| `specs/presentation` | Canvas rendering and art |
| `specs/mobile-experience` | Touch input, PWA, persistence |
| `design.md` | Architecture decisions and rationale |
| `tasks.md` | Implementation tasks |

## Status

Under construction. The plan lives in [`openspec/changes/cuyo-web`](openspec/changes/cuyo-web):

| Artifact | Contents |
| --- | --- |
| `proposal.md` | Motivation, scope, licensing |
| `specs/game-core` | The headless simulation |
| `specs/level-format` | The `.ld` level description format |
| `specs/cual-runtime` | Cual, the per-blob scripting language |
| `specs/level-catalog` | Level tracks, difficulty, progress |
| `specs/presentation` | Canvas rendering and art |
| `specs/mobile-experience` | Touch input, PWA, persistence |
| `design.md` | Architecture decisions and rationale |
| `tasks.md` | Implementation tasks |

## Development

```sh
make init          # npm install
make corpus        # fetch the upstream tree (once; see above)
make dev           # dev server
make check         # lint + test + build — exactly what CI runs
```

Individual gates:

```sh
make lint          # eslint, tsc, markdownlint, openspec validate --strict
make lint-code     # ESLint, including the engine/ boundary rule
make lint-types    # tsc --noEmit
make lint-docs     # markdownlint over the hand-written docs
make lint-specs    # openspec validate --strict --all
make lint-shell    # shellcheck over scripts/
make test          # engine + level-format tests, Node environment
make build         # typecheck + production bundle
make help          # everything else
```

`make` is a thin wrapper — every target runs one npm script, so `npm run lint`,
`npm test` and `npm run build` are equivalent and neither way has to be learned
twice. What the Makefile adds is `CUYO_AI_MODE`.

### Agent output mode

This project is worked on by an agent that pays for every line of tool output, so
`CUYO_AI_MODE=1` trims what the commands print:

```sh
CUYO_AI_MODE=1 make check
```

It drops the `echo` banners, npm's `notice` preamble, make's echo of its own
command lines, and vite's build chatter. Measured on this tree: `make check` goes
from 1868 bytes in 52 lines to 614 in 18. Exit statuses and failure output are
untouched — `--logLevel warn` was checked by breaking the bundle graph and
confirming the error and its stack still print, because a terse failure that hid
the cause would cost far more than the tokens it saves. Two CI jobs hold this
honest, one asserting the terse output really is terse and one asserting the
human-facing banners are still there.

It deliberately does *not* force a vitest reporter. Vitest's default already goes
compact when stdout is not a terminal — 467 bytes for this suite, against 55 kB
for `--reporter=verbose` — and forcing `--reporter=dot` makes it *larger*, at
1474 bytes, because it prints a dot per test. The measurements are recorded in
`vite.config.ts`.

### Continuous integration

`.github/workflows/quality.yml` runs one job per gate, so a failure names itself:

| Job | Gate |
| --- | --- |
| `lint` | ESLint (including the `engine/` boundary rule) and `tsc --noEmit` |
| `docs` | markdownlint over the hand-written docs |
| `shell` | shellcheck, pinned to 0.10.0 |
| `specs` | `openspec validate --strict --all` |
| `test` | vitest, with the upstream corpus fetched first |
| `build` | production bundle, plus an assertion that no upstream artwork reached `dist/` |
| `agent-mode` | runs the gates with `CUYO_AI_MODE=1` and asserts the output is terse |
| `human-mode` | asserts the banners are still there |

The corpus fetch is a real step rather than an assumption: the tests fail loudly
without it, so a `test` job that skipped it would fail for a reason unrelated to
the change under test.

## Requirements

Node 22 or newer.
