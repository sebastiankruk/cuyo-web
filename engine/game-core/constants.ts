/**
 * Board geometry, behaviour bits, neighbour modes and scoring constants.
 *
 * Every value here is transcribed from upstream and the source line is cited so
 * the two can be diffed if upstream is ever re-read:
 *
 *  - `src/layout.h`      grid size and cell size
 *  - `src/blop.h`        behaviour bit assignments
 *  - `src/sorte.h`       neighbour mode enum order
 *  - `src/leveldaten.h`  score constants
 *  - `src/spielfeld.cpp` chase-border and spawn-margin constants
 *  - `src/knoten.cpp`    falling speed defaults
 */

/** `src/layout.h`: number of columns. */
export const GRX = 10;
/** `src/layout.h`: number of rows. */
export const GRY = 20;
/** `src/layout.h`: nominal cell size in art pixels. */
export const GRIC = 32;

/** `src/ui.cpp`: one game step is 80 ms. */
export const STEP_MS = 80;

/** `src/blop.h`: bits of the `behaviour` variable. */
export const EXPLODES_ON_SIZE = 1;
export const EXPLODES_ON_EXPLOSION = 2;
export const EXPLODES_ON_CHAIN_REACTION = 4;
export const CALCULATE_SIZE = 8;
export const GOAL_BLOB = 16;
export const FLOATS = 32;

/** `src/leveldaten.h`: points awarded per event. */
export const POINTS_PER_NORMAL = 1;
export const POINTS_PER_GREY = 0;
export const POINTS_PER_GRASS = 20;
export const POINTS_PER_CHAIN_REACTION = 10;
export const POINTS_PER_TIME_BONUS = 10;

/** `src/spielfeld.cpp`: extra greys released per chain reaction. */
export const GREYS_PER_CHAIN_REACTION = 5;

/** `src/spielfeld.cpp`: cells a falling piece must be clear of grey spawns. */
export const NEW_FALL_MARGIN = 5;

/** `src/spielfeld.cpp`: grey blobs appear this many pixels below the border. */
export const GREY_SPAWN_OFFSET_PX = 8;

/** `src/knoten.cpp`: default `falling_speed` and `falling_fast_speed`, in px/step. */
export const FALLING_SPEED = 6;
export const FALLING_FAST_SPEED = GRIC;

/**
 * How far the chase border travels per time-bonus step.
 *
 * `leveldaten.h:#define bonus_geschwindigkeit 32`, i.e. one cell per step.
 */
export const BONUS_SPEED = 32;

/** `src/leveldaten.cpp`: default `toptime`, in steps per pixel of border travel. */
export const DEFAULT_TOPTIME = 50;

/** `src/spielfeld.cpp`: steps an exploding blob stays visible. */
export const EXPLOSION_STEPS = 8;

/** Neighbour modes, in the order of upstream's `nachbarschaft_*` enum. */
export const enum NeighbourMode {
  Rect = 0,
  Diagonal = 1,
  Hex6 = 2,
  Hex4 = 3,
  Knight = 4,
  Eight = 5,
  /** Only used by `3d.ld`; not yet implemented. */
  ThreeD = 6,
  None = 7,
  Horizontal = 8,
  Vertical = 9,
}

/** Neighbour modes that also put the whole board into hex mode. */
const HEX_MODES: ReadonlySet<NeighbourMode> = new Set([
  NeighbourMode.Hex6,
  NeighbourMode.Hex4,
  NeighbourMode.ThreeD,
]);

/** True when this neighbour mode offsets odd columns by half a cell. */
export function isHexMode(mode: NeighbourMode): boolean {
  return HEX_MODES.has(mode);
}

/**
 * The board's hex geometry: whether the columns are offset at all, and which way
 * the offset alternates.
 *
 * Kept apart from the neighbour *mode* on purpose. `LevelDaten::ladLevel` decides
 * `mSechseck` from the level-wide `neighbours` alone, and `getHexShift` reads
 * `mSechseck` and `hexflip`. A kind may set its own `neighbours` - that changes
 * which cells count as connected and nothing else - so a kind using hex six in a
 * rectangular board still gets the *unshifted* offsets and draws square. Reading
 * the mode where the geometry belongs is the mistake this type exists to prevent.
 */
export interface HexGeometry {
  /** False unless the level-wide mode is one of the three hex modes. */
  readonly enabled: boolean;
  /** `hexflip`, 0 to 3. Bit 0 is the left player's columns, bit 1 the right's. */
  readonly flip: number;
}

