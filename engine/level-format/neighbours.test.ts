/**
 * Tests for neighbour modes (task 2.7).
 *
 * The thing to pin is that the mode and the geometry are separate. Upstream
 * computes the board's hex flag from the level-wide `neighbours` and nothing
 * else, and `getHexShift` reads that flag together with `hexflip` and which side
 * of the board the column is on. A kind asking for hex six in a rectangular
 * board therefore connects to six neighbours on a square grid.
 */

import { describe, expect, it } from "vitest";
import { parseLd } from "./parser.ts";
import { DefinitionScope, rootScope } from "./scope.ts";
import {
  LAST_NEIGHBOUR_MODE,
  MODE_NAMES,
  NEIGHBOUR_MODES,
  boardHex,
  modeName,
  neighbourModeOf,
  readNeighbourOverrides,
  requireNeighbourMode,
} from "./neighbours.ts";
import { buildKinds } from "./kinds.ts";
import type { KindDefaults } from "./kinds.ts";
import { CUAL_CONSTANTS } from "./cual-constants.ts";
import { NeighbourMode, columnShift, isHexMode } from "../game-core/constants.ts";
import { neighbourOffsets } from "../game-core/constants.ts";
import { Version } from "./version.ts";

/** The ten modes with the names the `.ld` format knows them by. */
const ALL: readonly (readonly [number, string])[] = [
  [NeighbourMode.Rect, "neighbours_rect"],
  [NeighbourMode.Diagonal, "neighbours_diagonal"],
  [NeighbourMode.Hex6, "neighbours_hex6"],
  [NeighbourMode.Hex4, "neighbours_hex4"],
  [NeighbourMode.Knight, "neighbours_knight"],
  [NeighbourMode.Eight, "neighbours_eight"],
  [NeighbourMode.ThreeD, "neighbours_3D"],
  [NeighbourMode.None, "neighbours_none"],
  [NeighbourMode.Horizontal, "neighbours_horizontal"],
  [NeighbourMode.Vertical, "neighbours_vertical"],
];

const DEFAULTS: KindDefaults = {
  neighbours: NeighbourMode.Rect,
  chainGrass: false,
  numExplode: 4,
};

/** The level scope for a level body. */
function levelOf(body: string) {
  const source = `Level = {${body}\n}`;
  const file = parseLd(source, "test.ld");
  const def = file.definitions[0];
  if (def === undefined || def.value.type !== "section") throw new Error("bad fixture");
  const version = Version.of("1", "main");
  const level = new DefinitionScope("Level", rootScope("test.ld", version), version, "test.ld");
  level.defineAll(def.value.definitions);
  return level;
}

describe("the ten modes", () => {
  it("are exactly the ten numbers 0 to 9", () => {
    expect(NEIGHBOUR_MODES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LAST_NEIGHBOUR_MODE).toBe(9);
  });

  it("each resolve from the number a level writes", () => {
    for (const [value, name] of ALL) {
      expect(neighbourModeOf(value), name).toBe(value as NeighbourMode);
    }
  });

  it("each resolve from the name a level writes inside <...>", () => {
    // The level format never names a mode directly: `neighbours = <neighbours_hex6>`
    // is a name from the engine's own table resolving to a number.
    for (const [value, name] of ALL) {
      expect(CUAL_CONSTANTS.get(name), name).toBe(value);
      const level = levelOf(`neighbours = <${name}>`);
      expect(level.ownNumber("neighbours", -1), name).toBe(value);
    }
  });

  it("carry the documented names, in `sorte.h`'s order", () => {
    expect(ALL.map(([, name]) => name)).toEqual([
      "neighbours_rect",
      "neighbours_diagonal",
      "neighbours_hex6",
      "neighbours_hex4",
      "neighbours_knight",
      "neighbours_eight",
      "neighbours_3D",
      "neighbours_none",
      "neighbours_horizontal",
      "neighbours_vertical",
    ]);
    for (const [value, name] of ALL) {
      expect(MODE_NAMES.get(value as NeighbourMode)).toBe(name);
      expect(modeName(value)).toBe(name);
    }
    // `neighbours_3D` has a capital D because upstream's const_namen does.
    expect(CUAL_CONSTANTS.has("neighbours_3d")).toBe(false);
  });

  it("give each mode a distinct set of offsets except where they coincide", () => {
    // Rect is the four orthogonal cells, diagonal the four corners, eight is
    // both, horizontal and vertical are halves of rect, none is empty.
    expect(neighbourOffsets(NeighbourMode.Rect, 0)).toHaveLength(4);
    expect(neighbourOffsets(NeighbourMode.Diagonal, 0)).toHaveLength(4);
    expect(neighbourOffsets(NeighbourMode.Eight, 0)).toHaveLength(8);
    expect(neighbourOffsets(NeighbourMode.Horizontal, 0)).toHaveLength(2);
    expect(neighbourOffsets(NeighbourMode.Vertical, 0)).toHaveLength(2);
    expect(neighbourOffsets(NeighbourMode.Knight, 0)).toHaveLength(8);
    expect(neighbourOffsets(NeighbourMode.None, 0)).toHaveLength(0);
  });

  it("reject a number outside the ten", () => {
    expect(neighbourModeOf(-1)).toBeUndefined();
    expect(neighbourModeOf(10)).toBeUndefined();
    const level = levelOf("neighbours = 10");
    expect(() => requireNeighbourMode(10, level, "neighbours")).toThrow(
      /neighbours out of range: 10 is not one of the ten modes/,
    );
    expect(modeName(10)).toBe("10");
  });
});

