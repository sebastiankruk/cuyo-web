# Cuyo — web

[![Latest Release](https://img.shields.io/github/v/release/sebastiankruk/cuyo-web?color=blue&label=version)](https://github.com/sebastiankruk/cuyo-web/releases)
[![CI Quality](https://github.com/sebastiankruk/cuyo-web/actions/workflows/quality.yml/badge.svg)](https://github.com/sebastiankruk/cuyo-web/actions/workflows/quality.yml)
[![License: GPL v2](https://img.shields.io/badge/License-GPL_v2-red.svg)](LICENSE-OR-LATER.md)
[![Node Version](https://img.shields.io/badge/Node-22%2B-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript Version](https://img.shields.io/badge/TypeScript-6-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite Version](https://img.shields.io/badge/Vite-8-646CFF.svg?logo=vite&logoColor=white)](https://vite.dev/)
[![React Version](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Vitest Version](https://img.shields.io/badge/Vitest-5-FCFF64.svg?logo=vitest&logoColor=black)](https://vitest.dev/)

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
levels/       contributed levels, tracked in git — see docs/adding-levels.md
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

Cuyo's picture names in `.ld` files are treated as _logical art keys_, not file
paths, and are resolved through an art-key manifest. The artwork is entirely new;
the original spritesheets are not shipped.

### `.agents` and its symlinks

`.agents/` holds the canonical content. Every other tool directory — `.opencode/`,
`.github/`, `.gemini/`, `.agent` — contains only **relative symlinks** into it, so
there is exactly one copy of each skill, workflow and rule. Do not add a second
copy.

### Levels, and where they come from

Upstream's 79 levels are **committed**, in `levels/upstream/`, byte-identical to
upstream's own copies. So a fresh clone builds, tests and plays with no fetch step at
all:

```sh
git clone git@github.com:sebastiankruk/cuyo-web.git
cd cuyo-web
npm install
make check
```

That is 660 kB of GPL text, which is the whole reason it is affordable. Upstream's
artwork is 6 MB and stays out — see below.

| Directory          | What it is                                                 |
| ------------------ | ---------------------------------------------------------- |
| `levels/upstream/` | Upstream's 79 levels, verbatim. Committed.                 |
| `levels/`          | Contributed levels, and any that _replace_ a vendored one. |

A contributed file of the same name shadows the vendored one, so a level can be
patched without forking it under a new name — and because they are in different
directories, `git log` shows the patch separately from the original. See
[levels/upstream/README.md](levels/upstream/README.md).

**Upstream's tree itself is not committed.** It is 11 MB, 6 MB of which is artwork
this project deliberately does not ship, and nothing needs it any more. It is worth
fetching for one reason — to prove the vendored levels are still upstream's:

```sh
make fetch-corpus          # fetches and checksum-verifies upstream 2.1.0
make check-levels-upstream  # diffs levels/upstream/ against it, both ways
```

`check-levels-upstream` is deliberately **not** in `make check`: CI has no upstream
tree, so a gate that can only ever skip in CI gives false confidence. It skips with a
message when there is nothing to compare against.

`fetch-cuyo` is not a `git clone` because there is no git to clone. Cuyo's canonical
home is [GNU Savannah](https://savannah.gnu.org/projects/cuyo/) — group 857, registered
2001 by Immanuel Halupczok — and its official site is
[karimmi.de/cuyo](https://www.karimmi.de/cuyo/). But Savannah's download area redirects
the tarball to a generic releases index rather than serving it, and the project is in CVS
with no public git mirror.

Debian has packaged whose 2.1.0, and its _original_ tarball sits in the archive pool at
a URL Debian does not move: `scripts/fetch-cuyo.sh` fetches that, checks the size and
the SHA-256 from Debian's own `cuyo_2.1.0-2.1.dsc`, and unpacks it.

That this is upstream's own 2.1.0 is verified rather than assumed. All 1233 files of the
Debian tarball were compared against the tree checked out here with `diff -rq` and are
byte-identical — `data/`, `src/` and `docs/` included — and being an `.orig.tar.gz` the
comparison is against upstream's output rather than Debian's patched build. That is the
whole basis for calling the transcriptions faithful. See
[ATTRIBUTION.md](ATTRIBUTION.md) for the full provenance.

Set `CUYO_DATA_DIR` to point the fetch and the comparison at a tree you already have.

| Artifact                  | Contents                              |
| ------------------------- | ------------------------------------- |
| `proposal.md`             | Motivation, scope, licensing          |
| `specs/game-core`         | The headless simulation               |
| `specs/level-format`      | The `.ld` level description format    |
| `specs/cual-runtime`      | Cual, the per-blob scripting language |
| `specs/level-catalog`     | Level tracks, difficulty, progress    |
| `specs/presentation`      | Canvas rendering and art              |
| `specs/mobile-experience` | Touch input, PWA, persistence         |
| `design.md`               | Architecture decisions and rationale  |
| `tasks.md`                | Implementation tasks                  |

## Status

Under construction. The plan lives in [`openspec/changes/cuyo-web`](openspec/changes/cuyo-web):

| Artifact                  | Contents                              |
| ------------------------- | ------------------------------------- |
| `proposal.md`             | Motivation, scope, licensing          |
| `specs/game-core`         | The headless simulation               |
| `specs/level-format`      | The `.ld` level description format    |
| `specs/cual-runtime`      | Cual, the per-blob scripting language |
| `specs/level-catalog`     | Level tracks, difficulty, progress    |
| `specs/presentation`      | Canvas rendering and art              |
| `specs/mobile-experience` | Touch input, PWA, persistence         |
| `design.md`               | Architecture decisions and rationale  |
| `tasks.md`                | Implementation tasks                  |

## Contributing a level

Upstream Cuyo's own 79 levels **are** committed, in
[`levels/upstream/`](levels/upstream/). **New levels go in [`levels/`](levels/)**, in the
same `.ld` format, and a file there shadows a vendored one of the same name — so you can
also correct an upstream level in place.

```text
levels/MyLevel.ld      your level
levels/summary.ld      indexes it: a section, and a level[track] entry
```

```sh
make level-index && make check && make dev
```

[`docs/adding-levels.md`](docs/adding-levels.md) has the format, the settings worth
setting deliberately, and what a good contribution looks like. In short: `neighbours`
is the one players get wrong most, picture names are logical keys rather than file
paths so you need no artwork, and **Cual blocks are not executed yet** — a level using
one would load and then quietly play by the ordinary rules.

## Development

```sh
make init          # npm install
make dev           # dev server on 5173, this machine only
make dev-lan       # dev server on 5173, reachable from a phone
make preview       # serve dist/ on 4173, as it would be deployed
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

It deliberately does _not_ force a vitest reporter. Vitest's default already goes
compact when stdout is not a terminal — 467 bytes for this suite, against 55 kB
for `--reporter=verbose` — and forcing `--reporter=dot` makes it _larger_, at
1474 bytes, because it prints a dot per test. The measurements are recorded in
`vite.config.ts`.

### Continuous integration

`.github/workflows/quality.yml` runs one job per gate, so a failure names itself:

| Job          | Gate                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| `lint`       | ESLint (including the `engine/` boundary rule) and `tsc --noEmit`             |
| `docs`       | markdownlint over the hand-written docs                                       |
| `shell`      | shellcheck, pinned to 0.10.0                                                  |
| `specs`      | `openspec validate --strict --all`                                            |
| `test`       | vitest, with the upstream corpus fetched first                                |
| `build`      | production bundle, plus an assertion that no upstream artwork reached `dist/` |
| `agent-mode` | runs the gates with `CUYO_AI_MODE=1` and asserts the output is terse          |
| `human-mode` | asserts the banners are still there                                           |

A Cloudflare tunnel should point at `http://localhost:5173`. Vite's DNS-rebinding
guard is on, so the tunnel's hostname is allowed by name in `vite.config.ts`
rather than by disabling the check — see
[`docs/tunnel-dev.md`](docs/tunnel-dev.md). The port comes from
`PORT` at the top of the `Makefile`, so there is one value to copy and one place to
change it — see [`docs/tunnel-dev.md`](docs/tunnel-dev.md), which also says what
you will and will not see.

The corpus fetch is a real step rather than an assumption: the tests fail loudly
without it, so a `test` job that skipped it would fail for a reason unrelated to
the change under test.

## Requirements

Node 22 or newer.
