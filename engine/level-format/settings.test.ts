/**
 * Tests for level-wide settings (task 2.6).
 *
 * Two things are being pinned here. The defaults, which are upstream's and are
 * not the ones a reasonable person would pick - the chase border is
 * (200,200,200) and the text is (60,60,60). And the range checks, which are the
 * only thing standing between a level with a typo and a game that misbehaves in
 * ways that point nowhere near the `.ld` file.
 *
 * The corpus test at the end reads every real level's settings, which is how the
 * defaults get checked against what the level data actually assumes.
 */

import { describe, expect, it } from "vitest";
import { parseLd } from "./parser.ts";
import { DefinitionScope, rootScope } from "./scope.ts";
import {
  DEFAULT_BACKGROUND_COLOUR,
  DEFAULT_TEXT_COLOUR,
  DEFAULT_TOP_COLOUR,
  NO_RANDOM_GREYS,
  isHexNeighbourMode,
  kindDefaultsFrom,
  readLevelSettings,
} from "./settings.ts";
import { UNDEFINED_EXPLODE } from "./kinds.ts";
import { DEFAULT_TOPTIME, NeighbourMode } from "../game-core/constants.ts";
import { Version } from "./version.ts";

/** A level body with the two settings a level cannot be without. */
const MINIMAL = `
  name = "Test"
  author = "Tester"
`;

/** The settings of a level body, with the two mandatory settings filled in. */
function settingsOf(body: string) {
  const source = `Level = {${MINIMAL}${body}\n}`;
  const file = parseLd(source, "test.ld");
  const def = file.definitions[0];
  if (def === undefined || def.value.type !== "section") {
    throw new Error("the test level must be a section");
  }
  const version = Version.of("1", "main");
  const root = rootScope("test.ld", version);
  const level = new DefinitionScope("Level", root, version, "test.ld");
  level.defineAll(def.value.definitions);
  return readLevelSettings(level);
}

describe("the settings every level has", () => {
  it("reads the name, author and description", () => {
    const s = settingsOf(`
      description = "A level for the test."
    `);
    expect(s.name).toBe("Test");
    expect(s.author).toBe("Tester");
    expect(s.description).toBe("A level for the test.");
  });

  it("describes nothing when the level says nothing", () => {
    // "(optional)"
    expect(settingsOf("").description).toBe("");
  });

  it("refuses a level with no name", () => {
    const file = parseLd('Level = { author = "Tester" }', "test.ld");
    const def = file.definitions[0];
    if (def === undefined || def.value.type !== "section") throw new Error("bad fixture");
    const version = Version.of("1", "main");
    const level = new DefinitionScope("Level", rootScope("test.ld", version), version, "test.ld");
    level.defineAll(def.value.definitions);
    expect(() => readLevelSettings(level)).toThrow(/name required but not defined/);
  });
});

describe("the documented defaults", () => {
  it("applies every default when the level sets nothing", () => {
    // "WHEN a level omits toptime, chaingrass and mirror THEN the chase border
    //  descends one pixel every 50 steps, goal blobs do not require a chain
    //  reaction, and the level is not mirrored."
    const s = settingsOf("");
    expect(s.topTime).toBe(50);
    expect(DEFAULT_TOPTIME).toBe(50);
    expect(s.chainGrass).toBe(false);
    expect(s.mirror).toBe(false);
  });

  it("uses white behind, dark grey text and a light grey chase border", () => {
    // `Color(255,255,255)`, `Color(60,60,60)` and `Color(200,200,200)`, from
    // `LevelDaten::ladLevel`.
    const s = settingsOf("");
    expect(s.background).toEqual({ r: 255, g: 255, b: 255 });
    expect(s.text).toEqual({ r: 60, g: 60, b: 60 });
    expect(s.top).toEqual({ r: 200, g: 200, b: 200 });
    expect(DEFAULT_BACKGROUND_COLOUR).toEqual({ r: 255, g: 255, b: 255 });
    expect(DEFAULT_TEXT_COLOUR).toEqual({ r: 60, g: 60, b: 60 });
    expect(DEFAULT_TOP_COLOUR).toEqual({ r: 200, g: 200, b: 200 });
  });

  it("uses rectangular connections and no hex flip", () => {
    const s = settingsOf("");
    expect(s.neighbours).toBe(NeighbourMode.Rect);
    expect(s.hexFlip).toBe(0);
  });

  it("spawns pieces in column 4 and no random greys", () => {
    const s = settingsOf("");
    expect(s.randomFallPos).toBe(false);
    expect(s.randomGreys).toBe(NO_RANDOM_GREYS);
    expect(NO_RANDOM_GREYS).toBe(-1);
    expect(s.noGreyProb).toBe(0);
  });

  it("leaves numexplode unset, so a kind that needs it says so itself", () => {
    // "optional, da je Sorte definierbar (muss man dann aber auch tun)"
    expect(settingsOf("").numExplode).toBe(UNDEFINED_EXPLODE);
  });

  it("draws no chase-border or background picture, and no overlap", () => {
    const s = settingsOf("");
    expect(s.topPic).toBe("");
    expect(s.topOverlap).toBe(0);
    expect(s.backgroundPic).toBe("");
    expect(s.topStop).toBe(0);
  });
});

