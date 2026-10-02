/**
 * Tests for the Cual statement parser.
 *
 * Grouped by construct, because a failure should name what is wrong rather than a line.
 *
 * Two of these are about shapes that are *not* what they look like:
 *
 *  - `;` and `,` build different node kinds. `;` runs everything now; `,` runs one member per
 *    step, which is the animation mechanism, and mixing them up animates a level instantly
 *    or never. Both silently.
 *  - `->` and `=>` are the same token with a value, and that value decides whether a
 *    condition re-tests every step or latches. A parser that kept only the direction would
 *    produce a tree that runs and computes the wrong thing.
 */

import { describe, expect, it } from "vitest";
import { tokenize } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import type { Stmt } from "./code.ts";

/** Lex and parse a whole block's contents. */
function parse(source: string): Stmt[] {
  const tokens = tokenize(source, "test.ld").filter(
    (t) => t.kind !== "beginCode" && t.kind !== "endCode",
  );
  return parseCode(tokens);
}

/** Parse one statement, which is what almost every case wants. */
function one(source: string): Stmt {
  const all = parse(source);
  expect(all.length, `"${source}" produced ${all.length} statements`).toBe(1);
  return all[0]!;
}

describe("sequences and grouping", () => {
  it("builds a sequence for ';', in order", () => {
    const stmt = one("busy; busy; busy");
    expect(stmt.kind).toBe("sequence");
    if (stmt.kind !== "sequence") throw new Error("expected a sequence");
    expect(stmt.body).toHaveLength(3);
  });

  it("builds a comma sequence for ',', as a separate kind", () => {
    // The distinction that matters: `,` runs one member per step.
    const stmt = one("busy, busy, busy");
    expect(stmt.kind).toBe("commaSequence");
    if (stmt.kind !== "commaSequence") throw new Error("expected a comma sequence");
    expect(stmt.parts).toHaveLength(3);
  });

  it("binds ',' tighter than ';', so the sequence groups as a ; b, c", () => {
    // `code_1 ',' code_1` binds tighter than `code_1 ';' code`, so the comma belongs to `b`.
    // Collected at the ';' level instead, it would group as `(a ; b) , c` and run the last
    // member on the same step as the first two.
    const stmt = one("busy; busy, busy");
    expect(stmt.kind).toBe("sequence");
    if (stmt.kind !== "sequence") throw new Error("expected a sequence");
    expect(stmt.body[1]?.kind).toBe("commaSequence");
  });

  it("accepts an empty block, because code_1 may be empty", () => {
    const stmt = one("{ }");
    expect(stmt.kind).toBe("block");
    if (stmt.kind !== "block") throw new Error("expected a block");
    expect(stmt.body).toHaveLength(1);
    expect(stmt.body[0]?.kind).toBe("nothing");
  });

  it("accepts a trailing ';'", () => {
    expect(one("busy;").kind).toBe("busy");
  });

  it("accepts commas around empty members", () => {
    // `{ } , { }` is a comma sequence of two empty blocks, not a block - the commas bind
    // tighter than the braces do not appear to.
    expect(one("{ } , { }").kind).toBe("commaSequence");
  });
});

describe("if and else", () => {
  it("records which arrow the if used", () => {
    for (const [source, latching] of [
      ["if busy_num -> busy", false],
      ["if busy_num => busy", true],
    ] as const) {
      const stmt = one(source);
      if (stmt.kind !== "if") throw new Error("expected an if");
      expect(stmt.latching, source).toBe(latching);
    }
  });

  it("records the else body and the else arrow separately", () => {
    // Upstream accepts an arrow after `else` deliberately - "you probably don't want one when
    // an if follows immediately" - and folds it into the same node.
    const withArrow = one("if busy_num -> busy else -> busy");
    if (withArrow.kind !== "if") throw new Error("expected an if");
    expect(withArrow.otherwise?.kind).toBe("busy");
    expect(withArrow.elseLatching).toBe(false);
    expect(one("if busy_num => busy else => busy").kind).toBe("if");
  });

  it("leaves otherwise and elseLatching null when there is no else", () => {
    const stmt = one("if busy_num -> busy");
    if (stmt.kind !== "if") throw new Error("expected an if");
    expect(stmt.otherwise).toBeNull();
    expect(stmt.elseLatching).toBeNull();
  });

  it("attaches a bare else to the innermost if", () => {
    // Bison resolves the dangling else by precedence; a hand-written parser that recursed
    // the same way gets this for free, and one that did not would silently re-parent it.
    const stmt = one("if busy2 -> if busy_num -> busy else busy");
    if (stmt.kind !== "if") throw new Error("expected an if");
    expect(stmt.then.kind).toBe("if");
    if (stmt.then.kind !== "if") throw new Error("expected a nested if");
    expect(stmt.then.otherwise).not.toBeNull();
  });
});

