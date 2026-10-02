/**
 * Keeping progress on the device.
 *
 * The rules for what counts as progress live in `engine/progress/progress.ts` and are
 * pure. This file is only the part that touches the device, and it is kept separate
 * for the same reason `GameLoop` takes a `FrameClock`: storage is injected, so the
 * behaviour that matters — what happens when the stored bytes are wrong — can be
 * tested without a browser and without a `localStorage` stub in every test file.
 *
 * The rule this file exists to enforce is the spec's "corrupt stored data": the game
 * starts with defaults rather than failing to launch. A player who cannot open the
 * game because a JSON blob went wrong has lost the game *and* their progress, which is
 * worse than losing the progress alone. So every read is total, and a write that
 * throws is swallowed.
 */

import {
  emptyProgress,
  recordCompletion,
  type LevelRecord,
  type Progress,
} from "../engine/progress/progress.ts";
import {
  NO_LEVELS_SEEN,
  markSeen,
  type SeenLevels,
} from "../engine/progress/introductions.ts";
import type { Difficulty } from "../engine/level-format/index-data.ts";

/**
 * The subset of `Storage` this file uses.
 *
 * Declared rather than taken as `Storage` so a test can pass a two-method object.
 * `localStorage` itself would work, but naming it would make the dependency wider than
 * what is actually needed and harder to fake faithfully.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The browser's own storage.
 *
 * A function rather than a value so that importing this file in plain Node does not
 * touch `localStorage` at import time — there is none there, and it throws rather than
 * returning undefined. Same reasoning as `BROWSER_CLOCK` in `app/game-loop.ts`.
 */
export const BROWSER_STORE: KeyValueStore = {
  getItem: (key) => globalThis.localStorage.getItem(key),
  setItem: (key, value) => {
    globalThis.localStorage.setItem(key, value);
  },
};

/**
 * Where progress is kept.
 *
 * Versioned in the name, and that is the whole reason: the day the stored shape
 * changes, the old key is left alone and read as "no progress" rather than
 * misread. Losing a year of progress once is bad; silently showing wrong scores
 * forever is worse.
 */
export const PROGRESS_KEY = "cuyo.progress.v1";

/**
 * Everything the player has done that outlives the session.
 *
 * One value rather than two so that a launch reads the storage once. Two would also
 * work, and the failure mode is quiet: a read that picked up the completions but not
 * the seen levels would re-show every introduction the player had already read, and
 * nothing would say why.
 */
export interface StoredState {
  readonly progress: Progress;
  readonly seen: SeenLevels;
}

/** Nothing played, nothing read. */
export function emptyState(): StoredState {
  return { progress: emptyProgress(), seen: NO_LEVELS_SEEN };
}

/** The shape written to {@link PROGRESS_KEY}. */
interface StoredDocument {
  readonly version: 1;
  readonly records: Record<string, LevelRecord>;
  /** Level ids whose introduction has been dismissed. */
  readonly seen: readonly string[];
}

/**
 * Read progress, or nothing at all if what is stored cannot be trusted.
 *
 * Damaged *entries* are dropped individually and the rest are kept, because one bad
 * record is not a reason to tell a player they have never finished anything. A
 * completed record whose score did not survive keeps its `completed` flag: the score
 * is a number the catalogue prints, and a level that was won was won.
 */
export function readState(store: KeyValueStore = BROWSER_STORE): StoredState {
  let raw: string | null;
  try {
    raw = store.getItem(PROGRESS_KEY);
  } catch {
    // Storage can throw outright: Safari's private mode, a disabled cookie policy.
    return emptyState();
  }
  if (raw === null || raw === "") return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return emptyState();
  }

  const records = (parsed as { records?: unknown }).records;
  // A document whose `records` is unusable loses the completions, but it need not lose
  // the seen levels — the two are independent facts, and a corrupt one is not evidence
  // about the other. Reading them separately is why `readState` does not return early.
  const progress =
    typeof records === "object" && records !== null && !Array.isArray(records)
      ? readRecords(records as Record<string, unknown>)
      : emptyProgress();

  const rawSeen = (parsed as { seen?: unknown }).seen;
  const seen = new Set<string>();
  if (Array.isArray(rawSeen)) {
    for (const id of rawSeen) {
      // Anything that is not a string would be looked up against level ids and never
      // match, so it is dropped rather than stored.
      if (typeof id === "string" && id !== "") seen.add(id);
    }
  }

  return { progress, seen };
}

/** The records half of a read, dropping damaged entries one at a time. */
function readRecords(records: Record<string, unknown>): Progress {
  const progress = new Map<string, LevelRecord>();
  for (const [key, value] of Object.entries(records)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const { completed, bestScore } = value as Partial<LevelRecord>;
    const score =
      typeof bestScore === "number" && Number.isFinite(bestScore) ? bestScore : null;
    if (completed !== true && score === null) continue;
    progress.set(key, { completed: completed === true, bestScore: score });
  }
  return progress;
}

/**
 * Write everything.
 *
 * Returns whether it was written, and never throws. A full quota or a locked store
 * must not take the game down mid-level — the score is already in memory, so the worst
 * case is that this session's wins are forgotten, which is recoverable and losing the
 * session is not.
 */
export function writeState(
  state: StoredState,
  store: KeyValueStore = BROWSER_STORE,
): boolean {
  const records: Record<string, LevelRecord> = {};
  for (const [key, record] of state.progress) {
    records[key] = record;
  }
  const payload: StoredDocument = {
    version: 1,
    records,
    seen: [...state.seen],
  };
  try {
    store.setItem(PROGRESS_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a win and store it, in one step.
 *
 * The one place a completion reaches the device, so the caller cannot remember to
 * write and cannot write before computing the new record. The score goes through
 * `recordCompletion`, so a worse replay still keeps the better score.
 */
export function completeAndStore(
  id: string,
  difficulty: Difficulty,
  score: number,
  store: KeyValueStore = BROWSER_STORE,
): StoredState {
  const current = readState(store);
  const next: StoredState = {
    progress: recordCompletion(current.progress, id, difficulty, score),
    seen: current.seen,
  };
  writeState(next, store);
  return next;
}

/**
 * Record that a level's introduction has been read, and store it.
 *
 * Called when the introduction is *dismissed*, not when it appears — a player who closes
 * the tab on it has not been told anything, and losing that text is the one thing the
 * introduction exists to prevent.
 */
export function markIntroductionSeen(
  id: string,
  store: KeyValueStore = BROWSER_STORE,
): StoredState {
  const current = readState(store);
  const next: StoredState = {
    progress: current.progress,
    seen: markSeen(current.seen, id),
  };
  writeState(next, store);
  return next;
}
