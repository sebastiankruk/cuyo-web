# Roadmap

Where the project is, what is next, and why in that order. Task-level detail lives in
`openspec/changes/cuyo-web/tasks.md`; this is the shape of the remaining work and the
reasoning behind the sequence.

## Where we are

57 of 152 tasks. Two groups are done, and the difference matters:

| Group           |       | What it means                                                       |
| --------------- | ----- | ------------------------------------------------------------------- |
| 1. Toolchain    | done  | Node, TypeScript, `make check` as the single gate, CI.              |
| 2. Level format | done  | The `.ld` language, parsed and compiled against all 79 real levels. |
| 5. Game core    | 19/20 | The rules: falling, connections, explosions, greys, border.         |
| 14. Lint and CI | 15/20 | Code, docs, shell and spec linting; eight CI jobs.                  |
| 13. Coverage    | 3/8   | Some of it; thresholds and DOM tests outstanding.                   |

Everything else is untouched: 3 and 4 (the Cual runtime), 6 (catalogue), 7
(presentation), 8 (art), 9 (shell), 10 (mobile), 11 (PWA), 12 (verification).

**0.2.0 is cut and playable.** All 79 levels, real rules, playable on a phone. That is
the honest description of where this is: not a game yet, but the game underneath one.

**0.3.0 is in progress, and nearly done.** Colours are now assigned per level by
perceptual distance rather than hashed per picture name, so two kinds can no longer come
out the same colour. The rules are a dialog that pauses the game, so reading them is no
longer a way to lose a piece. The licence is AGPL-3.0-or-later, and the level files are
committed, so a fresh clone needs no fetch to build.

**Still to come in 0.3.0: progress and unlocking** (6.5, 6.6) — which levels you have
finished, best scores, the next level in a track unlocking. Without it every visit starts
from the catalogue with no memory, and that is the main thing that makes a game feel like a
game rather than a demo. It is also entirely testable and needs no visual decisions, which
makes it the obvious thing to pick up next.

**The level files are committed.** All 79, verbatim, in `levels/upstream/`. A fresh clone
builds, tests and plays with no fetch step, and five test files that used to skip
themselves on a fresh clone now run. The artwork stays generated, and the check that
enforces that now runs in CI too — it did not before, and the way that was found is
written up in `ATTRIBUTION.md`.

## Cutting a release

The convention, and the reason for it.

**Only a `release/*` branch merges to `main`, and that merge is the release.** Not a
convention this repository can enforce on its own — GitHub branch protection can require
pull requests, reviews and status checks, but it cannot restrict the _source_ branch's
name, and anyone who can open a pull request can choose it. So the rule is checked in
`.github/workflows/release.yml` instead: it looks up which pull request the commit came
on, and refuses to tag if the answer is not `release/*`.

That check is deliberately late. A status check that is red on every ordinary pull
request teaches you to ignore red checks, and the point of a gate is that red means
something. The release is the point where the mistake is expensive enough to be worth
stopping for.

**What counts as a release is the version changing, not the tag being missing.** The
workflow compares `package.json` against its parent commit and does nothing if the
version is the same, so an ordinary merge to `main` finishes green and untouched. The
alternative — keying on “has this version got a tag” — would be simpler and wrong here: no
version has ever been tagged, so it would read every merge, including the one that merges
the release workflow itself, as an attempt to release.

**The steps, in order:**

1. Work on a normal branch, as always. Merge it to `main` — that is not a release.
2. When there is something worth shipping, branch `main` as `release/X.Y.Z`.
3. In that branch, make the version real:
   - bump `version` in `package.json`
   - rename `## [Unreleased]` to `## [X.Y.Z]` in `CHANGELOG.md`, with the date
   - `make check-version` — it fails with the exact edit needed if either is missing
4. Merge `release/X.Y.Z` into `main`.
5. `release.yml` sees the version changed, checks the source branch, sees the tag does
   not exist, and creates `vX.Y.Z` and the GitHub release, with the changelog section as
   the notes.

**The version bump is not a formality, and that is the point.** Step 3 is two visible
edits that say what is being released. A release cut by bumping a version automatically,
with no other edit, is a release nobody decided to make — and this project's rule is that
versions are cut when the app is _worth using_, which is a judgement, not a schedule.

Re-running the release workflow is safe: it sees the tag exists and does nothing, so
fixing a typo in the notes afterwards is not a broken pipeline.

**Direct pushes that bump the version fail.** There is no pull request to check, and a
push that changes the version is exactly the one that would put a tag somewhere nobody
reviewed, so it is refused rather than assumed deliberate.

