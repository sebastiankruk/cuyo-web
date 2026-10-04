<!--
Reconciliation note (group 5, after the first playable build)

Work was done ahead of the plan order to get a playable build, so the checkboxes
lagged. On review, a task counts as done only when the implementation exists AND
the verification it names exists and passes. That is a stricter bar than
"the code is written", and several items fall short of it.

Fully done and verified: 5.1-5.5, 5.9, 5.10, 5.14, 5.20, 6.3.

Implemented but the named verification is missing (the code is present; the test
is not). These are cheap to close and should be done before new features:
  5.6  border clamp on descent is untested
  5.7  the mirror-aware blob-order swap has no test (no mirrored fixture)
  5.8  the horizontal split and vertical bottom-first order are not directly tested
  5.11 the 12-blob chain-reaction case and the spawn offset are untested
  5.12 no simulation-level test of the random-grey arrival rate
  5.13 no test that a floating blob declines to fall
  5.15 the spawn gate is not directly tested
  5.16 loss on an unspawnable piece is not directly tested
  5.17 the exact 2-normal + 1-goal = 22 point case is untested
  5.18 win detection and the 300-point time-bonus case are untested
  5.19 restart works; the introduction state does not exist

Not started:
  5.20 done as of the group-4 work: the inventory is `cual-runtime/mirror.test.ts` and it
       found `loc_p` reading only a fall's side, so a blob on the right-hand field of a
       two-player game reported the wrong player.

Group 2: 2.1-2.7 are done and verified. The corpus test has now paid for itself
four times over. At 2.4 it said the transcribed version rules accept every real
level, including the fifteen `[1]`/`[2]` pairs that carry no unqualified
definition. At 2.5 it said the kind numbering is right for all 2556 kinds in the
corpus, and it needed `cual-constants.ts` to get there: the `neighbours_*` and
behaviour names a level uses in `<...>` are supplied by the engine, not by
`globals.ld`, so the root scope has to be seeded with them or a fifth of the
levels fail to build. The `level-format` spec's pear/orange arithmetic was wrong
and is corrected against `cual.6`. At 2.6 the corpus said which of the twenty
documented settings real levels actually use - all twenty - and that 81 of 237
level reads leave the description out, so the empty default is the exception
rather than the rule. At 2.7 it said five levels override the neighbour mode per
kind, covering six of the seven rectangular modes, and that no level anywhere puts
a hex mode on a kind in a rectangular board - so the mode/geometry separation is
asserted as an absence, and only the unit tests cover it. At 2.8 it said every
real level's `startdist` decodes at four version/player combinations, and that no
level uses the multi-character distkey extension at all - so `distKeyLen` is 1
across the whole corpus and the wide-key paths are unit-test-only. Writing it
turned up three transcription bugs: `distkey_leer` is -1 and not -2, five of the
six sentinel keys were missing from `decodeDistKey` entirely, and the right
player's informational keys are read at index `7-i` rather than as a reversed
half.

Groups 7, 9 and 10 have substantial code but no task is complete against its own
bar: 7.2, 7.3, 7.9-7.11, 7.13 need Cual or the art pipeline; the rest are
implemented but unverified. Group 7 is honestly 0/14 by that bar, 9 is 0/7 and
10 is 0/11.

Group 4 has one construct left in the compile gate: `neighbour` in 298 places, which is
task 4.16 rather than 298 problems. 4.17 and 4.18 were gaps that
no corpus level exercises; both turned out not to be gaps at all, and are closed against the
measurement that says so.

**4.16 closed the gate, and closing it turned up a parser bug that had been shrinking the
gate's own numbers.** `parseSwitch`'s fold gave each case the *unfolded* next entry, so the
chain dead-ended after one link: **every `switch` in the corpus with three or more cases ran
only its first two**, silently. `globals.ld`'s 33 variant schemas lost fourteen of
`schema16`'s sixteen faces, and 298 of the corpus's 609 neighbour patterns sat in the cases
that were never built — so the gate reported "298 places needing 4.16" when half its subject
was invisible to the parse. Fixed in the same change, because 4.16's own verification could
not be trusted while half of what it verifies was dropped before it got there. The real
figures are 1039 `call`s, 441 `scoped` blocks and 609 neighbour reads, so **every count 4.13
recorded was an undercount** — which is worth saying plainly, because "all 339 blocks parse"
has meant "parse without throwing" all along and not "parse correctly".

The gate also had to be replaced rather than loosened: it now asserts the list is *empty*
and takes a census of what the corpus contains, so that an empty report cannot mean a walk
that stopped. Replacing it found three more holes in the walk: `letterDraw`'s address (3372
of them), an assignment's *target* (354 addressed ones, three expressions each), and
`sharedCall`'s body, which 4.14 added without teaching the walk about. None of them hid a
construct, because a coordinate cannot hold a neighbour pattern — but a gate claiming to
reach every expression while skipping a third of them is a gate nobody can trust.

**13.6 is only half a floor, and the half that is missing is the half that catches anything.**
The thresholds went in at decision 12's numbers and both were verified by running the real
mechanism, not by reading the config: with `render/` floored at 99% against 91.7% achieved,
`vitest run --coverage` reported 1441 tests passed and still exited 1, and dropping a file with
no test into `engine/` moved it from 93.7% to 93.6%. What that also showed is that **vitest
evaluates `coverage.thresholds` only when coverage is enabled** — the same raised floor under a
plain `vitest run` exits 0. So `make check` does not enforce the floors, `make coverage` does,
and putting a coverage run in CI was 14.17, which is where the remaining half belonged. The
README says so in those words rather than leaving a reader to assume `make check` guards it.
**14.17 closes that half**, as its own job rather than a flag on the test run: a coverage
breach reports every test green and then exits 1, so inside the `test` job it would read as
"the suite is broken" and point at an assertion instead of at the percentage.

**12.1 was five-sixths done before this session and one sixth missing.** The division/modulo
table is transcribed in `divmod.test.ts`, the neighbour pattern in `neighbours.test.ts` (with
`1???0???` and its documented meaning quoted), the six `@`-assignments in `six-examples.test.ts`
(the documented results verbatim, including the note that the manual's `X` cannot be typed because
Cual refuses single-letter names), and the apple/orange distkeys and the version-offset example in
`startdist.test.ts`. **The busy switch was absent**, and it is the only one of the six whose claim
is about a *difference between two pieces of syntax* — so it is the one a plausible implementation
could get backwards.

`engine/cual-runtime/busy-switch.test.ts` drives the manual's example through the real evaluator
and the real walker, and it passes — the latching behaviour is correct. The observable is a
**draw count** rather than a picture, because `1:100` is `bool(random(100) < 1)` and so costs one
draw per evaluation: a `=>` case spends no draws while its animation plays and re-tests only once
the animation has terminated, while a `->` case is asked every step and abandons the animation on
the very next step. That is the manual's "won't switch back to A until the animation has
terminated" measured as a number, and it cannot be satisfied by a branch that draws the right
pictures for the wrong reason.

**Two mutations found two holes in my first version, and both holes were the subtleties the code
comments warn about.** Assuming `otherwiseLatching` equals `latching`, and skipping the busy reset
on the abandoned branch, each left the whole file green — because every default branch I first
wrote was a single `*`, and a draw is never busy, so there was nothing for either to act on. The
manual says that itself ("it doesn't matter if there's a `->` or a `=>` before the `A*`; `A*` isn't
busy anyway"), which is why the example cannot pin it; `pacman.ld`'s `=> R,R,R,R,R,R,R; ->` can,
because its default is a seven-command comma sequence and therefore busy. The file now tests that
shape, and tests leaving the default as well as leaving the chance branch.

**One mutation is still not caught, and it is recorded rather than papered over.** Removing
`resetBusy(otherwise)` when the condition matches — the mirror of the reset that *is* tested —
changes nothing observable, because `runCondition` clears the default's own flag unconditionally
with `busySet(slots.second, …)` and the recursive reset only reaches flags nested inside the
branch. Measured with the line removed and restored: identical output on every step. So that line
is currently unverified rather than verified-and-fine, and this note is the only place that says so.

**12.2's own premise is slightly off, and the off part is the finding.** `engine/game-core/constants.ts`
already existed as one documented module, but its citations named a *file* and not an
*identifier*, so a reader could not diff a value against its source without reading the C++. Every
value now carries file, line and upstream's own name. Two of the citations were wrong:

**`GREYS_PER_CHAIN_REACTION` was cited to `src/spielfeld.cpp` and is in `src/spielfeld.h:37`.** The
value was right. So was the second one's value, but not for the stated reason.

**`EXPLOSION_STEPS` is not a constant in upstream at all.** It was cited as "`src/spielfeld.cpp`:
steps an exploding blob stays visible" and nothing in that file says it. The real mechanism is
`src/blop.cpp:347` — an explosion ends when `spezvar_am_platzen` passes
`ld->mExplosionBild.anzBildchen()`, and `anzBildchen()` is `(mBreite / gric) * (mHoehe / gric)`
(`src/bilddatei.cpp:205`), so the length is **the picture count of the level's own explosion image**.
`mExplosionBild` comes from the level's `explosionpic` word (`src/leveldaten.cpp:476`), and **two
corpus levels override it** — `theater.ld:72` and `schemen.ld:37`, both to `ithDreckExpl.xpm`. So
the fixed 8 is right for all 79 levels only because both image files are 128×64, which at `gric` 32
is 4×2 = 8 frames each. Upstream's own comment agrees with the number (`src/knoten.cpp:48–49`,
"0 = nicht am platzen; sonst 1 - 8"). The test now asserts that arithmetic from the two dimensions
instead of repeating the 8, so the coincidence is visible rather than hidden.

