/**
 * Verification for grey blob generation and gravity.
 *
 * Covers tasks 5.11, 5.12 and 5.13. The grey count is the part of the game a
 * player feels most directly - too few and the board never fills, too many and
 * it is unplayable - so the formula is pinned against the arithmetic in
 * `Spielfeld::calcFlopp` rather than against whatever the code happens to do.
 */

import { describe, expect, it } from "vitest";
import {
  EXPLOSION_STEPS,
  FLOATS,
  GRIC,
  GRX,
  GRY,
  GREY_SPAWN_OFFSET_PX,
} from "./constants.ts";
import { Blob } from "./board.ts";
import { Simulation } from "./simulation.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import { Prng } from "../prng.ts";
import type { RandomSource } from "../prng.ts";
import { RecordingPrng, ScriptedPrng } from "../testing/prng-stub.ts";
import { nasenkugeln } from "../level-format/fixtures.ts";

import { testBlob } from "../testing/blob.ts";
/** A source that keeps returning the same value, for deterministic draws. */
function fixed(value: number, count = 20000): ScriptedPrng {
  return new ScriptedPrng(new Array(count).fill(value));
}

function blobOf(sim: Simulation, kind: number): Blob {
  const blob = testBlob();
  blob.initFromKind(sim.level.kinds[kind]!);
  return blob;
}

/** Nasenkugeln with the colour kinds' explosion threshold changed. */
function withNumexplode(numexplode: number): LevelDef {
  const base = nasenkugeln();
  return {
    ...base,
    kinds: base.kinds.map((k) =>
      k.role === "colour" ? { ...k, numexplode } : k,
    ),
  };
}

/** A level with no goal blobs, so nothing is won or lost while testing. */
function withoutGoals(): LevelDef {
  return { ...nasenkugeln(), startDist: [] };
}

describe("5.11 the grey count formula", () => {
  it("schedules 1 grey for a single one-weight blob", () => {
    // grz = 1 + 0 (no chain) + 1 (component weight) - 1 (maxPlatzAnzahl) = 1.
    const sim = new Simulation(withNumexplode(1), { random: fixed(0.01) });
    sim.board.set(4, 5, blobOf(sim, 0));
    sim.recount();
    sim.testExplosions();
    expect(sim.phase).toBe("exploding");
    expect(sim.pendingGreys).toBe(1);
  });

  it("schedules 12 greys for a 12-weight component during a chain reaction", () => {
    // grz = 1 + 5 (graue_bei_kettenreaktion) + 12 (component weight)
    //       - 6 (maxPlatzAnzahl) = 12.
    const sim = new Simulation(withNumexplode(6), { random: fixed(0.01) });

    // The first detonation is what sets the chain-reaction flag, so drive the
    // real path rather than setting the flag by hand. It needs a component that
    // actually reaches this level's threshold of 6.
    for (let x = 0; x < 6; x++) sim.board.set(x, 5, blobOf(sim, 0));
    sim.recount();
    sim.testExplosions();
    expect(sim.chainReaction).toBe(true);
    // Its own grey: 1 + 6 - 6 = 1.
    expect(sim.pendingGreys).toBe(1);

    // Clear it away, then detonate the big component.
    for (let i = 0; i < EXPLOSION_STEPS; i++) sim.finishExplosions();
    sim.pendingGreys = 0;
    sim.board.clear();

    for (let x = 0; x < GRX; x++) sim.board.set(x, 6, blobOf(sim, 0));
    // Two more on the row above, still connected, giving weight 12.
    sim.board.set(0, 5, blobOf(sim, 0));
    sim.board.set(1, 5, blobOf(sim, 0));
    sim.recount();

    sim.testExplosions();
    expect(sim.pendingGreys).toBe(12);
  });

  it("never schedules fewer than zero greys", () => {
    // A component far smaller than its own threshold cannot detonate at all, so
    // this is really a guard on the subtraction of maxPlatzAnzahl.
    const sim = new Simulation(withNumexplode(6), { random: fixed(0.01) });
    sim.board.set(0, 5, blobOf(sim, 0));
    for (let x = 1; x < 6; x++) sim.board.set(x, 5, blobOf(sim, 0));
    sim.recount();
    sim.testExplosions();
    expect(sim.phase).toBe("exploding");
    // 1 + 6 - 6 = 1, the documented minimum.
    expect(sim.pendingGreys).toBe(1);
  });
});

