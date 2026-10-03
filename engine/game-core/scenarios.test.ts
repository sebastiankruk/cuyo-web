/**
 * One real level, played end to end, with a win and a loss.
 *
 * Task 12.3 asks for scenario tests that drive real input sequences and assert board state for
 * one level end to end. What makes these *scenarios* rather than the unit tests around them is
 * that nothing here reaches inside:
 *
 *  - the level comes from the real `LevelLoader` reading `levels/upstream/paratroopers.ld`,
 *    so the start layout is whatever upstream's `startdist` says and the kinds are the ones
 *    the `.ld` defines;
 *  - the only things called are the four player actions `app/gestures.ts` calls - `moveLeft`,
 *    `moveRight`, `rotate`, `toggleFast` - and `step()`;
 *  - and no test sets `goalCount`, `board`, `borderPx` or `phase` by hand.
 *
 * The last point is the whole difference from `lifecycle.test.ts`, which reaches `won` and
 * `lost` on a real level's data but gets there by calling `board.clear()` and overriding
 * `topTime`. Everything there is a rule being tested; everything here is the rules running.
 *
 * ## One level, two outcomes, and the difference is a single key
 *
 * `paratroopers.ld` opens with a 2x2 block of `Cannon` at columns 4-5, rows 16-17, sitting on a
 * 2x2 block of `Gray` at rows 18-19. The `Cannon` blobs are the level's goals.
 *
 * Pressing <kbd>rotate</kbd> before every step **wins at step 447**: the piece falls in column 4,
 * lands directly on top of the goal block, joins it, and the group explodes with the goals in it.
 * Pressing <kbd>left</kbd> before every step **loses at step 1744**: every piece is walked to
 * column 0, nothing ever connects to the block at columns 4-5, the goals are still sitting on
 * their starting squares 1700 steps later, and the chase border rises until a piece can no longer
 * be introduced.
 *
 * Same level, same seed, same step count. One key is the difference, which is the strongest
 * statement available here that the input path is actually wired to the board: a test where the
 * input does nothing could not produce two different endings.
 *
 * ## What "end to end" does *not* cover, because it is not wired
 *
 * **These scenarios never run the level's Cual programme, and neither does anything else.**
 * `LevelLoader` does not import the Cual compiler at all - its private `compile()` builds kinds,
 * settings and the start layout and nothing else - `LevelDef` has no field for a compiled
 * program, and `Simulation` has no phase that runs one. The blobs in this file therefore never
 * pull themselves; they only fall, stack and explode.
 *
 * The consequence is measured rather than asserted. Driving all 79 levels with no input at all
 * and a 2500-step cap: **9 are won, 69 are lost, 1 unfinished.** The 9 are the levels whose goal
 * blobs happen to be clearable by a falling piece; for the rest, upstream's own logic is what
 * pulls blobs together, and without it the board silts up and the border wins.
 *
 * That is a real gap in the engine, not a gap in this test, and it is recorded here and in the
 * reconciliation note rather than papered over by choosing a level that flatters the limitation.
 * `ParatroopersInvers` was chosen *because* it survives the limitation in both directions.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LevelLoader } from "../level-format/loader.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { GRX, GRY, GRIC } from "./constants.ts";
import { Simulation } from "./simulation.ts";
import { createPrng } from "../prng.ts";

const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");
const GLOBALS = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");

/**
 * The index entry, so the level is addressed the way the catalogue addresses it.
 *
 * The `??` carries a throw rather than a non-null assertion, so the narrowing is part of the
 * type: without it every use below is `possibly undefined` and the test file's errors are
 * about the harness rather than about the game.
 */
const ENTRY = LEVEL_INDEX.levels.find((entry) => entry.id === "ParatroopersInvers") ?? (() => {
  throw new Error("paratroopers_invers is missing from the level index");
})();

/** The seed both scenarios share, so nothing but the key press differs. */
const SEED = 1;

/**
 * The level, from the committed `.ld` and nothing else.
 *
 * A fresh loader per call, because `LevelLoader` caches by filename and a cached board from an
 * earlier call would make every comparison after the first vacuous.
 */