**`src/code.h` contributes no constant, so "a single module" cannot mean what 12.2 says.** It holds
`divv` and `modd`, which are functions. They are transcribed in `engine/cual-runtime/divmod.ts`,
which also records where upstream and `cual.6` disagree — `modd`'s fourth quadrant flips the
quotient's sign and the man page wins. There are therefore **three** documented constant modules,
one per source family (`game-core/constants.ts` from `layout.h`/`blop.h`/`sorte.h`/`leveldaten.h`/
`spielfeld.*`/`knoten.cpp`, `level-format/cual-constants.ts` from `knoten.cpp`'s name tables,
`cual-runtime/divmod.ts` from `code.h`), and merging them would put a level's distkey names in the
same table as the board's width. Ticked on the reading that 12.2 wants a source citation to be a
requirement; if it wanted one physical file, that is a different task.

**The check that makes it a requirement is the reverse direction.** `constants.test.ts` holds each
upstream line's own literal and compares it to the module, and then asserts that **every numeric
export appears in the table** — so a constant added without a citation fails. A stale row fails the
mirror check, so a rename cannot silently drop a citation. This is why the transcription lives in
the test rather than in a test that reads `.context/upstream-cuyo`: CI has no upstream tree, so such
a test would skip there and the check would exist on one machine only. Provenance is in the comments,
values are asserted in CI, and neither half pretends to be the other.

**12.3 turned up the largest gap in the project, and it is not a gap in the test.**
`engine/game-core/scenarios.test.ts` plays `paratroopers.ld` end to end through the real
`LevelLoader` over the committed `levels/upstream`, the real `Simulation`, and the same four actions
`app/gestures.ts` calls. Nothing reaches inside: no test sets `goalCount`, `board`, `borderPx` or
`phase`. One key press is the whole difference between the two endings:

- **rotate every step → won at step 447.** The piece falls in column 4, lands on the 2x2 `Cannon`
  goal block at columns 4-5, joins it, and the group explodes with the goals in it.
- **moveLeft every step → lost at step 1744.** Every piece is walked to column 0, nothing ever
  connects to the block, all four goals are still on their starting squares, and the border rises
  until a piece cannot be introduced.

Same level, same seed, same step count. That is the strongest statement available that the input
path is wired: a test where the input did nothing could not produce two endings.

**The finding: no level's Cual programme is ever executed, anywhere.** `loader.ts` does not import
the Cual compiler at all — its private `compile()` builds kinds, settings and the start layout and
nothing else. `LevelDef` has no field for a compiled program, and `Simulation` has no phase that runs
one. Group 2 compiled all 79 levels and group 3 built the whole runtime, and **the two have never
been joined**: no test loads a real level and runs its code, and `compile-corpus.test.ts` compiles
every level then throws the trees away. So the blobs in these scenarios, and in the game, only fall,
stack and explode — they never pull themselves.

Measured, not asserted: driving all 79 levels with no input and a 2500-step cap gives **9 won, 69
lost, 1 unfinished**, and a goal blob is ever removed in exactly those 9. For the other 70,
upstream's own logic is what pulls blobs together; without it the board silts up and the border
wins. `ParatroopersInvers` was chosen *because* it survives the limitation in both directions, so
the file does not flatter it.

**This needs its own task and does not have one.** Wiring it means `LevelDef` carrying a compiled
program, the loader keeping it, and `Simulation` running each blob's draw code at the right point
in the phase order — which is upstream's `BlopGitter::animiere()` and therefore the same ordering
question as design decision 6, still unimplemented. It is recorded here rather than absorbed,
because 12.3 asked for tests and this is an engine change.

**Two mutations found that the file's most elegant assertion was worth nothing.** The time-bonus
check was first `score === scoreAtBonus + POINTS_PER_TIME_BONUS * GRY`, which puts the constant on
both sides — doubling the payout satisfies it exactly. Rewritten as
`(score - scoreAtBonus) / bonusSteps`, which reads better and *also* passes, because the measured
rate is whatever the constant says. Only an absolute number pins it: 96 before the bonus, 296
after, 20 steps at `punkte_fuer_zeitbonus` = 10. Two attempts, two green files, and the third
caught both that and a doubled `POINTS_PER_NORMAL`.

**Two of my assertions were wrong and measurement caught them before they became tests.** I claimed
`rotate` leaves the piece's column alone; it does not — the piece is two blobs wide and turning it
changes which blob is the anchor, so the winning run visits column 5 as well as 4. And I asserted
the loss run's `Gray` blobs sat where they started; they do not — something lifts them, and the
winning run ends with ten of them on row 0 having begun on rows 18-19. Neither mechanism is claimed
in the file, because neither is understood.

**One mutation is not caught, and is recorded rather than papered over.** Removing `rotate`'s
blob-order swap leaves this file green, because both blobs of the falling piece are the same kind
here and the swap is invisible in board state. It is unverified rather than verified-and-fine.

**One earlier result was an artefact and is not in the file.** A first survey used a constant-value
`ScriptedPrng` and appeared to show `Baggis` flipping between won and lost on one `moveLeft` per
step. With the real `Prng` it loses under every policy: the goals are `chainGrass`, so they need a
chain reaction, and with no Cual nothing ever joins a group big enough to produce one. The
`ScriptedPrng` result was real arithmetic on a game that cannot occur.

**15.1 found the recursion guard was not strong enough, and that is a change to shipped
behaviour.** `linkCalls` refused a self-call by registering each definition only *after* rewriting
its body — which stops `tor_1 = { tor_1; }` but **not** `bolzer = {tor_1;}`, because `tor_1`'s
stored body is re-rewritten at that call site and by then `tor_1` *is* in scope. Driving a real
level blew the stack on `Maximum call stack size exceeded`. Upstream cannot have the problem
because it never re-parses: the self-call was substituted with `undefiniert_code` in the grammar,
so the stored `Code` holds a dead node and splicing copies the dead node.

The fix keeps `link.ts`'s existing contract — an unresolved call stays a `call` node, which
`link.test.ts:90-97` deliberately pins so the run-time throw can name the procedure — and instead
**threads the expansion stack**: `linkCalls` takes an optional `selfName`, and hiding it extends
to every nested splice, so a call to a procedure already being expanded is left unresolved. That
is exactly "this procedure did not exist when that body was read", carried transitively. A plain
call still expands the callee's body *from source*, so it keeps its own busy numbers
(`neueBusyNummern`) rather than sharing the definition's. `link.test.ts` passes unchanged.

**My own first version of `codeBlocksOf` walked one level deep and found no kind's code at all.**
A kind's `<< >>` sits inside the *level's* section — `Baggis={ … << level code >> sbKaese={ … <<
sbKaese = {…} >> } }` — so `Baggis` reported 0 of 7 kinds with their own code when all 7 have. It
failed quietly rather than loudly, which is the worse kind.

**I had the corpus figures backwards, twice.** I wrote that "most kinds define no code of their
own" and that the defaults were therefore the main path, from a probe whose classification was
wrong: it counted a kind as "using a default" whenever its `defaultCode` was non-null, which is
true of nearly every kind whether or not its own procedure won. Measured properly: of 556 kinds,
**502 define a procedure of their own, 5 fall back to `default1`, none to `default3`, and 49 have
no code at all**. The fallback is a tail. It is still implemented — five corpus kinds need it —
but the module no longer claims to be arranged around it. The five are named in the test
(`Pfeile/ipGrau`, `Ziehlen/gras`, `Embroidery/jsGruenGras`, `Darken/dnStart`,
`Explosive/lbBlack`) rather than counted, so two of them silently changing default would fail.

