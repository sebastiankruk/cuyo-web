// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Touch gesture decoding, as a pure function of a pointer path.
 *
 * The canvas already has `touch-action: none`, so the browser hands us the whole
 * gesture and does not steal it for scrolling. What is left is to turn a drag
 * into game actions, and that decision is worth keeping out of the event handler:
 * the thresholds below are the game feel, and tuning them needs a test rather than
 * a phone.
 *
 * Both a swipe and a drag are supported, because a swipe is what you want for a
 * single deliberate move and a drag is what you get when you are holding a piece
 * sideways to shuffle it under an overhang. A drag acts on every whole cell it
 * crosses, so the piece tracks the finger rather than jumping once at the end.
 */

/** The actions a gesture can produce. */
export type Gesture =
  | { readonly kind: "move"; readonly cells: number }
  | { readonly kind: "rotate" }
  | { readonly kind: "fast" };

/** One pointer sample, in CSS pixels relative to the canvas. */
export interface PointerSample {
  readonly x: number;
  readonly y: number;
}

/** Tuning for {@link readGesture}. */
/**
 * How far a touch may wander and still count as a tap, in CSS pixels.
 *
 * A property of the finger, not of the board, so it deliberately does not scale with
 * the cell size.
 */
export const TAP_PIXELS = 10;

/**
 * Whether a press that has travelled from `from` to `to` is still a tap.
 *
 * This is the single definition of "has the finger moved", used both by
 * {@link readGesture} - which acts on nothing short of a real gesture - and by the
 * pointer handler, which has to recognise a drag *during* the move in order to
 * suppress the tap on release. Two places needed the answer and they had to agree
 * exactly, so there is one answer.
 */
export function isTap(
  from: PointerSample,
  to: PointerSample,
  tapDistance: number = TAP_PIXELS,
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) < tapDistance;
}

export interface GestureOptions {
  /**
   * Cell size in CSS pixels. A drag moves one piece-cell per this many pixels.
   * Defaults to 32, which is about a fingertip-width on a phone.
   */
  readonly cellSize?: number;
  /**
   * Distance in pixels an upward flick must cover to count as a rotate.
   *
   * Well above the tap distance, and only honoured for a flick that is *clearly*
   * vertical - see {@link readGesture}.
   */
  readonly flickDistance?: number;
  /**
   * Distance in pixels a touch may wander and still count as a tap.
   *
   * A tap rotates, so this threshold is the cost of an accidental rotate: too
   * tight and holding a touch to steady your hand rotates the piece; too loose and
   * a short drag stops steering. 10px is below the jitter of a deliberate press
   * and above the drift of a thumb resting on glass.
   */
  readonly tapDistance?: number;
}

/**
 * Decides what a drag from `from` to `to` means.
 *
 * `cellSize` is the distance one move covers, so `floor` division gives the number
 * of cells travelled without needing the piece's own column. The sign comes from
 * the drag, not the start point: dragging right moves right wherever the piece is.
 *
 * The axis comparison is what makes this feel right on a board twice as tall as it
 * is wide. On a portrait phone most swipes are up or down, so a mostly-vertical
 * drag drops the piece rather than nudging it sideways by a pixel.
 */
export function readGesture(
  from: PointerSample,
  to: PointerSample,
  options: GestureOptions = {},
): Gesture | null {
  const cellSize = options.cellSize ?? 32;
  const tapDistance = options.tapDistance ?? TAP_PIXELS;
  const flickDistance = options.flickDistance ?? cellSize;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  /*
   * Below the tap distance this returns *nothing*, and that is the whole fix for
   * tap-and-swipe mixing.
   *
   * This function is called from `pointermove`, and a browser fires a move the
   * instant a finger lands - at a distance of a couple of pixels. So returning
   * "rotate" here made every touch rotate on its first event and then again on
   * release: swipes appeared to rotate, and taps rotated twice. Which was the
   * report.
   *
   * A tap is not a movement, so it is not decided here. The handler decides it on
   * release, where "did this ever move" is a fact rather than a guess about where
   * the finger has got to.
   */
  if (isTap(from, to, tapDistance)) return null;

  /*
   * Upward flick also rotates, as well as the tap.
   *
   * Both, deliberately: rotate is the most repeated action in the game and a player
   * should not have to remember which of two gestures means it. A piece cannot rise,
   * so an upward flick has no other meaning available - the gesture would otherwise
   * be dead.
   *
   * But it must be *clearly* vertical, or a diagonal drag while shuffling a piece
   * sideways would rotate as well. Two and a half times the sideways travel is the
   * threshold: far enough that steering never trips it, close enough that a
   * deliberate flick does.
   */
  if (dy < 0 && -dy >= Math.abs(dx) * 2.5 && distance >= flickDistance) {
    return { kind: "rotate" };
  }

  // Vertical wins ties, because dropping a piece is the common intent on a tall
  // board and a sideways nudge is not.
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy > 0) return { kind: "fast" };
    // Up, but short or not clearly vertical: a drag upwards, which moves nothing.
    return null;
  }

  const cells = Math.floor(distance / cellSize);
  if (cells < 1) return null;
  return { kind: "move", cells: dx > 0 ? cells : -cells };
}

