// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * What the game knows about a level without having loaded it.
 *
 * The catalogue has to list 79 levels, and loading every one to render a menu would
 * mean 79 parses before the player has chosen anything. So the build emits an index:
 * enough to draw a list, sort it, and show a description - and nothing that would
 * have to be kept in step with the level file.
 *
 * The division matters. Everything here is either in `summary.ld` or *resolved* from
 * the level file once at build time. Nothing is copied and re-derived later, so a
 * change to a level's `numexplode` cannot leave a stale number in the index: the next
 * build recomputes it, and `check-level-index` fails if the committed file disagrees.
 */

import type { KindRole } from "./level-data.ts";

/** A track, as `summary.ld` names them. */
export type Track =
  /** `all`: everything playable, in playing order. */
  | "all"
  /** `main`: the Standard track. */
  | "main"
  /** `weird`, `contrib`, `game`, `extreme`, `nofx`. */
  | "weird"
  | "contrib"
  | "game"
  | "extreme"
  | "nofx";

/** A difficulty variant, as the third component of a version. */
export type Difficulty = "easy" | "normal" | "hard";

/**
 * The order difficulties are offered in.
 *
 * `normal` is not a name upstream uses - it is the version with no difficulty
 * component - so it needs a name here to live in a record beside the other two.
 */
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];

/** One difficulty, as the player reads it. */
export interface DescribedDifficulty {
  /** The word on the button. Capitalised, because it starts one. */
  readonly name: string;
  /**
   * A sentence saying what picking this one does.
   *
   * **Not** a promise that the level gets easier or harder, because that is the level author's
   * decision and not ours. 6.3 measured all 108 difficulty variants in the corpus:
   *
   * | field        | variants that change it |
   * | ------------ | ----------------------: |
   * | `numExplode` |                      15 |
   * | `startRows`  |                       7 |
   * | `kinds`      |                       6 |
   * | `chainGrass` |                       3 |
   * | `topTime`    |                       0 |
   * | `neighbours` |                       0 |
   *
   * Every one of the fifteen `numExplode` changes but one is an `easy` one, and every one of
   * those *lowers* the threshold — a bigger group before it detonates, which is the gentler
   * direction. `hard` changes anything at all in only **7 of its 44** variants, and only two of
   * those touch `numexplode`; the rest change the start layout or the kind count. And **no level
   * anywhere varies the chase border's rate or its connection mode by difficulty**, which is worth
   * knowing because it is the obvious thing to assume.
   *
   * So a difficulty is *a different set of numbers the author wrote*, usually the same level with
   * the thresholds moved, and the descriptions say that rather than something the corpus does not
   * support.
   */
  readonly description: string;
}

/** The three difficulties, as the player reads them. */
export const DESCRIBED_DIFFICULTIES: Readonly<Record<Difficulty, DescribedDifficulty>> = {
  easy: {
    name: "Easy",
    description:
      "The author's gentler numbers. Usually a bigger group before it detonates, so a mistake " +
      "has more room to be walked back out of.",
  },
  normal: {
    name: "Normal",
    description: "The level as its author wrote it, with no difficulty qualifier.",
  },
  hard: {
    name: "Hard",
    description:
      "The author's tougher numbers, where they wrote any. Most hard variants change the start " +
      "layout or the kinds rather than the explosion size.",
  },
};

/**
 * One difficulty's described form.
 *
 * A lookup rather than an `at(0)` because `Difficulty` is a closed union, so there is no
 * "not one of the three" case to handle — and a function that cannot be handed a bad name
 * cannot be asked to invent one.
 */
export function describeDifficulty(difficulty: Difficulty): DescribedDifficulty {
  return DESCRIBED_DIFFICULTIES[difficulty];
}

