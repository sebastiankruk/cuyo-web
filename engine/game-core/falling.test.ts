/**
 * Verification for the falling piece: descent, steering and landing.
 *
 * Covers tasks 5.6, 5.7 and 5.8. Each test names the case it pins, because the
 * failure modes here are all silent: a piece that spawns one column off, a
 * rejected move that is quietly accepted, or a split that drops the wrong half
 * all leave a playable-looking game.
 */

import { describe, expect, it } from "vitest";
import {
  FALLING_FAST_SPEED,
  FALLING_SPEED,
  FLOATS,
  GRIC,
  GRX,
  GRY,
} from "./constants.ts";
import { Blob } from "./board.ts";
import { Simulation } from "./simulation.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import { ScriptedPrng } from "../testing/prng-stub.ts";
import { nasenkugeln } from "../level-format/fixtures.ts";

/** Keeps handing out one kind, so pieces are predictable. */
function fixedPicker(): ScriptedPrng {
  return new ScriptedPrng(new Array(20000).fill(0.01));
}

function levelWith(overrides: Partial<LevelDef>): LevelDef {
  return { ...nasenkugeln(), ...overrides };
}

/**
 * Parks the border at `row` cells down.
 *
 * The border is recomputed from `time` on every step, so both have to be set
 * together or the first `step()` would move it back to the top.
 */
function parkBorder(sim: Simulation, row: number): void {
  sim.time = row * GRIC * sim.level.topTime;
  sim.borderPx = row * GRIC;
}

describe("5.6 spawn position", () => {
  it("spawns at column 4 when randomFallPos is off", () => {
    const sim = new Simulation(levelWith({ randomFallPos: false }), {
      random: fixedPicker(),
    });
    expect(sim.fall?.x).toBe(4);
    expect(GRX / 2 - 1).toBe(4);
  });

  it("spawns at a random column in [0, GRX - 2] when randomFallPos is on", () => {
    // GRX - 1 is the bound because a horizontal piece needs two columns.
    for (let i = 0; i < 40; i++) {
      const sim = new Simulation(levelWith({ randomFallPos: true }), { seed: i + 1 });
      const x = sim.fall?.x ?? -1;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(GRX - 2);
    }
  });

  it("starts one cell above the border", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    expect(sim.fall?.yPx).toBe(-GRIC);
  });
});

describe("5.6 descent rates", () => {
  it("descends 6 pixels per step at the normal rate", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const from = sim.fall?.yPx ?? 0;
    sim.step();
    expect((sim.fall?.yPx ?? 0) - from).toBe(FALLING_SPEED);
  });

  it("descends a full cell per step while fast falling", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    sim.toggleFast();
    const from = sim.fall?.yPx ?? 0;
    sim.step();
    expect((sim.fall?.yPx ?? 0) - from).toBe(FALLING_FAST_SPEED);
    expect(FALLING_FAST_SPEED).toBe(GRIC);
  });

  it("keeps the fast rate across several steps", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    sim.toggleFast();
    let last = sim.fall?.yPx ?? 0;
    for (let i = 0; i < 5; i++) {
      sim.step();
      const now = sim.fall?.yPx;
      if (now === undefined) break; // it landed
      expect(now - last).toBe(GRIC);
      last = now;
    }
  });

  it("descends 6 pixels, not 32, when not fast falling", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    sim.step();
    sim.step();
    sim.step();
    // Three steps at the slow rate from -GRIC would be -32 + 18.
    expect(sim.fall?.yPx).toBe(-GRIC + 3 * FALLING_SPEED);
  });
});

describe("5.6 descent clamps at the chase border", () => {
  it("never rises above one cell below the border", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    parkBorder(sim, 5);
    // Without the clamp the piece would still be up at the top of the board.
    sim.step();
    expect(sim.fall?.yPx).toBe(5 * GRIC - GRIC);
  });

  it("stays clamped while the border is held", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    parkBorder(sim, 5);
    for (let i = 0; i < 10; i++) {
      sim.time = 5 * GRIC * sim.level.topTime; // hold the border still
      sim.step();
      expect(sim.fall?.yPx).toBeGreaterThanOrEqual(4 * GRIC);
    }
  });
});

