// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The live board, as Cual's addressed access sees it.
 *
 * Task 15.4, and the first time `AccessField` has ever been built from anything that plays.
 * Groups 2 and 3 built the reader and the runtime and never joined them, so every
 * `AccessField` that existed was a hand-built one in a test, and the six spellings of `@` and
 * `@@` were verified against a `Map`. Nothing could ask a real board what `@(2,3)` means.
 *
 * ## How it is verified, and why not only that
 *
 * `access.test.ts` pins the *rules*: that a `@` read is the target's beginning-of-step value,
 * that an unreachable address reads a default and writes nothing, that the half specifier is
 * not a flag. Those rules are unchanged here and are not re-argued.
 *
 * What is new is the **adapter**: ten questions about one blob, answered from a real
 * `Simulation`. Everything it can get wrong is of the form "the right rule, the wrong answer",
 * and the way to catch that is to put the two side by side. So the bulk of this file builds a
 * live board and a hand-built field describing the same board and asks both the same questions:
 * `engine/testing/field.ts` is the very builder `access.test.ts` uses, not a second one, so a
 * disagreement is a disagreement and not two transcriptions drifting apart.
 *
 * ## The board is built from `startDist`, deliberately
 *
 * Not by placing blobs by hand. `Simulation.reset` builds the board from the level's
 * `startDist`, and doing that means every blob got its store from `Simulation.makeBlob` —
 * on **this simulation's** `TimeSlices`. A blob with a counter of its own would answer every
 * `getAlt` from its own history and the shadow rules would be untestable here, which is the
 * failure `blob-store.test.ts` describes for a second counter. So the fixture declares a
 * layout and lets the simulation lay it down — and the hand-built field, which has a counter
 * of its own, has to be given the same treatment or it reports a different board (see
 * `openSlice` in {@link handBuilt}).
 *
 * ## `fallCount` is a snapshot, and that is a constraint on the caller
 *
 * `AccessField.fallCount` is a `readonly number`, so the adapter reads it when the field is
 * built. Upstream reads `getFallAnz()` at each `korrekt()` call, so a snapshot is a
 * divergence — and it is benign here for a reason worth stating rather than hoping: the fall
 * simulation belongs to the rules, and `cuyo.cpp:422-542` runs the rules to completion before
 * `animiere()` at line 473. So the count cannot change while any blob's code is running, and a
 * field built once per blob per step is a faithful reading. It is asserted below as well,
 * because a constraint that lives only in a comment is not a constraint.
 */

import { describe, expect, it } from "vitest";
import { accessFieldFor } from "./cual-field.ts";
import type { CualFieldHost } from "./cual-field.ts";
import { Simulation } from "./simulation.ts";
import { Board, EMPTY } from "./board.ts";
import { GRX, GRY, NeighbourMode } from "./constants.ts";
import { nasenkugeln } from "../level-format/fixtures.ts";
import type { LevelDef, StartRow } from "../level-format/level-data.ts";
import {
  connectionsOf,
  isReachable,
  neighbourReader,
  readAddressed,
  resolveOrt,
  storeAt,
} from "../cual-runtime/access.ts";
import type { AccessField, Here } from "../cual-runtime/access.ts";
import { BLOPART_GLOBAL, BLOPART_SEMIGLOBAL } from "../cual-runtime/global.ts";
import { parseExpression } from "../cual-runtime/parse.ts";
import type { Expr, Ort } from "../cual-runtime/expr.ts";
import { BlobStore, TimeSlices } from "../cual-runtime/store.ts";
import { tokenize } from "../level-format/lexer.ts";
import { KIND_SLOT as KIND, handBuiltField, openSlice } from "../testing/field.ts";
import type { HandBuiltField } from "../testing/field.ts";

/** `blopart_ausserhalb`: a fresh store's `kind`, and the default an unreachable read gives. */
const OUTSIDE = -5;

// ------------------------------------------------------------------ addresses

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** Parse an address out of source, e.g. `address("XC@@(2,3)")`. */
function address(source: string): Ort {
  const expr = parseExpression(lex(source)) as Expr;
  if (expr.kind !== "positioned") throw new Error(`expected an addressed variable in ${source}`);
  return expr.position;
}

/** Evaluate an address's coordinates. Constant addresses only, so no variables are in scope. */
const evaluate = (expr: Expr): number => {
  if (expr.kind === "number") return expr.value;
  if (expr.kind === "unary") {
    return expr.op === "-" ? -evaluate(expr.operand) : evaluate(expr.operand);
  }
  throw new Error(`the test addresses must be constant, got ${expr.kind}`);
};

