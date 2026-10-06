// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Verification for the mode machine, the loss condition, scoring and the
 * lifecycle.
 *
 * Covers tasks 5.15 to 5.19. These are the parts of the game a player notices
 * immediately when they are wrong: a piece that arrives while the field is still
 * draining, a level that will not end, or a score that does not add up.
 */

import { describe, expect, it } from "vitest";
import {
  FLOATS,
  GRIC,
  GRX,
  GRY,
  NEW_FALL_MARGIN,
} from "./constants.ts";
import { Blob } from "./board.ts";
import { Simulation } from "./simulation.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import { ScriptedPrng } from "../testing/prng-stub.ts";
import { nasenkugeln } from "../level-format/fixtures.ts";

import { testBlob } from "../testing/blob.ts";
const GOAL_KIND = 5;

function fixed(value = 0.01, count = 20000): ScriptedPrng {
  return new ScriptedPrng(new Array(count).fill(value));
}

function blobOf(sim: Simulation, kind: number): Blob {
  const blob = testBlob();
  blob.initFromKind(sim.level.kinds[kind]!);
  return blob;
}

/**
 * Nasenkugeln with a border that never reaches the board, and goal blobs only
 * in the named columns.
 *
 * Empty columns matter: with the full start row in place nothing can ever settle
 * high up, because every column is floored.
 */
function openBoard(
  goalColumns: readonly number[],
  overrides: Partial<LevelDef> = {},
): LevelDef {
  const base = nasenkugeln();
  const row = Array.from({ length: GRX }, (_, x) =>
    goalColumns.includes(x) ? { kind: GOAL_KIND, version: 0 } : null,
  );
  return {
    ...base,
    startDist: [row],
    topTime: 1_000_000,
    ...overrides,
  };
}

/** Nasenkugeln with the colour kinds' explosion threshold changed. */
function withNumexplode(numexplode: number): LevelDef {
  const base = nasenkugeln();
  return {
    ...base,
    startDist: [],
    kinds: base.kinds.map((k) =>
      k.role === "colour" ? { ...k, numexplode } : k,
    ),
  };
}

/** Parks the chase border, keeping `time` consistent with it. */
function parkBorder(sim: Simulation, row: number): void {
  sim.time = row * GRIC * sim.level.topTime;
  sim.borderPx = row * GRIC;
}

describe("5.15 the spawn gate", () => {
  it("withholds a new piece while a blob is still above the spawn margin", () => {
    // The margin is the grey spawn row plus five, so parking the border at row 5
    // puts it at row 10. A blob dropped from the top of an open column is still
    // falling above that when the step's gravity budget runs out, which is
    // exactly the state upstream reports as `rutschnach_viel`.
    const sim = new Simulation(openBoard([8, 9]), { random: fixed() });
    parkBorder(sim, 5);
    sim.board.set(0, 0, blobOf(sim, 0));
    sim.recount();
    sim.fall = null;

    sim.step();

    const landed = [...sim.board.occupied()].find((p) => p.x === 0)?.y ?? -1;
    expect(landed).toBeGreaterThan(0);
    expect(landed).toBeLessThan(10);
    expect(sim.isHeldBack()).toBe(true);
    // Still settling, so no piece has been sent.
    expect(sim.fall).toBeNull();
  });

  it("does not hold a piece back when the blob settles below the margin", () => {
    const sim = new Simulation(openBoard([8, 9]), { random: fixed() });
    parkBorder(sim, 5);
    // Low down, so it reaches the floor well below the margin.
    sim.board.set(0, 15, blobOf(sim, 0));
    sim.recount();
    sim.fall = null;

    sim.step();

    expect(sim.board.at(0, GRY - 1)).not.toBeNull();
    expect(sim.isHeldBack()).toBe(false);
  });

  it("puts the margin five cells below the grey spawn row", () => {
    const sim = new Simulation(openBoard([]), { random: fixed() });
    parkBorder(sim, 4);
    // Greys appear at hetzrand + 8px, i.e. row 4 here, and the margin is five
    // cells below that.
    const greyRow = Math.floor((sim.borderPx + 8) / GRIC);
    expect(greyRow).toBe(4);
    expect(greyRow + NEW_FALL_MARGIN).toBe(9);
  });

  it("refuses a piece whose spawn column is blocked", () => {
    // `insSpiel` returns false, and the piece stays out of play.
    const sim = new Simulation(openBoard([8, 9]), { random: fixed() });
    sim.fall = null;
    // Fill the two columns a piece at x=4 would occupy, from the floor up, so
    // nothing can fall and the stack stays put.
    for (let y = GRY - 1; y >= 6; y--) {
      for (const x of [4, 5]) sim.board.set(x, y, blobOf(sim, GOAL_KIND));
    }
    sim.recount();

    for (let i = 0; i < 20; i++) sim.step();

    // Either the piece never got in, or it went in and landed immediately on
    // the stack. What must never happen is a piece resting inside the stack.
    if (sim.fall !== null) {
      for (const p of sim.piecePositions(sim.fall)) {
        if (p.y < 0) continue;
        expect(sim.board.at(p.x, p.y), `piece inside the stack at ${p.x},${p.y}`)
          .toBeNull();
      }
    }
  });
});

