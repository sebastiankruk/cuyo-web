// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for Cual's `/` and `%`.
 *
 * The reference is `docs/cual.6`, which gives both a definition in prose and a table of
 * eight worked values. Those are asserted here as written, because they are the only part of
 * this that is not derivable from the definition — and because the table's third row is
 * exactly the value that a `ceil` reading gets wrong.
 *
 * The property tests underneath then cover the pairs the table does not, including the
 * quadrant where upstream's `modd` is wrong.
 */

import { describe, expect, it } from "vitest";
import { DivisionByZero, divv, modd } from "./divmod.ts";

/** The table in `cual.6`, transcribed. */
const TABLE: readonly [a: number, b: number, quotient: number, remainder: number][] = [
  [13, 5, 2, 3],
  [-13, 5, -3, 2],
  [13, -5, -3, -2],
  [-13, -5, 2, -3],
];

describe("the table in cual.6", () => {
  for (const [a, b, quotient, remainder] of TABLE) {
    it(`${a} / ${b} is ${quotient} and ${a} % ${b} is ${remainder}`, () => {
      expect(divv(a, b)).toBe(quotient);
      expect(modd(a, b)).toBe(remainder);
    });
  }

  it("would not be reproduced by truncating toward zero", () => {
    // The reason this file exists. `-13 / 5` is -2 in JavaScript and in C, and -13 is a
    // perfectly ordinary value for a coordinate difference to take. If these assertions
    // ever pass with `Math.trunc`, they are not testing anything.
    expect(Math.trunc(-13 / 5)).not.toBe(divv(-13, 5));
    expect(Math.trunc(13 / -5)).not.toBe(divv(13, -5));
  });
});

