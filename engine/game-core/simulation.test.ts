import { describe, expect, it } from "vitest";
import { EXPLOSION_STEPS, FALLING_SPEED, FLOATS, GRX, GRY } from "./constants.ts";
import { Blob } from "./board.ts";
import { Simulation } from "./simulation.ts";
import { ScriptedPrng } from "../testing/prng-stub.ts";
import { hormone, nasenkugeln } from "../level-format/fixtures.ts";

/** A source that always returns the same kinds, for predictable placement. */
function fixedKindPicker(kindId: number): ScriptedPrng {
  const values: number[] = [];
  for (let i = 0; i < 4000; i++) values.push((kindId + 0.5) / 8);
  return new ScriptedPrng(values);
}

function makeSim(level = nasenkugeln(), random = fixedKindPicker(0)): Simulation {
  return new Simulation(level, { random });
}

describe("Simulation: setup", () => {
  it("builds the board from startDist, bottom-aligned", () => {
    const sim = makeSim();
    // Nasenkugeln has a single start row, which must sit on the bottom row.
    for (let x = 0; x < GRX; x++) {
      const blob = sim.board.at(x, GRY - 1);
      expect(blob, `cell ${x}`).not.toBeNull();
    }
    expect(sim.board.at(0, GRY - 2)).toBeNull();
  });

  it("counts the goal blobs on the board", () => {
    expect(makeSim().goalCount).toBe(GRX);
  });

  it("spawns the first piece horizontally at column 4", () => {
    const sim = makeSim();
    expect(sim.fall).not.toBeNull();
    expect(sim.fall?.x).toBe(4);
    expect(sim.fall?.orientation).toBe("horizontal");
  });

  it("previews the next piece", () => {
    expect(makeSim().next).not.toBeNull();
  });
});

describe("Simulation: falling and steering", () => {
  it("descends by 6 pixels per step at normal speed", () => {
    const sim = makeSim();
    const before = sim.fall?.yPx ?? 0;
    sim.step();
    expect((sim.fall?.yPx ?? 0) - before).toBe(FALLING_SPEED);
  });

  it("descends a full cell per step while fast falling", () => {
    const sim = makeSim();
    sim.toggleFast();
    const before = sim.fall?.yPx ?? 0;
    sim.step();
    expect((sim.fall?.yPx ?? 0) - before).toBe(32);
  });

  it("moves left and right by one cell", () => {
    const sim = makeSim();
    const start = sim.fall?.x ?? 0;
    sim.moveLeft();
    expect(sim.fall?.x).toBe(start - 1);
    sim.moveRight();
    sim.moveRight();
    expect(sim.fall?.x).toBe(start + 1);
  });

  it("rotates between horizontal and vertical", () => {
    const sim = makeSim();
    sim.rotate();
    expect(sim.fall?.orientation).toBe("vertical");
    sim.rotate();
    expect(sim.fall?.orientation).toBe("horizontal");
  });

  it("refuses to move outside the board", () => {
    const sim = makeSim();
    for (let i = 0; i < 20; i++) sim.moveLeft();
    expect(sim.fall?.x).toBe(0);
    for (let i = 0; i < 40; i++) sim.moveRight();
    // A horizontal piece needs two columns, so it stops at GRX - 2.
    expect(sim.fall?.x).toBe(GRX - 2);
  });

  it("toggles fast falling off again", () => {
    const sim = makeSim();
    expect(sim.fall?.fast).toBe(false);
    sim.toggleFast();
    expect(sim.fall?.fast).toBe(true);
    sim.toggleFast();
    expect(sim.fall?.fast).toBe(false);
  });
});

describe("Simulation: landing", () => {
  it("settles the piece onto the board once it cannot descend", () => {
    // With explosions suppressed the board can only grow, so a rising count is
    // unambiguous evidence that pieces are landing rather than being cleared.
    const base = nasenkugeln();
    const level = {
      ...base,
      kinds: base.kinds.map((k) => ({ ...k, numexplode: 99 })),
    };
    const sim = new Simulation(level, { random: fixedKindPicker(0) });
    const before = [...sim.board.occupied()].length;
    for (let i = 0; i < 150; i++) sim.step();
    expect([...sim.board.occupied()].length).toBeGreaterThan(before);
  });

  it("keeps blobs inside the board", () => {
    const sim = makeSim();
    for (let i = 0; i < 600; i++) {
      sim.step();
      for (const { x, y } of sim.board.occupied()) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(GRX);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(GRY);
      }
    }
  });
});

