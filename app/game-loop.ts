/**
 * Runs the simulation on its own frame loop, outside React.
 *
 * React never re-renders per game step: the canvas draws from here at frame
 * rate and the HUD subscribes to a throttled snapshot (design.md decision 8).
 */

import { STEP_MS } from "../engine/game-core/constants.ts";
import type { Simulation } from "../engine/game-core/simulation.ts";

export type GameListener = (sim: Simulation) => void;

/**
 * The frame clock, injected rather than taken from the global.
 *
 * `requestAnimationFrame` does not exist in Node, so a loop that reads it directly cannot
 * be tested at all - which is why the pause had no test until this. The alternative is a
 * test-only global shim, and a shim is a claim about the environment that stops being true
 * the moment the code changes shape.
 *
 * Defaults to the browser's own, so nothing at the call site changes.
 */
export interface FrameClock {
  /** Schedule `fn` for the next frame; returns a handle for cancelling. */
  request(fn: (now: number) => void): number;
  /** Cancel a frame scheduled by {@link request}. */
  cancel(handle: number): void;
  /** The current time in milliseconds. */
  now(): number;
}

/** The browser's own clock. */
export const BROWSER_CLOCK: FrameClock = {
  request: (fn) => requestAnimationFrame(fn),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

export class GameLoop {
  private raf = 0;
  private last = 0;
  private accumulator = 0;
  private readonly listeners = new Set<GameListener>();
  /** Simulated steps since start, for the dev overlay. */
  steps = 0;
  /** Last frame duration in ms, for the dev overlay. */
  frameMs = 0;
  paused = false;

  constructor(
    private readonly sim: Simulation,
    private readonly clock: FrameClock = BROWSER_CLOCK,
  ) {}

  start(): void {
    if (this.raf !== 0) return;
    this.last = this.clock.now();
    this.raf = this.clock.request(this.tick);
  }

  stop(): void {
    if (this.raf === 0) return;
    this.clock.cancel(this.raf);
    this.raf = 0;
  }

  subscribe(fn: GameListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private tick = (now: number): void => {
    this.raf = this.clock.request(this.tick);
    const delta = now - this.last;
    this.last = now;
    this.frameMs = delta;

    if (!this.paused) {
      this.accumulator += delta;
      // A backgrounded tab must not fast-forward through hundreds of steps, so
      // the backlog is capped and the surplus dropped.
      let steps = 0;
      while (this.accumulator >= STEP_MS && steps < 5) {
        this.accumulator -= STEP_MS;
        this.sim.step();
        this.steps++;
        steps++;
      }
      if (this.accumulator > STEP_MS * 5) this.accumulator = 0;
    }

    for (const fn of this.listeners) fn(this.sim);
  };
}
