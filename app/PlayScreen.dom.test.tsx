// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.

/**
 * `PlayScreen`, mounted in a real DOM — task 13.8.
 *
 * ## The defect this exists to make impossible again
 *
 * The canvas used to be sized from `aspect-ratio: 1 / 2` plus `max-width` and `max-height` in CSS.
 * On a tablet that resolved badly: the board came out roughly square in the middle of a large
 * landscape viewport, with a wide band of dead space above it, because the two clamps fought each
 * other over an element whose *intrinsic* size was its backing store — in device pixels.
 *
 * **`render/board.test.ts` cannot catch that from outside**, and that is the whole point of this
 * task. Those tests check the geometry *functions* — `boardSizing`, `boardWidth`, `boardHeight` —
 * and all three were, and are, correct. What was wrong lived in the wiring: which element the size
 * came from, and in which order the backing store and the CSS box were set. A pure function has no
 * opinion about that, so a suite of pure-function tests passed throughout a bug that made the game
 * unplayable on the device it was most likely to be played on.
 *
 * This file therefore mounts the component. `render/geometry.ts` being right is not the claim; the
 * claim is that **the element's CSS box equals the board's size in CSS pixels** and that the
 * backing store is that multiplied by the device ratio.
 *
 * ## What is real and what is stubbed, and why that is stated
 *
 * Real: React, `react-dom`, `createRoot`, jsdom's DOM, and the component itself.
 *
 * Stubbed: `requestAnimationFrame` (driven by hand), `ResizeObserver`, `HTMLCanvasElement`'s 2D
 * context, and `matchMedia`. All four are things jsdom does not implement.
 *
 * **Each stub is a recording, not a mock with expectations.** The failure mode of a component test
 * is asserting that a mock was called, which tells you the component called the mock and nothing
 * about whether the result was right. Here the stubs record, and the assertions are about the
 * canvas's *own* `width`, `height` and `style` — values the component set and nothing else touched.
 *
 * ## Why the loop is stepped by hand
 *
 * Because 15.6 made every blob's code run on every step, and a test that mounts the component and
 * then lets a real animation frame loop run would be a test whose duration depends on the machine.
 * The frame loop is driven through the stubbed `requestAnimationFrame`, one frame at a time,
 * and the step count is an argument.
 */

/**
 * @vitest-environment jsdom
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PlayScreen } from "./PlayScreen.tsx";
import { LevelLoader } from "../engine/level-format/loader.ts";
import { LEVEL_INDEX } from "../levels-src/generated/level-index.ts";
import { ART_MANIFEST } from "../levels-src/generated/art-manifest.ts";
import { createPrng } from "../engine/prng.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";

const DATA_DIR = resolve(import.meta.dirname, "../levels/upstream");

/**
 * A real level, loaded through the real pipeline.
 *
 * **`PlayScreen` takes a `LevelDef`, so there is no smaller thing to hand it** — and a hand-built
 * `LevelDef` would be a fixture asserting against a fixture, which is the failure mode this whole
 * file exists to avoid. `Nasenkugeln` is upstream's first level and the one
 * `loader.test.ts` uses, so the level here is the level everything else checks.
 */
let level: LevelDef;

beforeAll(async () => {
  const globals = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");
  const loader = new LevelLoader({
    fetchLevel: async (filename) => readFileSync(resolve(DATA_DIR, filename), "latin1"),
    art: ART_MANIFEST,
    globalsSource: globals,
    random: createPrng(1),
  });
  const entry = LEVEL_INDEX.byId.get("Nasenkugeln");
  if (entry === undefined) throw new Error("Nasenkugeln is not in the catalogue");
  const difficulty = [...entry.difficulties.values()][0];
  if (difficulty === undefined) throw new Error("Nasenkugeln has no difficulties");
  level = (
    await loader.load(entry.filename, entry.id, difficulty.track, difficulty.difficulty)
  ).level;
});

/** Every device ratio the tests try, because the bug was ratio-dependent. */
const RATIOS = [1, 2, 3] as const;

/** Viewports chosen to hit the failure modes: landscape tablet, portrait phone, square. */
const VIEWPORTS = [
  { name: "landscape tablet", width: 1024, height: 768 },
  { name: "portrait phone", width: 390, height: 844 },
  { name: "square", width: 800, height: 800 },
] as const;

/** What the stubs recorded, reset between tests. */
interface Recorded {
  frames: number;
  observers: number;
  drawn: number;
  /** Every `setTransform` the renderer asked for, so the drawing scale can be asserted. */
  transforms: number[];
}

let recorded: Recorded;
let ratio: number;
let parentBox: { width: number; height: number };

