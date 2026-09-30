/**
 * Runs the simulation on its own frame loop, outside React.
 *
 * React never re-renders per game step: the canvas draws from here at frame
 * rate and the HUD subscribes to a throttled snapshot (design.md decision 8).
 */

import { STEP_MS } from "../engine/game-core/constants.ts";
import type { Simulation } from "../engine/game-core/simulation.ts";

export type GameListener = (sim: Simulation) => void;

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

  constructor(private readonly sim: Simulation) {}

  start(): void {
    if (this.raf !== 0) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.raf === 0) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  subscribe(fn: GameListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
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
