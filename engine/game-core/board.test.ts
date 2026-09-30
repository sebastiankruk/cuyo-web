/**
 * Connectivity and component computation, per neighbour mode.
 *
 * Task 13.1 checks the offset tables against upstream's own encoding; this file
 * checks that the rules built on top of them behave correctly, including the
 * `inhibit` handling, which is the easiest part of upstream to misread because
 * it is stored as a per-blob bit field interpreted in each blob's own frame.
 */

import { describe, expect, it } from "vitest";
import { Board, Blob, componentOf, connected } from "./board.ts";
import { FLOATS, NeighbourMode } from "./constants.ts";
import type { Kind } from "../level-format/level-data.ts";

const COLOUR: Kind = {
  id: 0,
  name: "colour",
  role: "colour",
  artKey: "colour",
  versions: 1,
  weight: 1,
  behaviour: 9, // explodes_on_size | calculate_size
  numexplode: 4,
  colourProb: 1,
  greyProb: 0,
  goalProb: 0,
  distKey: null,
};

const OTHER: Kind = { ...COLOUR, id: 1, name: "other", artKey: "other" };

function blob(kind: Kind, inhibit = 0): Blob {
  const b = new Blob();
  b.initFromKind(kind);
  b.inhibit = inhibit;
  return b;
}

/** Places `kind` at (x, y) and `other` at (ox, oy). */
function boardWith(
  a: { x: number; y: number; kind: Kind; inhibit?: number },
  b: { x: number; y: number; kind: Kind; inhibit?: number },
): Board {
  const board = new Board();
  board.set(a.x, a.y, blob(a.kind, a.inhibit ?? 0));
  board.set(b.x, b.y, blob(b.kind, b.inhibit ?? 0));
  return board;
}

describe("connected: same kind and mode", () => {
  it("connects horizontally in rect mode", () => {
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR },
      { x: 5, y: 9, kind: COLOUR },
    );
    expect(connected(board, NeighbourMode.Rect, 4, 9, 5, 9)).toBe(true);
  });

  it("does not connect diagonally in rect mode", () => {
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR },
      { x: 5, y: 10, kind: COLOUR },
    );
    expect(connected(board, NeighbourMode.Rect, 4, 9, 5, 10)).toBe(false);
  });

  it("connects diagonally in diagonal mode and not orthogonally", () => {
    const diagonal = boardWith(
      { x: 4, y: 9, kind: COLOUR },
      { x: 5, y: 10, kind: COLOUR },
    );
    expect(connected(diagonal, NeighbourMode.Diagonal, 4, 9, 5, 10)).toBe(true);
    expect(connected(diagonal, NeighbourMode.Diagonal, 4, 9, 5, 9)).toBe(false);
  });

  it("connects in both orientations for queen mode", () => {
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR },
      { x: 5, y: 10, kind: COLOUR },
    );
    board.set(5, 9, blob(COLOUR));
    expect(connected(board, NeighbourMode.Eight, 4, 9, 5, 10)).toBe(true);
    expect(connected(board, NeighbourMode.Eight, 4, 9, 5, 9)).toBe(true);
  });

  it("never connects in neighbours_none", () => {
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR },
      { x: 5, y: 9, kind: COLOUR },
    );
    expect(connected(board, NeighbourMode.None, 4, 9, 5, 9)).toBe(false);
  });

  it("refuses to connect different kinds in every mode", () => {
    for (const mode of [
      NeighbourMode.Rect,
      NeighbourMode.Diagonal,
      NeighbourMode.Eight,
      NeighbourMode.Knight,
    ]) {
      const board = boardWith(
        { x: 4, y: 9, kind: COLOUR },
        { x: 5, y: 9, kind: OTHER },
      );
      expect(connected(board, mode, 4, 9, 5, 9), `mode ${mode}`).toBe(false);
    }
  });

  it("refuses to connect an empty cell", () => {
    const board = new Board();
    board.set(4, 9, blob(COLOUR));
    expect(connected(board, NeighbourMode.Rect, 4, 9, 5, 9)).toBe(false);
  });
});

