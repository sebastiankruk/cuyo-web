// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for touch gesture decoding.
 *
 * These are the numbers that decide how the game feels on a phone, and they
 * cannot be judged by reading the handler. The thresholds live in pure functions
 * here so they can be tuned against a test instead of against a real thumb.
 */

import { describe, expect, it } from "vitest";
import {
  NO_TOUCH,
  applyGesture,
  moveTouch,
  pressTouch,
  readGesture,
  releaseTouch,
} from "./gestures.ts";
import type { GestureTarget, TouchState } from "./gestures.ts";

/** A drag from one point to another. */
function drag(dx: number, dy: number): ReturnType<typeof readGesture> {
  return readGesture({ x: 100, y: 100 }, { x: 100 + dx, y: 100 + dy });
}

describe("readGesture", () => {
  it("returns nothing for a press that has not moved", () => {
    // The regression, and the reason tap and swipe used to blur together.
    //
    // `readGesture` is called from `pointermove`, and a browser fires a move the
    // instant a finger lands - at a couple of pixels. Returning "rotate" here made
    // every touch rotate on its first event and again on release, so swipes appeared
    // to rotate and taps rotated twice. The tap is decided on release instead, where
    // "did this ever move" is a fact.
    expect(readGesture({ x: 10, y: 10 }, { x: 10, y: 10 })).toBeNull();
    expect(drag(0, 0)).toBeNull();
    expect(drag(2, 0)).toBeNull();
    expect(drag(0, 2)).toBeNull();
    expect(drag(-3, 3)).toBeNull();
    expect(drag(9, 0)).toBeNull();
  });

  it("rotates on an upward flick that is clearly vertical", () => {
    // Both a tap and a flick rotate, deliberately: rotate is the most repeated action
    // in the game and the player should not have to remember which gesture means it. A
    // piece cannot rise, so an upward flick has no other meaning available.
    expect(drag(0, -40)).toEqual({ kind: "rotate" });
    expect(drag(0, -80)).toEqual({ kind: "rotate" });
  });

  it("does not rotate on a diagonal drag, so steering still works", () => {
    // The threshold that makes having both gestures safe. A drag up-and-sideways is
    // shuffling a piece under an overhang, and rotating there would be a misfire on
    // every attempt to nudge something sideways.
    expect(drag(-20, -40)).toBeNull();
    expect(drag(20, -40)).toBeNull();
    expect(drag(-5, -40)).toEqual({ kind: "rotate" });
    // Clearly sideways is a move, whatever the vertical component.
    expect(drag(-40, -10)).toEqual({ kind: "move", cells: -1 });
    expect(drag(40, -20)).toEqual({ kind: "move", cells: 1 });
  });

  it("ignores an upward drag shorter than a cell", () => {
    // Past the tap distance but not far enough to be a deliberate flick.
    expect(drag(0, -12)).toBeNull();
  });

  it("does nothing on a diagonal upward drag", () => {
    // A piece cannot rise, so an upward drag has nothing to move; where it is not
    // clearly a flick it is inert rather than doing something else.
    expect(drag(0, -12)).toBeNull();
    expect(drag(-30, -50)).toBeNull();
  });

  it("prefers the vertical axis on a diagonal", () => {
    // Dropping is almost always the intent on a board twice as tall as wide, so a
    // mostly-downward drag drops rather than nudging sideways.
    expect(drag(10, 40)).toEqual({ kind: "fast" });
    // Equal on both axes counts as vertical too.
    expect(drag(30, 30)).toEqual({ kind: "fast" });
    // Upward, the same reasoning applies once the drag is clearly a flick: 4:1 up is a
    // flick, 2:1 up is a drag that happens to rise, and a piece cannot rise.
    expect(drag(-10, -40)).toEqual({ kind: "rotate" });
    expect(drag(-20, -40)).toBeNull();
  });

  it("is deliberately not symmetric vertically", () => {
    // Up and down mean different things: down drops, up rotates once it is a real
    // flick. Stated explicitly because it is the one place direction is not symmetric,
    // and a reader would otherwise assume it was a bug.
    expect(drag(0, 25)).toEqual({ kind: "fast" });
    expect(drag(0, -40)).toEqual({ kind: "rotate" });
  });

  it("moves a whole number of cells, ignoring the remainder", () => {
    expect(drag(32, 0)).toEqual({ kind: "move", cells: 1 });
    expect(drag(96, 0)).toEqual({ kind: "move", cells: 3 });
    expect(drag(-64, 0)).toEqual({ kind: "move", cells: -2 });
    // A cell and a half is one cell; the half is not yet crossed.
    expect(drag(48, 0)).toEqual({ kind: "move", cells: 1 });
  });

  it("acts on a drag only once it crosses a cell", () => {
    // A drag just past the tap distance has not yet crossed a cell boundary, so it is
    // neither a tap nor a move and nothing happens. That is intentional - the caller
    // keeps its anchor point, so the drag starts steering as soon as it crosses rather
    // than snapping by a fraction of a cell on release - but it means "moved" and
    // "acted" are not the same thing, which is why `applyGesture` reports whether it did
    // anything. The caller uses that to decide a touch was a tap.
    expect(drag(20, 0)).toBeNull();
    expect(drag(0, -20)).toBeNull();
    // Past a cell, the same gesture steers.
    expect(drag(32, 0)).toEqual({ kind: "move", cells: 1 });
  });

  it("uses the caller's cell size, so a big board needs a longer drag", () => {
    // A drag is measured in cells, not pixels, or the same swipe would move a piece
    // eight columns on a phone and one on a desktop.
    const big = { cellSize: 96 };
    expect(readGesture({ x: 0, y: 0 }, { x: 80, y: 0 }, big)).toBeNull();
    expect(readGesture({ x: 0, y: 0 }, { x: 100, y: 0 }, big)).toEqual({
      kind: "move",
      cells: 1,
    });
    // The tap threshold deliberately does *not* scale with the cell: it is a property
    // of the finger, not of the board. A press that has not moved is nothing whatever
    // the cell size, because the tap is decided on release.
    expect(readGesture({ x: 0, y: 0 }, { x: 7, y: 0 }, big)).toBeNull();
  });

  it("applies to a move measured from a caller's anchor", () => {
    // `readGesture` is pure in the path, so the same pair of points means different
    // things depending on where the press started. That is why the anchor is the
    // caller's to hold and not the decoder's to remember.
    expect(readGesture({ x: 0, y: 0 }, { x: 40, y: 0 })).toEqual({
      kind: "move",
      cells: 1,
    });
    // The same endpoint, but the press began near it, so it is barely a drag.
    expect(readGesture({ x: 30, y: 0 }, { x: 40, y: 0 })).toBeNull();
  });
});

