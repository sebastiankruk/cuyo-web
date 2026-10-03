# Roadmap

Where the project is, what is next, and why in that order. Task-level detail lives in
`openspec/changes/cuyo-web/tasks.md`; this is the shape of the remaining work and the
reasoning behind the sequence.

## Where we are

106 of 173 tasks. Two groups are done, and the difference matters:

|                  Group |       | What it means                                                       |
| ---------------------- | ----- | ------------------------------------------------------------------- |
|           1. Toolchain |  done | Node, TypeScript, `make check` as the single gate, CI.              |
|        2. Level format |  done | The `.ld` language, parsed and compiled against all 79 real levels. |
|           5. Game core | 20/20 | The rules: falling, connections, explosions, greys, border.         |
|        14. Lint and CI | 16/20 | Code, docs, shell, spec and workflow linting; ten CI jobs.          |
|           13. Coverage |   5/8 | Floors set and measured; DOM-environment tests outstanding.         |
|           6. Catalogue |  7/12 | Loadable, gated, tracked, introduced — and now visible.             |
|        7. Presentation |  3/14 | Colours, hex, mirror and explosions verified; draw-op order is not. |
|       12. Verification |   3/8 | One real level played to a win and a loss; Cual still unwired.      |
| 15. Wiring the runtime |   1/7 | The program's code is extracted; it is not yet run.                 |

Everything else is untouched: 8 (art), 9 (shell), 10 (mobile), 11 (PWA).

**Group 7 is 3/14 and the number understates the code, not the work.** The reconciliation
note called it "honestly 0/14 by that bar", and three of those tasks turned out to be
implemented with nothing checking them — `render/presentation.test.ts` now asserts them
against the renderer's real draw calls. Two could not be closed at all, and both are
findings. **7.2** asks for per-cell draw-op aggregation ordered own-cell, then before-pass,
then after-pass; `render/board.ts` draws from `sim.board` and has no aggregation and no
before/after pass, so design decision 6's ordering rule — kept "because levels depend on
it" — is not implemented where it would matter. **7.14** asks for a fallback icon for an
out-of-range `pos`, but `draw.ts` deliberately throws on one, because a bad `pos` would blit
whatever is at that offset in the image file: a silently wrong picture rather than an error.
And **7.6 is verified only as far as the renderer can be**: `hexflip` never reaches it.
Eleven levels are hex and the only one declaring it uses `hexflip=2`, which for a
single-player left half means the same as `0` — so nothing in the corpus is affected, and
the gap is latent rather than active.

**Level cards have pictures now, and the corpus said what a tile can honestly be.** 6.7
asked for "a miniature of its actual board" verified against "the level it opens", and the
second half is not achievable: the game seeds its PRNG from `Date.now()` on purpose, so a
restart is not the board you have just seen, and 6.6% of the corpus's start cells are pool
draws resolved against that seed. **88 of 187 compiled difficulty rows contain no named kind
at all** — their entire start layout is a draw. So a tile is _one legal start_: the fixed
cells, the background and the colours are exact and are verified cell-by-cell against the real
`LevelLoader` for all 79 levels; the drawn cells are one of the arrangements the level allows.
Worth knowing before designing 6.8–6.12 on top of it: the start layout is **88.3% empty**
(median 3 rows filled of 20), so what makes two tiles tellable apart is mostly the **32
distinct `bgcolor` values** — a median of **one** kind is drawn per tile. The board is 10 wide
by 20 tall, so the tile is unavoidably portrait, and 79 portrait tiles in a scrolling list is
a constraint the next few catalogue tasks inherit.

**The coverage floors exist and are below the measurement on purpose.** `engine/` is at
93.7% against a 90% floor, `render/` at 91.7% against 80%, and `app/` has no floor because
a component's percentage measures how much JSX it has rather than whether it works. A floor
set to today's figure would move with every regression and so could never catch one. Two
things about them are worth knowing before trusting a green run: the floors only bite under
`make coverage`, not `make test`, because vitest evaluates thresholds only when coverage is
enabled — measured, not assumed. So `make check` passing is not a statement about coverage,
and the README says so in those words. **CI does enforce them, as a job of its own** (14.17):
a coverage breach reports every test green and then exits 1, so folding it into the `test`
job would read as "the suite is broken" and point at an assertion instead of at the
percentage.

**0.2.0 is cut and playable.** All 79 levels, real rules, playable on a phone. That is
the honest description of where this is: not a game yet, but the game underneath one.

**0.3.0 is cut.** Colours are assigned per level by perceptual distance rather than hashed
per picture name, so two kinds can no longer come out the same colour. The rules are a
dialog that pauses the game, so reading them is no longer a way to lose a piece. The
licence is AGPL-3.0-or-later, and the level files are committed, so a fresh clone needs no
fetch to build.

**Progress is stored from 0.3.0 onwards, and none of it is visible yet.** Which levels you
have finished, your best score per level per difficulty, and the next level in a track
unlocking are all implemented, tested, and kept on the device — plus the introduction
shown before a level starts and skipped once read. None of it appears on screen, because
the catalogue screen that would show it is task 9.4, and that lives with the menus in
0.5.0 rather than here.

