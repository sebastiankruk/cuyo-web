/**
 * What the player has finished, and what that lets them play next.
 *
 * Nothing here touches storage, the DOM or the clock. The whole module is pure
 * functions over a value, because a progress record that can only be tested by
 * opening a browser is a progress record that gets wrong: the interesting cases
 * are the ones the catalogue never produces on its own — a level that cannot be
 * played sitting in the middle of a track, an unordered track, a level in three
 * tracks at three different positions — and those are only reachable by calling
 * the functions directly.
 *
 * `app/progress-storage.ts` puts this on the device. Keeping the two apart is what
 * lets this file be plain Node, and it is also why the unlocking rules live with
 * the records rather than in the catalogue: an unlocked level is *derived* from
 * what has been completed, never stored, so it cannot go stale against a track
 * order that has since changed.
 */

import type { Difficulty, LevelIndex, LevelIndexEntry, Track } from "../level-format/index-data.ts";
import { levelsInTrack } from "../level-format/index-data.ts";

/** What is remembered about one level at one difficulty. */
export interface LevelRecord {
  /** Whether the level has been won at this difficulty, ever. */
  readonly completed: boolean;
  /**
   * The highest score from any completion, or null if never completed.
   *
   * Null rather than 0 because the two mean different things: "not played" and
   * "played and scored nothing". A score of 0 cannot happen in practice — winning
   * pays at least the time bonus — but collapsing the states would make a real zero
   * indistinguishable from an absent record, and the catalogue shows this number.
   */
  readonly bestScore: number | null;
}

/**
 * Every record, keyed by level id and difficulty.
 *
 * A flat map keyed by both rather than a nested one, because the persistence layer
 * has to write this as JSON and a two-level object of objects is more format to
 * keep stable than one string per entry. The key is built by `progressKey` and
 * nowhere else, so the separator cannot drift between the writer and the reader.
 */
export type Progress = ReadonlyMap<string, LevelRecord>;

/** The separator between id and difficulty in a progress key. */
const KEY_SEPARATOR = " ";

/** A record for a level that has not been completed. */
export const INCOMPLETE: LevelRecord = Object.freeze({
  completed: false,
  bestScore: null,
});

/** The key a record is stored under. Exported so persistence cannot invent one. */
export function progressKey(id: string, difficulty: Difficulty): string {
  return `${id}${KEY_SEPARATOR}${difficulty}`;
}

/** No progress at all: a player who has just installed the game. */
export function emptyProgress(): Progress {
  return new Map<string, LevelRecord>();
}

/**
 * The record for one level at one difficulty, or `INCOMPLETE`.
 *
 * Never null, so a caller showing a card cannot forget to handle the case where a
 * level has never been played. Forgetting it is how a level list crashes on the
 * first level of the first track.
 */
export function recordFor(
  progress: Progress,
  id: string,
  difficulty: Difficulty,
): LevelRecord {
  return progress.get(progressKey(id, difficulty)) ?? INCOMPLETE;
}

/** Whether the level has been won at this difficulty. */
export function isCompleted(
  progress: Progress,
  id: string,
  difficulty: Difficulty,
): boolean {
  return recordFor(progress, id, difficulty).completed;
}

/** The best score at this difficulty, or null if never completed. */
export function bestScoreFor(
  progress: Progress,
  id: string,
  difficulty: Difficulty,
): number | null {
  return recordFor(progress, id, difficulty).bestScore;
}

/**
 * Whether the level has been won at *any* difficulty.
 *
 * This is what unlocking asks, and not `isCompleted` at a specific difficulty. The
 * records are per difficulty, but the gate is not: `normal` is the default, so a
 * player who never touches the difficulty setting would find that every level in
 * the `easy` and `hard` chains past the first is locked behind a second playthrough
 * of the level in front of it. Two thirds of the catalogue, unreachable by default,
 * is not a difficulty setting.
 */
export function completedAtAnyDifficulty(
  progress: Progress,
  id: string,
): boolean {
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    if (isCompleted(progress, id, difficulty)) return true;
  }
  return false;
}

