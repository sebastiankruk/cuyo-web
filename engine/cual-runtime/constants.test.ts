// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The read-only constants, verified one at a time against a constructed board.
 *
 * The thing being tested is not "what number is `falling`" but *who answers it*. Upstream's
 * chain is blob → owner (a fall, or the board) → default, and the order is what makes a
 * falling piece report `falling` as 1 while a blob standing on a cell reports the default 0.
 * A resolver that reads all the values from one place would pass a table test and fail every
 * level that falls.
 */

import { describe, expect, it } from "vitest";
import {
  READ_ONLY_CONSTANTS,
  READ_ONLY_CONSTANT_COUNT,
  cellPixel,
  isReadOnlyConstant,
  readConstant,
} from "./constants.ts";
import type { BlobPosition, ConstantSubject, ConstantWorld } from "./constants.ts";
import { BLOBART_AUSSERHALB } from "./store.ts";

/** A 12x16 field of 8-pixel rows, one player, one turn in, not mirrored, not scrolled. */
const WORLD: ConstantWorld = {
  width: 12,
  height: 16,
  players: 1,
  time: 0,
  mirrored: false,
  rowHeight: 8,
  verticalScroll: 0,
  hexShift: () => false,
};

function subject(
  position: BlobPosition = { kind: "cell", x: 3, y: 5, right: false },
  overrides: Partial<ConstantSubject> = {},
  world: Partial<ConstantWorld> = {},
): ConstantSubject {
  return {
    position,
    world: { ...WORLD, ...world },
    chainSize: 0,
    baseKind: BLOBART_AUSSERHALB,
    fall: null,
    fallIndex: 0,
    exploding: 0,
    ...overrides,
  };
}

/** Read a constant that the subject must answer, failing loudly if it does not. */
function read(name: string, from: ConstantSubject): number {
  const value = readConstant(name, from);
  if (value === null) throw new Error(`'${name}' is not a read-only constant`);
  return value;
}

describe("the constant table", () => {
  it("is the fifteen names in knoten.cpp's order, at blop.h's negative numbers", () => {
    // `#define spezconst_turn (-1)` … `#define spezconst_info (-15)`, and
    // `spezconst_namen` in that order, with the default looked up at `-vnr - 1`. If these two
    // disagree, `loc_x` answers with `players`.
    expect(READ_ONLY_CONSTANT_COUNT).toBe(15);
    expect(READ_ONLY_CONSTANTS.map((c) => c.name)).toEqual([
      "turn",
      "connect",
      "falling",
      "size",
      "loc_x",
      "loc_y",
      "loc_p",
      "players",
      "falling_fast",
      "exploding",
      "loc_xx",
      "loc_yy",
      "basekind",
      "time",
      "informational",
    ]);
    READ_ONLY_CONSTANTS.forEach((constant, index) => {
      expect(constant.number).toBe(-(index + 1));
    });
  });

  it("carries knoten.cpp's default values", () => {
    const defaults = Object.fromEntries(
      READ_ONLY_CONSTANTS.map((c) => [c.name, c.defaultValue]),
    );
    expect(defaults.loc_x).toBe(-1);
    expect(defaults.loc_y).toBe(-1);
    expect(defaults.loc_xx).toBe(-1);
    expect(defaults.loc_yy).toBe(-1);
    expect(defaults.basekind).toBe(-5);
    expect(defaults.falling).toBe(0);
    expect(defaults.turn).toBe(0);
  });

  it("knows which names are constants, and refuses `connect` rather than defaulting it", () => {
    expect(isReadOnlyConstant("loc_x")).toBe(true);
    expect(isReadOnlyConstant("my_var")).toBe(false);
    // `connect` is the neighbour bitmask, and its default of 0 would make every neighbour
    // pattern false - a silent wrong answer rather than an absent one.
    expect(() => read("connect", subject())).toThrow(/task 3\.10/);
  });

  it("returns null for a name that is not one, so the caller can try the user variables", () => {
    expect(readConstant("my_var", subject())).toBeNull();
  });
});

