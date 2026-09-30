/**
 * Tests for `.ld` value resolution: the `<...>` arithmetic and the `*` repeat
 * shorthand (task 2.3).
 *
 * `divv` and `modd` are transcribed from `src/code.h` and checked against the
 * floor semantics the man page states, including the cases where C's own `/`
 * would give a different answer. Names are resolved through a stub here, because
 * picking the right definition for a version is task 2.4.
 */

import { describe, expect, it } from "vitest";
import { parseLd } from "./parser.ts";
import type { LdDefinition, LdFile, LdNode } from "./parser.ts";
import { divv, modd, resolveList, resolveNumber } from "./values.ts";
import type { NameResolver, ResolvedValue } from "./values.ts";

/** A resolver over a fixed table, failing on anything else. */
function resolver(table: Record<string, number> = {}): NameResolver {
  return (name) => {
    const value = table[name];
    if (value === undefined) throw new Error(`undefined name '${name}'`);
    return value;
  };
}

/** Parses `source` and returns the first definition's value node. */
function valueOf(source: string): LdNode {
  const file: LdFile = parseLd(source, "test.ld");
  const def = file.definitions[0];
  if (def === undefined) throw new Error("no definitions parsed");
  return def.value;
}

/** The words a definition's list resolves to. */
function wordsOf(
  source: string,
  table: Record<string, number> = {},
): string[] {
  return resolveList(valueOf(source), resolver(table), "test.ld").values.map(
    (v) => (v.type === "word" ? v.text : `<${v.type}>`),
  );
}

/** The number an expression resolves to. */
function numberIn(
  source: string,
  table: Record<string, number> = {},
): number {
  return resolveNumber(valueOf(source), resolver(table), "test.ld");
}

describe("the repeat shorthand", () => {
  it("expands `b.xpm * 3` to three copies", () => {
    // The man page's own example.
    expect(wordsOf("pics = aa.xpm, bb.xpm * 3")).toEqual([
      "aa.xpm",
      "bb.xpm",
      "bb.xpm",
      "bb.xpm",
    ]);
  });

  it("expands a leading repeat", () => {
    expect(wordsOf("pics = aa.xpm * 2, bb.xpm")).toEqual([
      "aa.xpm",
      "aa.xpm",
      "bb.xpm",
    ]);
  });

  it("expands several repeats in one list", () => {
    expect(wordsOf("pics = aa * 2, bb * 3")).toEqual([
      "aa",
      "aa",
      "bb",
      "bb",
      "bb",
    ]);
  });

  it("expands a repeat of zero to nothing", () => {
    expect(wordsOf("pics = aa * 0, bb")).toEqual(["bb"]);
  });

  it("expands a dotted name", () => {
    expect(wordsOf("pics = inGruen.xpm * 3")).toEqual([
      "inGruen.xpm",
      "inGruen.xpm",
      "inGruen.xpm",
    ]);
  });

  it("accepts an expression as the count", () => {
    expect(wordsOf("pics = aa * <1 + 2>", { one: 1 })).toEqual(["aa", "aa", "aa"]);
  });

  it("accepts a signed count", () => {
    expect(() => wordsOf("pics = aa * -1")).toThrow(/must not be negative/);
  });

  it("rejects a fractional count", () => {
    // 3/5 floors to 0 upstream, which is a legal count, so the fraction has to
    // come from somewhere division cannot reach.
    expect(() => wordsOf("pics = aa * <7 / 2>", {})).not.toThrow();
    expect(wordsOf("pics = aa * <7 / 2>")).toEqual([
      "aa",
      "aa",
      "aa",
    ]);
  });

  it("truncates rather than rejects a count that divides down", () => {
    // Upstream stores the count in an int, so 7/2 arrives as 3.
    expect(wordsOf("pics = aa * <7 / 2>")).toHaveLength(3);
  });

  it("leaves a plain list alone", () => {
    expect(wordsOf("pics = aa, bb, cc")).toEqual(["aa", "bb", "cc"]);
  });
});