/**
 * Record a win, keeping the higher score.
 *
 * Returns a new map rather than mutating: the old one is what the caller may have
 * already handed to a component, and a progress store that rewrites history under a
 * mounted screen is a class of bug that only shows up on a slow device.
 *
 * Replaying a won level improves the score and changes nothing else. Completing it
 * for the first time sets both fields.
 */
export function recordCompletion(
  progress: Progress,
  id: string,
  difficulty: Difficulty,
  score: number,
): Progress {
  const key = progressKey(id, difficulty);
  const previous = progress.get(key) ?? INCOMPLETE;
  const best =
    previous.bestScore === null ? score : Math.max(previous.bestScore, score);
  const next = new Map(progress);
  next.set(key, { completed: true, bestScore: best });
  return next;
}

/**
 * The levels of a track in playing order, minus the ones that cannot be played.
 *
 * Dropping the unplayable ones is not tidiness, it is reachability. `DreiD` needs a
 * neighbour mode this engine does not have, and it sits at position 38 of `all` and
 * 50 of `main` — so if an unplayable level stayed in the chain as a link, everything
 * behind it would wait on a completion that can never arrive. That is two of seventy
 * levels, permanently, reachable only by patching the catalogue. The chain has to be
 * walked over them instead of through them.
 */
export function playableInTrack(
  index: LevelIndex,
  track: Track,
): LevelIndexEntry[] {
  return levelsInTrack(index, track).filter((entry) => entry.supported);
}

/**
 * Whether a level may be started.
 *
 * True when the level is the first playable one in any track it belongs to, or when
 * the playable level before it in some track has been completed. "Some track" rather
 * than "every track" because a level can sit at a different position in each: the
 * `Nasenkugeln` sample is first in three of them, and elsewhere in the catalogue a
 * level unlocked by finishing the Standard track would still read as locked in a
 * track where it happens to appear later. A player who has earned a level and is
 * told it is locked has been told something false.
 */
export function isUnlocked(
  progress: Progress,
  index: LevelIndex,
  entry: LevelIndexEntry,
): boolean {
  for (const track of entry.tracks.keys()) {
    const chain = playableInTrack(index, track);
    const at = chain.indexOf(entry);
    // Not in this track's playable chain: another track decides, or nothing does.
    if (at < 0) continue;
    if (at === 0) return true;
    if (completedAtAnyDifficulty(progress, chain[at - 1]!.id)) return true;
  }
  return false;
}

/**
 * The playable levels of a track, each with whether it is unlocked.
 *
 * Unordered tracks are reported wholly unlocked. `summary.ld` marks `contrib`
 * unordered, and the spec gates "the ordered tracks" only — gating an unordered one
 * would mean inventing an order the file declined to state, which for `contrib` means
 * locking all seven of its levels behind a sequence nobody can see.
 */
export interface TrackProgressEntry {
  readonly entry: LevelIndexEntry;
  readonly unlocked: boolean;
  /** Whether this level is won at any difficulty, for the card's tick. */
  readonly completed: boolean;
}

/** Every playable level in a track, with its unlock and completion state. */
export function trackProgress(
  progress: Progress,
  index: LevelIndex,
  track: Track,
): TrackProgressEntry[] {
  const ordered = index.levels
    .filter((l) => l.tracks.has(track))
    .some((l) => l.ordered.get(track) === true);

  return playableInTrack(index, track).map((entry) => ({
    entry,
    unlocked: !ordered || isUnlocked(progress, index, entry),
    completed: completedAtAnyDifficulty(progress, entry.id),
  }));
}

/** How far through a track a player is, for a header. */
export function trackSummary(
  progress: Progress,
  index: LevelIndex,
  track: Track,
): { readonly completed: number; readonly total: number } {
  const levels = trackProgress(progress, index, track);
  return {
    completed: levels.filter((l) => l.completed).length,
    total: levels.length,
  };
}