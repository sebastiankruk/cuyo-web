// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for the Cual expression parser.
 *
 * The important assertions here are about **grouping**, not about which operators exist. An
 * operator table can be right and a parser still group wrongly, and a wrongly grouped tree
 * evaluates without complaint — it just computes a different number, which is the hardest
 * kind of port bug to find later.
 *
 * So each precedence rule from `parser.yy` has a case that would give a different answer
 * under a plausible alternative grouping. `1 + 2 * 3` is not the test for multiplication
 * binding tighter; `1 + 2 * 3 == 7` is, because the *equality* case is what the spec got
 * wrong and the parser here follows the grammar.
 */

import { describe, expect, it } from "vitest";
import { tokenize } from "../level-format/lexer.ts";
import type { Token } from "../level-format/lexer.ts";
import { CualSyntaxError, parseExpression } from "./parse.ts";
import { parseCode } from "./code.ts";
import { evaluate, type EvalContext, type Expr } from "./expr.ts";

/** Lex a snippet the way a Cual block's contents arrive. */
function lex(source: string): Token[] {
  // `tokenize` on a whole `.ld` file would want the surrounding structure; the code inside
  // `<< >>` is what the parser gets, and it is a flat token list.
  const all = tokenize(source, "test.ld");
  return all.filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** Parse and evaluate in one step, which is what a grouping error actually looks like. */
function run(source: string, variables: Record<string, number> = {}): number {
  const ctx: EvalContext = {
    variable: (name) => {
      const value = variables[name];
      if (value === undefined) throw new Error(`no variable ${name}`);
      return value;
    },
    random: () => 0,
  };
  return evaluate(parseExpression(lex(source)), ctx);
}

/** Parse without evaluating, for the shapes the evaluator does not accept yet. */
function parse(source: string): Expr {
  return parseExpression(lex(source));
}

/** The tree as nested arrays, which is how a grouping assertion reads. */
function shape(expr: Expr): unknown {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "variable":
      return expr.name;
    case "unary":
      return [expr.op, shape(expr.operand)];
    case "binary":
      return [expr.op, shape(expr.left), shape(expr.right)];
    case "call":
      return [expr.name, ...expr.args.map(shape)];
    case "range":
      return [
        "range",
        shape(expr.value),
        expr.lower === null ? null : shape(expr.lower),
        expr.upper === null ? null : shape(expr.upper),
      ];
    case "positioned":
      return ["positioned", expr.name, expr.position.kind];
    case "neighbour":
      return ["neighbour", expr.pattern];
  }
}

describe("literals and variables", () => {
  it("parses a number", () => {
    expect(shape(parse("42"))).toBe(42);
    expect(shape(parse("0"))).toBe(0);
  });

  it("parses 0 and 1 as the zeroOne literal, not as a word", () => {
    expect(run("1")).toBe(1);
    expect(run("0")).toBe(0);
  });

  it("parses a word as a variable", () => {
    expect(shape(parse("drehpos"))).toBe("drehpos");
  });

  it("parses a multi-letter pure word the same way", () => {
    // `[A-Za-z]+` and `[A-Za-z_][A-Za-z_0-9]*` are separate rules with the same result.
    expect(shape(parse("links"))).toBe("links");
    expect(shape(parse("x_1"))).toBe("x_1");
  });

  it("refuses a single letter as a variable", () => {
    // `lokale_variable`'s own message. Being laxer would accept programs upstream rejects.
    expect(() => parse("x")).toThrow(/single letters/i);
  });

  it("parses a quoted string as a variable", () => {
    expect(shape(parse('"abc"'))).toBe("abc");
  });

  it("parses a neighbour pattern", () => {
    expect(shape(parse("1???0???"))).toEqual(["neighbour", "1???0???"]);
    expect(shape(parse("1???0???"))).toEqual(["neighbour", "1???0???"]);
  });

  it("refuses a seven-character neighbour pattern", () => {
    // Neither rule matches, so the `1` lexes as zeroOne and the trailing `?` is a character
    // no rule accepts - which the *lexer* rejects, before the parser sees it. Asserted as a
    // plain throw because the two layers are the point: a seven-character pattern is not
    // something this parser gets to reinterpret.
    expect(() => parse("1??????")).toThrow();
  });

  it("rejects trailing tokens rather than ignoring them", () => {
    // A parser that stops at the first complete expression would otherwise claim to have
    // parsed `1 + 2 * 3 4`.
    expect(() => parse("1 + 2 3")).toThrow(/unexpected/);
  });
});

