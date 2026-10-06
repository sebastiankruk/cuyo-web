// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * A falling piece's geometry, checked against upstream's formulas rather than against a picture.
 *
 * The temptation with a digit table and a pair of `sin`/`cos` literals is to assert a handful of
 * round numbers and call it done — `getXX` of an unrotated piece at column 3 is 96, and that is
 * also what several wrong implementations produce. So the assertions here are about the *structure*
 * upstream depends on:
 *
 * - the two tables are 22 characters and the reachable indices land on digits, not spaces;
 * - `drehIndex` reaches exactly the index set the tables are built for, and returns `21` for a
 *   piece that is not rotated;
 * - the `WANDEL` literals are `gric * sin(30°)` and `gric * cos(30°)` **for this `gric`**, so a
 *   changed `GRIC` cannot pass unnoticed;
 * - `cellY` truncates toward zero rather than flooring, which differs for a piece above the border;
 * - the unplaced branch of `pixelY` returns from the border and never consults the table.
 */

import { describe, expect, it } from "vitest";
import {
  DREH_X,
  DREH_Y,
  RICHTUNG_EINZEL,
  RICHTUNG_KEINS,
  RICHTUNG_SENK,
  RICHTUNG_UNPLATZIERT,
  RICHTUNG_WAAG,
  WANDEL,
  cellX,
  cellY,
  drehIndex,
  fallCount,
  pixelX,
  pixelY,
} from "./fall-geometry.ts";
import type { FallPos, FallWorld } from "./fall-geometry.ts";
import { GRIC, GRX, GRY } from "./constants.ts";
import { readConstant } from "../cual-runtime/constants.ts";
import type { ConstantWorld } from "../cual-runtime/constants.ts";

const WORLD: ConstantWorld = {
  width: GRX,
  height: GRY,
  players: 1,
  time: 0,
  mirrored: false,
  rowHeight: GRIC,
  verticalScroll: 0,
  hexShift: () => false,
};

const NOWHERE: FallWorld = { borderPx: 0, hexShift: () => false };
const HALF_ROW: FallWorld = { borderPx: 0, hexShift: (x) => x % 2 === 1 };
const SETTLED: FallPos = { x: 3, yy: 64, r: RICHTUNG_WAAG };
const NO_OFFSET = { extraX: 0, extraDreh: 0 };

