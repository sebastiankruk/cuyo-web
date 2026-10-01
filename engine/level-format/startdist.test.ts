/**
 * Tests for `startdist` decoding (task 2.8).
 *
 * The man page's version-offset example is the thing worth testing carefully:
 * `cual.6` gives five characters and their exact kind/version, and getting the
 * base-62 predecessor search wrong turns them into something plausible rather
 * than something obviously broken. So the numbers below are the documented ones,
 * not values this implementation chose.
 *
 *   Suppose kind apple has distkey = "A", kind orange has distkey = "O" and no
 *   further distkeys exist. Then the character "C" denotes an apple with
 *   version=2, "N" an apple with version=13, "O" an orange with version=0,
 *   "S" an orange with version=4, "a" an orange with version=12, and "8" does
 *   not denote anything (and hence is illegal).
 */

import { describe, expect, it } from "vitest";
import { INFO_COUNT,
  decodeStartDist,
  distKeyLen,
  placeRows,
  readStartDist,
} from "./startdist.ts";
import type { CellChoice, StartDistOrigin } from "./startdist.ts";
import { buildKinds } from "./kinds.ts";
import type { KindDefaults } from "./kinds.ts";
import {
  DIST_KEY_CHAINREACTION,
  DIST_KEY_FARBE,
  DIST_KEY_GRAU,
  DIST_KEY_GRAS,
  DIST_KEY_LEER,
  DIST_KEY_NEIGHBOURS,
  decodeDistKey,
} from "./kinds.ts";
import { parseLd } from "./parser.ts";
import { DefinitionScope, rootScope } from "./scope.ts";
import { NeighbourMode } from "../game-core/constants.ts";
import { Version } from "./version.ts";

const ORIGIN: StartDistOrigin = {
  line: 1,
  col: 1,
  filename: "test.ld",
  where: "in section Test",
};

const DEFAULTS: KindDefaults = {
  neighbours: NeighbourMode.Rect,
  chainGrass: false,
  numExplode: 4,
};

/** A level scope for a body, with `globals.ld`'s names in scope. */
function levelOf(body: string) {
  const file = parseLd(`Test = {${body}\n}`, "test.ld");
  const def = file.definitions[0];
  if (def === undefined || def.value.type !== "section") throw new Error("bad fixture");
  const version = Version.of("1", "main");
  const level = new DefinitionScope("Test", rootScope("test.ld", version), version, "test.ld");
  level.defineAll(def.value.definitions);
  return level;
}

function decode(rows: string[], table: { kinds: readonly { id: number; distKey: string | null }[] }, twoPlayer = false) {
  return decodeStartDist(rows, table as never, twoPlayer, ORIGIN);
}

describe("the distkey sentinels", () => {
  it("reads the six single characters as themselves", () => {
    // `liesDistKey`'s switch on the first character.
    expect(decodeDistKey(".")).toBe(DIST_KEY_LEER);
    expect(decodeDistKey("-")).toBe(DIST_KEY_GRAU);
    expect(decodeDistKey("+")).toBe(DIST_KEY_FARBE);
    expect(decodeDistKey("*")).toBe(DIST_KEY_GRAS);
    expect(decodeDistKey("%")).toBe(DIST_KEY_NEIGHBOURS);
    expect(decodeDistKey("&")).toBe(DIST_KEY_CHAINREACTION);
  });

  it("reads other keys as base 62, ordered 9 before A before Z before a", () => {
    // The ordering is what makes the predecessor search work, so it is pinned
    // directly rather than only through its consequences.
    expect(decodeDistKey("9")).toBe(9);
    expect(decodeDistKey("A")).toBe(10);
    expect(decodeDistKey("Z")).toBe(35);
    expect(decodeDistKey("a")).toBe(36);
    expect(decodeDistKey("z")).toBe(61);
    expect(decodeDistKey("10")).toBe(62);
    expect(decodeDistKey("A0")).toBe(620);
  });

  it("refuses an empty key and an all-space one", () => {
    expect(decodeDistKey("")).toBeUndefined();
    expect(decodeDistKey(" ")).toBeUndefined();
    expect(decodeDistKey("  ")).toBeUndefined();
    // A leading space is padding, and only one is allowed before a digit.
    expect(decodeDistKey(" 5")).toBe(5);
    expect(decodeDistKey("A 5")).toBeUndefined();
  });

  it("refuses a character outside the alphabet", () => {
    expect(decodeDistKey("A/B")).toBeUndefined();
    expect(decodeDistKey("!!")).toBeUndefined();
  });
});

