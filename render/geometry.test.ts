/**
 * Tests for the canvas-free geometry and colour layer (task 13.3).
 *
 * These run in plain Node with no canvas, which is the point: if any of this
 * needed a rendering context it would live in board.ts instead.
 */

import { describe, expect, it } from "vitest";
import {
  GRX,
  GRY,
  NeighbourMode,
  hexGeometry,
} from "../engine/game-core/constants.ts";
import {
  MARKER_RADIUS,
  boardHeight,
  boardWidth,
  borderBand,
  cellAt,
  cellOrigin,
  cellSizeFor,
  dragCells,
  explosionProgress,
  explosionRadius,
  fitBoard,
  markerInk,
  shade,
  stableHue,
  stubRect,
  stubRadius,
} from "./geometry.ts";
import type { BoardFrame, Contacts } from "./geometry.ts";
import { deltaE, labOfHsl } from "./perceptual.ts";

const SIZE = 32;
const rect: BoardFrame = {
  size: SIZE,
  hex: hexGeometry(NeighbourMode.Rect),
  mirror: false,
};
const hex: BoardFrame = {
  size: SIZE,
  hex: hexGeometry(NeighbourMode.Hex6),
  mirror: false,
};
const mirrored: BoardFrame = {
  size: SIZE,
  hex: hexGeometry(NeighbourMode.Rect),
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
    // The column offset is a property of the board, not of a blob's mode: the
    // level's own `neighbours` decides it.
    const eight: BoardFrame = { ...hex, hex: hexGeometry(NeighbourMode.Eight) };
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
    expect(borderBand(mirrored, 2)).toEqual({
      x: 0,
      y: 640 - 64,
      w: 320,
      h: 64,
    });
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

describe("stableHue", () => {
  // Still exported, still tested, but no longer used for anything a player sees: it was
  // the per-key hash whose collisions `palette.ts` exists to fix. Kept because it is a
  // reasonable deterministic hash and `shade` and the art manifest do not need it
  // removed to be correct - but nothing should reach for it to pick a colour again.
  it("keeps a stable hue in range", () => {
    for (const k of ["", "a", "abc", "inGruen", "x".repeat(200)]) {
      const h = stableHue(k);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(Number.isInteger(h)).toBe(true);
    }
  });

  it("is stable for a given key", () => {
    for (const k of ["", "inGruen", "zhlen"]) {
      expect(stableHue(k)).toBe(stableHue(k));
    }
  });
});

describe("the blob marker", () => {
  it("is a mark on the blob rather than the blob", () => {
    // The relationship that matters. `stubRect` insets an isolated blob and then pulls
    // its free edges inwards, so a blob is much narrower than its cell, and a marker
    // sized as a fraction of the *cell* can easily end up nearly as wide as the thing it
    // is marking. It did: 91%, which made a row of goal blobs read as a row of white
    // circles in green pills.
    //
    // Both numbers are asserted together because either can be changed on its own, and
    // a change to `stubRect` would quietly undo the marker's size.
    const noContacts: Contacts = {
      left: false,
      right: false,
      up: false,
      down: false,
    };
    const blob = stubRect(rect, noContacts);
    const marker = MARKER_RADIUS * 2 * SIZE;
    const fraction = marker / blob.w;
    expect(
      fraction,
      `marker is ${(fraction * 100).toFixed(0)}% of the blob's width`,
    ).toBeGreaterThan(0.25);
    expect(
      fraction,
      `marker is ${(fraction * 100).toFixed(0)}% of the blob's width`,
    ).toBeLessThan(0.6);
  });

  it("stays inside the blob even when the blob is at its widest", () => {
    // A blob in the middle of a group spans the full padded cell, so the marker is a
    // larger fraction of it there. It must still fit, or the mark spills over the seam
    // and onto the neighbour.
    const allTouching: Contacts = {
      left: true,
      right: true,
      up: true,
      down: true,
    };
    const blob = stubRect(rect, allTouching);
    expect(MARKER_RADIUS * 2 * SIZE).toBeLessThan(blob.w);
    expect(MARKER_RADIUS * 2 * SIZE).toBeLessThan(blob.h);
  });
});

describe("markerInk", () => {
  it("reads against every fill the palette can produce", () => {
    // The mark is six pixels across. If its contrast against the blob is marginal, the
    // *shape* distinction between a goal and a grey quietly stops working, and nothing
    // else on the board changes to say so.
    //
    // The fills are the ones that actually occur: every grey in the ladder, the goal
    // green on both backgrounds, and the extremes of the palette's own range.
    const fills = [
      "hsl(0 0% 72%)",
      "hsl(0 0% 60%)",
      "hsl(0 0% 46%)",
      "hsl(0 0% 34%)",
      "hsl(96 55% 52%)",
      "hsl(96 50% 42%)",
      "hsl(240 70% 48%)",
      "hsl(45 70% 34%)",
      "hsl(200 70% 70%)",
      "hsl(300 70% 60%)",
    ];
    for (const fill of fills) {
      const ink = markerInk(fill);
      const d = deltaE(labOfHsl(ink)!, labOfHsl(fill)!);
      expect(
        d,
        `mark on ${fill} is ΔE ${d.toFixed(1)} (${ink})`,
      ).toBeGreaterThan(25);
    }
  });

  it("darkens a pale fill and lightens a dark one", () => {
    // The point of measuring the direction rather than assuming it. A mark has nowhere
    // to lighten to on a pale fill, and the lightest grey in the ladder is pale.
    const pale = labOfHsl(markerInk("hsl(0 0% 72%)"))!;
    const paleFill = labOfHsl("hsl(0 0% 72%)")!;
    expect(pale[0]).toBeLessThan(paleFill[0]);

    const dark = labOfHsl(markerInk("hsl(0 0% 34%)"))!;
    const darkFill = labOfHsl("hsl(0 0% 34%)")!;
    expect(dark[0]).toBeGreaterThan(darkFill[0]);
  });

  it("falls back to a light mark for a colour it cannot read", () => {
    // Defensive: a malformed colour should give a visible mark, not throw mid-frame.
    expect(markerInk("rebeccapurple")).toBe(shade("rebeccapurple", 0.55));
  });
});

describe("shade", () => {
  it("moves a fraction of the way to white or black, not a fixed step", () => {
    // The property, on both formats. A fixed step is the same size on every fill, which
    // made the blob's seam invisible on a dark blob and heavy on a pale one - see the
    // note on `shade`.
    expect(shade("#808080", 0)).toBe("rgb(128,128,128)");
    // Half of the 127 remaining to white.
    expect(shade("#808080", 0.5)).toBe("rgb(192,192,192)");
    // A quarter of the way to white is a quarter of the remaining headroom, so a lighter
    // fill moves less in absolute terms - which is the point.
    expect(shade("#404040", 0.5)).toBe("rgb(160,160,160)");
    // And towards black, symmetrically.
    expect(shade("#808080", -0.5)).toBe("rgb(64,64,64)");
    expect(shade("#c0c0c0", -0.5)).toBe("rgb(96,96,96)");
    expect(shade("hsl(200 50% 50%)", 0.5)).toBe("hsl(200 50% 75%)");
    expect(shade("hsl(200 50% 50%)", -0.5)).toBe("hsl(200 50% 25%)");
    // A small step is small on a light fill and proportionally larger on a dark one.
    expect(shade("hsl(200 50% 80%)", 0.2)).toBe("hsl(200 50% 84%)");
    expect(shade("hsl(200 50% 20%)", 0.2)).toBe("hsl(200 50% 36%)");
  });

  it("keeps the seam a roughly constant weight on every fill", () => {
    // The reason the semantics changed, stated as a test so it cannot quietly revert:
    // the seam is `shade(colour, -0.28)` and its contrast against its own fill must not
    // collapse at the dark end, which is what a fixed step did - ΔE 1 at fill L=30.
    for (const l of [30, 40, 50, 60, 70, 80]) {
      const fill = `hsl(0 0% ${l}%)`;
      const seam = shade(fill, -0.28);
      const d = deltaE(labOfHsl(seam)!, labOfHsl(fill)!);
      expect(
        d,
        `seam on a fill of L=${l} is ΔE ${d.toFixed(1)}`,
      ).toBeGreaterThan(5);
      expect(d, `seam on a fill of L=${l} is ΔE ${d.toFixed(1)}`).toBeLessThan(
        30,
      );
    }
  });

  it("clamps out-of-range results", () => {
    expect(shade("#ffffff", 1)).toBe("rgb(255,255,255)");
    expect(shade("#ffffff", 5)).toBe("rgb(255,255,255)");
    expect(shade("#000000", -1)).toBe("rgb(0,0,0)");
    // The lightness floor exists so a marker is never invisible against its own blob.
    expect(shade("hsl(200 50% 2%)", -0.5)).toBe("hsl(200 50% 4%)");
    expect(shade("hsl(200 50% 98%)", 0.5)).toBe("hsl(200 50% 96%)");
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