describe("the falling piece's two tables", () => {
  it("are 22 characters, because the index arithmetic depends on the spaces", () => {
    expect(DREH_X).toHaveLength(22);
    expect(DREH_Y).toHaveLength(22);
    // Five spaces and 17 digits. The groups are the same in both tables in a different order —
    // which is upstream's, not a typo, and is why the second is not derived from the first.
    expect(DREH_X.replace(/ /g, "")).toHaveLength(17);
    expect(DREH_X).toHaveLength(17 + DREH_X.split(" ").length - 1);
    expect(new Set(DREH_X.replace(/ /g, ""))).toEqual(new Set(DREH_Y.replace(/ /g, "")));
  });

  it("put a digit, never a space, at every index drehIndex can reach", () => {
    // Every combination of the four packed facts, for both blobs.
    for (let dreh = 1; dreh <= 3; dreh += 1) {
      for (const mirrored of [false, true]) {
        for (const r of [RICHTUNG_KEINS, RICHTUNG_EINZEL, RICHTUNG_WAAG, RICHTUNG_SENK] as const) {
          for (const a of [0, 1]) {
            for (const ed of [1, 2, 3]) {
              const index = drehIndex({ x: 0, yy: 0, r }, a, { extraX: 0, extraDreh: dreh }, mirrored);
              expect(Number.isInteger(index)).toBe(true);
              expect(index).toBeLessThan(DREH_X.length);
              expect(DREH_X[index]).toMatch(/[0-9]/);
              expect(DREH_Y[index]).toMatch(/[0-9]/);
              void ed;
            }
          }
        }
      }
    }
  });

  it("read index 21 — 'not rotated at all' — as offset 1", () => {
    // The sixth case, and the only index the tables share that no combination of the four packed
    // facts produces. `fall.cpp:567`: "3 bedeutet eigentlich: Noch gar nicht gedreht".
    expect(drehIndex(SETTLED, 0, NO_OFFSET, false)).toBe(21);
    expect(drehIndex(SETTLED, 1, NO_OFFSET, true)).toBe(21);
    expect(DREH_X.charCodeAt(21) - "1".charCodeAt(0)).toBe(1);
    expect(DREH_Y.charCodeAt(21) - "1".charCodeAt(0)).toBe(1);
  });

  it("collapse extraDreh 3 into 2, as the comment above them says", () => {
    // `int ed = mExtraDreh; if (ed == 3) ed = 2;` — so 3 and 2 agree, and 1 does not.
    const at = (extraDreh: number): number => drehIndex(SETTLED, 0, { extraX: 0, extraDreh }, false);
    expect(at(3)).toBe(at(2));
    expect(at(1)).not.toBe(at(2));
  });

  it("pack mirroring, verticalness and which blob is asking", () => {
    // "Bit 21: gar nicht gedreht | Bit 10: Spiegel? | Bit 5: wirdSenk? | Bit 2: Blob1? |
    //  Bit 1: Schritt1?" — read as base-5 digits, so each fact is a separate weight.
    const offsets = { extraX: 0, extraDreh: 1 };
    const base = drehIndex({ x: 0, yy: 0, r: RICHTUNG_WAAG }, 0, offsets, false);
    expect(drehIndex({ x: 0, yy: 0, r: RICHTUNG_WAAG }, 1, offsets, false) - base).toBe(2);
    expect(drehIndex({ x: 0, yy: 0, r: RICHTUNG_WAAG }, 0, offsets, true) - base).toBe(10);
    // `istSenkrecht()` is `r == waag || r == senk`, so neither of the other two counts.
    expect(drehIndex({ x: 0, yy: 0, r: RICHTUNG_SENK }, 0, offsets, false) - base).toBe(0);
    expect(drehIndex({ x: 0, yy: 0, r: RICHTUNG_EINZEL }, 0, offsets, false) - base).toBe(-5);
    expect(drehIndex({ x: 0, yy: 0, r: RICHTUNG_UNPLATZIERT }, 0, offsets, false) - base).toBe(-5);
  });
});

describe("WANDEL", () => {
  it("is gric times the 30-degree trigonometry, for this gric", () => {
    // `fall.cpp:30-31` `#define`s them as literals for gric 32. Asserting the relationship
    // rather than the numbers means a changed GRIC fails here instead of quietly moving every
    // rotated piece's picture by a different amount.
    // Rounded, because `32 * sin(30°)` in floating point is 15.999999999999998 and the question
    // being asked is "is this literal the trigonometry at this `gric`", not "is this literal the
    // exact product of two doubles".
    const sin = Math.round(GRIC * Math.sin(Math.PI / 6));
    const cos = Math.round(GRIC * Math.cos(Math.PI / 6));
    expect(WANDEL[0]).toBe(sin - GRIC);
    expect(WANDEL[1]).toBe(0);
    expect(WANDEL[2]).toBe(sin);
    expect(WANDEL[3]).toBe(cos);
    expect(WANDEL[4]).toBe(cos - GRIC);
    // The two distinct offsets, so the table is not symmetric by accident.
    expect(sin).toBeLessThan(cos);
    // And they are integers, which they are because upstream wrote integers.
    expect(WANDEL.every(Number.isInteger)).toBe(true);
  });
});

describe("fallCount", () => {
  it("is 0, 1 or 2 from the orientation alone", () => {
    // `fall.cpp:60`'s switch: keins 0, einzeln 1, everything else 2.
    expect(fallCount({ x: 0, yy: 0, r: RICHTUNG_KEINS })).toBe(0);
    expect(fallCount({ x: 0, yy: 0, r: RICHTUNG_EINZEL })).toBe(1);
    for (const r of [RICHTUNG_WAAG, RICHTUNG_SENK, RICHTUNG_UNPLATZIERT] as const) {
      expect(fallCount({ x: 0, yy: 0, r })).toBe(2);
    }
  });
});

