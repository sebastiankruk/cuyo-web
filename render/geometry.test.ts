/**
 * Tests for the canvas-free geometry and colour layer (task 13.3).
 *
 * These run in plain Node with no canvas, which is the point: if any of this
 * needed a rendering context it would live in board.ts instead.
 */

import { describe, expect, it } from "vitest";
import { GRX, GRY, NeighbourMode } from "../engine/game-core/constants.ts";
import {
  ART_COLOURS,
  boardHeight,
  boardWidth,
  borderBand,
  cellAt,
  cellOrigin,
  cellSizeFor,
  colourFor,
  dragCells,
  explosionProgress,
  explosionRadius,
  fitBoard,
  shade,
  stableHue,
  stubRect,
  stubRadius,
} from "./geometry.ts";
import type { BoardFrame } from "./geometry.ts";

const SIZE = 32;
const rect: BoardFrame = {
  size: SIZE,
  neighbours: NeighbourMode.Rect,
  mirror: false,
};
const hex: BoardFrame = {
  size: SIZE,
  neighbours: NeighbourMode.Hex6,
  mirror: false,
};
const mirrored: BoardFrame = {
  size: SIZE,
  neighbours: NeighbourMode.Rect,
  mirror: true,
};

describe("board dimensions", () => {
  it("is 10 by 20 cells", () => {
    expect(GRX).toBe(10);
    expect(GRY).toBe(20);
  });

  it("computes width and height from the cell size", () => {
    expect(boardWidth(SIZE)).toBe(320);
    expect(boardHeight(SIZE)).toBe(640);
  });
});

describe("fitBoard", () => {
  it("is width-bound on a tall narrow viewport", () => {
    const b = fitBoard(360, 800);
    expect(b.width).toBe(360);
    expect(b.height).toBe(720);
  });

  it("is height-bound on a short wide viewport", () => {
    const b = fitBoard(1200, 400);
    expect(b.width).toBe(200);
    expect(b.height).toBe(400);
  });

  it("always preserves the 1:2 proportion", () => {
    for (const [w, h] of [
      [360, 800],
      [1200, 400],
      [768, 1024],
      [320, 560],
    ]) {
      const b = fitBoard(w, h);
      expect(b.height / b.width).toBeCloseTo(2, 6);
      expect(b.width).toBeLessThanOrEqual(w + 1e-9);
      expect(b.height).toBeLessThanOrEqual(h + 1e-9);
    }
  });

  it("never returns a negative size", () => {
    expect(fitBoard(0, 0)).toEqual({ width: 0, height: 0 });
  });

  it("derives a cell size from an available width", () => {
    expect(cellSizeFor(320)).toBe(32);
  });
});