**`default2` and `default2g` are unreachable from the corpus**, because no level writes a kind
with exactly one multi-icon picture file, and **no level uses `pics = name * count` at all**. That
last one was a coverage hole mutation found: collapsing `runs.length > 1` into `sum(counts) > 1`
left all 24 tests green while the two disagree on `pics = bolzer * 3`, which is one file with
three icons (`default2`) and not three files (`default3`). `defaultCodeFor` is now exported and
unit-tested on run lists written out by hand, because the loader cannot be used for it — the art
manifest is keyed by **filename**, so a synthetic level cannot borrow another level's picture
names and fails before the default is ever chosen.

**`allocateSlots` discarded the index of each declared variable**, so a user variable could not
be resolved at all: it reaches the evaluator as `{ kind: "variable", name }` and
`EvalContext.variable(name)` is the only thing that turns a name into an array index. `Allocation`
now carries `declaredSlots`, because the allocator is the only thing that knows the numbering and
a second walk in the same order would be a second source of truth for it. One entry per name,
which upstream agrees with: `neueVarDefinition` always takes a fresh slot and
`speicherDefinition` throws `"x" already defined.` for a second one.

**Baggis's variables are at slots 23-25, not 14-16.** The special variables take 0-13 and then
`globals.ld`'s own `var` lines take theirs, because globals are read first and upstream numbers
every configuration in one sequence. An earlier draft of the test asserted 14/15/16 on the
reasonable-sounding ground that `SPECIAL_VARIABLE_COUNT` is where user variables start; they start
*after globals'*.

**One thing this task found that is not in its own scope.** The order *within* a step is upstream's
and not a guess — `cuyo.cpp:422-542` runs the border, random greys, the falling piece, the row
transfer and the explosion test, then `Spielfeld::spielSchritt`, and only then `animiere()` at
`cuyo.cpp:473`, so **the rules run first and the blobs' code last**. That belongs to 15.6 and is
recorded in group 15's preamble rather than here.

**15.2 turned out to be mostly about a discarded value.** The loader did
`parseLd(source, filename).definitions`, which throws away `file.code` — the `<< >>` blocks
written outside any definition. For a level that is nearly nothing. **For `globals.ld` it is
everything**: `schema16` and `default1` through `default3` all live in one top-level block, so the
loader was discarding the whole of the Cual the corpus depends on. `parseFile` and `parseGlobals`
now keep the `LdFile`.

The test that pins this is the one that would have failed before: a loaded `Baggis` has
`schema16`, `default1` and `default3` in `program.procedures`. Mutation confirmed it — putting
the `.definitions` discard back fails three tests.

**`Kind.drawCode` is a view of `program.drawCode`, not a second copy**, and the test asserts the
*references* are equal rather than the contents. A `toEqual` would pass on a copy and miss a level
whose kinds had been re-linked against something else, which is the failure hardest to see; making
the copy fails twelve tests.

**`buildKinds` emits `drawCode: null` and the loader fills it in**, because `buildKinds` reads
`scope` and has no access to the parsed `<< >>` blocks the code comes from. So a hand-written
`Kind` may leave it `null` — which is also what a kind with no pictures gets.

**The fixtures carry `EMPTY_PROGRAM`, exported rather than cast at the use site.** They predate
the `.ld` parser and transcribe a level's *data*, so they have no code; "this level has no code"
is a value with a name, and its allocation is the smallest `getDatenLaenge` can be — the special
variables and nothing else. Asserted, because a fixture that quietly grew a program would mean the
game-core tests were exercising something no real level does.

Re-measured through the loader rather than trusted from 15.1: **502 / 5 / 49** and **zero
unresolved calls** across all 79 levels, unchanged.

**7.4, 7.6 and 7.7 were implemented and unverified; they are now verified against the
renderer's real draw calls, in `render/presentation.test.ts`.** Every assertion names a
position rather than a count — the lesson this project's tests were written after, where
"26 fills happened, all inside the canvas" passed while every blob sat in one corner. Three
things the writing turned up, none of which a reading of the renderer would have shown:

- **A hex cell's centre is in the *next* row.** The offset is half a cell down, so "which
  cell is this fill in" cannot answer the question 7.6 asks. The first version of the test
  looked cells up by centre and reported four missing blobs on a board that draws all of
  them. The hex assertions are in pixels, which is the space the offset lives in.
- **A goal blob is drawn twice** — the body and a marker on top of it — so a row of goal
  blobs fills the band twice and every count comes out double. `blobsInRow` filters on width
  to separate them, and says why.
- **The explosion is already past frame 1 when `step()` returns**, because one call runs the
  whole phase loop: `testExplosions` sets them to 1 and `continue`s, then the same call
  reaches the `exploding` case and advances them. Asserting `1` would have been asserting
  that a step does one thing. The test now drives from wherever the sequence lands and
  asserts one step per frame from there — which is also what makes it immune to the bug that
  loop once had.

**Two group-7 tasks are not closeable as written, and both are findings rather than gaps I
can quietly finish.** 7.2 asks for per-cell draw-op aggregation ordered own-cell, then
before-pass, then after-pass (design decision 6). The engine has `PictureStack` per blob and
`render/board.ts` draws from `sim.board` — there is **no per-cell aggregation and no
before/after pass at the render layer at all**, so the ordering rule decision 6 keeps "because
levels depend on it" is not implemented where it would matter. And 7.14 asks for a fallback
icon for an out-of-range `pos`, but `draw.ts` **deliberately throws** on one, documented:
a bad `pos` "would blit whatever happens to be in the image file at that offset — a silently
wrong picture rather than an error". Implementing a fallback would contradict a decision
someone made on purpose. Both are recorded here rather than forced.

**And 7.6 is verified only as far as the renderer can be.** `hexflip` is **dropped on the way
to the renderer**: `LevelDef` has no such field and `board.ts` calls
`hexGeometry(level.neighbours)` with no flip argument. Measured: 11 levels are in a hex mode
and the only one declaring `hexflip` is `hexkugeln.ld` with `hexflip=2` — and since
`columnShift` reads `flip & 1` for the left half and every hex board in this port is
single-player, `2` and the default `0` agree. So **no level in the corpus is affected and the
gap is latent**, but a two-player hex board or a single-player `hexflip=1` level would render
with the wrong parity. Asserting the flip would mean asserting that a field the renderer
never receives changes the output, so the test says what is true and the gap is written down.

**12.8's premise was wrong in a way that mattered.** It said the corpus-absence skip in
`render/palette.test.ts` could go because "the level files are committed" — but that suite
read `.context/upstream-cuyo/data`, which is **gitignored**. So the skip was live: on CI and
on every fresh clone, `describe("the real corpus")` returned immediately and reported
success. The property is that two kinds in one level are never the same colour, and it had
never been checked anywhere but this machine. Its own census was `>= 65` against 70 measured
— slack enough to hide 14 lost levels, which is the failure the task exists to prevent,
sitting inside the task that fixes it.

**The floors are deliberately below the measurement** (engine 93.7 against 90, render 91.7
against 80). A floor set to today's figure cannot catch a regression, because it moves with it.
`coverage.test.ts` therefore pins the *configuration* — that the numbers are decision 12's, that
`app/` has no floor, and that no source file has slipped outside `coverage.include`, which is the
likely accident, because a glob list is silent and a file that stops matching is not reported as
missing, it just stops being counted and the percentage goes **up**. `levels-src/` is excluded on
purpose: it is the generators, which run under `make` rather than under a test, so a coverage run
would say "1.4%" about them — true, and about the wrong thing.

**6.7's verification clause cannot be met as written, and the reason is an existing decision
rather than an oversight.** It asks to "verify a tile matches the level it opens", but
`app/levels.ts` seeds the game's PRNG from `Date.now()` — deliberately, so a restart is not the
board the player has already seen — and `startlayout.ts` resolves every pool-draw cell against it.
Measured over the corpus: **6.6% of cells are draws, and 88 of 187 compiled difficulty rows
contain no named kind at all**, so no tile could equal the board a card actually opens. The tile
is therefore *one legal start*: the exact background, and the exact arrangement and colours of
every cell the level fixes. What it is verified to be is the strongest thing that is true —
`tile-corpus.test.ts` drives the real `LevelLoader` over the committed level files at
`TILE_REFERENCE_SEED` and compares cell by cell, for all 187 rows, which catches a tile on the
wrong level or difficulty, one left behind by a `.ld` edit, a layout the engine's neighbour
heuristic would never produce, and colours chosen against the wrong background. The drawn cells
are checked separately against the level's own pools.

**The measurement changed two things about the design, and both were surprises.** The start
layout is **88.3% empty** (median 3 rows of 20), so the tile's distinctiveness is mostly its
**32 distinct `bgcolor` values**, not its palette — median **one** kind is drawn per tile. And
because the board is 10 wide by 20 tall, the tile is unavoidably portrait. Separately, the
catalogue tile needs its colours *baked into the index*: measured cold, `buildPalette` costs
1.8 ms at a median 6 kinds and 23.6 ms at 154, so building 79 at catalogue open is a
142 ms–1.9 s stall. Inlined per difficulty the palettes were 95 kB of a 234 kB file; 187 rows
share only 40 palettes, so they are interned into a shared table and the index is 151 kB raw and
**7 kB → 12 kB gzipped**.