describe("cellX", () => {
  it("puts the second blob beside the first for a horizontal piece, and not for a vertical one", () => {
    expect(cellX({ x: 3, yy: 0, r: RICHTUNG_WAAG }, 0)).toBe(3);
    expect(cellX({ x: 3, yy: 0, r: RICHTUNG_WAAG }, 1)).toBe(4);
    expect(cellX({ x: 3, yy: 0, r: RICHTUNG_SENK }, 1)).toBe(3);
    // An unplaced piece counts as horizontal — "where it will appear" is a column.
    expect(cellX({ x: 3, yy: 0, r: RICHTUNG_UNPLATZIERT }, 1)).toBe(4);
  });
});

describe("cellY", () => {
  it("is the pixel row divided by gric, with the -1 that makes a top edge a bottom edge", () => {
    // `yy + gric - 1`, then `/ gric`. At yy = 0 that is `gric - 1`, i.e. row 0 — the piece is
    // entering from the top. Dropping the `- 1` would put it a row higher than upstream does for
    // every value of `yy`, which is the whole of this function's contribution.
    expect(cellY({ x: 0, yy: 0, r: RICHTUNG_EINZEL }, 0, NOWHERE)).toBe(0);
    // Row N needs `yy + GRIC - 1` in `[N * GRIC, N * GRIC + GRIC)`, so the *lowest* `yy` for row N
    // is `N * GRIC - GRIC + 1` — one pixel higher than the naive `N * GRIC - GRIC`.
    for (const row of [0, 1, 5, 19]) {
      const lowest = row * GRIC - GRIC + 1;
      expect(cellY({ x: 0, yy: lowest, r: RICHTUNG_EINZEL }, 0, NOWHERE)).toBe(row);
      // One pixel lower is the next row up, which is what makes the `- 1` a rounding edge rather
      // than a constant offset.
      expect(cellY({ x: 0, yy: lowest + GRIC, r: RICHTUNG_EINZEL }, 0, NOWHERE)).toBe(row + 1);
    }
  });

  it("adds a row for the second blob of a vertical piece", () => {
    const pos: FallPos = { x: 0, yy: GRIC * 4, r: RICHTUNG_SENK };
    expect(cellY(pos, 0, NOWHERE)).toBe(4);
    expect(cellY(pos, 1, NOWHERE)).toBe(5);
    // And not for a horizontal one, whose second blob is in the same row.
    const waag: FallPos = { x: 0, yy: GRIC * 4, r: RICHTUNG_WAAG };
    expect(cellY(waag, 1, NOWHERE)).toBe(4);
  });

  it("adds half a row for a hex-shifted column, on the blob's own column", () => {
    // The hex correction asks `getHexShift(getX(a))`, so for a horizontal piece the two blobs
    // can disagree — which a constant taken from `pos.x` would hide.
    // `yy = 4 * GRIC` puts the piece at the *bottom* of row 4, so a half-row shift lifts it to 5.
    // The point is that the two blobs of a horizontal piece can land in different rows, which a
    // correction taken from `pos.x` rather than `getX(a)` would make impossible.
    const pos: FallPos = { x: 1, yy: GRIC * 4, r: RICHTUNG_WAAG };
    expect(cellY(pos, 0, HALF_ROW)).toBe(5); // column 1, shifted
    expect(cellY(pos, 1, HALF_ROW)).toBe(4); // column 2, not shifted
    const even: FallPos = { x: 0, yy: GRIC * 4, r: RICHTUNG_WAAG };
    expect(cellY(even, 0, HALF_ROW)).toBe(4);
    expect(cellY(even, 1, HALF_ROW)).toBe(5); // column 1, shifted
  });

  it("truncates toward zero, which is not the same as flooring", () => {
    // C++'s `/` truncates. `Math.floor` would differ for a negative `y0`, which is what a piece
    // above the border has — `loc_y` is read by levels, so the difference is observable.
    // `yy = -gric` makes `y0 = -1`, which is the first value where the two disagree: C++ truncates
    // towards zero and gives 0, `Math.floor` gives -1. Every `loc_y` of a piece still above the
    // border turns on this, which is why it is asserted as a difference and not as a value.
    const above: FallPos = { x: 0, yy: -GRIC, r: RICHTUNG_EINZEL };
    expect(cellY(above, 0, NOWHERE)).toBe(0);
    expect(Math.floor((-GRIC + GRIC - 1) / GRIC)).toBe(-1);
    // And it is the *only* difference: at `yy = 0` the answer is 0 either way.
    expect(cellY({ x: 0, yy: 0, r: RICHTUNG_EINZEL }, 0, NOWHERE)).toBe(0);
  });

  it("measures an unplaced piece from the border, not from the preview", () => {
    // "Bei unplatzierten blobs ist yy die Koord relativ zur ins-Spiel-Komm-Position" — so
    // `+ hetzrandYPix - gric`, which is the whole difference between where a piece is drawn and
    // where it will land.
    // At `borderPx = 0` the formula gives `y0 = -1`, and truncation makes that row **0** rather
    // than -1: a next piece above the border reads as being in the top row, not above it.
    const pos: FallPos = { x: 0, yy: 0, r: RICHTUNG_UNPLATZIERT };
    expect(cellY(pos, 0, { borderPx: 0, hexShift: () => false })).toBe(0);
    expect(cellY(pos, 0, { borderPx: GRIC * 10, hexShift: () => false })).toBe(9);
    // `borderPx - gric` is the offset, so the answer moves with the border and not with `yy`.
    expect(cellY({ x: 0, yy: GRIC * 3, r: RICHTUNG_UNPLATZIERT }, 0, {
      borderPx: GRIC * 10,
      hexShift: () => false,
    })).toBe(12);
  });
});