describe("5.11 grey placement", () => {
  it("appears at hetzrand + 8px", () => {
    const sim = new Simulation({ ...withoutGoals(), topTime: 50 }, {
      random: fixed(0.01),
    });
    // 160px border + the 8px offset = 168, which is row 5.
    sim.time = 160 * 50;
    sim.borderPx = 160;
    sim.pendingGreys = 3;
    sim.fall = null;

    sim.step();

    const expectedRow = Math.floor((160 + GREY_SPAWN_OFFSET_PX) / GRIC);
    expect(expectedRow).toBe(5);
    for (let x = 0; x < GRX; x++) {
      const cell = sim.board.at(x, expectedRow);
      if (cell !== null) {
        expect(sim.level.kinds[cell.kind]?.role).toBe("grey");
      }
    }
    expect(sim.greyCount).toBe(3);
  });

  it("places greys only in free columns", () => {
    const sim = new Simulation({ ...withoutGoals(), topTime: 50 }, {
      random: fixed(0.01),
    });
    sim.time = 160 * 50;
    sim.borderPx = 160;
    sim.pendingGreys = 10;
    sim.fall = null;

    // Wall off the left half of the spawn row.
    for (let x = 0; x < 5; x++) {
      const wall = blobOf(sim, 5);
      wall.behaviour |= FLOATS;
      sim.board.set(x, 5, wall);
    }
    sim.recount();

    sim.step();

    for (let x = 0; x < 5; x++) {
      expect(sim.level.kinds[sim.board.at(x, 5)?.kind ?? 0]?.role).not.toBe(
        "grey",
      );
    }
  });

  it("cancels an arrival when nogreyprob outweighs the grey weights", () => {
    // `empfangeGraue` rolls each scheduled grey against greySum + noGreyWeight,
    // so a large nogreyprob suppresses arrivals without changing the count of
    // greys the explosion scheduled.
    const sim = new Simulation(
      { ...withoutGoals(), topTime: 50, noGreyProb: 1000 },
      { random: fixed(0.99) },
    );
    sim.time = 160 * 50;
    sim.borderPx = 160;
    sim.pendingGreys = 5;
    sim.fall = null;

    sim.step();
    expect(sim.greyCount).toBe(0);
  });

  it("arrives when nogreyprob is zero", () => {
    const sim = new Simulation(
      { ...withoutGoals(), topTime: 50, noGreyProb: 0 },
      { random: fixed(0.01) },
    );
    sim.time = 160 * 50;
    sim.borderPx = 160;
    sim.pendingGreys = 5;
    sim.fall = null;

    sim.step();
    expect(sim.greyCount).toBe(5);
  });
});

describe("5.12 random grey arrivals", () => {
  /**
   * Counts `chance` rolls across a long run that outlives several levels.
   *
   * `Simulation.reset` deliberately rewinds its random source, so a shared
   * source replayed across restarts would measure the same opening window over
   * and over. This double keeps the sequence running instead, which is what
   * makes the observed rate meaningful.
   */
  class CountingPrng implements RandomSource {
    rolls = 0;
    hits = 0;

    constructor(private readonly inner: Prng) {}

    next(): number {
      return this.inner.next();
    }
    int(bound: number): number {
      return this.inner.int(bound);
    }
    chance(numerator: number, denominator: number): boolean {
      this.rolls++;
      const hit = this.inner.chance(numerator, denominator);
      if (hit) this.hits++;
      return hit;
    }
    pick<T>(items: readonly T[]): T | undefined {
      return this.inner.pick(items);
    }
    weighted(weights: readonly number[]): number {
      return this.inner.weighted(weights);
    }
    /** Intentionally not rewound; see the class comment. */
    restart(): void {}
  }

  it("arrives at about the configured rate over a long run", () => {
    // `zufallsGraue` rolls rnd(mZufallsGraue) == 0 once per step, so one
    // arrival is expected every `randomGreys` steps.
    const interval = 20;
    const level: LevelDef = {
      ...withoutGoals(),
      randomGreys: interval,
      // A border that never reaches the board, so levels end quickly and the
      // run spans many of them.
      topTime: 1_000_000,
    };

    const prng = new CountingPrng(new Prng([20260930]));
    let sim = new Simulation(level, { random: prng });
    let steps = 0;
    while (steps < 40_000) {
      if (sim.isOver()) sim = new Simulation(level, { random: prng });
      sim.step();
      steps++;
    }

    // Exactly one roll per playing step. Time-bonus steps do not roll, so this
    // is slightly under the step count - the bonus animation is the only step
    // that skips it.
    expect(prng.rolls).toBeLessThan(steps);
    expect(prng.rolls).toBeGreaterThan(steps * 0.75);

    const observed = prng.hits / prng.rolls;
    const expected = 1 / interval;
    // A Bernoulli rate over tens of thousands of trials is tight; 25% leaves
    // ample headroom while still failing if the interval is off by a factor of
    // two.
    expect(observed).toBeGreaterThan(expected * 0.75);
    expect(observed).toBeLessThan(expected * 1.25);
  }, 30000); // measured, not guessed: 15.6 runs every blob's code at the end of every step,
  // so a test that steps a lot now does the animation work too. Outside coverage this one
  // takes 1090ms; v8 instrumentation pushes it past vitest's 5s default. Raised rather than
  // trimmed, because skipping the animation would leave the step untested — which is the
  // failure the AGENTS notes record for explosion tests, arriving a third time.

  it("never schedules a random grey when randomGreys is negative", () => {
    const sim = new Simulation({ ...withoutGoals(), randomGreys: -1 }, {
      random: new RecordingPrng(new Prng([7])),
    });
    const prng = sim.random as RecordingPrng;
    for (let i = 0; i < 2000; i++) sim.step();
    expect(prng.callsTo("chance")).toHaveLength(0);
  });

  it("is reproducible from a seed", () => {
    const play = (): string => {
      const sim = new Simulation(
        { ...withoutGoals(), randomGreys: 8, topTime: 1_000_000 },
        { seed: 5150 },
      );
      for (let i = 0; i < 3000; i++) {
        if (sim.isOver()) break;
        sim.step();
      }
      return sim.board.cells.map((c) => (c === null ? "." : String(c.kind))).join("");
    };
    expect(play()).toBe(play());
  });
});

