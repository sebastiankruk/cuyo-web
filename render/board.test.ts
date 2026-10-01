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
import { GRIC, GRX, GRY, hexGeometry } from "../engine/game-core/constants.ts";
import {
  boardSizing,
  boardHeight,
  boardWidth,
  cellOrigin,
  colourFor,
} from "./geometry.ts";
import type { BoardFrame } from "./geometry.ts";
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
  /** Centres and radii of every arc, for asserting the goal/grey markers. */
  arcAt: { x: number; y: number; r: number }[];
  /** rect() calls, which the grey marker uses. */
  rects: { x: number; y: number; w: number; h: number }[];
}

function recordingContext(): { ctx: CanvasRenderingContext2D; log: Recorded } {
  const log: Recorded = {
    fills: [],
    strokes: 0,
    clears: 0,
    styles: [],
    arcs: 0,
    arcAt: [],
    rects: [],
  };
  const state = { fillStyle: "#000000", strokeStyle: "#000000" };
  /**
   * Bounding box of the current path, accumulated from every point passed to it.
   *
   * `render` builds a cell with `moveTo` then four `arcTo` calls, so the shape has
   * to be recovered from the path rather than read from the arguments of `fill`.
   * An earlier version of this stub took the box from `moveTo`/`lineTo` only and
   * left `arcTo` inert, which meant `fill()` reported the box belonging to whatever
   * path came before it - the highlight line of the previous cell, usually. The
   * recording was wrong, and it reported the renderer drawing one colour twice when
   * the renderer was in fact correct.
   */
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  const point = (x: number, y: number): void => {
    if (box === null) box = { x0: x, y0: y, x1: x, y1: y };
    else {
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
    }
  };
  const boxRect = (): { x: number; y: number; w: number; h: number } | null => {
    if (box === null) return null;
    return { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 };
  };
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
    beginPath() {
      box = null;
    },
    closePath() {},
    moveTo: point,
    lineTo: point,
    /**
     * `arcTo(x1, y1, x2, y2, r)` passes through `(x1, y1)`, so both control points
     * are part of the path and both belong in the box.
     */
    arcTo(x1: number, y1: number, x2: number, y2: number) {
      point(x1, y1);
      point(x2, y2);
    },
    arc(x: number, y: number, radius: number) {
      point(x - radius, y - radius);
      point(x + radius, y + radius);
      log.arcs++;
      log.arcAt.push({ x, y, r: radius });
    },
    rect(x: number, y: number, w: number, h: number) {
      point(x, y);
      point(x + w, y + h);
      log.rects.push({ x, y, w, h });
    },
    fill() {
      const r = boxRect();
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
  return { ctx, log };
}

function simulate(
  make: () => ReturnType<(typeof FIXTURES)[number]["make"]>,
): Simulation {
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

  it("keeps the backing store an exact multiple of the board's CSS size", () => {
    // The canvas element's box is set in CSS pixels and its backing store in
    // device pixels, and they have to agree or the board is scaled - which is what
    // happened on a tablet when the two were left to be reconciled by CSS against
    // an element whose intrinsic size was in device pixels: the board came out
    // roughly square in a wide viewport.
    //
    // Pinned for a range of viewports and ratios, because it only misbehaved on
    // the large-and-landscape ones.
    for (const dpr of [1, 1.5, 2, 3]) {
      for (const [w, h] of [
        [1024, 768],
        [834, 1112],
        [1112, 834],
        [390, 844],
        [2048, 1536],
      ]) {
        const s = boardSizing(w, h, dpr);
        // Rounded, because the backing store is an integer number of device pixels
        // and a fractional CSS size times a fractional ratio need not be. The point
        // being pinned is that the multiple is exact to within that rounding, not
        // that it is never fractional.
        expect(s.pixelsX, `${w}x${h} @${dpr}`).toBe(
          Math.round(boardWidth(s.size) * dpr),
        );
        expect(s.pixelsY, `${w}x${h} @${dpr}`).toBe(
          Math.round(boardHeight(s.size) * dpr),
        );
      }
    }
  });

  it("fills the available box on a landscape tablet rather than shrinking", () => {
    // The regression, in the shape it actually appeared: an 11x8.5in tablet in
    // landscape has far more width than height, so height binds and the board
    // should be as tall as the box allows. It came out roughly square and small
    // instead, which meant it was not using the space it had.
    const s = boardSizing(1112, 834, 2);
    expect(boardHeight(s.size)).toBeCloseTo(834, 6);
    expect(boardWidth(s.size)).toBeCloseTo(417, 6);
    // Sanity on the shape it actually had: about 380x375, i.e. not 1:2 at all.
    expect(boardHeight(s.size) / boardWidth(s.size)).toBeCloseTo(GRY / GRX, 6);
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
      const occupied = [...sim.board.occupied()];
      const piece = sim.fall === null ? 0 : sim.piecePositions(sim.fall).length;
      // If a test silently counted zero blobs the assertion below would pass
      // vacuously, so the inputs are stated rather than assumed.
      expect(sim.fall, "no falling piece to draw").not.toBeNull();

      // One background fill, one per blob, one per piece cell, and one more for
      // every blob that carries a goal or grey marker - a marker is a fill of its
      // own, so leaving it out here would have made this count wrong the moment
      // markers were added.
      const marked = occupied.filter((p) => {
        const role = sim.kindAt(p.x, p.y)?.role;
        return role === "grass" || role === "grey";
      }).length;
      expect(
        log.fills.length,
        `background + ${occupied.length} blobs + ${piece} piece cells + ${marked} markers`,
      ).toBe(1 + occupied.length + piece + marked);
      expect(occupied.length).toBeGreaterThan(0);
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

    it(`puts each blob in its own cell`, () => {
      // The regression: `stubRect` gives a shape *within* a cell, and it has to be
      // moved to that cell's origin before filling. Without the move every blob
      // was filled at the same near-origin rectangle, so the board piled up in the
      // top-left corner and looked like a single sprite on an empty grid.
      //
      // Counting fills could not catch this - the count was right and every fill
      // was inside the canvas. What distinguishes it is that two blobs in
      // different columns get *different* x, and two in different rows different y.
      const { ctx, log } = recordingContext();
      const sizing = boardSizing(600, 900, 1);
      const sim = simulate(fixture.make);
      render(ctx, sim, sizing.size);

      const frame: BoardFrame = {
        size: sizing.size,
        hex: hexGeometry(level.neighbours),
        mirror: level.mirror,
      };
      // The fills after the background, one per blob then one per piece cell.
      const drawn = log.fills.slice(1);
      const boardBlobs = [...sim.board.occupied()].map(({ x, y }) => ({
        x,
        y,
        origin: cellOrigin(frame, x, y),
      }));
      // Every board blob's origin must be matched by a fill near it. The fallback
      // art is drawn with a small inset, so the fill starts a little right of and
      // below the cell origin - within a cell is the requirement.
      for (const { x, y, origin } of boardBlobs) {
        const near = drawn.some(
          (f) =>
            Math.abs(f.x - origin.x) < sizing.size &&
            Math.abs(f.y - origin.y) < sizing.size,
        );
        expect(
          near,
          `no fill near cell (${x},${y}) at ${origin.x},${origin.y}`,
        ).toBe(true);
      }
      // And the drawn fills must not all be in the same place, which is the
      // shape of the bug: many cells, one position.
      const distinctXs = new Set(drawn.map((f) => f.x));
      const distinctYs = new Set(drawn.map((f) => f.y));
      expect(distinctXs.size).toBeGreaterThan(1);
      expect(distinctYs.size).toBeGreaterThan(1);
    });

    it("draws the piece's own colours, in every orientation", () => {
      // The regression: the renderer inferred which blob occupied a cell from the
      // column, which cannot work for a vertical piece because both of its cells
      // share one column. The lower blob was reported for both, so a blue-and-red
      // piece standing up came out red-and-red, and rotated once more it looked
      // right again - which is what made it read as a rendering quirk rather than
      // a bug.
      //
      // The piece is positioned by hand so both orientations are covered
      // regardless of what the picker produced, and dropped far enough down the
      // board that both of its cells are on-screen - a piece at spawn has its top
      // cell above row 0, where it is deliberately not drawn.
      for (const orientation of ["vertical", "horizontal"] as const) {
        const sim = new Simulation(fixture.make(), { seed: 1 });
        const piece = sim.fall;
        expect(piece, "expected a piece to be in play").not.toBeNull();
        // Give the two halves clearly different kinds so a swap is visible. The
        // fixtures' own pair is already two distinct kinds, which is all this needs.
        expect(piece!.blobs[0].kind).not.toBe(piece!.blobs[1].kind);
        piece!.orientation = orientation;
        // 14 rows down, so both cells are well inside the board.
        piece!.yPx = 14 * GRIC + GRIC - 1;

        // The board's own blobs are cleared before drawing, so only the piece is
        // measured. The start layout is dense near the bottom of the board, and a
        // settled blob of the same colour sitting in the right cell would otherwise
        // satisfy the search for "a fill near this origin" - which is precisely how
        // this test first failed, claiming the renderer drew one colour twice when
        // the board underneath had simply answered the lookup.
        for (const p of [...sim.board.occupied()])
          sim.board.set(p.x, p.y, null);

        const { ctx, log } = recordingContext();
        const sizing = boardSizing(600, 900, 1);
        render(ctx, sim, sizing.size);

        const frame: BoardFrame = {
          size: sizing.size,
          hex: hexGeometry(level.neighbours),
          mirror: level.mirror,
        };
        const drawn = sim.piecePositions(piece!).map((p) => {
          const origin = cellOrigin(frame, p.x, p.y);
          // The *nearest* fill to this cell's origin, not the first one within a
          // cell of it. A one-cell tolerance overlaps with the neighbouring cell's
          // tolerance, so `find` returned the previous cell's fill for the second
          // cell of a vertical piece - which then read as "both cells drew the
          // same colour" and sent me looking for a renderer bug that was not there.
          let best: { fill: (typeof log.fills)[number]; d: number } | null =
            null;
          for (const fill of log.fills) {
            const d = Math.hypot(fill.x - origin.x, fill.y - origin.y);
            if (d >= sizing.size) continue;
            if (best === null || d < best.d) best = { fill, d };
          }
          return best?.fill.style;
        });
        expect(drawn.length, `${orientation}: piece cells`).toBe(2);
        expect(
          new Set(drawn).size,
          `${orientation}: both cells drew ${drawn[0]}`,
        ).toBe(2);
        // And they are the piece's own two colours, in order.
        expect(drawn).toEqual([
          colourFor(level.kinds[piece!.blobs[0].kind]!.artKey, 0),
          colourFor(level.kinds[piece!.blobs[1].kind]!.artKey, 0),
        ]);
      }
    });

    it("marks the goal and grey blobs so they can be found on the board", () => {
      // The rules panel points at "marked" blobs, so the board has to mark them.
      // Without this the text describes something the player cannot see, which is
      // worse than saying nothing: it makes the board look wrong.
      //
      // A shape rather than a tint, because goal blobs already have their own
      // colour and recolouring them would work against telling them apart from each
      // other. And the two marks differ - a dot for the goal, a square for the grey -
      // so a level with both is readable at a glance.
      const sim = simulate(fixture.make);
      const sizing = boardSizing(600, 900, 1);
      const { ctx, log } = recordingContext();
      render(ctx, sim, sizing.size);

      const frame: BoardFrame = {
        size: sizing.size,
        hex: hexGeometry(level.neighbours),
        mirror: level.mirror,
      };
      const blobs = [...sim.board.occupied()];
      const goals = blobs.filter((p) => sim.kindAt(p.x, p.y)?.role === "grass");
      const greys = blobs.filter((p) => sim.kindAt(p.x, p.y)?.role === "grey");

      const centreOf = (p: { x: number; y: number }) => {
        const o = cellOrigin(frame, p.x, p.y);
        return { x: o.x + sizing.size / 2, y: o.y + sizing.size / 2 };
      };
      const marked = (p: { x: number; y: number }) => {
        const c = centreOf(p);
        return (
          log.arcAt.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < 2) ||
          log.rects.some(
            (r) =>
              Math.abs(r.x + r.w / 2 - c.x) < 2 &&
              Math.abs(r.y + r.h / 2 - c.y) < 2,
          )
        );
      };

      // Every goal and grey blob carries a mark.
      for (const p of [...goals, ...greys]) {
        expect(
          marked(p),
          `no marker on ${sim.kindAt(p.x, p.y)?.name} at ${p.x},${p.y}`,
        ).toBe(true);
      }
      // And an ordinary colour blob does not, or the marks mean nothing.
      const plain = blobs.filter(
        (p) => sim.kindAt(p.x, p.y)?.role === "colour",
      );
      if (plain.length > 0) {
        const unmarked = plain.filter((p) => !marked(p));
        expect(unmarked.length, "ordinary blobs must not be marked").toBe(
          plain.length,
        );
      }
      // The two roles use different marks, when the level has both.
      if (goals.length > 0 && greys.length > 0) {
        const isDot = (p: { x: number; y: number }): boolean => {
          const c = centreOf(p);
          return log.arcAt.some((a) => Math.hypot(a.x - c.x, a.y - c.y) < 2);
        };
        expect(isDot(goals[0]!)).toBe(true);
        expect(isDot(greys[0]!)).toBe(false);
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
