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
export interface GestureOptions {
  /**
   * Cell size in CSS pixels. A drag moves one piece-cell per this many pixels.
   * Defaults to 32, which is about a fingertip-width on a phone.
   */
  readonly cellSize?: number;
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
  const tapDistance = options.tapDistance ?? 10;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  // A tap rotates. This is the most repeated action in the game by a wide margin,
  // and it used to be an upward flick - which meant every rotate was a gesture
  // large enough to be mistaken for something else, and on a board where the
  // piece cannot rise an upward drag did nothing at all. A tap is unambiguous:
  // press and lift without moving is never a drag.
  if (distance < tapDistance) return { kind: "rotate" };

  // Vertical wins ties, because dropping a piece is the common intent on a tall
  // board and a sideways nudge is not.
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy > 0) return { kind: "fast" };
    // Up. A piece cannot rise, so an upward drag has nothing to act on and is
    // ignored - which is why rotate moved to the tap: an upward flick that did
    // nothing was the most common misfire on a phone.
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
