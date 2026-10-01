# AGENTS.md

Working notes for agents on this repository. Facts that are easy to get wrong, or
that are expensive to rediscover, live here rather than in someone's memory.

## Screenshots of the running app

Screenshots are a regular part of reviewing this project, because a browser canvas
is the one part of it that tests cannot fully substitute for. The user drops them in
`~/Downloads/cuyo/` and expects them to be read.

Do not guess what an image shows. Every visual bug in this project so far was found
from a screenshot that said something specific ("paper with lines and one sprite in
the upper left corner"), and reasoning from a description without looking would have
been wrong twice.

## The dev server and its tunnel

- The app is served on **port 5173** (`make dev`) and served from `dist/` on **4173**
  (`make build && make preview`). Both are declared as `PORT` / `PREVIEW_PORT` at the
  top of the `Makefile` and passed with `--strictPort`.
- The public hostname is **`dev-cuyo.kruk.me`**, served through a Cloudflare tunnel
  that runs outside this repository. Vite's DNS-rebinding guard is on, so that
  hostname is allowed **by name** in `vite.config.ts` - not by setting
  `host: true`. If the hostname changes, that list and `docs/tunnel-dev.md` are the
  only two places in the repository that need to change.
- The tunnel's ingress config and the DNS record live in the user's Cloudflare
  account, not here.

## Commands

- `make check` is what CI runs, and what to run before claiming something works.
- `CUYO_AI_MODE=1 make check` strips banners and echoes for terser output.
- `make corpus` runs the level-file corpus oracle for the parser.
- `npx openspec validate --strict --all` for the change specs.

## What is actually playable

All 79 upstream levels, loaded at runtime. The catalogue comes from
`levels-src/generated/level-index.ts` and each level's `.ld` file is fetched on demand
from `public/levels/`, which `make level-data` copies from the local-only upstream tree.

Artwork is still **generated from the art key**, not upstream's sprites: see
`scripts/check-no-upstream-art.sh`. Menus, pause, settings, offline install and audio
are groups 9 and 11, none complete.

So a reviewer sees real levels playing, with placeholder colours.

## Testing that catches things

Canvas-free logic lives in pure functions on purpose (`render/geometry.ts`,
`app/gestures.ts`), because that is what makes it testable in plain Node. Two
recurring lessons, both learned the hard way here:

- **Assert positions, not counts.** A test that checked "26 fills happened, all
  inside the canvas" passed while every blob was drawn stacked in the corner.
- **Test the wiring, not just the parts.** Every explosion test called
  `finishExplosions()` by hand, so the fact that the step machine never called it
  went unnoticed - and the game froze permanently on the first detonation.
