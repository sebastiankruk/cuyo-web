/**
 * Level-wide settings: the values a level declares about itself rather than about
 * a blob.
 *
 * Every default here is upstream's, and several of them are not the ones a
 * reasonable person would pick - the chase border is light grey at (200,200,200)
 * and the text is dark grey at (60,60,60) - so they are transcribed rather than
 * chosen, and each is cited.
 *
 * The validation is upstream's too, and it is not optional: `toptime` must be
 * positive, `nogreyprob` must not be negative, `neighbours` and `hexflip` must be
 * in range, and a colour must be three numbers. Those checks are what stop a
 * level with a typo from loading into a game that then misbehaves in ways nothing
 * points back at the `.ld` file.
 */

import { LdParseError } from "./parser.ts";
import type { Colour, DefinitionScope } from "./scope.ts";
import { DEFAULT_TOPTIME, NeighbourMode } from "../game-core/constants.ts";
import { NEIGHBOURS_3D, NEIGHBOURS_HEX4, NEIGHBOURS_HEX6 } from "./cual-constants.ts";
import { UNDEFINED_EXPLODE } from "./kinds.ts";
import type { KindDefaults } from "./kinds.ts";

/** `src/leveldaten.h:zufallsgraue_keine` - no random grey blobs at all. */
export const NO_RANDOM_GREYS = -1;

/**
 * A level's own settings.
 *
 * A few of the defaults are only reachable because they were extracted from
 * `LevelDaten::ladLevel`, and the comment on each says which line. The one that
 * catches people is `hetzrandStop`, `topstop`: the man page documents it as a
 * number of *pixels* and it is subtracted from a pixel height, so reading it as a
 * number of rows gives the wrong time bonus for every non-zero value.
 */
export interface LevelSettings {
  readonly name: string;
  readonly author: string;
  readonly description: string;

  /** `bgcolor`, default white. */
  readonly background: Colour;
  /** `textcolor`, default dark grey. */
  readonly text: Colour;
  /** `topcolor`, default light grey. */
  readonly top: Colour;

  /**
   * `numexplode`, or {@link UNDEFINED_EXPLODE} when the level sets none.
   *
   * Optional, because it is per-kind: "optional, since it is definable per kind
   * (but then you have to do that)". A kind that explodes on size and reaches
   * neither its own nor this value is an error naming the kind, and that check
   * belongs with the kinds, not here.
   */
  readonly numExplode: number;

  /** `toptime`: steps per pixel of chase-border travel. Must be positive. */
  readonly topTime: number;
  /** `topstop`: pixels of height left when the level is won. */
  readonly topStop: number;
  /** `toppic`: an art key, or "" when the level declares none. */
  readonly topPic: string;
  /**
   * `topoverlap`: how far the chase border's picture hangs over the board.
   *
   * `null` means "the height of `toppic`", which is upstream's default and
   * cannot be a number here because the height is a property of the artwork. Task
   * 2.10's art manifest supplies it; with no `toppic` at all the value is 0.
   */
  readonly topOverlap: number | null;
  /** `bgpic`: an art key, or "" when the level declares none. */
  readonly backgroundPic: string;

  /** `chaingrass`: goal blobs need a chain reaction to be destroyed. */
  readonly chainGrass: boolean;
  /** `mirror`: the level is drawn and played upside down. */
  readonly mirror: boolean;
  /** `randomfallpos`: each new piece starts at a random column. */
  readonly randomFallPos: boolean;

  /** `neighbours`, checked against the ten modes. */
  readonly neighbours: number;
  /**
   * `hexflip`, 0 to 3.
   *
   * Which way the hex offset alternates, and only meaningful in a hex mode. The
   * range check is upstream's even though the value is unused here; 2.7 is where
   * the geometry is applied.
   */
  readonly hexFlip: number;

  /** `randomgreys`: expected steps between grey blobs, or -1 for none. */
  readonly randomGreys: number;
  /** `nogreyprob`: weight that no grey blob appears at all. */
  readonly noGreyProb: number;
}

/** A colour, re-exported so callers need not reach into `scope.ts`. */
export type { Colour };

/**
 * A colour as CSS, clamped and rounded.
 *
 * Upstream stores r, g and b as numbers it never range-checks, and a level that wrote
 * 300 would otherwise produce `rgb(300,...)`, which the browser clamps silently — so the
 * value on screen would differ from the value on the level, which is exactly the kind of
 * divergence that is hard to notice and hard to explain.
 *
 * **One function, because there were two.** It lived in `loader.ts`, and the level index
 * grew a copy for the catalogue's tiles — which differed in both respects that matter:
 * the copy did not clamp, and it wrote `rgb(r, g, b)` where this writes `rgb(r,g,b)`. So
 * a level writing an out-of-range channel produced a tile whose background string was not
 * the string the game paints, and the two were equal as colours and unequal as text. It
 * lives here now because `settings.ts` owns `Colour` and both callers want it, and the
 * alternative — two readers of one setting that can disagree — is the failure
 * `readLevelSettings` exists to prevent for every other value.
 */
