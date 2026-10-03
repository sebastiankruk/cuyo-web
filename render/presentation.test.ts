/**
 * Task 7.4, 7.6 and 7.7, verified against the renderer's actual draw calls.
 *
 * `board.test.ts` already has a recording context; these are the group-7 claims it does not
 * yet make. Each says "implement X, **and verify Y**", and the verification is the half that
 * was missing — the reconciliation note records group 7 as honestly 0/14 by its own bar,
 * with the code present and nothing checking it.
 *
 * **Everything here asserts a position, not a count.** That is the discipline this project's
 * tests were written after: a test that checks "26 fills happened, all inside the canvas"
 * passes while every blob is stacked in the corner. So each assertion names *where* a blob
 * landed and, where the claim is about a relationship between two cells, the *difference*
 * between them.
 *
 * **The levels are built here rather than added to `fixtures.ts`.** The shared fixtures are
 * the two upstream levels, and `board.test.ts` iterates them by name in its test titles. A
 * hex level and a mirrored level do not exist among those two, and adding them would change
 * what every existing test is called — so these are local overrides of a real fixture's
 * fields, which is the smallest change that makes the claim testable.
 *
 * **`hexflip` is not here, and that is a finding rather than an omission.** `LevelDef` has
 * no such field and `board.ts` calls `hexGeometry(level.neighbours)` without a flip, so the
 * parity setting is dropped on the way to the renderer. Measured: 11 levels are in a hex
 * mode, and the only one declaring `hexflip` is `hexkugeln.ld` with `hexflip=2`. Since
 * `columnShift` reads `flip & 1` for the left half and every hex board in this port is
 * single-player, `2` and the default `0` give the same answer — so no level in the corpus is
 * affected today and the gap is latent. Asserting the parity flip would mean asserting that
 * a field the renderer never receives changes the output.
 */

import { describe, expect, it } from "vitest";
import {
  EXPLOSION_STEPS,
  GRIC,
  GRX,
  GRY,
  NeighbourMode,
} from "../engine/game-core/constants.ts";
import { render } from "./board.ts";
import { Simulation } from "../engine/game-core/simulation.ts";
import { hormone, nasenkugeln } from "../engine/level-format/fixtures.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";

const SIZE = 20;

/** A cell's recorded fill, in board cells. */
interface CellBox {
  readonly x: number;
  readonly y: number;
}

interface Logged {
  fills: { x: number; y: number; w: number; h: number; style: string }[];
  arcAt: { x: number; y: number; r: number }[];
  clears: number;
  styles: string[];
  alpha: number[];
  gradients: { cx: number; cy: number }[];
}

/**
 * The recording context from `board.test.ts`, plus two things it had no reason to record:
 * `globalAlpha` and the centres handed to `createRadialGradient`.
 *
 * Both are there for 7.7. An explosion is a radial gradient at a fading alpha, so "advances
 * over eight steps" is only checkable if the radius *and* the alpha are recorded — and
 * `globalAlpha` is a plain property on the stub, so a test asserting on it unmodified would
 * be asserting that the stub says 1.
 */
