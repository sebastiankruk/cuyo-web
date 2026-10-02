/**
 * Addressed access, one form at a time.
 *
 * The two rules 4.7 is really about are that a `@` read is the *target's* beginning-of-step
 * value and that an out-of-range access reads a default (or writes nothing) rather than
 * failing. Both are tested against a constructed board, because neither can be seen without
 * two blobs and a step boundary.
 */

import { describe, expect, it } from "vitest";
import {
  isReachable,
  readAddressed,
  resolveOrt,
  storeAt,
  writeAddressed,
} from "./access.ts";
import type { AccessField, Here } from "./access.ts";
import { BlobStore, SPECIAL_VARIABLES, TimeSlices } from "./store.ts";
import type { Expr, Ort } from "./expr.ts";
import { parseExpression } from "./parse.ts";
import { tokenize } from "../level-format/lexer.ts";

const KIND = SPECIAL_VARIABLES.findIndex((v) => v.name === "kind");

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** Parse an address out of source, e.g. `parseAddress("XC@@(2,3)")`. */
function parseAddress(source: string): Ort {
  const tokens = lex(source);
  const expr = parseExpression(tokens) as Expr;
  if (expr.kind !== "positioned") throw new Error(`expected an addressed variable in ${source}`);
  return expr.position;
}

/** Evaluate an expression node with no variables in it. */
const evaluate = (expr: Expr): number => {
  if (expr.kind === "number") return expr.value;
  // `-1` arrives as unary minus, not as a negative literal.
  if (expr.kind === "unary") return expr.op === "-" ? -evaluate(expr.operand) : evaluate(expr.operand);
  if (expr.kind === "variable") throw new Error(`the test addresses must be constant: ${expr.name}`);
  throw new Error(`the test addresses must be constant, got ${expr.kind}`);
};

/**
 * A 4x4 board with one blob per cell, the global blob, and one semiglobal per player.
 *
 * `cells` is keyed `"right,x,y"` with 0 for empty, so a test can say which cells exist.
 */
function board(
  here: Here,
  cells: Record<string, number> = {},
  options: { players?: number; hex?: boolean; mirrored?: boolean } = {},
): AccessField & { stores: Map<string, BlobStore>; slices: TimeSlices } {
  const slices = new TimeSlices();
  const stores = new Map<string, BlobStore>();
  const players = options.players ?? 1;
  const width = 4;
  const height = 4;
  const make = (key: string, slots = 20): BlobStore => {
    let store = stores.get(key);
    if (!store) {
      store = new BlobStore(slots, 13, slices);
      stores.set(key, store);
    }
    return store;
  };
  const global = make("global");
  const semiglobals = [make("semi:false"), make("semi:true")];
  for (let i = 0; i < players; i += 1) semiglobals[i].set(KIND, 100 + i);
  global.set(KIND, 99);

  return {
    players,
    width,
    height,
    hex: options.hex ?? false,
    mirrored: options.mirrored ?? false,
    hexShift: () => false,
    global,
    fallCount: 0,
    here,
    semiglobal: (right) => (right && players < 2 ? null : semiglobals[right ? 1 : 0]),
    at(right, x, y) {
      if (right && players < 2) return null;
      if (x < 0 || x >= width || y < 0 || y >= height) return null;
      const key = `${right},${x},${y}`;
      if (!(key in cells)) return null;
      return make(key);
    },
    stores,
    slices,
  };
}

/** Open a step on the board's slice, so the shadow is refreshed. */
function openSlice(field: AccessField & { slices: TimeSlices }): void {
  field.slices.open();
}

const CELL: Here = { kind: "cell", x: 1, y: 1, right: false };
/** A blob on the *right* field, which only exists with two players. */
const CELL_RIGHT: Here = { kind: "cell", x: 1, y: 1, right: true };

