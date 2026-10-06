// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for Cual's expression evaluator.
 *
 * Grouped by operator family, because that is how the language documents them and because a
 * failure should name the kind of operator that is wrong rather than a line number.
 *
 * Two of these groups test something a reader is likely to assume is wrong:
 *
 *  - `:` draws from the RNG **before** evaluating its left operand, unlike every other
 *    operator here, because that is what `code.cpp` does. A level whose two operands both
 *    consume randomness depends on it.
 *  - `&&` and `||` short-circuit, which is not only an optimisation: a skipped right operand
 *    also means one fewer draw from the simulation's sequence.
 */

import { describe, expect, it } from "vitest";
import {
  CualError,
  PRECEDENCE,
  RANGE_LIMIT,
  evaluate,
  type BinaryOperator,
  type EvalContext,
  type Expr,
  type UnaryOperator,
} from "./expr.ts";

/** Shorthand for a literal. */
const n = (value: number): Expr => ({ kind: "number", value });

/** Shorthand for `left op right`. */
const b = (op: BinaryOperator, left: Expr, right: Expr): Expr => ({
  kind: "binary",
  op,
  left,
  right,
});

/** Shorthand for `op operand`. */
const u = (op: UnaryOperator, operand: Expr): Expr => ({ kind: "unary", op, operand });

/**
 * A context with a scripted RNG, so `:`, `rnd` and operand order are all checkable.
 *
 * `draws` records every call, and `script` supplies the values in order — which is how the
 * tests below tell "evaluated the right operand first" from "evaluated both, in some order".
 */
function context(options: {
  readonly variables?: Record<string, number>;
  readonly script?: readonly number[];
} = {}): EvalContext & { readonly draws: number[] } {
  const script = [...(options.script ?? [])];
  const draws: number[] = [];
  return {
    draws,
    variable: (name) => {
      const value = options.variables?.[name];
      if (value === undefined) throw new CualError(`no variable named ${name}`);
      return value;
    },
    random: (limit) => {
      draws.push(limit);
      const next = script.shift();
      return next === undefined ? 0 : next % limit;
    },
  };
}

/** Evaluate a literal expression with no variables and no randomness. */
function value(expr: Expr): number {
  return evaluate(expr, context());
}

describe("literals and variables", () => {
  it("evaluates a number to itself", () => {
    expect(value(n(42))).toBe(42);
    expect(value(n(0))).toBe(0);
    expect(value(n(-7))).toBe(-7);
  });

  it("reads a variable through the context", () => {
    const ctx = context({ variables: { ziel: 5 } });
    expect(evaluate({ kind: "variable", name: "ziel" }, ctx)).toBe(5);
  });

  it("fails loudly on an unknown variable rather than yielding 0", () => {
    // Zero is a legal value in this language, so defaulting would turn a typo in a level
    // into a level that quietly misbehaves.
    expect(() => value({ kind: "variable", name: "nope" })).toThrow(CualError);
  });

  it("asks the context for a neighbour pattern, and turns the match into 1 or 0", () => {
    // `case nachbar_acode: return (b.getVariable(spezconst_connect) & mZahl) == mZahl2;` — an
    // int used as truth, so 1 and 0 are the whole range. Which patterns match is
    // `neighbours.ts`'s arithmetic; what is asserted here is that the evaluator asks, and hands
    // back a number every other operator can consume.
    const asked: string[] = [];
    const ctx: EvalContext = {
      variable: () => 0,
      random: () => 0,
      neighbour: (pattern) => {
        asked.push(pattern);
        return pattern === "1???0???";
      },
    };
    expect(evaluate({ kind: "neighbour", pattern: "1???0???" }, ctx)).toBe(1);
    expect(evaluate({ kind: "neighbour", pattern: "0???1???" }, ctx)).toBe(0);
    expect(asked).toEqual(["1???0???", "0???1???"]);
    // And it composes: `if 1???0??? ->` is a condition, which is 298 of the corpus's uses.
    expect(evaluate(u("!", { kind: "neighbour", pattern: "0???1???" }), ctx)).toBe(1);
  });

  it("refuses a pattern when the context has no board rather than answering 0", () => {
    // Zero would be indistinguishable from "the neighbours really are all zeros", so a typo in a
    // level would compile into a rule that quietly never fires. The message names what is
    // missing, which is a board rather than a pattern.
    expect(() => value({ kind: "neighbour", pattern: "1???0???" })).toThrow(
      /needs a context with a board/,
    );
  });
});