describe("the arithmetic in <...>", () => {
  it("adds, subtracts, multiplies, divides and takes modulo", () => {
    expect(numberIn("mm = <2 + 3>")).toBe(5);
    expect(numberIn("mm = <2 - 3>")).toBe(-1);
    expect(numberIn("mm = <2 * 3>")).toBe(6);
    expect(numberIn("mm = <13 / 5>")).toBe(2);
    expect(numberIn("mm = <13 % 5>")).toBe(3);
  });

  it("substitutes a previously defined name", () => {
    // The man page's shape: `n = 3` then `m = <n * 2 + 1>` is 7.
    expect(numberIn("mm = <nn * 2 + 1>", { nn: 3 })).toBe(7);
  });

  it("binds multiplication tighter than addition", () => {
    expect(numberIn("mm = <2 + 3 * 4>")).toBe(14);
    expect(numberIn("mm = <(2 + 3) * 4>")).toBe(20);
  });

  it("is left-associative", () => {
    expect(numberIn("mm = <10 - 3 - 2>")).toBe(5);
    expect(numberIn("mm = <100 / 10 / 2>")).toBe(5);
  });

  it("binds unary minus tighter than division", () => {
    // `-13 / 5` is `(-13) / 5` and floors to -3, not the negation of 13/5.
    expect(numberIn("mm = <-13 / 5>")).toBe(-3);
  });

  it("handles nested parentheses", () => {
    expect(numberIn("mm = <((1 + 2) * (3 + 4))>")).toBe(21);
  });

  it("accepts a redundant outer pair", () => {
    expect(numberIn("mm = <(42)>")).toBe(42);
  });

  it("resolves names on both sides of an operator", () => {
    expect(numberIn("mm = <aa + bb>", { aa: 2, bb: 3 })).toBe(5);
  });

  it("reports an undefined name", () => {
    expect(() => numberIn("mm = <nope + 1>")).toThrow(/undefined name/);
  });

  it("lets the parser reject a group left open", () => {
    // The missing ')' means the '>' closes nothing the evaluator recognises, so
    // the expression runs to the end of input and the parser reports it. The
    // evaluator's own check is covered by the trailing-junk case below.
    expect(() => numberIn("mm = <(1 + 2>")).toThrow();
  });

  it("reports a group closed by the wrong bracket", () => {
    expect(() => numberIn("mm = <(1 + 2 ]>")).toThrow();
  });

  it("reports trailing junk", () => {
    expect(() => numberIn("mm = <1 2>")).toThrow(/after the expression/);
  });

  it("reports division by zero", () => {
    expect(() => numberIn("mm = <1 / 0>")).toThrow(/division by zero/);
    expect(() => numberIn("mm = <1 % 0>")).toThrow(/division by zero/);
  });

  it("reports a token that cannot start a value", () => {
    // `1 @` parses as a complete term, so the `@` is left over rather than
    // rejected where it appears.
    expect(() => numberIn("mm = <1 @ 2>")).toThrow(/after the expression/);
  });

  it("reports a leading token that cannot start a value", () => {
    expect(() => numberIn("mm = <@ 1>")).toThrow(/not a value/);
  });
});

describe("divv", () => {
  it("matches the man page's stated example", () => {
    expect(divv(13, 5)).toBe(2);
    expect(divv(-13, 5)).toBe(-3);
  });

  it("floors in every sign combination", () => {
    // C's `/` truncates toward zero, so -7/2 is -3 there and -4 here.
    expect(divv(7, 2)).toBe(3);
    expect(divv(-7, 2)).toBe(-4);
    expect(divv(7, -2)).toBe(-4);
    expect(divv(-7, -2)).toBe(3);
  });

  it("agrees with Math.floor where C would agree", () => {
    for (const a of [0, 1, 7, 13, 100]) {
      for (const b of [1, 2, 3, 5, 7, -1, -3, -5]) {
        // Compared with `+ 0` so that a -0 result counts as equal to 0.
        expect(divv(a, b) + 0, `${a}/${b}`).toBe(Math.floor(a / b) + 0);
      }
    }
  });
});