**Not enforced:** pushes to `main` that leave the version alone are not blocked — they
just do nothing. Blocking those needs branch protection on `main`, which needs repository
admin, so it is not configured from here.

## What decides the order

Two questions, asked of every candidate piece of work:

1. **Does it change what a player sees or does?** Anything they would notice outranks
   anything they would not.
2. **Can I check it without a human?** A change I can verify myself gets made now; one
   that needs your eyes goes in a pull request and waits.

The second question has been the more productive one. Almost every bug found so far came
from a screenshot or from running the real corpus, and almost every _wrong assumption_
of mine came from reasoning about upstream without reading it. Both are cheap to avoid
and expensive to discover late.

## Next, in order

Each item names the version it lands in. Versions are cut when the app is worth using,
not when a group of tasks closes - so an item can be finished and not yet released, and
a release can contain work from several groups.

### 1. Art that distinguishes kinds — _0.3.0_

The largest remaining gap between "working" and "playable". Artwork is generated from
each picture's name, so kinds are usually but not always distinguishable, and you
reported confusing one colour for another mid-game.

Not upstream's sprites: they are GPL-2.0 and `scripts/check-no-upstream-art.sh` fails
the build if one reaches `dist/`. So the work is a small authored set - a handful of
shapes and colours per role - plus a mapping from picture name to one of them, generated
like the rest.

Needs your eyes. This is the next thing to look at together.

### 2. The rules dialog as a modal (9.8, 10.12) — _0.3.0_

You asked for this: a centred dialog that pauses the game, in a smaller face than the
HUD. The rules panel is currently a dropdown that does not pause, so opening it mid-fall
is a way to lose a piece you were watching.

Small, well-specified, and I can build it without asking. Good first pull request.

### 3. Progress and unlocking (6.5, 6.6) — _0.3.0_

Which levels you have finished, best scores, and the next level in a track unlocking.
Without it every visit starts from the catalogue with no memory, which is the main thing
that makes a game feel like a game rather than a demo.

Straightforward, entirely testable, no visual decisions.

### 4. Cual runtime (groups 3 and 4) — _0.4.0_

The scripting language levels use for custom rules. `rollenspiel.ld` and about twenty
others ignore their Cual block and are therefore subtly wrong. This is the largest
single block of remaining work - 23 tasks - and it is the reason the port is not yet
complete rather than merely unpolished.

Sequenced late because it is the hardest to verify: the oracle is upstream's
interpreter, which cannot be built here, so correctness rests on tests written against
its source.

### 5. Menus, pause, settings (group 9) — _0.5.0_

Pause, settings for audio and reduced motion, the dev overlay. Depends on 6.5 for
anything worth storing.

### 6. Presentation (group 7) — _0.5.0_

The chase border's artwork, `toppic` and `topoverlap`; the next-piece preview; the
informational indicators; the time-bonus breakdown; text rendering with a bundled font.
Mostly visible polish, each item small.

### 7. Offline play (group 11) — _0.6.0_

A service worker and a precache list. Lowest priority of anything here: a game you play
on a phone with a tunnel already works, and installing it to play offline is a
convenience rather than a capability.

## Versions

Cut when the app is worth using, not when a group closes. What each one is _for_,
rather than what is in it:

| Version | For                                            | Contains                                       |
| ------- | ---------------------------------------------- | ---------------------------------------------- |
| 0.2.0   | _done_                                         | All 79 levels, real rules, playable on a phone |
| 0.3.0   | Looks like a game, and remembers you played it | 1, 2, 3                                        |
| 0.4.0   | Every upstream level, correctly                | 4                                              |
| 0.5.0   | A finished game                                | 5, 6                                           |
| 0.6.0   | Playable with no connection                    | 7                                              |

Minor versions fix and adjust. A version is not cut for a bugfix.

The versions are deliberately uneven. 0.3.0 is three small items, 0.4.0 is one large
one, and that reflects what each costs rather than a wish to ship evenly. What they share
is that each one leaves the app in a state worth playing: 0.4.0 is a big jump, but
without it about twenty levels are subtly wrong, and everything before it is already
worth having.

## Working practice

- Work on a branch, open a pull request, let CI run. `main` is always green and always
  something you could have handed to someone.
- A pull request that changes what the app looks like wants a screenshot from you before
  it lands. I cannot see a screen.
- One group of tasks per pull request where that is natural. A branch that mixes an art
  change with a parser fix cannot be reviewed in either direction.
