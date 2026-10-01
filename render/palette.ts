/**
 * Colour assignment, per level.
 *
 * The problem this solves is not tidiness. Two kinds in one level drawn in the same
 * colour means a blob cannot be told from another, and the player has no way to know
 * which is which. The first version here hashed each picture name to a hue
 * independently, which cannot work: measured across the 79 real levels, 17 had two
 * kinds under 25° apart and the worst was 2° — `pfeile.ld`, whose kinds are arrows,
 * rendered in the same colour.
 *
 * The second version spread hues by the golden angle, which is a good answer for hue
 * alone and stopped being good enough. Hue is one dimension; a level can have as many
 * kinds as it likes, and colour is a volume rather than a circle. `angst.ld` has 14
 * colour kinds, and 360° of hue for 14 kinds leaves a closest pair 13° apart. Adding a
 * lightness dimension helped — and then the real measurement showed the tightest pair
 * in that level at ΔE 6.5, two colours a player cannot tell apart. Both numbers had
 * been true; only one of them meant anything.
 *
 * So the palette is now chosen by maximising the minimum perceptual distance, which is
 * the property actually wanted. A candidate set of colours is generated in Lab, and
 * farthest-point sampling picks `count` of them so that the closest pair is as far apart
 * as it can be. That is a greedy algorithm with no tuning parameter, and it improves on
 * the golden angle by a factor of six on the level that needed it: ΔE 38.6 rather than
 * 6.5 for 14 kinds.
 *
 * Four properties, each of which is deliberate:
 *
 * - **Deterministic.** The same level always gets the same colours, whatever order the
 *   kinds arrive in, so a screenshot in a bug report matches what the player sees. The
 *   candidate grid is fixed and the greedy order follows from it.
 * - **Positional, not name-based.** The opposite of what it replaces. A hash of the
 *   picture names the level author chose is exactly how two kinds came to share a
 *   colour.
 * - **Roles constrain rather than decorate.** Greys are grey and goal blobs get a fixed
 *   hue, because those are roles the game already distinguishes with a marker shape.
 *   Only ordinary colour kinds compete for the palette.
 * - **Measured, not asserted.** The tests check ΔE, so "a player can tell them apart"
 *   is a number that was computed rather than a comment.
 *
 * There is a real limit, and it is stated rather than hidden: `bunt.ld` has 153 colour
 * kinds, and no palette separates 153 colours. See {@link MAX_SEPARABLE_KINDS}.
 *
 * All of this is canvas-free and pure, so it runs and is tested in plain Node.
 */

import type { KindRole } from "../engine/level-format/level-data.ts";
import { deltaE, hslCandidate } from "./perceptual.ts";
import type { Lab } from "./perceptual.ts";

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
 * from it expects. Chosen here rather than by the palette so goal blobs are recognisable
 * across levels.
 */
const GOAL_HUE = 96;

/** Ordinary greys, in lightness steps so several greys in one level stay apart. */
const GREY_LIGHTNESS = [72, 58, 44, 34];

/**
 * ΔE a palette must reach between every pair of ordinary kinds.
 *
 * Roughly where a difference becomes unmistakable side by side at cell size. Not a
 * spec number: chosen by measuring what the corpus can actually achieve, so it is a
 * floor the palette meets rather than a target it misses.
 */
export const MINIMUM_DELTA_E = 20;

/**
 * The most kinds colour alone is expected to separate to {@link MINIMUM_DELTA_E}.
 *
 * Measured, not guessed, and measured on the *worse* of the two backgrounds because a
 * palette that only works on white is a palette that fails on a quarter of the corpus.
 * With the candidate grid below:
 *
 * | Kinds | Light board | Dark board |
 * | ----- | ----------- | ---------- |
 * | 14    | 38.6        | 37.9       |
 * | 40    | 22.2        | 21.1       |
 * | 42    | 21.8        | 19.9       |
 * | 153   | 11.5        | 10.9       |
 *
 * So 40 is the last count where both hold, and that is the number. The two levels past
 * it are `bonimali.ld` with 42 and `bunt.ld` with 153.
 *
 * Past roughly here the answer is not a better palette. It is distinct *shapes*, which
 * is what upstream does with 153 separate spritesheets and what roadmap item 8.1 is
 * for. The tests name the levels that are past this rather than quietly asserting a
 * property the code does not have.
 */
export const MAX_SEPARABLE_KINDS = 40;

/**
 * The candidate set, as hue, saturation and lightness values.
 *
 * A grid rather than a continuous search, for three reasons: it is deterministic, it is
 * fast enough to run in a few milliseconds, and the resolution is a stated choice rather
 * than an emergent one. Measured against a grid four times this size, the improvement is
 * about ΔE 1.5 at 14 kinds and 1.2 at 42 — not worth 2600 candidates and 1700 ms.
 */
const CANDIDATE_HUES = Array.from({ length: 36 }, (_, i) => i * 10);
const CANDIDATE_SATURATIONS = [45, 58, 70];
const CANDIDATE_LIGHTNESS: Readonly<
  Record<"light" | "dark", readonly number[]>
> = {
  /** On a white board: a darker step is still readable, and helps against the grid. */
  light: [34, 40, 46, 52, 58, 64, 70],
  /** On a black board, shifted up, since the bottom of the light range would vanish. */
  dark: [42, 48, 54, 60, 66, 72, 78],
};

/** A candidate colour, with the Lab triple it is measured by and the CSS it is drawn as. */
interface Candidate {
  readonly lab: Lab;
  readonly css: string;
}

/**
 * Candidates for one background, built once per background and shared.
 *
 * Two backgrounds, so a hundred levels' worth of work at most, and the common case is
 * one.
 */