describe("precedence", () => {
  it("binds multiplication tighter than addition", () => {
    expect(shape(parse("1 + 2 * 3"))).toEqual(["+", 1, ["*", 2, 3]]);
    expect(run("1 + 2 * 3")).toBe(7);
  });

  it("binds division and modulo tighter than addition", () => {
    expect(run("1 + 6 / 2")).toBe(4);
    expect(run("1 + 7 % 2")).toBe(2);
  });

  it("binds the probabilistic operator tighter than addition", () => {
    // Later declaration = tighter = groups innermost. So `:` (declared after `+ -`) takes
    // `1 : 6` first and the addition is the outer operation. Written the other way round
    // twice before this: `+` is not "tighter because it looks stronger".
    expect(shape(parse("1 + 1 : 6"))).toEqual(["+", 1, [":", 1, 6]]);
  });

  it("binds multiplication tighter than the probabilistic operator", () => {
    // `* / %` is declared after `:`, so it groups first: `2 : (3 * 4)`.
    expect(shape(parse("2 : 3 * 4"))).toEqual([":", 2, ["*", 3, 4]]);
  });

  it("binds bitwise tighter than multiplication, which is the opposite of C", () => {
    // `& | .+ .-` is declared *after* `* / %`, so it binds tighter and groups innermost.
    // This inverts C, where `&` is looser than `*`, and it is the single place where
    // assuming the usual convention would produce a parser that passes every
    // operator-existence test and groups Cual wrongly. Both orders asserted, because the
    // two directions are what distinguish "tighter" from "leftmost".
    expect(shape(parse("2 * 3 & 4"))).toEqual(["*", 2, ["&", 3, 4]]);
    expect(shape(parse("2 & 3 * 4"))).toEqual(["*", ["&", 2, 3], 4]);
    // In C these would be `2 & 12` and `2 | 12`; here they are not.
    expect(run("2 | 3 * 4")).toBe((2 | 3) * 4);
  });

  it("puts all six comparisons on one level, so they do not nest", () => {
    // The spec's prose lists them as six increasing levels, which would make this
    // `(<, 1, 2) == 1`. `parser.yy` has them on one `%left` line, and `cual.6` lists them as
    // one "Comparison" entry.
    expect(shape(parse("1 < 2 == 1"))).toEqual(["==", ["<", 1, 2], 1]);
    expect(shape(parse("1 == 2 < 3"))).toEqual(["<", ["==", 1, 2], 3]);
  });

  it("binds the range comparison tighter than the comparisons", () => {
    // `==..` is declared after the six comparisons, so it binds tighter and `a == b .. c`
    // is one production rather than `(a == b) .. c`. Both spellings of the same claim,
    // because the failure mode is a tree that looks plausible.
    expect(shape(parse("niveau == 2 .. 5"))).toEqual(["range", "niveau", 2, 5]);
    // A multi-letter name: `n` is a single letter and the parser refuses those on purpose.
    // The tree is a range whose *value* is the `==`, because a comparison whose right side is
    // a range is represented as the range. `(nn == 2) == (3 .. 4)` either way.
    expect(shape(parse("nn == 2 == 3 .. 4"))).toEqual(["range", ["==", "nn", 2], 3, 4]);
  });

  it("binds comparison tighter than boolean and, which is tighter than boolean or", () => {
    expect(shape(parse("1 < 2 && 3"))).toEqual(["&&", ["<", 1, 2], 3]);
    expect(shape(parse("1 && 2 || 3"))).toEqual(["||", ["&&", 1, 2], 3]);
  });

  it("binds boolean not tighter than addition", () => {
    expect(shape(parse("!1 + 1"))).toEqual(["+", ["!", 1], 1]);
  });

  it("binds the bit test tighter than everything else", () => {
    // `6 & (2 . 2)` = 6 & 1 = 0. The value is asserted as well as the shape because a
    // grouping that merely *looks* right can still be the one on the other side.
    expect(shape(parse("6 & 2 . 2"))).toEqual(["&", 6, [".", 2, 2]]);
    expect(run("6 & 2 . 2")).toBe(0);
  });

  it("binds unary minus tighter than multiplication", () => {
    expect(shape(parse("-2 * 3"))).toEqual(["*", ["-", 2], 3]);
    expect(run("-2 * 3")).toBe(-6);
  });

  it("binds unary minus looser than the bit test", () => {
    expect(shape(parse("-2 . 2"))).toEqual([".", ["-", 2], 2]);
  });

  it("associates left for the left-associative operators", () => {
    expect(shape(parse("1 - 2 - 3"))).toEqual(["-", ["-", 1, 2], 3]);
    expect(run("1 - 2 - 3")).toBe(-4);
    expect(shape(parse("16 / 4 / 2"))).toEqual(["/", ["/", 16, 4], 2]);
    expect(run("16 / 4 / 2")).toBe(2);
  });
});

