// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The compile-time constant tables: quarter selectors, kind names, `DIR_*`, behaviour bits
 * and neighbour modes.
 *
 * Task 4.6. Upstream keeps these as two parallel arrays in `knoten.cpp` — `const_namen[]` and
 * `const_werte[]` — indexed by `#define const_anz (21+5+2*9+6+nachbarschaft_letzte+1)`. Two
 * arrays means every value has a positional relationship to a name, and a row inserted in one
 * and not the other silently shifts everything after it. Here a name and its value are one
 * object, so that failure is a type error rather than a wrong answer.
 *
 * The values themselves are `#define`s in four other headers — `viertel_alle` in bilddatei.h,
 * the `platzt_*` and `berechne_*` bits in blop.h, the `nachbarschaft_*` in sorte.h, the
 * `blopart_*` in sorte.h — and each is quoted at its definition here with the file it came
 * from. The test asserts the *numbers*, because a transcription that cites its source and
 * still has the wrong number is the failure this file exists to make visible.
 *
 * ## Resolution order
 *
 * A bare word in Cual is not looked up here first. `ausdruck: variable` resolves through
 * `getVerwandten(name, version, false)`, which finds user declarations; only if that finds
 * nothing is a constant substituted (`if ($1->istKonstante()) $$ = newCode1(zahl_acode, ...)`).
 * So a caller checks its variables first and asks {@link resolveConstant} second — and a level
 * that declares `var DIR_U` shadows the built-in, which upstream allows too.
 */

/** Which table a name came from, for error messages and for the tests. */
export type ConstantGroup =
  | "quarter"
  | "kind"
  | "direction"
  | "behaviour"
  | "neighbours";

export interface CualConstant {
  readonly name: string;
  readonly value: number;
  readonly group: ConstantGroup;
}

/* --- viertel_alle, bilddatei.h:38. `viertel_alle` is -1; the sixteen quarters are the
   two-bit row-major index, so Q_TL is 0 and Q_BR is 15. --- */
const QUARTERS: readonly CualConstant[] = [
  { name: "Q_ALL", value: -1, group: "quarter" },
  { name: "Q_TL", value: 0, group: "quarter" },
  { name: "Q_TR", value: 5, group: "quarter" },
  { name: "Q_BL", value: 10, group: "quarter" },
  { name: "Q_BR", value: 15, group: "quarter" },
  { name: "Q_TL_TL", value: 0, group: "quarter" },
  { name: "Q_TR_TL", value: 1, group: "quarter" },
  { name: "Q_BL_TL", value: 2, group: "quarter" },
  { name: "Q_BR_TL", value: 3, group: "quarter" },
  { name: "Q_TL_TR", value: 4, group: "quarter" },
  { name: "Q_TR_TR", value: 5, group: "quarter" },
  { name: "Q_BL_TR", value: 6, group: "quarter" },
  { name: "Q_BR_TR", value: 7, group: "quarter" },
  { name: "Q_TL_BL", value: 8, group: "quarter" },
  { name: "Q_TR_BL", value: 9, group: "quarter" },
  { name: "Q_BL_BL", value: 10, group: "quarter" },
  { name: "Q_BR_BL", value: 11, group: "quarter" },
  { name: "Q_TL_BR", value: 12, group: "quarter" },
  { name: "Q_TR_BR", value: 13, group: "quarter" },
  { name: "Q_BL_BR", value: 14, group: "quarter" },
  { name: "Q_BR_BR", value: 15, group: "quarter" },
];

/* --- sorte.h:84-99. `blopart_keins` is -1 and is also `blopart_min_cual`, the last kind Cual
   may name; `blopart_ausserhalb` is -5, a return value for off-board coordinates;
   `blopart_farbe` is -6. --- */
const KINDS: readonly CualConstant[] = [
  { name: "nothing", value: -1, group: "kind" },
  { name: "outside", value: -5, group: "kind" },
  { name: "global", value: -2, group: "kind" },
  { name: "semiglobal", value: -3, group: "kind" },
  { name: "info", value: -4, group: "kind" },
];

/**
 * The eighteen direction masks for `inhibit`.
 *
 * Nine low bits and nine high ones, and the *order of the names* is not the order of the
 * values: `DIR_U` is `0x00000001` and `DIR_B` is `0x00000080`, then `DIR_DDR` restarts at
 * `0x00010000`. The comment above the table in knoten.cpp is a grid of letters `A`…`I` by `1`
 * and `0`, which is how the two groups line up. Transcribed in name order with the value
 * beside it, because getting the order wrong gives a plausible-looking mask that inhibits the
 * wrong side.
 */