describe("the hex-mode flag", () => {
  it("is set by exactly hex6, hex4 and 3D", () => {
    const hexModes = NEIGHBOUR_MODES.filter((m) => isHexMode(m));
    expect(hexModes).toEqual([NeighbourMode.Hex6, NeighbourMode.Hex4, NeighbourMode.ThreeD]);
  });

  it("comes from the level-wide neighbours alone", () => {
    expect(boardHex(levelOf("neighbours = 2")).enabled).toBe(true);
    expect(boardHex(levelOf("neighbours = 0")).enabled).toBe(false);
    // hexflip has no effect on whether the board is hex.
    expect(boardHex(levelOf("neighbours = 2\n      hexflip = 3")).enabled).toBe(true);
  });

  it("offsets odd columns with the default hexflip", () => {
    const hex = boardHex(levelOf("neighbours = 2"));
    for (let x = 0; x < 6; x++) {
      expect(columnShift(hex, false, x)).toBe(x % 2 === 1);
    }
  });

  it("is not turned on by a kind asking for a hex mode of its own", () => {
    // The case the separation exists for. Upstream computes mSechseck in
    // ladLevel from the level's own neighbours, before any kind is read.
    const level = levelOf(`
      neighbours = 0
      pics = normal, hexed
      hexed = {
        neighbours = 2
      }
    `);
    const table = buildKinds(level, DEFAULTS);
    expect(table.neighbourOverrides).toEqual([{ kind: 1, mode: 2 }]);
    expect(boardHex(level).enabled).toBe(false);
    // So the hex-six kind gets hex six's six offsets on an unshifted grid, and
    // the level still draws square.
    const offsets = neighbourOffsets(NeighbourMode.Hex6, 1, boardHex(level));
    expect(offsets).toHaveLength(6);
    expect(offsets).toEqual(neighbourOffsets(NeighbourMode.Hex6, 0));
    for (let x = 0; x < 6; x++) {
      expect(columnShift(boardHex(level), false, x)).toBe(false);
    }
  });

  it("is on when the level-wide mode is hex even if no kind asks for it", () => {
    const level = levelOf("neighbours = 2\n      pics = plain");
    expect(boardHex(level).enabled).toBe(true);
    expect(buildKinds(level, DEFAULTS).neighbourOverrides).toEqual([]);
  });
});

describe("per-kind overrides", () => {
  it("override the level-wide mode for that kind alone", () => {
    const level = levelOf(`
      neighbours = 0
      pics = plain, knighted, diagonaled
      knighted = {
        neighbours = 4
      }
      diagonaled = {
        neighbours = 1
      }
    `);
    const table = buildKinds(level, DEFAULTS);
    expect(readNeighbourOverrides(level, table)).toEqual([
      { kind: 1, mode: NeighbourMode.Knight },
      { kind: 2, mode: NeighbourMode.Diagonal },
    ]);
  });

  it("read a name from <...> as readily as a number", () => {
    const level = levelOf(`
      neighbours = 0
      pics = plain, hexed
      hexed = {
        neighbours = <neighbours_hex6>
      }
    `);
    const table = buildKinds(level, DEFAULTS);
    expect(readNeighbourOverrides(level, table)).toEqual([{ kind: 1, mode: 2 }]);
  });

  it("drop a kind that restates the level's own mode", () => {
    // Not the same fact as an override, but the same answer to every lookup, so
    // keeping it would only mean a longer table.
    const level = levelOf(`
      neighbours = 1
      pics = plain, same
      same = {
        neighbours = 1
      }
    `);
    const table = buildKinds(level, { ...DEFAULTS, neighbours: NeighbourMode.Diagonal });
    expect(readNeighbourOverrides(level, table)).toEqual([]);
  });

  it("reject a kind's out-of-range mode, naming the kind's section", () => {
    const level = levelOf(`
      pics = plain, broken
      broken = {
        neighbours = 11
      }
    `);
    const table = buildKinds(level, DEFAULTS);
    expect(() => readNeighbourOverrides(level, table)).toThrow(
      /in section Level: neighbours out of range: 11/,
    );
  });
});