**Two things found by writing the verification, both fixed in the same change.** The loader had
a private `cssColour` and the generator grew a second copy that neither clamped out-of-range
channels nor matched its spacing, so a level writing `bgcolor = 300 0 0` produced a tile whose
background string was not the string the game paints — the same colour to a browser, a different
claim in a diff. It is one function in `settings.ts` now. And `scripts/check-level-index.sh`
restored the committed file *before* printing its diff, so the diff was always empty and a stale
catalogue looked like a no-op; found because 6.7 hit exactly that.
-->

## 1. Project Setup and Toolchain

- [x] 1.1 Scaffold a Vite + React + TypeScript app at `cuyo-web/` and verify `npm run dev` serves it and `npm run build` produces `dist/`
- [x] 1.2 Add a Node test runner and verify a trivial unit test runs headlessly with `npm test`
- [x] 1.3 Create the `engine/`, `app/`, `render/`, `levels-src/` directory split and verify a lint rule fails on any DOM reference inside `engine/` (boundary test)
- [x] 1.4 Add `LICENSE` (GPL-2.0-or-later) and an attribution notice crediting Immanuel Halupczok and the cuyo developers, and verify it is referenced from the README
- [x] 1.5 Add a deterministic test-only PRNG stub so engine tests do not depend on the production RNG implementation, and verify both produce reproducible sequences in their own tests

## 2. Level Data Format (`.ld`)

- [x] 2.1 Implement the `.ld` lexer (comments, identifiers, words, quoted strings, numbers, punctuation, version brackets) and verify it tokenises every file in `cuyo-2.1.0/data/` without error
- [x] 2.2 Implement the `.ld` parser for top-level and nested section definitions, and verify sections and definitions are read from a fixture matching the `example.ld` structure
- [x] 2.3 Implement the `*` repeat shorthand and the `<expression>` arithmetic (with `+ - * / %` over literals and defined names) and verify the man page's worked examples
- [x] 2.4 Implement version resolution (most specific applicable subset wins) including the mutual-exclusion and exhaustiveness rules, and verify the documented `[1] [2] [easy] [hard]` examples plus the ambiguity-rejection case
- [x] 2.5 Implement kind declaration lists (`pics`, `greypic`, `startpic`, `emptypic`), the successive kind constants, first-use-wins naming and per-kind overrides, and verify the apple/orange/pear/banana/pineapple example from the man page
- [x] 2.6 Implement level-wide setting extraction with documented defaults (`toptime` 50, `chaingrass` 0, `mirror` 0, colours, `randomfallpos`, `randomgreys`, `nogreyprob`) and verify defaults apply when omitted
- [x] 2.7 Implement `neighbours` mode parsing including the hex-mode flag, and verify each of the ten modes resolves correctly
- [x] 2.8 Implement `startdist` decoding (row alignment, `.`/`+`/`-`/`*`, `distkey` version offsets, the 4- and 8-character informational last row) and verify the man page's example rows
- [x] 2.9 Implement the random-cell neighbour-avoidance retry used for `+` cells and verify a filled start layout contains no accidental same-kind adjacency beyond what the layout declares
- [x] 2.10 Implement picture names as logical art keys resolved through the art manifest with no filesystem access, and verify a declared key resolves to a manifest entry and an unregistered key fails with the key and kind named
- [x] 2.11 Implement the build step that scans every bundled `.ld`, extracts the full set of referenced picture names and emits the art-key manifest, and verify every referenced key is registered with an entry
- [x] 2.12 Implement structured load diagnostics (file, definition, reason) for unresolvable art keys, wrong row lengths and undefined `numexplode`, and verify each produces a specific error
- [x] 2.13 Implement the build-time validator that parses and compiles all levels in `summary.ld` plus its includes and **fails the build** on the first error, and verify it passes on the unmodified upstream data
- [x] 2.14 Implement the level index generator (id, tracks, name, author, description, per-difficulty `numexplode`) and verify it is emitted and contains the 48 Standard-track levels
- [x] 2.15 Implement runtime level loading that fetches a `.ld` on demand, parses it and caches it, and verify a second request for the same level hits the cache

## 3. Cual Runtime - Foundations

- [x] 3.1 Implement `divv`/`modd` with the documented mathematical rounding and verify the man page's table including negative divisors
- [x] 3.2 Implement the Cual expression evaluator with all operators at the documented precedence, bit set/unset/test and range comparison, and verify a test per operator group
- [x] 3.3 Implement `rnd(n)` and `gcd(a,b)` on the simulation RNG and verify `rnd` stays in range and `gcd` matches known values
- [x] 3.4 Implement the Cual lexer (keywords, identifiers, numbers, letters, patterns, strings, all operators and both arrows) and verify it tokenises `globals.ld` and every level's Cual block
- [x] 3.5 Implement the Cual parser producing a code tree covering procedures, variable declarations, `default`, assignments and compound assignments, scoped `[x=e]` blocks, `if`/`else`, `switch`, comma sequences, `busy`, draw commands and effect commands, and verify all 81 levels parse
- [x] 3.6 Implement compile-time variable slot allocation, including the reserved slot per potentially-busy code node, and verify slot counts are stable for a repeated parse
- [x] 3.7 Implement the per-blob variable store as a single `Int32Array` holding user variables and busy flags, and verify busy flags are independent between two blobs of the same kind
- [x] 3.8 Implement the begin-of-step shadow copy with per-time-slice refresh (draw, key and land events each opening their own slice) and verify the six documented `@`-assignment examples produce exactly the documented results — verified for the mechanism 3.8 owns; statements 2, 5 and 6 need the deferred writes of 3.9 and the addressed reads of 4.7, and are asserted refused rather than skipped
- [x] 3.9 Implement the deferred write queue applied at end-of-step, and verify a cross-blob write is invisible until the step ends — statements 2, 5 and 6 of the six `@`-assignment examples verified as queue-and-shadow mechanics; end-to-end through the evaluator still needs the addressed reads of 4.7
- [x] 3.10 Implement neighbour-pattern expressions including the empty-blob out-of-board rule and the start-of-step snapshot, and verify the `1???0???` example from the man page

## 4. Cual Runtime - Execution

- [x] 4.1 Implement the code-tree walker threading busy state through `;` (busy while either side) and `,` (busy until all members ran), and verify the documented busyness rules
- [x] 4.2 Implement `if`/`else` and `switch` with both arrow forms, and verify `->` re-tests every step while `=>` latches
- [x] 4.3 Implement the comma-sequence animation advancing one command per step, and verify the latching `switch` example runs its animation to completion before resuming the default branch — the advance itself is 4.1's `folge_code` flag and the latching is 4.2's `bedingung_code`; this task closed the verification gap, that the default branch runs *after* the animation and not before, using the corpus's real animation shapes (`augen.ld`'s 15 frames, `pacman.ld`'s 7, and the man page's own)
- [x] 4.4 Implement the system variables (`file`, `pos`, `kind`, `version`, `qu`, `out1`, `out2`, `weight`, `inhibit`, `behaviour`, `falling_speed`, `falling_fast_speed`) with per-step resets for `file`, `pos`, `qu` and the debug outputs, and verify the resets happen before each draw — the per-step reset is `beginStep`; `file` and `pos` are written by `zahl_code` and `buchstabe_code`, and the draw itself (`mal_code`) is 4.9
- [x] 4.5 Implement the read-only constants (`time`, `turn`, `size`, `basekind`, `loc_*`, `loc_p`, `falling`, `falling_fast`, `informational`, `players`, `exploding`) and verify each against a constructed board — `loc_*` of a *falling* piece is refused: it comes from `pos_fall`'s half-cell geometry with rotation, which is the fall simulation and not written
- [x] 4.6 Implement the constant tables for kinds, `global`, `semiglobal`, `nothing`, `outside`, behaviour bits, neighbour modes, quarter selectors and `DIR_*`, and verify the names resolve to the values read from `src/knoten.cpp`
- [x] 4.7 Implement absolute and relative foreign access (`@@(x,y)`, `@@(x)`, `@@()`, `@(dx,dy)`, `@(dx)`, `@()`) including hex half-integer coordinates, default-on-out-of-range read and no-op-on-out-of-range write, and verify each form — and with it `set_zeile`, so **all six `@`-assignment examples of `cual.6` are now verified end to end** through the real evaluator and walker (they were split across 3.8, 3.9 and here)
- [x] 4.8 Implement setting `kind` with reapply defaults and same-step draw behaviour, and verify the three documented side effects
- [x] 4.9 Implement the draw commands `*`, `*@(pos)` and `@(pos)*` with quarter clipping, and verify the recorded ops carry the right cell, file, index and quarter — the `Ort` needed a `relative` flag and a `@`-addressed `Ort` a `bemalbar` rule; `PictureStack` records the quarter number rather than resolving the clip, so `malBildchen` stays render-time
- [x] 4.10 Implement event dispatch for `init`, `turn`, `land`, `changeside`, `connect`, `row_up`, `row_down` and the four `key*` events with the correct eligibility and firing order, and verify `init` fires exactly once and `keyturn` fires even when rotation is blocked — an event is an ordinary definition named `<kind>.<event>`, and the *draw* code is the bare `<kind>` name: the one `Paratrooper.draw` in the corpus is a procedure
- [x] 4.11 Implement the global blob (running before all board blobs) and the per-player semiglobal blob, and verify ordering and isolation — the whole step is **one** `beginGleichzeitig()` window, so the semiglobal running last still reads the beginning-of-step world through `@`
- [x] 4.12 Implement `bonus`, `message`, `explode`, `lose` and `sound`, and verify each effect reaches the correct player — which is **four different rules**: `bonus`/`message` follow the asking blob's own side and throw in the global blob, `sound` follows the blob's *position* into a sample set, `explode` reaches no player and is a silent no-op in a falling blob, and `lose` ends the whole game rather than one player
- [x] 4.13 Wire compile of all levels into the build gate so an unimplemented construct fails the build with file, line and construct, and verify by temporarily removing a construct — the gate is a **snapshot**, not an assertion that the list is empty, because group 4 is not finished: it reported 1538 places in 3 constructs (`call` 845, `scoped` 395, `neighbour` 298), and 4.14 and 4.15 have since closed two of them, so it reports **298 in one** — `neighbour`, which is 4.16. It found a real bug on its first run: `if`/`switch`/`switchCase` were still in the refusal table after 4.2, so it reported 1364 `if` gaps in a corpus where every `if` runs. Its non-triviality guard had to weaken with it: it used to assert that more than one *kind* of gap was found, and cannot now that there genuinely is only one

