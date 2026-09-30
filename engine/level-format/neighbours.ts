/**
 * Neighbour modes: which cells count as connected, and whether the board's
 * columns are offset.
 *
 * Two things come out of a level's `neighbours` setting, and they are not the
 * same thing:
 *
 *  - The *mode*, which is per kind. A level sets it board-wide and any kind may
 *    override it in its own section.
 *  - The *geometry*, which is board-wide and comes from the level-wide mode and
 *    `hexflip` alone. `LevelDaten::ladLevel` computes `mSechseck` once, from the
 *    level's own `neighbours`, and nothing a kind says can change it.
 *
 * The consequence is worth stating because it surprises: a kind that asks for hex
 * six in a rectangular board connects to its six hex neighbours laid out on a
 * square grid, and every column still draws unshifted. That is upstream.
 *
 * No level in the corpus does this - all eleven hex levels set the mode at the
 * level's level, and the five levels that override per kind override it with a
 * rectangular mode. So the case is real but unexercised by the level data, and
 * only the tests here cover it. Worth knowing before removing the separation.
 */

import { LdParseError } from "./parser.ts";
import type { LdPos } from "./parser.ts";
import { NeighbourMode, hexGeometry } from "../game-core/constants.ts";
import type { HexGeometry } from "../game-core/constants.ts";
import { CUAL_CONSTANTS } from "./cual-constants.ts";
import type { KindNeighbourOverride } from "./level-data.ts";
import type { KindTable } from "./kinds.ts";
import type { DefinitionScope } from "./scope.ts";

/** The ten modes, in `sorte.h`'s order. */
export const NEIGHBOUR_MODES: readonly NeighbourMode[] = [
  NeighbourMode.Rect,
  NeighbourMode.Diagonal,
  NeighbourMode.Hex6,
  NeighbourMode.Hex4,
  NeighbourMode.Knight,
  NeighbourMode.Eight,
  NeighbourMode.ThreeD,
  NeighbourMode.None,
  NeighbourMode.Horizontal,
  NeighbourMode.Vertical,
];

/** `nachbarschaft_letzte`: the highest value a level may write. */
export const LAST_NEIGHBOUR_MODE = NeighbourMode.Vertical;

/**
 * The `.ld` name of each mode, reverse of `cual-constants.ts`.
 *
 * For diagnostics only - a level writes the number, or the name inside `<...>`.
 * The spelling differs from the Cual identifiers in one place worth noticing:
 * `neighbours_3D` has a capital D, because upstream's `const_namen` does.
 */
export const MODE_NAMES: ReadonlyMap<NeighbourMode, string> = new Map(
  NEIGHBOUR_MODES.map((mode) => {
    const entry = [...CUAL_CONSTANTS.entries()].find(
      ([name, value]) => name.startsWith("neighbours_") && value === mode,
    );
    return [mode, entry?.[0] ?? `neighbours_${mode}`] as const;
  }),
);

/** The mode a number denotes, or undefined if it is not one of the ten. */
export function neighbourModeOf(value: number): NeighbourMode | undefined {
  return NEIGHBOUR_MODES.find((mode) => mode === value);
}

/** The `.ld` name of a mode, for an error message. */
export function modeName(mode: number): string {
  const found = neighbourModeOf(mode);
  return found === undefined ? String(mode) : (MODE_NAMES.get(found) as string);
}

/**
 * A level's or a kind's `neighbours` value, as a mode.
 *
 * @throws LdParseError if the value is outside the ten modes, which is upstream's
 *   "neighbours out of range" and not a default to be invented here
 */
export function requireNeighbourMode(
  value: number,
  level: DefinitionScope,
  setting: string,
  pos?: LdPos,
): NeighbourMode {
  const found = neighbourModeOf(value);
  if (found === undefined) {
    const where = pos ?? level.positionOf(setting);
    throw new LdParseError(
      `${level.where()}: ${setting} out of range: ${value} is not one of the ten modes`,
      where.line,
      where.col,
      level.filename,
    );
  }
  return found;
}

/** The board's hex geometry, from a level's `neighbours` and `hexflip`. */
export function boardHex(level: DefinitionScope): HexGeometry {
  return hexGeometry(level.ownNumber("neighbours", NeighbourMode.Rect), level.ownNumber("hexflip", 0));
}

/**
 * The per-kind neighbour overrides, as `KindNeighbourOverride`.
 *
 * Collected from the kind table rather than re-derived, because the table already
 * knows which kinds have a section of their own and what their number is. A kind
 * that sets `neighbours` to the level-wide value is still an override - the two
 * are not the same fact - but it is dropped here, since a lookup that returns the
 * level's own mode is the same lookup as no override at all.
 */
export function readNeighbourOverrides(
  level: DefinitionScope,
  table: KindTable,
): readonly KindNeighbourOverride[] {
  const levelWide = level.ownNumber("neighbours", NeighbourMode.Rect);
  const out: KindNeighbourOverride[] = [];
  for (const { kind, mode } of table.neighbourOverrides) {
    requireNeighbourMode(mode, level, "neighbours");
    if (mode === levelWide) continue;
    out.push({ kind, mode });
  }
  return out;
}