// -------------------------------------------------------------------- layout

/**
 * The board, written once and read by two consumers.
 *
 * Row 0 of this array is `y = GRY - 2`, because `Simulation.reset` bottom-aligns `startDist`.
 * It gives the cell at (1, 19) a same-kind neighbour above it, a same-kind one to its right,
 * a different one to its left, and the board edge below — so "occupied", "different kind" and
 * "not on the board" are three different answers rather than one.
 */
const LAYOUT: readonly (readonly (number | null)[])[] = [
  [2, 1, 1, 2, 3, 4, null, null, null, null],
  [1, 1, 1, 2, 3, 4, null, null, null, null],
];

/** The topmost row's y coordinate, which the two rows below are measured from. */
const TOP_ROW = GRY - LAYOUT.length;

/** The same board as `startDist`: top row first, `null` for an empty cell. */
const START_ROWS: readonly StartRow[] = LAYOUT.map((row) =>
  row.map((kind) => (kind === null ? null : { kind, version: 0 })),
);

/** The kind `LAYOUT` puts at a cell, so both fields describe one board and not two. */
function layoutKindAt(x: number, y: number): number {
  return LAYOUT[y - TOP_ROW]?.[x] ?? EMPTY;
}

/** And as the `cells` record the hand-built field takes, keyed `"right,x,y"`. */
const CELLS: Record<string, number> = Object.fromEntries(
  LAYOUT.flatMap((row, dy) =>
    row.flatMap((kind, x) => (kind === null ? [] : [[`false,${x},${TOP_ROW + dy}`, 1]])),
  ),
);

interface LevelOverrides {
  readonly neighbours?: NeighbourMode;
  readonly hexFlip?: number;
  readonly mirror?: boolean;
}

/** Whether a set of overrides puts the board in hex mode, as `mSechseck` decides it. */
function isHexLevel(overrides: LevelOverrides): boolean {
  const mode = overrides.neighbours ?? NeighbourMode.Rect;
  return (
    mode === NeighbourMode.Hex6 || mode === NeighbourMode.Hex4 || mode === NeighbourMode.ThreeD
  );
}

/** A level carrying {@link LAYOUT}, with the geometry knobs a test needs. */
function levelWith(overrides: LevelOverrides): LevelDef {
  return { ...nasenkugeln(), startDist: START_ROWS, ...overrides };
}

/**
 * A simulation over {@link LAYOUT}, with the step window open so shadows are readable.
 *
 * The blobs were written by `Simulation.reset` before any slice existed, so their shadows say
 * slice 0. `getAlt` reads a shadow only when it was taken in the *current* slice and falls
 * through to the live array otherwise — which is correct, because nothing has been written
 * since. Opening a slice is what a real step does first, and without it every beginning-of-step
 * rule below would be satisfied trivially.
 */
function liveSimulation(overrides: LevelOverrides = {}): Simulation {
  const sim = new Simulation(levelWith(overrides), { seed: 1 });
  sim.slices.open();
  return sim;
}

/** The field one blob sees, over a live simulation. */
function liveField(sim: Simulation, here: Here): AccessField {
  // The annotation is a compile-time claim, not a convenience: it fails the build if
  // `Simulation` stops being a `CualFieldHost`, which is the question "is the adapter wired to
  // the right things at all" and would otherwise surface as a `null` store at run time.
  const host: CualFieldHost = sim;
  return accessFieldFor(host, here);
}

/**
 * A hand-built field describing the same board as {@link liveSimulation}.
 *
 * Two details are not tidiness, and the first version of this file got both wrong:
 *
 * - **The slice is opened before it returns.** The kinds are written with `set`, which takes a
 *   shadow of the value *before* the write — so with no slice opened since, `getAlt` reads that
 *   pre-write value and every cell reports kind 0. That makes every pair of same-kind blobs
 *   connect and every pattern match, which is exactly the board `neighbour-read.test.ts`
 *   warns about and why it opens its slice before returning.
 * - **`hexShift` is written out from `getHexShift`'s body** rather than read from
 *   `columnShift`. The adapter calls `columnShift`, so comparing against it would only prove
 *   that the adapter calls it.
 */