export function cssColour(colour: Colour): string {
  const channel = (n: number): number =>
    Math.max(0, Math.min(255, Math.round(Number.isFinite(n) ? n : 0)));
  return `rgb(${channel(colour.r)},${channel(colour.g)},${channel(colour.b)})`;
}

/** The default chase-border colour, `Color(200, 200, 200)`. */
export const DEFAULT_TOP_COLOUR: Colour = { r: 200, g: 200, b: 200 };

/** The default text colour, `Color(60, 60, 60)`. */
export const DEFAULT_TEXT_COLOUR: Colour = { r: 60, g: 60, b: 60 };

/** The default background colour, `Color(255, 255, 255)`. */
export const DEFAULT_BACKGROUND_COLOUR: Colour = { r: 255, g: 255, b: 255 };

/** The highest `neighbours` value, `nachbarschaft_letzte`. */
export const NEIGHBOURS_LAST = NeighbourMode.Vertical;

/**
 * Reads a level's own settings.
 *
 * @param level the level section
 * @throws LdParseError with the file, line and reason if a value is out of range
 */
export function readLevelSettings(level: DefinitionScope): LevelSettings {
  const background = level.ownColour("bgcolor", DEFAULT_BACKGROUND_COLOUR);
  const text = level.ownColour("textcolor", DEFAULT_TEXT_COLOUR);
  const top = level.ownColour("topcolor", DEFAULT_TOP_COLOUR);

  const topTime = level.ownNumber("toptime", DEFAULT_TOPTIME);
  if (topTime < 1) {
    fail(level, "toptime must be positive", "toptime");
  }

  const neighbours = level.ownNumber("neighbours", NeighbourMode.Rect);
  if (neighbours < 0 || neighbours > NEIGHBOURS_LAST) {
    fail(level, "neighbours out of range", "neighbours");
  }

  const hexFlip = level.ownNumber("hexflip", 0);
  if (hexFlip < 0 || hexFlip > 3) {
    fail(level, "hexflip out of range", "hexflip");
  }

  const noGreyProb = level.ownNumber("nogreyprob", 0);
  if (noGreyProb < 0) {
    fail(level, "nogreyprob must not be negative", "nogreyprob");
  }

  const topPic = level.ownWord("toppic", "") ?? "";
  // "Hetzrandueberlapp (optional)": the default is the picture's height when
  // there is a picture, and 0 when there is not. So the two cases differ, and the
  // first one cannot be resolved until the art manifest knows the height.
  const topOverlap = topPic === ""
    ? 0
    : level.hasOwn("topoverlap")
      ? level.ownNumber("topoverlap", 0)
      : null;

  return {
    name: level.requireWord("name"),
    author: level.requireWord("author"),
    description: level.ownWord("description", "") ?? "",
    background,
    text,
    top,
    numExplode: level.ownNumber("numexplode", UNDEFINED_EXPLODE),
    topTime,
    topStop: level.ownNumber("topstop", 0),
    topPic,
    topOverlap,
    backgroundPic: level.ownWord("bgpic", "") ?? "",
    chainGrass: level.ownFlag("chaingrass", false),
    mirror: level.ownFlag("mirror", false),
    randomFallPos: level.ownFlag("randomfallpos", false),
    neighbours,
    hexFlip,
    randomGreys: level.ownNumber("randomgreys", NO_RANDOM_GREYS),
    noGreyProb,
  };
}

/**
 * The level-wide values a kind's defaults are seeded from.
 *
 * Only three of them, because that is all `Sorte::Sorte` reads from the level
 * node. `neighbours` is read but the per-kind override is 2.7's business, and
 * `hexFlip` is applied by the geometry rather than by the kind.
 */
export function kindDefaultsFrom(settings: LevelSettings): KindDefaults {
  return {
    neighbours: settings.neighbours,
    chainGrass: settings.chainGrass,
    numExplode: settings.numExplode,
  };
}

/** True when a neighbour mode puts the board into hex mode. */
export function isHexNeighbourMode(mode: number): boolean {
  return mode === NEIGHBOURS_HEX6 || mode === NEIGHBOURS_HEX4 || mode === NEIGHBOURS_3D;
}

function fail(level: DefinitionScope, message: string, setting: string): never {
  const pos = level.positionOf(setting);
  throw new LdParseError(
    `${level.where()}: ${message}`,
    pos.line,
    pos.col,
    level.filename,
  );
}