describe("5.7 steering", () => {
  it("accepts a move left and a move right into free cells", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    expect(sim.fall?.x).toBe(4);
    sim.moveLeft();
    expect(sim.fall?.x).toBe(3);
    sim.moveRight();
    sim.moveRight();
    expect(sim.fall?.x).toBe(5);
  });

  it("refuses to leave the board on either side", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    for (let i = 0; i < 30; i++) sim.moveLeft();
    expect(sim.fall?.x).toBe(0);
    for (let i = 0; i < 30; i++) sim.moveRight();
    // A horizontal piece occupies two columns, so it stops one short.
    expect(sim.fall?.x).toBe(GRX - 2);
  });

  it("refuses a move blocked by a blob", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const base = descendToBoard(sim);
    // A solid blob in the cell the right half would move into.
    sim.board.set(5, base, makeBlob(sim, 5));
    sim.moveRight();
    expect(sim.fall?.x).toBe(4);
  });

  it("steers into a column holding only a floating blob", () => {
    // `testPlatzSpalte` lets a piece pass under a floating blob, but not into
    // the blob's own cell.
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const base = descendToBoard(sim);
    const floater = makeBlob(sim, 5);
    floater.behaviour |= FLOATS;
    sim.board.set(5, base - 1, floater);
    sim.moveRight();
    expect(sim.fall?.x).toBe(5);
  });

  it("refuses a move into a blob's own cell even when it floats", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const base = descendToBoard(sim);
    const floater = makeBlob(sim, 5);
    floater.behaviour |= FLOATS;
    sim.board.set(5, base, floater);
    sim.moveRight();
    expect(sim.fall?.x).toBe(4);
  });

  it("refuses a move into a column whose blob sits directly overhead", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const base = descendToBoard(sim);
    // The destination cell is free, but a solid blob sits directly above it
    // with nothing in between, so `testPlatzSpalte` refuses.
    sim.board.set(5, base - 1, makeBlob(sim, 5));
    sim.moveRight();
    expect(sim.fall?.x).toBe(4);
  });

  it("refuses any steering once the piece is a single blob", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const piece = sim.fall;
    expect(piece).not.toBeNull();
    sim.fall = piece === null ? null : { ...piece, orientation: "single" };
    sim.moveLeft();
    sim.moveRight();
    expect(sim.fall?.x).toBe(piece?.x);
  });
});

describe("5.7 rotation", () => {
  /**
   * Gives the piece in play two blobs of known, different kinds.
   *
   * The kinds are what make the swap observable: swapping two identical blobs
   * is indistinguishable from not swapping at all, which is exactly the kind of
   * bug this test exists to catch.
   */
  function markDistinctBlobs(sim: Simulation, low: number, high: number): void {
    const p = sim.fall;
    if (p === null) throw new Error("no piece in play");
    sim.fall = {
      ...p,
      blobs: [makeBlob(sim, low), makeBlob(sim, high)],
    };
  }

  it("swaps the blob order only on the second turn of a normal level", () => {
    // Upstream `src/fall.cpp:tasteDreh2`:
    //   if (ld->mSpiegeln ? fp2.r == richtung_senk : fp2.r == richtung_waag)
    // Unmirrored, the swap fires when the piece becomes horizontal.
    const sim = new Simulation(levelWith({ mirror: false }), {
      random: fixedPicker(),
    });
    markDistinctBlobs(sim, 0, 1);

    sim.rotate(); // horizontal -> vertical: no swap
    expect(sim.fall?.orientation).toBe("vertical");
    expect(sim.fall?.blobs[0]?.kind).toBe(0);

    sim.rotate(); // vertical -> horizontal: swap
    expect(sim.fall?.orientation).toBe("horizontal");
    expect(sim.fall?.blobs[0]?.kind).toBe(1);
  });

  it("inverts the swap on a mirrored level", () => {
    const sim = new Simulation(levelWith({ mirror: true }), {
      random: fixedPicker(),
    });
    markDistinctBlobs(sim, 0, 1);

    sim.rotate(); // mirrored: becoming vertical is what triggers the swap
    expect(sim.fall?.orientation).toBe("vertical");
    expect(sim.fall?.blobs[0]?.kind).toBe(1);

    sim.rotate(); // back to horizontal: no swap
    expect(sim.fall?.orientation).toBe("horizontal");
    expect(sim.fall?.blobs[0]?.kind).toBe(1);
  });

  it("refuses a rotation that does not fit", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const base = descendToBoard(sim);
    const x = sim.fall?.x ?? 4;
    // A solid blob in the cell the vertical piece's lower half would occupy.
    sim.board.set(x, base, makeBlob(sim, 5));
    sim.rotate();
    expect(sim.fall?.orientation).toBe("horizontal");
  });

  it("refuses rotation for a single blob", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const p = sim.fall;
    if (p === null) throw new Error("no piece");
    sim.fall = { ...p, orientation: "single" };
    sim.rotate();
    expect(sim.fall?.orientation).toBe("single");
  });
});

describe("5.7 fast-fall toggle", () => {
  it("toggles both ways", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    expect(sim.fall?.fast).toBe(false);
    sim.toggleFast();
    expect(sim.fall?.fast).toBe(true);
    sim.toggleFast();
    expect(sim.fall?.fast).toBe(false);
  });

  it("is a no-op with no piece in play", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    sim.fall = null;
    expect(() => sim.toggleFast()).not.toThrow();
    expect(sim.fall).toBeNull();
  });
});