function handBuilt(here: Here, overrides: LevelOverrides = {}): HandBuiltField {
  const flip = overrides.hexFlip ?? 0;
  const field = handBuiltField(here, CELLS, {
    width: GRX,
    height: GRY,
    hex: isHexLevel(overrides),
    mirrored: overrides.mirror ?? false,
    fallCount: 2,
    hexShift: (right, x) => (right ? ((flip & 2) !== 0 ? 1 : 0) : (flip & 1) !== 0 ? 1 : 0) !== (x & 1),
  });
  for (const [key] of Object.entries(CELLS)) {
    const [, xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    field.at(false, x, y)?.set(KIND, layoutKindAt(x, y));
  }
  openSlice(field);
  return field;
}

/** The cell the layout is designed around. */
const HERE: Here = { kind: "cell", x: 1, y: GRY - 1, right: false };

/**
 * Every address the differential test asks.
 *
 * Chosen to cross every branch `resolveOrt` and `isReachable` have: the global and semiglobal
 * blanks, absolute and relative cell, both fall forms, all four half specifiers, and addresses
 * that are syntactically fine but off the board. A list rather than a loop because the
 * interesting thing about it is *which* addresses are in it, and a loop over coordinates would
 * hide a missing case.
 */
const ADDRESSES: readonly string[] = [
  "XC@",
  "XC@()",
  "XC@@",
  "XC@@()",
  "XC@@(1,19)",
  "XC@@(1,19;>)",
  "XC@@(1,19;!)",
  "XC@@(1,19;<)",
  "XC@@(1,19;>)",
  "XC@(0,0)",
  "XC@(1,0)",
  "XC@(-1,0)",
  "XC@(2,-1)",
  "XC@(20,19)",
  "XC@(1,20)",
  "XC@@(1)",
  "XC@@(3)",
  "XC@(1)",
  "XC@(5)",
  "XC@@(-1,0)",
];

describe("the live board answers what the hand-built field answers", () => {
  it("resolves every address to the same place", () => {
    const live = liveField(liveSimulation(), HERE);
    const hand = handBuilt(HERE);
    for (const source of ADDRESSES) {
      expect(resolveOrt(live, address(source), evaluate), source).toEqual(
        resolveOrt(hand, address(source), evaluate),
      );
    }
  });

  it("calls the same addresses reachable, and the same ones not", () => {
    const live = liveField(liveSimulation(), HERE);
    const hand = handBuilt(HERE);
    const answers = ADDRESSES.map((source) => [
      source,
      isReachable(live, resolveOrt(live, address(source), evaluate)),
      isReachable(hand, resolveOrt(hand, address(source), evaluate)),
    ]);
    // Not just "they agree": the list has to contain both verdicts, or the agreement is
    // trivially true because nothing was ever reachable.
    expect(answers.filter(([, liveOk]) => liveOk).length).toBeGreaterThan(0);
    expect(answers.filter(([, liveOk]) => !liveOk).length).toBeGreaterThan(0);
    for (const [source, liveOk, handOk] of answers) {
      expect(liveOk, `${source}: live ${liveOk}, hand-built ${handOk}`).toBe(handOk);
    }
  });

  it("reads the same value through each reachable address", () => {
    // The point of the whole exercise. `@(0,0)` from a blob must read its own *shadow*, and
    // `@@(1,0)` must read the cell above — neither is visible if the two fields are asked the
    // same question and answer it for the same wrong reason.
    const live = liveField(liveSimulation(), HERE);
    const hand = handBuilt(HERE);
    const values = ADDRESSES.map((source) => [
      source,
      readAddressed(live, resolveOrt(live, address(source), evaluate), KIND, OUTSIDE),
      readAddressed(hand, resolveOrt(hand, address(source), evaluate), KIND, OUTSIDE),
    ]);
    expect(values.filter(([, value]) => value !== OUTSIDE).length).toBeGreaterThan(0);
    // And the answers are not all the same, which is what a comparison of two fields that both
    // ignore the board would look like.
    expect(new Set(values.map(([, value]) => value)).size).toBeGreaterThan(1);
    for (const [source, liveValue, handValue] of values) {
      expect(liveValue, String(source)).toBe(handValue);
    }
  });

  it("and finds the same targets for the same addresses", () => {
    const live = liveField(liveSimulation(), HERE);
    const hand = handBuilt(HERE);
    for (const source of ADDRESSES) {
      const liveStore = storeAt(live, resolveOrt(live, address(source), evaluate));
      const handStore = storeAt(hand, resolveOrt(hand, address(source), evaluate));
      // Presence, not identity: the two fields have their own stores by construction, so
      // identity would be false by design. What has to match is *which* address has one.
      expect(liveStore !== null, source).toBe(handStore !== null);
    }
  });

  it("on a hex board, with the column parity shifting the address", () => {
    // The case where `hex` and `hexShift` both change the answer, so a field reporting
    // `hex: false` or a `hexShift` of always-false would disagree here and nowhere else.
    const sim = liveSimulation({ neighbours: NeighbourMode.Hex6, hexFlip: 1 });
    const live = liveField(sim, HERE);
    const hand = handBuilt(HERE, { neighbours: NeighbourMode.Hex6, hexFlip: 1 });
    expect(live.hex).toBe(true);
    for (const source of ADDRESSES) {
      expect(resolveOrt(live, address(source), evaluate), source).toEqual(
        resolveOrt(hand, address(source), evaluate),
      );
      expect(readAddressed(live, resolveOrt(live, address(source), evaluate), KIND, OUTSIDE)).toBe(
        readAddressed(hand, resolveOrt(hand, address(source), evaluate), KIND, OUTSIDE),
      );
    }
    // And it is not vacuous: `hexflip = 1` puts the *even* columns on the offset, so the odd-dx
    // address that shifts with the default does not shift here. `hexShift(1, 1)` is then false
    // and `y` stays on the asking blob's own row.
    expect(live.hexShift(false, 1)).toBe(false);
    expect(resolveOrt(live, address("XC@(1,0)"), evaluate).y).toBe(GRY - 1);
    const unshifted = liveField(liveSimulation({ neighbours: NeighbourMode.Hex6 }), HERE);
    expect(unshifted.hexShift(false, 1)).toBe(true);
    expect(resolveOrt(unshifted, address("XC@(1,0)"), evaluate).y).toBe(GRY - 2);
  });

  it("on a mirrored board, where dy is inverted and the connections are swapped", () => {
    const live = liveField(liveSimulation({ mirror: true }), HERE);
    const hand = handBuilt(HERE, { mirror: true });
    expect(live.mirrored).toBe(true);
    for (const source of ADDRESSES) {
      expect(resolveOrt(live, address(source), evaluate), source).toEqual(
        resolveOrt(hand, address(source), evaluate),
      );
    }
    // "The user gives y downwards; internally it is up." So a positive dy goes up, and on a
    // mirrored board the cell above is the one a positive dy names.
    expect(resolveOrt(live, address("XC@(0,1)"), evaluate).y).toBe(GRY - 2);
    expect(resolveOrt(live, address("XC@(0,-1)"), evaluate).y).toBe(GRY);
    expect(connectionsOf(live)).toBe(connectionsOf(hand));
  });

  it("and with a right-hand half spelled, which a one-player game has none of", () => {
    // `rechts_ok` is the rule, and it is `getSpielerZahl() > 1` rather than "there happen to
    // be no blobs there". With one player `;>)` and `;!)` name a field that does not exist, so
    // the answer is "unreachable" — not "the left field", and not "an empty right field".
    const live = liveField(liveSimulation(), HERE);
    for (const source of ["XC@@(1,19;>)", "XC@@(1,19;!)"]) {
      const resolved = resolveOrt(live, address(source), evaluate);
      expect(resolved.right, source).toBe(true);
      expect(isReachable(live, resolved), source).toBe(false);
    }
    // `@@()` with no half is the asking blob's own side, which is the left one, and that one
    // does exist — so it is reachable and reads the semiglobal's own kind.
    const mine = resolveOrt(live, address("XC@@()"), evaluate);
    expect(mine).toMatchObject({ kind: "semiglobal", right: false });
    expect(isReachable(live, mine)).toBe(true);
  });
});

describe("each member, on its own", () => {
  it("at: hands back the blob's own store, and null for nothing", () => {
    const sim = liveSimulation();
    const live = liveField(sim, HERE);
    // Identity, because a *copy* would be a second `mDaten` — the one thing a blob never has,
    // and a copy would answer every `@`-read from a history nothing ever wrote.
    const blob = sim.board.at(1, GRY - 1);
    expect(blob).not.toBeNull();
    expect(live.at(false, 1, GRY - 1)).toBe(blob?.store);
    // In bounds but empty: not a target, because `finde()` would have nothing to return.
    expect(live.at(false, 8, GRY - 1)).toBeNull();
    // Off the board on each of the four sides, which are four different comparisons upstream.
    expect(live.at(false, -1, GRY - 1)).toBeNull();
    expect(live.at(false, GRX, GRY - 1)).toBeNull();
    expect(live.at(false, 1, -1)).toBeNull();
    expect(live.at(false, 1, GRY)).toBeNull();
    // And the right-hand field, which a one-player game does not have.
    expect(live.at(true, 1, GRY - 1)).toBeNull();
  });

  it("global: is the simulation's own global blob, with upstream's kind", () => {
    const sim = liveSimulation();
    const live = liveField(sim, HERE);
    expect(live.global).toBe(sim.global);
    // `Blop::gGlobalBlop = Blop(blopart_global)` — the kind is -2, not a fresh blob's -5.
    expect(live.global.get(KIND)).toBe(BLOPART_GLOBAL);
    expect(BLOPART_GLOBAL).toBe(-2);
    // `@()` and `@` are the same address and neither depends on the half: `absort_global`
    // returns the left player whatever was written.
    for (const source of ["XC@", "XC@()"]) {
      const resolved = resolveOrt(live, address(source), evaluate);
      expect(storeAt(live, resolved), source).toBe(sim.global);
      expect(isReachable(live, resolved), source).toBe(true);
      expect(readAddressed(live, resolved, KIND, OUTSIDE), source).toBe(BLOPART_GLOBAL);
    }
  });

  it("semiglobal: this field's own, found by side, and absent for a side there is not", () => {
    const sim = liveSimulation();
    const live = liveField(sim, HERE);
    expect(live.semiglobal(false)).toBe(sim.semiglobal(false));
    expect(live.semiglobal(false)).not.toBeNull();
    expect(live.semiglobal(true)).toBeNull();
    // `blopart_semiglobal`, and a *different* store from the global one — sharing them would
    // make a level's global code and its semiglobal code read the same variables.
    expect(live.semiglobal(false)?.get(KIND)).toBe(BLOPART_SEMIGLOBAL);
    expect(BLOPART_SEMIGLOBAL).toBe(-3);
    expect(live.semiglobal(false)).not.toBe(live.global);
    const mine = resolveOrt(live, address("XC@@()"), evaluate);
    expect(storeAt(live, mine)).toBe(sim.semiglobal(false));
    expect(isReachable(live, mine)).toBe(true);
  });

  it("here: is the asking blob's own place, for each of the five kinds", () => {
    const sim = liveSimulation();
    const heres: readonly Here[] = [
      HERE,
      { kind: "cell", x: 4, y: GRY - 2, right: true },
      { kind: "fall", x: 0, y: 0, right: false },
      { kind: "fall", x: 1, y: 1, right: false },
      { kind: "global" },
      { kind: "semiglobal", right: false },
      { kind: "info" },
    ];
    for (const here of heres) {
      expect(liveField(sim, here).here, here.kind).toBe(here);
    }
    // And `here` decides what an address may become, which is the part that is not identity.
    // `@(x,y)` is `ortart_relativ_feld` and resolves only from a blob that is on a cell, so
    // from a falling piece — and from the global blob — it is `absort_nirgends`.
    for (const here of heres) {
      const relative = resolveOrt(liveField(sim, here), address("XC@(1,1)"), evaluate);
      expect(relative.kind, here.kind).toBe(here.kind === "cell" ? "cell" : "nowhere");
    }
    // `@(1)` is the falling-relative form, so it resolves from a falling blob alone.
    const falling = liveField(sim, { kind: "fall", x: 0, y: 0, right: false });
    expect(resolveOrt(falling, address("XC@(1)"), evaluate)).toMatchObject({ kind: "fall", x: 1 });
    expect(resolveOrt(liveField(sim, HERE), address("XC@(1)"), evaluate).kind).toBe("nowhere");
  });

  it("hex: follows the level-wide mode, not a kind's", () => {
    // `LevelDaten::ladLevel` decides `mSechseck` from the level's own `neighbours`. A kind that
    // asks for hex six in a rectangular board still draws square, and the addressing has to
    // agree with the drawing — so this is about the level and never about a kind.
    expect(liveField(liveSimulation(), HERE).hex).toBe(false);
    expect(liveField(liveSimulation({ neighbours: NeighbourMode.Diagonal }), HERE).hex).toBe(false);
    expect(liveField(liveSimulation({ neighbours: NeighbourMode.Hex6 }), HERE).hex).toBe(true);
    expect(liveField(liveSimulation({ neighbours: NeighbourMode.Hex4 }), HERE).hex).toBe(true);
    expect(liveField(liveSimulation({ neighbours: NeighbourMode.ThreeD }), HERE).hex).toBe(true);
    // `hexflip` does not decide it: `getHexShift` reads `mSechseck` *and* `mSechseckFlip`, so a
    // flip on a square board is a no-op rather than a half-hex board.
    expect(liveField(liveSimulation({ hexFlip: 3 }), HERE).hex).toBe(false);
    // It changes what `hex` is *for*: hex has no horizontal connection, so `rechts` is never
    // set and a pattern pinning it reads false. Index 2 of `???????` is `rechts`.
    expect(neighbourReader(liveField(liveSimulation(), HERE))("??1?????")).toBe(true);
    expect(neighbourReader(liveField(liveSimulation({ neighbours: NeighbourMode.Hex6 }), HERE))(
      "??1?????",
    )).toBe(false);
  });

  it("hexShift: the column parity, per side, from the level's hexflip", () => {
    // `LevelDaten::getHexShift(bool rechts, int x)`:
    //   if (!ld->mSechseck) return false;
    //   bool flip = rechts ? (mSechseckFlip & 2) != 0 : (mSechseckFlip & 1) != 0;
    //   return (x & 1) != flip;
    // Transcribed here as an independent expectation rather than a call to `columnShift`,
    // which is what the adapter calls.
    for (const flip of [0, 1, 2, 3]) {
      const field = liveField(
        liveSimulation({ neighbours: NeighbourMode.Hex6, hexFlip: flip }),
        HERE,
      );
      for (const right of [false, true]) {
        // Bit 1 of `hexflip` is the right field and bit 0 the left, which is why there are four
        // values and not two — and why bit 0 cannot be seen on a single-player board, where
        // `rechts_ok` refuses every right-hand address before `hexShift` is consulted.
        const flipBit = (right ? flip & 2 : flip & 1) !== 0;
        for (const [x, parity] of [
          [0, false],
          [1, true],
          [2, false],
          [7, true],
          [8, false],
        ] as const) {
          expect(
            field.hexShift(right, x),
            `hexflip=${flip} ${right ? "right" : "left"} column ${x}`,
          ).toBe(parity !== flipBit);
        }
      }
    }
    // Square boards ignore it entirely, flip included.
    const square = liveField(liveSimulation({ hexFlip: 3 }), HERE);
    for (const right of [false, true]) {
      for (const x of [0, 1, 2, 7]) expect(square.hexShift(right, x)).toBe(false);
    }
  });

  it("mirrored: is the level's mirror, and it moves dy the documented way", () => {
    expect(liveField(liveSimulation(), HERE).mirrored).toBe(false);
    expect(liveField(liveSimulation({ mirror: true }), HERE).mirrored).toBe(true);
    // The direction, so that "mirrored" cannot be satisfied by negating dy the wrong way round.
    // On a plain board a positive dy goes down and leaves the board from the bottom row; on a
    // mirrored one it goes up to the row above, which is occupied.
    const plain = liveField(liveSimulation(), HERE);
    const flipped = liveField(liveSimulation({ mirror: true }), HERE);
    expect(resolveOrt(plain, address("XC@(0,1)"), evaluate).y).toBe(GRY);
    expect(resolveOrt(flipped, address("XC@(0,1)"), evaluate).y).toBe(GRY - 2);
  });

  it("players: is one, so the right-hand field does not exist", () => {
    const live = liveField(liveSimulation(), HERE);
    expect(live.players).toBe(1);
    // `rechts_ok(rechts) { return (!rechts) || (getSpielerZahl() > 1); }` — the consequence is
    // that a right-hand address does not *fail*, it resolves to nothing and reads the
    // variable's own default. Asserted as a read, because that is the observable difference
    // between "no such field" and "an empty one".
    const right = resolveOrt(live, address("XC@@(1,19;>)"), evaluate);
    expect(isReachable(live, right)).toBe(false);
    expect(readAddressed(live, right, KIND, OUTSIDE)).toBe(OUTSIDE);
  });

  it("fallCount: is the fall's blob count, for 2, 1 and 0", () => {
    // `FallPos::getAnz()`: `richtung_keins` gives 0, `richtung_einzel` gives 1, and
    // waag/senk/unplatziert give 2. A pair is in play from the first step of a reset, so 2 is
    // the starting answer and the other two have to be reached by putting the fall into that
    // state — assigned directly, because the alternative is a board shaped to make a piece
    // split, and the claim here is about the translation of three states, not about landing.
    const sim = liveSimulation();
    const piece = sim.fall;
    expect(piece).not.toBeNull();
    if (piece === null) return;
    expect(sim.fallCount()).toBe(2);

    // `absort_fall` is `x = expr & 1, y = 0` and its validity is `x < getFallAnz()` at
    // `y == 0`. `& 1` means only two indices exist at all: an even number names blob 0 and an
    // odd one blob 1, so `@@(3)` and `@@(1)` are the same address.
    const pair = liveField(sim, HERE);
    expect(resolveOrt(pair, address("XC@@(3)"), evaluate)).toMatchObject({ x: 1, y: 0 });
    expect(isReachable(pair, resolveOrt(pair, address("XC@@(1)"), evaluate))).toBe(true);
    expect(isReachable(pair, resolveOrt(pair, address("XC@@(0)"), evaluate))).toBe(true);

    // Single: the left half of a horizontal piece landed and the right one carries on.
    sim.fall = { ...piece, orientation: "single" };
    expect(sim.fallCount()).toBe(1);
    const single = liveField(sim, HERE);
    expect(single.fallCount).toBe(1);
    expect(isReachable(single, resolveOrt(single, address("XC@@(0)"), evaluate))).toBe(true);
    expect(isReachable(single, resolveOrt(single, address("XC@@(1)"), evaluate))).toBe(false);

    // None: between pieces.
    sim.fall = null;
    expect(sim.fallCount()).toBe(0);
    const none = liveField(sim, HERE);
    expect(none.fallCount).toBe(0);
    for (const source of ["XC@@(0)", "XC@@(1)"]) {
      expect(isReachable(none, resolveOrt(none, address(source), evaluate)), source).toBe(false);
    }
  });

  it("fallCount: is the count when the field was built, which is why a field is per step", () => {
    // The constraint, asserted rather than noted. `AccessField.fallCount` is a
    // `readonly number`, so the adapter reads `getFallAnz()` once. Upstream reads it at every
    // `korrekt()`, which is a divergence — benign here because the fall belongs to the rules
    // and `cuyo.cpp:422-542` finishes them before `animiere()` at line 473, so the count cannot
    // change while a blob's code runs. A field held across a step boundary *would* be stale, and
    // this is what that looks like.
    const sim = liveSimulation();
    const stale = liveField(sim, HERE);
    expect(stale.fallCount).toBe(2);
    sim.fall = null;
    expect(sim.fallCount()).toBe(0);
    expect(stale.fallCount, "the field kept the count it was built with").toBe(2);
    // And a field built now answers the current one, so the rule is "rebuild per step" and not
    // "the count is unavailable".
    expect(liveField(sim, HERE).fallCount).toBe(0);
  });

  it("width and height: the field's own, which the hex edge row would extend", () => {
    const live = liveField(liveSimulation(), HERE);
    expect(live.width).toBe(GRX);
    // `getGrY()` is `gry + 1` when the Rüberreihe exists, and that row is one player handing
    // one to another — `bekommVielleichtReihe` asks `mSpielfeld[!reSp]`, a second field — so it
    // cannot exist in a one-player game. Asserted as the constant rather than as a coincidence,
    // because "it happens to be 20 today" is not the claim. The consequence, that `at` answers
    // null at `y = GRY` where upstream would find the hex edge blob, is in `cual-field.ts`.
    expect(live.height).toBe(GRY);
    expect(GRY).toBe(20);
  });

  it("range-checks its own coordinates, which the live board would do anyway", () => {
    // The one white-box test in this file, and it is white-box on purpose.
    //
    // With the real `Simulation`, the adapter's own `x`/`y` bounds can never be the thing that
    // refuses an address, because `Board.at` is `inBounds(x, y) ? cells[…] : null` and refuses
    // first. Two mutations deleting each bound leave every answer identical — measured, not
    // assumed — so against the live board this guard is untestable.
    //
    // Upstream checks the same coordinates in two places: `korrekt()` in the caller and a
    // `CASSERT` in `finde()`. Keeping both is faithful, and the point of keeping the adapter's
    // own is that a host whose board is not a fixed 10x20 grid — the hex edge row of the
    // header's third paragraph is exactly that kind of change — would still be answered
    // correctly. So the host here is the smallest thing that does not bound-check, and the
    // assertion is about the adapter rather than about the game.
    const store = new BlobStore(64, GRY, new TimeSlices());
    const host: CualFieldHost = {
      level: levelWith({}),
      // Answers for every coordinate, in or out, which is what makes the bounds observable.
      board: { at: () => ({ store }) } as unknown as Board,
      global: store,
      players: 1,
      fallCount: () => 0,
      semiglobal: (right) => (right ? null : store),
    };
    const field = accessFieldFor(host, HERE);
    expect(field.at(false, 1, GRY - 1), "on the board").toBe(store);
    for (const [x, y] of [
      [-1, 0],
      [GRX, 0],
      [0, -1],
      [0, GRY],
    ] as const) {
      expect(field.at(false, x, y), `off the board at ${x},${y}`).toBeNull();
    }
    // And the right-hand guard, which *is* observable against a live board, still holds here.
    expect(field.at(true, 1, GRY - 1)).toBeNull();
  });
});

describe("the beginning-of-step world, off the live board", () => {
  it("reads a neighbour's shadow, not the value it has now", () => {
    // The rule 15.3 built the machinery for, seen from the adapter for the first time. A write
    // through `@` is deferred to the end of the window, so a blob asking a neighbour what its
    // kind is must see the kind it had at the start of the step — which means the live field
    // has to hand back the simulation's own store and not a snapshot of it.
    const sim = liveSimulation();
    const neighbour = sim.board.at(2, GRY - 1);
    expect(neighbour).not.toBeNull();
    if (neighbour === null) return;
    // The kind is 3 as the step begins, and 4 while the step runs. **The slice is opened
    // between the two writes**, because that is the whole mechanism and a test that called
    // `preserve()` by hand would be asserting the store's API rather than the step boundary:
    // `set` snapshots before it writes, and the snapshot is only this slice's past if a slice
    // opened after the first write.
    neighbour.store.setSystem("kind", 3);
    sim.slices.open();
    neighbour.store.setSystem("kind", 4);

    const live = liveField(sim, HERE);
    const resolved = resolveOrt(live, address("XC@(1,0)"), evaluate);
    expect(storeAt(live, resolved)).toBe(neighbour.store);
    expect(readAddressed(live, resolved, KIND, OUTSIDE)).toBe(3);
    expect(neighbour.store.get(KIND), "the live value").toBe(4);

    // Writing through `@` and reading it back in the same step still sees the old value, which
    // is statement 2 of `cual.6`'s six examples and the reason the queue exists. The window is
    // already open here, so `defer` is legal.
    sim.slices.defer(neighbour.store, KIND, 2, "=");
    expect(readAddressed(live, resolved, KIND, OUTSIDE)).toBe(3);
    sim.slices.close();
    expect(neighbour.store.get(KIND)).toBe(2);
    // And the shadow is still this slice's: `endGleichzeitig` does not move
    // `gAktuelleZeitNummerDatenAlt`, so a `@`-read in the same window still sees the beginning
    // of it. The **next** slice is what makes 2 the past — which is the boundary a deferred
    // write exists to cross.
    expect(readAddressed(live, resolved, KIND, OUTSIDE)).toBe(3);
    sim.slices.open();
    expect(readAddressed(live, resolved, KIND, OUTSIDE)).toBe(2);
  });

  it("answers a neighbour pattern from the board's kinds, hex and mirror included", () => {
    // `getBesitzVerbindungen` reads the *shadow* kind on both sides, so a blob that changed
    // kind this step is still tested against the neighbourhood it had at the start. That is
    // the sentence of `cual.6` below the empty-blob rule, and it is only reachable through a
    // field that answers off a real board.
    const live = liveField(liveSimulation({ neighbours: NeighbourMode.Hex6 }), HERE);
    const reader = neighbourReader(live);
    // (1, 19) and (1, 18) are both kind 1, so `oben` connects; the board edge below does not,
    // because `verbindetMitRand` is a property of the *empty* sort alone.
    expect(reader("1???0???")).toBe(true);
    // A pinned `lo` — the cell at (0, 18), which is kind 2 — is false.
    expect(reader("???????1")).toBe(false);
    expect(reader("???????0")).toBe(true);
    // And the mirrored field swaps the pairs, so a level's "above" is the cell that was below.
    const mirrored = liveField(
      liveSimulation({ neighbours: NeighbourMode.Hex6, mirror: true }),
      HERE,
    );
    expect(neighbourReader(mirrored)("1???0???")).toBe(false);
    expect(connectionsOf(mirrored)).not.toBe(connectionsOf(live));
  });

  it("and the connection bitmask is the one the hand-built field computes", () => {
    // Both fields, one cell, one question — the mask rather than a pattern, because the mask
    // is what the swap and the hex offset act on and a pattern would only show the result.
    for (const overrides of [{}, { mirror: true }, { neighbours: NeighbourMode.Hex6 }]) {
      const live = liveField(liveSimulation(overrides), HERE);
      expect(connectionsOf(live), JSON.stringify(overrides)).toBe(
        connectionsOf(handBuilt(HERE, overrides)),
      );
    }
    // And it is not zero: a field whose `at` answered null everywhere would report all zeros
    // and agree with a hand-built field built from the same wrong answers.
    expect(connectionsOf(liveField(liveSimulation(), HERE))).not.toBe(0);
  });
});