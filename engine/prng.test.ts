import { describe, expect, it } from "vitest";
import { Prng, createPrng } from "./prng.ts";

describe("Prng", () => {
  it("produces a reproducible sequence for a given seed", () => {
    const a = createPrng(1234);
    const b = createPrng(1234);
    const seqA = Array.from({ length: 64 }, () => a.next());
    const seqB = Array.from({ length: 64 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces a different sequence for a different seed", () => {
    const a = createPrng(1);
    const b = createPrng(2);
    const seqA = Array.from({ length: 32 }, () => a.next());
    const seqB = Array.from({ length: 32 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const p = createPrng(99);
    for (let i = 0; i < 5000; i++) {
      const v = p.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("honours saveState and restoreState", () => {
    const p = createPrng(7);
    for (let i = 0; i < 10; i++) p.next();
    const saved = p.saveState();

    const branch = Array.from({ length: 20 }, () => p.next());
    p.restoreState(saved);
    const replay = Array.from({ length: 20 }, () => p.next());

    expect(replay).toEqual(branch);
  });

  it("keeps int() in [0, bound)", () => {
    const p = createPrng(555);
    for (const bound of [1, 2, 4, 5, 10, 20]) {
      for (let i = 0; i < 500; i++) {
        const v = p.int(bound);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(bound);
      }
    }
  });

  it("returns 0 from int() for a non-positive bound", () => {
    const p = createPrng(3);
    expect(p.int(0)).toBe(0);
    expect(p.int(-4)).toBe(0);
  });

  it("returns false from chance() for a non-positive denominator", () => {
    const p = createPrng(3);
    expect(p.chance(1, 0)).toBe(false);
    expect(p.chance(1, -2)).toBe(false);
  });

  it("approximates the requested rate in chance()", () => {
    const p = createPrng(2024);
    const trials = 20000;
    let hits = 0;
    for (let i = 0; i < trials; i++) if (p.chance(1, 4)) hits++;
    // 1/4 of 20000 is 5000; allow a wide band so this is not flaky.
    expect(hits).toBeGreaterThan(trials * 0.22);
    expect(hits).toBeLessThan(trials * 0.28);
  });

  it("picks every element of a list over many trials", () => {
    const p = createPrng(42);
    const items = [0, 1, 2, 3, 4] as const;
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = p.pick(items);
      expect(v).toBeDefined();
      seen.add(v as number);
    }
    expect(seen.size).toBe(items.length);
  });

  it("returns undefined when picking from an empty list", () => {
    expect(createPrng(1).pick([])).toBeUndefined();
  });

  it("respects weights in weighted()", () => {
    const p = createPrng(8);
    const counts = [0, 0, 0];
    for (let i = 0; i < 12000; i++) counts[p.weighted([0, 3, 1])] += 1;
    // Index 0 has weight 0 and must never be chosen; the rest split 3:1.
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(counts[2] as number);
  });

  it("returns 0 from weighted() when all weights are zero", () => {
    expect(createPrng(1).weighted([0, 0, 0])).toBe(0);
    expect(createPrng(1).weighted([])).toBe(0);
  });

  it("rejects an empty seed", () => {
    expect(() => new Prng([])).toThrow(/non-empty seed/);
  });

  it("accepts multi-word seeds and is order-sensitive", () => {
    const a = Array.from({ length: 8 }, () => new Prng([1, 2, 3]).next());
    const b = Array.from({ length: 8 }, () => new Prng([3, 2, 1]).next());
    expect(a).not.toEqual(b);
  });
});