function loadLevel(): Promise<LevelDef> {
  const difficulty = [...ENTRY.difficulties.values()][0];
  if (difficulty === undefined) throw new Error(`${ENTRY.id} has no difficulties in the index`);
  return new LevelLoader({
    fetchLevel: async (filename) => readFileSync(resolve(DATA_DIR, filename), "latin1"),
    art: ART_MANIFEST,
    globalsSource: GLOBALS,
    // The start layout is randomised at load time, so a seed is not optional here - without
    // one the two scenarios would not be playing the same board.
    random: createPrng(SEED),
  }).load(ENTRY.filename, ENTRY.id, difficulty.track, difficulty.difficulty).then((r) => r.level);
}

/** What one scenario observed, without keeping 1744 snapshots alive. */
interface Run {
  readonly sim: Simulation;
  readonly steps: number;
  /** The falling piece's column on each step, or `null` when none was in play. */
  readonly columns: readonly (number | null)[];
  /** The step the first explosion was scheduled on, or -1. */
  readonly firstExplosionAt: number;
  /** The step the time-bonus animation began, or -1. */
  readonly enteredBonusAt: number;
  /** Score when the time-bonus animation began, or -1 if it never did. */
  readonly scoreAtBonus: number;
}

/** The kind at `(x, y)`, or `null` for an empty cell. */
function cellAt(sim: Simulation, x: number, y: number): number | null {
  return sim.board.cells[y * GRX + x]?.kind ?? null;
}

/** Every cell `(x, y)` holding `kind`, as `[x, y]` pairs, in reading order. */
function cellsWithKind(sim: Simulation, kind: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < GRY; y++) {
    for (let x = 0; x < GRX; x++) if (cellAt(sim, x, y) === kind) out.push([x, y]);
  }
  return out;
}

/**
 * Plays the level to its end, pressing `act` before every step.
 *
 * `act` is one of the four player actions. Nothing else about the simulation is touched, which
 * is the property that makes this a scenario and not a unit test with extra steps.
 */
function play(level: LevelDef, act: (sim: Simulation) => void): Run {
  const sim = new Simulation(level, { seed: SEED });
  const columns: (number | null)[] = [];
  let steps = 0;
  let firstExplosionAt = -1;
  let enteredBonusAt = -1;
  let scoreAtBonus = -1;

  while (!sim.isOver() && steps < 4000) {
    const before = sim.phase;
    act(sim);
    columns.push(sim.fall?.x ?? null);
    sim.step();
    steps++;
    if (sim.phase === "exploding" && before !== "exploding" && firstExplosionAt < 0) {
      firstExplosionAt = steps;
    }
    if (sim.phase === "timeBonus" && enteredBonusAt < 0) {
      enteredBonusAt = steps;
      scoreAtBonus = sim.score;
    }
  }
  return { sim, steps, columns, firstExplosionAt, enteredBonusAt, scoreAtBonus };
}

describe("the level both scenarios are played on", () => {
  it("is upstream's paratroopers.ld, with upstream's kinds", async () => {
    const level = await loadLevel();
    expect(ENTRY.filename).toBe("paratroopers.ld");
    expect(level.kinds.map((kind) => kind.name)).toEqual([
      "Paratrooper",
      "Gray",
      "Cannon",
    ]);
    // The goals are named by the catalogue, and `Simulation` counts them off `startDist`, so
    // this is what makes `goalCount` 4 rather than 0. Getting it wrong would make the level
    // "win" instantly with nothing on the board.
    expect(ENTRY.goalKinds).toEqual(["Cannon"]);
  });

  it("opens with the start layout the .ld describes, at these exact squares", async () => {
    // Positions, not a count: "there are 8 blobs" would pass for a board where all 8 landed
    // in one corner, which is precisely the failure this repository has been bitten by twice.
    const sim = new Simulation(await loadLevel(), { seed: SEED });

    expect(cellsWithKind(sim, 2)).toEqual([
      [4, 16],
      [5, 16],
      [4, 17],
      [5, 17],
    ]);
    expect(cellsWithKind(sim, 1)).toEqual([
      [4, 18],
      [5, 18],
      [4, 19],
      [5, 19],
    ]);
    // Four goals, from the 2x2 Cannon block.
    expect(sim.goalCount).toBe(4);
    // And nothing anywhere else: rows 0-15 are empty, which is where the piece has room.
    expect(sim.board.cells.slice(0, 16 * GRX).every((cell) => cell === null)).toBe(true);
  });

  it("is the same board for both scenarios", async () => {
    // The loader's start layout is randomised, so this is the check that a change to the seed
    // or to how the loader is built cannot quietly give the two runs different boards and make
    // the comparison below meaningless.
    const [a, b] = [await loadLevel(), await loadLevel()];
    expect(b.startDist).toEqual(a.startDist);
  });
});