/** Applies a gesture to a simulation, returning true if anything happened. */
export interface GestureTarget {
  moveLeft(): void;
  moveRight(): void;
  rotate(): void;
  toggleFast(): void;
}

export function applyGesture(
  target: GestureTarget,
  gesture: Gesture | null,
): boolean {
  if (gesture === null) return false;
  switch (gesture.kind) {
    case "move": {
      // Applied one cell at a time rather than jumping `cells` columns, so the
      // simulation gets to refuse a move into a wall instead of teleporting.
      const step = gesture.cells > 0 ? target.moveRight : target.moveLeft;
      for (let i = 0; i < Math.abs(gesture.cells); i++) step.call(target);
      return true;
    }
    case "rotate":
      target.rotate();
      return true;
    case "fast":
      target.toggleFast();
      return true;
  }
}

/**
 * Touch state, as a pure value.
 *
 * This is the part of the pointer handling that used to live in a `useEffect`, where
 * nothing could test it - and the bug it caused was in exactly this wiring, not in
 * {@link readGesture}. A browser fires `pointermove` the instant a finger lands, at a
 * distance of a couple of pixels, and the handler was asking {@link readGesture} what
 * to do with it. The answer was "rotate", because a short press *is* a tap. So every
 * touch rotated on its first event and then again on release: swipes appeared to
 * rotate, and taps rotated twice.
 *
 * {@link readGesture} decodes one position into one gesture and is right to know
 * nothing about presses. Deciding *when* a gesture counts, when a press is a tap and
 * when it has become a drag, is a separate question that needs the path so far - so it
 * lives here, where a test can ask it.
 */

/** Where a touch stands. `start` is null when no finger is down. */
export interface TouchState {
  /** Where the press began: the anchor every distance is measured from. */
  readonly start: PointerSample | null;
  /** Whether the press has travelled far enough that it is a drag, not a tap. */
  readonly moved: boolean;
}

/** No finger down. */
export const NO_TOUCH: TouchState = { start: null, moved: false };

/**
 * What an event means, and where the touch stands afterwards.
 *
 * Two states rather than one, because the tracker cannot know whether the simulation
 * will accept the gesture it just produced - only the caller can, by trying. The two
 * differ in one field, the anchor, and which one is right depends on the answer.
 */
export interface TouchResult {
  /** The gesture to apply, or null when this event does nothing. */
  readonly gesture: Gesture | null;
  /** State if the gesture was applied: the anchor has moved on with the finger. */
  readonly state: TouchState;
  /** State if the simulation refused the gesture: the anchor stays put. */
  readonly held: TouchState;
}

/**
 * A press begins.
 *
 * Trivial on its own, but named so the three handlers in the component map one-to-one
 * onto three functions here, and so "no finger down" is one value rather than two
 * nullable locals.
 */
export function pressTouch(at: PointerSample): TouchState {
  return { start: at, moved: false };
}

/**
 * The finger moved.
 *
 * The result carries two states because the anchor depends on whether the gesture
 * lands. Applied, the anchor moves to the finger's current position, so the next cell
 * boundary is measured from where the finger is now rather than from where the press
 * started - which is what makes a drag track the finger instead of deciding everything
 * at the end. Refused, such as a drag into a wall, the anchor stays so the piece can
 * keep being pushed at the same place.
 *
 * Either way `moved` is set. A drag into a wall is still a drag: it is a real attempt
 * to move, and treating it as a tap would rotate the piece instead.
 */
export function moveTouch(
  state: TouchState,
  at: PointerSample,
  options: GestureOptions = {},
): TouchResult {
  const start = state.start;
  // A move with no press down is a stray event - a pointer that arrived without its
  // `pointerdown`, or one from a pointer the component has already released. Acting on
  // it would move a piece nobody is holding.
  if (start === null) {
    return { gesture: null, state, held: state };
  }
  const moved = state.moved || !isTap(start, at, options.tapDistance);
  return {
    gesture: readGesture(start, at, options),
    state: { start: at, moved },
    held: { start, moved },
  };
}

/**
 * The finger lifted.
 *
 * The only place a tap is decided, and the only place a tap should be decided: a press
 * that never travelled is a tap, and one that travelled is a drag whatever the drag
 * did. Deciding it during the move is what made the two blur together.
 */
export function releaseTouch(state: TouchState): TouchResult {
  const gesture = state.start !== null && !state.moved ? TAP : null;
  return { gesture, state: NO_TOUCH, held: NO_TOUCH };
}

/** The gesture a tap produces. Rotate: the most repeated action in the game. */
const TAP: Gesture = { kind: "rotate" };