describe("5.16 losing when no piece fits", () => {
  /**
   * A level state where the piece cannot be introduced at all.
   *
   * The border sits at row 6, so a piece would appear at row 5. Rows 4 and 6-19
   * are solid, which leaves row 5 free but puts a blob directly above every
   * spawn cell - which `testPlatzSpalte` refuses - while leaving the chase
   * border's own row clear so it does not kill first.
   */
  function walledIn(): Simulation {
    const sim = new Simulation(openBoard([]), { random: fixed() });
    sim.board.clear();
    for (let x = 0; x < GRX; x++) {
      sim.board.set(x, 4, blobOf(sim, GOAL_KIND));
      for (let y = 6; y < GRY; y++) {
        sim.board.set(x, y, blobOf(sim, GOAL_KIND));
      }
    }
    sim.recount();
    parkBorder(sim, 6);
    sim.fall = null;
    return sim;
  }

  it("ends the level as soon as the piece cannot be introduced", () => {
    const sim = walledIn();
    expect(sim.goalCount).toBeGreaterThan(0);
    sim.step();
    expect(sim.phase).toBe("lost");
    expect(sim.fall).toBeNull();
    expect(sim.isOver()).toBe(true);
  });

  it("freezes the level once lost", () => {
    const sim = walledIn();
    sim.step();
    const time = sim.time;
    const score = sim.score;
    for (let i = 0; i < 50; i++) sim.step();
    expect(sim.time).toBe(time);
    expect(sim.score).toBe(score);
    expect(sim.phase).toBe("lost");
  });
});

