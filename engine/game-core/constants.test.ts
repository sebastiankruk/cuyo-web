/**
 * The neighbour-offset tables are transcribed by hand from
 * `src/nachbariterator.cpp:NachbarIterator::setXY`, where offsets are written
 * as digit characters offset by `'2'` (so `'0'`-`'4'` mean -2..+2).
 *
 * A transcription slip here would not crash: it would make a level connect
 * blobs in the wrong directions and quietly play wrong. These tests therefore
 * encode upstream's own bx/by strings and derive the expected offsets from
 * them, so the tables are checked against the source rather than against
 * themselves.
 */

import { describe, expect, it } from "vitest";
import {
  GRX,
  NeighbourMode,
  columnShift,
  hexGeometry,
  isHexMode,
  neighbourOffsets,
} from "./constants.ts";

/** Decodes upstream's digit encoding: '0'..'4' are -2..+2. */
function decode(bx: string, by: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < bx.length; i++) {
    out.push([bx.charCodeAt(i) - 50, by.charCodeAt(i) - 50]);
  }
  return out;
}

const asPairs = (offsets: readonly { dx: number; dy: number }[]) =>
  offsets.map((o) => [o.dx, o.dy]);

describe("neighbourOffsets: rectangular modes", () => {
  it("matches upstream '1232' / '2321' for rect", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Rect, 0))).toEqual(
      decode("1232", "2321"),
    );
  });

  it("matches upstream '1133' / '1313' for diagonal", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Diagonal, 0))).toEqual(
      decode("1133", "1313"),
    );
  });

  it("matches upstream '13' / '22' for horizontal", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Horizontal, 0))).toEqual(
      decode("13", "22"),
    );
  });

  it("matches upstream '22' / '31' for vertical", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Vertical, 0))).toEqual(
      decode("22", "31"),
    );
  });

  it("combines rect and diagonal for queen", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Eight, 0))).toEqual([
      ...decode("1232", "2321"),
      ...decode("1133", "1313"),
    ]);
  });

  it("matches upstream '00134431' / '13443100' for knight", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Knight, 0))).toEqual(
      decode("00134431", "13443100"),
    );
  });

  it("has no offsets for neighbours_none", () => {
    expect(neighbourOffsets(NeighbourMode.None, 0)).toEqual([]);
  });
});

describe("neighbourOffsets: knight offsets are real knight moves", () => {
  it("produces the eight knight offsets", () => {
    const offsets = neighbourOffsets(NeighbourMode.Knight, 0);
    expect(offsets).toHaveLength(8);
    for (const { dx, dy } of offsets) {
      const a = Math.abs(dx);
      const b = Math.abs(dy);
      expect([a, b].sort()).toEqual([1, 2]);
    }
  });

  it("is symmetric", () => {
    const offsets = neighbourOffsets(NeighbourMode.Knight, 0);
    for (const { dx, dy } of offsets) {
      expect(
        offsets.some((o) => o.dx === -dx && o.dy === -dy),
        `(${dx},${dy}) has no opposite`,
      ).toBe(true);
    }
  });
});

