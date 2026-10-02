# AGENTS.md

Working notes for agents on this repository. Facts that are easy to get wrong, or
that are expensive to rediscover, live here rather than in someone's memory.

## Restarting the dev server disconnects open tabs

Vite pushes updates over a websocket, and killing and restarting the server drops it.
An open tab does not notice, does not reconnect, and does not reload: it keeps showing
whatever it loaded when the connection was live. So a screenshot can be several commits
old while the server is serving the current code, and "it looks the same as before" then
means the tab, not the fix.

The dev overlay's right-hand text now carries the commit and a `*` for a dirty tree, so
any screenshot says which build produced it. **Read it before believing a visual
report.** If it does not match, the answer is a reload, not a diagnosis.

## Screenshots of the running app

Screenshots are a regular part of reviewing this project, because a browser canvas
is the one part of it that tests cannot fully substitute for. The user drops them in
`~/Downloads/cuyo/` and expects them to be read.

Do not guess what an image shows. Every visual bug in this project so far was found
from a screenshot that said something specific ("paper with lines and one sprite in
the upper left corner"), and reasoning from a description without looking would have
been wrong twice.

## Merging your own pull request

`gh pr merge <n> --squash --delete-branch --admin`, once the checks are green. The
`--admin` is not optional: `main` sits behind a ruleset whose `pull_request` rule
asks for one approving review, GitHub does not count a self-review, and a plain
merge comes back `BLOCKED` / `REVIEW_REQUIRED` with the message "the base branch
policy prohibits the merge".

The obvious alternative - adding a bypass actor so self-merging is not a bypass -
is not available. `bypass_actors` cannot name an individual user at all (only a
role, team, app or org admin), and both `PATCH` and `PUT` on the ruleset return
404 from this token, so the ruleset cannot be edited from here. `--admin` works
regardless, which is the whole of the answer.

Check the checks before merging rather than on a timer: `gh pr view <n> --json
statusCheckRollup`. Ten minutes of sleep is not a status.

## Getting onto a branch

**Create the branch immediately after pulling `main`, before editing anything.**
`git checkout main && git pull && <edit> && git commit` commits to `main`, and the
mistake has been made twice in one session. The recovery is mechanical - `git
branch <name>` at the commit, `git checkout main`, `git reset --hard
origin/main`, `git checkout <name>` - but it should not be needed.

`git branch --show-current` before committing is the check. Twice it was run
_after_ the commit, at push, which is too late to be useful.

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

## Versions and branches

- Work on a branch and open a pull request. `main` is always green and always something
  the user could have handed to someone. `make check` is the gate and CI runs the same
  nine jobs.
- **A merge to `main` is not a release.** Only a `release/X.Y.Z` branch merges to `main`,
  and that merge is what creates the tag. GitHub cannot enforce this — branch protection
  can require pull requests, reviews and status checks, but not the source branch's name
  — so `release.yml` looks up the commit's pull request and refuses to tag if the head
  branch is not `release/*`. A merge is only treated as a release when it changed the
  version, so ordinary merges finish green and untouched. Cutting it also means renaming
  `## [Unreleased]` to `## [X.Y.Z]` and bumping `package.json`; `make check-version`
  fails with the exact edit if either is missing. Full procedure in `docs/roadmap.md`.
- Versions follow semver with a `0.` major, and are cut when the app is worth _using_
  rather than when a group of tasks closes. `CHANGELOG.md` says what a player can do in
  each version, because "42 tasks done" is not something a player can tell.
- `docs/roadmap.md` holds the sequence and the reasoning. Read it before choosing what
  to work on; the ordering rule is "changes what a player sees or does" first, then
  "can it be verified without a human".
- A pull request that changes what the app looks like needs a screenshot from the user
  before it lands. See the honesty rule above.

## Commands

- `make check` is what CI runs, and what to run before claiming something works.
- `CUYO_AI_MODE=1 make check` strips banners and echoes for terser output.
- `make check-levels-upstream` diffs the committed level files against a fetched
  upstream tree, so "byte-identical to upstream" stays a checked claim. Needs
  `make fetch-corpus` once; skips with a message otherwise, and is deliberately not
  in `make check` because CI has no upstream tree.
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
