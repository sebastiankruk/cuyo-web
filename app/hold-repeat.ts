// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Held-key repeat, as a pure state machine — the thing 13.5 asks to be tested.
 *
 * ## Why it is not a `setTimeout` in a component
 *
 * `PlayScreen.tsx` had `DAS_DELAY` and `DAS_RATE` as two constants wrapped around
 * `window.setTimeout` and `window.setInterval` inside a `useCallback`. Every property 13.5 asks
 * for is about **time**: does the first move happen at once, does the second wait, what is the
 * rate, does releasing stop it. With a real timer in a real component, each of those is a test
 * that has to either sleep — slow, and flaky in the direction that hides bugs, since a slow
 * machine passes a "nothing happened yet" assertion for the wrong reason — or reach into the
 * component's internals, which is how a test ends up asserting the mock rather than the
 * behaviour.
 *
 * So the timing is here instead: a machine with **no clock of its own**, advanced by an
 * `advanceTo(ms)`. "Forty milliseconds passed" is an argument, not a wait. This is the same
 * decision `gestures.ts` already made for the gesture thresholds, and `ManualClock` already makes
 * for `GameLoop`.
 *
 * ## What the numbers are
 *
 * `DAS_DELAY` 170 ms, `DAS_RATE` 55 ms — the values `PlayScreen.tsx` already used, unchanged. This
 * is a move, not a redesign: the game feels the same afterwards and the difference is that the
 * numbers can be asserted.
 *
 * ## The rule about the opposite direction
 *
 * Holding left and then pressing right **cancels the left repeat and does not start a right one**,
 * for as long as the opposite key stays down. Both halves matter and they are not the same claim:
 *
 * - Starting a right repeat immediately would make a player who drifts their thumb across the two
 *   keys get a piece flying right at 18 cells a second, which is not what "I changed my
 *   mind" means.
 * - Not cancelling would leave the left repeat running underneath, so the piece would move left and
 *   right at once and appear to jitter in place.
 *
 * Upstream Cuyo has no keyboard repeat at all — its repeat is the *pointer* drag, which is a
 * different mechanism entirely — so this is the web build's own decision and there is nothing to
 * be faithful to. It follows the platform convention instead: `keydown` events arrive already
 * repeated when a key is held, so a browser does most of this for free; what a game has to add is
 * the *rate*, because a browser's own repeat rate is not one anybody chose.
 *
 * ## `repeat` is not ignored
 *
 * `KeyboardEvent.repeat` is true for the events the browser synthesises while a key is held, and
 * false for the first one. A `keydown` handler that treats every event the same therefore applies
 * a move on *every* synthesised event, at the browser's rate — which is exactly the bug the rate
 * exists to prevent. So `press` distinguishes them and only acts on the first.
 */

/** When the first repeat happens after a press, in ms. `PlayScreen.tsx`'s `DAS_DELAY`. */
export const DAS_DELAY = 170;

/** The gap between repeats once repeating has begun, in ms. `PlayScreen.tsx`'s `DAS_RATE`. */
export const DAS_RATE = 55;

/** What a press does. */
export type HeldAction = "left" | "right" | "rotate";

/** What the machine did in one `advanceTo`, or one `press`. */
export interface RepeatEvent {
  readonly action: HeldAction;
  /** How many times the action applied. Always 0 or 1 here. */
  readonly times: number;
}

/** No events. Returned rather than allocated so callers can compare cheaply. */
const NOTHING: readonly RepeatEvent[] = [];

/**
 * One held key at a time, repeated on a timer the caller drives.
 *
 * **One at a time is the point, not a limitation.** Two keys down is the case `pressed` exists to
 * detect, and the rule it triggers is that the repeat stops and nothing starts until the key that
 * was actually pressed is released.
 */
export class HoldRepeat {
  /** What is held, or `null` when nothing is. */
  private held: HeldAction | null = null;

  /** When the *next* repeat falls due, or `null` while nothing is repeating. */
  private dueAt: number | null = null;

  /** The clock, in ms, from whoever is driving this. */
  private now = 0;