describe("cellOrigin: plain rect", () => {
  it("places a cell at its column times the cell size", () => {
    expect(cellOrigin(rect, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(cellOrigin(rect, 3, 5)).toEqual({ x: 96, y: 160 });
  });

  it("does not offset any column", () => {
    for (let x = 0; x < GRX; x++) {
      const { y } = cellOrigin(rect, x, 4);
      expect(y).toBe(4 * SIZE);
    }
  });
});

describe("cellOrigin: hex offset", () => {
  it("offsets odd columns by half a cell and leaves even columns alone", () => {
    expect(cellOrigin(hex, 0, 4)).toEqual({ x: 0, y: 128 });
    expect(cellOrigin(hex, 1, 4)).toEqual({ x: 32, y: 144 });
    expect(cellOrigin(hex, 2, 4)).toEqual({ x: 64, y: 128 });
    expect(cellOrigin(hex, 3, 4)).toEqual({ x: 96, y: 144 });
  });

  it("does not offset in a non-hex mode", () => {
    const eight: BoardFrame = { ...hex, neighbours: NeighbourMode.Eight };
    expect(cellOrigin(eight, 1, 4).y).toBe(128);
  });

  it("is independent of the row", () => {
    const a = cellOrigin(hex, 1, 0).y - 0;
    const b = cellOrigin(hex, 1, 7).y - 7 * SIZE;
    expect(a).toBe(b);
  });
});

describe("cellOrigin: mirror", () => {
  it("draws row 0 as the bottom cell", () => {
    // The returned point is the cell's top-left, so row 0 starts one cell up
    // from the floor.
    expect(cellOrigin(mirrored, 0, 0).y).toBe(boardHeight(SIZE) - SIZE);
    expect(cellOrigin(mirrored, 0, 0).y + SIZE).toBe(boardHeight(SIZE));
    expect(cellOrigin(mirrored, 0, GRY - 1).y).toBe(0);
  });

  it("keeps the column unchanged", () => {
    expect(cellOrigin(mirrored, 4, 7).x).toBe(4 * SIZE);
  });

  it("composes with the hex offset", () => {
    const both: BoardFrame = { ...hex, mirror: true };
    // Row 19 draws at the top, then the half-cell shift is added on top.
    expect(cellOrigin(both, 1, GRY - 1)).toEqual({ x: 32, y: 0 + 16 });
  });
});

describe("cellAt and dragCells", () => {
  it("maps a pixel back to its cell", () => {
    expect(cellAt(rect, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(cellAt(rect, 100, 200)).toEqual({ x: 3, y: 6 });
  });

  it("returns null outside the board", () => {
    expect(cellAt(rect, -1, 0)).toBeNull();
    expect(cellAt(rect, 0, boardHeight(SIZE))).toBeNull();
    expect(cellAt(rect, boardWidth(SIZE), 0)).toBeNull();
  });

  it("un-mirrors the row when hit testing a mirrored level", () => {
    // The bottom of a mirrored board is row 0.
    const bottom = boardHeight(SIZE) - 1;
    expect(cellAt(mirrored, 0, bottom)).toEqual({ x: 0, y: 0 });
  });

  it("counts whole cells in a drag", () => {
    expect(dragCells(rect, 0)).toBe(0);
    expect(dragCells(rect, 31)).toBe(0);
    expect(dragCells(rect, 32)).toBe(1);
    expect(dragCells(rect, -96)).toBe(-3);
  });
});

describe("borderBand", () => {
  it("grows downward from the top", () => {
    expect(borderBand(rect, 0)).toEqual({ x: 0, y: 0, w: 320, h: 0 });
    expect(borderBand(rect, 2)).toEqual({ x: 0, y: 0, w: 320, h: 64 });
  });

  it("grows upward from the bottom when mirrored", () => {
    expect(borderBand(mirrored, 2)).toEqual({ x: 0, y: 640 - 64, w: 320, h: 64 });
  });

  it("clamps to the board height", () => {
    expect(borderBand(rect, 999).h).toBe(boardHeight(SIZE));
    expect(borderBand(rect, -5).h).toBe(0);
  });

  it("always spans the full width", () => {
    for (const c of [0, 1, 10, 20]) {
      expect(borderBand(rect, c).w).toBe(boardWidth(SIZE));
    }
  });
});

describe("stubRect", () => {
  const none = { up: false, down: false, left: false, right: false };
  const all = { up: true, down: true, left: true, right: true };

  it("fills nearly the whole cell when fully connected", () => {
    const r = stubRect(rect, all);
    expect(r.w).toBeGreaterThan(SIZE * 0.8);
    expect(r.h).toBeGreaterThan(SIZE * 0.8);
  });

  it("insets when fully isolated", () => {
    const r = stubRect(rect, none);
    expect(r.w).toBeLessThan(SIZE * 0.5);
    expect(r.h).toBeLessThan(SIZE * 0.5);
  });

  it("extends only towards the connected side", () => {
    const leftOnly = stubRect(rect, { ...none, left: true });
    expect(leftOnly.x).toBeCloseTo(stubRect(rect, all).x, 5);
    const rightOnly = stubRect(rect, { ...none, right: true });
    expect(rightOnly.x).toBeGreaterThan(leftOnly.x);
  });

  it("reaches the cell edge on a connected side and not on a free one", () => {
    const r = stubRect(rect, { ...none, right: true, down: true });
    const full = stubRect(rect, all);
    expect(r.x + r.w).toBeCloseTo(full.x + full.w, 5);
    expect(r.y + r.h).toBeCloseTo(full.y + full.h, 5);
    // The free sides stay inset.
    expect(r.x).toBeGreaterThan(full.x);
    expect(r.y).toBeGreaterThan(full.y);
  });

  it("stays inside the cell", () => {
    for (const c of [none, all]) {
      const r = stubRect(rect, c);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(SIZE);
      expect(r.y + r.h).toBeLessThanOrEqual(SIZE);
    }
  });

  it("never exceeds the cell at a tiny size", () => {
    const tiny: BoardFrame = { ...rect, size: 2 };
    const r = stubRect(tiny, all);
    expect(r.w).toBeLessThanOrEqual(2);
    expect(r.h).toBeLessThanOrEqual(2);
  });

  it("has a positive radius", () => {
    expect(stubRadius(rect)).toBeGreaterThan(0);
  });
});

describe("colourFor", () => {
  it("returns the declared colour for a known art key", () => {
    expect(colourFor("inGruen", 0)).toBe(ART_COLOURS["inGruen"]);
  });

  it("is stable for an unknown key", () => {
    expect(colourFor("zzz-unknown", 0)).toBe(colourFor("zzz-unknown", 0));
  });

  it("varies by version for an unknown key", () => {
    expect(colourFor("zzz-unknown", 0)).not.toBe(colourFor("zzz-unknown", 1));
  });

  it("keeps a stable hue in range", () => {
    for (const k of ["", "a", "abc", "inGruen", "x".repeat(200)]) {
      const h = stableHue(k);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe("shade", () => {
  it("lightens and darkens a hex colour", () => {
    expect(shade("#808080", 0.5)).toBe("rgb(255,255,255)");
    expect(shade("#808080", 0)).toBe("rgb(128,128,128)");
    // 128 - 127.5 rounds to 1, so a half-step does not reach pure black.
    expect(shade("#808080", -0.5)).toBe("rgb(1,1,1)");
    expect(shade("#808080", -1)).toBe("rgb(0,0,0)");
  });

  it("clamps out-of-range results", () => {
    expect(shade("#ffffff", 1)).toBe("rgb(255,255,255)");
    expect(shade("#000000", -1)).toBe("rgb(0,0,0)");
  });

  it("shifts hsl lightness and clamps it", () => {
    expect(shade("hsl(200 50% 50%)", 0.5)).toBe("hsl(200 50% 96%)");
    expect(shade("hsl(200 50% 2%)", -0.5)).toBe("hsl(200 50% 4%)");
  });

  it("returns an unrecognised format unchanged instead of throwing", () => {
    expect(shade("rebeccapurple", 0.5)).toBe("rebeccapurple");
  });
});

describe("explosionProgress", () => {
  it("runs from 0 to 1 across the animation", () => {
    expect(explosionProgress(0, 8)).toBe(0);
    expect(explosionProgress(4, 8)).toBe(0.5);
    expect(explosionProgress(8, 8)).toBe(1);
  });

  it("clamps beyond the range", () => {
    expect(explosionProgress(20, 8)).toBe(1);
    expect(explosionProgress(-3, 8)).toBe(0);
  });

  it("is complete for a zero-length animation rather than dividing by zero", () => {
    expect(explosionProgress(1, 0)).toBe(1);
  });

  it("grows the bloom radius with progress", () => {
    expect(explosionRadius(rect, 1)).toBeGreaterThan(explosionRadius(rect, 0));
  });
});
