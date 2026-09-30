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

```
engine/       headless simulation — game-core, level-format, cual-runtime
app/          React shell: screens, navigation, input, game loop
render/       canvas renderer, art atlas and compositor, effects
levels-src/   build-time only: validates the level set, emits index + art keys
openspec/     planning artifacts (proposal, specs, design, tasks)
.agents/      skills, workflows and engineering standards — single source of truth
.context/     local-only, not in git: upstream source, AI memory, notes, plans
```

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
does not ship). The level corpus tests read it, and `npm run build` will need it,
so on a fresh clone:

```sh
git clone git@github.com:sebastiankruk/cuyo-web.git
cd cuyo-web
git clone https://github.com/immi/cuyo.git .context/upstream-cuyo   # tag 2.1.0
```

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
npm install
npm run dev        # dev server
npm test           # engine tests (Node environment)
npm run lint       # ESLint, including the engine/ boundary rule
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production bundle
```

## Requirements

Node 22 or newer.