describe("the man page's version-offset example", () => {
  // apple has distkey "A" (10), orange "O" (24), and no further distkeys exist.
  const table = {
    kinds: [
      { id: 0, distKey: "A" },
      { id: 1, distKey: "O" },
    ],
  };
  const one = (row: string): CellChoice =>
    decode([row, ".........."], table).rows[0]?.cells[0] as CellChoice;

  it('reads "C" as an apple with version 2', () => {
    expect(one("C.........")).toEqual({ kind: "named", kindId: 0, version: 2 });
  });

  it('reads "N" as an apple with version 13', () => {
    expect(one("N.........")).toEqual({ kind: "named", kindId: 0, version: 13 });
  });

  it('reads "O" as an orange with version 0', () => {
    // The exact match: the difference is zero.
    expect(one("O.........")).toEqual({ kind: "named", kindId: 1, version: 0 });
  });

  it('reads "S" as an orange with version 4', () => {
    expect(one("S.........")).toEqual({ kind: "named", kindId: 1, version: 4 });
  });

  it('reads "a" as an orange with version 12', () => {
    // 36 - 24 = 12.
    expect(one("a.........")).toEqual({ kind: "named", kindId: 1, version: 12 });
  });

  it('rejects "8", which precedes every distkey', () => {
    // "8" does not denote anything (and hence is illegal): no kind has a distkey
    // of 8 or less, so the search finds nothing.
    expect(() => one("8.........")).toThrow(
      /"8" used as a distkey but no such distkey specified/,
    );
  });

  it("picks the largest distkey not exceeding the key, not the first", () => {
    // With distkeys A=10 and O=24, "N" is 23: above A, below O, so apple. A search
    // that took the first match rather than the largest would also say apple, but
    // a search that took the *nearest* would say orange - and that is the bug.
    // 11 is one past A and 25 is one past O.
    expect(one("B.........")).toEqual({ kind: "named", kindId: 0, version: 1 });
    expect(one("P.........")).toEqual({ kind: "named", kindId: 1, version: 1 });
    // Y is 34, above orange's 24, so a search that took the first matching distkey
    // rather than the largest would answer apple here.
    expect(one("Y.........")).toEqual({ kind: "named", kindId: 1, version: 10 });
  });

  it("skips kinds with no distkey rather than letting them win", () => {
    // `distkey_undef` is -7, which would beat every real distkey if it were
    // compared rather than excluded. Upstream excludes it explicitly.
    const withUndefined = {
      kinds: [
        { id: 0, distKey: null },
        { id: 1, distKey: "A" },
      ],
    };
    expect(
      (decode(["C.........", ".........."], withUndefined).rows[0]?.cells[0] as CellChoice),
    ).toEqual({ kind: "named", kindId: 1, version: 2 });
  });
});

describe("the single characters", () => {
  const table = { kinds: [{ id: 0, distKey: "A" }] };
  const row = (s: string): CellChoice =>
    decode([s, ".........."], table).rows[0]?.cells[0] as CellChoice;

  it("reads . as an empty cell", () => {
    expect(row("..........")).toEqual({ kind: "empty" });
  });

  it("reads + - and * as a random kind from each pool", () => {
    // "A blop chosen at random according to colourprob, respectively greyprob,
    //  respectively goalprob."
    expect(row("+.........")).toEqual({ kind: "random", pool: "colour" });
    expect(row("-.........")).toEqual({ kind: "random", pool: "grey" });
    expect(row("*.........")).toEqual({ kind: "random", pool: "goal" });
  });

  it("reads % and & as informational blobs", () => {
    // "%: An info blop with the version set according to the level-wide
    //  neighbours." The version is 4 + neighbours, which is task 2.6's output;
    //  here it is only the choice that is decoded.
    expect(row("%.........")).toEqual({ kind: "info", what: "neighbours" });
    expect(row("&.........")).toEqual({ kind: "info", what: "chainreaction" });
  });
});