describe("non-associativity", () => {
  // Bison resolves these by rejecting them; a precedence-climbing parser that just loops
  // would accept them and pick a grouping, which is a program upstream cannot run.
  const rejected: readonly [string, string][] = [
    ["a : b : c", "':' chained"],
    ["1 . 2 . 3", "'.' chained"],
    ["! ! 1", "'!' chained"],
    ["- - 1", "unary '-' chained"],
  ];

  for (const [source, what] of rejected) {
    it(`refuses ${what}`, () => {
      expect(() => parse(source)).toThrow(CualSyntaxError);
    });
  }

  it("refuses a range chained straight onto another range", () => {
    // The directly detectable shape: an `==` whose right side begins with `..`.
    expect(() => parse("1 == 1 .. == 2 .. 4")).toThrow(CualSyntaxError);
    expect(() => parse("1 == 1 .. == .. 4")).toThrow(CualSyntaxError);
  });

  it("still allows plain '==' to chain, which a wider non-associativity check would refuse", () => {
    // The scoping is the point: `==` is `%left`, so `1 == 1 == 1` is legal. An earlier
    // version of the check fired after every `==` and refused both this and any `==`
    // involving a range.
    expect(shape(parse("1 == 1 == 1"))).toEqual(["==", ["==", 1, 1], 1]);
  });

  it("still allows the left-associative chains that look similar", () => {
    expect(run("1 + 2 + 3")).toBe(6);
    expect(run("1 == 1 == 1")).toBe(1);
  });
});