describe("connected: hex modes use the column's own offsets", () => {
  it("reaches across from both column parities in hex6", () => {
    // Both parities offer the straight-across link, so a row of blobs is
    // connected either side of a column boundary.
    const board = new Board();
    for (let x = 0; x < 3; x++) board.set(x, 9, blob(COLOUR));
    expect(connected(board, NeighbourMode.Hex6, 0, 9, 1, 9)).toBe(true);
    expect(connected(board, NeighbourMode.Hex6, 1, 9, 2, 9)).toBe(true);
  });

  it("reaches up-right from a shifted column but not an unshifted one", () => {
    // This is the distinction that makes hex6 work: the same geometric
    // up-right neighbour is a neighbour of column 1 but not of column 0.
    const board = new Board();
    board.set(0, 9, blob(COLOUR));
    board.set(1, 9, blob(COLOUR));
    board.set(1, 8, blob(COLOUR));
    board.set(2, 8, blob(COLOUR));

    expect(connected(board, NeighbourMode.Hex6, 1, 9, 2, 8)).toBe(true);
    expect(connected(board, NeighbourMode.Hex6, 0, 9, 1, 8)).toBe(false);
  });

  it("never uses a plain horizontal-only link in hex4 across the wrong row", () => {
    // Upstream's hex4 rows use dy 0 and dy -1 when shifted, 0 and +1 when not.
    const board = boardWith(
      { x: 1, y: 9, kind: COLOUR },
      { x: 2, y: 9, kind: COLOUR },
    );
    expect(connected(board, NeighbourMode.Hex4, 1, 9, 2, 9)).toBe(true);

    const shiftedOnly = boardWith(
      { x: 1, y: 9, kind: COLOUR },
      { x: 2, y: 8, kind: COLOUR },
    );
    expect(connected(shiftedOnly, NeighbourMode.Hex4, 1, 9, 2, 8)).toBe(true);
    // The same pair read from an unshifted column is the down-diagonal instead.
    expect(connected(shiftedOnly, NeighbourMode.Hex4, 0, 9, 1, 8)).toBe(false);
  });
});

describe("connected: inhibit is interpreted in each blob's own frame", () => {
  // For a at (4,9) reaching towards b at (5,9): a sees RIGHT (0x4) and b sees
  // LEFT (0x40000). Each blob's mask is read in its own frame.
  const DIR_R = 0x4;
  const DIR_L = 0x40000;

  it("breaks the link when the first blob inhibits the direction to its neighbour", () => {
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR, inhibit: DIR_R },
      { x: 5, y: 9, kind: COLOUR },
    );
    expect(connected(board, NeighbourMode.Rect, 4, 9, 5, 9)).toBe(false);
  });

  it("breaks the link when only the second blob inhibits the direction back", () => {
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR },
      { x: 5, y: 9, kind: COLOUR, inhibit: DIR_L },
    );
    expect(connected(board, NeighbourMode.Rect, 4, 9, 5, 9)).toBe(false);
  });

  it("is symmetric: either blob alone can break the link", () => {
    const firstBlocks = boardWith(
      { x: 4, y: 9, kind: COLOUR, inhibit: DIR_R },
      { x: 5, y: 9, kind: COLOUR },
    );
    const secondBlocks = boardWith(
      { x: 4, y: 9, kind: COLOUR },
      { x: 5, y: 9, kind: COLOUR, inhibit: DIR_L },
    );
    expect(connected(firstBlocks, NeighbourMode.Rect, 4, 9, 5, 9)).toBe(false);
    expect(connected(secondBlocks, NeighbourMode.Rect, 4, 9, 5, 9)).toBe(false);
  });

  it("keeps the link when the inhibited direction is the other way", () => {
    // a inhibits LEFT, but its neighbour is to the right.
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR, inhibit: DIR_L },
      { x: 5, y: 9, kind: COLOUR },
    );
    expect(connected(board, NeighbourMode.Rect, 4, 9, 5, 9)).toBe(true);
  });

  it("does not let one blob's inhibition break an unrelated direction", () => {
    const board = boardWith(
      { x: 4, y: 9, kind: COLOUR, inhibit: 0x40000 }, // no left
      { x: 4, y: 10, kind: COLOUR },
    );
    // Vertical is untouched by a left-direction inhibition.
    expect(connected(board, NeighbourMode.Rect, 4, 9, 4, 10)).toBe(true);
  });
});