/**
 * The touch tracker, driven the way a browser actually drives it.
 *
 * These are the tests the bug needed and did not have. The fault was never in
 * `readGesture` - on its own it decoded a press correctly. The fault was that a
 * `pointermove` fires the instant a finger lands, and the handler fed those
 * first-few-pixels events to the decoder and obeyed it. That is a claim about a
 * *sequence* of events, so it can only be tested as one, and it was previously
 * trapped inside a `useEffect` where no test could reach it.
 */

/**
 * A recording stand-in for the simulation, so a sequence's whole effect is visible.
 *
 * `moves: false` is a wall: the target refuses to move, so `applyGesture` reports that
 * nothing happened. That refusal is the case a test has to be able to stage, because
 * "the gesture did nothing" and "the finger did nothing" are otherwise the same event
 * to the caller - and the second must not turn into a tap.
 */
function recorder(
  options: { readonly moves?: boolean } = {},
): GestureTarget & { readonly log: string[] } {
  const log: string[] = [];
  const moves = options.moves ?? true;
  return {
    log,
    moveRight() {
      if (moves) log.push("right");
    },
    moveLeft() {
      if (moves) log.push("left");
    },
    rotate() {
      log.push("rotate");
    },
    toggleFast() {
      log.push("fast");
    },
  };
}

