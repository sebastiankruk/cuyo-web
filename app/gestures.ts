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
   * Distance in pixels that counts as a flick rather than a drag.
   *
   * Below this, horizontal movement is still handled as a drag; above it, a
   * horizontal flick moves the piece one cell and stops following the finger.
   * Set high enough that an ordinary drag never trips it.
   */
  readonly flickDistance?: number;
  /**
   * Distance in pixels before a tap is treated as a swipe at all. Below this the
   * gesture is a tap, which drops the piece where it is.
   */
  readonly tapDistance?: number;
}

/**
 * Decides what a drag from `from` to `to` means, given where the piece is.
 *
 * `cellSize` is the distance one move covers, so `floor` division gives the
 * number of cells travelled without needing the piece's own column. `origin`
 * matters only for the sign: dragging right moves right regardless of where the
 * piece started.
 *
 * The comparison is on the dominant axis, which is what makes the gesture feel
 * right on a board that is twice as tall as it is wide: on a portrait phone most
 * swipes are up or down, and a vertical flick should drop the piece rather than
 * nudge it sideways by a pixel.
 */
export function readGesture(
  from: PointerSample,
  to: PointerSample,
  options: GestureOptions = {},
): Gesture | null {
  const cellSize = options.cellSize ?? 32;
  const flickDistance = options.flickDistance ?? cellSize * 1.5;
  const tapDistance = options.tapDistance ?? 10;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  // A tap, or a press that did not move: nothing to do. Returning null is what
  // lets the caller leave the piece alone rather than guessing.
  if (distance < tapDistance) return null;

  // Vertical wins ties, because dropping a piece is the common intent on a tall
  // board and a sideways nudge is not.
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy > 0) return { kind: "fast" };
    // Up. A short upward flick is a rotate, which is the single most repeated
    // action in the game; a long one is a drag upwards, which moves nothing since
    // the piece cannot rise, so it is left to the caller as no movement.
    if (distance < flickDistance) return { kind: "rotate" };
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

export function applyGesture(target: GestureTarget, gesture: Gesture | null): boolean {
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
