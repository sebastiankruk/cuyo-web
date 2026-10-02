/**
 * Tests for the frame loop.
 *
 * These exist because the pause is the whole reason the rules became a modal: reading them
 * mid-fall used to be a way to lose a piece you were watching. If pausing silently did
 * nothing, the dialog would stop the rules appearing while the game carried on winning —
 * worse than not pausing, because it looks like it worked.
 *
 * Driven by {@link ManualClock} rather than real timers. Every property here is a claim
 * about time, and a real timer makes all of them flaky in the direction that hides bugs:
 * a slow machine passes a "nothing happened" assertion for entirely the wrong reason.
 */

import { describe, expect, it } from "vitest";
import { GameLoop } from "./game-loop.ts";
import type { Simulation } from "../engine/game-core/simulation.ts";
import { ManualClock } from "./testing/manual-clock.ts";
import { STEP_MS } from "../engine/game-core/constants.ts";

/** The smallest thing `GameLoop` uses: `step()`, and nothing else. */
function fakeSim(): { sim: Simulation; steps: () => number } {
  let n = 0;
  return {
    sim: { step: (): void => void n++ } as unknown as Simulation,
    steps: () => n,
  };
}

/** A loop on a manual clock, and the two things a test wants to look at. */
function started(): {
  clock: ManualClock;
  loop: GameLoop;
  steps: () => number;
  draws: () => number;
} {
  const { sim, steps } = fakeSim();
  const clock = new ManualClock();
  const loop = new GameLoop(sim, clock);
  let draws = 0;
  loop.subscribe(() => draws++);
  loop.start();
  return { clock, loop, steps, draws: () => draws };
}

describe("GameLoop stepping", () => {
  it("steps once per STEP_MS, not once per frame", () => {
    // The accumulator is the whole design: a 60 Hz display and an 80 ms step means most
    // frames do nothing. Stepping per frame would run the game at three times its speed.
    const { clock, loop, steps } = started();
    clock.run(STEP_MS - 1);
    expect(steps(), "steps before a full interval").toBe(0);
    clock.frame(1);
    expect(steps(), "steps after one full interval").toBe(1);
    loop.stop();
  });

  it("runs several steps in one long frame, up to the cap", () => {
    // It *does* catch up, up to five steps. A frame long enough for three intervals
    // applies three, so the game keeps roughly real time rather than drifting slower on a
    // slow device - and the cap at five is what stops a backgrounded tab replaying minutes
    // of game in one go. Both halves matter: without the catch-up the game runs slow, and
    // without the cap it fast-forwards.
    const { clock, loop, steps } = started();
    const before = steps();
    clock.frame(STEP_MS * 3);
    expect(steps() - before, "steps in one long frame").toBe(3);
    loop.stop();
  });

  it("caps the catch-up, so a backgrounded tab cannot fast-forward", () => {
    // A minute-long frame would be 750 steps of game. The cap is five.
    const { clock, loop, steps } = started();
    const before = steps();
    clock.frame(60_000);
    expect(steps() - before, "steps in a minute-long frame").toBe(5);
    loop.stop();
  });

  it("drops a backlog rather than fast-forwarding through it", () => {
    // A backgrounded tab produces one enormous delta on return. Applying it would replay
    // minutes of game at once, which is the "woke up and lost" bug.
    const { clock, loop, steps } = started();
    const before = steps();
    clock.frame(STEP_MS * 50);
    expect(steps() - before, "steps after a huge frame").toBeLessThanOrEqual(5);
    loop.stop();
  });
});

describe("GameLoop pausing", () => {
  it("stops stepping while paused", () => {
    const { clock, loop, steps } = started();
    clock.run(STEP_MS * 3);
    loop.paused = true;
    const at = steps();
    clock.run(STEP_MS * 20);
    expect(steps(), "steps taken while paused").toBe(at);
    loop.stop();
  });

  it("resumes on the same loop, without being restarted", () => {
    // The dialog pauses and unpauses one loop that has been running throughout.
    // Replacing it would restart the accumulator and, worse, lose the board.
    const { clock, loop, steps } = started();
    loop.paused = true;
    clock.run(STEP_MS * 10);
    const at = steps();
    loop.paused = false;
    clock.run(STEP_MS * 3);
    expect(steps(), "steps after resuming").toBeGreaterThan(at);
    loop.stop();
  });

  it("does not fast-forward the backlog accrued while paused", () => {
    // The trap. If the accumulator kept filling during the pause, the first frames after
    // closing the dialog would run several steps at once — so opening the rules to read
    // them would be what killed the piece, which is the bug the modal was meant to remove.
    const { clock, loop, steps } = started();
    loop.paused = true;
    clock.run(STEP_MS * 50);
    loop.paused = false;
    const at = steps();
    clock.run(STEP_MS);
    expect(
      steps() - at,
      "steps in the first interval after resuming",
    ).toBeLessThanOrEqual(1);
    loop.stop();
  });

  it("keeps drawing while paused", () => {
    // Pausing must stop the game, not the screen. A paused board that stops repainting goes
    // stale on resize, which is exactly when someone opens the rules.
    const { clock, loop, draws } = started();
    loop.paused = true;
    const before = draws();
    clock.run(500);
    expect(draws(), "draws while paused").toBeGreaterThan(before);
    loop.stop();
  });

  it("does not start a second loop", () => {
    // `start()` is idempotent by design. A second frame loop would double the step rate
    // for the rest of the level, and nothing about that looks like a bug on screen.
    const { clock, loop, steps } = started();
    loop.start();
    const before = steps();
    clock.run(STEP_MS * 4);
    // Four intervals of game time, so four steps - not eight.
    expect(steps() - before).toBe(4);
    loop.stop();
  });

  it("stops cleanly, and can be started again", () => {
    const { clock, loop, steps } = started();
    clock.run(STEP_MS * 2);
    loop.stop();
    const at = steps();
    clock.run(STEP_MS * 10);
    expect(steps(), "steps after stop").toBe(at);
    expect(clock.queued, "frames still scheduled after stop").toBe(0);
    loop.start();
    clock.run(STEP_MS * 2);
    expect(steps(), "steps after restarting").toBeGreaterThan(at);
    loop.stop();
  });
});