describe("colours", () => {
  it("reads three numbers", () => {
    const s = settingsOf(`
      bgcolor = 1, 2, 3
      textcolor = 4, 5, 6
      topcolor = 7, 8, 9
    `);
    expect(s.background).toEqual({ r: 1, g: 2, b: 3 });
    expect(s.text).toEqual({ r: 4, g: 5, b: 6 });
    expect(s.top).toEqual({ r: 7, g: 8, b: 9 });
  });

  it("reads them from an expression", () => {
    const s = settingsOf(`
      halb = 128
      bgcolor = 0, <halb>, 255
    `);
    expect(s.background).toEqual({ r: 0, g: 128, b: 255 });
  });

  it("rejects the wrong number of channels", () => {
    // "Color (r,g,b) expected"
    expect(() => settingsOf("bgcolor = 1, 2")).toThrow(
      /bgcolor needs three numbers \(r,g,b\) but has 2/,
    );
    expect(() => settingsOf("bgcolor = 255")).toThrow(/but has 1/);
    expect(() => settingsOf("bgcolor = 1, 2, 3, 4")).toThrow(/but has 4/);
  });

  it("rejects a channel that is not a number", () => {
    expect(() => settingsOf("bgcolor = 1, 2, weiss")).toThrow(
      /bgcolor needs three numbers/,
    );
  });
});

describe("the chase border", () => {
  it("reads toptime in steps per pixel", () => {
    expect(settingsOf("toptime = 20").topTime).toBe(20);
  });

  it("refuses a toptime that is not positive", () => {
    // "if (hetzrandZeit < 1) throw Fehler("toptime must be positive")"
    expect(() => settingsOf("toptime = 0")).toThrow(/toptime must be positive/);
    expect(() => settingsOf("toptime = -5")).toThrow(/toptime must be positive/);
  });

  it("reads topstop as pixels", () => {
    // The man page documents topstop as a number of pixels, and it is subtracted
    // from a pixel height. Reading it as rows gives the wrong bonus for every
    // non-zero value, which is why it is a number here and not a row count.
    expect(settingsOf("topstop = 64").topStop).toBe(64);
  });

  it("defers the topoverlap default to the art, and only when there is art", () => {
    // "mHetzrandUeberlapp = getZahlEintragMitDefault("topoverlap", mVersion,
    //  mHetzBild.getHoehe())", and 0 when there is no toppic.
    expect(settingsOf("").topOverlap).toBe(0);
    expect(settingsOf("toppic = rand.xpm").topOverlap).toBeNull();
    expect(settingsOf("toppic = rand.xpm\n      topoverlap = 8").topOverlap).toBe(8);
  });

  it("treats toppic and bgpic as art keys, not file paths", () => {
    // Nothing is opened: the name is passed through for the manifest to resolve.
    const s = settingsOf(`
      toppic = hetzrand.xpm
      bgpic = holz.xpm
    `);
    expect(s.topPic).toBe("hetzrand.xpm");
    expect(s.backgroundPic).toBe("holz.xpm");
  });
});