describe("row widths and alignment", () => {
  const table = { kinds: [{ id: 0, distKey: "A" }] };

  it("accepts 10 and 20 character rows", () => {
    expect(() => decode(["..........", ".........."], table)).not.toThrow();
    expect(() =>
      decode(["....................", "...................."], table),
    ).not.toThrow();
  });

  it("rejects any other row length", () => {
    // "Each line must contain exactly 10 or exactly 20 characters, except the
    //  last which is special."
    expect(() => decode([".........", ".........."], table)).toThrow(
      /Wrong length for startdist line: 9 characters, but 10 or 20 expected/,
    );
    expect(() => decode(["...........", ".........."], table)).toThrow(
      /11 characters/,
    );
  });

  it("rejects a last row that is neither 10, 20, 4 nor 8", () => {
    expect(() => decode(["..........", "......"], table)).toThrow(
      /Wrong length for last startdist line: 6 characters, but 10, 20, 4 or 8 expected/,
    );
  });

  it("places the rows at the bottom, top row first", () => {
    // Two rows land on rows 18 and 19, and the first written is the higher one.
    const dist = decode(["AAAAAAAAAA", "A........."], table);
    const board = placeRows(dist);
    expect(board).toHaveLength(20);
    expect(board[17]?.every((c) => c.kind === "empty")).toBe(true);
    expect(board[18]?.[0]).toEqual({ kind: "named", kindId: 0, version: 0 });
    expect(board[19]?.[0]).toEqual({ kind: "named", kindId: 0, version: 0 });
    expect(board[19]?.[1]).toEqual({ kind: "empty" });
  });

  it("leaves the whole board empty when no rows are written", () => {
    const dist = decode(["...."], table); // informational only
    const board = placeRows(dist);
    expect(board.every((r) => r.every((c) => c.kind === "empty"))).toBe(true);
  });
});

describe("two-player rows", () => {
  // Ten 'A's, then ten 'C's: the right player's half is apple version 2.
  const both = "AAAAAAAAAACCCCCCCCCC";
  const table = { kinds: [{ id: 0, distKey: "A" }] };

  it("reads the left half in one-player mode", () => {
    const dist = decode([both, ".........."], table, false);
    expect(dist.twoPlayers).toBe(true);
    expect(dist.rows[0]?.cells[0]).toEqual({ kind: "named", kindId: 0, version: 0 });
  });

  it("reads the right half in two-player mode", () => {
    // "In a line of length 20 the first 10 characters describe the left player,
    //  the second 10 characters describe the right player."
    const dist = decode([both, ".........."], table, true);
    expect(dist.rows[0]?.cells[0]).toEqual({ kind: "named", kindId: 0, version: 2 });
  });

  it("reads a ten-wide row the same in both modes", () => {
    // A row of ten describes both players, so there is no second half to shift to
    // and the two-player mode changes nothing.
    for (const twoPlayer of [false, true]) {
      const dist = decode(["AAAAAAAAAA", ".........."], table, twoPlayer);
      expect(dist.rows[0]?.cells[0]).toEqual({ kind: "named", kindId: 0, version: 0 });
    }
  });
});

describe("the informational last row", () => {
  const table = { kinds: [{ id: 0, distKey: "A" }] };

  it("reads four entries in order: greys, grass, connections, chain reaction", () => {
    // "In case of length 4, the first entry describes the blop which depicts the
    //  number of greys. The second ... grass ... third ... connection ...
    //  fourth ... chaingrass."
    const dist = decode(["..........", "-*%&"], table);
    expect(dist.rows).toHaveLength(1);
    expect(dist.info).toEqual({
      grey: { kind: "random", pool: "grey" },
      grass: { kind: "random", pool: "goal" },
      neighbours: { kind: "info", what: "neighbours" },
      chainReaction: { kind: "info", what: "chainreaction" },
    });
  });

  it("reads the right player's four in reversed order", () => {
    // "In case of length 8, the above holds for the left player. The remaining 4
    //  entries then describe the same for the right player, but in reversed
    // order." - `mid(len*(2*infoblop_anz-1-i), len)`, i.e. index 7-i.
    //
    // The right half is ABCD, all apple versions 0..3. Read forwards it would give
    // grey=0, grass=1, neighbours=2, chain=3; read backwards it gives 3, 2, 1, 0.
    // Anything that pins this has to distinguish the two, so the versions are used
    // rather than four identical characters.
    const dist = decode(["..........", "-*%&ABCD"], table, true);
    expect(dist.info).toEqual({
      grey: { kind: "named", kindId: 0, version: 3 },
      grass: { kind: "named", kindId: 0, version: 2 },
      neighbours: { kind: "named", kindId: 0, version: 1 },
      chainReaction: { kind: "named", kindId: 0, version: 0 },
    });
  });

  it("does not reverse for a single player, even on an eight-entry row", () => {
    const dist = decode(["..........", "-*%&ABCD"], table, false);
    expect(dist.info).toEqual({
      grey: { kind: "random", pool: "grey" },
      grass: { kind: "random", pool: "goal" },
      neighbours: { kind: "info", what: "neighbours" },
      chainReaction: { kind: "info", what: "chainreaction" },
    });
  });

  it("treats a ten or twenty character last row as an ordinary board row", () => {
    const dist = decode(["..........", "AAAAAAAAAA"], table);
    expect(dist.rows).toHaveLength(2);
    expect(dist.info).toBeNull();
  });

  it("defaults to -*%& when the last row is an ordinary one", () => {
    // "The default is \"-*%&&%*-\" (or equivalently \"-*%&\")." A level that does
    //  not say gets these, and 2.6/2.7 supply the versions.
    expect(decode(["..........", "AAAAAAAAAA"], table).info).toBeNull();
    expect(INFO_COUNT).toBe(4);
  });
});

