## Context

The repository currently holds only the upstream Cuyo 2.1.0 source tree. It is a
C++/SDL 1.2 program whose levels are described in a bespoke data language (`.ld`)
and whose per-blob graphics and behaviour are written in Cual, a small scripting
language implemented with flex/bison and a tree-walking interpreter over `Code`
objects (`src/code.h`, `src/parser.yy`). See proposal.md - Why for motivation.

Constraints that shape the approach:

- The original cannot be built or run here: no C++ compiler, no SDL 1.2, no
  bison/flex. Behaviour must therefore be read out of the sources and the two
  man pages (`docs/cual.6`, `docs/cuyo.6`) rather than diffed against a running
  binary. This makes *executable* characterisation tests, not visual comparison,
  the primary correctness mechanism.
- Roughly 81 levels exist. Most embed substantial Cual. A port that skips Cual
  would have to rewrite levels and would lose their character, so Cual is in
  scope.
- `grx=10`, `gry=20`, `gric=32`, an 80 ms step, and per-blob `int` variable
  arrays with a begin-of-step shadow copy are load-bearing details of the original
  semantics, not incidental implementation choices.
- No backend. Everything ships static and runs offline.

## Goals / Non-Goals

**Goals:**

- A headless simulation package with no DOM, canvas or framework dependency, so
  that all of `game-core` can be tested in Node with no browser harness.
- Faithful reproduction of the documented and source-derived rules, verified by
  tests rather than by comparison with the original binary.
- A Cual implementation that reproduces the original's *structural* semantics -
  particularly busyness and the begin/end-of-step variable snapshots - because
  level animation depends on them.
- A single build-time validation pass so that an unsupported language construct
  or a malformed level fails the build, not a player's session.
- Rendering and UI that are independent of the simulation, so that visual work
  cannot destabilise the rules.

**Non-Goals:**

- Two-player mode, the AI opponent, and row gifting. The version/track machinery
  still parses `[2]` definitions, but no second board is driven.
- Replaying or importing `.ld` files authored by third parties at runtime.
- Reproducing the original's window chrome, menus, fonts or sprites.
- Shipping the original artwork or the Impulse Tracker music module.

## Decisions

### 1. Package layout

A single Vite application with the simulation as a framework-free package inside
it, separated by directory rather than by a published package:

```
cuyo-web/
  engine/          # game-core + level-format + cual-runtime, no DOM
  app/             # React shell, routing between screens
  render/          # canvas renderer, art atlas, effects
  levels-src/      # build-time .ld reader + validator + index generator
  public/          # built assets, PWA manifest
```

**Alternative considered:** a monorepo with `engine` as a separate npm package.
Rejected as ceremony for a single deployable; the directory boundary plus a lint
rule forbidding DOM access in `engine/` gives the same protection.

### 2. `.ld` stays the single source of truth; build-time validation, runtime parse

A build step reads `cuyo-2.1.0/data/summary.ld` plus every included `.ld`, parses
and compiles the whole set, and:

- **fails the build** on any parse or compile error, with file/line/construct;
- emits a small JSON index (level id, track, display name, author, description,
  per-difficulty `numexplode`) used by level select without loading any level body;
- emits the art-key manifest described in decision 7;
- copies the `.ld` sources into `public/levels/` for runtime loading.

At runtime a level is parsed on demand when first played and cached in memory.

**Rationale:** avoids designing a serialised AST format that would immediately
become a second source of truth needing its own versioning, while still turning
every level into a build failure rather than a runtime surprise.

**Alternative considered:** serialising the compiled AST into the bundle. Smaller
parse cost at startup, but adds a serialisation format to keep in sync with the
compiler, and pushes compile errors to runtime. Rejected.

**Consequence:** runtime parsing of ~500 KB of `.ld` on first play of each level.
Mitigated by a brief loading state and by parsing in a Web Worker so the shell
stays responsive.

### 3. Cual compiles to a code tree; busy flags live in the blob's variable array

This mirrors the original and is the load-bearing choice for fidelity. Each Cual
construct becomes a node in a tree. Every node that can be "busy" is assigned a
variable index at compile time, and each blob's single `Int32Array` of variables
holds that node's busy flag alongside its user variables. Because a blob owns its
own array, a shared node yields per-blob busy state for free, with no
per-blob-node map.

