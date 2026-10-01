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
}

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