describe("boolean operators", () => {
  it("answers the spec's three cases", () => {
    // "WHEN 1 && 0, 1 || 0 and !0 are evaluated THEN 0, 1 and 1."
    expect(value(b("&&", n(1), n(0)))).toBe(0);
    expect(value(b("||", n(1), n(0)))).toBe(1);
    expect(value(u("!", n(0)))).toBe(1);
  });

  it("treats any non-zero as true", () => {
    expect(value(b("&&", n(42), n(1)))).toBe(1);
    expect(value(b("||", n(-3), n(0)))).toBe(1);
    expect(value(u("!", n(42)))).toBe(0);
  });

  it("returns 1 or 0, never true", () => {
    // Bools are 0 and 1 in Cual, so a `true` leaking out would poison an addition.
    for (const expr of [
      b("==", n(1), n(1)),
      b("<", n(1), n(2)),
      u("!", n(0)),
      b("&&", n(1), n(1)),
    ]) {
      expect([0, 1], `${JSON.stringify(expr)} returned neither 0 nor 1`).toContain(
        value(expr),
      );
    }
  });

  it("short-circuits, so the right operand is not evaluated", () => {
    const ctx = context({ script: [0] });
    // The right operand divides by zero, which would throw if it were evaluated.
    expect(evaluate(b("&&", n(0), b("/", n(1), n(0))), ctx)).toBe(0);
    expect(evaluate(b("||", n(1), b("/", n(1), n(0))), ctx)).toBe(1);
  });

  it("draws one fewer time when it short-circuits", () => {
    // `Aufnahme::rnd` advances the simulation's sequence, so a skipped operand is visible
    // in anything that replays. This is the reason short-circuiting is not just an
    // optimisation here.
    const short = context({ script: [0, 0] });
    evaluate(b("&&", n(0), { kind: "call", name: "rnd", args: [n(6)] }), short);
    expect(short.draws).toEqual([]);

    const full = context({ script: [0, 0] });
    evaluate(b("&&", n(1), { kind: "call", name: "rnd", args: [n(6)] }), full);
    expect(full.draws).toEqual([6]);
  });
});

describe("comparison operators", () => {
  it("answers each of the six", () => {
    const cases: readonly [BinaryOperator, number, number, number][] = [
      ["==", 2, 2, 1],
      ["==", 2, 3, 0],
      ["!=", 2, 3, 1],
      ["!=", 2, 2, 0],
      ["<", 2, 3, 1],
      ["<", 3, 2, 0],
      [">", 3, 2, 1],
      [">", 2, 3, 0],
      ["<=", 2, 2, 1],
      ["<=", 3, 2, 0],
      [">=", 2, 2, 1],
      [">=", 2, 3, 0],
    ];
    for (const [op, x, y, want] of cases) {
      expect(value(b(op, n(x), n(y))), `${x} ${op} ${y}`).toBe(want);
    }
  });

  it("compares negatively, which is the case JavaScript would get wrong for / and %", () => {
    expect(value(b("<", n(-5), n(-3)))).toBe(1);
    expect(value(b(">", n(-5), n(-3)))).toBe(0);
  });
});