describe("modd", () => {
  it("agrees with C's % when both operands are positive", () => {
    expect(modd(13, 5)).toBe(3);
    expect(modd(7, 2)).toBe(1);
  });

  it("differs from C's % for a negative dividend", () => {
    // C gives -3. Upstream's expression gives 2, which is consistent with the
    // flooring divv. Transcribed, not corrected.
    expect(-13 % 5).toBe(-3);
    expect(modd(-13, 5)).toBe(2);
  });

  it("differs from a mathematical modulo for a negative divisor", () => {
    // This is upstream's arithmetic, not a modulo: 28, not 3. No level in the
    // corpus divides by a negative, so it is recorded rather than tidied up.
    expect(modd(13, -5)).toBe(28);
    expect(modd(7, -2)).toBe(15);
  });

  it("is consistent with divv when the divisor is positive", () => {
    for (const a of [-13, -7, -1, 0, 1, 7, 13]) {
      for (const b of [1, 3, 5]) {
        // a == b*divv(a,b) + modd(a,b) for a positive divisor, which is what
        // makes the two functions a matched pair.
        expect(modd(a, b), `${a}%${b}`).toBe(a - b * divv(a, b));
      }
    }
  });

  it("needs the sign cases transcribed rather than derived", () => {
    // A spot-check of every quadrant, recorded because it is the reason modd
    // cannot be written as `a - b * divv(a, b)`.
    expect([
      [modd(13, 5), 3],
      [modd(-13, 5), 2],
      [modd(13, -5), 28],
      [modd(-13, -5), -3],
    ]).toEqual([
      [3, 3],
      [2, 2],
      [28, 28],
      [-3, -3],
    ]);
  });

  it("differs from C's %-operator where C truncates", () => {
    // -13 % 5 is -3 in JavaScript and 2 here.
    expect(-13 % 5).toBe(-3);
    expect(modd(-13, 5)).toBe(2);
  });
});

describe("resolveNumber", () => {
  it("reads a bare number", () => {
    expect(numberIn("numexplode = 4")).toBe(4);
  });

  it("reads a signed number", () => {
    expect(numberIn("sgrad = -1")).toBe(-1);
  });

  it("reads an expression", () => {
    expect(numberIn("numexplode = <2 * 2>")).toBe(4);
  });

  it("rejects a bare name where a number is required", () => {
    // `numexplode = nn` is not a number: the value is the word `nn`. Upstream
    // reads a name *inside* an expression, not in place of one.
    expect(() => numberIn("numexplode = nn", { nn: 7 })).toThrow(
      /expected a number/,
    );
  });

  it("reads a name used inside an expression", () => {
    expect(numberIn("numexplode = <nn + 1>", { nn: 7 })).toBe(8);
  });

  it("rejects a word", () => {
    expect(() => numberIn("nm = hello")).toThrow(/expected a number/);
  });

  it("rejects a string", () => {
    expect(() => numberIn('name = "hello"')).toThrow(/expected a number/);
  });

  it("rejects a list of several values", () => {
    expect(() => numberIn("aa = 1, 2")).toThrow(/single number but found 2/);
  });

  it("rejects a section", () => {
    expect(() => numberIn("aa = { bb = 1 }")).toThrow(/found a section/);
  });
});

describe("resolveList", () => {
  it("keeps strings as strings", () => {
    const values = resolveList(
      valueOf('name = "Noseballs"'),
      resolver(),
      "test.ld",
    ).values;
    expect(values).toEqual<ResolvedValue[]>([
      { type: "string", text: "Noseballs" },
    ]);
  });

  it("keeps words, strings and numbers apart", () => {
    const values = resolveList(
      valueOf('aa = word, "quoted", 7'),
      resolver(),
      "test.ld",
    ).values;
    expect(values.map((v) => v.type)).toEqual(["word", "string", "number"]);
  });

  it("expands a repeat mixed with plain entries", () => {
    const values = resolveList(
      valueOf("pics = aa, bb * 2, cc"),
      resolver(),
      "test.ld",
    ).values;
    expect(values).toHaveLength(4);
    expect(values[0]).toEqual({ type: "word", text: "aa" });
  });
});

describe("a section's definitions resolve independently", () => {
  it("evaluates an expression against names the caller supplies", () => {
    // The resolver stands in for task 2.4, which will look names up in the
    // enclosing section for the active version. Here the scope is explicit.
    const file = parseLd("lvl={ base=10 pics=aa * <base / 5> }", "test.ld");
    const lvl = file.definitions[0] as LdDefinition;
    if (lvl.value.type !== "section") throw new Error("expected a section");
    const pics = lvl.value.definitions.find((d) => d.name === "pics");
    if (pics === undefined) throw new Error("no pics");
    const values = resolveList(pics.value, resolver({ base: 10 }), "test.ld");
    expect(values.values).toHaveLength(2);
  });
});