Execution is a walk of the tree that threads a `busy` result back up through
`;` (busy while either side is busy) and `,` (busy until all members have run),
matching the original's definitions.

Deferred writes (`@`/`@@` targets) are collected in a queue and applied at
end-of-step. The begin-of-step shadow copy is refreshed per *time slice*, not per
step, matching `gAktuelleZeitNummerDatenAlt`; draw, key and land events each open
their own slice.

**Alternatives considered:**
- *Closure-tree interpreter* - simpler to write, but loses the ability to give
  each node a distinct variable slot cheaply and obscures the step/slice
  snapshot boundary.
- *Flatten to a register VM with explicit bytecode* - fastest, but the busy flag
  becomes a runtime register the compiler must allocate; a large increase in
  complexity for a workload that is nowhere near hot (200 cells).

### 4. One seeded RNG, drawn from a single instance

Every random decision - falling kinds, grey kinds, grey placement, random grey
arrivals, `rnd()` and `a : b` - comes from one seeded PRNG (xorshift128+ or
mulberry32) owned by the simulation. The draw op itself uses no randomness.

**Rationale:** `game-core` requires that a seed plus an input sequence reproduces
a game exactly; a single instance makes that structural rather than a convention
to be policed. It also makes seeded regression tests and bug repro possible.

**Trade-off:** replays are only reproducible if the *step* boundaries match, since
random draws are consumed per step. Documented rather than hidden: a replay is
"same seed + same inputs", not a byte-exact save file.

### 5. Fixed 80 ms timestep with an accumulator, plus render interpolation

The simulation advances in 80 ms steps from an accumulator driven by
`requestAnimationFrame`; the renderer may draw more often and interpolates the
falling piece's sub-cell pixel offset within the current step so motion looks
smooth on a 120 Hz phone.