describe("range comparison", () => {
  const range = (valueExpr: Expr, lower: Expr | null, upper: Expr | null): Expr => ({
    kind: "range",
    value: valueExpr,
    lower,
    upper,
  });

  it("answers the spec's case", () => {
    // "WHEN n == 2 .. 5 is evaluated for n equal to 3 and for n equal to 7 THEN 1 and 0."
    expect(value(range(n(3), n(2), n(5)))).toBe(1);
    expect(value(range(n(7), n(2), n(5)))).toBe(0);
  });

  it("includes both bounds", () => {
    expect(value(range(n(2), n(2), n(5)))).toBe(1);
    expect(value(range(n(5), n(2), n(5)))).toBe(1);
    expect(value(range(n(1), n(2), n(5)))).toBe(0);
    expect(value(range(n(6), n(2), n(5)))).toBe(0);
  });

  it("treats an open bound as 32767 either way", () => {
    // `parser.yy` substitutes `#define VIEL 32767` for a missing side.
    expect(RANGE_LIMIT).toBe(32767);
    expect(value(range(n(30000), n(2), null))).toBe(1);
    expect(value(range(n(-30000), null, n(5)))).toBe(1);
    expect(value(range(n(32767), n(2), null))).toBe(1);
    expect(value(range(n(32768), n(2), null))).toBe(0);
  });

  it("is a comparison, so it answers 1 or 0", () => {
    expect(value(range(n(3), n(2), n(5)))).toBe(1);
    expect(value(range(n(30), n(2), n(5)))).toBe(0);
  });
});

describe("arithmetic operators", () => {
  it("adds, subtracts and multiplies", () => {
    expect(value(b("+", n(2), n(3)))).toBe(5);
    expect(value(b("-", n(2), n(3)))).toBe(-1);
    expect(value(b("*", n(4), n(5)))).toBe(20);
  });

  it("divides by flooring rather than truncating", () => {
    // The whole reason divmod.ts exists; asserted here so the evaluator cannot quietly
    // substitute JavaScript's `/`.
    expect(value(b("/", n(-13), n(5)))).toBe(-3);
    expect(value(b("/", n(13), n(-5)))).toBe(-3);
    expect(value(b("/", n(13), n(5)))).toBe(2);
  });

  it("takes the remainder that matches that division", () => {
    expect(value(b("%", n(13), n(5)))).toBe(3);
    expect(value(b("%", n(-13), n(5)))).toBe(2);
    expect(value(b("%", n(13), n(-5)))).toBe(-2);
    expect(value(b("%", n(-13), n(-5)))).toBe(-3);
  });

  it("negates, and folds into addition", () => {
    expect(value(u("-", n(5)))).toBe(-5);
    expect(value(u("-", n(-5)))).toBe(5);
    expect(value(b("+", n(5), u("-", n(2))))).toBe(3);
  });

  it("propagates a zero divisor", () => {
    expect(() => value(b("/", n(1), n(0)))).toThrow(/division by zero/i);
    expect(() => value(b("%", n(1), n(0)))).toThrow(/division by zero/i);
  });
});

