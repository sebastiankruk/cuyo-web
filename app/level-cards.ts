// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * What each card in the catalogue has to say — task 9.4.
 *
 * `engine/progress/progress.ts` owns *whether* a level is unlocked and completed. This
 * file owns what follows from that for a card, and it exists because the interesting
 * cases are conflicts between three different reasons a card may not be playable, and
 * because each of those needs different words.
 *
 * **The conflict is the point.** A level can be unplayable because this engine cannot
 * run it, because the player has not earned it, or both. They are not the same message
 * and they do not have the same permanence: `DreiD` needs a neighbour mode that is not
 * implemented and no amount of winning will change that, whereas a locked level opens
 * the moment the one before it is finished. Showing "locked" on a level that can never
 * be unlocked would promise the player something the game cannot deliver, and it is the
 * more likely of the two to be wrong in a way that matters — a level that reads as
 * merely gated can be waited out, and this one cannot.
 *
 * So the order below is an order of *permanence*, from most to least: an engine that
 * cannot play the level beats a gate the player can open, because it is the answer
 * that stays true. And unsupported beats locked rather than the other way round for a
 * second reason — the unsupported message is the only one that tells the player why,
 * and `unsupportedReason` already explains itself in the catalogue's own terms.
 *
 * ## Why this is pure and separate from the component
 *
 * Per design.md decision 12, and for the reason `goals.ts` gives: these are the words a
 * player reads, and wording wants a test. None of it touches storage, the DOM or the
 * clock — `Progress` and `SeenLevels` come in as values — so every case below is
 * reachable by calling the function, rather than by winning 56 levels in a browser.
 */

import {
  bestScoreFor,
  completedAtAnyDifficulty,
  isUnlocked,
  playableInTrack,
} from "../engine/progress/progress.ts";
import type { Progress } from "../engine/progress/progress.ts";
import { levelsInTrack } from "../engine/level-format/index-data.ts";
import type { Difficulty, LevelIndex, LevelIndexEntry, Track } from "../engine/level-format/index-data.ts";

/**
 * Why a card cannot be played, most permanent reason first.
 *
 * `none` means it can. The order of the union is the precedence order, and it is the
 * whole of the conflict resolution described above — not a declaration of habit.
 */
export type BlockReason = "none" | "unsupported" | "locked";

/** Everything a card needs to know about itself beyond the catalogue's own data. */
export interface LevelCardState {
  readonly entry: LevelIndexEntry;
  /**
   * Whether pressing this card starts the level.
   *
   * The single field the hit target reads, so a card can never offer a button that
   * `startLevel` would then refuse. Deriving both from one value is what stops the two
   * from disagreeing, which is the failure 9.4 asks to make impossible.
   */
  readonly playable: boolean;
  readonly blockReason: BlockReason;
  /**
   * Why the card is blocked, in words. Empty when `playable`.
   *
   * For `locked` this names the level that opens it, because "Locked" alone does not
   * tell a player there is a specific thing to go and do. Empty string when there is
   * nothing to name — a level at the head of a track is never locked, so this is
   * reachable only if `isUnlocked` and this disagree, and the tests say they do not.
   */
  readonly blockDetail: string;
  /** Whether the level has been won at any difficulty, for the card's tick. */
  readonly completed: boolean;
  /**
   * The best score, or null if never won.
   *
   * Per the *chosen* difficulty rather than any, because a card is about to start one
   * difficulty: a player who beat this on Easy and is looking at the Hard row wants to
   * know their Hard score, and showing them the Easy one would answer a question they
   * did not ask. Null is "never won at this difficulty" and is distinct from 0 — see
   * `LevelRecord.bestScore` for why that distinction is load-bearing.
   */
  readonly bestScore: number | null;
}

/** The card state for one level, at one difficulty. */
export function cardState(
  progress: Progress,
  index: LevelIndex,
  entry: LevelIndexEntry,
  difficulty: Difficulty,
): LevelCardState {
  const supported = entry.supported;
  const unlocked = isUnlocked(progress, index, entry);
  const playable = supported && unlocked;
  const blockReason: BlockReason = !supported
    ? "unsupported"
    : !unlocked
      ? "locked"
      : "none";
  return {
    entry,
    playable,
    blockReason,
    blockDetail: blockReason === "none" ? "" : blockDetailFor(blockReason, progress, index, entry),
    completed: completedAtAnyDifficulty(progress, entry.id),
    bestScore: bestScoreFor(progress, entry.id, difficulty),
  };
}