describe("the constants the blob answers itself", () => {
  it("size is the chain size", () => {
    expect(read("size", subject(undefined, { chainSize: 7 }))).toBe(7);
  });

  it("players and time come from the world", () => {
    expect(read("players", subject(undefined, {}, { players: 3 }))).toBe(3);
    expect(read("time", subject(undefined, {}, { time: 417 }))).toBe(417);
  });

  it("exploding is the beginning-of-step value, so it is passed in shadowed", () => {
    // `getVariableVergangenheit(spezvar_am_platzen)` - the shadow, not the live value.
    expect(read("exploding", subject(undefined, { exploding: 5 }))).toBe(5);
  });

  it("basekind is the beginning-of-step kind", () => {
    // `getSorte(vergangenheit)->getBasekind()` - also past, like `verbindetMit` in 3.10.
    expect(read("basekind", subject(undefined, { baseKind: 9 }))).toBe(9);
  });

  it("loc_p is 1 for left and 2 for right, and undefined for the global blobs", () => {
    // `return mOrt.rechts ? 2 : 1;`
    expect(read("loc_p", subject({ kind: "fall", x: 0, y: 0, right: false }))).toBe(1);
    expect(read("loc_p", subject({ kind: "fall", x: 1, y: 0, right: true }))).toBe(2);
    expect(read("loc_p", subject({ kind: "cell", x: 3, y: 5, right: false }))).toBe(1);
    // Upstream throws for the global, semiglobal and nowhere blobs: they have no left or
    // right. `absort_nirgends` was missing from both the list and the message until 5.20.
    expect(() => read("loc_p", subject({ kind: "global" }))).toThrow(/global, semiglobal or nowhere/);
    expect(() => read("loc_p", subject({ kind: "semiglobal" }))).toThrow(
      /global, semiglobal or nowhere/,
    );
    expect(() => read("loc_p", subject({ kind: "nowhere" }))).toThrow(
      /global, semiglobal or nowhere/,
    );
    // And the right-hand field of a two-player game, which a fall-only reading got wrong.
    expect(read("loc_p", subject({ kind: "cell", x: 3, y: 5, right: true }))).toBe(2);
    // `absort_info` has no side of its own, so `mOrt.rechts` is false and it answers 1.
    expect(read("loc_p", subject({ kind: "info" }))).toBe(1);
  });

  it("informational is true for the info blob and for a fall that is not at y = 0", () => {
    // `mOrt.art == absort_info || (mOrt.art == absort_fall && mOrt.y)`
    expect(read("informational", subject({ kind: "info" }))).toBe(1);
    expect(read("informational", subject({ kind: "fall", x: 0, y: 1, right: false }))).toBe(1);
    expect(read("informational", subject({ kind: "fall", x: 0, y: 0, right: false }))).toBe(0);
    expect(read("informational", subject({ kind: "cell", x: 1, y: 1, right: false }))).toBe(0);
  });
});

describe("loc_x and loc_y", () => {
  it("are the cell coordinates for a blob on the field", () => {
    expect(read("loc_x", subject({ kind: "cell", x: 3, y: 5, right: false }))).toBe(3);
    expect(read("loc_y", subject({ kind: "cell", x: 3, y: 5, right: false }))).toBe(5);
  });

  it("are mirrored when the level is mirrored", () => {
    // `ld->mSpiegeln ? grx - 1 - mOrt.x : mOrt.x`
    const mirrored = subject({ kind: "cell", x: 3, y: 5, right: false }, {}, { mirrored: true });
    expect(read("loc_x", mirrored)).toBe(12 - 1 - 3);
    expect(read("loc_y", mirrored)).toBe(16 - 1 - 5);
  });

  it("refuses a falling piece's coordinates rather than approximating them", () => {
    // `Blop::getSpezConst` only answers `loc_x` when `mOrt.art == absort_feld`; otherwise it
    // `break`s and the owner gets a turn — and for a fall that owner answers from
    // `pos_fall`'s half-cell geometry, not from the cell the fall came from.
    //
    // Approximating with `position.x` would differ by half a cell for every rotated fall, and
    // falling back to the default of -1 would be a silent wrong answer. So it refuses.
    const falling = subject({ kind: "fall", x: 6, y: 2, right: false });
    expect(() => read("loc_x", falling)).toThrow(/pos_fall/);
    expect(() => read("loc_y", falling)).toThrow(/pos_fall/);
    expect(() => read("loc_xx", falling)).toThrow(/pos_fall/);
    expect(() => read("loc_yy", falling)).toThrow(/pos_fall/);
  });

  it("are the default for a blob with no position at all", () => {
    expect(read("loc_x", subject({ kind: "nowhere" }))).toBe(-1);
    expect(read("loc_y", subject({ kind: "nowhere" }))).toBe(-1);
  });
});

