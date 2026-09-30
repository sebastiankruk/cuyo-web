<!--
Reconciliation note (group 5, after the first playable build)

Work was done ahead of the plan order to get a playable build, so the checkboxes
lagged. On review, a task counts as done only when the implementation exists AND
the verification it names exists and passes. That is a stricter bar than
"the code is written", and several items fall short of it.

Fully done and verified: 5.1-5.5, 5.9, 5.10, 5.14.

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
  5.20 the flipped coordinate system reported to Cual needs the Cual runtime

Groups 7, 9 and 10 have substantial code but no task is complete against its own
bar: 7.2, 7.3, 7.9-7.11, 7.13 need Cual or the art pipeline; the rest are
implemented but unverified. Group 7 is honestly 0/14 by that bar, 9 is 0/7 and
10 is 0/11.
-->

## 1. Project Setup and Toolchain

- [x] 1.1 Scaffold a Vite + React + TypeScript app at `cuyo-web/` and verify `npm run dev` serves it and `npm run build` produces `dist/`
- [x] 1.2 Add a Node test runner and verify a trivial unit test runs headlessly with `npm test`
- [x] 1.3 Create the `engine/`, `app/`, `render/`, `levels-src/` directory split and verify a lint rule fails on any DOM reference inside `engine/` (boundary test)
- [x] 1.4 Add `LICENSE` (GPL-2.0-or-later) and an attribution notice crediting Immanuel Halupczok and the cuyo developers, and verify it is referenced from the README
- [x] 1.5 Add a deterministic test-only PRNG stub so engine tests do not depend on the production RNG implementation, and verify both produce reproducible sequences in their own tests

## 2. Level Data Format (`.ld`)

- [x] 2.1 Implement the `.ld` lexer (comments, identifiers, words, quoted strings, numbers, punctuation, version brackets) and verify it tokenises every file in `cuyo-2.1.0/data/` without error
- [ ] 2.2 Implement the `.ld` parser for top-level and nested section definitions, and verify sections and definitions are read from a fixture matching the `example.ld` structure
- [ ] 2.3 Implement the `*` repeat shorthand and the `<expression>` arithmetic (with `+ - * / %` over literals and defined names) and verify the man page's worked examples
- [ ] 2.4 Implement version resolution (most specific applicable subset wins) including the mutual-exclusion and exhaustiveness rules, and verify the documented `[1] [2] [easy] [hard]` examples plus the ambiguity-rejection case
- [ ] 2.5 Implement kind declaration lists (`pics`, `greypic`, `startpic`, `emptypic`), the successive kind constants, first-use-wins naming and per-kind overrides, and verify the apple/orange/pear/banana/pineapple example from the man page
- [ ] 2.6 Implement level-wide setting extraction with documented defaults (`toptime` 50, `chaingrass` 0, `mirror` 0, colours, `randomfallpos`, `randomgreys`, `nogreyprob`) and verify defaults apply when omitted
- [ ] 2.7 Implement `neighbours` mode parsing including the hex-mode flag, and verify each of the ten modes resolves correctly
- [ ] 2.8 Implement `startdist` decoding (row alignment, `.`/`+`/`-`/`*`, `distkey` version offsets, the 4- and 8-character informational last row) and verify the man page's example rows
- [ ] 2.9 Implement the random-cell neighbour-avoidance retry used for `+` cells and verify a filled start layout contains no accidental same-kind adjacency beyond what the layout declares
- [ ] 2.10 Implement picture names as logical art keys resolved through the art manifest with no filesystem access, and verify a declared key resolves to a manifest entry and an unregistered key fails with the key and kind named
- [ ] 2.11 Implement the build step that scans every bundled `.ld`, extracts the full set of referenced picture names and emits the art-key manifest, and verify every referenced key is registered with an entry
- [ ] 2.12 Implement structured load diagnostics (file, definition, reason) for unresolvable art keys, wrong row lengths and undefined `numexplode`, and verify each produces a specific error
- [ ] 2.13 Implement the build-time validator that parses and compiles all levels in `summary.ld` plus its includes and **fails the build** on the first error, and verify it passes on the unmodified upstream data
- [ ] 2.14 Implement the level index generator (id, tracks, name, author, description, per-difficulty `numexplode`) and verify it is emitted and contains the 48 Standard-track levels
- [ ] 2.15 Implement runtime level loading that fetches a `.ld` on demand, parses it and caches it, and verify a second request for the same level hits the cache