- [x] 4.14 Implement procedure calls, and verify the `&name` distinction — 845 places in the corpus; the largest single gap. **The task text was wrong and is corrected here**: there is no runtime call at all. Upstream's grammar resolves a call while it parses, so `name;` splices a *copy* of the definition's `Code` into the caller and `&name;` splices a `weiterleit_code` pointing at it; there is no call stack, no depth limit and no return value, because `set_zeile`'s right-hand side is an `ausdruck` and the grammar has no call in expression position — so `yy = f(xx)` does not parse and Cual has procedures rather than functions (asserted). Cual also **cannot recurse**: `speicherDefinition` runs in the grammar action, after the body is reduced, so a procedure's own body cannot see the procedure; `linkCalls` therefore walks in source order and registers each definition only after rewriting its body. The difference between the two forms is the copy constructor's third argument, `neueBusyNummern`: a three-frame animation gives 2 flags shared across two `&` sites and 4 across two spliced copies. The corpus uses the plain form 302 times and `&name` zero times
- [x] 4.17 Recognise a procedure definition anywhere in a `<< >>` — **there is no gap, and the measurement is the verification.** Upstream's `<< >>` is `code_modus: code_modus code_zeile`, where a `code_zeile` is a procedure definition, a `var` line or a `default` line, and `parseCodeLine` already probes for a definition at every statement boundary — which is that rule. Two definitions in a row parses. The three shapes the task named as broken are all refused, and upstream refuses each one too: a definition inside `{ .. }` because `'{' code '}'` is a `code` and a `code` holds no zeilen, and a definition after a call or an ordinary statement because neither is a zeile. The test that claimed otherwise used `a` as the name, which upstream refuses with "Procedure names can't be single letters." — so it asserted a refusal for an unrelated reason. Found while closing it: the three *declaration* sites did not carry upstream's wording either, so `x = { .. }` said "cannot start a statement here" and `var x;` said "expected a variable name"; both now refuse by name
- [x] 4.18 Make a comma sequence inside a *spliced* body advance one member per step — **there is no gap, and again the measurement is the verification.** A spliced body's frames are a bare sequence's frames, member for member and busy step for busy step, at one call site, at two, and inside a taken `if` or `switch`. Inside a `->` the same frames appear with the busy steps gone, which is `busy &= !(mZahl & 1)` and 4.2's latching distinction rather than anything to do with the splice; `=>` brings them back. The one place the frames differ is `&`, which shares one body between two sites exactly as `neueBusyNummern == false` says. `cual.6`'s ampersand examples are valid Cual and parse. **What is still open is a different, smaller question:** the man page also claims a spliced animation *restarts* on a branch switch and a shared one *continues*, and that is about flag scope rather than advance. `resetBusy` has no `sharedCall` case, so a branch that stops being chosen does not clear the flags of the body it shared, and a `->` branch stores its body's raw busyness in `vast1` while reporting none — so what survives a switch depends on both. No corpus level uses `&name` at all, and answering it needs a decision rather than a fix
- [x] 4.15 Implement scoped blocks (`[x = expr] ...`), and verify nesting — 395 places, the second-largest gap. Upstream's whole of it is `push_code`, five lines: save the variable, set it from the expression, run the body, put the old value back, return 0. **The task text said two things the source contradicts, and both were implemented as upstream does it**: the value is evaluated *every step*, not once on entry, because `mF1->eval(b)` is inside `eval` and `eval` runs once per step per blob — so `[x = x + 1] ...` never drifts, where a cached value would climb by one per step; and the restore does *not* wait for the body to stop being busy, because the third line runs whether or not the second returned busy — so a scoped animation does not hold its value open for the frames it takes. Nesting needs nothing extra, `merk` being a local in `eval`
- [x] 4.16 Read a neighbour pattern out of a blob's array (`1???0???` and the eight-character forms), connecting `neighbours.ts`'s patterns to a live board, and verify against the man page's worked example — 298 places as the compile gate counted them, which was **an undercount**: the real figure is 609, and the gate said 298 because the parse was dropping half of them (see the reconciliation note). The patterns themselves are 3.10's; 4.16 is the read. Two pieces: `access.ts` answers a blob's connections off a live `AccessField` (`Blop::getVerbindungen`), and `expr.ts` turns the match into 1 or 0 through a new `EvalContext.neighbour`. Three rules the man page states and the read has to keep: only a blob on a *cell* has an owner, so a falling piece and the global and semiglobal blobs answer `verbindung_solo` — the ninth bit, above all eight directions, which makes every pattern read as all zeros, and `kacheln4.ld` and `kacheln6.ld` ask a falling piece exactly that; `verbindetMit` compares the **shadow** kind on *both* sides, so the pair is snapshotted rather than the neighbours; and the mirror swap is three `TAUSCH_BITS`, so a mirrored level's "above" is the cell that was below

## 5. Game Core