describe("range comparison", () => {
  it("parses a closed range", () => {
    expect(shape(parse("niveau == 2 .. 5"))).toEqual(["range", "niveau", 2, 5]);
  });

  it("parses an open upper bound", () => {
    expect(shape(parse("niveau == 2 .."))).toEqual(["range", "niveau", 2, null]);
  });

  it("parses an open lower bound", () => {
    expect(shape(parse("niveau == .. 5"))).toEqual(["range", "niveau", null, 5]);
  });

  it("evaluates the spec's case", () => {
    expect(run("3 == 2 .. 5")).toBe(1);
    expect(run("7 == 2 .. 5")).toBe(0);
  });

  it("does not let a looser operator be swallowed by a range bound", () => {
    // `&&` and `||` bind looser than `==..`, so they cannot be part of either bound. Parsed
    // at the loosest level instead, the upper bound of `a == 1 .. 2` eats the `&&` and the
    // tree evaluates to a different number without complaint. `&&` after a range is ordinary
    // Cual - levels write `loc_x == 0 .. 5 && something` - so this is a shape that occurs.
    expect(shape(parse("niveau == 1 .. 2 && flag"))).toEqual([
      "&&",
      ["range", "niveau", 1, 2],
      "flag",
    ]);
    // The same for the open-lower form, whose upper bound is parsed at the same level.
    expect(shape(parse("niveau == .. 2 || flag"))).toEqual([
      "||",
      ["range", "niveau", null, 2],
      "flag",
    ]);
    // And the comparisons are looser than `==..`, so `<` applies to the whole comparison
    // rather than to the upper bound: `(niveau == 1 .. 2) < 3`.
    expect(shape(parse("niveau == 1 .. 2 < 3"))).toEqual([
      "<",
      ["range", "niveau", 1, 2],
      3,
    ]);
    // A genuinely tighter operator does belong inside the bound, which is what makes `==..`
    // tighter than the comparisons at all.
    expect(shape(parse("niveau == 1 .. 2 * 3"))).toEqual(["range", "niveau", 1, ["*", 2, 3]]);
  });

  it("does not confuse the range operator with a bare '..'", () => {
    // `..` with no `==` in front is not a comparison at all.
    expect(() => parse("3 .. 5")).toThrow(CualSyntaxError);
  });

  it("evaluates an open bound as 32767 either way", () => {
    // `parser.yy` substitutes `#define VIEL 32767` for a missing side, and does it in the
    // parser — which is why the bounds are `null` here and not 32767 at parse time.
    expect(run("30000 == 2 ..")).toBe(1);
    expect(run("32768 == 2 ..")).toBe(0);
    expect(run("-30000 == .. 5")).toBe(1);
    expect(run("-32768 == .. 5")).toBe(0);
  });
});

describe("function calls", () => {
  it("parses rnd with one argument", () => {
    expect(shape(parse("rnd(6)"))).toEqual(["rnd", 6]);
    expect(shape(parse("rnd(1 + 2)"))).toEqual(["rnd", ["+", 1, 2]]);
  });

  it("parses gcd with two arguments", () => {
    expect(shape(parse("gcd(12, 18)"))).toEqual(["gcd", 12, 18]);
  });

  it("refuses the wrong number of arguments", () => {
    expect(() => parse("rnd(1, 2)")).toThrow(/exactly one/);
    expect(() => parse("gcd(1)")).toThrow(/exactly two/);
  });

  it("requires the parentheses", () => {
    expect(() => parse("rnd 6")).toThrow(CualSyntaxError);
  });
});