## 3. Cual Runtime - Foundations

- [ ] 3.1 Implement `divv`/`modd` with the documented mathematical rounding and verify the man page's table including negative divisors
- [ ] 3.2 Implement the Cual expression evaluator with all operators at the documented precedence, bit set/unset/test and range comparison, and verify a test per operator group
- [ ] 3.3 Implement `rnd(n)` and `gcd(a,b)` on the simulation RNG and verify `rnd` stays in range and `gcd` matches known values
- [ ] 3.4 Implement the Cual lexer (keywords, identifiers, numbers, letters, patterns, strings, all operators and both arrows) and verify it tokenises `globals.ld` and every level's Cual block
- [ ] 3.5 Implement the Cual parser producing a code tree covering procedures, variable declarations, `default`, assignments and compound assignments, scoped `[x=e]` blocks, `if`/`else`, `switch`, comma sequences, `busy`, draw commands and effect commands, and verify all 81 levels parse
- [ ] 3.6 Implement compile-time variable slot allocation, including the reserved slot per potentially-busy code node, and verify slot counts are stable for a repeated parse
- [ ] 3.7 Implement the per-blob variable store as a single `Int32Array` holding user variables and busy flags, and verify busy flags are independent between two blobs of the same kind
- [ ] 3.8 Implement the begin-of-step shadow copy with per-time-slice refresh (draw, key and land events each opening their own slice) and verify the six documented `@`-assignment examples produce exactly the documented results
- [ ] 3.9 Implement the deferred write queue applied at end-of-step, and verify a cross-blob write is invisible until the step ends
- [ ] 3.10 Implement neighbour-pattern expressions including the empty-blob out-of-board rule and the start-of-step snapshot, and verify the `1???0???` example from the man page

## 4. Cual Runtime - Execution

- [ ] 4.1 Implement the code-tree walker threading busy state through `;` (busy while either side) and `,` (busy until all members ran), and verify the documented busyness rules
- [ ] 4.2 Implement `if`/`else` and `switch` with both arrow forms, and verify `->` re-tests every step while `=>` latches
- [ ] 4.3 Implement the comma-sequence animation advancing one command per step, and verify the latching `switch` example runs its animation to completion before resuming the default branch
- [ ] 4.4 Implement the system variables (`file`, `pos`, `kind`, `version`, `qu`, `out1`, `out2`, `weight`, `inhibit`, `behaviour`, `falling_speed`, `falling_fast_speed`) with per-step resets for `file`, `pos`, `qu` and the debug outputs, and verify the resets happen before each draw
- [ ] 4.5 Implement the read-only constants (`time`, `turn`, `size`, `basekind`, `loc_*`, `loc_p`, `falling`, `falling_fast`, `informational`, `players`, `exploding`) and verify each against a constructed board
- [ ] 4.6 Implement the constant tables for kinds, `global`, `semiglobal`, `nothing`, `outside`, behaviour bits, neighbour modes, quarter selectors and `DIR_*`, and verify the names resolve to the values read from `src/knoten.cpp`
- [ ] 4.7 Implement absolute and relative foreign access (`@@(x,y)`, `@@(x)`, `@@()`, `@(dx,dy)`, `@(dx)`, `@()`) including hex half-integer coordinates, default-on-out-of-range read and no-op-on-out-of-range write, and verify each form
- [ ] 4.8 Implement setting `kind` with reapply defaults and same-step draw behaviour, and verify the three documented side effects
- [ ] 4.9 Implement the draw commands `*`, `*@(pos)` and `@(pos)*` with quarter clipping, and verify the recorded ops carry the right cell, file, index and quarter
- [ ] 4.10 Implement event dispatch for `init`, `turn`, `land`, `changeside`, `connect`, `row_up`, `row_down` and the four `key*` events with the correct eligibility and firing order, and verify `init` fires exactly once and `keyturn` fires even when rotation is blocked
- [ ] 4.11 Implement the global blob (running before all board blobs) and the per-player semiglobal blob, and verify ordering and isolation
- [ ] 4.12 Implement `bonus`, `message`, `explode`, `lose` and `sound`, and verify each effect reaches the correct player
- [ ] 4.13 Wire compile of all levels into the build gate so an unimplemented construct fails the build with file, line and construct, and verify by temporarily removing a construct