describe("switch", () => {
  it("collects the cases in order", () => {
    const stmt = one("switch { busy_num -> busy; busy_num -> busy; }");
    if (stmt.kind !== "switch") throw new Error("expected a switch");
    expect(stmt.cases).toHaveLength(2);
  });

  it("records each case's arrow", () => {
    const stmt = one("switch { busy_num -> busy; busy_num => busy; }");
    if (stmt.kind !== "switch") throw new Error("expected a switch");
    expect(stmt.cases.map((c) => c.latching)).toEqual([false, true]);
  });

  it("refuses a switch with no cases", () => {
    expect(() => parse("switch { }")).toThrow(/at least one case/);
  });
});

describe("assignments", () => {
  const operators = ["=", "+=", "-=", "*=", "/=", "%=", ".+=", ".-="];

  for (const operator of operators) {
    it(`accepts '${operator}'`, () => {
      const stmt = one(`zaehler ${operator} 2`);
      expect(stmt.kind).toBe("assign");
      if (stmt.kind !== "assign") throw new Error("expected an assignment");
      expect(stmt.operator).toBe(operator);
    });
  }

  it("keeps the target and the value apart", () => {
    const stmt = one("zaehler = 1 + 2");
    if (stmt.kind !== "assign") throw new Error("expected an assignment");
    expect(stmt.target).toEqual({ kind: "variable", name: "zaehler" });
    expect(stmt.value).toEqual({
      kind: "binary",
      op: "+",
      left: { kind: "number", value: 1 },
      right: { kind: "number", value: 2 },
    });
  });

  it("does not treat a bare name as an assignment", () => {
    // A procedure call and an assignment both start with a word; only the operator decides.
    expect(one("zeichne").kind).toBe("call");
  });

  it("records a plain call as sharing the definition", () => {
    const stmt = one("zeichne");
    if (stmt.kind !== "call") throw new Error("expected a call");
    expect(stmt.name).toBe("zeichne");
    expect(stmt.sharesDefinition).toBe(false);
  });

  it("records '&name' as not copying the definition", () => {
    // `& punktwort` is `weiterleit_code`: a call that shares rather than copies.
    const stmt = one("&zeichne");
    if (stmt.kind !== "call") throw new Error("expected a call");
    expect(stmt.sharesDefinition).toBe(true);
  });
});

describe("declarations", () => {
  it("parses var with no initial value", () => {
    const stmt = one("var zaehler;");
    if (stmt.kind !== "varDecl") throw new Error("expected a var declaration");
    expect(stmt.declarations).toEqual([
      { name: "zaehler", versions: [], initial: null, reapply: false },
    ]);
  });

  it("parses several names in one var", () => {
    // Multi-letter names: a single letter is lexed as the letter shorthand and refused as a
    // variable, which is upstream's own rule rather than this parser's.
    const stmt = one("var aa, bb, cc;");
    if (stmt.kind !== "varDecl") throw new Error("expected a var declaration");
    expect(stmt.declarations.map((d) => d.name)).toEqual(["aa", "bb", "cc"]);
  });

  it("parses an initial value", () => {
    // `var_def` ends in `unechter_default`, which is either nothing or `= value`, so
    // `var x = 4` is one declaration and not two statements. 36 blocks in the corpus do this.
    const stmt = one("var zaehler = 4;");
    if (stmt.kind !== "varDecl") throw new Error("expected a var declaration");
    expect(stmt.declarations[0]?.initial).toEqual({ kind: "number", value: 4 });
  });

  it("parses version specifiers", () => {
    const stmt = one("var zaehler[2];");
    if (stmt.kind !== "varDecl") throw new Error("expected a var declaration");
    expect(stmt.declarations[0]?.versions).toEqual(["2"]);
  });

  it("parses default with a value", () => {
    const stmt = one("default zaehler = 3;");
    if (stmt.kind !== "defaultDecl") throw new Error("expected a default declaration");
    expect(stmt.declarations[0]?.value).toEqual({ kind: "number", value: 3 });
    expect(stmt.declarations[0]?.reapply).toBe(false);
  });

  it("parses ': reapply' without eating it as the probabilistic operator", () => {
    // `:` in a default declaration introduces a keyword, it is not `a : b`. Parsed at the
    // loosest level, the expression parser tries to read `reapply` as an operand and fails
    // with a message about a keyword where the reader expected a declaration. 14 blocks.
    const stmt = one("default zaehler = 0 : reapply;");
    if (stmt.kind !== "defaultDecl") throw new Error("expected a default declaration");
    expect(stmt.declarations[0]?.value).toEqual({ kind: "number", value: 0 });
    expect(stmt.declarations[0]?.reapply).toBe(true);
  });

  it("parses a procedure definition", () => {
    const stmt = one("Zeichne = { busy; busy };");
    if (stmt.kind !== "procedureDef") throw new Error("expected a procedure definition");
    expect(stmt.name).toBe("Zeichne");
    expect(stmt.body.kind).toBe("block");
  });

  it("parses a versioned procedure definition", () => {
    // `werbung[easy] = { ... }` - the token after the name is punctuation, which an earlier
    // version used as a reason to skip the definition probe entirely.
    const stmt = one("Werbung[easy] = { busy; busy };");
    if (stmt.kind !== "procedureDef") throw new Error("expected a procedure definition");
    expect(stmt.versions).toEqual(["easy"]);
  });

  it("parses a dotted procedure name", () => {
    const stmt = one("Gras.init = busy;");
    if (stmt.kind !== "procedureDef") throw new Error("expected a procedure definition");
    expect(stmt.name).toBe("Gras.init");
  });

  it("parses include", () => {
    const stmt = one('include "shared.ld";');
    if (stmt.kind !== "include") throw new Error("expected an include");
    expect(stmt.name).toBe("shared.ld");
  });
});

