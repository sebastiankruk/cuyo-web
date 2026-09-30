/**
 * The names every `.ld` file may use, and the values they stand for.
 *
 * `DefKnoten::speicherGlobaleVordefinierte` inserts all of these into the *root*
 * node's children before a single line of the level data is read, so they are
 * ordinary unqualified definitions as far as `<...>` arithmetic is concerned -
 * which is how `aliens.ld` can write `neighbours = <neighbours_none>` inside a
 * kind's own section, where nothing else is in scope, and how `3d.ld` writes
 * `pics = Quadrat, Dreieck, ...` with `neighbours = <neighbours_hex6>` at the
 * level's top.
 *
 * They are not in `globals.ld`; a level file that omits one of these names is
 * relying on the engine having defined it. That is also why this table is
 * transcribed here rather than read from the corpus: it is engine-provided, and
 * the corpus test that builds every real level's kinds is what proves the table
 * is complete.
 *
 * Transcribed from `src/knoten.cpp`'s `const_namen` / `const_werte`, with the
 * values they are built from named where they come from. Task 4.6 finishes the
 * job for Cual: it needs the same table plus the `DIR_*` direction constants,
 * which are here because `inhibit` in the level format is written with them.
 */

/** `src/bilddatei.h:viertel_alle` and the four quarters. */
export const Q_ALL = -1;
export const Q_TL = 0;
export const Q_TR = 5;
export const Q_BL = 10;
export const Q_BR = 15;

/** `src/sorte.h` and `src/bilddatei.h`: the blob kinds, which are negative. */
export const NOTHING = -1;
export const GLOBAL = -2;
export const SEMIGLOBAL = -3;
export const INFO = -4;
export const OUTSIDE = -5;

/** `src/sorte.h` neighbour modes, in enum order. */
export const NEIGHBOURS_RECT = 0;
export const NEIGHBOURS_DIAGONAL = 1;
export const NEIGHBOURS_HEX6 = 2;
export const NEIGHBOURS_HEX4 = 3;
export const NEIGHBOURS_KNIGHT = 4;
export const NEIGHBOURS_EIGHT = 5;
export const NEIGHBOURS_3D = 6;
export const NEIGHBOURS_NONE = 7;
export const NEIGHBOURS_HORIZONTAL = 8;
export const NEIGHBOURS_VERTICAL = 9;

/** `src/blop.h`: the behaviour bits, in the order `const_werte` lists them. */
export const EXPLODES_ON_SIZE = 1;
export const EXPLODES_ON_EXPLOSION = 2;
export const EXPLODES_ON_CHAIN_REACTION = 4;
export const CALCULATE_SIZE = 8;
export const GOAL_BLOB = 16;
export const FLOATS = 32;

/**
 * The direction constants, for `inhibit`.
 *
 * `src/knoten.cpp` writes them out as hex, nine in the first row and nine in the
 * second. The gap between the rows is not a typo to be tidied: the first nine are
 * the eight compass directions plus a ninth, and the second nine are the
 * diagonals of the 3x3 neighbourhood around the cell.
 */
export const DIR = {
  U: 0x00000001,
  UR: 0x00000002,
  R: 0x00000004,
  DR: 0x00000008,
  UUL: 0x00000010,
  UUR: 0x00000020,
  RRU: 0x00000040,
  RRD: 0x00000080,
  F: 0x00000100,
  D: 0x00010000,
  DL: 0x00020000,
  L: 0x00040000,
  UL: 0x00080000,
  DDR: 0x00100000,
  DDL: 0x00200000,
  LLD: 0x00400000,
  LLU: 0x00800000,
  B: 0x01000000,
} as const;

/**
 * Every name a level file may use, as `src/knoten.cpp` lists them.
 *
 * Written as one table rather than as constants so that the Cual compiler and
 * this module cannot disagree about which names exist - a name missing here is a
 * name Cual would reject at compile time and the level format would reject at
 * load time, and neither is a good place to find out.
 */
export const CUAL_CONSTANTS: ReadonlyMap<string, number> = new Map([
  // Viertelstueckchen.
  ["Q_ALL", Q_ALL],
  ["Q_TL", Q_TL],
  ["Q_TR", Q_TR],
  ["Q_BL", Q_BL],
  ["Q_BR", Q_BR],
  // The sixteen sub-quarters, named by which larger quarter they sit in and then
  // by their own order within it: Q_TL_TL, Q_TL_TR, Q_TL_BL, Q_TL_BR, then the
  // same four for each of TR, BL and BR.
  ["Q_TL_TL", 0],
  ["Q_TR_TL", 1],
  ["Q_BL_TL", 2],
  ["Q_BR_TL", 3],
  ["Q_TL_TR", 4],
  ["Q_TR_TR", 5],
  ["Q_BL_TR", 6],
  ["Q_BR_TR", 7],
  ["Q_TL_BL", 8],
  ["Q_TR_BL", 9],
  ["Q_BL_BL", 10],
  ["Q_BR_BL", 11],
  ["Q_TL_BR", 12],
  ["Q_TR_BR", 13],
  ["Q_BL_BR", 14],
  ["Q_BR_BR", 15],

  // Sortennamen.
  ["nothing", NOTHING],
  ["outside", OUTSIDE],
  ["global", GLOBAL],
  ["semiglobal", SEMIGLOBAL],
  ["info", INFO],

  // Richtungskonstanten fuer inhibit.
  ...Object.entries(DIR),

  // Bits fuer spezvar_verhalten.
  ["explodes_on_size", EXPLODES_ON_SIZE],
  ["explodes_on_explosion", EXPLODES_ON_EXPLOSION],
  ["explodes_on_chain_reaction", EXPLODES_ON_CHAIN_REACTION],
  ["calculate_size", CALCULATE_SIZE],
  ["goalblob", GOAL_BLOB],
  ["floats", FLOATS],

  // Nachbarschaften, in `sorte.h`'s enum order.
  ["neighbours_rect", NEIGHBOURS_RECT],
  ["neighbours_diagonal", NEIGHBOURS_DIAGONAL],
  ["neighbours_hex6", NEIGHBOURS_HEX6],
  ["neighbours_hex4", NEIGHBOURS_HEX4],
  ["neighbours_knight", NEIGHBOURS_KNIGHT],
  ["neighbours_eight", NEIGHBOURS_EIGHT],
  ["neighbours_3D", NEIGHBOURS_3D],
  ["neighbours_none", NEIGHBOURS_NONE],
  ["neighbours_horizontal", NEIGHBOURS_HORIZONTAL],
  ["neighbours_vertical", NEIGHBOURS_VERTICAL],
]);

/**
 * Seeds a root scope with the predefined names.
 *
 * Upstream does this in the root node's constructor, so the names are in scope
 * for every section of every level and every `<...>` expression in every file.
 * They are inserted unqualified - `vallg`, the empty version - which is what
 * makes them apply to every version of the game.
 *
 * The first argument is a `define` callback rather than a `DefinitionScope` so
 * that this module stays independent of the scope's own module, which would
 * otherwise be a cycle.
 */
export function definePredefined(define: (name: string, value: number) => void): void {
  for (const [name, value] of CUAL_CONSTANTS) define(name, value);
}