- [x] 5.1 Implement the seeded PRNG and route every random draw in the simulation through the single instance, and verify two runs with the same seed and inputs produce identical state at every step
- [x] 5.2 Implement the board as a 10x20 grid of blob records with kind, version, weight, behaviour bits and per-blob variable storage, and verify coordinate bounds for all accesses
- [x] 5.3 Implement the neighbour offset tables for all ten modes ported from `NachbarIterator::setXY`, and verify each mode's offsets against the C++ source
- [x] 5.4 Implement hex column offsetting for the three hex modes and verify odd columns are offset half a cell and the diagonal directions follow
- [x] 5.5 Implement connection computation including same-kind, neighbour mode and `inhibit`, and verify inhibition and kind mismatch both break a connection
- [x] 5.6 Implement the falling piece: spawn at column 4, descent at 6 and 32 px/step, clamping at the chase border, and verify the spawn position and descent rates
- [x] 5.7 Implement steering, rotation with the mirror-aware blob order swap, and fast-fall toggle, all rejected when blocked, and verify each accepted and rejected case
- [x] 5.8 Implement landing, including vertical pieces landing bottom-first and horizontal pieces splitting so the free blob continues falling, and verify both cases
- [x] 5.9 Implement component computation summing `weight`, and verify a 2+3+1 component reports size 6 to all members
- [x] 5.10 Implement explosion resolution: size threshold, `explodes_on_size` gating, grass and grey propagation with `chaingrass`, chain-reaction flagging and the 8-step exploding state, and verify every case in the spec including chain-grass resistance
- [x] 5.11 Implement grey generation using the documented formula and random placement at `hetzrand + 8px`, and verify the 1 and 12 blob cases
- [x] 5.12 Implement random grey arrivals at the configured expected interval, and verify the observed rate over a long run
- [x] 5.13 Implement gravity with the `floats` behaviour respected and empty cells unaffected, and verify settling after a mid-column removal
- [x] 5.14 Implement the chase border descending one pixel per `toptime` steps and killing on contact, and verify the default 1600-steps-per-cell rate and the loss condition
- [x] 5.15 Implement the mode machine (test-explosion, explode, settle, new-grey, new-piece, wait-for-stop) including the `neues_fall_platz` spawn gate, and verify a new piece is held back while grey blobs are still high
- [x] 5.16 Implement loss when a new piece cannot spawn, and verify the level ends immediately
- [x] 5.17 Implement scoring (1 normal, 20 goal, 10 chain, 10 time-bonus step) and verify the mixed 22-point case
- [x] 5.18 Implement win detection on zero goal blobs and the time-bonus animation at 10 points per step, and verify the 300-point case
- [x] 5.19 Implement the level lifecycle (intro, running, won/lost/bonus-complete) and restart with a fresh board, score and random sequence, and verify a restart matches the initial layout
- [x] 5.20 Implement `mirror` level support including the flipped coordinate system reported to Cual, and verify `loc_x`/`loc_y` are mirrored — **the engine side was already there; what was missing was the inventory and the tests.** Upstream reads `ld->mSpiegeln` in eight places across four files, and they are not the same kind of work: four are engine (`blop.cpp`'s `loc_x`/`loc_y`, `blopgitter.cpp`'s three `TAUSCH_BITS`, `ort.cpp`'s `@(dx,dy)`, `fall.cpp`'s rotation swap) and four are drawing (`bildstapel.cpp`, three in `spielfeld.cpp`, two in `fall.cpp`). `mirror.test.ts` is the inventory, so "I already handled mirror" cannot be said about a fifth place nobody listed. **Found while writing it: `loc_p` was wrong for the right-hand field.** It read `position.kind === "fall" && position.right`, and `absort_feld` carries `rechts` exactly as `absort_fall` does — so a blob standing on the right-hand field of a two-player game reported 1 instead of 2. `BlobPosition`'s `cell` variant had no `right` at all, which is why the reading compiled. `absort_nirgends` was also missing from the list of blobs `loc_p` refuses. The corpus has two mirrored levels, `himmel.ld` and `aliens.ld`; `himmel.ld`'s description is "In which direction do balloons fall?" and it asks `kind@(0,-1)`, so the `dy` negation is the difference between a level that works and one that is upside down. Neither is hex, so the odd-column inversion has no level to exercise it

## 6. Level Catalog

- [x] 6.1 Model the three version dimensions (player count, difficulty, track) with their exclusion and exhaustiveness rules, and verify resolution against the spec's examples
- [x] 6.2 Implement the seven tracks from the level summary and verify Standard has 48 levels and All has 70
- [x] 6.3 Implement the three difficulty settings with descriptions and verify a difficulty change alters `numexplode` where the level defines it — **they already existed; what was missing was the text and the check.** `DIFFICULTIES`, a `difficulty` per resolved version and `numExplodeAt(entry, difficulty)` came with 6.1. Upstream has **no user-facing difficulty text at all** — only the specifiers `easy` and `hard` — so the descriptions are ours to write, and they had to be written from the measurement rather than from an assumption about what a difficulty is. All 108 difficulty variants in the corpus, compared field by field against `normal`: `numExplode` differs in **15**, `startRows` in 7, `kinds` in 6, `chainGrass` in 3, and `topTime` and `neighbours` in **none**. Three facts follow, and the descriptions say only these: 14 of the 15 `numExplode` changes are `easy` and **every one lowers** the threshold, so `easy` is the side that moves the number a player feels; `hard` changes anything at all in only **7 of 44** variants and only two touch `numExplode`, so its sentence says "where they wrote any"; and no level anywhere varies the chase border's rate or its connection mode, which is asserted as an absence because it is the obvious thing to assume and a description assuming it would be wrong about all 79. The catalogue now labels the control with the described name and shows the chosen difficulty's sentence in the card — a sentence, in the body rather than a `title`, because a tooltip is not reachable by touch and this project's first platform is a phone. **Before this the button said `easy` and the play suffix said `hard`**: the version tokens, printed where a player sees them. 66 of 79 levels offer a variant, and 13 offer none, which is why the control only appears when a level has more than one
- [x] 6.4 Implement availability gating so levels requiring unsupported modes are skipped rather than failing to load, and verify they are not listed as playable
- [x] 6.5 Implement per-level, per-difficulty progress records (completed flag, best score) with first-completion unlocking the next level in the track, and verify unlock and record-retention behaviour
- [x] 6.6 Implement the level introduction screen data (name, author, description) and the seen-level skip option, and verify both

### Catalogue navigation, from playing it

Recorded from a play session, not designed in advance. The seven tracks do not scale to
79 levels: a player cannot find a level they half-remember the name of, and the list is
long enough that scrolling to the bottom is the only way to see what exists.

- [x] 6.7 Give every level card a small rendered tile — a miniature of its actual board,
  background and kinds — so the catalogue is scannable by eye rather than by name, and verify a tile matches the level it opens
- [ ] 6.8 Group the catalogue into collapsible sections within a track, so a track of 20 is
  navigable, and remember which sections were open
- [ ] 6.9 Add a name search, so a level that is half-remembered can be found
- [ ] 6.10 Add a filter by author, since the levels are not all by one person
- [ ] 6.11 Offer a choice of collection views — by track, by author, by completion, recently
  played — and remember the choice
- [ ] 6.12 Long-press a level card to show the whole track's progress inline, so the
  catalogue can answer "how far through am I" without leaving it

## 7. Presentation

- [ ] 7.1 Implement the canvas board layout that fits the largest centred 1:2 rectangle in the available area and disables image smoothing, and verify on phone and tablet viewport sizes
- [ ] 7.2 Implement per-cell draw-op aggregation ordered own-cell, then before-pass, then after-pass, and verify the composited result for a cross-cell drawing case
- [ ] 7.3 Implement icon decoding into reusable drawable objects with no per-frame allocation, and verify a frame-time measurement stays within budget on a mid-range device profile
- [x] 7.4 Implement level-consistent background, text and chase-border colours, and verify a level's declared `bgcolor` and `topcolor` are used
- [ ] 7.5 Implement the chase border rendering including `toppic`, `topoverlap` and `topstop`, and verify the artwork offset matches `topoverlap`
- [x] 7.6 Implement hex and mirrored rendering, and verify odd columns are offset and a mirrored level is drawn upside down
- [x] 7.7 Implement the 8-step explosion animation rendering, and verify the effect advances over 8 steps and the cell then draws empty
- [ ] 7.8 Implement the HUD: score, level name, grey count, goal count, and verify each updates as specified
- [ ] 7.9 Implement the next-piece preview using the same rendering path, and verify it matches the piece that enters play and reports `informational` true
- [ ] 7.10 Implement the informational indicators for grey count, goal count, connection mode and chain reaction, and verify the connection-mode and chain-reaction indicators reflect the level
- [ ] 7.11 Implement blinking message rendering with the reveal-then-hide wipe, and verify it clears after the configured duration
- [ ] 7.12 Implement result presentation for win and loss including the time-bonus breakdown, and verify the completion screen shows level name, bonus and total
- [ ] 7.13 Implement text rendering with a bundled font that scales with the board, and verify legibility at small viewport sizes
- [ ] 7.14 Implement a deterministic fallback icon for an out-of-range `pos` index, and verify a level requesting a missing index renders rather than failing

## 8. Art Pipeline

- [ ] 8.0 Make kinds distinguishable by **shape**, not only colour

  The palette now keeps every level's kinds at least 20 ΔE apart, and that has a hard
  ceiling: two of the 79 levels have more colour kinds than colour can separate —
  `bonimali.ld` with 42 and `bunt.ld` with **153**. Measured, the palette reaches ΔE
  21.8 on white and 19.9 on black at 42 kinds, and 11.5 at 153. Two blobs 11 ΔE apart at
  cell size are not reliably tellable apart, and no palette fixes that, because the
  problem is the number of kinds rather than the choice of colours.

  Upstream solves it with 153 distinct spritesheets. This project draws procedurally, so
  the answer is a small set of authored shapes that combine with the palette — which is
  8.1 below, and the reason it is worth doing rather than deferring indefinitely.

  Until then those two levels are honestly hard to read, and
  `render/palette.test.ts` names them and their measured numbers rather than asserting a
  property the code does not have.

  The FSF's guidance for AGPL is to attach the notice to the start of each source file.
  This project has no per-file notices, and the shell scripts are the only files that
  carry one — which is the arrangement that let the licence be stated four different ways
  at once (README badge GPL v2, `LICENSE-OR-LATER.md` GPL-2.0-or-later, five scripts AGPL,
  contributor guide GPL-2.0-or-later) with no gate noticing.

  A two-line `SPDX-License-Identifier: AGPL-3.0-or-later` header per file makes the
  licence machine-readable and survives being copied, which a prose file does not. Held
  back from the licence change itself because a 45-file mechanical diff in the same
  commit as a licence change makes the licence change harder to review, which is the
  opposite of what the licence change is for.