describe("hex modes", () => {
  // A hex board with the default `hexflip = 0`: odd columns are offset, so column
  // 1 takes the shifted digit row and column 0 the unshifted one.
  const HEX = hexGeometry(NeighbourMode.Hex6);

  it("offsets odd columns only, and only in a hex board", () => {
    // The board's geometry, not a blob's mode: `LevelDaten::ladLevel` reads
    // `mSechseck` from the level-wide `neighbours` and `getHexShift` reads that,
    // so a kind asking for hex six in a rectangular board still draws square.
    for (const x of [0, 1, 2, 3]) {
      expect(columnShift(hexGeometry(NeighbourMode.Rect), false, x)).toBe(false);
      expect(columnShift(hexGeometry(NeighbourMode.Eight), false, x)).toBe(false);
      expect(columnShift(hexGeometry(NeighbourMode.Hex6), false, x)).toBe(x % 2 === 1);
      expect(columnShift(hexGeometry(NeighbourMode.Hex4), false, x)).toBe(x % 2 === 1);
    }
  });

  it("flips the offset with hexflip, and each side of the board separately", () => {
    // `getHexShift`: bit 0 of hexflip flips the left player's columns, bit 1 the
    // right's, so a two-player hex board can run the two halves in opposite
    // directions. That is why there are four values and not two.
    const shifted = (flip: number, right: boolean): boolean[] =>
      [0, 1, 2, 3].map((x) => columnShift(hexGeometry(NeighbourMode.Hex6, flip), right, x));
    // Both bits clear: both halves offset their odd columns.
    expect(shifted(0, false)).toEqual([false, true, false, true]);
    expect(shifted(0, true)).toEqual([false, true, false, true]);
    // Bit 0 flips the left half, leaving the right alone.
    expect(shifted(1, false)).toEqual([true, false, true, false]);
    expect(shifted(1, true)).toEqual([false, true, false, true]);
    // Bit 1 flips the right half, leaving the left alone.
    expect(shifted(2, false)).toEqual([false, true, false, true]);
    expect(shifted(2, true)).toEqual([true, false, true, false]);
    // Both bits: the two halves run in opposite directions, which is the case
    // the four values exist for.
    expect(shifted(3, false)).toEqual([true, false, true, false]);
    expect(shifted(3, true)).toEqual([true, false, true, false]);
  });

  it("ignores hexflip in a rectangular board", () => {
    for (let flip = 0; flip < 4; flip++) {
      for (const right of [false, true]) {
        expect(columnShift(hexGeometry(NeighbourMode.Rect, flip), right, 1)).toBe(false);
      }
    }
  });

  it("gives a kind's hex mode unshifted offsets in a rectangular board", () => {
    // `NachbarIterator::setXY` takes the mode from the blob's kind and the
    // shifted-or-unshifted digit row from the board. In a rectangular board a
    // hex-six kind gets hex six's offsets on an unshifted grid.
    const rect = hexGeometry(NeighbourMode.Rect);
    const hex = hexGeometry(NeighbourMode.Hex6);
    expect(neighbourOffsets(NeighbourMode.Hex6, 0, rect)).toEqual(
      neighbourOffsets(NeighbourMode.Hex6, 0, hex),
    );
    expect(neighbourOffsets(NeighbourMode.Hex6, 1, rect)).toEqual(
      neighbourOffsets(NeighbourMode.Hex6, 0, hex),
    );
    // And in a hex board the same kind does get the shifted row in odd columns.
    expect(neighbourOffsets(NeighbourMode.Hex6, 1, hex)).not.toEqual(
      neighbourOffsets(NeighbourMode.Hex6, 0, hex),
    );
  });

  it("marks exactly hex6, hex4 and 3D as hex", () => {
    expect(isHexMode(NeighbourMode.Hex6)).toBe(true);
    expect(isHexMode(NeighbourMode.Hex4)).toBe(true);
    expect(isHexMode(NeighbourMode.ThreeD)).toBe(true);
    for (const mode of [
      NeighbourMode.Rect,
      NeighbourMode.Diagonal,
      NeighbourMode.Knight,
      NeighbourMode.Eight,
      NeighbourMode.None,
      NeighbourMode.Horizontal,
      NeighbourMode.Vertical,
    ]) {
      expect(isHexMode(mode)).toBe(false);
    }
  });

  it("matches upstream '221133'/'131212' for a shifted hex6 column", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Hex6, 1, HEX))).toEqual(
      decode("221133", "131212"),
    );
  });

  it("matches upstream '221133'/'132323' for an unshifted hex6 column", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Hex6, 0, HEX))).toEqual(
      decode("221133", "132323"),
    );
  });

  it("matches upstream '1133'/'1212' for a shifted hex4 column", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Hex4, 1, HEX))).toEqual(
      decode("1133", "1212"),
    );
  });

  it("matches upstream '1133'/'2323' for an unshifted hex4 column", () => {
    expect(asPairs(neighbourOffsets(NeighbourMode.Hex4, 0, HEX))).toEqual(
      decode("1133", "2323"),
    );
  });

  it("gives a shifted and an unshifted hex6 column six offsets each", () => {
    expect(neighbourOffsets(NeighbourMode.Hex6, 0, HEX)).toHaveLength(6);
    expect(neighbourOffsets(NeighbourMode.Hex6, 1, HEX)).toHaveLength(6);
  });

  it("keeps every hex6 offset inside one column of the origin", () => {
    for (const x of [0, 1]) {
      for (const o of neighbourOffsets(NeighbourMode.Hex6, x)) {
        expect(Math.abs(o.dx)).toBeLessThanOrEqual(1);
        expect(Math.abs(o.dy)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses opposite vertical diagonals for the two hex column parities", () => {
    // The distinction that makes hex6 work: a shifted column reaches across and
    // up, an unshifted column reaches across and down. Both still connect
    // straight up and down.
    const shifted = neighbourOffsets(NeighbourMode.Hex6, 1, HEX);
    const unshifted = neighbourOffsets(NeighbourMode.Hex6, 0, HEX);
    for (const offsets of [shifted, unshifted]) {
      expect(offsets.some((o) => o.dx === 0 && o.dy === -1)).toBe(true);
      expect(offsets.some((o) => o.dx === 0 && o.dy === 1)).toBe(true);
      expect(offsets.some((o) => o.dx === 1 && o.dy === 0)).toBe(true);
      expect(offsets.some((o) => o.dx === -1 && o.dy === 0)).toBe(true);
    }
    expect(shifted.some((o) => o.dx === 1 && o.dy === 1)).toBe(false);
    expect(unshifted.some((o) => o.dx === 1 && o.dy === -1)).toBe(false);
  });
});

describe("neighbour mode enum matches upstream ordering", () => {
  it("lines up with the nachbarschaft_* constants", () => {
    // src/sorte.h
    expect(NeighbourMode.Rect).toBe(0);
    expect(NeighbourMode.Diagonal).toBe(1);
    expect(NeighbourMode.Hex6).toBe(2);
    expect(NeighbourMode.Hex4).toBe(3);
    expect(NeighbourMode.Knight).toBe(4);
    expect(NeighbourMode.Eight).toBe(5);
    expect(NeighbourMode.ThreeD).toBe(6);
    expect(NeighbourMode.None).toBe(7);
    expect(NeighbourMode.Horizontal).toBe(8);
    expect(NeighbourMode.Vertical).toBe(9);
  });
});

describe("grid geometry", () => {
  it("uses upstream's board dimensions", () => {
    expect(GRX).toBe(10);
  });
});