/** One difficulty's resolved rules for a level. */
export interface DifficultyEntry {
  readonly difficulty: Difficulty;
  /**
   * The resolved version's display string, e.g. `[1,main,hard]`.
   *
   * Kept so a report can name exactly which definition produced these numbers, and so
   * the runtime can resolve the same version rather than approximately it.
   */
  readonly version: string;
  /**
   * The track this difficulty was compiled at.
   *
   * Recorded because a level can offer a difficulty on one track and not another, and
   * because a level in several tracks is compiled at whichever offers the difficulty
   * first. So the version alone is not enough to reproduce it: a level on `weird` and
   * `main` that offers `hard` only on `weird` resolves to `[1,hard,weird]`, and asking
   * the loader for `main,hard` would be a different level - one the index never
   * described. Without this the catalogue would advertise a version it could not ask
   * for.
   */
  readonly track: Track;
  /**
   * The `numexplode` the level's ordinary colour kinds detonate at, or null when the
   * level sets none and its kinds never detonate on size.
   *
   * The *largest*, matching what the layout builder and the rules panel use. A level
   * where kinds detonate at different sizes (`rollenspiel.ld` has five) has no single
   * number for the player, and this is the one the menu shows; the per-kind values are
   * in the level file.
   */
  readonly numExplode: number | null;
  /** Whether goal blobs need an explosion next to them rather than their own group. */
  readonly chainGrass: boolean;
  /** The chase border's steps-per-row, which decides how long a level lasts. */
  readonly topTime: number;
  /** The neighbour mode, kept for the catalogue's own hint text. */
  readonly neighbours: number;
  /** How many kinds the level has, including greys and goals. */
  readonly kinds: number;
  /** How many rows of `startdist` the level declares. */
  readonly startRows: number;
  /**
   * The level's start layout, resolved, so the catalogue can show it.
   *
   * **This is one legal start, not the next one.** A `startdist` cell can be a pool
   * draw rather than a named kind, and the loader resolves those against a PRNG seeded
   * from `Date.now()` — on purpose, so that a restart is not the board the player has
   * already seen. Across the corpus 6.6% of cells are draws and 88 of 187 compiled
   * difficulty rows contain no named kind at all, so no tile could equal the board a
   * card actually opens. What this *is* guaranteed to be: the exact background, and the
   * exact arrangement and colours of every cell the level fixes. The drawn cells are one
   * of the draws the level permits. See `TILE_REFERENCE_SEED`.
   */
  readonly tile: LevelTile;
}

/**
 * A resolved start layout, as the catalogue's tile draws it.
 *
 * **No marker.** The real board marks a goal blob with a dot and a grey with a square,
 * at `MARKER_RADIUS` = 0.075 of a cell. A catalogue tile's cell is about four pixels, so
 * that marker would be 0.3 pixels across — invisible. So the tile does not carry one:
 * a field nothing can render is a field that will be read as "the tile distinguishes
 * goals" when it does not. The tile's goal/ordinary distinction is the goal *colour*,
 * which is a constant across levels by construction and so is recognisable anyway.
 */
export interface LevelTile {
  /** The board's background, from the level's `bgcolor`, as CSS. */
  readonly background: string;
  /**
   * The cells that are *not* empty, as two parallel arrays: `at[i]` is the cell index
   * and `kind[i]` the index into the level's kind table.
   *
   * Sparse rather than a full 200-cell grid because 88.3% of the corpus's cells are
   * empty — a dense grid would be mostly the encoding of its own absences, in a file
   * every catalogue view pays to download. Row-major, top row first: `at` is
   * `row * GRX + column`.
   */
  readonly at: readonly number[];
  readonly kind: readonly number[];
  /**
   * Which entry of the index's shared {@link LevelIndex.palettes} this tile's kinds are
   * coloured by, indexed by kind constant.
   *
   * A reference rather than a copy, and it has to be: the palette is the bulk of the
   * file. Inlined per difficulty it came to 95 kB of the index's 234 kB, because 187
   * difficulty rows share only **40** distinct palettes — every level with the same kind
   * roles on the same background lands on the same colours. Deduplicated, the same
   * palettes cost 21 kB.
   */
  readonly palette: number;
}

/**
 * The seed the level index resolves `startdist` pool draws against.
 *
 * A fixed number, and that is the point: a tile has to be the *same* tile on every
 * visit and in every build, or the catalogue would show a different board each time it
 * opened and there would be nothing to verify. It is not the seed the game plays with —
 * `app/levels.ts` uses `Date.now()` deliberately, so a restart differs — and this number
 * must not become that one. Changing it changes every tile, which is a reviewable diff
 * rather than a silent change.
 */
export const TILE_REFERENCE_SEED = 0x6375796f;