- [ ] 8.1 Define the authored base-tile format (shape, palette, material treatment) and verify a tile can be authored and rendered at board scale
- [ ] 8.2 Implement the variant compositor for `schema16`, `schema5`, `schema4`, `schemaDiag16` and `schemaDiag2`, and verify generated variants tile seamlessly against the Cual code of `hormone`, `elemente` and `maennchen`
- [ ] 8.3 Implement the hex variant compositor for `schemaHex4` and `schemaHex8`, and verify the generated set is complete for `unmoeglich`
- [ ] 8.4 Spike the compositor against a tiling level (`kacheln4`, `kacheln6`) and record the outcome; if it cannot cover them, adopt per-level art overrides and verify that path works on one level
- [ ] 8.5 Author base tiles for every kind referenced by the Standard-track levels and verify each level renders with no missing-icon fallback
- [ ] 8.6 Author base tiles for the remaining tracks' kinds and verify all 81 levels render with no missing-icon fallback
- [ ] 8.7 Add a build assertion that no file from `cuyo-2.1.0/data/pics` appears in `dist/`, and verify the assertion fails when a sprite is deliberately copied in
- [ ] 8.8 Review the Standard track visually as an art milestone and record sign-off before extending to the long tail

- [ ] 8.9 Add SPDX identifiers to the source files

## 9. Application Shell

- [ ] 9.1 Implement the screen router (main menu, settings, level select, introduction, game, pause, results) with back navigation that preserves game state, and verify navigating away from and back to a paused level
- [ ] 9.2 Implement the external store bridging the simulation loop to React, and verify the HUD updates while the simulation runs without React re-rendering per step
- [ ] 9.3 Implement the main menu entry points, and verify play, level select, settings and restart are reachable
- [ ] 9.4 Implement the level select screen with name, locked state, completion and best score, and verify a locked level cannot be started
- [ ] 9.5 Implement the pause menu offering resume, restart and abandon, and verify resuming continues the same board
- [ ] 9.6 Implement the settings screen for audio, reduced motion, portrait lock and left-handed layout, and verify each takes effect
- [ ] 9.7 Add a development overlay showing step count, frame time and blob count, and verify it can be toggled
- [x] 9.8 Replace the rules `<details>` dropdown with a centred modal dialog that pauses the game while open, dismissible by backdrop click, Escape and a close button, focus-trapped and restored on close, and rendered in a smaller face distinct from the HUD's

  Done as `app/RulesDialog.tsx` on a `<dialog>` with `showModal()`, which supplies the
  top layer, the backdrop, Escape and page inertness for free; the focus trap and the
  restore are applied from `app/dialog.ts`, because those are decisions rather than
  mechanics. Pause is `GameLoop.paused`, set from PlayScreen — the loop lives outside React,
  so routing it through state would make closing the dialog and resuming two updates that
  could disagree for a frame.

  Two things came out of it that were not in the task:

  - **The loop had no test at all**, because `requestAnimationFrame` does not exist in
    Node. It now takes an injected `FrameClock` (`app/testing/manual-clock.ts`), which is
    10 tests covering the pause, the resume, and — the one that matters — that the
    accumulator does not fast-forward the backlog accrued during a pause. Without that last
    one, opening the rules would have been what killed the piece the modal was meant to
    protect. Task 13.4 asked for this; the pause made it worth doing now.
  - **`app/hud.test.ts` had to move**, since its subject no longer exists. Its five
    assertions about the dropdown's positioning are now about the dialog, and the CSS test
    reads markup with comments stripped — otherwise the `not.toContain("<details")`
    matched my own explanatory comment and passed a regression.

## 10. Mobile Experience

- [ ] 10.1 Implement the shared intent stream (left, right, turn, fastDrop) that touch, mouse and keyboard all feed, and verify all three produce identical behaviour
- [ ] 10.2 Implement on-screen controls with delayed auto-repeat and cancel-on-opposite, and verify the documented hold behaviour
- [ ] 10.3 Implement drag-to-steer and tap-to-rotate gestures with pointer capture, and verify a drag moves the piece by the drag distance and a tap rotates
- [ ] 10.4 Implement swipe-down fast drop, and verify it engages for the gesture duration only
- [ ] 10.5 Implement the one-handed control layout positioned in the lower thumb zone, and verify on a portrait phone viewport
- [ ] 10.6 Implement responsive layout for portrait and landscape across phone and tablet sizes, and verify nothing is clipped and no horizontal scrolling occurs when rotating mid-game
- [ ] 10.7 Implement safe-area inset handling so controls clear notches and gesture bars, and verify with a simulated inset
- [ ] 10.8 Implement keyboard controls including Escape opening pause, and verify on a desktop viewport
- [ ] 10.9 Implement the portrait-lock preference that requests orientation on start, and verify both enabled and disabled states
- [ ] 10.10 Implement the reduced-motion option suppressing non-essential animation while preserving gameplay information, and verify blob idle animations and menu transitions are suppressed
- [ ] 10.11 Implement audio setup deferred to the first user gesture with mute and volume controls, and verify silence before the gesture and sound after it
- [x] 10.12 Verify the rules dialog of 9.8 on a portrait phone: readable at the smaller size, reachable with one thumb, and that pausing covers the case where it is opened mid-fall

  Verified on a phone against `f052ecb` before #7 merged: the smaller face reads, the
  dialog is clear of the board, and the catalogue footer beside it is legible at real size
  rather than only in a shrunk screenshot. The backdrop at 62% and the close button placed
  last and left-aligned were both guesses made without a screen; both survived being looked
  at.

## 11. PWA and Persistence

- [ ] 11.1 Add the web app manifest with name, icons, theme colours and display mode, and verify the install prompt is offered
- [ ] 11.2 Implement the generated precache list and a cache-first service worker, and verify a cold offline load serves the shell and all level data
- [ ] 11.3 Version the cache name from the build hash with skipWaiting and clients.claim, and verify a redeploy does not strand a stale bundle
- [ ] 11.4 Implement the versioned local-storage layer for settings, completion records and best scores, and verify values persist across a reload
- [ ] 11.5 Implement the corrupt-data fallback so unreadable storage yields defaults, and verify the game still launches
- [ ] 11.6 Verify the installed game launches and plays with the network disabled and issues no requests at runtime

## 12. Verification

- [x] 12.1 Encode the man page's worked examples as tests: division/modulo table, neighbour pattern, six `@`-assignment cases, busy switch, apple/orange kind constants, and `startdist` rows
- [x] 12.2 Encode the source-derived constants as a single documented module and assert each value against `src/spielfeld.cpp`, `src/leveldaten.h` and `src/code.h` in comments
- [x] 12.3 Add engine scenario tests driving real input sequences and asserting board state for one level end to end, including a win and a loss
- [ ] 12.4 Make the build gate compile all bundled levels and verify `npm run build` fails on any level that does not parse or compile
- [ ] 12.5 Measure frame time with the development overlay on a mid-range device profile and verify the board stays within budget with a full board and active animations
- [ ] 12.6 Verify the Standard track is playable end to end on a real phone, including touch controls, orientation change and offline start
- [ ] 12.7 Verify every track loads and each level reaches a running state without a runtime error in its first steps
- [x] 12.8 Delete the last corpus-absence skip, in `render/palette.test.ts`

  The suite reads the level files and returns early when they are missing, which reads
  exactly like a pass. The level files are committed as of the `levels-in-tree` work, so
  there is nothing left to guard against and the skip can go.

  It could not be done in that same change: the palette suite and the vendored levels
  arrived on separate branches, and the test can only point at `levels/upstream/` from a
  branch that has it. It is recorded here rather than forced into either, because a test
  that silently checks nothing is a small thing that hides a large one — the whole point
  of the property is that two kinds in one level are never the same colour.

  **Closed, and the task's premise was wrong in a way that mattered.** It said "the level
  files are committed, so there is nothing left to guard against" — but this suite read
  `.context/upstream-cuyo/data`, which is **gitignored** (`.context/.gitignore` is `*`, it
  holds the upstream GPL sources). So the skip was live, not dead: on CI and on every fresh
  clone the whole of `describe("the real corpus")` returned immediately and reported
  success. The property is that two kinds in one level are never the same colour, and it
  had never been checked anywhere but this machine.

  Repointed at `levels/upstream` (83 committed files, every filename the catalogue names),
  then the skip and `hasCorpus()` are gone. What it measures now: **79 levels examined,
  70 with a pair to measure, 9 with fewer than two colour kinds.** The census was
  `toBeGreaterThanOrEqual(65)`, which 70 satisfies and which a corpus that had quietly lost
  14 of the levels that matter would also have satisfied — the failure this task exists to
  prevent, sitting inside the task that fixes it. It is now exact in both directions:
  every level in the catalogue is read, and every level with a pair contributes a row.

  **And the mutation showed the one thing the test cannot catch by itself.** Pointing
  `DATA_DIR` back at the gitignored tree leaves all 27 tests green *on this machine*,
  because that tree exists here. Green and wrong, and only a CI run would notice — so the
  constraint is asserted directly: the corpus must not come from `.context`.