describe("5.17 scoring", () => {
  it("adds 22 for two normal blobs and one goal blob", () => {
    // 1 + 1 for the two colour blobs, 20 for the goal blob it sets off.
    const sim = new Simulation(withNumexplode(2), { random: fixed() });
    sim.board.set(0, 5, blobOf(sim, 0));
    sim.board.set(1, 5, blobOf(sim, 0));
    sim.board.set(2, 5, blobOf(sim, GOAL_KIND));
    sim.recount();

    sim.testExplosions();

    expect(sim.score).toBe(22);
  });

  it("adds 20 for a goal blob on its own", () => {
    const sim = new Simulation(withNumexplode(2), { random: fixed() });
    sim.board.set(0, 5, blobOf(sim, 0));
    sim.board.set(1, 5, blobOf(sim, 0));
    sim.board.set(2, 5, blobOf(sim, GOAL_KIND));
    sim.recount();
    sim.testExplosions();
    const withGoal = sim.score;

    const plain = new Simulation(withNumexplode(2), { random: fixed() });
    plain.board.set(0, 5, blobOf(plain, 0));
    plain.board.set(1, 5, blobOf(plain, 0));
    plain.recount();
    plain.testExplosions();

    expect(withGoal - plain.score).toBe(20);
    expect(plain.score).toBe(2);
  });

  it("adds 10 for a chain reaction, on top of the blobs", () => {
    const sim = new Simulation(withNumexplode(2), { random: fixed() });

    // The first detonation is what arms the chain bonus.
    for (let x = 0; x < 2; x++) sim.board.set(x, 5, blobOf(sim, 0));
    sim.recount();
    sim.testExplosions();
    expect(sim.chainReaction).toBe(true);
    expect(sim.score).toBe(2);

    // Clear it away, then detonate again: now the bonus applies.
    sim.board.clear();
    sim.board.set(4, 5, blobOf(sim, 0));
    sim.board.set(5, 5, blobOf(sim, 0));
    sim.recount();
    sim.testExplosions();

    expect(sim.score).toBe(2 + 10 + 2);
  });

  it("never decreases during a level", () => {
    const sim = new Simulation({ ...nasenkugeln(), topTime: 6 }, { seed: 31337 });
    let last = sim.score;
    for (let i = 0; i < 3000; i++) {
      sim.step();
      expect(sim.score).toBeGreaterThanOrEqual(last);
      last = sim.score;
      if (sim.isOver()) break;
    }
  });
});

describe("5.18 winning and the time bonus", () => {
  /** A level with no goal blobs left, one step away from being won. */
  function readyToWin(hetzrandStop = 0): Simulation {
    const sim = new Simulation(openBoard([], { hetzrandStop }), {
      random: fixed(),
    });
    sim.board.clear();
    sim.recount();
    sim.pendingGreys = 0;
    sim.fall = null;
    return sim;
  }

  it("wins once no goal blobs remain", () => {
    const sim = readyToWin();
    expect(sim.goalCount).toBe(0);
    sim.step();
    expect(sim.phase).toBe("timeBonus");
  });

  it("pays 10 per step and finishes after one step per row", () => {
    const sim = readyToWin();
    sim.step();
    expect(sim.phase).toBe("timeBonus");

    for (let i = 0; i < GRY; i++) sim.step();

    // Twenty rows at 10 points, and the border has reached the bottom.
    expect(sim.score).toBe(200);
    expect(sim.borderPx).toBe(GRY * GRIC);
    expect(sim.phase).toBe("won");
    expect(sim.isOver()).toBe(true);
  });

  it("stops paying once the bonus is over", () => {
    const sim = readyToWin();
    sim.step();
    for (let i = 0; i < GRY; i++) sim.step();
    const score = sim.score;
    for (let i = 0; i < 100; i++) sim.step();
    expect(sim.score).toBe(score);
  });

  it("pays out on the last step as well as the ones before it", () => {
    const sim = readyToWin();
    sim.step();
    // The step that lands the border on the bottom still pays.
    for (let i = 0; i < GRY - 1; i++) sim.step();
    expect(sim.phase).toBe("timeBonus");
    expect(sim.score).toBe((GRY - 1) * 10);
    sim.step();
    expect(sim.score).toBe(GRY * 10);
  });

  it("pays less when hetzrandStop leaves less height to convert", () => {
    // `topstop` is a number of pixels, so 320 leaves ten of the twenty rows.
    const full = readyToWin(0);
    full.step();
    while (!full.isOver()) full.step();

    const shortened = readyToWin(320);
    shortened.step();
    while (!shortened.isOver()) shortened.step();

    expect(shortened.score).toBeLessThan(full.score);
    expect(full.score).toBe(200);
    expect(shortened.score).toBe(100);
  });

  it("reads hetzrandStop as pixels, not rows", () => {
    // Ten rows is 320px. Reading it as rows would stop the border 10 rows up for
    // any non-zero value, which is a different number.
    const sim = readyToWin(320);
    expect(sim.bonusTargetPx()).toBe(GRY * GRIC - 320);
    expect(sim.bonusTargetPx()).toBe(10 * GRIC);
  });

  it("pays less when the border had already descended", () => {
    const sim = readyToWin();
    parkBorder(sim, 10);
    sim.fall = null;
    sim.step();
    while (!sim.isOver()) sim.step();
    // Only ten rows left to fall, so ten steps of ten points.
    expect(sim.score).toBe(100);
  });
});