describe("5.13 gravity", () => {
  /**
   * Runs one step with no piece in play, so the step machine reaches settling
   * and applies gravity.
   */
  function settleOnce(sim: Simulation): void {
    sim.fall = null;
    sim.step();
  }

  it("drops a blob into a gap below it", () => {
    const sim = new Simulation(withoutGoals(), { random: fixed(0.01) });
    sim.board.set(3, GRY - 3, blobOf(sim, 5));
    sim.recount();

    settleOnce(sim);

    expect(sim.board.at(3, GRY - 1)).not.toBeNull();
    expect(sim.board.at(3, GRY - 3)).toBeNull();
  });

  it("packs a column with a gap in the middle", () => {
    const sim = new Simulation(withoutGoals(), { random: fixed(0.01) });
    // Rows 19, 17 and 16 occupied: one hole at 18.
    sim.board.set(3, GRY - 1, blobOf(sim, 5));
    sim.board.set(3, GRY - 3, blobOf(sim, 5));
    sim.board.set(3, GRY - 4, blobOf(sim, 5));
    sim.recount();

    for (let i = 0; i < 3; i++) settleOnce(sim);

    // Everything ends up packed against the floor: three blobs fill the bottom
    // three rows and nothing is left above them.
    expect(sim.board.at(3, GRY - 1)).not.toBeNull();
    expect(sim.board.at(3, GRY - 2)).not.toBeNull();
    expect(sim.board.at(3, GRY - 3)).not.toBeNull();
    expect(sim.board.at(3, GRY - 4)).toBeNull();
  });

  it("leaves a floating blob where it is", () => {
    const sim = new Simulation(withoutGoals(), { random: fixed(0.01) });
    const floater = blobOf(sim, 5);
    floater.behaviour |= FLOATS;
    sim.board.set(3, 5, floater);
    sim.recount();

    settleOnce(sim);

    expect(sim.board.at(3, 5)).not.toBeNull();
    expect(sim.board.at(3, 6)).toBeNull();
  });

  it("settles blobs underneath a floating one", () => {
    const sim = new Simulation(withoutGoals(), { random: fixed(0.01) });
    const floater = blobOf(sim, 5);
    floater.behaviour |= FLOATS;
    sim.board.set(3, 3, floater);
    sim.board.set(3, GRY - 3, blobOf(sim, 5));
    sim.recount();

    for (let i = 0; i < 3; i++) settleOnce(sim);

    // The floater stays put; the solid blob below it falls to the floor.
    expect(sim.board.at(3, 3)).not.toBeNull();
    expect(sim.board.at(3, GRY - 1)).not.toBeNull();
  });

  it("leaves empty cells empty", () => {
    const sim = new Simulation(withoutGoals(), { random: fixed(0.01) });
    const before = [...sim.board.occupied()].length;
    settleOnce(sim);
    // Gravity moves blobs, it never creates them.
    expect([...sim.board.occupied()].length).toBe(before);
  });

  it("does not move a blob that already rests on the floor", () => {
    const sim = new Simulation(withoutGoals(), { random: fixed(0.01) });
    const resting = blobOf(sim, 5);
    sim.board.set(3, GRY - 1, resting);
    sim.recount();

    settleOnce(sim);

    expect(sim.board.at(3, GRY - 1)).toBe(resting);
  });
});