## 13. Coverage

The floors below come from design.md decision 12. Percentage floors catch wholly
untested files; the per-table tests are what protect fidelity, so both are needed.

- [x] 13.1 Test every neighbour-mode offset table against upstream's own `bx`/`by` digit strings from `NachbarIterator::setXY`, including the shifted and unshifted hex columns, and verify all ten modes are covered
- [x] 13.2 Test `connected` and component computation for each neighbour mode, and verify inhibition breaks a connection in the suppressing blob's own frame only
- [x] 13.3 Extract the renderer's pure geometry, colour derivation and cell-origin maths into canvas-free functions and unit-test them in Node, verifying hex column offsets and mirrored cell origins
- [ ] 13.4 Drive the frame loop's accumulator with an injected clock and verify it executes one step per 80 ms, clamps a long backlog rather than fast-forwarding, and honours pause
- [ ] 13.5 Add behaviour tests for input timing under a DOM environment: immediate move, delayed repeat, repeat rate, and cancellation on the opposite direction
- [x] 13.6 Set coverage thresholds in the test config at the levels in design.md decision 12 and verify the suite fails when a file is left untested
- [x] 13.7 Record the achieved coverage per tier in the README whenever it is measured, so regressions are visible in review rather than discovered later
- [ ] 13.8 Mount `PlayScreen` in a DOM environment and verify it sizes the canvas from the space its parent actually offers, so the component cannot re-introduce the four-times-too-tall board that `render/board.test.ts` cannot catch from outside

## 14. Linting and continuous integration

Documentation is a deliverable here, not a by-product: the man pages and the C++
sources are the specification this project is written against, and a transcribed
constant with no citation is indistinguishable from a guess. So both the code and
the prose are linted, and GitHub runs the same gates `make lint` does — a check
that passes locally and fails on a push is a check nobody trusts.

The agent-facing output mode is part of this group rather than a convenience:
this project is worked on by an agent that pays for every line of tool output, so
`CUYO_AI_MODE=1` has to keep the tokens down without ever hiding a failure.

- [x] 14.1 Add a Makefile wrapping the npm scripts, with `help`, `lint`, `test`, `build` and `check`, and verify no target defines a check that `npm run` does not
- [x] 14.2 Add markdownlint-cli2 with a checked-in rule set, and verify the hand-written docs lint clean
- [x] 14.3 Choose and record the documentation exclusions, including the `.caim` and `.context` symlink case, and verify the session transcript is not pulled into the lint
- [x] 14.4 Add shellcheck over `scripts/` with a pinned CI version, and verify both scripts are clean
- [x] 14.5 Add `CUYO_AI_MODE=1` to suppress make banners, the npm notice preamble and echoed command lines, and verify a failing command still exits non-zero with its output intact
- [x] 14.6 Measure the token saving rather than assuming it, and record the figure; verify that forcing a terser vitest reporter is not an improvement and say why
- [x] 14.7 Add a GitHub Actions workflow with one job per gate - lint, docs, shell, specs, test, build - so a failure names itself
- [x] 14.8 Add a fetch script for the upstream Cuyo tree with a pinned URL and SHA-256 from Debian's `.dsc`, and verify the tree it produces is byte-identical to the hand-placed one
- [x] 14.19 Record the real upstream provenance in `ATTRIBUTION.md` — GNU Savannah group 857, `karimmi.de/cuyo/`, GPL v2+ — and correct the false claim that there is no upstream, and the stale `../cuyo-2.1.0` path and `cuyo.de` URL
- [x] 14.20 Make the fetch script refuse an oversized body up front, so a URL that redirects somewhere unexpected fails in seconds rather than after downloading the wrong thing
- [x] 14.9 Add a CI job asserting no upstream artwork reached `dist/`, and verify it fails when a sprite is deliberately copied in
- [x] 14.10 Add a CI job that runs the gates through `CUYO_AI_MODE=1` and asserts the output really is terse, and verify it fails when a banner is reintroduced
- [x] 14.11 Add a CI job asserting the human-facing banners are still present, and verify it fails when `AI_ECHO` is inverted
- [x] 14.12 Document the AI mode in `.agents/rules/cuyo-standards.md` and the README, including the measured saving
- [x] 14.13 Correct the README's upstream clone instruction, which names a repository that does not exist
- [ ] 14.14 Add a formatter check, and record why no formatter was adopted earlier: the code is hand-formatted at 80 columns with aligned tables, and running one now would rewrite every file for no rule that catches a defect
- [ ] 14.15 Add a licence-header check over source and scripts, and verify `ATTRIBUTION.md` and the GPL notices are named from it
- [ ] 14.16 Add a CI job that runs `npm audit` and fails on a high or critical advisory, with a documented allow-list and an expiry date for each entry
- [x] 14.17 Add coverage reporting to CI once 13.6 sets the floors, so a drop below them fails the build rather than appearing in a diff
- [ ] 14.18 Add a scheduled weekly job that re-fetches the corpus and re-runs the level-format suite, so an upstream release is noticed rather than discovered

## 15. Wiring the runtime to the game

Groups 2 and 3 built the reader and the runtime and the two were never joined, which task
12.3's scenario tests made measurable rather than suspected: all 79 levels loaded, no input,
2500-step cap, **9 won and 69 lost**, and a goal blob is ever removed in exactly those 9. Nothing
runs a level's Cual. `loader.ts` does not import the Cual compiler, `LevelDef` has no field for
a program, `Simulation` has no step that runs one, nothing implements `cual-runtime`'s
`Animatable` or `AccessField`, and nothing calls `runStep` outside its own test. `Blob.vars` is
allocated by `board.ts` and read by nobody — a placeholder left for exactly this.

The order within a step is upstream's, not a guess. `cuyo.cpp:422-542` runs the border, random
greys, the falling piece, the row transfer and the explosion test, then `Spielfeld::spielSchritt`,
and only then `animiere()` at `cuyo.cpp:473` — **so the rules run first and the blobs' code last.**
`Spielfeld::animiere()` (`spielfeld.cpp:885`) then visits the fixed grid column-major
(`blopgitter.cpp:81`, `for x { for y { … } }`), the falling piece, the preview, the active info
blobs and the semiglobal, and `runStep` in `global.ts` already encodes exactly that.

Which code a kind runs is also settled upstream (`sorte.cpp:98-131`): **the procedure named after
the kind**, and where a kind has none, a default chosen by its picture count — `default1`,
`default2`, `default2g` for grass, `default3`, and never for the global or semiglobal. All of
them live in `globals.ld`, which the loader already reads. So most kinds run no code of their own,
and wiring without the defaults would leave the great majority of the corpus inert.

- [x] 15.1 Extract a level's Cual program from its parsed `.ld` and `globals.ld` into a value — the level's procedures, and for every kind the resolved draw code, being its own named procedure or the default its picture count selects — as a pure function of the two parsed files, and verify it across all 79 levels
- [x] 15.2 Give `Kind` its draw code and `LevelDef` its program, and build both in `LevelLoader`, so a loaded level carries the code it is about to run
- [ ] 15.3 Replace `Blob`'s unused `vars: Int32Array` with a real `BlobStore`, allocated per blob against one shared `TimeSlices` per board, so each cell has the variable array `AccessField.at` has to hand back
- [ ] 15.4 Implement `AccessField` over the live `Board` — `at`, `global`, `semiglobal`, `here`, `hex`, `hexShift`, `mirrored`, `players`, `fallCount` — and verify each against what the addressed access already does on a hand-built field
- [ ] 15.5 Implement `Animatable` for one blob: its kind's draw code, its own store, and `animate()` as `braucheLeereStapel` then `initSchritt` then the code
- [ ] 15.6 Run the blobs' code at the end of `Simulation.step()`, through `runStep`, in the order `cuyo.cpp:473` uses — and with the picture stacks cleared and one window opened around it
- [ ] 15.7 Verify the wiring against the corpus: re-run the 12.3 survey and record how many of the 79 levels' outcomes changed, and name a level whose blobs now move on their own