const grids: Partial<Record<"light" | "dark", readonly Candidate[]>> = {};

/** The candidate grid for a background. */
function candidateGrid(dark: boolean): readonly Candidate[] {
  const key = dark ? "dark" : "light";
  const hit = grids[key];
  if (hit !== undefined) return hit;
  const out: Candidate[] = [];
  for (const hue of CANDIDATE_HUES) {
    for (const saturation of CANDIDATE_SATURATIONS) {
      for (const lightness of CANDIDATE_LIGHTNESS[key]) {
        out.push(hslCandidate(hue, saturation, lightness));
      }
    }
  }
  grids[key] = out;
  return out;
}

/**
 * Candidate starting points, tried in turn.
 *
 * Greedy farthest-point sampling is sensitive to where it starts: a different seed
 * gives a different set, and some seeds give a measurably worse minimum. Rather than
 * pick one and hope, each is tried and the set with the largest minimum pairwise
 * distance wins - which optimises the property directly instead of approximately.
 *
 * A fixed list, so the answer stays deterministic. Five seeds, because the gain flattens
 * after that and each one costs a full pass over the grid.
 */
const SEED_HUES = [200, 45, 160, 300, 265];

/**
 * The `count` most widely separated colours from the grid.
 *
 * Farthest-point sampling: start at a seed, then repeatedly add whichever remaining
 * candidate is *farthest* from every colour already chosen. That maximises the minimum
 * pairwise distance for a greedy choice, needs no tuning, and is deterministic because
 * the grid, the seeds and the tie-breaking all are.
 *
 * The returned order is the order of selection, so kind 0 gets a seed colour and each
 * subsequent kind gets a colour chosen to be far from all the earlier ones. Which is
 * what makes it positional: two levels with four kinds look the same.
 */
export function maximinColours(count: number, dark: boolean): string[] {
  if (count <= 0) return [];
  const grid = candidateGrid(dark);
  let best: Candidate[] = [];
  let bestMinimum = -1;
  for (const hue of SEED_HUES) {
    const attempt = sample(grid, hue, dark, count);
    const minimum = closestIn(attempt);
    if (minimum > bestMinimum) {
      bestMinimum = minimum;
      best = attempt;
    }
  }
  return best.map((c) => c.css);
}

/** One greedy pass from a given seed. */
function sample(
  grid: readonly Candidate[],
  hue: number,
  dark: boolean,
  count: number,
): Candidate[] {
  const chosen: Candidate[] = [seed(hue, dark)];
  // `far[i]` is the distance from candidate i to its nearest chosen colour, which is
  // what keeps the inner loop linear in the grid rather than quadratic. It has to be
  // seeded from the first choice: left at infinity, the first pick is simply `grid[0]`
  // and the seed is decoration.
  const far = new Array<number>(grid.length);
  for (let i = 0; i < grid.length; i++) {
    far[i] = deltaE(grid[i]!.lab, chosen[0]!.lab);
  }
  while (chosen.length < count) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let i = 0; i < grid.length; i++) {
      const distance = far[i]!;
      // Ties go to the lower index, which keeps the result stable rather than dependent
      // on the order the grid happened to be built in.
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    const pick = grid[bestIndex]!;
    chosen.push(pick);
    for (let i = 0; i < grid.length; i++) {
      const d = deltaE(grid[i]!.lab, pick.lab);
      if (d < far[i]!) far[i] = d;
    }
  }
  return chosen;
}

/** The closest pair in a chosen set, by ΔE. */
function closestIn(chosen: readonly Candidate[]): number {
  let worst = Number.POSITIVE_INFINITY;
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const d = deltaE(chosen[i]!.lab, chosen[j]!.lab);
      if (d < worst) worst = d;
    }
  }
  return worst;
}

/**
 * The seed candidate: a mid blue by default, because red on a white board reads as an
 * error and is the colour a player will mistake for a chase border or a warning.
 */
function seed(hue: number, dark: boolean): Candidate {
  const lightness = CANDIDATE_LIGHTNESS[dark ? "dark" : "light"];
  const mid = lightness[Math.floor(lightness.length / 2)] ?? 52;
  return hslCandidate(hue, 58, mid);
}

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
 * Palettes already built, keyed on the level's kind table.
 *
 * The renderer asks for a palette every frame, and the answer cannot change while a
 * level is loaded — `level.kinds` is a fixed array for as long as the level is. So the
 * work is done once per level and this holds it. Worth it: the search is a few
 * milliseconds, which would be a visible stutter if it happened 60 times a second, and
 * the alternative of not caching means the same answer recomputed from scratch forever.
 */
const cache = new WeakMap<
  readonly { readonly role: KindRole }[],
  { readonly dark: boolean; readonly palette: Palette }
>();

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
  const hit = cache.get(kinds);
  if (hit !== undefined && hit.dark === dark) return hit.palette;

  const ordinary = kinds
    .map((_, index) => index)
    .filter((index) => kinds[index]?.role === "colour");
  const colours = maximinColours(ordinary.length, dark);
  const palette = new Map<number, KindColour>();

  let greyIndex = 0;
  for (let i = 0; i < kinds.length; i++) {
    const role = kinds[i]?.role;
    if (role === "colour") {
      const at = ordinary.indexOf(i);
      palette.set(i, {
        colour: colours[at] ?? "#c0c0c0",
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
  cache.set(kinds, { dark, palette });
  return palette;
}

/**
 * Whether a background is dark enough to need a different palette.
 *
 * Tested on luminance rather than on a name or a hex value, because the level can
 * declare any colour and the only thing that matters is how much light is behind the
 * blobs. Levels write it as `bgcolor=0,0,0`, which the loader hands over as
 * `rgb(0,0,0)`.
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