describe("the probabilistic operator", () => {
  it("is 1 when the draw is below the left operand", () => {
    // `code.cpp`: `Aufnahme::rnd(mF2) < mF1`.
    const ctx = context({ script: [0] });
    expect(evaluate(b(":", n(1), n(6)), ctx)).toBe(1);
    const high = context({ script: [5] });
    expect(evaluate(b(":", n(1), n(6)), high)).toBe(0);
  });

  it("yields 1 in about one of six evaluations for 1:6", () => {
    // The spec's scenario, checked as a rate over a fixed draw sequence rather than with a
    // real RNG, so the test cannot flake and the arithmetic is what is being tested.
    const ctx = context({ script: [0, 1, 2, 3, 4, 5] });
    const ones = [0, 1, 2, 3, 4, 5].map(() => evaluate(b(":", n(1), n(6)), ctx));
    expect(ones).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it("draws before evaluating its left operand, unlike every other operator", () => {
    // Upstream evaluates `mF2`, then draws, then evaluates `mF1`. Reversed, a level whose
    // operands both consume randomness desynchronises from upstream and the animation is
    // subtly wrong.
    const ctx = context({
      variables: { left: 1 },
      script: [0],
    });
    evaluate(b(":", { kind: "variable", name: "left" }, n(6)), ctx);
    expect(ctx.draws).toEqual([6]);

    // A left operand that itself draws, so order is visible in the sequence of limits.
    const ordered = context({ script: [0, 0] });
    evaluate(b(":", { kind: "call", name: "rnd", args: [n(4)] }, n(9)), ordered);
    expect(ordered.draws).toEqual([9, 4]);
  });

  it("refuses a zero probability", () => {
    expect(() => value(b(":", n(1), n(0)))).toThrow(/probability/i);
  });
});

describe("bitwise operators", () => {
  it("ands, ors and nots", () => {
    expect(value(b("&", n(6), n(3)))).toBe(2);
    expect(value(b("&", n(6), n(4)))).toBe(4);
    expect(value(b("|", n(6), n(3)))).toBe(7);
    expect(value(b("|", n(6), n(0)))).toBe(6);
    expect(value(b("&", n(6), n(0)))).toBe(0);
  });

  it("sets bits with .+, which code.h defines as bitor", () => {
    // `code.h`: `bitset_acode = bitor_acode`.
    expect(value(b(".+", n(0), n(6)))).toBe(6);
    expect(value(b(".+", n(6), n(6)))).toBe(6);
    expect(value(b(".+", n(2), n(4)))).toBe(6);
  });

  it("unsets bits with .-", () => {
    // Upstream writes `a & (-1 - b)`; the expected values are the obvious ones so that the
    // implementation is checked on behaviour rather than on mirroring the expression.
    expect(value(b(".-", n(6), n(6)))).toBe(0);
    expect(value(b(".-", n(7), n(1)))).toBe(6);
    expect(value(b(".-", n(6), n(1)))).toBe(6);
  });

  it("behaves as a & ~b across the int32 range, including negatives", () => {
    // Expected values worked out rather than assumed; an earlier draft of this file claimed
    // `0 .- -1` was -1, which is `0 & 0`. Every case is also checked against `a & ~b` so a
    // wrong constant cannot pass as a right answer.
    const cases: readonly [number, number][] = [
      [0, -1],
      [-1, -1],
      [-1, 1],
      [-1, 2],
      [7, 1],
      [6, 6],
      [255, 15],
    ];
    for (const [a, r] of cases) {
      expect(value(b(".-", n(a), n(r))), `${a} .- ${r}`).toBe(a & ~r);
    }
  });
});

describe("the bit test", () => {
  it("answers the spec's sequence", () => {
    // "x starts at 0, x .+= 6, then x . 2, then x .-= 6 THEN 6, true, 0." The compound
    // assignments are task 3.5's parser; here they are the equivalent expressions.
    const x = b(".+", n(0), n(6));
    expect(value(x)).toBe(6);
    expect(value(b(".", x, n(2)))).toBe(1);
    expect(value(b(".-", x, n(6)))).toBe(0);
  });

  it("is a&b != 0, as the man page spells out", () => {
    expect(value(b(".", n(6), n(2)))).toBe(1);
    expect(value(b(".", n(6), n(1)))).toBe(0);
    expect(value(b(".", n(0), n(0)))).toBe(0);
    expect(value(b(".", n(-1), n(1)))).toBe(1);
  });

  it("is binary, not a prefix operator on one operand", () => {
    // An earlier draft of this file had `.` as unary. `parser.yy` has
    // `ausdruck '.' ausdruck`, and `cual.6` gives two operands.
    expect(value(b(".", n(4), n(2)))).toBe(0);
    expect(value(b(".", n(6), n(3)))).toBe(1);
  });
});

describe("function calls", () => {
  it("rnd(n) stays in range", () => {
    const ctx = context({ script: [0, 3, 5] });
    for (let i = 0; i < 3; i++) {
      const r = evaluate({ kind: "call", name: "rnd", args: [n(6)] }, ctx);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(6);
    }
  });

  it("gcd yields the greatest common divisor", () => {
    const cases: readonly [number, number, number][] = [
      [12, 18, 6],
      [18, 12, 6],
      [7, 13, 1],
      [0, 5, 5],
      [5, 0, 5],
      [0, 0, 0],
      [-12, 18, 6],
    ];
    for (const [a, b2, want] of cases) {
      expect(
        evaluate({ kind: "call", name: "gcd", args: [n(a), n(b2)] }, context()),
        `gcd(${a}, ${b2})`,
      ).toBe(want);
    }
  });

  it("refuses rnd of zero or less, as code.cpp does", () => {
    // `w <= 0`, not `w == 0`, so `rnd(-1)` is the same error rather than a bad draw.
    expect(() => value({ kind: "call", name: "rnd", args: [n(0)] })).toThrow(CualError);
    expect(() => value({ kind: "call", name: "rnd", args: [n(-1)] })).toThrow(CualError);
  });
});

describe("the precedence table", () => {
  // Transcribed independently from `parser.yy`'s `%left` / `%nonassoc` declarations, so a
  // drift in either place shows up as a failure rather than as a parser that quietly differs
  // from upstream. This is the table task 3.5's parser will consume.

  const FROM_PARSER_YY: readonly (readonly [number, readonly string[], string])[] = [
    [1, ["||"], "left"],
    [2, ["&&"], "left"],
    [3, ["==", "!=", "<", ">", "<=", ">="], "left"],
    [4, ["==.."], "nonassoc"],
    [5, ["!"], "nonassoc"],
    [6, ["+", "-"], "left"],
    [7, [":"], "nonassoc"],
    [8, ["*", "/", "%"], "left"],
    [9, ["&", "|", ".+", ".-"], "left"],
    [10, ["-"], "nonassoc"],
    [11, ["."], "nonassoc"],
  ];

  it("matches parser.yy level for level", () => {
    expect(PRECEDENCE.map((l) => [l.level, [...l.ops].sort(), l.associativity])).toEqual(
      FROM_PARSER_YY.map(([level, ops, assoc]) => [level, [...ops].sort(), assoc]),
    );
  });

  it("puts the six comparisons on one level, not six", () => {
    // The spec's prose lists them as six increasing levels. It is wrong, and the difference
    // is observable: `a < b == c` parses as `a < (b == c)`, not as `(a < b) == c`.
    const comparisons = PRECEDENCE.filter((l) => l.ops.includes("<"));
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0]?.ops).toEqual(["==", "!=", "<", ">", "<=", ">="]);
  });

  it("separates binary `-` from prefix `-`", () => {
    const minus = PRECEDENCE.filter((l) => l.ops.includes("-"));
    expect(minus.map((l) => l.position)).toEqual(["infix", "prefix"]);
  });

  it("does not list the compound assignments among the operators", () => {
    // `.+=` and `.-=` assign; `.+` and `.-` are expressions. The spec's prose lists the
    // assignment forms, which would put a side effect in the middle of an expression.
    const ops = PRECEDENCE.flatMap((l) => l.ops);
    expect(ops).not.toContain(".+=");
    expect(ops).not.toContain(".-=");
    expect(ops).toContain(".+");
    expect(ops).toContain(".-");
  });

  it("declares every infix operator exactly once", () => {
    // `-` is the one legitimate repeat, and only across a prefix and an infix level.
    const infix = PRECEDENCE.filter((l) => l.position === "infix").flatMap((l) => l.ops);
    const repeated = infix.filter((op, i) => infix.indexOf(op) !== i);
    expect(repeated).toEqual([]);
  });

  it("covers every operator the evaluator implements", () => {
    const declared = new Set(PRECEDENCE.flatMap((l) => l.ops));
    const evaluated = new Set<BinaryOperator | UnaryOperator>([
      "||",
      "&&",
      "==",
      "!=",
      "<",
      ">",
      "<=",
      ">=",
      "+",
      "-",
      "*",
      "/",
      "%",
      ":",
      "&",
      "|",
      ".+",
      ".-",
      ".",
      "!",
    ]);
    for (const op of evaluated) {
      expect(declared.has(op), `${op} is evaluated but not in PRECEDENCE`).toBe(true);
    }
  });
});