describe("addressed variables", () => {
  // `parser.yy`'s `ort`. Evaluation is task 4.7, so these are shape assertions only.

  it("parses a relative address with no argument", () => {
    expect(shape(parse("varx@()"))).toEqual(["positioned", "varx", "global"]);
  });

  it("parses a foreign address with no argument", () => {
    expect(shape(parse("varx@@()"))).toEqual(["positioned", "varx", "semiglobal"]);
  });

  it("parses a cell address", () => {
    const expr = parse("varx@(2, 3)") as Extract<Expr, { kind: "positioned" }>;
    expect(expr.kind).toBe("positioned");
    if (expr.kind !== "positioned") throw new Error("expected a positioned variable");
    expect(expr.position.kind).toBe("feld");
    if (expr.position.kind !== "feld") throw new Error("expected a cell");
    expect(shape(expr.position.x)).toBe(2);
    expect(shape(expr.position.y)).toBe(3);
    expect(expr.position.half).toBeNull();
  });

  it("parses each half selector", () => {
    const halves = [
      ["=", "here"],
      ["!", "opposite"],
      ["<", "left"],
      [">", "right"],
    ] as const;
    for (const [spelling, expected] of halves) {
      const expr = parse(`varx@(2, 3; ${spelling})`) as Extract<Expr, { kind: "positioned" }>;
      if (expr.kind !== "positioned" || expr.position.kind !== "feld") {
        throw new Error(`expected a cell for '${spelling}'`);
      }
      expect(expr.position.half, spelling).toBe(expected);
    }
  });

  it("parses a single 0 or 1 as a falling piece", () => {
    for (const which of [0, 1]) {
      const expr = parse(`varx@@${which}`) as Extract<Expr, { kind: "positioned" }>;
      if (expr.kind !== "positioned") throw new Error("expected a positioned variable");
      expect(expr.position.kind).toBe("fall");
      if (expr.position.kind !== "fall") throw new Error("expected a falling piece");
      expect(shape(expr.position.which)).toBe(which);
    }
  });

  it("refuses a half selector that is not one of the four", () => {
    expect(() => parse("varx@(2, 3; *)")).toThrow(CualSyntaxError);
  });

  it("does not confuse an addressed variable with a comparison", () => {
    // `@` is not `*`, so an address must not be mistaken for multiplication, and a plain
    // `*` must still parse as one. Both names are multi-letter: `x * 2` would be refused
    // for the single letter long before the operator was considered.
    expect(shape(parse("varx * 2"))).toEqual(["*", "varx", 2]);
    expect(shape(parse("varx@(1, 0)"))).toEqual(["positioned", "varx", "feld"]);
  });
});

describe("half-integers", () => {
  it("rounds a half-number up, as parser.yy's halbzahl does", () => {
    // `halbzahl: HALBZAHL_TOK { $$ = $1 + 1; }` - the lexer gives the integer part and the
    // parser rounds. Only used for hex-level coordinates.
    expect(shape(parse(".5"))).toBe(1);
    expect(shape(parse("2.5"))).toBe(3);
  });
});

describe("statements parse, and did not used to", () => {
  // This block used to assert that each of these threw "task 3.5", because a stub
  // `parseCode` in `parse.ts` rejected them by name. That stub is gone - the statement parser
  // is `code.ts` - and these forms all parse. They are kept as positive assertions because
  // they are the shortest complete list of what task 3.5 promised, and if a production is
  // dropped this is the test that says so before the corpus test does.
  const statements: readonly [string, string][] = [
    ["var xc = 1;", "var"],
    ["xc = 1;", "assignment"],
    ["xc += 1;", "compound assignment"],
    ["if xc -> *;", "if"],
    ["switch { 1 -> *; };", "switch"],
    ["busy", "busy"],
    ["*", "draw command"],
    ["bonus(50);", "effect command"],
    ["default inhibit = 3;", "default"],
    ["[xc = 1] *;", "scoped block"],
    ["A, B, C;", "comma sequence"],
  ];

  for (const [source, what] of statements) {
    it(`parses ${what}`, () => {
      expect(parseCode(lex(source)), source).toHaveLength(1);
    });
  }

  it("refuses an empty block", () => {
    expect(() => parseCode(lex("   "))).toThrow(/empty/);
  });
});