describe("pixelX", () => {
  it("is the blob's column times gric, plus the rotation offset, for a settled piece", () => {
    // Not rotated: index 21, `wandel[1]` is 0, so the answer is exactly the column.
    expect(pixelX(SETTLED, 0, NO_OFFSET, false)).toBe(3 * GRIC);
    expect(pixelX(SETTLED, 1, NO_OFFSET, false)).toBe(4 * GRIC);
  });

  it("adds mExtraX raw, as the source does, rather than scaling it by gric", () => {
    // Transcribed as written, and deliberately *not* "fixed". Asserting the literal form is what
    // keeps a later reader from quietly multiplying by gric on the reasonable-sounding grounds
    // that it is a cell count — upstream adds it raw, so this does.
    const slid = { extraX: 1, extraDreh: 0 };
    expect(pixelX(SETTLED, 0, slid, false)).toBe(3 * GRIC + 1);
    expect(pixelX(SETTLED, 0, { extraX: -1, extraDreh: 0 }, false)).toBe(3 * GRIC - 1);
  });

  it("takes its offset from the table when the piece is part-way through a turn", () => {
    // The whole reason the table exists. Asserted as "one of WANDEL, not zero", because which
    // group applies depends on all four packed facts and is upstream's arrangement.
    const turning = { extraX: 0, extraDreh: 1 };
    const seen = new Set<number>();
    for (const r of [RICHTUNG_WAAG, RICHTUNG_SENK] as const) {
      for (const mirrored of [false, true]) {
        for (const a of [0, 1]) {
          const pos: FallPos = { x: 3, yy: 0, r };
          // Subtract the blob's *own* column, not the piece's: for a horizontal piece the second
          // blob is a column right, and `pixelX` includes that before the table is consulted.
          const offset = pixelX(pos, a, turning, mirrored) - cellX(pos, a) * GRIC;
          expect(WANDEL).toContain(offset);
          seen.add(offset);
        }
      }
    }
    // **More than one distinct offset**, because a table in which every combination gives the same
    // answer is not a table. This is the assertion that would fail if `drehIndex` collapsed all
    // four packed facts into one, which is a plausible-looking simplification.
    expect(seen.size).toBeGreaterThan(1);
    // And the unrotated answer is `wandel[1]` = 0, so at least one combination differs from it —
    // a rotation has to be *visible*, not merely present.
    expect(pixelX({ x: 3, yy: 0, r: RICHTUNG_WAAG }, 0, NO_OFFSET, false) - 3 * GRIC).toBe(0);
    expect([...seen].some((offset) => offset !== 0)).toBe(true);
  });
});