## 5. Game Core

- [x] 5.1 Implement the seeded PRNG and route every random draw in the simulation through the single instance, and verify two runs with the same seed and inputs produce identical state at every step
- [x] 5.2 Implement the board as a 10x20 grid of blob records with kind, version, weight, behaviour bits and per-blob variable storage, and verify coordinate bounds for all accesses
- [x] 5.3 Implement the neighbour offset tables for all ten modes ported from `NachbarIterator::setXY`, and verify each mode's offsets against the C++ source
- [x] 5.4 Implement hex column offsetting for the three hex modes and verify odd columns are offset half a cell and the diagonal directions follow
- [x] 5.5 Implement connection computation including same-kind, neighbour mode and `inhibit`, and verify inhibition and kind mismatch both break a connection
- [ ] 5.6 Implement the falling piece: spawn at column 4, descent at 6 and 32 px/step, clamping at the chase border, and verify the spawn position and descent rates
- [ ] 5.7 Implement steering, rotation with the mirror-aware blob order swap, and fast-fall toggle, all rejected when blocked, and verify each accepted and rejected case
- [ ] 5.8 Implement landing, including vertical pieces landing bottom-first and horizontal pieces splitting so the free blob continues falling, and verify both cases
- [x] 5.9 Implement component computation summing `weight`, and verify a 2+3+1 component reports size 6 to all members
- [x] 5.10 Implement explosion resolution: size threshold, `explodes_on_size` gating, grass and grey propagation with `chaingrass`, chain-reaction flagging and the 8-step exploding state, and verify every case in the spec including chain-grass resistance
- [ ] 5.11 Implement grey generation using the documented formula and random placement at `hetzrand + 8px`, and verify the 1 and 12 blob cases
- [ ] 5.12 Implement random grey arrivals at the configured expected interval, and verify the observed rate over a long run
- [ ] 5.13 Implement gravity with the `floats` behaviour respected and empty cells unaffected, and verify settling after a mid-column removal
- [x] 5.14 Implement the chase border descending one pixel per `toptime` steps and killing on contact, and verify the default 1600-steps-per-cell rate and the loss condition
- [ ] 5.15 Implement the mode machine (test-explosion, explode, settle, new-grey, new-piece, wait-for-stop) including the `neues_fall_platz` spawn gate, and verify a new piece is held back while grey blobs are still high
- [ ] 5.16 Implement loss when a new piece cannot spawn, and verify the level ends immediately
- [ ] 5.17 Implement scoring (1 normal, 20 goal, 10 chain, 10 time-bonus step) and verify the mixed 22-point case
- [ ] 5.18 Implement win detection on zero goal blobs and the time-bonus animation at 10 points per step, and verify the 300-point case
- [ ] 5.19 Implement the level lifecycle (intro, running, won/lost/bonus-complete) and restart with a fresh board, score and random sequence, and verify a restart matches the initial layout
- [ ] 5.20 Implement `mirror` level support including the flipped coordinate system reported to Cual, and verify `loc_x`/`loc_y` are mirrored

## 6. Level Catalog