describe("5.19 lifecycle and restart", () => {
  /** A fingerprint of everything a restart has to reproduce. */
  function fingerprint(sim: Simulation): string {
    return [
      sim.score,
      sim.time,
      sim.borderPx,
      sim.phase,
      sim.goalCount,
      sim.greyCount,
      sim.pendingGreys,
      sim.board.cells.map((c) => (c === null ? "." : String(c.kind))).join(""),
    ].join("|");
  }

  it("restores the initial layout, score and time", () => {
    const sim = new Simulation({ ...nasenkugeln(), topTime: 8 }, { seed: 606 });
    const initial = fingerprint(sim);

    for (let i = 0; i < 400; i++) sim.step();
    expect(fingerprint(sim)).not.toBe(initial);

    sim.reset();
    expect(fingerprint(sim)).toBe(initial);
  });

  it("replays the same random sequence after a restart", () => {
    // The same seed must give the same second game, or a replay would depend on
    // how long the first one happened to last.
    const first = new Simulation({ ...nasenkugeln(), topTime: 8 }, { seed: 4711 });
    for (let i = 0; i < 300; i++) first.step();
    first.reset();
    const afterReset = fingerprint(first);
    for (let i = 0; i < 300; i++) first.step();
    const secondRun = fingerprint(first);

    const fresh = new Simulation({ ...nasenkugeln(), topTime: 8 }, { seed: 4711 });
    for (let i = 0; i < 300; i++) fresh.step();

    expect(afterReset).not.toBe("");
    expect(secondRun).toBe(fingerprint(fresh));
  });

  it("restarts the same level repeatedly without drift", () => {
    const sim = new Simulation({ ...nasenkugeln(), topTime: 8 }, { seed: 8080 });
    const results: string[] = [];
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 250; i++) sim.step();
      results.push(fingerprint(sim));
      sim.reset();
    }
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
  });

  it("reaches a terminal state and stays there", () => {
    const sim = new Simulation({ ...nasenkugeln(), topTime: 4 }, { seed: 77 });
    for (let i = 0; i < 20000 && !sim.isOver(); i++) sim.step();
    expect(sim.isOver()).toBe(true);

    const settled = fingerprint(sim);
    for (let i = 0; i < 200; i++) sim.step();
    expect(fingerprint(sim)).toBe(settled);
  });

  it("reports a snapshot without changing the simulation", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixed() });
    const before = fingerprint(sim);
    const shot = sim.snapshot();
    expect(shot.goals).toBe(sim.goalCount);
    expect(shot.score).toBe(sim.score);
    expect(shot.borderRow).toBe(sim.borderRow());
    expect(fingerprint(sim)).toBe(before);
  });

  it("keeps a floating blob above the board through a restart-free run", () => {
    // Guards the FLOATS bit against a refactor of the gravity pass, since a
    // floating blob that fell would change the whole board.
    const sim = new Simulation(openBoard([]), { random: fixed() });
    const floater = blobOf(sim, GOAL_KIND);
    floater.behaviour |= FLOATS;
    sim.board.set(3, 2, floater);
    sim.recount();
    sim.fall = null;
    for (let i = 0; i < 5; i++) sim.step();
    expect(sim.board.at(3, 2)).toBe(floater);
  });
});