/** A rectangular board: no column is ever offset. */
export const NO_HEX: HexGeometry = { enabled: false, flip: 0 };

/** The geometry a level-wide `neighbours` and `hexflip` imply. */
export function hexGeometry(mode: number, flip = 0): HexGeometry {
  return { enabled: isHexMode(mode as NeighbourMode), flip };
}

/**
 * True when column `x` of `right` is drawn half a cell lower.
 *
 * `LevelDaten::getHexShift`, transcribed. The offset alternates with the column
 * parity, and which parity is offset depends on `hexflip` *and* on which player's
 * side the column is on - in a two-player game the two halves of the board can be
 * flipped independently, which is why `hexflip` has four values and not two.
 */
export function columnShift(hex: HexGeometry, right: boolean, x: number): boolean {
  if (!hex.enabled) return false;
  // `x & 1` is 0 or 1, and C++ promotes the bool `flip` to 0 or 1 the same way,
  // so the comparison is against a number rather than a boolean.
  const flip = right ? (hex.flip & 2) !== 0 : (hex.flip & 1) !== 0;
  return (x & 1) !== (flip ? 1 : 0);
}

export interface Offset {
  readonly dx: number;
  readonly dy: number;
}

/**
 * Cell offsets that count as neighbours, in each mode.
 *
 * Transcribed from `src/nachbariterator.cpp:NachbarIterator::setXY`, where
 * offsets are written as digit characters offset by `'2'`, so `'0'`-`'4'` mean
 * -2..+2.
 *
 * Hex modes use one offset table per column parity, because a shifted column's
 * true hex neighbours are the grid-diagonals rather than the grid-orthogonals.
 */
const RECT: readonly Offset[] = [
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
];

const DIAGONAL: readonly Offset[] = [
  { dx: -1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 1 },
];

const HORIZONTAL: readonly Offset[] = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

const VERTICAL: readonly Offset[] = [
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const EIGHT: readonly Offset[] = [...RECT, ...DIAGONAL];

const KNIGHT: readonly Offset[] = [
  { dx: -2, dy: -1 },
  { dx: -2, dy: 1 },
  { dx: -1, dy: 2 },
  { dx: 1, dy: 2 },
  { dx: 2, dy: 1 },
  { dx: 2, dy: -1 },
  { dx: 1, dy: -2 },
  { dx: -1, dy: -2 },
];

// "221133" / "131212" for a shifted column, "132323" for an unshifted one.
const HEX6_SHIFTED: readonly Offset[] = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
];

const HEX6_UNSHIFTED: readonly Offset[] = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
];

// "1133" / "1212" shifted, "2323" unshifted. Note the shifted row uses dy -1
// and 0, and the unshifted row 0 and +1: in the half-cell-offset geometry those
// are the four hex diagonals.
const HEX4_SHIFTED: readonly Offset[] = [
  { dx: -1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
];

const HEX4_UNSHIFTED: readonly Offset[] = [
  { dx: -1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
];

/**
 * The neighbour offsets for `mode` at column `x`.
 *
 * `hex` is the *board's* geometry, not the mode's, because
 * `NachbarIterator::setXY` picks the shifted or unshifted digit row with
 * `ld->getHexShift(...)` and takes the mode from the blob's own kind. In a
 * rectangular board a kind that asks for hex six therefore gets hex six's
 * offsets laid out on a square grid - which is what upstream does, and is why
 * `3d.ld`'s per-kind hex modes work on a board that is not itself hex.
 *
 * `ThreeD` is not implemented and falls back to no neighbours; only `3d.ld`
 * uses it, and that level is not yet ported.
 */
export function neighbourOffsets(
  mode: NeighbourMode,
  x: number,
  hex: HexGeometry = NO_HEX,
): readonly Offset[] {
  switch (mode) {
    case NeighbourMode.Rect:
      return RECT;
    case NeighbourMode.Diagonal:
      return DIAGONAL;
    case NeighbourMode.Hex6:
      return columnShift(hex, false, x) ? HEX6_SHIFTED : HEX6_UNSHIFTED;
    case NeighbourMode.Hex4:
      return columnShift(hex, false, x) ? HEX4_SHIFTED : HEX4_UNSHIFTED;
    case NeighbourMode.Knight:
      return KNIGHT;
    case NeighbourMode.Eight:
      return EIGHT;
    case NeighbourMode.Horizontal:
      return HORIZONTAL;
    case NeighbourMode.Vertical:
      return VERTICAL;
    case NeighbourMode.None:
    case NeighbourMode.ThreeD:
      return [];
  }
}
