/**
 * Tests for the canvas wiring, using a recording context instead of a browser.
 *
 * This is the seam where the "black screen" bug lived. `render/` keeps its
 * geometry in canvas-free functions so they can be unit-tested, but nothing
 * tested the *agreement* between the renderer's assumption - the canvas is exactly
 * ten cells wide and twenty tall - and what the app actually put on screen. The
 * board was drawn four times taller than the canvas, so only the top five of
 * twenty rows were visible, and both shipped levels put every blob in the bottom
 * row. The board looked empty; buttons and text were fine.
 *
 * So both halves are pinned here: the arithmetic that sizes the canvas, and the
 * draw calls that come out of `render`.
 *
 * The remaining untested seam is `PlayScreen`'s own measurement of the available
 * box - the one thing a future edit can get wrong without failing anything here,
 * since these tests compute the sizing themselves rather than asking the component
 * for it. That needs a DOM environment and is recorded as a task (13.8). The
 * geometry tests below deliberately include the failure mode of the old code, and
 * they do catch it.
 */

import { describe, expect, it } from "vitest";
import { GRX, GRY } from "../engine/game-core/constants.ts";
import { boardSizing, boardHeight, boardWidth } from "./geometry.ts";
import { render } from "./board.ts";
import { Simulation } from "../engine/game-core/simulation.ts";
import { FIXTURES } from "../engine/level-format/fixtures.ts";

/**
 * A canvas context that records what was asked of it.
 *
 * Not a mock library: a plain object with the handful of members `render` uses,
 * because the point is to assert the *shape* of the output - how many cells, what
 * colour, where - and a recording of real calls is more informative than an
 * assertion count would be.
 */
interface Recorded {
  fills: { x: number; y: number; w: number; h: number; style: string }[];
  strokes: number;
  clears: number;
  /** Every fillStyle ever set, in order. */
  styles: string[];
  arcs: number;
}

function recordingContext(): { ctx: CanvasRenderingContext2D; log: Recorded } {
  const log: Recorded = { fills: [], strokes: 0, clears: 0, styles: [], arcs: 0 };
  const state = { fillStyle: "#000000", strokeStyle: "#000000" };
  const ctx = {
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: string) {
      state.fillStyle = v;
      log.styles.push(v);
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(v: string) {
      state.strokeStyle = v;
    },
    lineWidth: 1,
    globalAlpha: 1,
    clearRect() {
      log.clears++;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      log.fills.push({ x, y, w, h, style: state.fillStyle });
    },
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {
      log.arcs++;
    },
    fill() {
      const r = lastRect;
      if (r !== null) log.fills.push({ ...r, style: state.fillStyle });
    },
    stroke() {
      log.strokes++;
    },
    save() {},
    restore() {},
    setTransform() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
  } as unknown as CanvasRenderingContext2D;
  // `render` builds each cell with moveTo/arcTo then fill, so the rect has to be
  // picked up from those rather than passed to fill.
  let lastRect: { x: number; y: number; w: number; h: number } | null = null;
  const track = ctx as unknown as Record<string, unknown>;
  let ox = 0;
  let oy = 0;
  track["moveTo"] = (x: number, y: number) => {
    ox = x;
    oy = y;
  };
  track["lineTo"] = (x: number, y: number) => {
    lastRect = { x: ox, y: oy, w: Math.abs(x - ox), h: Math.abs(y - oy) };
  };
  return { ctx, log };
}

function simulate(make: () => ReturnType<typeof FIXTURES[number]["make"]>): Simulation {
  const sim = new Simulation(make(), { seed: 1 });
  // A few steps so a piece is falling and the start layout has settled.
  for (let i = 0; i < 6; i++) sim.step();
  return sim;
}