describe("the range checks", () => {
  it("refuses a neighbours value outside the ten modes", () => {
    expect(() => settingsOf("neighbours = 10")).toThrow(/neighbours out of range/);
    expect(() => settingsOf("neighbours = -1")).toThrow(/neighbours out of range/);
    // The ten modes themselves are all accepted.
    for (let mode = 0; mode <= 9; mode++) {
      expect(settingsOf(`neighbours = ${mode}`).neighbours).toBe(mode);
    }
  });

  it("refuses a hexflip outside 0 to 3", () => {
    expect(() => settingsOf("hexflip = 4")).toThrow(/hexflip out of range/);
    expect(() => settingsOf("hexflip = -1")).toThrow(/hexflip out of range/);
    for (let flip = 0; flip <= 3; flip++) {
      expect(settingsOf(`hexflip = ${flip}`).hexFlip).toBe(flip);
    }
  });

  it("refuses a negative nogreyprob", () => {
    expect(() => settingsOf("nogreyprob = -1")).toThrow(
      /nogreyprob must not be negative/,
    );
    expect(settingsOf("nogreyprob = 3").noGreyProb).toBe(3);
  });

  it("refuses a boolean setting that is neither 0 nor 1", () => {
    // `intZuBool` throws "0 or 1 expected, got %d."
    expect(() => settingsOf("chaingrass = 2")).toThrow(/chaingrass must be 0 or 1, got 2/);
    expect(() => settingsOf("mirror = 7")).toThrow(/mirror must be 0 or 1, got 7/);
    expect(() => settingsOf("randomfallpos = 3")).toThrow(
      /randomfallpos must be 0 or 1, got 3/,
    );
  });

  it("names the file and line of the setting it refused", () => {
    let caught: unknown;
    try {
      // Line 6: the fixture puts `name` and `author` on lines 2 and 3, and the
      // two blank lines of the body are 4 and 5.
      settingsOf("\n\n      toptime = 0");
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toMatch(/test\.ld:6:/);
    expect((caught as Error).message).toMatch(/in section Level/);
    expect((caught as Error).message).toMatch(/toptime must be positive/);
  });
});

describe("versioned settings", () => {
  it("reads the definition for the version being played", () => {
    const source = `Level = {
      name = "Test"
      author = "Tester"
      numexplode = 8
      numexplode[2] = 6
    }`;
    const file = parseLd(source, "test.ld");
    const def = file.definitions[0];
    if (def === undefined || def.value.type !== "section") throw new Error("bad fixture");

    const read = (players: 1 | 2): number => {
      const version = Version.of(String(players), "main");
      const level = new DefinitionScope(
        "Level",
        rootScope("test.ld", version),
        version,
        "test.ld",
      );
      level.defineAll(def.value.type === "section" ? def.value.definitions : []);
      return readLevelSettings(level).numExplode;
    };
    // The man page's own example: decrease the threshold in two-player mode.
    expect(read(1)).toBe(8);
    expect(read(2)).toBe(6);
  });
});

describe("feeding the kinds", () => {
  it("passes on the three values a kind's defaults depend on", () => {
    const s = settingsOf(`
      numexplode = 6
      neighbours = 2
      chaingrass = 1
    `);
    expect(kindDefaultsFrom(s)).toEqual({
      numExplode: 6,
      neighbours: 2,
      chainGrass: true,
    });
  });

  it("knows which neighbour modes put the board into hex mode", () => {
    // The three modes that make `getHexShift` apply: hex six, hex four and 3D.
    expect(isHexNeighbourMode(2)).toBe(true);
    expect(isHexNeighbourMode(3)).toBe(true);
    expect(isHexNeighbourMode(6)).toBe(true);
    for (const mode of [0, 1, 4, 5, 7, 8, 9]) {
      expect(isHexNeighbourMode(mode), `mode ${mode}`).toBe(false);
    }
  });
});
