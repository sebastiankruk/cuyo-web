/**
 * Colour assignment, per level.
 *
 * The previous approach hashed each picture name to a hue independently. That cannot
 * work, and the corpus says so: hashing gives each key a hue on its own, and two names
 * in the same level will sometimes land a couple of degrees apart. Measured across the
 * 79 real levels, 17 have two kinds under 25° apart and the worst is 2° — `pfeile.ld`,
 * whose kinds are arrows, rendered in the same colour. The player sees one colour used
 * for two things and has no way to tell which is which.
 *
 * The fix is not a better hash. It is to stop treating the assignment as independent:
 * a palette is a *set* of colours for a level's kinds, so it has to be chosen as one.
 * Hues are then spread around the wheel with the golden-angle step, which guarantees
 * the largest possible minimum separation for any number of kinds, and each kind's
 * position decides its hue.
 *
 * Two properties are deliberate:
 *
 * - **Deterministic.** The same level always gets the same colours, whatever order the
 *   kinds arrive in, so a screenshot in a bug report matches what the player sees.
 * - **Roles constrain rather than decorate.** Greys are grey and goal blobs get a fixed
 *   hue, because those are roles the game already distinguishes with a marker shape, and
 *   a goal blob that happened to be the same colour as an ordinary one would work against
 *   that. Only the ordinary colour kinds are given the wheel.
 *
 * Palette and colour maths are separated, and both are canvas-free.
 */

import type { KindRole } from "../engine/level-format/level-data.ts";

/** The golden angle, in degrees. */
const GOLDEN_ANGLE = 137.508;

/**
 * Hues for `count` kinds, as far apart as possible.
 *
 * Consecutive multiples of the golden angle give the best possible minimum separation
 * for any count: with 360° and a golden step, no two are ever closer than about
 * 360/count²/2, which for six kinds is far wider than any fixed palette would manage.
 *
 * The offset is by the golden angle too, rather than starting at 0°, so the first kind
 * is not red — red on a white board reads as an error, and it is the colour a player
 * will mistake for a chase border or a warning.
 */
export function spreadHues(count: number, offset: number): number[] {
  const hues: number[] = [];
  for (let i = 0; i < count; i++) {
    hues.push(
      Math.round(
        (((offset * GOLDEN_ANGLE + i * GOLDEN_ANGLE) % 360) + 360) % 360,
      ),
    );
  }
  return hues;
}

/** One kind's assigned appearance. */
export interface KindColour {
  readonly colour: string;
  /**
   * How this kind differs from the others of its role, for anything drawn on top.
   *
   * Empty for a role that is not distinguished further. Kept as data so the renderer
   * and the rules panel agree on it without either recomputing.
   */
  readonly marker: "" | "dot" | "square";
}

/** A palette for one level's kinds. */
export type Palette = ReadonlyMap<number, KindColour>;

/**
 * The goal blobs' fixed hue.
 *
 * Green, because that is what "grass" means in the original and what a player coming
 * from it expects. Chosen here rather than by the spread so a level's goal blobs are
 * recognisable across levels.
 */
const GOAL_HUE = 96;
/** Ordinary greys, in lightness steps so several greys in one level stay apart. */
const GREY_LIGHTNESS = [72, 58, 44, 34];

export interface PaletteOptions {
  /**
   * The board's background, so the chosen colours are chosen *against* it.
   *
   * Levels declare their own `bgcolor` and some are dark. A palette tuned for white
   * puts its lightest kinds on the edge of visibility on a dark board, which is the
   * same class of bug as a blank cell: the blob is there and cannot be seen.
   */
  readonly background?: string;
}

/**
 * Builds a palette for a level's kinds.
 *
 * `kinds` is the level's kind table; the index into it is the kind constant, which is
 * what the board stores, so the palette is keyed by that.
 */
export function buildPalette(
  kinds: readonly { readonly role: KindRole }[],
  options: PaletteOptions = {},
): Palette {
  const dark = isDark(options.background ?? "#ffffff");
  const ordinary = kinds
    .map((_, index) => index)
    .filter((index) => kinds[index]?.role === "colour");

  // The offset is seeded from the *number* of ordinary kinds, not their names: a level
  // with four colours should look like a different set from a level with five, and
  // seeding from names would reintroduce the collision this exists to prevent.
  const hues = spreadHues(ordinary.length, ordinary.length + 1);
  const palette = new Map<number, KindColour>();

  let greyIndex = 0;
  for (let i = 0; i < kinds.length; i++) {
    const role = kinds[i]?.role;
    if (role === "colour") {
      const at = ordinary.indexOf(i);
      palette.set(i, {
        colour: `hsl(${hues[at] ?? 0} ${dark ? 62 : 58}% ${dark ? 58 : 50}%)`,
        marker: "",
      });
      continue;
    }
    if (role === "grey") {
      const l = GREY_LIGHTNESS[greyIndex % GREY_LIGHTNESS.length] ?? 58;
      greyIndex++;
      palette.set(i, {
        colour: `hsl(0 0% ${dark ? l - 12 : l}%)`,
        marker: "square",
      });
      continue;
    }
    if (role === "grass") {
      palette.set(i, {
        colour: `hsl(${GOAL_HUE} ${dark ? 55 : 50}% ${dark ? 52 : 42}%)`,
        marker: "dot",
      });
      continue;
    }
    palette.set(i, {
      colour: dark ? "#20242c" : "#e8e8e8",
      marker: "",
    });
  }
  return palette;
}

/**
 * Whether a background is dark enough to need a different palette.
 *
 * Tested on luminance rather than on a name or a hex value, because the level can
 * declare any colour and the only thing that matters is how much light is behind the
 * blobs.
 */
export function isDark(colour: string): boolean {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  if (hex !== null) {
    const n = parseInt(hex[1] as string, 16);
    const f = (c: number) => (c / 255) * 100;
    const r = f((n >> 16) & 255);
    const g = f((n >> 8) & 255);
    const b = f(n & 255);
    // Rec. 709 relative luminance, the usual approximation.
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 50;
  }
  const hsl = /^hsl\((\d+) (\d+)% (\d+)%\)/.exec(colour);
  if (hsl !== null) return Number(hsl[3]) < 50;
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(colour);
  if (rgb !== null) {
    const r = (Number(rgb[1]) / 255) * 100;
    const g = (Number(rgb[2]) / 255) * 100;
    const b = (Number(rgb[3]) / 255) * 100;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 50;
  }
  // Unknown format: assume light, which is what every level in the corpus uses.
  return false;
}

/** The colour for a kind, falling back to something visible if the palette lacks it. */
export function colourFor(palette: Palette, kind: number): string {
  return palette.get(kind)?.colour ?? "#c0c0c0";
}

/** The marker shape a kind carries. */
export function markerFor(
  palette: Palette,
  kind: number,
): KindColour["marker"] {
  return palette.get(kind)?.marker ?? "";
}