- [ ] 6.1 Model the three version dimensions (player count, difficulty, track) with their exclusion and exhaustiveness rules, and verify resolution against the spec's examples
- [ ] 6.2 Implement the seven tracks from the level summary and verify Standard has 48 levels and All has 70
- [ ] 6.3 Implement the three difficulty settings with descriptions and verify a difficulty change alters `numexplode` where the level defines it
- [ ] 6.4 Implement availability gating so levels requiring unsupported modes are skipped rather than failing to load, and verify they are not listed as playable
- [ ] 6.5 Implement per-level, per-difficulty progress records (completed flag, best score) with first-completion unlocking the next level in the track, and verify unlock and record-retention behaviour
- [ ] 6.6 Implement the level introduction screen data (name, author, description) and the seen-level skip option, and verify both

## 7. Presentation

- [ ] 7.1 Implement the canvas board layout that fits the largest centred 1:2 rectangle in the available area and disables image smoothing, and verify on phone and tablet viewport sizes
- [ ] 7.2 Implement per-cell draw-op aggregation ordered own-cell, then before-pass, then after-pass, and verify the composited result for a cross-cell drawing case
- [ ] 7.3 Implement icon decoding into reusable drawable objects with no per-frame allocation, and verify a frame-time measurement stays within budget on a mid-range device profile
- [ ] 7.4 Implement level-consistent background, text and chase-border colours, and verify a level's declared `bgcolor` and `topcolor` are used
- [ ] 7.5 Implement the chase border rendering including `toppic`, `topoverlap` and `topstop`, and verify the artwork offset matches `topoverlap`
- [ ] 7.6 Implement hex and mirrored rendering, and verify odd columns are offset and a mirrored level is drawn upside down
- [ ] 7.7 Implement the 8-step explosion animation rendering, and verify the effect advances over 8 steps and the cell then draws empty
- [ ] 7.8 Implement the HUD: score, level name, grey count, goal count, and verify each updates as specified
- [ ] 7.9 Implement the next-piece preview using the same rendering path, and verify it matches the piece that enters play and reports `informational` true
- [ ] 7.10 Implement the informational indicators for grey count, goal count, connection mode and chain reaction, and verify the connection-mode and chain-reaction indicators reflect the level
- [ ] 7.11 Implement blinking message rendering with the reveal-then-hide wipe, and verify it clears after the configured duration
- [ ] 7.12 Implement result presentation for win and loss including the time-bonus breakdown, and verify the completion screen shows level name, bonus and total
- [ ] 7.13 Implement text rendering with a bundled font that scales with the board, and verify legibility at small viewport sizes
- [ ] 7.14 Implement a deterministic fallback icon for an out-of-range `pos` index, and verify a level requesting a missing index renders rather than failing

## 8. Art Pipeline

- [ ] 8.1 Define the authored base-tile format (shape, palette, material treatment) and verify a tile can be authored and rendered at board scale
- [ ] 8.2 Implement the variant compositor for `schema16`, `schema5`, `schema4`, `schemaDiag16` and `schemaDiag2`, and verify generated variants tile seamlessly against the Cual code of `hormone`, `elemente` and `maennchen`
- [ ] 8.3 Implement the hex variant compositor for `schemaHex4` and `schemaHex8`, and verify the generated set is complete for `unmoeglich`
- [ ] 8.4 Spike the compositor against a tiling level (`kacheln4`, `kacheln6`) and record the outcome; if it cannot cover them, adopt per-level art overrides and verify that path works on one level
- [ ] 8.5 Author base tiles for every kind referenced by the Standard-track levels and verify each level renders with no missing-icon fallback
- [ ] 8.6 Author base tiles for the remaining tracks' kinds and verify all 81 levels render with no missing-icon fallback
- [ ] 8.7 Add a build assertion that no file from `cuyo-2.1.0/data/pics` appears in `dist/`, and verify the assertion fails when a sprite is deliberately copied in
- [ ] 8.8 Review the Standard track visually as an art milestone and record sign-off before extending to the long tail

