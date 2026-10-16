// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Claiming the transition into a finished phase, exactly once — task 9.4.
 *
 * ## The bug this exists to make impossible
 *
 * Recording a win is an effect on `hud.phase`. But `phase` is `won` for *every frame*
 * from the moment the border reaches the top until the player leaves the screen, and the
 * result overlay stays up for as long as they look at it. So an effect keyed on the
 * phase alone fires once per render for the whole of that time.
 *
 * Each firing would be **individually correct** — the score really is the same number,
 * and `recordCompletion` keeps the higher of the two, so re-recording a win writes an
 * identical record. That is what makes it a bad bug rather than an obvious one: nothing
 * about the *value* is ever wrong. What is wrong is that it happens — a `localStorage`
 * write and a React state update per frame, on a phone, for as long as the player sits
 * looking at their score, and a test asserting "the win was recorded" passes throughout.
 *
 * So the guard is pulled out of the component and given an interface that can be asked
 * the question directly. The alternative — a `useRef` read inside an effect — cannot be
 * tested at all, because reaching the effect body needs a `Simulation` driven to a real
 * win, and the claim is about *how many times* it fires rather than whether it fires.
 */

/**
 * The one phase that records progress.
 *
 * `lost` is the near-miss and it is deliberate: a level that was lost is not progress, so
 * the catalogue has no business ticking its card or storing a score for it. The
 * distinction is named here rather than left as an `=== "won"` at the call site, because
 * this is the one place that decides it and it should be greppable.
 */
export const RECORDS_PROGRESS = "won" as const;

/** The mutable half: remembers that this run has already been claimed. */
export interface WinRecorder {
  /**
   * Whether this frame is the one that should record, marking it claimed if so.
   *
   * **Returns true at most once per instance**, and only for `won`.
   */
  claim(phase: string, score: number): boolean;
  /** Whether this run has already recorded a win. */
  readonly claimed: boolean;
  /** The score that was claimed, or null if nothing has been. */
  readonly score: number | null;
}

/** A recorder for one run of one level. */
export function WinRecorder(): WinRecorder {
  let claimed = false;
  let score: number | null = null;
  return {
    get claimed(): boolean {
      return claimed;
    },
    get score(): number | null {
      return score;
    },
    claim(phase: string, incoming: number): boolean {
      // One condition, both halves of it. `phase !== RECORDS_PROGRESS` is not an early
      // return that spends anything: a loss leaves `claimed` false, so the recorder has
      // no opinion about phase order and cannot be defeated by one it does not model.
      if (phase !== RECORDS_PROGRESS || claimed) return false;
      claimed = true;
      score = incoming;
      return true;
    },
  };
}