So the version whose headline is "remembers you played it" does remember you played it,
and does not yet say so. That is the one thing to know about 0.3.0, and it is why 9.4 is
the first thing worth picking up next: it is the difference between a feature and a
capability. The roadmap line was written before 6.5 and 6.6 were split from 9.4, and it
should not be read as a claim about the screen.

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

### 3. Progress and unlocking (6.5, 6.6) — _done, in 0.3.0_

Which levels you have finished, best scores, and the next level in a track unlocking.
Without it every visit starts from the catalogue with no memory, which is the main thing
that makes a game feel like a game rather than a demo.

Straightforward, entirely testable, no visual decisions — and that turned out to be the
whole shape of it. Four decisions the spec left open, each settled by looking at the
corpus rather than by taste: a win at any difficulty unlocks (gating per difficulty would
lock two thirds of the catalogue behind a second playthrough); a level unlocks if it is
reachable in _any_ track it is in (fifty levels have different predecessors in different
tracks); an unplayable level does not block its successor (`DreiD` sits mid-track in two
of them, which would otherwise strand two of seventy levels behind a completion that can
never arrive); and an unordered track is left open.

Reached 77 of the 78 playable levels. The one that is not is named in the test:
`UnterWasser` is defined in `summary.ld` and listed in no track, so it has no position
anywhere, and upstream would not list it either.

**Stored, not shown.** Nothing on screen reads any of this yet — that is 9.4, below. The
entry in the changelog says so, which felt like the only honest option for a release
whose headline promises memory.

### 4. Cual runtime (groups 3 and 4) — _0.4.0_

The scripting language levels use for custom rules. `rollenspiel.ld` and about twenty
others ignore their Cual block and are therefore subtly wrong. This is the largest
single block of remaining work - it is the reason the port is not yet complete rather
than merely unpolished.

Sequenced late because it is the hardest to verify: the oracle is upstream's
interpreter, which cannot be built here, so correctness rests on tests written against
its source.

**Groups 3 and 4 are done, and that is not the same as the runtime being done.** Task 4.13
wired a compile pass into `make check` that names every construct in the corpus this
runtime cannot run, by file, line and construct. It reported 1538 places in three
constructs; 4.14 closed the `call`s, 4.15 the `scoped` ones and 4.16 the neighbour
reads, so it now reports **none at all**.

That is a claim worth being careful about, because _no unimplemented construct_ is not
_"the levels run"_. The pass is static: it asks whether there is a case for each construct,
with no board and no simulation, so `connectionsAt` can be implemented and still be wrong
about a hex column. Only 12.3 and 12.7 will catch that.

**Closing the gate turned up a parser bug that had been shrinking the gate's own numbers.**
`parseSwitch` folded its case list right and gave each case the _unfolded_ next entry, so
the chain dead-ended after one link and **every `switch` in the corpus with three or more
cases ran only its first two** — silently, with nothing to fail. `globals.ld`'s 33 variant
schemas lost fourteen of `schema16`'s sixteen faces, and 298 of the corpus's 609 neighbour
patterns sat in cases that were never built, which is why the gate reported 298 places
needing 4.16 when half of its subject was invisible to the parse. The real figures are
**1039 `call`s, 441 `scoped` blocks and 609 neighbour reads**, so every count 4.13
recorded was an undercount. That is worth saying plainly: _all 339 blocks parse_ has meant
_parse without throwing_ all along and not _parse correctly_, and one token-versus-expression
comparison per block is what finally noticed.

**Replacing the gate found three holes in the gate itself** — which is the argument for it
having been a snapshot rather than a claim. `walkExpressions` never reached a lettered
draw's address (`Y@(1)*`, 3372 of them) or an assignment's _target_ (`kind@@(xc@@+1,…)`,
354, three expressions each), and `walkStatements` never reached a `sharedCall` body. No
construct was hidden by any of them, because a coordinate cannot hold a neighbour pattern —
but a gate that skips a third of a level's arithmetic cannot be trusted to say the rest is
fine. So the gate now asserts the list is empty _and_ takes a census of what the corpus
contains, which is what stops _"no gaps"_ from also meaning _"did not look"_.

**Two tasks the checklist did not have, and both of them were wrong.** They were found while
reading upstream rather than while running the corpus, and both recorded a gap that was never
measured:

- 4.17 said a procedure definition is only recognised at a `code_zeile` boundary, so three
  shapes do not parse. Two definitions in a row parses; and the other three are refused for
  the same reasons upstream refuses them, because none of them is a `code_zeile` there either.
- 4.18 said a comma sequence inside a spliced body runs to completion instead of advancing a
  frame. A spliced body's frames are a bare sequence's frames, member for member and busy step
  for busy step.

Both are closed against the measurements rather than deleted, because a task asserting the
opposite would fail the day someone re-read the man page and believed it again. One smaller
question is left open and written down: `cual.6` also claims a spliced animation _restarts_ on a
branch switch where a shared one _continues_, which is about flag scope rather than advance, and
`resetBusy` has no `sharedCall` case. No corpus level uses `&name` at all, so nothing in the
game depends on it.

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
| 0.3.0   | Looks like a game, and remembers you played it | 1, 2, 3 — see below                            |
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