describe("scoped blocks", () => {
  it("parses [x = e] body", () => {
    const stmt = one("[drehpos = 1] busy");
    if (stmt.kind !== "scoped") throw new Error("expected a scoped block");
    expect(stmt.variable).toBe("drehpos");
    expect(stmt.value).toEqual({ kind: "number", value: 1 });
    expect(stmt.body.kind).toBe("busy");
  });
});

describe("draw commands", () => {
  it("parses a bare '*'", () => {
    const stmt = one("*");
    if (stmt.kind !== "draw") throw new Error("expected a draw");
    expect(stmt.position).toBeNull();
  });

  it("parses '*@(x,y)' and '@(x,y)*'", () => {
    const after = one("*@(1, 2)");
    const before = one("@(1, 2)*");
    for (const stmt of [after, before]) {
      if (stmt.kind !== "draw") throw new Error("expected a draw");
      expect(stmt.position?.kind).toBe("feld");
    }
  });

  it("parses a bare letter, and one with a position", () => {
    const bare = one("A");
    if (bare.kind !== "letterDraw") throw new Error("expected a letter draw");
    expect(bare.letter).toBe(0);
    expect(bare.position).toBeNull();
    // `stern_at: '*' | '*' ort | ort '*'` - so a position after a letter is *always* closed
    // by a `*`, in either order. `A@(1, 2)` on its own is not in the language: the third
    // alternative is `ort '*'`, and dropping the star would make `A@(1,2)@(-1,0)` ambiguous
    // with two draws in a row. `Y@(1)*` is 3d.ld's spelling.
    const placed = one("A@(1, 2)*");
    if (placed.kind !== "letterDraw") throw new Error("expected a letter draw");
    expect(placed.position?.kind).toBe("feld");
    expect(() => one("A@(1, 2)")).toThrow(/expected '\*'/);
  });

  it("parses 'zahl buch_stern' as a two-statement sequence", () => {
    // `code_1: zahl buch_stern` builds `stapel_code(zahl, buch_stern)`, so the number stands
    // alone and means nothing. Written `2R*` in schemen.ld.
    const stmt = one("2 R *;");
    expect(stmt?.kind).toBe("sequence");
    if (stmt?.kind !== "sequence") throw new Error("expected a sequence");
    // The star belongs to the letter: `R` already means "draw R", so `R*` is the same
    // thing, and the second part is a letterDraw rather than a bare draw.
    expect(stmt.body.map((s) => s.kind)).toEqual(["number", "letterDraw"]);
  });

  it("parses a bare '@' as a global address", () => {
    // `pos = drehpos@;` in baelle.ld writes the address with no parentheses at all, and
    // `_klammerfrei` admits the empty form.
    const stmt = one("pos = drehpos@");
    if (stmt.kind !== "assign") throw new Error("expected an assignment");
    expect(stmt.value).toEqual({
      kind: "positioned",
      name: "drehpos",
      position: { kind: "global" },
    });
  });
});

describe("effect commands", () => {
  it("parses bonus with an expression", () => {
    const stmt = one("bonus(50)");
    if (stmt.kind !== "effect") throw new Error("expected an effect");
    expect(stmt.name).toBe("bonus");
    expect(stmt.argument).toEqual({ kind: "number", value: 50 });
  });

  it("parses message and sound with a file name", () => {
    for (const name of ["message", "sound"]) {
      const stmt = one(`${name}("klang.wav")`);
      if (stmt.kind !== "effect") throw new Error("expected an effect");
      expect(stmt.filename).toBe("klang.wav");
      expect(stmt.argument).toBeNull();
    }
  });

  it("parses lose and explode with no argument", () => {
    for (const name of ["lose", "explode"]) {
      const stmt = one(name);
      if (stmt.kind !== "effect") throw new Error("expected an effect");
      expect(stmt.name).toBe(name);
      expect(stmt.argument).toBeNull();
    }
  });
});