/**
 * The words for a blocked card.
 *
 * Split out because it is the half that is about *language* and the half above is
 * about precedence, and a test wants them separately: the precedence is a claim about
 * the game, the wording is a claim about a sentence.
 */
function blockDetailFor(
  reason: BlockReason,
  progress: Progress,
  index: LevelIndex,
  entry: LevelIndexEntry,
): string {
  switch (reason) {
    case "none":
      return "";
    case "unsupported":
      // The catalogue's own words, already written for a player. Overriding them with a
      // generic message would throw away the only sentence in the codebase that names
      // the actual neighbour mode.
      return entry.unsupportedReason;
    case "locked":
      return `Finish ${predecessorName(progress, index, entry)}.`;
  }
}

/**
 * The level that has to be finished first, by name.
 *
 * **The same "any track" rule `isUnlocked` uses**, which is the only way this can name
 * a predecessor: if the level were locked because every track that gates it wants the
 * same previous level, there would be one answer, and if the tracks disagree then the
 * level is unlocked by at least one of them and we are never called. So the first
 * gating chain that actually has something in front of this level supplies the name.
 *
 * "" when there is none, and the card then says only that it is locked — which is what
 * "finish a level that does not exist" would have to degrade to anyway, and is better
 * than naming an arbitrary one.
 */
function predecessorName(
  progress: Progress,
  index: LevelIndex,
  entry: LevelIndexEntry,
): string {
  for (const track of entry.tracks.keys()) {
    const chain = playableInTrack(index, track);
    const at = chain.indexOf(entry);
    if (at <= 0) continue;
    const before = chain[at - 1];
    if (before !== undefined && !completedAtAnyDifficulty(progress, before.id)) {
      return before.name;
    }
  }
  return "";
}

/**
 * Every card in a track, in playing order.
 *
 * **Levels this engine cannot play are kept**, unlike `trackProgress`, which drops
 * them. `trackProgress` is the right shape for a progression display that wants only
 * reachable content; a card is right for a catalogue, where a level that exists should
 * be visible and should say why it cannot be started. Dropping them was the old
 * behaviour by omission rather than by decision, and it is the same silent omission
 * `LevelIndexEntry.supported` was written to avoid.
 */
export function cardsInTrack(
  progress: Progress,
  index: LevelIndex,
  track: Track,
  difficultyFor: (entry: LevelIndexEntry) => Difficulty,
): LevelCardState[] {
  return levelsInTrack(index, track).map((entry) =>
    cardState(progress, index, entry, difficultyFor(entry)),
  );
}

/**
 * How far through a track the player is.
 *
 * Two numbers and not a fraction, because the fraction is the more flattering one and
 * the less useful one: `3 of 59` says what is left, `5%` says nothing actionable.
 * `completed` counts a win at *any* difficulty, matching the card's tick — a card
 * ticked and a header that does not count it would disagree in the same view.
 */
export interface TrackProgressSummary {
  readonly completed: number;
  readonly total: number;
  readonly unlocked: number;
}

/** A track's counts, over the playable levels only. */
export function trackCounts(cards: readonly LevelCardState[]): TrackProgressSummary {
  const playable = cards.filter((card) => card.entry.supported);
  return {
    completed: playable.filter((card) => card.completed).length,
    unlocked: playable.filter((card) => card.playable).length,
    total: playable.length,
  };
}

/**
 * Whether a card may be pressed, as the single place that answers it.
 *
 * Exists so the button and the loader read the same function. The 9.4 requirement is
 * "a locked level cannot be started", and the way that fails is a card with no button
 * while `startLevel` has no check at all — so a level reached by any other route, a
 * stale click, or a future deep link, would start anyway. Asserting both ends against
 * this one function is what makes the pair a fact rather than a coincidence.
 */
export function canStart(card: LevelCardState): boolean {
  return card.playable;
}
