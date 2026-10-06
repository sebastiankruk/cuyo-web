// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
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
  /**
   * Why the simulation stopped, or null while it is running.
   *
   * Set when a step throws, and **the loop keeps running** — so this is a field and not a thrown
   * error, and the dev overlay and the level list can show it.
   */
  failure: string | null = null;
  /** How many times the failing step threw, which is a frame count and says nothing new. */
  failureCount = 0;

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

  /**
   * One simulation step, with the failure handled rather than propagated.
   *
   * ## Why this exists
   *
   * `sim.step()` runs a level's Cual code as of 15.6, and it can throw — 24 of the 79 corpus
   * levels do, on names and pictures this port has not wired yet. Before 15.6 it could not, so
   * this had no handler and needed none.
   *
   * **An uncaught throw here looks exactly like a frozen game.** `request` is the *first* line of
   * {@link tick}, so the next frame is already queued when `step()` throws: the loop does not die,
   * it throws again on every frame forever. `this.steps` stops advancing, the board stops moving,
   * the border stops rising, and the browser console fills with the same error. That is the
   * report "the game stops after the first bombs going off", and it is what a player sees whether
   * the cause is a missing namespace or a picture budget.
   *
   * So the loop **records** the failure and stops stepping, which is upstream's arrangement too:
   * `Cuyo::zeitSchritt` wraps `zeitSchrittIntern` in a `try`, and a `Fehler` puts up an error
   * dialog and leaves the game rather than continuing from a half-stepped board. Stopping is the
   * honest choice — a board whose blobs half-moved is not a state the renderer or the rules have
   * any meaning for.
   *
   * @returns whether the step happened, so the caller can stop catching up.
   */
  private step(): boolean {
    if (this.failure !== null) return false;
    try {
      this.sim.step();
      this.steps++;
      return true;
    } catch (error) {
      this.failure = error instanceof Error ? error.message : String(error);
      this.failureCount++;
      return false;
    }
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
        if (this.step()) steps++;
      }
      if (this.accumulator > STEP_MS * 5) this.accumulator = 0;
    }

    for (const fn of this.listeners) fn(this.sim);
  };
}
