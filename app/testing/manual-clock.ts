/**
 * A frame clock under the test's control.
 *
 * `GameLoop` reads `requestAnimationFrame` and `performance.now` from the global scope,
 * neither of which exists in Node, so the loop could not be tested at all until it took a
 * clock instead. This is the test-side half of that: a clock that advances only when told
 * to, so "forty milliseconds passed" is an assertion rather than a sleep.
 *
 * The distinction matters here. Every property being tested is about *time* — does the
 * pause hold, does the backlog get dropped, does resuming fast-forward — and a real timer
 * makes all three flaky in the direction that hides bugs: a slow machine passes a
 * "nothing happened" assertion for the wrong reason.
 */

import type { FrameClock } from "../game-loop.ts";

export class ManualClock implements FrameClock {
  private time = 0;
  private next = 1;
  private readonly pending = new Map<number, (now: number) => void>();

  /** Frames requested and not yet run. */
  get queued(): number {
    return this.pending.size;
  }

  request(fn: (now: number) => void): number {
    const handle = this.next++;
    this.pending.set(handle, fn);
    return handle;
  }

  cancel(handle: number): void {
    this.pending.delete(handle);
  }

  now(): number {
    return this.time;
  }

  /**
   * Runs one frame, advancing the clock first.
   *
   * Advancing before the callback is what makes `delta` meaningful: a loop that measured
   * zero elapsed time would never accumulate anything and never step.
   */
  frame(elapsed = 16): void {
    const due = [...this.pending.entries()];
    this.pending.clear();
    this.time += elapsed;
    for (const [, fn] of due) fn(this.time);
  }

  /**
   * Runs frames until `elapsed` milliseconds have passed.
   *
   * A cap so a bug that makes the loop schedule without bound fails the test rather than
   * hanging it.
   */
  run(elapsed: number, step = 16): number {
    const target = this.time + elapsed;
    let frames = 0;
    while (this.time < target && frames < 10_000) {
      this.frame(Math.min(step, target - this.time));
      frames++;
    }
    return frames;
  }
}