const DIRECTIONS: readonly CualConstant[] = [
  { name: "DIR_U", value: 0x00000001, group: "direction" },
  { name: "DIR_UR", value: 0x00000002, group: "direction" },
  { name: "DIR_R", value: 0x00000004, group: "direction" },
  { name: "DIR_DR", value: 0x00000008, group: "direction" },
  { name: "DIR_UUL", value: 0x00000010, group: "direction" },
  { name: "DIR_UUR", value: 0x00000020, group: "direction" },
  { name: "DIR_RRU", value: 0x00000040, group: "direction" },
  { name: "DIR_RRD", value: 0x00000080, group: "direction" },
  { name: "DIR_F", value: 0x00000100, group: "direction" },
  { name: "DIR_D", value: 0x00010000, group: "direction" },
  { name: "DIR_DL", value: 0x00020000, group: "direction" },
  { name: "DIR_L", value: 0x00040000, group: "direction" },
  { name: "DIR_UL", value: 0x00080000, group: "direction" },
  { name: "DIR_DDR", value: 0x00100000, group: "direction" },
  { name: "DIR_DDL", value: 0x00200000, group: "direction" },
  { name: "DIR_LLD", value: 0x00400000, group: "direction" },
  { name: "DIR_LLU", value: 0x00800000, group: "direction" },
  { name: "DIR_B", value: 0x01000000, group: "direction" },
];

/* --- blop.h:95-100. `spezvar_verhalten` is a bit field, so these are single bits and
   combine with `.+`. --- */
const BEHAVIOURS: readonly CualConstant[] = [
  { name: "explodes_on_size", value: 1, group: "behaviour" },
  { name: "explodes_on_explosion", value: 2, group: "behaviour" },
  { name: "explodes_on_chain_reaction", value: 4, group: "behaviour" },
  { name: "calculate_size", value: 8, group: "behaviour" },
  { name: "goalblob", value: 16, group: "behaviour" },
  { name: "floats", value: 32, group: "behaviour" },
];

/**
 * The ten neighbour modes, sorte.h:49-59.
 *
 * Two of the *names* do not match their `nachbarschaft_*` macro: Cual says
 * `neighbours_eight` where the macro is `nachbarschaft_dame` (5), and `neighbours_none` where
 * it is `nachbarschaft_garnichts` (7). Kept as the names Cual writes, with the macro named —
 * "dame" is chess for queen and eight is its neighbours, and "garnichts" is nothing.
 *
 * `nachbarschaft_letzte` is 9, which is `nachbarschaft_vertical`'s value; that is why
 * `const_anz` counts ten of them and not nine.
 */
const NEIGHBOURS: readonly CualConstant[] = [
  { name: "neighbours_rect", value: 0, group: "neighbours" },
  { name: "neighbours_diagonal", value: 1, group: "neighbours" },
  { name: "neighbours_hex6", value: 2, group: "neighbours" },
  { name: "neighbours_hex4", value: 3, group: "neighbours" },
  { name: "neighbours_knight", value: 4, group: "neighbours" },
  { name: "neighbours_eight", value: 5, group: "neighbours" },
  { name: "neighbours_3D", value: 6, group: "neighbours" },
  { name: "neighbours_none", value: 7, group: "neighbours" },
  { name: "neighbours_horizontal", value: 8, group: "neighbours" },
  { name: "neighbours_vertical", value: 9, group: "neighbours" },
];

/**
 * All of them, in `const_namen` order.
 *
 * `#define const_anz (21 + 5 + 2*9 + 6 + nachbarschaft_letzte + 1)` = 60, and the order is
 * quarters, kinds, directions, behaviours, neighbours — the same as upstream's two arrays.
 */
export const CUAL_CONSTANTS: readonly CualConstant[] = [
  ...QUARTERS,
  ...KINDS,
  ...DIRECTIONS,
  ...BEHAVIOURS,
  ...NEIGHBOURS,
];

/** `const_anz`. */
export const CUAL_CONSTANT_COUNT = 60;

const BY_NAME: ReadonlyMap<string, CualConstant> = new Map(
  CUAL_CONSTANTS.map((constant) => [constant.name, constant]),
);

/** The value of a name, or null if it is not one of the compile-time constants. */
export function resolveConstant(name: string): number | null {
  return BY_NAME.get(name)?.value ?? null;
}

/** The whole entry for a name, or null. Useful when a caller wants the group. */
export function lookupConstant(name: string): CualConstant | null {
  return BY_NAME.get(name) ?? null;
}

/**
 * `blopart_min_cual`, the last kind Cual may name.
 *
 * Upstream range-checks a `kind` assignment against `[blopart_min_cual, ld->mAnzFarben)`.
 * Being separate from the table is deliberate: it is a bound, not a name, and it is why
 * `outside` (-5) is not assignable while `nothing` (-1) is.
 */
export const BLOPART_MIN_CUAL = -1;

/** `blopart_min_sorte`: the last kind with a real `Sorte` and real blobs behind it. */
export const BLOPART_MIN_SORTE = -4;

/** `blopart_farbe`: what `getArt()` returns for a colour blob. */
export const BLOPART_FARBE = -6;