## 9. Application Shell

- [ ] 9.1 Implement the screen router (main menu, settings, level select, introduction, game, pause, results) with back navigation that preserves game state, and verify navigating away from and back to a paused level
- [ ] 9.2 Implement the external store bridging the simulation loop to React, and verify the HUD updates while the simulation runs without React re-rendering per step
- [ ] 9.3 Implement the main menu entry points, and verify play, level select, settings and restart are reachable
- [ ] 9.4 Implement the level select screen with name, locked state, completion and best score, and verify a locked level cannot be started
- [ ] 9.5 Implement the pause menu offering resume, restart and abandon, and verify resuming continues the same board
- [ ] 9.6 Implement the settings screen for audio, reduced motion, portrait lock and left-handed layout, and verify each takes effect
- [ ] 9.7 Add a development overlay showing step count, frame time and blob count, and verify it can be toggled

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

## 11. PWA and Persistence

- [ ] 11.1 Add the web app manifest with name, icons, theme colours and display mode, and verify the install prompt is offered
- [ ] 11.2 Implement the generated precache list and a cache-first service worker, and verify a cold offline load serves the shell and all level data
- [ ] 11.3 Version the cache name from the build hash with skipWaiting and clients.claim, and verify a redeploy does not strand a stale bundle
- [ ] 11.4 Implement the versioned local-storage layer for settings, completion records and best scores, and verify values persist across a reload
- [ ] 11.5 Implement the corrupt-data fallback so unreadable storage yields defaults, and verify the game still launches
- [ ] 11.6 Verify the installed game launches and plays with the network disabled and issues no requests at runtime

## 12. Verification

- [ ] 12.1 Encode the man page's worked examples as tests: division/modulo table, neighbour pattern, six `@`-assignment cases, busy switch, apple/orange kind constants, and `startdist` rows
- [ ] 12.2 Encode the source-derived constants as a single documented module and assert each value against `src/spielfeld.cpp`, `src/leveldaten.h` and `src/code.h` in comments
- [ ] 12.3 Add engine scenario tests driving real input sequences and asserting board state for one level end to end, including a win and a loss
- [ ] 12.4 Make the build gate compile all bundled levels and verify `npm run build` fails on any level that does not parse or compile
- [ ] 12.5 Measure frame time with the development overlay on a mid-range device profile and verify the board stays within budget with a full board and active animations
- [ ] 12.6 Verify the Standard track is playable end to end on a real phone, including touch controls, orientation change and offline start
- [ ] 12.7 Verify every track loads and each level reaches a running state without a runtime error in its first steps

## 13. Coverage

The floors below come from design.md decision 12. Percentage floors catch wholly
untested files; the per-table tests are what protect fidelity, so both are needed.

- [x] 13.1 Test every neighbour-mode offset table against upstream's own `bx`/`by` digit strings from `NachbarIterator::setXY`, including the shifted and unshifted hex columns, and verify all ten modes are covered
- [x] 13.2 Test `connected` and component computation for each neighbour mode, and verify inhibition breaks a connection in the suppressing blob's own frame only
- [ ] 13.3 Extract the renderer's pure geometry, colour derivation and cell-origin maths into canvas-free functions and unit-test them in Node, verifying hex column offsets and mirrored cell origins
- [ ] 13.4 Drive the frame loop's accumulator with an injected clock and verify it executes one step per 80 ms, clamps a long backlog rather than fast-forwarding, and honours pause
- [ ] 13.5 Add behaviour tests for input timing under a DOM environment: immediate move, delayed repeat, repeat rate, and cancellation on the opposite direction
- [ ] 13.6 Set coverage thresholds in the test config at the levels in design.md decision 12 and verify the suite fails when a file is left untested
- [ ] 13.7 Record the achieved coverage per tier in the README whenever it is measured, so regressions are visible in review rather than discovered later