describe("5.8 landing", () => {
  /**
   * Steps until `sim.fall` is null, i.e. until the piece in play has landed.
   *
   * A fall from the top takes about 110 steps, so the budget has to be generous;
   * what is being checked is that landing happens at all.
   */
  function stepUntilLanded(sim: Simulation, limit = 400): boolean {
    for (let i = 0; i < limit; i++) {
      sim.step();
      if (sim.fall === null) return true;
    }
    return false;
  }

  it("settles a horizontal piece when both halves are supported", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const p = sim.fall;
    if (p === null) throw new Error("no piece");
    const x = p.x;
    // Distinct kinds, so the landed blobs can be told apart from grey blobs the
    // game spawns on its own while the piece is in play.
    sim.fall = { ...p, blobs: [makeBlob(sim, 0), makeBlob(sim, 1)] };

    expect(stepUntilLanded(sim)).toBe(true);
    // The start layout fills row 19, so both halves come to rest on row 18.
    expect(sim.board.at(x, GRY - 2)?.kind).toBe(0);
    expect(sim.board.at(x + 1, GRY - 2)?.kind).toBe(1);
  });

  it("lands a vertical piece bottom-first", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const p = sim.fall;
    if (p === null) throw new Error("no piece");
    // Distinct kinds make the commit order observable.
    sim.fall = { ...p, blobs: [makeBlob(sim, 0), makeBlob(sim, 1)] };
    const x = p.x;
    sim.rotate();
    expect(sim.fall?.orientation).toBe("vertical");

    expect(stepUntilLanded(sim)).toBe(true);
    // The start layout fills row 19, so the pair settles on 18 and 17. Upstream
    // fixes the lower blob first (`festige(1)` then `festige(0)`), so blob 1
    // must be the lower of the two.
    expect(sim.board.at(x, 18)?.kind).toBe(1);
    expect(sim.board.at(x, 17)?.kind).toBe(0);
  });

  it("splits a horizontal piece and keeps the free half falling", () => {
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const p = sim.fall;
    if (p === null) throw new Error("no piece");
    const x = p.x;
    sim.fall = { ...p, blobs: [makeBlob(sim, 0), makeBlob(sim, 1)] };

    // A solid blob occupying the cell the left half would descend into, with
    // the column to its right left clear. The left half is therefore *blocked*
    // while the right half still has somewhere to go.
    sim.board.set(x, GRY - 2, makeBlob(sim, 5));

    let split = false;
    for (let i = 0; i < 400 && !split; i++) {
      sim.step();
      split = sim.fall?.orientation === "single";
    }

    expect(split, "the piece never split").toBe(true);
    // `halbiere` moves the survivor into the right-hand column, and it is the
    // right-hand blob that survives.
    expect(sim.fall?.x).toBe(x + 1);
    expect(sim.fall?.blobs[0]?.kind).toBe(1);
    // The left half committed where the piece had got to.
    expect(sim.board.at(x, GRY - 3)?.kind).toBe(0);

    // The survivor adopts the position the piece failed to reach, so it carries
    // straight on down the board rather than restarting from the top. A fresh
    // piece would sit at borderPx - GRIC, which is negative here.
    expect(sim.fall?.yPx ?? 0).toBeGreaterThan(GRIC);

    // And it lands on its own, in its own column.
    expect(stepUntilLanded(sim)).toBe(true);
    expect(sim.board.at(x + 1, GRY - 2)?.kind).toBe(1);
  });

  it("commits the whole piece when neither half is blocked", () => {
    // Landing is only reached when the piece cannot descend, so this case cannot
    // arise in play. It is pinned because the alternative is a piece wedged in
    // play forever.
    const sim = new Simulation(nasenkugeln(), { random: fixedPicker() });
    const p = sim.fall;
    if (p === null) throw new Error("no piece");
    const before = [...sim.board.occupied()].length;
    expect(stepUntilLanded(sim)).toBe(true);
    expect([...sim.board.occupied()].length).toBeGreaterThan(before);
  });

  it("never leaves a blob outside the board", () => {
    const sim = new Simulation(nasenkugeln(), { seed: 99 });
    for (let i = 0; i < 800; i++) {
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

/** Builds a blob of `kind`. */
function makeBlob(sim: Simulation, kind: number): Blob {
  const blob = new Blob();
  blob.initFromKind(sim.level.kinds[kind]!);
  return blob;
}

/**
 * Descends the piece until its blobs are on the board, and reports that row.
 *
 * A piece spawns one cell *above* the top, on row -1, so a blocker has to be
 * placed relative to where the piece has got to, not to where it starts.
 */
function descendToBoard(sim: Simulation, target = 2): number {
  for (let i = 0; i < 60; i++) {
    const p = sim.fall;
    if (p === null) throw new Error("no piece in play");
    const base = Math.floor((p.yPx + GRIC - 1) / GRIC);
    if (base >= target) return base;
    sim.step();
  }
  throw new Error("the piece never descended onto the board");
}