describe("resolving an address", () => {
  it("treats '@()' as the global blob and '@@()' as the semiglobal", () => {
    // Not a typo to be tidied: `relort_klammerfrei` and `absort_klammerfrei` are separate
    // productions and the empty ones name different blobs.
    const field = board(CELL);
    expect(resolveOrt(field, parseAddress("XC@()"), evaluate)).toMatchObject({ kind: "global" });
    expect(resolveOrt(field, parseAddress("XC@@()"), evaluate)).toMatchObject({
      kind: "semiglobal",
    });
  });

  it("makes '@(x,y)' relative to the asking blob and '@@(x,y)' absolute", () => {
    const field = board(CELL, { "false,3,3": 1, "false,1,1": 1 });
    // Here is (1,1), so the offset names (3,3) and the absolute form names (1,1) - where we stand.
    expect(resolveOrt(field, parseAddress("XC@(2,2)"), evaluate)).toMatchObject({
      kind: "cell",
      x: 3,
      y: 3,
    });
    expect(resolveOrt(field, parseAddress("XC@@(1,1)"), evaluate)).toMatchObject({
      kind: "cell",
      x: 1,
      y: 1,
    });
    // And the offset goes off the board, so it is unreachable while the absolute does not.
    const off = resolveOrt(field, parseAddress("XC@(9,9)"), evaluate);
    expect(isReachable(field, off)).toBe(false);
    expect(isReachable(field, resolveOrt(field, parseAddress("XC@@(1,1)"), evaluate))).toBe(true);
  });

  it("negates dy on a mirrored level, because y is downwards to the user and upwards inside", () => {
    // "Spiegeln für den Himmel-Level: the user will give y downwards; internally it is up."
    // Here is row 1. `y = here.y + (mirrored ? -dy : dy)`.
    const field = board(CELL, { "false,1,0": 1, "false,1,2": 1 }, { mirrored: true });
    // A positive `dy` goes *up* on a mirrored level: 1 - 1 = 0.
    expect(resolveOrt(field, parseAddress("XC@(0,1)"), evaluate)).toMatchObject({ y: 0 });
    // And a negative one goes down: 1 + 1 = 2.
    expect(resolveOrt(field, parseAddress("XC@(0,-1)"), evaluate)).toMatchObject({ y: 2 });
    // Unmirrored the other way round.
    const plain = board(CELL, { "false,1,0": 1, "false,1,2": 1 });
    expect(resolveOrt(plain, parseAddress("XC@(0,-1)"), evaluate)).toMatchObject({ y: 0 });
    expect(resolveOrt(plain, parseAddress("XC@(0,1)"), evaluate)).toMatchObject({ y: 2 });
  });

  it("shifts an odd dx by one row in a hex column that is offset", () => {
    // "At odd dx, relative coordinates are stored so that dy = 0 means slightly diagonally up.
    // That is right for the even columns and the odd ones have to be shifted."
    const field: AccessField = {
      ...board(CELL, { "false,1,0": 1, "false,1,1": 1 }),
      hex: true,
      hexShift: (_right, x) => x % 2 === 1,
    };
    // dx = 1 is odd and column 1 is shifted, so dy = 0 lands one row up.
    expect(resolveOrt(field, parseAddress("XC@(1,0)"), evaluate)).toMatchObject({
      x: 2,
      y: 0,
    });
    // dx = 0 is even, so no shift.
    expect(resolveOrt(field, parseAddress("XC@(0,0)"), evaluate)).toMatchObject({
      x: 1,
      y: 1,
    });
  });

  it("uses the half specifier to choose the field", () => {
    const field = board(CELL, { "false,0,0": 1, "true,1,0": 1 }, { players: 2 });
    // `@@(0,0;!)` is the other field, `@@(0,0;>)` the right one, `@@(0,0;=)` this one.
    expect(resolveOrt(field, parseAddress("XC@@(0,0;=)"), evaluate).right).toBe(false);
    expect(resolveOrt(field, parseAddress("XC@@(0,0;!)"), evaluate).right).toBe(true);
    expect(resolveOrt(field, parseAddress("XC@@(0,0;>)"), evaluate).right).toBe(true);
    expect(resolveOrt(field, parseAddress("XC@@(0,0;<)"), evaluate).right).toBe(false);
  });

  it("treats the right field as the left one when there is only one player", () => {
    // `rechts_ok(rechts) { return (!rechts) || (getSpielerZahl()>1); }` - so a one-player level
    // asking for `;!)` does not fail, it gets the left field. The half specifier is not a flag.
    const field = board(CELL, { "false,1,1": 1 });
    const opposite = resolveOrt(field, parseAddress("XC@@(0,0;!)"), evaluate);
    expect(opposite.right).toBe(true);
    expect(isReachable(field, opposite)).toBe(false);
  });

  it("resolves '@(x)' only from a falling blob, and '@@x' absolutely", () => {
    const falling: Here = { kind: "fall", x: 0, y: 0, right: false };
    const field = board(falling);
    // From a cell, a relative fall address is `nirgends`.
    expect(resolveOrt(board(CELL), parseAddress("XC@(1)"), evaluate)).toMatchObject({
      kind: "nowhere",
    });
    // `absort_fall` is `x = expr & 1, y = 0`.
    expect(resolveOrt(field, parseAddress("XC@@(3)"), evaluate)).toMatchObject({
      kind: "fall",
      x: 1,
      y: 0,
    });
  });
});

describe("reachability", () => {
  it("always reaches the global blob, whatever half is written", () => {
    // `case absort_global: ret = true;` - the one address that cannot be out of range.
    const field = board(CELL);
    for (const source of ["XC@", "XC@()"]) {
      const resolved = resolveOrt(field, parseAddress(source), evaluate);
      expect(isReachable(field, resolved), source).toBe(true);
    }
    expect(storeAt(field, resolveOrt(field, parseAddress("XC@()"), evaluate))).toBe(field.global);
  });

  it("cannot reach an info blob, which upstream returns false for and admits is a guess", () => {
    // "Auf Info-Blobs kann man von Cual-Code aus noch nicht zugreifen. Also vermute ich, dass
    // es hier einfach false zurückzuliefern -Immi"
    const field = board({ kind: "info" });
    expect(isReachable(field, { kind: "nowhere", x: 0, y: 0, right: false })).toBe(false);
  });

  it("does not reach the right field in a one-player game", () => {
    const field = board(CELL_RIGHT, {}, { players: 1 });
    expect(isReachable(field, resolveOrt(field, parseAddress("XC@@(0,0;>)"), evaluate))).toBe(
      false,
    );
  });

  it("does not reach an empty cell", () => {
    // A cell with no blob is not a target: `finde()` would have nothing to return.
    const field = board(CELL, { "false,0,0": 1 });
    expect(isReachable(field, resolveOrt(field, parseAddress("XC@@(2,2)"), evaluate))).toBe(false);
  });
});