describe("pixelY", () => {
  it("is the pixel row plus the rotation offset, for a settled piece", () => {
    expect(pixelY(SETTLED, 0, NO_OFFSET, false, NOWHERE)).toBe(64);
    expect(pixelY({ x: 0, yy: 0, r: RICHTUNG_WAAG }, 0, NO_OFFSET, false, NOWHERE)).toBe(0);
  });

  it("adds gric for the second blob of a vertical piece", () => {
    const pos: FallPos = { x: 0, yy: 40, r: RICHTUNG_SENK };
    expect(pixelY(pos, 0, NO_OFFSET, false, NOWHERE)).toBe(40);
    expect(pixelY(pos, 1, NO_OFFSET, false, NOWHERE)).toBe(40 + GRIC);
  });

  it("returns from the border for an unplaced piece, and never reads the table", () => {
    // `getYY`'s first branch, before `drehy` is even computed. `pixelX` has no such branch
    // because `mPos.x` for a next piece is already "where it will appear".
    const pos: FallPos = { x: 2, yy: 16, r: RICHTUNG_UNPLATZIERT };
    expect(pixelY(pos, 0, NO_OFFSET, false, { borderPx: 320, hexShift: () => false })).toBe(
      320 - GRIC + 16,
    );
    // Same answer whatever the rotation, because the branch returns first.
    const turning = { extraX: 0, extraDreh: 1 };
    expect(pixelY(pos, 1, turning, true, { borderPx: 320, hexShift: () => false })).toBe(
      320 - GRIC + 16,
    );
  });
});
describe("the geometry reaches readConstant, which is the only reason it exists", () => {
  it("answers loc_x and loc_xx for a falling blob from the piece, not from a cell", () => {
    // The integration that 15.6 was blocked on: `constants.ts` refused `loc_x` for a fall because
    // the arithmetic is the fall's own, and `ConstantSubject.fallCoordinates` is how the caller
    // supplies it. Asserted end to end so a future change to either side's shape fails here rather
    // than in a level.
    const piece: FallPos = { x: 3, yy: 64, r: RICHTUNG_WAAG };
    const world: FallWorld = { borderPx: 0, hexShift: () => false };
    const at = readConstant("loc_x", {
      position: { kind: "fall", x: 3, y: 64, right: false },
      world: WORLD,
      chainSize: 0,
      baseKind: 0,
      fall: { extraTurn: 0, fast: false },
      fallIndex: 0,
      exploding: 0,
      fallCoordinates: {
        cellX: cellX(piece, 0),
        cellY: cellY(piece, 0, world),
        pixelX: pixelX(piece, 0, NO_OFFSET, false),
        pixelY: pixelY(piece, 0, NO_OFFSET, false, world),
      },
    });
    expect(at).toBe(3);
    // And `loc_xx` is the *pixel* answer, which differs from `loc_x` by a factor of gric.
    const xx = readConstant("loc_xx", {
      position: { kind: "fall", x: 3, y: 64, right: false },
      world: WORLD,
      chainSize: 0,
      baseKind: 0,
      fall: { extraTurn: 0, fast: false },
      fallIndex: 0,
      exploding: 0,
      fallCoordinates: {
        cellX: cellX(piece, 0),
        cellY: cellY(piece, 0, world),
        pixelX: pixelX(piece, 0, NO_OFFSET, false),
        pixelY: pixelY(piece, 0, NO_OFFSET, false, world),
      },
    });
    expect(xx).toBe(3 * GRIC);
  });

  it("still refuses rather than answering something plausible", () => {
    // No `fallCoordinates`: a wiring gap, and the failure this refusal exists to prevent is a
    // *wrong* answer — `getXX` and `getX` differ, so a cell-coordinate fallback would be wrong by
    // a factor of gric and by the rotation offset.
    expect(() =>
      readConstant("loc_xx", {
        position: { kind: "fall", x: 3, y: 64, right: false },
        world: WORLD,
        chainSize: 0,
        baseKind: 0,
        fall: { extraTurn: 0, fast: false },
        fallIndex: 0,
        exploding: 0,
      }),
    ).toThrow(/fall-geometry/);
  });
});