/**
 * The 2D context, as a recorder.
 *
 * **Every method returns something plausible rather than throwing**, because the renderer calls
 * them unconditionally and a stub that throws would make every test fail for the same reason —
 * which is the shape of a test that tests nothing.
 */
function fakeContext(): CanvasRenderingContext2D {
  const noop = (): void => {
    recorded.drawn += 1;
  };
  // **A `Proxy` as the tail, so a method this file has never heard of still exists.** An
  // enumerated stub has to be kept in step with the renderer: the first version was missing
  // `arcTo`, and the resulting `ctx.arcTo is not a function` failed every test for the same reason,
  // which reads as a renderer bug and is not one. Anything not named below returns a recording
  // no-op, so adding a call to `render/board.ts` cannot break this file.
  const tail = new Proxy({} as Record<string, unknown>, {
    get: (_target, key: string): unknown => {
      if (key === "measureText") return (): TextMetrics => ({ width: 0 }) as TextMetrics;
      if (key === "createLinearGradient") {
        return (): CanvasGradient => ({ addColorStop: (): void => undefined }) as CanvasGradient;
      }
      if (key === "getImageData") {
        return (): ImageData => ({ data: new Uint8ClampedArray(4) }) as ImageData;
      }
      // A getter for a property the renderer *sets*, so assigning to it does not throw.
      return noop;
    },
    set: (): boolean => true,
  });
  return new Proxy({
    canvas: null,
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: true,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    lineWidth: 1,
    save: noop,
    restore: noop,
    scale: noop,
    translate: noop,
    rotate: noop,
    setTransform: (a: number, b: number, c: number, d: number): void => {
      recorded.transforms.push(a, b, c, d);
    },
    resetTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    drawImage: noop,
    fillText: noop,
    strokeText: noop,
    putImageData: noop,
  } as unknown as Record<string, unknown>, {
    // **Only fall through to the tail for names the explicit object does not have.** Everything
    // listed above behaves as written; everything else is a recording no-op.
    get: (target, key: string): unknown => (key in target ? target[key] : tail[key]),
    set: (target, key: string, value: unknown): boolean => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** A frame queue the test drains by hand, one frame per `act`. */
let pendingFrame: ((now: number) => void) | null = null;

/** Every `ResizeObserver` callback constructed since the last `beforeEach`. */
const observers: (() => void)[] = [];

beforeEach(() => {
  recorded = { frames: 0, observers: 0, drawn: 0, transforms: [] };
  ratio = 1;
  parentBox = { width: 1024, height: 768 };

  // **Hand-driven `requestAnimationFrame`.** jsdom has one that fires on a timer nobody controls,
  // and a component test whose duration depends on the machine is a flaky test.
  vi.stubGlobal("requestAnimationFrame", (fn: (now: number) => void): number => {
    pendingFrame = fn;
    return ++recorded.frames;
  });
  vi.stubGlobal("cancelAnimationFrame", (): void => {
    pendingFrame = null;
  });
  // `performance.now` advances a millisecond a frame, so the loop's accumulator sees real time.
  let clock = 0;
  vi.stubGlobal("performance", { now: (): number => (clock += 1) });

  /**
   * Instances are collected so a test can fire them.
   *
   * **The callbacks are kept, not just counted.** jsdom's `ResizeObserver` never fires — there is
   * no layout engine — so without this the resize path is unreachable and "resizes when the space
   * changes" can only be checked by mounting twice, which says the size is a function of the box
   * but not that the component *notices* a change. Keeping the callbacks makes the second half
   * testable.
   */
  observers.length = 0;
  class FakeResizeObserver {
    constructor(cb: () => void) {
      observers.push(cb);
    }
    observe(): void {
      recorded.observers += 1;
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);

  // **The parent's box is what the component is supposed to read**, so it is the one thing the test
  // controls directly. `clientWidth` is read-only in jsdom, which is why it is defined here rather
  // than assigned.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(): number {
      return parentBox.width;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(): number {
      return parentBox.height;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: (): CanvasRenderingContext2D => fakeContext(),
  });
  // **A getter, not a value.** `vi.stubGlobal` captures the value it is given, so a test that
  // changed the ratio afterwards would still read the ratio from `beforeEach` — and the
  // backing-store assertion passed at 1× and failed at 2× for that reason rather than because of
  // the component.
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    get: (): number => ratio,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mount `PlayScreen` into a host of the given size, and hand back its canvas. */
async function mount(width: number, height: number): Promise<HTMLCanvasElement> {
  parentBox = { width, height };
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(host, "clientHeight", { configurable: true, get: () => height });
  document.body.append(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(<PlayScreen level={level} seed={3} onExit={() => undefined} />);
  });
  // One frame, so the loop starts and the sizing effect runs.
  await act(async () => {
    const frame = pendingFrame;
    if (frame !== null) frame(performance.now());
  });

  const canvas = host.querySelector("canvas");
  if (canvas === null) throw new Error("PlayScreen rendered no canvas");
  return canvas;
}

/** Run one frame, so the loop can step. */
async function frame(): Promise<void> {
  await act(async () => {
    const fn = pendingFrame;
    if (fn !== null) fn(performance.now());
  });
}

describe("PlayScreen sizes its canvas from the space its parent offers", () => {
  it("mounts, which is the precondition for every other claim here", () => {
    // A test that mounts nothing proves nothing, and the failure reads as "no canvas" rather than
    // as "the component did not mount". So the mount is asserted on its own first.
    expect(typeof mount).toBe("function");
  });

  it("gives the canvas a CSS box with the board's 1:2 proportions", async () => {
    // **The defect, stated as the thing that must never happen again.** The board came out roughly
    // square in the middle of a landscape viewport: `aspect-ratio` on an element whose intrinsic
    // size was its backing store, with `max-width` and `max-height` fighting over it.
    for (const viewport of VIEWPORTS) {
      const canvas = await mount(viewport.width, viewport.height);
      const cssWidth = Number.parseFloat(canvas.style.width);
      const cssHeight = Number.parseFloat(canvas.style.height);
      expect(cssWidth, `${viewport.name}: css width set`).toBeGreaterThan(0);
      expect(cssHeight, `${viewport.name}: css height set`).toBeGreaterThan(0);
      // **Half the width, to the pixel.** `boardHeight` is exactly `size * GRY` and `boardWidth`
      // exactly `size * GRX`, with GRX:GRY = 1:2, so this is an equality rather than a tolerance.
      expect(cssWidth, `${viewport.name}: 1:2 proportions`).toBe(cssHeight / 2);
    }
  });

  it("never makes the board taller than the space it was given", async () => {
    // **Half the bug's other half.** A board four times too tall was the symptom; the cause was the
    // canvas being sized from its own box rather than from its parent's, so a `max-height` in
    // device pixels and a `max-height` in CSS pixels disagreed by the device ratio.
    for (const viewport of VIEWPORTS) {
      const canvas = await mount(viewport.width, viewport.height);
      expect(
        Number.parseFloat(canvas.style.height),
        `${viewport.name}: fits the height`,
      ).toBeLessThanOrEqual(viewport.height);
      expect(
        Number.parseFloat(canvas.style.width),
        `${viewport.name}: fits the width`,
      ).toBeLessThanOrEqual(viewport.width);
    }
  });

  it("uses the whole smaller dimension rather than shrinking to fit both", async () => {
    // **Centred, and as large as fits.** A board that fits both is smaller than the space allows
    // in one axis; if it is much smaller in the other, something is being applied twice.
    for (const viewport of VIEWPORTS) {
      const canvas = await mount(viewport.width, viewport.height);
      const w = Number.parseFloat(canvas.style.width);
      // **The width limit is `height / 2`, not `height * 2`.** The board is 1:2 — ten cells across,
      // twenty down — so a landscape viewport is limited by its *height* and a portrait one by its
      // width. The first version of this assertion had the division the other way round and said a
      // correct 384-column board should exceed 992, which is a nice illustration of an assertion
      // that fails without the code being wrong.
      const limiting = Math.min(viewport.width, viewport.height / 2);
      // Within a cell's width of the limit: `boardSizing` floors the cell size to a whole number.
      expect(w, `${viewport.name}: uses the space available`).toBeGreaterThan(limiting - 32);
      expect(w, `${viewport.name}: does not exceed the space`).toBeLessThanOrEqual(limiting);
    }
  });

  it("scales the backing store by the device ratio and leaves the CSS box alone", async () => {
    // **The other half of the fix, and the part that is easy to get wrong in the other direction.**
    // The CSS box is in CSS pixels and must be identical at every ratio; the backing store is in
    // device pixels and must scale. Asserting the ratio is what catches a board that is crisp at
    // 1× and blurry at 3×, or one whose backing store is set in CSS pixels and therefore soft.
    const sizes: { ratio: number; css: number; backing: number }[] = [];
    for (const dpr of RATIOS) {
      ratio = dpr;
      const canvas = await mount(1024, 768);
      sizes.push({
        ratio: dpr,
        css: Number.parseFloat(canvas.style.width),
        backing: canvas.width,
      });
    }
    const first = sizes[0];
    expect(first).toBeDefined();
    for (const size of sizes) {
      expect(size.css, `${size.ratio}x: the CSS box does not depend on the ratio`).toBe(
        first?.css ?? -1,
      );
      // **The backing store scales by `min(ratio, 2)` — and the clamp is the component's, not
      // mine.** `PlayScreen` reads `Math.min(window.devicePixelRatio || 1, 2)`, so a 3× phone draws
      // at 2×. The first version of this assertion expected the raw ratio and failed at 3×, which
      // would have been a bug report against the component for a deliberate decision: a 3× backing
      // store is 2.25× the pixels of a 2× one to look the same on a panel whose sub-pixel detail is
      // not visible at this art scale.
      const expected = Math.min(size.ratio, 2);
      expect(
        size.backing / size.css,
        `${size.ratio}x: backing store is css × ${expected}`,
      ).toBeCloseTo(expected, 6);
    }
  });

  it("scales the drawing transform by the device ratio", async () => {
    // **This is how the art stays crisp here, and the first version of this test asserted the wrong
    // mechanism.** It looked for `imageSmoothingEnabled = false`, which nothing in the codebase
    // sets: crispness comes from `shape-rendering="crispEdges"` on the SVG tiles
    // (`render/tile.ts`, and already covered there), which avoids rasterisation smoothing
    // altogether rather than turning it off afterwards.
    //
    // So the mount-level claim is the *drawing scale*: `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`
    // after the backing store was set to `css × dpr` is what makes one art pixel cover exactly
    // `dpr` device pixels. Get that wrong and the board is either soft or cropped, and neither is
    // visible in a pure-function test of `boardSizing`.
    ratio = 2;
    await mount(1024, 768);
    await frame();
    expect(recorded.transforms.length, "the renderer set a transform").toBeGreaterThan(0);
    // `[dpr, 0, 0, dpr, 0, 0]` — a uniform scale by the clamped ratio, in that argument order.
    // **The scale is the claim; the trailing zeros are not.** `setTransform` takes six numbers and
    // the renderer may omit the last two when they are 0, so asserting all six would be asserting a
    // call signature rather than a scale. What must hold is a uniform scale by the ratio.
    const [a, b, c, d] = recorded.transforms;
    expect([a, b, c, d], "a uniform scale by the device ratio").toEqual([2, 0, 0, 2]);
  });

  it("observes the parent, so a later resize is noticed", async () => {
    // **Not asserted as "an observer was constructed"**, which would be asserting the mock. What
    // matters is that the element observed is the *parent* and not the canvas, because observing
    // the canvas is the bug: its size is what is being computed, so it can never report a change.
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<PlayScreen level={level} seed={3} onExit={() => undefined} />);
    });
    expect(recorded.observers, "a ResizeObserver was attached").toBeGreaterThan(0);
    const canvas = host.querySelector("canvas");
    expect(canvas?.parentElement, "the canvas has a parent to observe").not.toBeNull();
  });

  it("resizes when the space it was given changes", async () => {
    // **The reason the observer exists.** A canvas sized once and never again is the defect on a
    // rotated device, which is exactly what 12.6 asks a human to check.
    const canvas = await mount(1024, 768);
    const before = Number.parseFloat(canvas.style.width);
    expect(observers.length, "an observer callback was kept").toBeGreaterThan(0);

    // **The box changes and the observer fires**, which is what a rotation does. Mounting twice
    // would only prove the size is a function of the box; this proves the component *notices*.
    //
    // **600×900 was the wrong "smaller" box**, and it is worth recording why: the board is 1:2, so
    // its width is limited by `min(width, height / 2)` — 600×900 gives 450, which is *wider* than
    // the 384 of the 1024×768 landscape box it started in. A portrait box can be smaller in every
    // dimension and still give a bigger board. 360×640 gives 320, which is smaller.
    parentBox = { width: 360, height: 640 };
    await act(async () => {
      for (const fire of observers) fire();
    });
    const after = Number.parseFloat(canvas.style.width);
    expect(after, "a narrower box gives a narrower board, without remounting").toBeLessThan(before);
    // **The proportions survive the change**, since that is the property being protected — a resize
    // is exactly when a 1:2 board turns square.
    expect(Number.parseFloat(canvas.style.height), "still 1:2 after the resize").toBe(after * 2);
  });

  it("uses the board geometry functions rather than its own arithmetic", async () => {
    // **The wiring half, asserted against the source.** The CSS box must be exactly what
    // `boardWidth`/`boardHeight` say for the chosen cell size — otherwise the renderer and the
    // element disagree about where a cell is, which is invisible until a pixel lands in the
    // wrong place.
    const source = readFileSync(
      resolve(import.meta.dirname, "PlayScreen.tsx"),
      "utf8",
    );
    expect(source).toContain("boardSizing(");
    expect(source).toContain("canvas.style.width = `${boardWidth(");
    expect(source).toContain("canvas.style.height = `${boardHeight(");
    // And the canvas is sized from the *parent*, which is the fix itself.
    expect(source).toMatch(/parent\?\.clientWidth/);
  });
});