function recorder(): { ctx: CanvasRenderingContext2D; log: Logged } {
  const log: Logged = {
    fills: [],
    arcAt: [],
    clears: 0,
    styles: [],
    alpha: [],
    gradients: [],
  };
  const state = { fillStyle: "#000", strokeStyle: "#000", alpha: 1 };
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
  const boxRect = (): { x: number; y: number; w: number; h: number } | null =>
    box === null ? null : { x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 };
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
    get globalAlpha() {
      return state.alpha;
    },
    set globalAlpha(v: number) {
      state.alpha = v;
      log.alpha.push(v);
    },
    lineWidth: 1,
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
    arcTo(x1: number, y1: number, x2: number, y2: number) {
      point(x1, y1);
      point(x2, y2);
    },
    arc(x: number, y: number, radius: number) {
      point(x - radius, y - radius);
      point(x + radius, y + radius);
      log.arcAt.push({ x, y, r: radius });
    },
    rect(x: number, y: number, w: number, h: number) {
      point(x, y);
      point(x + w, y + h);
    },
    fill() {
      const r = boxRect();
      if (r !== null) log.fills.push({ ...r, style: state.fillStyle });
    },
    stroke() {},
    save() {},
    restore() {},
    setTransform() {},
    createRadialGradient(cx: number, cy: number) {
      log.gradients.push({ cx, cy });
      return { addColorStop() {} };
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

/** Draw once, and hand back both the recording and the simulation it drew. */
function draw(level: LevelDef, steps = 6): { log: Logged; sim: Simulation } {
  const { ctx, log } = recorder();
  const sim = new Simulation(level, { seed: 1 });
  for (let i = 0; i < steps; i++) sim.step();
  render(ctx, sim, SIZE);
  return { log, sim };
}

/**
 * A board with blobs of `kind` in one row, and `null` everywhere else.
 *
 * `startDist` is `StartCell | null` per cell, which is what the loader produces too — so
 * these levels go through the same shape the game does rather than a convenient
 * substitute.
 */
function boardWith(row: number, columns: readonly number[], kind: number): LevelDef {
  const rows: (number | null)[][] = Array.from({ length: GRY }, () =>
    Array.from({ length: GRX }, (): number | null => null),
  );
  for (const x of columns) rows[row]![x] = kind;
  return {
    ...nasenkugeln(),
    startDist: rows.map((r) => r.map((k) => (k === null ? null : { kind: k, version: 0 }))),
  };
}

/**
 * The blob whose centre falls in cell `at`, or null.
 *
 * By **centre**, which is the one thing a hex cell breaks. A hex blob in row 5 column 1 is
 * drawn half a cell lower, so its centre lands in row 6 — asking "is there a blob in row 5
 * column 1" by centre finds nothing, and asking by top-left finds the *neighbour's* blob.
 * That is not a defect in the renderer; it is what offsetting a column by half a cell means.
 * So the hex assertions work in pixels, which is the space the offset lives in, and this
 * helper is for the cases where a blob really is centred on its cell.
 *
 * Null rather than a default, so "nothing was drawn" and "something was drawn elsewhere"
 * are different failures — the distinction the whole file turns on.
 */
function centredIn(log: Logged, at: number): CellBox | null {
  const cx = at % GRX;
  const cy = Math.floor(at / GRX);
  const hit = log.fills.find(
    (f) =>
      f.w < GRX * SIZE &&
      Math.floor((f.x + f.w / 2) / SIZE) === cx &&
      Math.floor((f.y + f.h / 2) / SIZE) === cy,
  );
  return hit === undefined ? null : { x: cx, y: cy };
}

/**
 * Every blob **body** drawn in the pixel band of board row `row`, left to right, as the
 * top-left corner of each fill.
 *
 * Two things it has to get right, both found by a failing assertion rather than by reading
 * the renderer:
 *
 *  - **Pixels, not cells.** A half-cell hex offset puts a blob's centre in the *next* row,
 *    so "which cell is this fill in" cannot answer the question the hex claim asks.
 *  - **Bodies, not markers.** A goal or grey blob is drawn twice — the body and a marker on
 *    top of it — so a level of goal blobs fills this band twice over and every count comes
 *    out double. Markers are `MARKER_RADIUS` (0.075 of a cell) across, so half a cell
 *    separates them cleanly.
 */
function blobsInRow(log: Logged, row: number): { x: number; y: number }[] {
  const top = row * SIZE - 1;
  const bottom = (row + 1) * SIZE + SIZE / 2;
  return log.fills
    .filter((f) => f.w > SIZE / 2 && f.w < GRX * SIZE && f.y >= top && f.y <= bottom)
    .map((f) => ({ x: f.x, y: f.y }))
    .sort((a, b) => a.x - b.x);
}

describe("7.4 the board is painted in the level's own colours", () => {
  it("fills the board with the level's declared bgcolor, not white", () => {
    // `hormone` declares `#000000` and `nasenkugeln` `#ffffff`, so a renderer that ignored
    // the setting and reached for white passes one and fails the other — which is why both
    // are run rather than one.
    for (const make of [nasenkugeln, hormone]) {
      const level = make();
      const { log } = draw(level);
      const background = log.fills.find((f) => f.w === GRX * SIZE && f.h === GRY * SIZE);
      expect(background, `${level.id}: no full-board fill`).toBeDefined();
      expect(background?.style, level.id).toBe(level.colours.background);
      // And it is the *first* thing drawn, so it is behind everything rather than over it.
      expect(log.fills[0]).toBe(background);
    }
  });

  it("uses the level's declared topcolor for the chase border", () => {
    // The border's colour is set even when the band has no height yet, so this asserts the
    // colour is *used* rather than that a band is visible — a zero-height band is drawn as
    // no band, and demanding a visible one would make the test depend on how far the border
    // happens to have travelled.
    const level = hormone();
    const { log } = draw(level);
    expect(level.colours.top).not.toBe(level.colours.background);
    expect(log.styles, "topcolor is never used").toContain(level.colours.top);
  });

  it("gives the two levels different backgrounds and borders, so neither can be hard-coded", () => {
    // The census that makes the two assertions above mean something. If the fixtures shared
    // a background, "fills with the level's bgcolor" would be satisfiable by a constant.
    expect(nasenkugeln().colours.background).not.toBe(hormone().colours.background);
    expect(nasenkugeln().colours.top).not.toBe(hormone().colours.top);
  });
});

describe("7.6 a hex level offsets its odd columns", () => {
  /** Four blobs in a row, in hex mode. */
  function hexLevel(): LevelDef {
    return {
      ...boardWith(5, [0, 1, 2, 3], 5),
      neighbours: NeighbourMode.Hex6,
    };
  }

  it("puts column 1 half a cell lower than column 0, and column 2 back level with 0", () => {
    const { log } = draw(hexLevel());
    const blobs = blobsInRow(log, 5);
    expect(blobs.length, `only ${blobs.length} blobs in row 5`).toBe(4);
    // The claim as a difference, in pixels, because a half-cell offset has no cell to be in.
    // `SIZE / 2` is ten pixels at this size.
    expect(Math.abs(blobs[1]!.y - blobs[0]!.y)).toBe(SIZE / 2);
    // The alternation, which is what "odd columns" means. A renderer that offset *every*
    // column would satisfy the first assertion and is not hex.
    expect(Math.abs(blobs[2]!.y - blobs[1]!.y)).toBe(SIZE / 2);
    expect(blobs[2]!.y).toBe(blobs[0]!.y);
    expect(blobs[3]!.y).toBe(blobs[1]!.y);
  });

  it("moves the odd column down, not up", () => {
    // Signed, because "half a cell lower" and "half a cell higher" are both `SIZE / 2`
    // apart in absolute value, and an offset upward would interlock with the row above
    // instead of the one below.
    const { log } = draw(hexLevel());
    const blobs = blobsInRow(log, 5);
    expect(blobs[1]!.y - blobs[0]!.y).toBe(SIZE / 2);
  });

  it("leaves every column level when the level is not hex", () => {
    // The control. Without it, "column 1 is half a cell lower" could be satisfied by a
    // renderer that offsets every second column in every mode.
    const { log } = draw(boardWith(5, [0, 1, 2, 3], 5));
    const ys = blobsInRow(log, 5).map((b) => b.y);
    expect(ys.length).toBe(4);
    expect(ys, `tops ${ys.join(",")}`).toEqual([ys[0], ys[0], ys[0], ys[0]]);
  });

  it("still draws every blob, so the offset moves cells rather than losing them", () => {
    // The census for the hex case. An offset that pushed a blob off the board would lose it,
    // and the difference assertions above only look at pairs of columns.
    const { log } = draw(hexLevel());
    expect(blobsInRow(log, 5).length).toBe(4);
    // And each is still in its own column: the x positions are one cell apart, unshifted.
    const xs = blobsInRow(log, 5).map((b) => Math.round(b.x / SIZE));
    expect(xs).toEqual([0, 1, 2, 3]);
  });
});

describe("7.6 a mirrored level is drawn upside down", () => {
  it("draws row 0 at the top of the board when not mirrored", () => {
    const { log } = draw(boardWith(0, [3], 5));
    expect(centredIn(log, 0 * GRX + 3), "row 0 was not drawn at the top").not.toBeNull();
    expect(centredIn(log, (GRY - 1) * GRX + 3), "something was drawn at the bottom").toBeNull();
  });

  it("draws that same blob at the other end of the board when mirrored", () => {
    // The claim as a relationship: mirroring moves one known cell from one end to the other.
    // An absolute y for a mirrored level would work too, but it would not say that the
    // *same* cell moved — and "the board is upside down" is exactly that. So this asserts
    // both ends: present at the bottom, absent from the top.
    const { log } = draw({ ...boardWith(0, [3], 5), mirror: true });
    expect(centredIn(log, (GRY - 1) * GRX + 3), "row 0 was not drawn at the bottom").not.toBeNull();
    expect(centredIn(log, 0 * GRX + 3), "something is still drawn at the top").toBeNull();
  });

  it("keeps the blob in its own column, because only the row order flips", () => {
    const { log } = draw({ ...boardWith(0, [3], 5), mirror: true });
    expect(centredIn(log, (GRY - 1) * GRX + 3)?.x ?? -1).toBe(3);
    expect(
      centredIn(log, (GRY - 1) * GRX + 4),
      "a blob appeared in the wrong column",
    ).toBeNull();
  });

  it("brings the chase border up from the bottom, not down from the top", () => {
    // The border is the other thing `mirror` moves, and it is the one a player reads to
    // know how long is left. A border still descending from the top of a mirrored board
    // would be on the wrong side of the fall.
    const level = { ...boardWith(GRY - 1, [3], 5), mirror: true };
    const { ctx, log } = recorder();
    const sim = new Simulation(level, { seed: 1 });
    for (let i = 0; i < 6; i++) sim.step();
    sim.borderPx = 3 * GRIC;
    render(ctx, sim, SIZE);
    const band = log.fills.find((f) => f.style === level.colours.top && f.h > 0);
    expect(band, "the chase border was never drawn").toBeDefined();
    expect(band?.y ?? 0).toBeGreaterThan(0);
    // And it reaches the bottom edge, because on a mirrored board the border rises.
    expect((band?.y ?? 0) + (band?.h ?? 0)).toBeCloseTo(SIZE * GRY, 5);
  });

  it("and puts an unmirrored border at the very top", () => {
    // The control for the assertion above.
    const level = boardWith(GRY - 1, [3], 5);
    const { ctx, log } = recorder();
    const sim = new Simulation(level, { seed: 1 });
    for (let i = 0; i < 6; i++) sim.step();
    sim.borderPx = 3 * GRIC;
    render(ctx, sim, SIZE);
    const band = log.fills.find((f) => f.style === level.colours.top && f.h > 0);
    expect(band, "the chase border was never drawn").toBeDefined();
    expect(band?.y ?? -1).toBe(0);
  });
});

describe("7.7 an explosion advances over eight steps and then draws empty", () => {
  /** Six blobs of one colour kind on the bottom row: a group that detonates. */
  function bombLevel(): LevelDef {
    return boardWith(GRY - 1, [0, 1, 2, 3, 4, 5], 1);
  }

  /**
   * Steps until the simulation reaches the exploding phase.
   *
   * Through `step()`, never by setting `exploding` by hand. Every explosion test in this
   * project once called the advance function directly, so the fact that the step machine
   * never called it went unnoticed and the game froze on the first detonation.
   */
  function untilExploding(level: LevelDef): Simulation {
    const sim = new Simulation(level, { seed: 1 });
    for (let i = 0; i < 400 && sim.phase !== "exploding"; i++) sim.step();
    expect(sim.phase, "the group never detonated").toBe("exploding");
    return sim;
  }

  it("reaches the exploding phase from a real group of six", () => {
    const sim = untilExploding(bombLevel());
    const exploding = sim.board.cells.filter((c) => c !== null && c.exploding !== 0);
    expect(exploding.length, "nothing was marked as exploding").toBeGreaterThan(0);
    // Already past 1 by the time `step()` returns, because one call runs the whole phase
    // loop: `testExplosions` sets them to 1 and `continue`s, then the same call reaches the
    // `exploding` case and advances them. Asserting `1` here would be asserting that a step
    // does one thing, which is the opposite of what it does.
    for (const c of exploding) {
      expect(c?.exploding).toBeGreaterThanOrEqual(1);
      expect(c?.exploding).toBeLessThanOrEqual(EXPLOSION_STEPS);
    }
  });

  it("advances one blob by one step per frame, up to eight, then clears it", () => {
    // Driven from wherever `untilExploding` happens to land rather than from 1, because
    // that landing point is an implementation detail of the phase loop and asserting it
    // would pin the bug that loop once had.
    const sim = untilExploding(bombLevel());
    const cell = sim.board.cells.findIndex((c) => c !== null && c.exploding !== 0);
    expect(cell).toBeGreaterThanOrEqual(0);
    const first = sim.board.cells[cell]?.exploding ?? 0;
    const seen: number[] = [];
    for (let i = 0; i < EXPLOSION_STEPS + 2 && sim.board.cells[cell] !== null; i++) {
      seen.push(sim.board.cells[cell]?.exploding ?? 0);
      sim.step();
    }
    // Every frame advances by exactly one. A frame that skipped would make the animation
    // jump; one that repeated would make it stutter, and neither shows in a still.
    expect(seen.length, `frames seen: ${seen.join(",")}`).toBe(EXPLOSION_STEPS - first + 1);
    for (let i = 0; i < seen.length; i++) {
      expect(seen[i]).toBe(first + i);
    }
    // The last frame drawn is the eighth, and after it the cell is empty — so there is no
    // ninth frame, which is the half of "then draws empty" that the sequence pins.
    expect(seen[seen.length - 1]).toBe(EXPLOSION_STEPS);
    expect(sim.board.cells[cell]).toBeNull();
  });

  it("draws a bloom that grows and fades, larger and fainter each frame", () => {
    const level = bombLevel();
    const frames: { r: number; a: number }[] = [];
    // Every frame of one explosion, rendered fresh each time from a simulation put into that
    // state by stepping — never by assigning `exploding`, for the reason in `untilExploding`.
    const sim = untilExploding(level);
    const cell = sim.board.cells.findIndex((c) => c !== null && c.exploding !== 0);
    for (let i = 0; i < EXPLOSION_STEPS; i++) {
      if (sim.board.cells[cell] === null) break;
      const { ctx, log } = recorder();
      render(ctx, sim, SIZE);
      const arc = log.arcAt[log.arcAt.length - 1];
      expect(arc, `frame ${sim.board.cells[cell]?.exploding}: nothing was drawn`).toBeDefined();
      frames.push({ r: arc?.r ?? 0, a: Math.min(...log.alpha) });
      sim.step();
    }
    expect(frames.length, `only ${frames.length} frames rendered`).toBeGreaterThan(1);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.r, `frame ${i + 1} is no larger than frame ${i}`).toBeGreaterThan(
        frames[i - 1]!.r,
      );
      expect(frames[i]!.a, `frame ${i + 1} is not fainter than frame ${i}`).toBeLessThan(
        frames[i - 1]!.a,
      );
    }
    // The last frame is nearly gone, so the bloom does not sit on the board as a smudge.
    expect(frames[frames.length - 1]!.a).toBeLessThan(0.2);
  });

  it("centres each bloom on an exploding cell, not on the board", () => {
    // A bloom at the origin looks like an explosion; a bloom at a cell looks like *this*
    // explosion. Every gradient is checked against the set of exploding cells rather than
    // against one of them, because six blobs detonate and only one of them is "the" cell
    // whose index you happened to pick — asserting them all equal to a single centre is a
    // test that could only pass if exactly one blob ever exploded.
    const sim = untilExploding(bombLevel());
    const { ctx, log } = recorder();
    render(ctx, sim, SIZE);
    const cells = sim.board.cells
      .map((c, i) => (c !== null && c.exploding !== 0 ? i : -1))
      .filter((i) => i >= 0);
    expect(cells.length, "nothing is exploding").toBeGreaterThan(1);
    const centres = new Set(
      cells.map((i) => `${(i % GRX) * SIZE + SIZE / 2},${Math.floor(i / GRX) * SIZE + SIZE / 2}`),
    );
    expect(log.gradients.length, "no radial gradient was created").toBeGreaterThan(0);
    for (const g of log.gradients) {
      const key = `${g.cx},${g.cy}`;
      expect(centres.has(key), `a bloom was centred on ${key}, which is not a cell`).toBe(true);
    }
    // One bloom per exploding blob, so none is missed and none is doubled.
    expect(log.gradients.length).toBe(cells.length);
  });

  it("draws nothing at a cell whose explosion has finished", () => {
    // The "then draws empty" half. Not "faintly", not "as the background" — nothing, so an
    // empty cell and a vanished one are the same drawing.
    const sim = untilExploding(bombLevel());
    const cell = sim.board.cells.findIndex((c) => c !== null && c.exploding !== 0);
    const cx = cell % GRX;
    const cy = Math.floor(cell / GRX);
    for (let i = 0; i < EXPLOSION_STEPS; i++) sim.step();
    expect(sim.board.cells[cell]).toBeNull();
    const { ctx, log } = recorder();
    render(ctx, sim, SIZE);
    const stillDrawn = log.fills.find(
      (f) =>
        f.w < GRX * SIZE &&
        Math.floor((f.x + f.w / 2) / SIZE) === cx &&
        Math.floor((f.y + f.h / 2) / SIZE) === cy,
    );
    expect(stillDrawn, `cell ${cx},${cy} is still drawn after its explosion finished`).toBeUndefined();
  });
});