/** One step of a pointer path. `at` defaults to the origin for a press or a release. */
interface PathStep {
  readonly kind: "down" | "move" | "up";
  readonly at?: { readonly x: number; readonly y: number };
}

/**
 * Replays a pointer path through the tracker, exactly as the canvas handler does.
 *
 * The sub-pixel `move` events at the start of most paths are not decoration: a browser
 * emits one within a pixel or two of the finger landing, before the player has moved at
 * all. Omitting them is how this bug hides from a test.
 */
function replay(path: PathStep[], cellSize = 32): string[] {
  const sim = recorder();
  let touch: TouchState = NO_TOUCH;
  for (const step of path) {
    if (step.kind === "down") {
      touch = pressTouch(step.at ?? { x: 0, y: 0 });
    } else if (step.kind === "up") {
      applyGesture(sim, releaseTouch(touch).gesture);
      touch = NO_TOUCH;
    } else {
      const result = moveTouch(touch, step.at ?? { x: 0, y: 0 }, { cellSize });
      touch = applyGesture(sim, result.gesture) ? result.state : result.held;
    }
  }
  return sim.log;
}

describe("a tap", () => {
  it("rotates exactly once, however many move events the browser sends", () => {
    // The regression. A browser fires `pointermove` on touch-down at a distance of a
    // couple of pixels. With the decoder deciding taps, that first event rotated the
    // piece and the release rotated it again - so a tap turned the piece twice, and
    // every swipe began with a rotation.
    //
    // Four sub-pixel move events is generous, and a real browser does send several.
    expect(
      replay([
        { kind: "down" },
        { kind: "move", at: { x: 1, y: 0 } },
        { kind: "move", at: { x: 2, y: 1 } },
        { kind: "move", at: { x: 0, y: 3 } },
        { kind: "move", at: { x: 1, y: 1 } },
        { kind: "up" },
      ]),
    ).toEqual(["rotate"]);
  });

  it("rotates once for a mouse click, which sends no move events at all", () => {
    expect(replay([{ kind: "down" }, { kind: "up" }])).toEqual(["rotate"]);
  });

  it("rotates once for a press that drifts a little, as fingers do", () => {
    // Just inside the threshold: still a tap.
    expect(
      replay([
        { kind: "down" },
        { kind: "move", at: { x: 6, y: 4 } },
        { kind: "up" },
      ]),
    ).toEqual(["rotate"]);
  });
});

describe("a swipe", () => {
  it("does not rotate at all", () => {
    // The other half of the report: "each time I swipe it rotates". The swipe's first
    // move event is a couple of pixels from the press, and that is what was rotating.
    const log = replay([
      { kind: "down" },
      { kind: "move", at: { x: 1, y: 0 } },
      { kind: "move", at: { x: 40, y: 0 } },
      { kind: "move", at: { x: 80, y: 0 } },
      { kind: "up" },
    ]);
    expect(log).not.toContain("rotate");
    // Two cells to the right, re-anchored as it went.
    expect(log).toEqual(["right", "right"]);
  });

  it("steers cell by cell as the finger crosses each boundary", () => {
    // Re-anchoring is what makes a drag track the finger: each cell boundary is measured
    // from where the finger is now, so a slow drag moves one cell at a time rather than
    // deciding everything on release.
    expect(
      replay([
        { kind: "down" },
        { kind: "move", at: { x: 33, y: 0 } },
        { kind: "move", at: { x: 66, y: 0 } },
        { kind: "move", at: { x: 99, y: 0 } },
        { kind: "up" },
      ]),
    ).toEqual(["right", "right", "right"]);
  });

  it("rotates on a clear upward flick, and not on a diagonal drag", () => {
    expect(
      replay([
        { kind: "down" },
        { kind: "move", at: { x: 0, y: -50 } },
        { kind: "up" },
      ]),
    ).toEqual(["rotate"]);
    // Shuffling a piece sideways and slightly up steers, and never rotates.
    expect(
      replay([
        { kind: "down" },
        { kind: "move", at: { x: -50, y: -20 } },
        { kind: "up" },
      ]),
    ).toEqual(["left"]);
  });

  it("drops on a downward drag", () => {
    expect(
      replay([
        { kind: "down" },
        { kind: "move", at: { x: 0, y: 40 } },
        { kind: "up" },
      ]),
    ).toEqual(["fast"]);
  });
});