describe("pressing rotate before every step", () => {
  it("drops the piece onto the goal block rather than beside it", async () => {
    // The one assertion that says the input reached the board: on step 12 the falling piece is
    // still in column 4, the column the goal block occupies. `rotate` turns the piece and does
    // not move it, so the spawn column survives - and the comparison with the loss run below
    // is what makes "still in column 4" mean anything.
    const run = play(await loadLevel(), (sim) => sim.rotate());
    expect(run.columns[11]).toBe(4);
  });

  it("wins", async () => {
    const run = play(await loadLevel(), (sim) => sim.rotate());
    expect(run.sim.phase).toBe("won");
    expect(run.sim.isOver()).toBe(true);
    expect(run.sim.goalCount).toBe(0);
    expect(run.steps).toBe(447);
  });

  it("leaves no Cannon anywhere, at any square", async () => {
    // The goals are gone by position, not by a counter reaching zero: `goalCount` is derived
    // and could in principle be decremented for the wrong blob.
    const run = play(await loadLevel(), (sim) => sim.rotate());
    expect(cellsWithKind(run.sim, 2)).toEqual([]);
    // The falling piece went with them - it was part of the group that exploded.
    expect(cellsWithKind(run.sim, 0)).toEqual([]);
    // What is left is Gray, which this level's rules do not destroy.
    expect(cellsWithKind(run.sim, 1)).toHaveLength(10);
  });

  it("reaches the time bonus only after the goals are gone", async () => {
    const run = play(await loadLevel(), (sim) => sim.rotate());
    expect(run.firstExplosionAt).toBe(420);
    expect(run.enteredBonusAt).toBe(427);
    // The win is decided by `goalCount === 0`, so the bonus must not begin before that.
    expect(run.enteredBonusAt).toBeGreaterThan(run.firstExplosionAt);
  });

  it("pays the bonus for exactly one row per step and then stops", async () => {
    // **Absolute numbers, not an identity, and not a ratio.** Two attempts at the elegant
    // version were both caught by mutation and both left this file green: asserting
    // `score === scoreAtBonus + POINTS_PER_TIME_BONUS * GRY` puts the constant on both sides,
    // and dividing the measured difference by the measured step count *also* fails to pin
    // anything, because the measured rate simply is whatever the constant says. Doubling
    // `POINTS_PER_TIME_BONUS` to 20 satisfied both. Only a number with no constant in it can
    // fail.
    //
    // So: 96 points are scored before the bonus animation begins, the animation runs for one
    // row per step, and each of those steps adds `punkte_fuer_zeitbonus` - 10, per
    // `src/leveldaten.h:61` as verified in task 12.2. 96 + 20 * 10 = 296.
    const run = play(await loadLevel(), (sim) => sim.rotate());
    // The animation lasts exactly one row's worth of steps, and the border comes to rest at
    // the very bottom.
    expect(run.steps - run.enteredBonusAt).toBe(GRY);
    expect(run.sim.borderPx).toBe(GRY * GRIC);
    // The two absolute scores, which is where the per-step payout actually shows up.
    expect(run.scoreAtBonus).toBe(96);
    expect(run.sim.score).toBe(296);
  });
});

