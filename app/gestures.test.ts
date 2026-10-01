/**
 * Tests for touch gesture decoding.
 *
 * These are the numbers that decide how the game feels on a phone, and they
 * cannot be judged by reading the handler. The thresholds live in pure functions
 * here so they can be tuned against a test instead of against a real thumb.
 */

import { describe, expect, it, vi } from "vitest";
import { applyGesture, readGesture } from "./gestures.ts";

/** A drag from one point to another. */
function drag(dx: number, dy: number): ReturnType<typeof readGesture> {
  return readGesture({ x: 100, y: 100 }, { x: 100 + dx, y: 100 + dy });
}

describe("readGesture", () => {
  it("treats a stationary press as no gesture at all", () => {
    expect(readGesture({ x: 10, y: 10 }, { x: 10, y: 10 })).toBeNull();
    // Below the tap threshold, in every direction.
    expect(drag(2, 0)).toBeNull();
    expect(drag(0, 2)).toBeNull();
    expect(drag(-3, 3)).toBeNull();
  });

  it("moves right for a horizontal drag and left for a leftward one", () => {
    // 40px at the default 32px cell is one cell with a bit of overshoot.
    expect(drag(40, 0)).toEqual({ kind: "move", cells: 1 });
    expect(drag(-40, 0)).toEqual({ kind: "move", cells: -1 });
    expect(drag(70, 0)).toEqual({ kind: "move", cells: 2 });
  });

  it("counts whole cells, not a fraction of one", () => {
    // A drag of 35px is one cell, not one and a bit. Rounding up would move the
    // piece for a flick that did not clearly cross a cell boundary.
    expect(drag(33, 0)).toEqual({ kind: "move", cells: 1 });
    expect(drag(31, 0)).toBeNull();
    expect(drag(96, 0)).toEqual({ kind: "move", cells: 3 });
    expect(drag(97, 0)).toEqual({ kind: "move", cells: 3 });
  });

  it("rotates on a short upward flick", () => {
    expect(drag(0, -20)).toEqual({ kind: "rotate" });
  });

  it("does nothing on a long upward drag, because a piece cannot rise", () => {
    // Longer than the flick distance, so it is not a flick. Returning null
    // leaves the piece where it is rather than dropping it.
    expect(drag(0, -80)).toBeNull();
  });

  it("drops the piece on a downward drag of any length", () => {
    expect(drag(0, 20)).toEqual({ kind: "fast" });
    expect(drag(0, 200)).toEqual({ kind: "fast" });
  });

  it("prefers the vertical axis on a diagonal", () => {
    // Dropping is almost always the intent on a board twice as tall as wide, so a
    // mostly-downward drag drops rather than nudging sideways - and a mostly-upward
    // one rotates rather than nudging sideways either.
    expect(drag(10, 40)).toEqual({ kind: "fast" });
    expect(drag(-10, -40)).toEqual({ kind: "rotate" });
    // Equal on both axes counts as vertical too.
    expect(drag(30, 30)).toEqual({ kind: "fast" });
  });

  it("is deliberately not symmetric vertically", () => {
    // Up and down mean different things, so a mirrored vertical gesture is a
    // different action rather than the reverse of the first. Stated explicitly
    // because it is the one place direction is not symmetric, and a reader would
    // otherwise assume it was a bug.
    expect(drag(0, 25)).toEqual({ kind: "fast" });
    expect(drag(0, -25)).toEqual({ kind: "rotate" });
  });

  it("scales its thresholds with the cell size", () => {
    // A bigger board means bigger pixels per cell, so the same physical swipe
    // covers fewer cells. The tap threshold must follow, or a large-cell board
    // would need a bigger movement before registering at all.
    const big = { cellSize: 64 };
    expect(readGesture({ x: 0, y: 0 }, { x: 70, y: 0 }, big)).toEqual({
      kind: "move",
      cells: 1,
    });
    expect(readGesture({ x: 0, y: 0 }, { x: 7, y: 0 }, big)).toBeNull();
  });

  it("mirrors horizontal drags, so direction comes from the drag not the start", () => {
    for (const dx of [40, 70, 96]) {
      const right = readGesture({ x: 100, y: 100 }, { x: 100 + dx, y: 100 });
      const left = readGesture({ x: 100, y: 100 }, { x: 100 - dx, y: 100 });
      expect(right).toEqual({ kind: "move", cells: Math.floor(dx / 32) });
      expect(left).toEqual({ kind: "move", cells: -Math.floor(dx / 32) });
    }
  });

  it("reads the same gesture wherever on the canvas it happens", () => {
    // Absolute position must not matter, only the delta. A gesture near the right
    // edge is the same gesture as one in the middle, and a piece at column 9
    // moves the same number of cells as one at column 0.
    const middle = readGesture({ x: 100, y: 100 }, { x: 140, y: 100 });
    const edge = readGesture({ x: 480, y: 700 }, { x: 520, y: 700 });
    expect(edge).toEqual(middle);
  });
});

describe("applyGesture", () => {
  function target() {
    return {
      moveLeft: vi.fn(),
      moveRight: vi.fn(),
      rotate: vi.fn(),
      toggleFast: vi.fn(),
    };
  }

  it("reports that it did nothing for a null gesture", () => {
    const t = target();
    expect(applyGesture(t, null)).toBe(false);
    expect(t.moveLeft).not.toHaveBeenCalled();
    expect(t.moveRight).not.toHaveBeenCalled();
  });

  it("moves one cell per crossing, so a wall can refuse part of the drag", () => {
    // The point of stepping rather than jumping: `moveRight` returning false on a
    // wall must stop the piece, and a single `cells`-column jump would ignore it.
    const t = target();
    let allow = 2;
    t.moveRight.mockImplementation(() => {
      allow -= 1;
      return allow >= 0;
    });
    applyGesture(t, { kind: "move", cells: 5 });
    expect(t.moveRight).toHaveBeenCalledTimes(5);
  });

  it("calls the right control for each gesture kind", () => {
    const right = target();
    applyGesture(right, { kind: "move", cells: 3 });
    expect(right.moveRight).toHaveBeenCalledTimes(3);

    const left = target();
    applyGesture(left, { kind: "move", cells: -3 });
    expect(left.moveLeft).toHaveBeenCalledTimes(3);

    const rotate = target();
    applyGesture(rotate, { kind: "rotate" });
    expect(rotate.rotate).toHaveBeenCalledTimes(1);

    const fast = target();
    applyGesture(fast, { kind: "fast" });
    expect(fast.toggleFast).toHaveBeenCalledTimes(1);
  });
});
