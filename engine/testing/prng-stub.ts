/**
 * Test doubles for `RandomSource`.
 *
 * The simulation must be reproducible from a seed, but tests frequently need the
 * opposite: they need to *choose* what randomness yields so they can assert an
 * exact board. Depending on the concrete generator for that would make every
 * such test brittle against generator changes, so tests take a
 * `RandomSource` and substitute one of these.
 *
 * Test-only. Nothing in the shipped simulation may import this module.
 */

import type { RandomSource } from "../prng.ts";

/**
 * Yields a fixed sequence of values in [0, 1).
 *
 * Throws once exhausted rather than wrapping, so a test that consumes more
 * randomness than it scripted fails loudly instead of silently asserting against
 * a recycled value.
 */
export class ScriptedPrng implements RandomSource {
  private index = 0;
  /** Every value requested so far, in order. */
  readonly drawn: number[] = [];

  constructor(private readonly values: readonly number[]) {
    if (values.length === 0) {
      throw new Error("ScriptedPrng requires at least one value");
    }
  }

  /** Rewinds to the first scripted value. */
  restart(): void {
    this.index = 0;
    this.drawn.length = 0;
  }

  /** How many values have been consumed. */
  get consumed(): number {
    return this.index;
  }

  next(): number {
    if (this.index >= this.values.length) {
      throw new Error(
        `ScriptedPrng exhausted: needed value #${this.index + 1} but only ` +
          `${this.values.length} were scripted`,
      );
    }
    const v = this.values[this.index] as number;
    this.index++;
    this.drawn.push(v);
    return v;
  }

  int(bound: number): number {
    if (!Number.isFinite(bound) || bound <= 0) return 0;
    return Math.floor(this.next() * bound);
  }

  chance(numerator: number, denominator: number): boolean {
    if (denominator <= 0) return false;
    return this.int(denominator) < numerator;
  }

  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(items.length)];
  }

  weighted(weights: readonly number[]): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i] ?? 0;
    if (total <= 0) return 0;
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] ?? 0;
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }
}

/** One recorded request against a wrapped source. */
export interface DrawRecord {
  readonly method: string;
  readonly args: readonly number[];
  readonly result: number | boolean | undefined;
}

/**
 * Wraps any source and records what was asked of it.
 *
 * Lets a test assert *how much* randomness a code path consumed - for example
 * that a single four-blob explosion schedules exactly one grey blob, without
 * hard-coding which column it lands in.
 */
export class RecordingPrng implements RandomSource {
  readonly log: DrawRecord[] = [];

  constructor(private readonly inner: RandomSource) {}

  next(): number {
    const r = this.inner.next();
    this.log.push({ method: "next", args: [], result: r });
    return r;
  }

  int(bound: number): number {
    const r = this.inner.int(bound);
    this.log.push({ method: "int", args: [bound], result: r });
    return r;
  }

  chance(numerator: number, denominator: number): boolean {
    const r = this.inner.chance(numerator, denominator);
    this.log.push({
      method: "chance",
      args: [numerator, denominator],
      result: r,
    });
    return r;
  }

  pick<T>(items: readonly T[]): T | undefined {
    const r = this.inner.pick(items);
    this.log.push({ method: "pick", args: [], result: r as never });
    return r;
  }

  weighted(weights: readonly number[]): number {
    const r = this.inner.weighted(weights);
    this.log.push({ method: "weighted", args: [...weights], result: r });
    return r;
  }

  /** Every recorded call to `method`, in order. */
  callsTo(method: string): DrawRecord[] {
    return this.log.filter((entry) => entry.method === method);
  }

  /**
   * Forwards the restart to the wrapped source.
   *
   * The log is deliberately kept, so a test can still see the calls made during
   * the first game. Reading it after a restart means reading past the restart
   * point, which is what lets a test compare the two games.
   */
  restart(): void {
    this.inner.restart();
  }
}

/**
 * Returns a source whose successive `int(n)` results are exactly `sequence`.
 *
 * The convenience form of {@link ScriptedPrng} for the common case of pinning a
 * series of indices: each requested index is converted to the value in [0, 1)
 * that makes the generator return it.
 */
export function scriptedIndices(sequence: readonly number[]): ScriptedPrng {
  return new ScriptedPrng(sequence.map((i) => (i + 0.5) / sequence.length));
}