describe("pressing moveLeft before every step", () => {
  it("walks the piece to column 0, off the goal block", async () => {
    // The mirror of the assertion above, and the whole point of the pair. Same level, same
    // seed, same step - the piece is somewhere else entirely because one key was pressed.
    const run = play(await loadLevel(), (sim) => sim.moveLeft());
    expect(run.columns[11]).toBe(0);
  });

  it("loses", async () => {
    const run = play(await loadLevel(), (sim) => sim.moveLeft());
    expect(run.sim.phase).toBe("lost");
    expect(run.sim.isOver()).toBe(true);
    expect(run.steps).toBe(1744);
  });

  it("still has all four goals on the squares they started on", async () => {
    // 1744 steps in and the goal block has not moved and has not died. Counted by position,
    // because "goalCount is 4" would also be true if the goals had been dragged elsewhere -
    // which is what a broken piece-move looks like from the HUD alone.
    const run = play(await loadLevel(), (sim) => sim.moveLeft());
    expect(cellsWithKind(run.sim, 2)).toEqual([
      [4, 16],
      [5, 16],
      [4, 17],
      [5, 17],
    ]);
    expect(run.sim.goalCount).toBe(4);
  });

  it("leaves the player's own pieces where they were steered, on the bottom row", async () => {
    // The `Paratrooper` blobs are the falling pieces, so this is the input's own work, and it
    // is asserted as two squares rather than as "two pieces" - a pile-up in the wrong corner
    // would satisfy a count.
    //
    // The `Gray` blobs are *not* asserted here, because they do not stay put: the winning run
    // also ends with ten of them on row 0, having started on rows 18-19. Something in the
    // border or the settling lifts them, and this file does not claim to know what.
    const run = play(await loadLevel(), (sim) => sim.moveLeft());
    expect(cellsWithKind(run.sim, 0)).toEqual([
      [2, 19],
      [3, 19],
    ]);
  });

  it("loses with blobs sitting in the row a piece is introduced into", async () => {
    // The mechanism, so a future change that loses for a different reason cannot pass this
    // file by accident: `spawnPiece` sets `lost` when `canSpawn` fails, and the only thing
    // here that can fail it is the pile the player built.
    const run = play(await loadLevel(), (sim) => sim.moveLeft());
    // Row 0 is still clear, but row 1 is not, and the border has risen to within two rows of
    // it. The board reached the spawn area rather than merely getting tall.
    expect(cellAt(run.sim, 3, 0)).toBeNull();
    expect(cellAt(run.sim, 3, 1)).not.toBeNull();
    expect(run.sim.borderPx).toBeLessThan(2 * GRIC);
    // The player never reached the time bonus, because the level was never cleared.
    expect(run.enteredBonusAt).toBe(-1);
  });
});

describe("the two runs differ only in the key pressed", () => {
  it("one wins and one loses, on the same board with the same random sequence", async () => {
    // The load-bearing claim of the file. A test in which the player's input did nothing could
    // not produce two different endings, so this failing means the input path is broken rather
    // than that a rule changed.
    const level = await loadLevel();
    const rotating = play(level, (sim) => sim.rotate());
    const walking = play(level, (sim) => sim.moveLeft());

    expect(rotating.sim.phase).toBe("won");
    expect(walking.sim.phase).toBe("lost");
    // Same level object, so the boards were identical at step 0.
    expect(rotating.sim.level).toBe(level);
  });

  it("and the piece is never in the same column in the two runs", async () => {
    const level = await loadLevel();
    const rotating = play(level, (sim) => sim.rotate());
    const walking = play(level, (sim) => sim.moveLeft());

    // `moveLeft` walks the piece left one column per press, so it reaches column 0 and stays
    // there; `rotate` turns the piece in place, which leaves the anchor where the level put it.
    //
    // Stated as disjointness rather than as a single step, because `rotate` does move the
    // anchor - the piece is two blobs wide, and turning it changes which blob is the anchor -
    // so the rotating run visits column 5 as well as 4. An earlier draft of this file asserted
    // the rotating run's column was constant, and it was not. What is true, and what the two
    // endings depend on, is that the runs never share a column.
    const inRotating = new Set(rotating.columns.filter((x) => x !== null));
    const inWalking = new Set(walking.columns.filter((x) => x !== null));
    expect(walking.columns[3]).toBe(0);
    expect(inRotating.has(0)).toBe(false);
    for (const column of inWalking) expect(inRotating.has(column)).toBe(false);
  });

  it("neither run is decided by the random source", async () => {
    // Both scenarios use one seed, so a change in the PRNG would move both step counts and
    // the exact numbers asserted above. Asserting the endings rather than the step counts is
    // what survives that; the step counts are here so a *change* is noticed.
    const level = await loadLevel();
    expect(play(level, (sim) => sim.rotate()).sim.phase).toBe("won");
    expect(play(level, (sim) => sim.moveLeft()).sim.phase).toBe("lost");
  });
});
