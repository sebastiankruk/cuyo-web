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

  it("builds a comma sequence for ',', as a separate kind, nested to the left", () => {
    // The distinction that matters: `,` runs one member per step.
    //
    // And `a, b, c` is `folge_code(folge_code(a, b), c)` - binary, nested left - because
    // `code_1: code_1 ',' code_1` is. Each of those is a node with a busy flag, so three
    // members need *two* slots. Collected flat it needed one, and nothing about parsing or
    // walking complained: of the 250 comma sequences in the corpus only 48 have two
    // members, one has 114, and every flag after the first was wrong.
    const stmt = one("busy, busy, busy");
    expect(stmt.kind).toBe("commaSequence");
    if (stmt.kind !== "commaSequence") throw new Error("expected a comma sequence");
    expect(stmt.parts).toHaveLength(2);
    const [outer, second] = stmt.parts;
    expect(second.kind).toBe("busy");
    if (outer.kind !== "commaSequence") throw new Error("expected the left member to nest");
    expect(outer.parts).toHaveLength(2);
    expect(outer.parts[1].kind).toBe("busy");
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
  /** The cases of a switch, following the `otherwise` chain from the head. */
  function casesOf(stmt: ReturnType<typeof one>) {
    if (stmt.kind !== "switch") throw new Error("expected a switch");
    const found: (typeof stmt)["case"][] = [];
    let entry: typeof stmt["case"] | null = stmt.case;
    while (entry) {
      found.push(entry);
      entry = entry.otherwise && entry.otherwise.kind === "switchCase" ? entry.otherwise : null;
    }
    return found;
  }

  it("chains the cases through `otherwise`, in the order written", () => {
    // `ausdruck PFEIL code_1 ';' auswahl_liste` puts the rest of the list in the case's
    // `mF3`, so the list is a right-nested chain rather than a flat array. Flat, every case's
    // condition would be evaluated on every step - which for `switch { 1:5 -> a; 1:5 -> b; }`
    // draws two randoms where upstream draws one.
    const stmt = one("switch { busy_num -> busy; busy_num -> busy; }");
    const cases = casesOf(stmt);
    expect(cases).toHaveLength(2);
    // The first case's `mF3` is the second case, and the last case's is nothing - the `nop_code`
    // upstream puts there for the one-arrow shape.
    expect(stmt.kind === "switch" && stmt.case.otherwise?.kind).toBe("switchCase");
    expect(cases[1].otherwise).toBeNull();
  });

  it("records each case's arrow", () => {
    const stmt = one("switch { busy_num -> busy; busy_num => busy; }");
    expect(casesOf(stmt).map((c) => c.latching)).toEqual([false, true]);
  });

  it("keeps an explicit default instead of chaining past it", () => {
    // `-> body` after a case is the second shape's second body and ends the list, so nothing
    // is chained into it.
    const stmt = one("switch { busy_num -> busy; -> 5; }");
    const cases = casesOf(stmt);
    expect(cases).toHaveLength(1);
    expect(stmt.kind === "switch" && stmt.case.otherwise?.kind).toBe("number");
  });

  it("refuses a case after an explicit default rather than dropping it", () => {
    // `auswahl_liste` cannot continue after the two-arrow shape, so this is not valid Cual.
    // Silently discarding the second case would give a switch that quietly ignores a case.
    expect(() => parse("switch { busy_num -> busy; -> 5; busy_num -> busy; }")).toThrow(
      /ends the switch/,
    );
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

describe("where a definition is recognised", () => {
  // Task 4.17, which recorded a gap here. There is not one, and these are the measurements that
  // say so — the task is closed against them rather than deleted, because "we checked and it
  // works" is worth more than "we stopped thinking about it".
  //
  // Upstream's rule is `code_modus: code_modus code_zeile`, where a `code_zeile` is a procedure
  // definition, a `var` line or a `default` line — and nothing else. So a definition is a zeile
  // *wherever* it falls in the list, which is what `parseCodeLine` does: it probes for one at
  // every statement boundary in the block.
  it("recognises a definition at any zeile boundary", () => {
    // The shapes that must work, and do. Two in a row is the one 4.17 named as broken, and it was
    // never broken — the test that said so used `a` as the name, which upstream refuses.
    const cases: [string, string[]][] = [
      ["tor_1 = { xx += 1 };", ["tor_1"]],
      ["var xx; tor_1 = { xx += 1 };", ["tor_1"]],
      ["default xx = 1; tor_1 = { xx += 1 };", ["tor_1"]],
      ["var xx; aa = { xx += 1 }; tor_1 = { xx += 1 };", ["aa", "tor_1"]],
      [
        "var xx; aa = { xx += 1 }; bb = { xx += 2 }; cc = { xx += 3 };",
        ["aa", "bb", "cc"],
      ],
    ];
    for (const [source, names] of cases) {
      const stmts = parse(source);
      expect(
        stmts.filter((s) => s.kind === "procedureDef").map((s) => s.name),
        source,
      ).toEqual(names);
    }
  });

  it("refuses a single-letter name by name, at all four sites", () => {
    // `var_def_wort` and `proc_def_wort` each have a `BUCHSTABE_TOK` production whose only action
    // is to throw, and `lokale_variable` has a third. The *use* site already said so; the three
    // declaration sites did not, and `x = { .. }` was refused as "cannot start a statement here",
    // which is true and useless — the thing written is a procedure one letter long.
    expect(() => parse("var x;")).toThrow(/Variable names can't be single letters/);
    expect(() => parse("default x = 3;")).toThrow(/Variable names can't be single letters/);
    expect(() => parse("xx += x;")).toThrow(/Variable names can't be single letters/);
    expect(() => parse("x = { xx += 1 };")).toThrow(/Procedure names can't be single letters/);
    // And a scoped block's name is a `lokale_variable` too.
    expect(() => parse("var xx; [x = 1] busy")).toThrow(
      /Variable names can't be single letters/,
    );
  });

  it("refuses the three shapes 4.17 named, and upstream refuses them too", () => {
    // Each is a correct refusal, for a reason upstream's grammar gives as well — which is the
    // whole finding. None of them is a `code_zeile` upstream either.
    //
    // A definition after a call: `tor_1;` at the top of a `<< >>` is not a zeile, so upstream
    // rejects the *call*. Ours gets as far as the `=` and finds a `{` where an expression belongs.
    expect(() => parse("var xx; tor_1; tor_1 = { xx += 1 };")).toThrow();
    // A definition inside a block: `'{' code '}'` is a `code`, and a `code` holds no zeilen.
    expect(() => parse("var xx; if 7 -> { tor_1 = { xx += 1 }; }")).toThrow();
    // A definition after an ordinary statement, for the same reason as the call.
    expect(() => parse("var xx; xx += 1; tor_1 = { xx += 1 };")).toThrow();
  });

  it("still links one definition per block, which is every level's shape", () => {
    // Upstream's convention, and the reason the refusals above cost nothing: a `<< >>` block
    // holds **one** definition. `anim = {1; A,B,C,D; *};` is its own block, and the level's
    // `var`s are in another. The corpus census has 835 `procedureDef`s over 339 blocks, which is
    // the two-and-a-bit per block that "mostly one, sometimes two" produces.
    const statements = parse("var xx; anim = { xx += 1 }; xx += 1;");
    expect(statements.map((s) => s.kind)).toEqual(["varDecl", "procedureDef", "assign"]);
  });
});

describe("a switch's case list", () => {
  /** Every case in a `switch`, head first, as its condition's literal value. */
  function chain(source: string): number[] {
    const stmt = one(source);
    if (stmt.kind !== "switch") throw new Error("expected a switch");
    const out: number[] = [];
    for (let c: Stmt | null = stmt.case; c; c = c.kind === "switchCase" ? c.otherwise : null) {
      if (c.kind !== "switchCase") break;
      const condition = c.condition as { kind: string; value: unknown };
      if (condition.kind !== "number") throw new Error(`expected a literal, got ${condition.kind}`);
      out.push(condition.value as number);
    }
    return out;
  }

  it("chains every case, not only the first two", () => {
    // **This is the assertion that would have caught it.** `parseSwitch` folds the flat list
    // right, and each case's `otherwise` is the *next* case — so the case before it has to
    // receive an already-folded entry. It received the raw one, whose `otherwise` was null, and
    // the chain dead-ended after one link. Every `switch` in the corpus with three or more cases
    // ran only its first two: `globals.ld`'s 33 variant schemas lost fourteen of `schema16`'s
    // sixteen faces, and 298 of the corpus's 609 neighbour patterns with them.
    //
    // Six cases, because a bug that loses the third is invisible at two.
    expect(chain("switch { 1 -> a; 2 -> b; 3 -> c; 4 -> d; 5 -> e; 6 -> f; }")).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    // The same shape at two, which is where it used to stop.
    expect(chain("switch { 1 -> a; 2 -> b; }")).toEqual([1, 2]);
  });

  it("chains the cases *before* a default, so the default is reachable", () => {
    // `ausdruck PFEIL code_1 ';' PFEIL code_1 ';'` — the two-arrow shape is the default, and it
    // is the *last* case that holds it. The cases before it must still reach it, which is the
    // other half of the same fold: a case with a default used to `continue` without becoming
    // `next`, so the case in front of it got `otherwise: null` and the default branch was
    // unreachable from a two-case switch.
    expect(chain("switch { 1 -> a; 2 -> b; => c; }")).toEqual([1, 2]);
    expect(chain("switch { 1 -> a; 2 -> b; 3 -> c; => d; }")).toEqual([1, 2, 3]);
    // One case and a default: nothing to chain, and both survive.
    expect(chain("switch { 1 -> a; => c; }")).toEqual([1]);
  });

  it("keeps an explicit default rather than the case after it", () => {
    // The chain and the default are the same slot, so the default wins — and the case that would
    // have gone there is a case that follows a default, which `auswahl_liste` forbids and which
    // `parseSwitch` refuses by name.
    const stmt = one("switch { 1 -> a; => *; }");
    if (stmt.kind !== "switch") throw new Error("expected a switch");
    expect(stmt.case.otherwise?.kind).toBe("draw");
    expect(() => one("switch { 1 -> a; => *; 2 -> b; }")).toThrow(/ends the switch/);
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
      position: { kind: "global", half: null },
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
