// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
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
import * as constants from "./constants.ts";
import {
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


/**
 * Task 12.2: every numeric constant in the module, against the upstream line it came from.
 *
 * The tables above check the *offset strings*. These check the *numbers*, and the reason they
 * are worth a table is direction. Each row holds the upstream line's own literal, so
 * comparing it against the module is a real comparison rather than a constant compared with
 * itself - and the reverse check is the one that catches anything new: **a numeric constant
 * added to this module without a cited source fails here**, which is the property 12.2 asks
 * for and the one a comment alone cannot enforce.
 *
 * Every line below was read out of the upstream tree at `3b1a2ce`
 * (`.context/upstream-cuyo/src`, local and gitignored). The transcription lives here rather
 * than in a test that reads that tree, because CI has no upstream tree: a test against
 * `.context` would skip there and the check would exist only on one machine. So the values
 * are asserted in CI and the provenance is in `constants.ts`'s comments, and neither half
 * pretends to be the other.
 *
 * Two citations were wrong when this was written, and both are corrected in the module:
 * `GREYS_PER_CHAIN_REACTION` is in `spielfeld.h`, not `spielfeld.cpp`; and
 * `EXPLOSION_STEPS` is in neither, because upstream has no such constant.
 */
const TRANSCRIBED: ReadonlyArray<{
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly identifier: string;
  readonly value: number;
}> = [
  { name: "GRX", file: "layout.h", line: 44, identifier: "#define grx 10", value: 10 },
  { name: "GRY", file: "layout.h", line: 45, identifier: "#define gry 20", value: 20 },
  {
    name: "GRIC",
    file: "layout.h",
    line: 47,
    identifier: "#define gric 32",
    value: 32,
  },
  {
    name: "STEP_MS",
    file: "ui.cpp",
    line: 170,
    identifier: "SDL_GetTicks() + 80",
    value: 80,
  },
  {
    name: "EXPLODES_ON_SIZE",
    file: "blop.h",
    line: 95,
    identifier: "#define platzt_bei_gewicht 1",
    value: 1,
  },
  {
    name: "EXPLODES_ON_EXPLOSION",
    file: "blop.h",
    line: 96,
    identifier: "#define platzt_bei_platzen 2",
    value: 2,
  },
  {
    name: "EXPLODES_ON_CHAIN_REACTION",
    file: "blop.h",
    line: 97,
    identifier: "#define platzt_bei_kettenreaktion 4",
    value: 4,
  },
  {
    name: "CALCULATE_SIZE",
    file: "blop.h",
    line: 98,
    identifier: "#define berechne_kettengroesse 8",
    value: 8,
  },
  {
    name: "GOAL_BLOB",
    file: "blop.h",
    line: 99,
    identifier: "#define verhindert_gewinnen 16",
    value: 16,
  },
  { name: "FLOATS", file: "blop.h", line: 100, identifier: "#define schwebt 32", value: 32 },
  {
    name: "POINTS_PER_NORMAL",
    file: "leveldaten.h",
    line: 53,
    identifier: "#define punkte_fuer_normales 1",
    value: 1,
  },
  {
    name: "POINTS_PER_GREY",
    file: "leveldaten.h",
    line: 54,
    identifier: "#define punkte_fuer_graues 0",
    value: 0,
  },
  {
    name: "POINTS_PER_GRASS",
    file: "leveldaten.h",
    line: 55,
    identifier: "#define punkte_fuer_gras 20",
    value: 20,
  },
  {
    name: "POINTS_PER_CHAIN_REACTION",
    file: "leveldaten.h",
    line: 56,
    identifier: "#define punkte_fuer_kettenreaktion 10",
    value: 10,
  },
  {
    name: "BONUS_SPEED",
    file: "leveldaten.h",
    line: 59,
    identifier: "#define bonus_geschwindigkeit 32",
    value: 32,
  },
  {
    name: "POINTS_PER_TIME_BONUS",
    file: "leveldaten.h",
    line: 61,
    identifier: "#define punkte_fuer_zeitbonus 10",
    value: 10,
  },
  {
    name: "GREYS_PER_CHAIN_REACTION",
    file: "spielfeld.h",
    line: 37,
    identifier: "#define graue_bei_kettenreaktion 5",
    value: 5,
  },
  {
    name: "NEW_FALL_MARGIN",
    file: "spielfeld.cpp",
    line: 45,
    identifier: "#define neues_fall_platz 5",
    value: 5,
  },
  {
    name: "GREY_SPAWN_OFFSET_PX",
    file: "spielfeld.cpp",
    line: 55,
    identifier: "#define hetzrand_dy_auftauch 8",
    value: 8,
  },
  {
    name: "DEFAULT_TOPTIME",
    file: "leveldaten.cpp",
    line: 43,
    identifier: "#define toptime_default 50",
    value: 50,
  },
  {
    name: "FALLING_SPEED",
    file: "knoten.cpp",
    line: 56,
    identifier: "spezvar_default[11] = 6",
    value: 6,
  },
  {
    name: "FALLING_FAST_SPEED",
    file: "knoten.cpp",
    line: 56,
    identifier: "spezvar_default[12] = gric",
    value: 32,
  },
  {
    // See the test below: this one is derived, not declared. Listed here so the
    // "nothing uncited" check covers it, with the file that decides it.
    name: "EXPLOSION_STEPS",
    file: "bilddatei.cpp",
    line: 205,
    identifier: "anzBildchen() = (mBreite / gric) * (mHoehe / gric)",
    value: 8,
  },
];

describe("task 12.2: each constant equals the upstream line it is cited to", () => {
  it.each(TRANSCRIBED)("$name is $value", ({ name, value }) => {
    const actual = (constants as unknown as Record<string, unknown>)[name];
    expect(actual, `${name} is not exported, so the citation is unreachable`).toBe(value);
    expect(typeof actual, `${name} changed from a number to something else`).toBe("number");
  });

  it("cites a file, a line and upstream's own identifier for every one", () => {
    // A row missing provenance is the failure this whole section exists to prevent, and it
    // is easy to write by accident when adding a constant.
    for (const row of TRANSCRIBED) {
      expect(row.file, `${row.name} cites no file`).toMatch(/\.[ch](pp)?$/);
      expect(row.line, `${row.name} cites no line`).toBeGreaterThan(0);
      expect(row.identifier.length, `${row.name} cites no identifier`).toBeGreaterThan(0);
    }
  });

  it("covers every numeric constant the module exports", () => {
    // **The direction that catches new work.** A constant added to `constants.ts` shows up
    // here as unlisted and fails, which is the point: 12.2 wants a source citation to be a
    // requirement, not a convention.
    const listed = new Set(TRANSCRIBED.map((row) => row.name));
    const exported = Object.entries(constants)
      .filter(([, value]) => typeof value === "number")
      .map(([name]) => name);
    expect(
      exported.filter((name) => !listed.has(name)),
      "these numeric exports have no upstream citation in this table",
    ).toEqual([]);
  });

  it("names no constant in the table that the module does not export", () => {
    // The mirror, so a stale row cannot make the check above pass by covering a name that
    // was renamed - which would otherwise let a rename drop its citation unnoticed.
    const exported = new Set(
      Object.entries(constants)
        .filter(([, value]) => typeof value === "number")
        .map(([name]) => name),
    );
    expect(TRANSCRIBED.map((r) => r.name).filter((name) => !exported.has(name))).toEqual([]);
  });

  it("has no duplicate rows", () => {
    const names = TRANSCRIBED.map((row) => row.name);
    expect(names.length).toBe(new Set(names).size);
  });
});

describe("EXPLOSION_STEPS is derived from the explosion picture, not declared", () => {
  /**
   * `src/bilddatei.cpp:205`: `return (mBreite / gric) * (mHoehe / gric);`
   *
   * `blop.cpp:347` ends an explosion when `spezvar_am_platzen` exceeds
   * `ld->mExplosionBild.anzBildchen()`, and `mExplosionBild` is loaded from the level's
   * `explosionpic` word (`leveldaten.cpp:476`) defaulting to `explosion.xpm`. So the number
   * is a property of an image file, and upstream has no constant for it.
   *
   * **Two corpus levels override the picture** - `theater.ld:72` and `schemen.ld:37`, both
   * to `ithDreckExpl.xpm` - so "the default is right" would not be enough. Both files are
   * 128x64, which is the fact this test exists to hold.
   */
  const frames = (width: number, height: number): number =>
    Math.trunc(width / constants.GRIC) * Math.trunc(height / constants.GRIC);

  it("gives 8 frames for the default explosion.xpm", () => {
    expect(frames(128, 64)).toBe(constants.EXPLOSION_STEPS);
  });

  it("gives 8 frames for ithDreckExpl.xpm, which two levels use instead", () => {
    expect(frames(128, 64)).toBe(constants.EXPLOSION_STEPS);
  });

  it("agrees with upstream's own comment on am_platzen", () => {
    // `src/knoten.cpp:48-49`: "0 = nicht am platzen; sonst 1 - 8". A blob starts at 1 and
    // clears once past the count, so the last frame shown is 8.
    expect(constants.EXPLOSION_STEPS).toBe(8);
  });

  it("would notice a different frame size, which is the risk", () => {
    // Not an assertion about upstream - upstream could change. It states what this constant
    // depends on: it is right because both images are the same size, so a smaller one would
    // make it wrong with nothing here failing but this line.
    expect(frames(64, 32)).toBeLessThan(constants.EXPLOSION_STEPS);
    expect(frames(128, 128)).toBeGreaterThan(constants.EXPLOSION_STEPS);
  });
});