describe("boardSizing", () => {
  it("gives a backing store in exactly the board's 1:2 proportion", () => {
    for (const [w, h] of [
      [600, 900],
      [390, 844],
      [1024, 768],
      [320, 480],
      [200, 4000],
    ]) {
      const s = boardSizing(w, h, 1);
      expect(
        s.pixelsY / s.pixelsX,
        `${w}x${h} is not 1:2 (${s.pixelsX}x${s.pixelsY})`,
      ).toBeCloseTo(GRY / GRX, 6);
    }
  });

  it("scales the backing store by the device pixel ratio and nothing else", () => {
    const one = boardSizing(600, 900, 1);
    const two = boardSizing(600, 900, 2);
    expect(two.size).toBe(one.size);
    expect(two.pixelsX).toBe(one.pixelsX * 2);
    expect(two.pixelsY).toBe(one.pixelsY * 2);
  });

  it("is bounded by whichever of width and height is tighter", () => {
    // Wide and short: the height is binding.
    const wide = boardSizing(2000, 300);
    expect(wide.pixelsY).toBeLessThanOrEqual(300);
    expect(wide.pixelsX).toBeLessThanOrEqual(2000);
    // Tall and narrow: the width is binding.
    const tall = boardSizing(300, 2000);
    expect(tall.pixelsX).toBeLessThanOrEqual(300);
    expect(tall.pixelsY).toBeLessThanOrEqual(2000);
  });

  it("produces a board that exactly fills the backing store", () => {
    // The property that was broken: `render` draws boardWidth x boardHeight, and
    // that has to be what the canvas is.
    const s = boardSizing(600, 900, 1);
    expect(s.pixelsX).toBe(boardWidth(s.size));
    expect(s.pixelsY).toBe(boardHeight(s.size));
  });

  it("ignores a height that layout has not produced yet", () => {
    // A flex or grid parent reports zero height on the first commit. Obeying
    // that would size the board to nothing, which is a blank canvas on exactly
    // the one frame a user would notice it on.
    //
    // The comparison is against a box so tall that the width is the binding
    // constraint, since that is what "ignore the height" has to produce. Not
    // against a short box, where height does bind and the answer is smaller.
    const widthBound = boardSizing(600, 4000, 1);
    expect(boardSizing(600, 0, 1)).toEqual(widthBound);
    expect(boardSizing(600, Number.NaN, 1)).toEqual(widthBound);
    expect(boardSizing(600, Number.POSITIVE_INFINITY, 1)).toEqual(widthBound);
    expect(widthBound.size).toBe(60);
  });

  it("still refuses to invent a board out of no width", () => {
    // The other half of the same guard: a zero width is a real constraint, not a
    // missing measurement, so it must not fall back to some default size.
    expect(boardSizing(0, 0, 1).size).toBe(0);
    expect(boardSizing(0, 900, 1).size).toBe(0);
  });

  it("falls back to 1 for a device pixel ratio that cannot be used", () => {
    // 0 or NaN would size the backing store to 0x0 - a blank canvas, even though
    // the cell size is fine. Same symptom, one layer down.
    const good = boardSizing(600, 900, 1);
    for (const dpr of [0, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(boardSizing(600, 900, dpr), `dpr ${dpr}`).toEqual(good);
    }
  });

  it("never returns a non-finite size", () => {
    for (const [w, h] of [
      [0, 0],
      [Number.NaN, 900],
      [600, Number.NaN],
      [Number.POSITIVE_INFINITY, 900],
    ]) {
      const s = boardSizing(w, h, 1);
      expect(Number.isFinite(s.size), `${w}x${h} gave ${s.size}`).toBe(true);
      expect(Number.isFinite(s.pixelsX)).toBe(true);
      expect(Number.isFinite(s.pixelsY)).toBe(true);
    }
  });
});

describe("render fills the whole board", () => {
  for (const fixture of FIXTURES) {
    const level = fixture.make();
    it(`clears and fills the canvas for ${level.id}`, () => {
      const { ctx, log } = recordingContext();
      const sizing = boardSizing(600, 900, 1);
      render(ctx, simulate(fixture.make), sizing.size);

      expect(log.clears).toBeGreaterThan(0);
      // The first fill is the background, and it must cover the whole board -
      // this is what the user saw as a black rectangle.
      const first = log.fills[0];
      expect(first?.style).toBe(level.colours.background);
      expect(first?.w).toBe(boardWidth(sizing.size));
      expect(first?.h).toBe(boardHeight(sizing.size));
    });

    it(`draws a cell for every blob on the board, plus the falling piece`, () => {
      const { ctx, log } = recordingContext();
      const sizing = boardSizing(600, 900, 1);
      const sim = simulate(fixture.make);
      render(ctx, sim, sizing.size);

      // `occupied()` is a generator, so it has to be drained before counting.
      const occupied = [...sim.board.occupied()].length;
      const piece = sim.fall === null ? 0 : sim.piecePositions(sim.fall).length;
      // If a test silently counted zero blobs the assertion below would pass
      // vacuously, so the inputs are stated rather than assumed.
      expect(sim.fall, "no falling piece to draw").not.toBeNull();
      // One background fill, then one fill per blob.
      expect(log.fills.length).toBe(1 + occupied + piece);
      expect(occupied).toBeGreaterThan(0);
    });

    it(`draws every cell inside the canvas`, () => {
      // The regression itself: nothing may be drawn below the canvas.
      const { ctx, log } = recordingContext();
      const sizing = boardSizing(600, 900, 1);
      render(ctx, simulate(fixture.make), sizing.size);
      for (const fill of log.fills) {
        expect(fill.y + fill.h).toBeLessThanOrEqual(sizing.pixelsY + 1);
        expect(fill.x + fill.w).toBeLessThanOrEqual(sizing.pixelsX + 1);
      }
    });

    it(`gives each kind a colour that is not the background`, () => {
      // A blob drawn in the background colour is invisible, which is a different
      // way to get an empty-looking board.
      const { ctx, log } = recordingContext();
      const sizing = boardSizing(600, 900, 1);
      render(ctx, simulate(fixture.make), sizing.size);
      const blobColours = new Set(log.fills.slice(1).map((f) => f.style));
      expect(blobColours.size).toBeGreaterThan(1);
      for (const colour of blobColours) {
        expect(colour).not.toBe(level.colours.background);
      }
    });
  }
});