// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for Cual's random draws coming from the simulation's generator.
 *
 * The property that matters is not "rnd returns a number in range" — that is `prng.test.ts`'s
 * job and it is already covered. It is that Cual and the simulation **share one sequence**,
 * because two generators would each be reproducible alone and together would produce a game
 * no seed can replay.
 *
 * So the tests here compare streams rather than values: a generator that has had a Cual draw
 * taken from it must go on exactly as a generator that had the same draw taken directly.
 */

import { describe, expect, it } from "vitest";
import { Prng } from "../prng.ts";
import { evalContext, evalContextWith } from "./context.ts";
import { CualError, evaluate, type Expr } from "./expr.ts";

const SEED = [0x9e3779b9, 0x1234567];

/** `rnd(6)` as an expression. */
const RND_6: Expr = { kind: "call", name: "rnd", args: [{ kind: "number", value: 6 }] };

/** `1 : 6` as an expression. */
const ONE_IN_SIX: Expr = {
  kind: "binary",
  op: ":",
  left: { kind: "number", value: 1 },
  right: { kind: "number", value: 6 },
};

/** The next few draws of a fresh generator, for comparison. */
function stream(count: number, seed: readonly number[] = SEED): number[] {
  const p = new Prng(seed);
  return Array.from({ length: count }, () => p.int(6));
}

describe("Cual draws from the simulation's generator", () => {
  it("rnd(n) continues the same stream the simulation would have produced", () => {
    // Not "rnd is in range" - that is prng.test.ts. This is: take a Cual draw, and the
    // generator must be exactly where a direct draw would have left it.
    const viaCual = new Prng(SEED);
    evaluate(RND_6, evalContext(viaCual, () => 0));

    const direct = new Prng(SEED);
    direct.int(6);

    const afterCual = Array.from({ length: 4 }, () => viaCual.int(6));
    const afterDirect = Array.from({ length: 4 }, () => direct.int(6));
    expect(afterCual).toEqual(afterDirect);
    // ...and it is the *tail*, not the head: the generator really was advanced. Written the
    // other way round first, comparing against `stream(5).slice(1)`, which is the same four
    // values this assertion is checking for - a negative assertion that contradicted the
    // positive one two lines above it.
    expect(afterCual).toEqual(stream(5).slice(1));
    expect(afterCual).not.toEqual(stream(4));
  });

  it("a : b draws exactly once, and leaves the stream where chance() would", () => {
    // `:` is `chance(left, right)` in `prng.ts`, which is `int(right) < left`. Same
    // primitive, so it must advance the generator the same amount - one draw - or a level
    // using `:` would desynchronise the sequence that spawns its greys.
    const viaCual = new Prng(SEED);
    evaluate(ONE_IN_SIX, evalContext(viaCual, () => 0));

    const viaChance = new Prng(SEED);
    viaChance.chance(1, 6);

    const afterCual = Array.from({ length: 4 }, () => viaCual.int(6));
    const afterChance = Array.from({ length: 4 }, () => viaChance.int(6));
    expect(afterCual).toEqual(afterChance);
  });

  it("agrees with chance() draw for draw, and fires about one time in six", () => {
    // Draw for draw against a second generator started identically, so a disagreement is a
    // real difference rather than two different sequences happening to look similar.
    const viaCual = new Prng(SEED);
    const viaChance = new Prng(SEED);
    const ctx = evalContext(viaCual, () => 0);
    const trials = 6000;
    let hits = 0;
    for (let i = 0; i < trials; i++) {
      const a = evaluate(ONE_IN_SIX, ctx);
      const b = viaChance.chance(1, 6) ? 1 : 0;
      expect(a, `draw ${i}`).toBe(b);
      hits += a;
    }
    // `1 : 6` is `rnd(6) < 1`, so one value in six. Banded rather than exact: a fixed seed
    // would make an exact figure a property of the seed rather than of the operator, and
    // an unbounded generator would make it flaky. 6000 trials puts 1/6 about 20 standard
    // errors from either edge of this band.
    expect(hits / trials).toBeGreaterThan(0.14);
    expect(hits / trials).toBeLessThan(0.19);
  });

  it("passes the limit through, for limits other than six", () => {
    // Every other test in this file uses `rnd(6)` or `1 : 6`, which meant a `random` that
    // ignored its argument and always drew from six produced identical results — and a
    // mutation doing exactly that passed. Three limits, each compared against a generator
    // that had the same bound drawn from it directly.
    for (const limit of [1, 2, 3, 10, 16, 1000]) {
      const expr: Expr = {
        kind: "call",
        name: "rnd",
        args: [{ kind: "number", value: limit }],
      };
      const viaCual = new Prng(SEED);
      const value = evaluate(expr, evalContext(viaCual, () => 0));

      const direct = new Prng(SEED);
      expect(value, `rnd(${limit})`).toBe(direct.int(limit));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(limit);
      // And the generator advanced by exactly one draw at that bound.
      expect(Array.from({ length: 3 }, () => viaCual.int(limit))).toEqual([
        direct.int(limit),
        direct.int(limit),
        direct.int(limit),
      ]);
    }
  });

  it("two evaluators on one generator interleave rather than fork", () => {
    // The failure this guards is two contexts each wrapping their own generator: the
    // sequence would then depend on how the calls were ordered across the two.
    const shared = new Prng(SEED);
    const a = evalContext(shared, () => 0);
    const b = evalContext(shared, () => 0);

    const interleaved = [
      evaluate(RND_6, a),
      evaluate(RND_6, b),
      evaluate(RND_6, a),
      evaluate(RND_6, b),
    ];
    const sequential = stream(4);
    expect(interleaved).toEqual(sequential);
  });

  it("rnd(0) throws before reaching the generator", () => {
    // `Prng.int` returns 0 for a non-positive bound rather than throwing, which is the
    // right tolerance for level data. Cual is not: `code.cpp` throws. So the throw has to
    // happen in the evaluator, or `rnd(0)` in a level would silently become 0.
    const p = new Prng(SEED);
    const before = Array.from({ length: 3 }, () => p.int(6));
    expect(() =>
      evaluate({ kind: "call", name: "rnd", args: [{ kind: "number", value: 0 }] },
        evalContext(p, () => 0)),
    ).toThrow(CualError);

    const fresh = new Prng(SEED);
    expect(() =>
      evaluate({ kind: "call", name: "rnd", args: [{ kind: "number", value: 0 }] },
        evalContext(fresh, () => 0)),
    ).toThrow(/rnd/i);

    // The failed evaluation consumed nothing: the stream is untouched.
    const after = Array.from({ length: 3 }, () => p.int(6));
    expect(after).toEqual(stream(6).slice(3));
    expect(after).not.toEqual(before.slice(1));
  });

  it("reads variables through the supplied getter", () => {
    const ctx = evalContext(new Prng(SEED), (name) => (name === "x" ? 7 : -1));
    expect(evaluate({ kind: "variable", name: "x" }, ctx)).toBe(7);
  });

  it("evalContextWith reads a record and refuses an unbound name", () => {
    const ctx = evalContextWith(new Prng(SEED), { wert: 3 });
    expect(evaluate({ kind: "variable", name: "wert" }, ctx)).toBe(3);
    expect(() => evaluate({ kind: "variable", name: "nope" }, ctx)).toThrow(/no variable/i);
  });
});