describe("loc_xx and loc_yy", () => {
  it("are pixels, not cells, and include the vertical scroll", () => {
    // `xx = x * gric; yy = y * gric - mHochVerschiebung - getHexShift(x) * gric / 2;`
    // Asserted against the formula rather than a nice number, because "pixels" is the part
    // that looks like a mistake and is not.
    const at = subject({ kind: "cell", x: 3, y: 5, right: false });
    expect(read("loc_xx", at)).toBe(3 * 8);
    expect(read("loc_yy", at)).toBe(5 * 8);

    const scrolled = subject({ kind: "cell", x: 3, y: 5, right: false }, {}, { verticalScroll: 16 });
    expect(read("loc_xx", scrolled)).toBe(3 * 8);
    expect(read("loc_yy", scrolled)).toBe(5 * 8 - 16);
  });

  it("shift up by half a row in a hex column that is offset", () => {
    const shifted = subject({ kind: "cell", x: 3, y: 5, right: false }, {}, { hexShift: (x) => x % 2 === 1 });
    expect(read("loc_yy", shifted)).toBe(5 * 8 - 4);
    const unshifted = subject({ kind: "cell", x: 2, y: 5, right: false }, {}, { hexShift: (x) => x % 2 === 1 });
    expect(read("loc_yy", unshifted)).toBe(5 * 8);
  });

  it("are the formula, exposed for the draw code to reuse", () => {
    expect(cellPixel(WORLD, 3, 5)).toEqual({ xx: 24, yy: 40 });
  });

  it("are the default for a blob with no position", () => {
    expect(read("loc_xx", subject({ kind: "nowhere" }))).toBe(-1);
    expect(read("loc_yy", subject({ kind: "nowhere" }))).toBe(-1);
  });
});

describe("the constants only a falling piece answers", () => {
  const falling = subject({ kind: "fall", x: 4, y: 0, right: false }, {
    fall: { extraTurn: 0, fast: false },
  });

  it("falling is 1 for a fall and the default 0 for anything else", () => {
    // `case spezconst_falling: return 1;` in `Fall::getSpezConst`. The blob does not answer
    // it, so a blob standing on a cell falls through to the default of 0 - not to some other
    // route to false.
    expect(read("falling", falling)).toBe(1);
    expect(read("falling", subject({ kind: "cell", x: 1, y: 1, right: false }))).toBe(0);
  });

  it("falling_fast is the fall's own flag", () => {
    expect(read("falling_fast", falling)).toBe(0);
    const fast = subject({ kind: "fall", x: 4, y: 0, right: false }, {
      fall: { extraTurn: 0, fast: true },
    });
    expect(read("falling_fast", fast)).toBe(1);
  });

  it("turn is the digit at the fall's extra rotation, out of 0211", () => {
    // `return "0211"[mExtraDreh] - '0';`
    //
    // Upstream flags this as a latent bug beside it: the assert was once `mExtraDreh < 3` while
    // the table has four entries, and the assertion was violated non-reproducibly at the first
    // image build before the game but not in the first game. So the fourth value is reachable
    // and reads as 1. Transcribed as the table, not as the assert - the assert would make the
    // fourth quarter unreachable and quietly change the sequence.
    for (const [extraTurn, expected] of [
      [0, 0],
      [1, 2],
      [2, 1],
      [3, 1],
    ] as const) {
      const at = subject({ kind: "fall", x: 0, y: 0, right: false }, {
        fall: { extraTurn, fast: false },
      });
      expect(read("turn", at), `mExtraDreh ${extraTurn}`).toBe(expected);
    }
  });

  it("are the default 0 for a blob standing on a cell", () => {
    const still = subject({ kind: "cell", x: 2, y: 2, right: false });
    expect(read("turn", still)).toBe(0);
    expect(read("falling", still)).toBe(0);
    expect(read("falling_fast", still)).toBe(0);
  });
});
