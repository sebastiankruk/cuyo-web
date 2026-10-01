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

### 1. Art that distinguishes kinds

The largest remaining gap between "working" and "playable". Artwork is generated from
each picture's name, so kinds are usually but not always distinguishable, and you
reported confusing one colour for another mid-game.

Not upstream's sprites: they are GPL-2.0 and `scripts/check-no-upstream-art.sh` fails
the build if one reaches `dist/`. So the work is a small authored set - a handful of
shapes and colours per role - plus a mapping from picture name to one of them, generated
like the rest.

Needs your eyes. This is the next thing to look at together.

### 2. The rules dialog as a modal (9.8, 10.12)

You asked for this: a centred dialog that pauses the game, in a smaller face than the
HUD. The rules panel is currently a dropdown that does not pause, so opening it mid-fall
is a way to lose a piece you were watching.

Small, well-specified, and I can build it without asking. Good first pull request.

### 3. Progress and unlocking (6.5, 6.6)

Which levels you have finished, best scores, and the next level in a track unlocking.
Without it every visit starts from the catalogue with no memory, which is the main thing
that makes a game feel like a game rather than a demo.

Straightforward, entirely testable, no visual decisions.

### 4. Cual runtime (groups 3 and 4)

The scripting language levels use for custom rules. `rollenspiel.ld` and about twenty
others ignore their Cual block and are therefore subtly wrong. This is the largest
single block of remaining work - 23 tasks - and it is the reason the port is not yet
complete rather than merely unpolished.

Sequenced late because it is the hardest to verify: the oracle is upstream's
interpreter, which cannot be built here, so correctness rests on tests written against
its source.

### 5. Menus, pause, settings (group 9)

Pause, settings for audio and reduced motion, the dev overlay. Depends on 6.5 for
anything worth storing.

### 6. Presentation (group 7)

The chase border's artwork, `toppic` and `topoverlap`; the next-piece preview; the
informational indicators; the time-bonus breakdown; text rendering with a bundled font.
Mostly visible polish, each item small.

### 7. Offline play (group 11)

A service worker and a precache list. Lowest priority of anything here: a game you play
on a phone with a tunnel already works, and installing it to play offline is a
convenience rather than a capability.

## Versions

Cut when the app is worth using, not when a group closes. The remaining candidates:

- **0.3.0** - authored art, the modal rules dialog, progress and unlocking. "Looks like
  a game and remembers you played it."
- **0.4.0** - the Cual runtime. "Every upstream level, correctly."
- **0.5.0** - menus, settings, audio. "A finished game."

Minor versions fix and adjust. A version is not cut for a bugfix.

## Working practice

- Work on a branch, open a pull request, let CI run. `main` is always green and always
  something you could have handed to someone.
- A pull request that changes what the app looks like wants a screenshot from you before
  it lands. I cannot see a screen.
- One group of tasks per pull request where that is natural. A branch that mixes an art
  change with a parser fix cannot be reviewed in either direction.