  /**
   * A key went down.
   *
   * @param at       the clock in ms
   * @param repeat   the browser's own `KeyboardEvent.repeat`. `true` for the events a browser
   *                 synthesises while a key is held, and those are **ignored**: the browser's
   *                 repeat rate is not one anybody chose, and honouring it would make this class
   *                 decorative.
   */
  press(at: number, action: HeldAction, repeat = false): readonly RepeatEvent[] {
    if (repeat) {
      // Still cancels a repeat in the other direction, because that is what a player pressing
      // right while left is repeating means — and ignoring the event entirely would let the left
      // repeat continue underneath, so the piece would move both ways and appear to jitter.
      if (this.held !== null && this.held !== action) {
        this.held = null;
        this.dueAt = null;
      }
      return NOTHING;
    }
    this.now = at;
    this.held = action;
    // **The move happens now; the repeat does not.** `dueAt` is a full `DAS_DELAY` away, so a
    // held key that waited before moving would feel broken and this is the fix for that. A held
    // key that then repeats at `DAS_RATE` is the rest.
    this.dueAt = at + DAS_DELAY;
    return [{ action, times: 1 }];
  }

  /**
   * A key came up.
   *
   * @param action which key. A key that is not the held one releases nothing, so lifting a finger
   *   from a key that never took effect cannot cancel the repeat of one that did.
   */
  release(action: HeldAction): readonly RepeatEvent[] {
    if (this.held !== action) return NOTHING;
    this.held = null;
    this.dueAt = null;
    return NOTHING;
  }

  /** Time passed, and every repeat that fell due is returned. */
  advanceTo(at: number): readonly RepeatEvent[] {
    this.now = at;
    // **A key that does not repeat when held does not repeat at all**, and that is a property of
    // the action rather than something to check at the call site — the caller is the component, and
    // a decision made in two places is one of them eventually forgets.
    if (this.dueAt === null || this.held === null || !repeatsWhenHeld(this.held)) {
      this.dueAt = null;
      return NOTHING;
    }
    // **A long gap fires once, not once per interval missed.** A tab that was backgrounded for ten
    // seconds has not had a hundred and eighty repeats; it has had a frame. Firing the whole
    // backlog would be the fast-forward bug `GameLoop` already guards against, and the guard
    // belongs here too — so the next repeat is scheduled from *now* rather than from the backlog.
    if (at >= this.dueAt) {
      this.dueAt = at + DAS_RATE;
      return [{ action: this.held, times: 1 }];
    }
    return NOTHING;
  }

  /** What is held, for a test or a debug overlay. */
  get heldAction(): HeldAction | null {
    return this.held;
  }

  /** Whether a repeat is running, which is not the same as whether a key is down. */
  get repeating(): boolean {
    return this.dueAt !== null && this.held !== null && repeatsWhenHeld(this.held);
  }

  /** When the next repeat falls due, in the caller's clock. `null` when nothing is repeating. */
  get nextRepeatAt(): number | null {
    return this.repeating ? this.dueAt : null;
  }

  /** Nothing is held, whatever happened before. For a level change or a blur. */
  clear(): void {
    this.held = null;
    this.dueAt = null;
  }

  /** The clock as this machine last saw it. */
  get clock(): number {
    return this.now;
  }
}

/**
 * Whether a key should repeat when held.
 *
 * **Only the directions.** Rotation is a single action however long the key is held: the piece
 * turns once per press, and a held rotation key cycling the piece through four orientations at 18
 * a second is not something a player can use, and cannot stop in time once started.
 */
export function repeatsWhenHeld(action: HeldAction): boolean {
  return action === "left" || action === "right";
}

/**
 * The action a key names, or `null` for a key that does nothing here.
 *
 * Exported so the mapping is one function and not a `switch` duplicated between the component and
 * its test — the failure mode being a test that passes because it tested a key the component does
 * not handle.
 */
export function actionForKey(key: string): HeldAction | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
    case "x":
    case "X":
      return "rotate";
    default:
      return null;
  }
}
