// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Board geometry, behaviour bits, neighbour modes and scoring constants.
 *
 * Task 12.2: the source-derived constants live in one documented module, and each value is
 * asserted against upstream here rather than left to a reader's trust. Provenance is carried
 * in the comments — file, line and upstream identifier — so a value and its source can be
 * diffed if upstream is ever re-read, and `engine/game-core/constants.test.ts` holds
 * the same transcription as assertions so a constant cannot drift from what was recorded.
 *
 * Every value below was checked against the upstream tree at
 * `3b1a2ce` (`.context/upstream-cuyo`, local and gitignored). All of them are correct.
 * **Two of the citations were not**, and are fixed below:
 *
 * | upstream | what it contributes | line |
 * | -------- | ------------------- | ---- |
 * | `src/layout.h`        | grid size and cell size                       | 44, 45, 47 |
 * | `src/ui.cpp`          | step duration, as a literal `80`             | 170 |
 * | `src/blop.h`          | the six `behaviour` bits                      | 95–100 |
 * | `src/leveldaten.h`    | score constants and the bonus speed           | 53–61 |
 * | `src/spielfeld.h`     | extra greys per chain reaction                | 37 |
 * | `src/spielfeld.cpp`   | spawn margin and chase-border pixel offset    | 45, 55 |
 * | `src/leveldaten.cpp`  | default `toptime`                             | 43 |
 * | `src/knoten.cpp`      | default `falling_speed`, `falling_fast_speed` | 56 |
 * | `src/sorte.h`         | neighbour mode numbers                        | 49–58 |
 * | `src/nachbariterator.cpp` | the offset tables per mode               | 46 |
 * | `src/leveldaten.cpp`  | `getHexShift`, the column-parity offset       | 806 |
 * | `src/bilddatei.cpp`   | `anzBildchen`, which sets the explosion length | 205 |
 *
 * Two of those rows are **not** where this file used to say they were. `GREYS_PER_CHAIN_REACTION`
 * is in `spielfeld.h`, not `spielfeld.cpp`. And `EXPLOSION_STEPS` is in neither: upstream has no
 * such constant at all, and the real derivation is written out at its definition below.
 *
 * ## `src/code.h` is named by task 12.2 and contributes no constant
 *
 * The third source 12.2 names is the one whose contribution is *not* a number. `code.h` holds
 * `divv` and `modd`, which are functions, so there is nothing for a constants module to hold.
 * They are transcribed in `engine/cual-runtime/divmod.ts`, which also records where the man
 * page and upstream disagree — `modd`'s fourth quadrant flips the quotient's sign, and
 * `cual.6` wins. The cross-check is exhaustive over the pair range that matters
 * (`|a| <= 60`, `1 <= |b| <= 15`), so the two files together cover all three sources 12.2
 * lists, and the honest statement is that `code.h`'s share is behaviour rather than value.
 */

/** `src/layout.h:44` `#define grx 10`. */
export const GRX = 10;
/** `src/layout.h:45` `#define gry 20`. */
export const GRY = 20;
/** `src/layout.h:47` `#define gric 32` — "Größe der Bildchen". */
export const GRIC = 32;

/**
 * One game step, in milliseconds.
 *
 * `src/ui.cpp:170`, `int zeit = SDL_GetTicks() + 80;` — a literal in the frame loop, not a
 * `#define`. The same 80 reappears at `ui.cpp:205` and `:215`, so the three are one value
 * written three times and this is the transcription of all three.
 */
export const STEP_MS = 80;

/**
 * Bits of the `behaviour` variable (`src/blop.h:95–100`), in upstream's order.
 *
 * Upstream's names say what they are for and are kept in the comments because the ported
 * names do not: `platzt_bei_gewicht` (explodes when its size changes) is `EXPLODES_ON_SIZE`,
 * `berechne_kettengroesse` (recalculate the chain-reaction size) is `CALCULATE_SIZE`, and
 * `verhindert_gewinnen` (prevents winning) is `GOAL_BLOB`.
 */
export const EXPLODES_ON_SIZE = 1;
export const EXPLODES_ON_EXPLOSION = 2;
export const EXPLODES_ON_CHAIN_REACTION = 4;
export const CALCULATE_SIZE = 8;
export const GOAL_BLOB = 16;
export const FLOATS = 32;

/** `src/leveldaten.h:53–61`: `punkte_fuer_*`, points awarded per event. */
export const POINTS_PER_NORMAL = 1;
export const POINTS_PER_GREY = 0;
export const POINTS_PER_GRASS = 20;
export const POINTS_PER_CHAIN_REACTION = 10;
export const POINTS_PER_TIME_BONUS = 10;

/**
 * Extra greys released per chain reaction.
 *
 * `src/spielfeld.h:37`, `#define graue_bei_kettenreaktion 5` — the **header**, not the `.cpp`.
 * It was cited as `spielfeld.cpp` until task 12.2 read the sources; the value was right and
 * only the pointer was wrong. Used at `spielfeld.cpp:988`, `if (mKettenreaktion) grz += …`.
 */
export const GREYS_PER_CHAIN_REACTION = 5;

/** `src/spielfeld.cpp:45`, `#define neues_fall_platz 5`; used at `spielfeld.cpp:1394`. */
export const NEW_FALL_MARGIN = 5;