describe("a drag the simulation refuses", () => {
  it("still counts as a drag, so it does not become a tap", () => {
    // The subtle one. A drag into a wall applies nothing, which is indistinguishable
    // from a finger that never moved - so suppressing the tap has to be decided on the
    // *path*, not on whether the piece actually moved.
    //
    // Rotating here is the worst outcome: the player pushed against a wall and the
    // piece turned instead.
    const wall = recorder({ moves: false });
    let touch: TouchState = pressTouch({ x: 0, y: 0 });
    const result = moveTouch(touch, { x: 100, y: 0 }, { cellSize: 32 });
    touch = applyGesture(wall, result.gesture) ? result.state : result.held;
    applyGesture(wall, releaseTouch(touch).gesture);
    expect(wall.log).toEqual([]);
  });

  it("keeps its anchor, so a continued push still moves the piece", () => {
    // The refused move leaves the anchor where it was, so the *next* gesture is still
    // measured from the press rather than from where the finger has since reached.
    const sim = recorder();
    const first = moveTouch(
      pressTouch({ x: 0, y: 0 }),
      { x: 100, y: 0 },
      {
        cellSize: 32,
      },
    );
    const touch = first.held; // refused
    // The finger comes back to just past one cell from the *original* press.
    const second = moveTouch(touch, { x: 40, y: 0 }, { cellSize: 32 });
    applyGesture(sim, second.gesture);
    expect(sim.log).toEqual(["right"]);
  });
});

describe("the tracker's edge cases", () => {
  it("ignores a move with no press down", () => {
    // A pointer that arrives without its `pointerdown`, or one from a pointer the
    // component has already released. Acting would move a piece nobody is holding.
    const result = moveTouch(NO_TOUCH, { x: 50, y: 0 }, { cellSize: 32 });
    expect(result.gesture).toBeNull();
    expect(result.state).toEqual(NO_TOUCH);
  });

  it("ignores a release with no press down", () => {
    // The `pointercancel` path reaches `releaseTouch` with no finger down, and must not
    // rotate a piece the player never touched.
    expect(releaseTouch(NO_TOUCH).gesture).toBeNull();
  });

  it("returns to no-touch after a release, so the next tap is a fresh press", () => {
    // A stale anchor surviving a release is how a piece ends up rotating when the
    // player touches a completely different part of the board.
    expect(releaseTouch(pressTouch({ x: 5, y: 5 })).state).toEqual(NO_TOUCH);
    expect(replay([{ kind: "up" }, { kind: "down" }, { kind: "up" }])).toEqual([
      "rotate",
    ]);
  });

  it("keeps a drag a drag even when a later move returns to the press point", () => {
    // `moved` is sticky. A player who drags out and back to where they started has
    // still dragged, and the return must not be treated as a tap - otherwise letting
    // go rotates a piece that has just been put back where it was.
    //
    // The back-drag is a real move in its own right, so the piece goes right a cell and
    // then left a cell and ends where it started. What matters is that no rotate
    // appears anywhere in the sequence.
    const log = replay([
      { kind: "down" },
      { kind: "move", at: { x: 60, y: 0 } },
      { kind: "move", at: { x: 0, y: 0 } },
      { kind: "up" },
    ]);
    expect(log).not.toContain("rotate");
    expect(log).toEqual(["right", "left"]);
  });
});
