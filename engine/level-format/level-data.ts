/**
 * The resolved shape of a playable level.
 *
 * This is the structure the `.ld` parser (task 2.2 onwards) will produce and the
 * structure `engine/game-core` consumes. Defining it now, with hand-written
 * fixtures, means the parser has a target to satisfy rather than the two halves
 * inventing their own shapes. Nothing here is `.ld`-specific: no names, no
 * versions, no text.
 */

import { NeighbourMode } from "../game-core/constants.ts";

/** What role a kind plays, which fixes its default behaviour. */
export type KindRole = "empty" | "colour" | "grey" | "grass";

/**
 * A blob kind: one row of the `pics` list, or a `greypic`/`startpic` entry.
 *
 * `artKey` is the logical art key resolved from the manifest, never a file
 * path. The engine only ever passes it through to the renderer.
 */
export interface Kind {
  /** Position of this kind in the level's constant ordering. */
  readonly id: number;
  /** Name as written in the level file, without any extension. */
  readonly name: string;
  readonly role: KindRole;
  /** Logical art key; may be empty for a kind that draws nothing. */
  readonly artKey: string;
  /** Number of distinct appearances, chosen at random as `version`. */
  readonly versions: number;
  /** Contribution to component size. */
  readonly weight: number;
  /** Bit field of the behaviour constants. */
  readonly behaviour: number;
  /** Component size at which this kind explodes. */
  readonly numexplode: number;
  /** Weight used when a falling piece is chosen, or 0 if it never is. */
  readonly colourProb: number;
  /** Weight used when a grey blob is chosen, or 0 if it never is. */
  readonly greyProb: number;
  /** Weight used when a goal blob is chosen, or 0 if it never is. */
  readonly goalProb: number;
  /** `startdist` key letter for this kind, if it has one. */
  readonly distKey: string | null;
  /**
   * The default draw code this kind falls back to, or null when it has none.
   *
   * `src/sorte.cpp:98-131`. A kind's draw code is the procedure *named after the kind*, and a
   * kind that defines none runs a default chosen by how many picture files it has and how many
   * icons are in the first — `default3` for more than one file, `default2` (or `default2g` for
   * grass) for a single multi-icon file, `default1` for a single single-icon one. `null` when
   * the kind has no pictures at all, which upstream also treats as drawing nothing, and which
   * the global and semiglobal blobs never get a default for.
   *
   * Recorded here rather than recomputed by the runtime because `kinds.ts` is where the picture
   * list is read: it kept `pics`' first entry as `artKey` and discarded the rest, which is why
   * the file count was unavailable and this had to be settled at the point it is still in hand.
   */
  readonly defaultCode: string | null;
}

/** One cell of a `startdist` row. */
export interface StartCell {
  readonly kind: number;
  readonly version: number;
}

/** A `startdist` row; `null` is an empty cell. */
export type StartRow = readonly (StartCell | null)[];

export interface LevelColours {
  readonly background: string;
  readonly text: string;
  readonly top: string;
}

export interface LevelDef {
  /** Internal name, the section name in the `.ld` file. */
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly description: string;

  readonly kinds: readonly Kind[];
  /** Index of the kind used for empty cells. */
  readonly emptyKind: number;

  /** Board-wide neighbour mode; an individual kind may override it. */
  readonly neighbours: NeighbourMode;

  /** Goal blobs need a chain reaction to be destroyed. */
  readonly chainGrass: boolean;
  /** Border descent, in steps per pixel. */
  readonly topTime: number;
  /**
   * Pixels above the bottom where the chase border comes to rest.
   *
   * `.ld` entry `topstop`, default 0. The man page documents it as a number of
   * pixels rather than rows, which matters because the value is subtracted from a
   * pixel height. Only the time-bonus animation reads it, so it does not affect
   * play: it decides how much height is left to convert into points once the
   * level has been won.
   */
  readonly hetzrandStop: number;
  /** Expected steps between random grey blobs, or -1 for none. */
  readonly randomGreys: number;
  /** Probability weight that no grey blob appears at all. */
  readonly noGreyProb: number;
  /** New pieces start at a random column. */
  readonly randomFallPos: boolean;
  /** The level is drawn and played upside down. */
  readonly mirror: boolean;

  readonly colours: LevelColours;

  /**
   * Initial board, bottom-aligned and top row first.
   *
   * Each entry is either `null` for an empty cell or `{ kind, version }`.
   */
  readonly startDist: readonly StartRow[];
}

/** Per-kind neighbour override, kept out of `Kind` to avoid a cycle. */
export interface KindNeighbourOverride {
  readonly kind: number;
  readonly mode: NeighbourMode;
}

/** The neighbour mode in force for `kind`, honouring per-kind overrides. */
export function modeForKind(
  level: LevelDef,
  kind: number,
  overrides: readonly KindNeighbourOverride[],
): NeighbourMode {
  for (const o of overrides) if (o.kind === kind) return o.mode;
  return level.neighbours;
}

/**
 * Default behaviour for a kind with no explicit override.
 *
 * `src/sorte.cpp:Sorte::setzeDefaults`.
 */
export function defaultBehaviour(
  role: KindRole,
  chainGrass: boolean,
): number {
  // Imported lazily as literals to keep this module free of a constants import
  // cycle at load time.
  const EXPLODES_ON_EXPLOSION = 2;
  const EXPLODES_ON_CHAIN_REACTION = 4;
  const EXPLODES_ON_SIZE = 1;
  const CALCULATE_SIZE = 8;
  const GOAL_BLOB = 16;
  const FLOATS = 32;

  switch (role) {
    case "grass":
      return (
        EXPLODES_ON_CHAIN_REACTION +
        (chainGrass ? 0 : EXPLODES_ON_EXPLOSION) +
        GOAL_BLOB
      );
    case "grey":
      return EXPLODES_ON_CHAIN_REACTION + EXPLODES_ON_EXPLOSION;
    case "colour":
      return EXPLODES_ON_SIZE + CALCULATE_SIZE;
    case "empty":
      return FLOATS;
  }
}
