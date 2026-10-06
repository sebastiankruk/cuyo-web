// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * What a level says before you play it, and when it is allowed to skip saying it.
 *
 * Two things live here because they are the same decision. The spec wants a level's
 * name, author and description shown before play begins; it also wants that skippable
 * once seen. Whether to show is therefore a function of what the player has already
 * seen and what they have asked for, and separating those two halves is how you get a
 * screen that appears for a level it has already shown, or one that never appears for
 * a new one.
 *
 * "Seen" is deliberately *not* the same thing as completed. The spec asks for both, and
 * they answer different questions: seen means the introduction has been shown once,
 * completed means the level has been won. A player who abandons a level after reading
 * it should not read it again, and a player who has won it in another difficulty should
 * still be told what this one is about if they have never been told.
 */

import type {
  Difficulty,
  LevelIndexEntry,
  Track,
} from "../level-format/index-data.ts";

/** The text a level shows before it starts. */
export interface LevelIntroduction {
  /** The level's identity, for marking it seen. */
  readonly id: string;
  readonly name: string;
  /** The author as `summary.ld` spells it. Empty when the level declares none. */
  readonly author: string;
  /** Empty for 27 of the 79 levels, so a layout cannot assume there is something to read. */
  readonly description: string;
  /** Which difficulty is about to be played, since the same level differs across them. */
  readonly difficulty: Difficulty;
  /** Which track it was chosen from, which is the track it is being recorded against. */
  readonly track: Track;
}

/**
 * The text for a level.
 *
 * Everything is copied from the catalogue rather than re-read from the level file. The
 * description is not in the `.ld` file, it is in `summary.ld`, and the catalogue already
 * resolved it — loading the level here to get it would mean a parse before the player
 * has agreed to play.
 */
export function introductionFor(
  entry: LevelIndexEntry,
  difficulty: Difficulty = "normal",
  track: Track = "main",
): LevelIntroduction {
  return {
    id: entry.id,
    name: entry.name,
    author: entry.author,
    description: entry.description,
    difficulty,
    track,
  };
}

/** The levels whose introduction has been shown at least once. */
export type SeenLevels = ReadonlySet<string>;

/** Nobody has seen anything: a player who has just installed the game. */
export const NO_LEVELS_SEEN: SeenLevels = new Set<string>();

/** Whether this level's introduction has been shown before. */
export function hasSeen(seen: SeenLevels, id: string): boolean {
  return seen.has(id);
}

/**
 * Mark a level's introduction as shown.
 *
 * Returns a new set rather than mutating, for the reason `recordCompletion` does: the
 * caller may already have handed the old one to a mounted list.
 *
 * Marking happens when the introduction is *dismissed*, not when it is displayed. A
 * player who closes the tab on the introduction has not been told anything yet, and
 * counting that as seen loses the one piece of text the level has.
 */
export function markSeen(seen: SeenLevels, id: string): SeenLevels {
  const next = new Set(seen);
  next.add(id);
  return next;
}

/** What the player has asked for, as far as introductions go. */
export interface IntroductionOptions {
  /**
   * Whether the player has turned introductions off entirely.
   *
   * A single setting rather than one per level, because the alternative is a decision
   * on every level start, which is the friction the skip exists to remove.
   *
   * Turning it back *off* shows every introduction again, including ones already seen.
   * That is what off means — it is the default, and the default is to show — so the
   * setting is a display preference rather than a promise. What survives the toggle is
   * `seen` itself, which is why skipping back on does not re-introduce anything.
   */
  readonly skipIntroductions: boolean;
}

/** Introductions shown, which is the default: a player who has not chosen otherwise. */
export const SHOW_INTRODUCTIONS: IntroductionOptions = { skipIntroductions: false };

/**
 * Whether starting this level should show its introduction.
 *
 * Off skips only what has been seen before. A level never introduced still introduces
 * itself, because "skip" is about not repeating yourself, and a first sighting is not
 * a repetition — a player who switched skipping on from a menu has not read any of
 * these levels.
 */
export function shouldShowIntroduction(
  seen: SeenLevels,
  id: string,
  options: IntroductionOptions = SHOW_INTRODUCTIONS,
): boolean {
  if (!options.skipIntroductions) return true;
  return !hasSeen(seen, id);
}

/**
 * Whether the simulation may start stepping.
 *
 * Both facts named in one value, because the spec states them together and they are
 * easy to get out of step: the simulation does not advance until the player confirms.
 * Returning them separately invites a caller to read the first and forget the second,
 * which is a level that moves under an introduction nobody finished reading.
 */
export interface StartGate {
  /** Whether the introduction is on screen. */
  readonly showIntroduction: boolean;
  /** Whether `Simulation.step` may be called. False exactly while the introduction is up. */
  readonly mayAdvance: boolean;
}

/** The gate for starting one level. */
export function startGate(
  seen: SeenLevels,
  id: string,
  options: IntroductionOptions = SHOW_INTRODUCTIONS,
): StartGate {
  const showIntroduction = shouldShowIntroduction(seen, id, options);
  return { showIntroduction, mayAdvance: !showIntroduction };
}