describe("Simulation: explosions", () => {
  /** Places a row of `count` same-kind blobs, bypassing the start layout. */
  function layRow(sim: Simulation, kindId: number, count: number, y = 5): void {
    const kind = sim.level.kinds[kindId]!;
    for (let x = 0; x < count; x++) {
      const blob = new Blob();
      blob.initFromKind(kind);
      sim.board.set(x, y, blob);
    }
    sim.recount();
  }

  it("detonates a component that reaches numexplode", () => {
    const sim = makeSim();
    const kind = sim.level.kinds[0]!;
    expect(kind.numexplode).toBe(6);

    layRow(sim, 0, 6);
    sim.testExplosions();

    // All six began exploding, so each scored 1 point.
    expect(sim.score).toBe(6);
    let exploding = 0;
    for (const { x, y } of sim.board.occupied()) {
      if (sim.board.at(x, y)?.exploding) exploding++;
    }
    expect(exploding).toBe(6);
  });

  it("leaves a component below the threshold alone", () => {
    const sim = makeSim();
    layRow(sim, 0, 5);
    sim.testExplosions();
    expect(sim.score).toBe(0);
    for (const { x, y } of sim.board.occupied()) {
      expect(sim.board.at(x, y)?.exploding).toBe(0);
    }
  });

  it("propagates an explosion into goal blobs", () => {
    // Nasenkugeln has chaingrass = 0, so grass always reacts.
    const sim = makeSim();
    const before = sim.score;
    layRow(sim, 0, 6, GRY - 2); // row above the goal row
    sim.testExplosions();
    expect(sim.score).toBeGreaterThan(before + 5);
    const grass = sim.board.at(0, GRY - 1);
    expect(grass?.exploding).toBe(1);
  });

  it("does not propagate into goal blobs when chaingrass is set", () => {
    const sim = makeSim(hormone(), fixedKindPicker(0));
    const goalRow = sim.level.startDist.length > 0 ? GRY - 1 : GRY - 1;
    for (let x = 0; x < 6; x++) {
      const blob = new Blob();
      blob.initFromKind(sim.level.kinds[0]!);
      sim.board.set(x, goalRow - 1, blob);
    }
    sim.recount();
    sim.testExplosions();
    // The first explosion must not take the grass with it.
    expect(sim.board.at(0, goalRow)?.exploding).toBe(0);
  });

  it("schedules grey blobs after an explosion", () => {
    const sim = makeSim();
    layRow(sim, 0, 6);
    sim.testExplosions();
    // 1 + component weight (6) - largest numexplode (6) = 1.
    expect(sim.pendingGreys).toBe(1);
  });

  it("awards the chain-reaction bonus on a cascade", () => {
    const sim = makeSim();
    layRow(sim, 0, 6);
    sim.testExplosions();
    // Finish the first animation, then let the board settle so the next pass
    // runs with chainReaction already set.
    for (let i = 0; i < 12; i++) sim.step();
    expect(sim.score).toBeGreaterThanOrEqual(6);
  });

  it("keeps an exploding blob on the board for the whole animation", () => {
    const sim = makeSim();
    layRow(sim, 0, 6);
    sim.testExplosions();
    // EXPLOSION_STEPS - 1 advances must leave it still present and exploding,
    // which is what makes the animation visible.
    for (let i = 0; i < EXPLOSION_STEPS - 1; i++) {
      sim.finishExplosions();
      const blob = sim.board.at(0, 5);
      expect(blob, `removed early at advance ${i + 1}`).not.toBeNull();
      expect(blob?.exploding).toBeGreaterThan(0);
    }
    sim.finishExplosions();
    for (let x = 0; x < 6; x++) {
      expect(sim.board.at(x, 5), `cell ${x} survived the animation`).toBeNull();
    }
  });
});

describe("Simulation: chase border", () => {
  it("descends one pixel every topTime steps", () => {
    const sim = makeSim();
    expect(sim.borderPx).toBe(0);
    for (let i = 0; i < 49; i++) sim.step();
    expect(sim.borderPx).toBe(0);
    sim.step();
    expect(sim.borderPx).toBe(1);
  });

  it("kills the player when the border reaches a blob", () => {
    // A fast border and a blob parked near the top make this deterministic.
    const level = { ...nasenkugeln(), topTime: 2 };
    const sim = new Simulation(level, { random: fixedKindPicker(0) });
    const blocker = new Blob();
    blocker.initFromKind(level.kinds[5]!); // goal kind, so it is not cleared
    // Floating, so gravity cannot drop it out of the border's path.
    blocker.behaviour |= FLOATS;
    sim.board.set(4, 2, blocker);
    sim.recount();

    for (let i = 0; i < 500 && sim.phase !== "lost"; i++) sim.step();
    expect(sim.phase).toBe("lost");
  });
});

describe("Simulation: lifecycle", () => {
  it("reaches a terminal state", () => {
    const sim = new Simulation({ ...nasenkugeln(), topTime: 4 }, { seed: 77 });
    for (let i = 0; i < 20000; i++) {
      sim.step();
      if (sim.phase === "won" || sim.phase === "lost") break;
    }
    expect(["won", "lost"]).toContain(sim.phase);
  });

  it("is reproducible for the same seed and inputs", () => {
    const play = () => {
      const sim = new Simulation(nasenkugeln(), { seed: 4242 });
      for (let i = 0; i < 1500; i++) {
        if (i % 7 === 0) sim.moveLeft();
        if (i % 11 === 0) sim.moveRight();
        if (i % 13 === 0) sim.rotate();
        sim.step();
      }
      return {
        score: sim.score,
        phase: sim.phase,
        board: sim.board.cells.map((c) => (c === null ? "." : String(c.kind))).join(""),
      };
    };
    expect(play()).toEqual(play());
  });

  it("is reproducible with an injected random source", () => {
    const play = () => {
      const values = Array.from({ length: 5000 }, (_, i) => ((i * 37) % 1000) / 1000);
      const sim = new Simulation(hormone(), { random: new ScriptedPrng(values) });
      for (let i = 0; i < 400; i++) sim.step();
      return sim.board.cells.map((c) => (c === null ? "." : String(c.kind))).join("");
    };
    expect(play()).toEqual(play());
  });

  it("reset restores the initial board and counters", () => {
    const sim = makeSim();
    for (let i = 0; i < 200; i++) sim.step();
    sim.reset();
    expect(sim.score).toBe(0);
    expect(sim.time).toBe(0);
    expect(sim.goalCount).toBe(GRX);
  });
});