**Rationale:** the original's 80 ms cadence is part of the feel, and several
level behaviours are expressed in steps (`1:100`, `toptime`, "after 750 steps do
something"). Variable-dt would break those. Interpolation keeps it from looking
choppy without contaminating the rules.

**Guard:** if the tab has been backgrounded, the accumulator is clamped so the
game does not fast-forward through dozens of steps on return; the original pauses
on focus loss and so do we.

### 6. Draw ops are aggregated per cell, then composited

Each blob's draw commands append to a per-blob stack. At end-of-step the renderer
gathers every draw op addressed at each cell, orders them
own-cell, then `@(...) *` before-pass, then `*@(...)` after-pass, and composites
them into that cell's tile in one pass.

**Rationale:** the original does exactly this with `BildStapel` and uses the
comparison of consecutive stacks to decide what to repaint. We keep the ordering
rule because levels depend on it, but always repaint a dirty cell rather than
diffing stacks - at 200 cells the diffing costs more than the repaints.

Icons are decoded once at load into `ImageBitmap`s (or a canvas atlas) and drawn
without per-frame allocation. A single `Path2D`/sprite-per-cell loop keeps the
frame cost negligible.

### 7. New art is generated from an authored base shape plus a variant compositor

This is the decision that makes "fully new art" tractable. Level Cual selects an
icon by *index* (`pos`), and the standard schemas (`schema16`, `schemaDiag2`,
`schemaHex4`, ...) ask for specific indices meaning "this neighbour pattern". So
artwork cannot be arbitrary: a kind whose code uses `schema16` needs 16 variants
that tile seamlessly with each other.

Rather than hand-draw every variant, each kind is authored as a **base tile**
(shape, palette, material treatment) and the build generates the variant set by
compositing edge and corner pieces according to the requested neighbour pattern.
Levels whose Cual draws arbitrary indices get the base tile plus the generated
set; an out-of-range index renders a deterministic fallback rather than failing.

**Consequence to be explicit about:** artwork is still authored per kind per
level - 81 levels reference several hundred kinds. The compositor removes the
multiplier (one shape, not 16 icons) but not the authoring. This is the single
largest ongoing content cost and should be scheduled as its own workstream.

**Resolution model.** Because the artwork is new, a picture name in a `.ld` file
cannot be a file path: it is a *logical art key*. A build step scans every `.ld`
file, extracts the full set of picture names the levels reference, and emits an
art manifest mapping each key to one entry. The level loader resolves picture names
through that manifest and never touches the filesystem, so a missing image file is
impossible by construction rather than merely disallowed.

This ordering matters and is deliberate: **the manifest of keys is produced before
any artwork exists.** Keys are derived mechanically from the `.ld` sources, so the
build-time level-validation gate can verify that every referenced key is registered
long before a single tile is drawn. Artwork is then filled in behind those keys as
the art workstream proceeds. Doing it the other way round would mean the gate could
not run until the art was finished, collapsing the two workstreams into one and
making the gate useless as early feedback.

### 8. React owns the chrome; the engine owns the loop

React renders menus, HUD and overlays. The simulation runs outside React as a
plain object driven by its own rAF loop, and the HUD subscribes to it through a
small external store with `useSyncExternalStore`. React never re-renders per game
step; the HUD pulls a throttled snapshot (score, counts, state) roughly ten times
a second, and the canvas draws independently.

**Rationale:** a per-step React render of a 12.5 Hz loop would add reconciliation
cost for no benefit, and the canvas has to run at frame rate regardless. This is
the main reason React is used only where it earns its place.

**Alternative considered:** all-canvas UI. Rejected - menus, settings and level
select are ordinary forms and lists; DOM gives accessibility and layout for free.

### 9. Versioned local storage with a total-failure fallback

Settings, completion records and best scores are stored under a single versioned
key. Reads are wrapped so that any parse error yields defaults instead of
throwing during startup.

**Rationale:** the spec requires launching even with corrupt data, and this is the
simplest way to guarantee it. The schema stays small enough that a migration
function per version is cheap.

### 10. Hand-rolled service worker and manifest

A precache list is generated from the build manifest; the fetch handler serves
cache-first for precached assets and never touches the network for anything else.
Audio is decoded and unlocked on first user gesture.

**Alternative considered:** `vite-plugin-pwa`. Attractive, but adds a
Workbox-derived dependency and a generateSW config whose behaviour is harder to
reason about than the ~100 lines we would own. Given "no server, fully offline,
installable", hand-rolling is proportionate.

### 11. Pointer Events with a shared DAS model

Touch, mouse and keyboard all funnel into one intent stream (`left`, `right`,
`turn`, `fastDrop`) with a single delayed-auto-repeat implementation, so
behaviour is identical across input methods. Pointer capture handles drags that
leave the control.

**Rationale:** the spec requires held-direction repeat with a cancel-on-opposite
rule; implementing it once and mapping three input methods onto it avoids three
divergent implementations.

### 12. Tests: engine tests in Node, golden cases from documented rules

Because the original binary is unavailable, correctness is established by
characterisation tests written from the documented semantics and from constants
read out of the sources - `hetzrand_dy_auftauch = 8`, `neues_fall_platz = 5`,
`graue_bei_kettenreaktion = 5`, score constants 1/20/10/10, neighbour offset
tables in `NachbarIterator::setXY`, `divv`/`modd` rounding in `code.h`.

Suites: pure-function tests for expressions and `divv`/`modd`; Cual compiler and
VM tests including the busy and snapshot examples from `docs/cual.6` verbatim;
`.ld` parser tests including the versioning and `startdist` examples from the
man page; and engine scenario tests driving inputs and asserting board state.

**Rationale:** it is the only available oracle, and the man pages contain worked
examples that were written to be normative.

#### Transcribe-against-source, not transcribe-against-itself

Tables and constants copied out of C++ are the highest-risk code in the port,
because a slip does not crash: a wrong neighbour offset makes a level connect
blobs in the wrong directions and quietly play wrong. So wherever a table is
transcribed, the test encodes **upstream's own representation** and derives the
expectation from it, rather than restating the ported table. The neighbour-offset
tests, for instance, embed `NachbarIterator::setXY`'s `bx`/`by` digit strings and
decode them the way the C++ does, so a mismatch fails loudly.

The same applies to the constants module: every value carries the `src/` line it
came from.

#### Testability seams

`engine/` is testable in plain Node with no host globals (decision 1), so it needs
no seam. The other two tiers do:

- **`render/`** must keep pure geometry, colour derivation and layout maths free of
  canvas calls, so those are unit-testable in Node. Only the final
  `fill`/`stroke` calls touch a context. A canvas context is not available in a
  Node test, so a renderer test that needs one is a smell pointing at logic in the
  wrong place.
- **`app/`** runs under a DOM environment rather than `node`, and the frame loop is
  written so its accumulator can be driven by an injected clock instead of
  `requestAnimationFrame`.

#### Coverage is a ratchet, not a goal

Coverage percentage is a process attribute, not a behaviour, so it is deliberately
**not** a spec requirement. It is tracked here instead, and enforced as a floor
that may rise but never fall:

| Tier | Target | Enforced by |
| --- | --- | --- |
| `engine/` | ≥ 90% statements, ≥ 85% branches | coverage thresholds in the test config |
| `render/` | ≥ 80% statements | coverage thresholds |
| `app/` | covered by behaviour tests; no percentage floor | review |

A percentage floor is a weak signal on its own and is treated as such: it catches
whole untested files (as it did here, where `render/` and `app/` were at 0%), but
it says nothing about whether the *interesting* paths are exercised. The
transcribe-against-source tests above are what actually protect fidelity, and they
are written per table rather than per line.

**Measured baseline at first playable build** (2 hand-transcribed levels, engine
plus renderer plus UI present): 65.7% statements overall, with `engine/` at 97.6%
and `constants.ts` branch coverage at 12.5%. That 12.5% is the finding that
motivated this section — the neighbour tables were almost entirely unexercised
precisely because only the two rectangular modes had been implemented.

### 13. The port is GPL-2.0-or-later

The repository ships the GPL upstream source and the derived work reproduces its
mechanics and reuses its `.ld` level data, so the new code is licensed
GPL-2.0-or-later with attribution. The build step asserts that no file from
`cuyo-2.1.0/data/pics` ends up in `dist/`, keeping the "new art" decision honest
rather than merely intended.

## Risks / Trade-offs

- **Original cannot be run, so subtle divergences may go unnoticed.** → Mitigate
  by treating the man pages and the C++ sources as the specification, encoding
  every magic constant found there explicitly in a documented constants module,
  and adding a test per documented rule. Accept that pixel-exact parity is not
  claimed; parity of *rules* is.
- **Cual is a large surface; an unnoticed gap breaks many levels at once.** →
  Mitigate by making the build-time compile of all 81 levels a hard gate, so a
  gap surfaces immediately rather than in front of a player, and by porting the
  worked examples from the man page as tests first.
- **Art authoring for several hundred kinds is the real schedule risk, not
  code.** → Mitigate by sequencing: engine + Cual + a handful of levels first,
  then the art compositor, then bulk art work, with the level list ordered so
  that the Standard track is complete before the long tail.
- **Generated variant art can look mechanical** across many kinds. → Mitigate by
  giving each kind an authored base tile with distinct shape language and
  material treatment, and by reviewing the Standard track visually as an art
  milestone rather than shipping all levels at once.
- **`mirror`, hex half-integer coordinates and 2-player `@(x;side)` are the
  easiest parts of Cual to get subtly wrong.** → Mitigate with dedicated tests
  for each, written before the corresponding features are used by any level.
- **Per-cell draw op aggregation could become slow if a level redraws every cell
  every step with many overlays.** → Mitigate by measuring frame time in a
  development overlay and, if needed, falling back to stack-diffing per cell.
- **Browser autoplay policy blocks audio until first gesture.** → Mitigate by
  deferring audio setup to the first interaction and treating silence before
  that as expected.
- **PWA caching can strand users on a stale bundle after a deploy.** → Mitigate
  by versioning the cache name with the build hash and using a skipWaiting plus
  clients.claim flow with a reload prompt.

## Migration Plan

Not applicable in the deployment sense - this is a new static application with no
existing users and no data to migrate. The rollout is incremental:

1. Engine + Cual + `.ld` pipeline green, validated by tests, with one level
   playable end to end on a phone.
2. Art compositor plus art for the levels of the Standard track; the track ships
   as the first playable milestone.
3. Remaining tracks, difficulty polish, PWA install and offline verification.

At every stage the result is a complete, playable static build; there is no
partial-migration state and nothing to roll back beyond redeploying the previous
build output.

## Open Questions

- Whether the procedural variant compositor can cover the schemas used by the
  most idiosyncratic levels (`schemaHex8` in `unmoeglich`, the tiling levels'
  per-quarter logic) without per-level art overrides. This is answerable by
  prototyping the compositor against one tiling level; it does not change the
  specs, and if it turns out to be impossible the fallback is per-level art
  overrides, which is an implementation detail.
- Whether the original `.it` music module should be replaced by a new looping
  soundtrack or omitted entirely. Deferred deliberately: it affects presentation
  only and no spec requirement depends on music.