describe("half specifiers", () => {
  // `absort: '(' absort_geklammert ';' haelften_spez ')'`, and `absort_geklammert` has an
  // empty alternative - so the `;` can be the first thing inside the brackets, with no
  // address in front of it at all. `@@(;!)`, `@@(;>)`, `@@(;<)` and `@@(;<=` are in
  // augen.ld, bonimali.ld, dungeon.ld, kachelnR.ld, jahreszeiten.ld and labskaus.ld.
  const cases: [string, string][] = [
    ["! ", "opposite"],
    [">", "right"],
    ["<", "left"],
    ["=", "here"],
  ];

  for (const [spec, half] of cases) {
    it(`reads a semiglobal with no address and the half specifier '${spec}'`, () => {
      expect(parse(`drehpos@@(;${spec})`)).toMatchObject({
        kind: "positioned",
        position: { kind: "semiglobal", half },
      });
    });

    it(`reads a global with no address and the half specifier '${spec}'`, () => {
      expect(parse(`drehpos@(;${spec})`)).toMatchObject({
        kind: "positioned",
        position: { kind: "global", half },
      });
    });
  }

  it("puts the half on a falling piece too, which is not a feld", () => {
    // `@@(ziel-2;!)` in augen.ld. `setzeHaelfte` is on `Ort` itself upstream, so every
    // variant carries one; with the half on `feld` alone this would not have parsed.
    expect(parse("drehpos@@(ziel-2;!)")).toMatchObject({
      kind: "positioned",
      position: { kind: "fall", half: "opposite" },
    });
  });

  it("puts the half on a feld", () => {
    // `@@(xp/2,yp/2;>)` in dungeon.ld.
    expect(parse("drehpos@@(xp/2,yp/2;>)")).toMatchObject({
      kind: "positioned",
      position: { kind: "feld", half: "right" },
    });
  });

  it("refuses a half specifier with nothing to attach it to", () => {
    expect(() => parse("drehpos@@(;)")).toThrow(CualSyntaxError);
  });

  it("leaves the half null when none is written", () => {
    expect(parse("drehpos@@()")).toMatchObject({ position: { kind: "semiglobal", half: null } });
  });
});

describe("open range bounds", () => {
  // `intervall: ausdruck BIS_TOK | BIS_TOK ausdruck | ausdruck BIS_TOK ausdruck`. Upstream
  // substitutes +/-VIEL for a missing bound *in the parser*, which is why the bound is null
  // in the tree rather than 32767.
  it("reads an open upper bound", () => {
    expect(parse("size == 4..")).toMatchObject({
      kind: "range",
      lower: { kind: "number", value: 4 },
      upper: null,
    });
  });

  it("reads an open lower bound", () => {
    expect(parse("size == .. 4")).toMatchObject({
      kind: "range",
      lower: null,
      upper: { kind: "number", value: 4 },
    });
  });

  it("decides openness by whether an expression follows, not from a list of closers", () => {
    // `size == 4.. -> 3` in darken.ld and `size == 8.. -> E` in explosive.ld. An arrow is
    // not a statement-closing token, which is why enumerating closers missed it: the `..`
    // has to be read as open whenever nothing that can start an expression follows, and an
    // arrow is such a case.
    // A comparison only reaches the parser as a `switch` case or an `if` condition; a bare
    // one at statement level is not Cual. darken.ld's shape, verbatim:
    expect(JSON.stringify(parseCode(lex("switch { size == 4.. -> 3; };")))).toContain(
      '"upper":null',
    );
    // explosive.ld's, where the body is a letter rather than a number.
    expect(parseCode(lex("switch { size == 8.. -> E; };"))).toHaveLength(1);
    // The same comparison as an `if` condition, which is the other place one appears.
    expect(JSON.stringify(parseCode(lex("if size == 4.. -> *;")))).toContain('"upper":null');
  });

  it("still reads a closed range", () => {
    expect(parse("size == 4 .. 9")).toMatchObject({
      kind: "range",
      lower: { kind: "number", value: 4 },
      upper: { kind: "number", value: 9 },
    });
  });

  it("refuses a second '..' after a finished range", () => {
    // `1 == 1 .. == 2 .. 4`. This used to be rejected only by accident - `parseUpperBound`
    // demanded an operand after the `..` and found the `==`. Letting an open upper bound be
    // genuinely open removed the accident, and without an explicit check the input built
    // `1 == (1.. == (2..4))` in silence.
    expect(() => parse("1 == 1 .. == 2 .. 4")).toThrow(/cannot be chained/);
    // The second shape is refused by `parseExpr`'s own leftover check, which is why there is
    // no separate `..`-after-a-range rule: the one below would never be reached.
    expect(() => parse("1 == 1 .. 2 .. 4")).toThrow(CualSyntaxError);
  });
});
