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

/** The shape written to {@link PROGRESS_KEY}. */
interface StoredProgress {
  readonly version: 1;
  readonly records: Record<string, LevelRecord>;
}

/**
 * Read progress, or nothing at all if what is stored cannot be trusted.
 *
 * Damaged *entries* are dropped individually and the rest are kept, because one bad
 * record is not a reason to tell a player they have never finished anything. A
 * completed record whose score did not survive keeps its `completed` flag: the score
 * is a number the catalogue prints, and a level that was won was won.
 */
export function readProgress(store: KeyValueStore = BROWSER_STORE): Progress {
  let raw: string | null;
  try {
    raw = store.getItem(PROGRESS_KEY);
  } catch {
    // Storage can throw outright: Safari's private mode, a disabled cookie policy.
    return emptyProgress();
  }
  if (raw === null || raw === "") return emptyProgress();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProgress();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyProgress();

  const records = (parsed as { records?: unknown }).records;
  if (typeof records !== "object" || records === null || Array.isArray(records)) {
    return emptyProgress();
  }

  const progress = new Map<string, LevelRecord>();
  for (const [key, value] of Object.entries(records as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const { completed, bestScore } = value as Partial<LevelRecord>;
    const score =
      typeof bestScore === "number" && Number.isFinite(bestScore) ? bestScore : null;
    if (completed !== true && score === null) continue;
    progress.set(key, { completed: completed === true, bestScore: score });
  }
  return progress;
}

/**
 * Write progress.
 *
 * Returns whether it was written, and never throws. A full quota or a locked store
 * must not take the game down mid-level — the score is already in memory, so the worst
 * case is that this session's wins are forgotten, which is recoverable and losing the
 * session is not.
 */
export function writeProgress(
  progress: Progress,
  store: KeyValueStore = BROWSER_STORE,
): boolean {
  const records: Record<string, LevelRecord> = {};
  for (const [key, record] of progress) {
    records[key] = record;
  }
  const payload: StoredProgress = { version: 1, records };
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
): Progress {
  const next = recordCompletion(readProgress(store), id, difficulty, score);
  writeProgress(next, store);
  return next;
}