describe("componentOf", () => {
  it("gathers a run of same-kind blobs and sums their weights", () => {
    const board = new Board();
    for (let x = 0; x < 3; x++) {
      const b = blob(COLOUR);
      b.weight = x + 1; // 1 + 2 + 3 = 6
      board.set(x, 9, b);
    }
    const comp = componentOf(board, NeighbourMode.Rect, 0, 9);
    expect(comp.positions).toHaveLength(3);
    expect(comp.weight).toBe(6);
  });

  it("stops at a blob of a different kind", () => {
    const board = new Board();
    board.set(0, 9, blob(COLOUR));
    board.set(1, 9, blob(OTHER));
    board.set(2, 9, blob(COLOUR));
    const comp = componentOf(board, NeighbourMode.Rect, 0, 9);
    expect(comp.positions).toHaveLength(1);
    expect(comp.weight).toBe(1);
  });

  it("is empty for a cell with nothing in it", () => {
    expect(componentOf(new Board(), NeighbourMode.Rect, 3, 3).positions).toEqual([]);
  });

  it("returns nothing for a blob that is already exploding", () => {
    const board = new Board();
    const b = blob(COLOUR);
    b.exploding = 3;
    board.set(0, 9, b);
    expect(componentOf(board, NeighbourMode.Rect, 0, 9).positions).toEqual([]);
  });

  it("does not leak across a diagonal gap in rect mode", () => {
    // A staircase touches only diagonally, which rect mode must not join.
    const board = new Board();
    board.set(0, 9, blob(COLOUR));
    board.set(1, 10, blob(COLOUR));
    board.set(2, 11, blob(COLOUR));
    expect(componentOf(board, NeighbourMode.Rect, 0, 9).positions).toHaveLength(1);
  });

  it("joins the same staircase in diagonal mode", () => {
    const board = new Board();
    board.set(0, 9, blob(COLOUR));
    board.set(1, 10, blob(COLOUR));
    board.set(2, 11, blob(COLOUR));
    expect(componentOf(board, NeighbourMode.Diagonal, 0, 9).positions).toHaveLength(3);
  });

  it("reaches a knight's move away only in knight mode", () => {
    const board = new Board();
    board.set(4, 9, blob(COLOUR));
    board.set(6, 10, blob(COLOUR));
    expect(componentOf(board, NeighbourMode.Knight, 4, 9).positions).toHaveLength(2);
    expect(componentOf(board, NeighbourMode.Rect, 4, 9).positions).toHaveLength(1);
  });

  it("honours a floating blob as a member but still connects", () => {
    const board = new Board();
    const floating = blob(COLOUR);
    floating.behaviour |= FLOATS;
    board.set(0, 9, floating);
    board.set(1, 9, blob(COLOUR));
    // Floating affects gravity, not connectivity.
    expect(componentOf(board, NeighbourMode.Rect, 0, 9).positions).toHaveLength(2);
  });

  it("is symmetric about which member is used as the start", () => {
    const board = new Board();
    for (let x = 0; x < 4; x++) board.set(x, 5, blob(COLOUR));
    const fromLeft = componentOf(board, NeighbourMode.Rect, 0, 5);
    const fromRight = componentOf(board, NeighbourMode.Rect, 3, 5);
    expect(fromLeft.weight).toBe(fromRight.weight);
    expect(fromLeft.positions).toHaveLength(fromRight.positions.length);
  });
});