describe("reading through an address", () => {
  it("reads the target's beginning-of-step value, not its live one", () => {
    // `ziel.finde().getVariableVergangenheit(...)` — the shadow, which is what makes `@` mean
    // "as of the start of the step" rather than "right now".
    const field = board(CELL, { "false,2,2": 1 });
    // The store `field.at` hands out, not a separately built one: the field owns its blobs, and
    // a test that mutates a different object than the one under test proves nothing.
    const target = field.at(false, 2, 2);
    if (!target) throw new Error("expected a blob at 2,2");
    target.set(KIND, 5);
    openSlice(field);
    target.set(KIND, 9);
    expect(target.get(KIND)).toBe(9);
    expect(
      readAddressed(field, resolveOrt(field, parseAddress("XC@@(2,2)"), evaluate), KIND, -5),
    ).toBe(5);
  });

  it("reads the variable's own default when the address is unreachable", () => {
    // `else return v.getDefaultWert();` with the comment "take the default independent of the
    // default-art" — the *variable's* declared default, not the kind's. `cual.6` says the
    // kind's default applies; the code says otherwise and the code is what runs.
    const field = board(CELL, { "false,2,2": 1 });
    const unreachable = resolveOrt(field, parseAddress("XC@@(3,3)"), evaluate);
    expect(isReachable(field, unreachable)).toBe(false);
    expect(readAddressed(field, unreachable, KIND, 42)).toBe(42);
    // The same default is used whatever the *kind* would have said.
    expect(readAddressed(field, unreachable, KIND, 7)).toBe(7);
  });

  it("is 'here' never: '@(0,0)' reads the shadow of the asking blob itself", () => {
    // "This is also true if a blob accesses its own variables with `@(0,0)`." It is an address,
    // so it takes the foreign path — which is why `x = x@(0,0) + 1` does not see its own write.
    const field = board(CELL, { "false,1,1": 1 });
    const self = field.at(false, 1, 1);
    if (!self) throw new Error("expected a blob on our own cell");
    self.set(KIND, 3);
    openSlice(field);
    self.set(KIND, 8);
    expect(self.get(KIND)).toBe(8);
    expect(readAddressed(field, resolveOrt(field, parseAddress("XC@(0,0)"), evaluate), KIND, -1)).toBe(
      3,
    );
  });
});

describe("writing through an address", () => {
  it("refuses to queue without an open window, as setVariableZukunft's assert does", () => {
    // `setVariableZukunft` starts with `CASSERT(gGleichZeit)`. A write that arrives outside a
    // window is a bug in the caller, not a value to apply whenever.
    const field = board(CELL, { "false,2,2": 1 });
    const resolved = resolveOrt(field, parseAddress("XC@@(2,2)"), evaluate);
    expect(storeAt(field, resolved)).toBe(field.at(false, 2, 2));
    expect(() => writeAddressed(field, resolved, KIND, 42, "=", new TimeSlices())).toThrow(
      /outside a Gleichzeitig/,
    );
  });

  it("queues onto the target's own slice, and applies at close", () => {
    const field = board(CELL, { "false,2,2": 1 });
    // The board's own slice, not a fresh one: a queue on a window nobody closes applies
    // nothing, which would look exactly like a deferred write that never lands.
    const target = field.at(false, 2, 2);
    if (!target) throw new Error("expected a blob at 2,2");
    openSlice(field);
    const resolved = resolveOrt(field, parseAddress("XC@@(2,2)"), evaluate);
    expect(writeAddressed(field, resolved, KIND, 42, "=", field.slices)).toBe(true);
    expect(target.get(KIND)).toBe(0);
    expect(field.slices.pending).toBe(1);
    field.slices.close();
    expect(target.get(KIND)).toBe(42);
  });

  it("does nothing at all when the address is unreachable, and says so", () => {
    const field = board(CELL, { "false,2,2": 1 });
    openSlice(field);
    const unreachable = resolveOrt(field, parseAddress("XC@@(3,3)"), evaluate);
    // "Changing a variable which doesn't exist does nothing (and does not result in an error)."
    expect(writeAddressed(field, unreachable, KIND, 42, "=", field.slices)).toBe(false);
    expect(field.slices.pending).toBe(0);
    field.slices.close();
    expect(field.at(false, 2, 2)?.get(KIND)).not.toBe(42);
  });
});