describe("the definition", () => {
  it("is the largest n with n*b <= a when b is positive", () => {
    for (const b of [1, 2, 3, 5, 7, 12, 16]) {
      for (let a = -40; a <= 40; a++) {
        const n = divv(a, b);
        expect(n * b, `${a}/${b}`).toBeLessThanOrEqual(a);
        expect((n + 1) * b, `${a}/${b}`).toBeGreaterThan(a);
      }
    }
  });

  it("is the largest n with n*b >= a when b is negative", () => {
    // `ceil` reads as the obvious thing here and is wrong: it gives -2 for 13 / -5, against
    // -3 in the table. Asserting the bound rather than the name is what catches that.
    for (const b of [-1, -2, -3, -5, -7, -12, -16]) {
      for (let a = -40; a <= 40; a++) {
        const n = divv(a, b);
        expect(n * b, `${a}/${b}`).toBeGreaterThanOrEqual(a);
        expect((n + 1) * b, `${a}/${b}`).toBeLessThan(a);
      }
    }
  });

  it("makes a = divv*b + modd true for every pair", () => {
    // Stated in cual.6 and again in code.h's comment. Derived rather than checked, in the
    // implementation; checked here because a derivation can be edited.
    for (let a = -60; a <= 60; a++) {
      for (let b = -15; b <= 15; b++) {
        if (b === 0) continue;
        expect(divv(a, b) * b + modd(a, b), `${a}, ${b}`).toBe(a);
      }
    }
  });

  it("keeps the remainder in the range code.h promises", () => {
    // `0 <= modd < b` when b > 0, and `b < modd <= 0` when b < 0.
    for (let a = -60; a <= 60; a++) {
      for (let b = -15; b <= 15; b++) {
        if (b === 0) continue;
        const m = modd(a, b);
        if (b > 0) {
          expect(m, `${a} % ${b}`).toBeGreaterThanOrEqual(0);
          expect(m, `${a} % ${b}`).toBeLessThan(b);
        } else {
          expect(m, `${a} % ${b}`).toBeGreaterThan(b);
          expect(m, `${a} % ${b}`).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it("agrees with Math.floor everywhere", () => {
    // Which is the whole claim: Cual's `/` *is* floor division, stated independently of how
    // it is computed. Over this range the two are equal, which is what licenses the summary
    // in the module header; the implementation is integer arithmetic regardless, because
    // they are not equal for all 32-bit operands.
    for (let a = -2000; a <= 2000; a++) {
      for (const b of [-97, -13, -7, -2, -1, 1, 2, 7, 13, 97]) {
        // `+ 0` normalises `-0`, which is what `Math.floor` returns for `0 / -97`. The two
        // are the same number; `divv` is documented as not producing `-0`, so this is where
        // that promise is checked rather than assumed.
        expect(divv(a, b), `${a}/${b}`).toBe(Math.floor(a / b) + 0);
        expect(modd(a, b), `${a}%${b}`).toBe(a - Math.floor(a / b) * b);
      }
    }
  });

  it("handles the full int32 range the format allows", () => {
    // The extremes, where a double's 53 bits of mantissa is not obviously enough. These are
    // the cases `Math.floor(a / b)` is not safe on; the integer path is.
    const big = 2147483647;
    const cases: [number, number, number][] = [
      [big, 2, 1073741823],
      [big, 3, 715827882],
      [-big, 3, -715827883],
      [big, big, 1],
      [-big, -big, 1],
      [-big, big, -1],
      [1, -big, -1],
      [0, -big, 0],
    ];
    for (const [a, b, want] of cases) {
      expect(divv(a, b), `${a}/${b}`).toBe(want);
      expect(divv(a, b) * b + modd(a, b), `${a} % ${b}`).toBe(a);
    }
  });

  it("never produces negative zero", () => {
    // Checked with `Object.is`, which is the only thing that sees the difference, and
    // separately from the `+ 0` above: that `+ 0` makes `Math.floor`'s `-0` comparable, and
    // in doing so would also hide whether *this* function produced one.
    //
    // What it catches is `Math.trunc` in place of `| 0` in `divv`: trunc does floor toward
    // negative zero, and `trunc(0 / -97)` is `-0`. The arithmetic assertions still pass with
    // it, because `-0` and `0` are the same number - so this is the only thing standing
    // between `divv` and a `-0` in an `Int32Array`, where it would be indistinguishable
    // anyway but every `Object.is` in a test above it would read as a failure.
    for (const b of [-97, -3, -2, -1, 1, 2, 3, 97]) {
      for (const a of [0, 1, -1, 99, -99]) {
        expect(Object.is(divv(a, b), -0), `divv(${a}, ${b}) is -0`).toBe(false);
        expect(Object.is(modd(a, b), -0), `modd(${a}, ${b}) is -0`).toBe(false);
      }
    }
  });

  it("treats zero as an ordinary dividend", () => {
    expect(divv(0, 5)).toBe(0);
    expect(divv(0, -5)).toBe(0);
    expect(modd(0, 5)).toBe(0);
    expect(modd(0, -5)).toBe(0);
  });

  it("divides by one and multiplies back", () => {
    for (const a of [-1, 0, 1, 99, -99]) {
      expect(divv(a, 1)).toBe(a);
      expect(divv(a, -1)).toBe(-a + 0);
    }
  });
});

describe("a zero divisor", () => {
  it("throws rather than returning NaN", () => {
    // Upstream throws `Fehler("Division by zero")`. A NaN would flow into every comparison
    // it met and surface as a board that misbehaves with no mention of arithmetic.
    expect(() => divv(1, 0)).toThrow(DivisionByZero);
    expect(() => modd(1, 0)).toThrow(DivisionByZero);
    expect(() => divv(0, 0)).toThrow(DivisionByZero);
  });

  it("says which operation it was", () => {
    expect(() => divv(1, 0)).toThrow(/division by zero/i);
  });
});

describe("the quadrant where upstream's modd is wrong", () => {
  // `src/code.h`'s fourth branch has the quotient's sign flipped relative to its `divv`, so
  // for `a > 0, b < 0` it returns something outside the range its own comment promises.
  //
  // Pinned here so that a future reader who spots the difference from upstream does not
  // resolve it in favour of the bug. If these expectations are ever changed, the man page
  // changed with them, and the table in cual.6 should be the reason.
  const CASES: readonly [a: number, b: number, documented: number, upstream: number][] = [
    [13, -5, -2, 28],
    [1, -15, -14, 16],
    [2, -3, -1, 2],
    [7, -4, -1, 8],
  ];

  for (const [a, b, documented, upstream] of CASES) {
    it(`${a} % ${b} is ${documented}, not upstream's ${upstream}`, () => {
      expect(modd(a, b)).toBe(documented);
      // The identity upstream's own comment promises, which its own code breaks here.
      expect(modd(a, b)).toBeGreaterThan(b);
      expect(modd(a, b)).toBeLessThanOrEqual(0);
    });
  }

  it("leaves the other three quadrants alone", () => {
    // The disagreement is confined to one branch. Saying so is what makes this a finding
    // about upstream rather than a claim that the two implementations differ everywhere.
    for (const [a, b] of [
      [13, 5],
      [-13, 5],
      [-13, -5],
    ] as [number, number][]) {
      expect(divv(a, b)).toBe(Math.floor(a / b));
      expect(modd(a, b)).toBe(a - Math.floor(a / b) * b);
    }
  });
});