describe("keys longer than one character", () => {
  // A kind whose distkey is two characters wide, so every cell is two characters.
  const wide = { kinds: [{ id: 0, distKey: "AB" }] };

  it("multiplies the row width by the key length", () => {
    expect(distKeyLen(wide as never)).toBe(2);
    // 10 cells of 2 characters, so 20 per row and 40 for two players.
    expect(() =>
      decode(["--------------------", "--------------------"], wide),
    ).not.toThrow();
    // A row that is neither: 18 characters, and it is not the last row either.
    expect(() =>
      decode(["------------------", "--------------------"], wide),
    ).toThrow(/Wrong length for startdist line: 18 characters, but 20 or 40/);
  });

  it("defaults to a key length of one when no kind declares one", () => {
    expect(distKeyLen({ kinds: [{ id: 0, distKey: null }] } as never)).toBe(1);
  });

  it("treats a multicharacter key starting with a single-character key as that key", () => {
    // "Every multicharacter combination starting with '.', '+', '-', or '*' is
    //  treated as the corresponding character in single-character format."
    // Split in twos: "-+", "%&", then padding.
    const dist = decode(["-+%&----------------", "--------------------"], wide);
    const cells = dist.rows[0]?.cells as readonly CellChoice[];
    expect(cells[0]).toEqual({ kind: "random", pool: "grey" });
    expect(cells[1]).toEqual({ kind: "info", what: "neighbours" });
  });

  it("reads other multicharacter keys as base-62 numbers", () => {
    // "AB" is 10*62 + 11 = 631, and 631 - 631 = 0 for the kind's own distkey.
    const dist = decode(["AB------------------", "--------------------"], wide);
    expect(dist.rows[0]?.cells[0]).toEqual({
      kind: "named",
      kindId: 0,
      version: 0,
    });
  });
});

describe("readStartDist", () => {
  it("reads a level's own startdist", () => {
    const level = levelOf(`
      startpic = grass
      pics = colour
      startdist = "**.*.*.*.*", "AA.AA.AA.A"
    `);
    const table = buildKinds(level, DEFAULTS);
    const dist = readStartDist(level, table);
    expect(dist.rows).toHaveLength(2);
    expect(dist.rows[0]?.cells[0]).toEqual({ kind: "random", pool: "goal" });
    // "A" is the grass kind's default distkey. The colour kind declares none, so
    // it is unnameable from startdist - a kind with no distkey is skipped by the
    // search rather than matched.
    expect(dist.rows[1]?.cells[0]).toEqual({ kind: "named", kindId: 0, version: 0 });
    expect(table.kinds[1]?.distKey).toBeNull();
  });

  it("says so when a level has no startdist", () => {
    const level = levelOf("pics = colour");
    const table = buildKinds(level, DEFAULTS);
    expect(() => readStartDist(level, table)).toThrow(
      /startdist required but not defined/,
    );
  });

  it("names the file and section in the error", () => {
    const level = levelOf('startdist = "..........", "bad"');
    const table = buildKinds(level, DEFAULTS);
    let caught: unknown;
    try {
      readStartDist(level, table);
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toMatch(/test\.ld:\d+:\d+: in section Test/);
    expect((caught as Error).message).toMatch(/Wrong length/);
  });
});