/**
 * `src/spielfeld.cpp:55`, `#define hetzrand_dy_auftauch 8`; used at `spielfeld.cpp:1302` as
 * `(mHetzrandYPix + hetzrand_dy_auftauch) / gric`.
 */
export const GREY_SPAWN_OFFSET_PX = 8;

/**
 * `src/knoten.cpp:56` — `spezvar_default[11], [12]` read `6, gric`, for
 * `falling_speed` and `falling_fast_speed`. In px/step.
 */
export const FALLING_SPEED = 6;
export const FALLING_FAST_SPEED = GRIC;

/**
 * How far the chase border travels per time-bonus step.
 *
 * `src/leveldaten.h:59`, `#define bonus_geschwindigkeit 32`, i.e. one cell per step. Used at
 * `src/spielfeld.cpp:1227`.
 */
export const BONUS_SPEED = 32;

/**
 * `src/leveldaten.cpp:43`, `#define toptime_default 50`, read at `leveldaten.cpp:420` via
 * `getZahlEintragMitDefault("toptime", …)`. In steps per pixel of border travel.
 */
export const DEFAULT_TOPTIME = 50;

/**
 * Steps an exploding blob stays visible.
 *
 * **This one is not a constant in upstream, and it was cited as if it were.** It was
 * documented as "`src/spielfeld.cpp`: steps an exploding blob stays visible", and no such
 * constant exists in that file or anywhere else. The real mechanism is
 * `src/blop.cpp:347`:
 *
 *     if (mDaten[spezvar_am_platzen] > ld->mExplosionBild.anzBildchen()) { … }
 *
 * so the length is **the picture count of the level's own explosion image**, and
 * `src/bilddatei.cpp:205` computes that as
 *
 *     (mBreite / gric) * (mHoehe / gric)
 *
 * — the image is a grid of `gric`-sized frames. So the value is *derived*, and the two
 * things that could make it wrong are a different frame size or a different picture.
 *
 * Both are checked, and both hold. `mExplosionBild` is loaded from the level's
 * `explosionpic` word (`src/leveldaten.cpp:476`), defaulting to `explosion.xpm`, and two
 * corpus levels override it — `theater.ld:72` and `schemen.ld:37`, both to
 * `ithDreckExpl.xpm`. Both files are 128×64, and at `gric` 32 that is `(128/32) * (64/32)` =
 * **8 frames each**, so the one constant is right for all 79 levels by coincidence of two
 * same-sized files rather than by anything upstream guarantees.
 *
 * Upstream's own comment agrees with the number: `src/knoten.cpp:48–49` describes
 * `am_platzen` as "0 = nicht am platzen; sonst 1 - 8".
 *
 * `engine/game-core/constants.test.ts` asserts the arithmetic from the two image
 * dimensions rather than repeating the 8, so a change to either would be visible here rather
 * than waiting for a level to look wrong.
 */
export const EXPLOSION_STEPS = 8;

/**
 * Neighbour modes, in the order of upstream's `nachbarschaft_*` numbers.
 *
 * `src/sorte.h:49–58`. They are `#define`s rather than an `enum`, which is why the numbers
 * are load-bearing rather than incidental: a `.ld` writes the number directly. Upstream's
 * names are `normal, schraeg, 6, 6_schraeg, springer, dame, 6_3d, garnichts, horizontal,
 * vertical`; this module's names say what the modes are.
 *
 * `sorte.h:59` adds `#define nachbarschaft_letzte 9`, a **duplicate of `vertical`** and a
 * sentinel for iterating the enum rather than a twelfth mode. It has no entry here, which is
 * why {@link NeighbourMode} stops at `Vertical = 9`.
 */
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
 * `src/leveldaten.cpp:806`, `LevelDaten::getHexShift(bool rechts, int x)`, transcribed. The
 * offset alternates with the column parity, and which parity is offset depends on `hexflip`
 * *and* on which player's side the column is on - in a two-player game the two halves of the
 * board can be flipped independently, which is why `hexflip` has four values and not two.
 */
export function columnShift(
  hex: HexGeometry,
  right: boolean,
  x: number,
): boolean {
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
 * Transcribed from `src/nachbariterator.cpp:46`, `NachbarIterator::setXY`, where
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
/**
 * Whether this engine implements a neighbour mode.
 *
 * `neighbourOffsets` answers for every mode rather than refusing the unimplemented
 * ones, because a level that asks for an unknown mode should still render a board - but
 * `ThreeD` falls back to *no* neighbours, which means nothing can ever connect and the
 * level cannot be won. That is different from a mode that merely draws oddly, so it has
 * to be visible rather than merely handled.
 *
 * `DreiD` is the one level affected, and it is listed in the catalogue. Offering it as
 * playable would be a lie the player only discovers after a minute of play, so the
 * catalogue gates on this and says why.
 */
export function isImplementedNeighbourMode(mode: NeighbourMode): boolean {
  return mode !== NeighbourMode.ThreeD;
}

/** Why a mode is unavailable, for a diagnostic rather than a bare "no". */
export function unsupportedNeighbourReason(mode: NeighbourMode): string | null {
  if (isImplementedNeighbourMode(mode)) return null;
  return (
    `neighbours=${mode} needs a third board dimension, which this engine does not ` +
    `implement. The level is listed because it exists, but it cannot be played.`
  );
}

/*
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
