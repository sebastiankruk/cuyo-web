/**
 * Deterministic pseudo-random number generation for the simulation.
 *
 * Every random choice in the game - falling piece kinds, grey blob kinds, grey
 * blob placement, random grey arrivals, and Cual's `rnd()` and `a : b`
 * operators - draws from a single instance of this class. That is what makes
 * `game-core`'s requirement hold: a seed plus an input sequence reproduces a
 * game exactly (design.md decision 4).
 *
 * Implementation is mulberry32: a 32-bit state, multiply-xor-shift finaliser,
 * and uniform output in [0, 1). It is not cryptographic and is not intended to
 * be; it needs to be fast, seedable and identical across engines.
 */

/** A source of the 32 random values used to seed the generator. */
export type Seed = readonly number[];

/**
 * The surface the simulation depends on.
 *
 * Production code takes this, not the concrete class, so that tests can drive
 * random decisions exactly with a scripted stub instead of depending on the
 * particular generator in use (design.md decision 12).
 */
export interface RandomSource {
  /** Returns the next value in [0, 1). */
  next(): number;
  /** Returns an integer in [0, bound). */
  int(bound: number): number;
  /** Returns true with probability numerator / denominator. */
  chance(numerator: number, denominator: number): boolean;
  /** Returns a uniformly chosen element, or undefined for an empty list. */
  pick<T>(items: readonly T[]): T | undefined;
  /** Picks an index from non-negative weights. */
  weighted(weights: readonly number[]): number;
}

/**
 * The single random source for one game.
 *
 * Callers must not hold on to this across a restart: restarting a level creates
 * a fresh generator so that a replay is defined by its seed, not by however many
 * values a previous game happened to consume.
 */
export class Prng implements RandomSource {
  private state: number;

  /** @param seed any non-empty array of 32-bit integers. */
  constructor(seed: Seed) {
    if (seed.length === 0) {
      throw new Error("Prng requires a non-empty seed");
    }
    // Fold the seed words into one 32-bit state so that different seed
    // lengths are supported without special-casing.
    let s = 0;
    for (let i = 0; i < seed.length; i++) {
      s = (s + (seed[i] | 0)) | 0;
      s = Math.imul(s, 0x9e3779b1) | 0;
    }
    this.state = s === 0 ? 0x6d2b79f5 : s;
  }

  /**
   * Returns the next value in [0, 1).
   *
   * This is the primitive every other method here is built on.
   */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in [0, bound).
   *
   * This is Cual's `rnd(n)`. A non-positive bound yields 0 rather than throwing,
   * matching the original's tolerance of degenerate values in level data.
   */
  int(bound: number): number {
    if (!Number.isFinite(bound) || bound <= 0) return 0;
    return Math.floor(this.next() * bound);
  }

  /**
   * Returns true with probability `numerator / denominator`.
   *
   * This is Cual's `a : b`. A non-positive denominator yields false.
   */
  chance(numerator: number, denominator: number): boolean {
    if (denominator <= 0) return false;
    return this.int(denominator) < numerator;
  }

  /** Returns a uniformly chosen element, or undefined for an empty list. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(items.length)];
  }

  /**
   * Picks an index from non-negative weights.
   *
   * Used wherever the original assigns a probability by dividing by the sum of
   * `colourprob`, `greyprob` or `goalprob`. A total of zero yields 0.
   */
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

  /** Restores the generator to a previously captured state. */
  saveState(): number {
    return this.state;
  }

  /** Restores a state captured by {@link saveState}. */
  restoreState(state: number): void {
    this.state = state | 0;
  }
}

/** Convenience factory for the common "one integer seed" case. */
export function createPrng(seed: number): Prng {
  return new Prng([seed | 0]);
}