/** One level, as the catalogue needs it. */
export interface LevelIndexEntry {
  /**
   * The definition name, which is the stable identity: `summary.ld` refers to levels
   * by it, and it does not change when the file is renamed or the display name is
   * reworded.
   */
  readonly id: string;
  /** The file to fetch when the level is chosen. */
  readonly filename: string;
  /** The display name, e.g. `Noseballs`. */
  readonly name: string;
  /** The author, or "" when the level declares none. */
  readonly author: string;
  /** The description, or "" when the level declares none. */
  readonly description: string;
  /**
   * Which tracks this level is in, and where it sits in each.
   *
   * A map from track to position rather than a list, because `summary.ld` orders the
   * same level differently per track and a single list could not express that. A
   * position of 0 is a real position; absence from the map means "not in this track".
   */
  readonly tracks: ReadonlyMap<Track, number>;
  /** Whether `summary.ld` marks this track unordered. */
  readonly ordered: ReadonlyMap<Track, boolean>;
  /** Resolved rules per difficulty. Always has at least `normal`. */
  readonly difficulties: ReadonlyMap<Difficulty, DifficultyEntry>;
  /** The kinds that are goals, for the catalogue's marker. */
  readonly goalKinds: readonly string[];
  /** The count of grey kinds, for the catalogue's marker. */
  readonly greyKinds: number;
  /**
   * Whether this engine can actually play the level, at every difficulty it offers.
   *
   * False only when a difficulty asks for a neighbour mode that is not implemented -
   * `DreiD` and `ThreeD`. Such a level is still listed, because it exists and hiding
   * it would be a silent omission, but it must not be offered as playable: the mode
   * falls back to *no* neighbours, so nothing could ever connect and the level could
   * not be won. Discovering that after a minute of play is worse than being told.
   */
  readonly supported: boolean;
  /** Why it is unsupported, when it is. Empty when it is supported. */
  readonly unsupportedReason: string;
}

/** The whole catalogue. */
export interface LevelIndex {
  readonly levels: readonly LevelIndexEntry[];
  /** Levels by id, for a lookup when a level is chosen. */
  readonly byId: ReadonlyMap<string, LevelIndexEntry>;
  /** The tracks present, in the order `summary.ld` declares them. */
  readonly tracks: readonly Track[];
  /**
   * How many levels `summary.ld` lists in each track's own `level[track]`.
   *
   * Distinct from how many are reachable on a track, because a level can appear only
   * in a difficulty list: `level[main]` names 48, and twelve more exist on the main
   * track solely through `level[main,easy]` and `level[main,hard]`, so 60 are
   * reachable. The authored count is the number a reader can check against the file,
   * and it is the one the plan cites for the Standard track.
   */
  readonly authoredCounts: ReadonlyMap<Track, number>;
  /**
   * Every distinct kind palette the catalogue's tiles need, one `|`-joined colour string
   * per palette, indexed by kind constant within it.
   *
   * Shared rather than per level because 187 compiled difficulty rows use only 40 of
   * them, and the index is downloaded before a single tile is drawn. See
   * {@link LevelTile.palette}.
   */
  readonly palettes: readonly string[];
}

/** Every track named by an index, for the catalogue's filter row. */
export function indexTracks(index: LevelIndex): readonly Track[] {
  return index.tracks;
}

/** Levels in one track, in `summary.ld`'s order. */
export function levelsInTrack(
  index: LevelIndex,
  track: Track,
): LevelIndexEntry[] {
  return index.levels
    .filter((l) => l.tracks.has(track))
    .sort((a, b) => (a.tracks.get(track) ?? 0) - (b.tracks.get(track) ?? 0));
}

/** The first track a level belongs to, for a level opened without one. */
export function primaryTrack(entry: LevelIndexEntry): Track {
  for (const track of [
    "all",
    "main",
    "weird",
    "contrib",
    "game",
    "extreme",
    "nofx",
  ]) {
    if (entry.tracks.has(track as Track)) return track as Track;
  }
  return "all";
}

/** Whether a level's goal blobs need an explosion beside them, at `difficulty`. */
export function needsChainAt(
  entry: LevelIndexEntry,
  difficulty: Difficulty = "normal",
): boolean {
  return entry.difficulties.get(difficulty)?.chainGrass ?? false;
}

/** The threshold a level detonates at, or null when it never does. */
export function numExplodeAt(
  entry: LevelIndexEntry,
  difficulty: Difficulty = "normal",
): number | null {
  return entry.difficulties.get(difficulty)?.numExplode ?? null;
}

/** The goal kinds' names, for the catalogue's swatch legend. */
export function goalNames(entry: LevelIndexEntry): readonly string[] {
  return entry.goalKinds;
}

/** The kind roles the catalogue marks, as a plain object for a component. */
export interface LevelMarkers {
  readonly hasGoals: boolean;
  readonly hasGreys: boolean;
}

export function levelMarkers(entry: LevelIndexEntry): LevelMarkers {
  return {
    hasGoals: entry.goalKinds.length > 0,
    hasGreys: entry.greyKinds > 0,
  };
}

/** Re-exported so a caller need not import two modules for one level's kinds. */
export type { KindRole };
