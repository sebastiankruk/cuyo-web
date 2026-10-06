// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The compile gate: every construct in the corpus that this runtime cannot run.
 *
 * Task 4.13 built it as a **snapshot** of the refusals, because group 4 was not finished and
 * pretending otherwise would have meant either deleting the gate or lying about it. Task 4.16
 * closed the last one, so the snapshot inverted: the claim is now that the list is **empty**, and
 * an empty list that passes for the wrong reason is the failure mode that matters from here on.
 *
 * ## What an empty list does and does not mean
 *
 * It means every construct in all 339 `<< >>` blocks has an implementation. It does not mean the
 * levels *run*: this is a static pass that asks "is there a case for this?" without a board, a
 * simulation or a picture, which is what makes it affordable over the whole corpus and also what
 * makes it weaker than playing the levels. `connectionsAt` can be implemented and still be wrong
 * about a hex column, and only 12.3 and 12.7 will catch that.
 *
 * ## Why the histogram, then
 *
 * With nothing to report, "the list is empty" is exactly what a broken walk produces. So the
 * second assertion here is a **census**: which statement and expression kinds the corpus contains
 * and how many of each. A walk that stopped descending would show a smaller census, so the
 * snapshot fails, and a level that starts using a construct nobody has looked at shows up as a
 * changed number before it can be quietly unimplemented.
 *
 * That census is also what caught the hole this file was rewritten next to. `letterDraw` — the
 * `Y@(1)*` form — has an address, and `walkExpressions` had only handled `draw`, so **3372
 * addresses across the corpus were never visited**. No neighbour pattern can appear in a
 * coordinate, so no gap was hidden and nothing failed; the walk was simply incomplete while
 * claiming to be complete. `sharedCall` had the same shape of problem for statements.
 *
 * ## The census also caught the parse
 *
 * It was short by about a fifth, and every count in it was low: `switchCase` 852 where there
 * are 1948, `call` 845 where there are 1039, `scoped` 395 where there are 441. The reason was
 * upstream of this file — `parseSwitch`'s fold handed each case the *unfolded* entry, so every
 * `switch` with three or more cases ran only its first two and the rest of the tree was never
 * built. With that fixed, all **609** neighbour tokens in the corpus reach a parsed expression,
 * against 302 before. That comparison — tokens against expressions, per block — is the check
 * that says so, and it is worth keeping: a parser that silently discards code looks exactly like
 * a runtime that never asked for it.
 *
 * ## The safety net
 *
 * A hand-built tree with a construct that is in neither table, asserted to be reported with no
 * task. That is what the old snapshot's non-triviality count was for — proving the pass can
 * still find something — stated as a property rather than as a number that happened to be
 * non-zero.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLatin1, tokenize } from "../level-format/lexer.ts";
import type { Token } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import type { Stmt } from "./code.ts";
import type { Expr } from "./expr.ts";
import {
  compileStatements,
  formatCompileError,
  walkExpressions,
  walkStatements,
} from "./compile.ts";
import type { CompileError } from "./compile.ts";

const LEVELS = resolve(import.meta.dirname, "../../levels/upstream");

interface Block {
  readonly file: string;
  /** The line the `<<` is on, which is what a level author needs to find it. */
  readonly line: number;
  readonly tokens: Token[];
}

/** Every `<< >>` block in every level, with the file and line it started on. */
function cualBlocks(): Block[] {
  const blocks: Block[] = [];
  for (const file of readdirSync(LEVELS).filter((f) => f.endsWith(".ld")).sort()) {
    const src = decodeLatin1(readFileSync(join(LEVELS, file)));
    let depth = 0;
    let startLine = 0;
    let buffer: Token[] = [];
    for (const token of tokenize(src, file)) {
      if (token.kind === "beginCode") {
        if (depth === 0) startLine = token.line;
        depth += 1;
        buffer = [];
        continue;
      }
      if (token.kind === "endCode") {
        depth -= 1;
        if (buffer.length) blocks.push({ file, line: startLine, tokens: buffer });
        buffer = [];
        continue;
      }
      if (depth > 0) buffer.push(token);
    }
  }
  return blocks;
}

const blocks = cualBlocks();
const trees = blocks.map((block) => ({ ...block, statements: parseCode(block.tokens) }));
const allErrors: CompileError[] = trees.flatMap((block) =>
  compileStatements(block.statements, { file: block.file, line: block.line }),
);

/** `file:line: construct` — the shape a diff reads. */
const signature = (error: CompileError): string =>
  `${error.file}:${error.line}: ${error.construct}`;

describe("the compile gate", () => {
  it("finds the corpus", () => {
    // A silently empty list would make every assertion below pass for the wrong reason, which is
    // the failure mode this file exists to prevent. Task 3.5 is worded "all 81 levels parse";
    // there are 82 `.ld` files here, because `summary.ld` holds the level list rather than
    // being a level, and it carries Cual of its own.
    expect(blocks).toHaveLength(339);
  });

  it("finds nothing: every construct in the corpus can run", () => {
    // The inverted claim, and the one 0.4.0 was waiting for. It was 1538 places in three
    // constructs when the gate was written; 4.14 closed the `call`s, 4.15 the `scoped` blocks
    // and 4.16 the neighbour reads.
    //
    // **Those counts were undercounts**, all three of them, because the parse was dropping code
    // above: a `switch` with three or more cases ran only its first two. The real figures are
    // 1039 `call`s, 441 `scoped` blocks and 609 neighbour reads — so the gap was larger than the
    // gate said and closed further than it said. See the header.
    //
    // **Not the same as the levels running.** See the header.
    expect(allErrors.map(signature)).toEqual([]);
  });

  it("still reports an expression it has no implementation for", () => {
    // The safety net, and the replacement for the old "more than zero gaps" count: a kind that is
    // in neither `IMPLEMENTED_EXPRESSIONS` nor `EXPRESSION_GAPS`, arriving with no task attached
    // rather than passing unnoticed. That is the direction `compile.ts` says it fails in on
    // purpose — "a newly parsed expression is a compile error until someone adds a case".
    //
    // It has to be cast, which is honest: the point is a kind *nobody has looked at*.
    const invented = { kind: "newExpr" } as unknown as Expr;
    const errors = compileStatements(
      [{ kind: "assign", target: invented, operator: "=", value: { kind: "number", value: 1 } }],
      { file: "synthetic.ld", line: 1 },
    );
    expect(errors.map((e) => e.construct)).toEqual(["newExpr"]);
    // No task, because there is not one: this is not a known gap with a plan behind it.
    expect(errors[0].task).toBeNull();
    expect(formatCompileError(errors[0])).toBe("synthetic.ld:1: newExpr (no task)");
  });

  it("does not report a statement it has no refusal for", () => {
    // **The other side of the walk, and it is not symmetric.** `notYetTask` is a *refusal* table,
    // so a statement kind that is not in it reads as implemented — there is no way to tell "done"
    // from "not looked at" without an implemented-list, and building one is a change to 4.13's
    // mechanism rather than part of 4.16.
    //
    // What covers the statement side today is the census below for a construct the corpus uses,
    // and the *type* for one it does not: `runStatement`'s `default: return notYet(node.kind)`
    // is not exhaustiveness-checked, so a new `Stmt` kind compiles and passes this gate, and is
    // caught the first time a level runs one — by a walker that throws "task ?" rather than by
    // the build. Recorded here so the gap is a decision rather than an oversight.
    expect(compileStatements([{ kind: "newKind" } as unknown as Stmt], { file: "s.ld", line: 1 })).toEqual(
      [],
    );
  });

  it("keeps descending past a statement it is happy with", () => {
    // Nesting matters because the walk has to keep going past a node it understands: a walk that
    // stopped at the first statement it could handle would report one gap per *level* rather
    // than one per gap, and the total would still look like a number.
    //
    // An `if` whose condition nobody has looked at, and a `scoped` block nested inside its body.
    const invented = { kind: "newExpr" } as unknown as Expr;
    const tree: Stmt[] = [
      {
        kind: "if",
        condition: invented,
        then: {
          kind: "scoped",
          variable: "xx",
          value: { kind: "number", value: 1 },
          body: { kind: "busy" },
        },
        otherwise: null,
        latching: false,
        elseLatching: null,
      },
    ];
    const errors = compileStatements(tree, { file: "synthetic.ld", line: 1 });
    // Found through the `if`, and *not* twice: `walkExpressions` reaches a condition once and
    // `walkStatements` does not look at expressions at all.
    expect(errors.map((e) => e.construct)).toEqual(["newExpr"]);
    // A neighbour pattern is the six-or-eight-character token itself, `1???0???` — not the word
    // `verbindetMit`, which is an ordinary variable name — and it reaches the compiler through
    // the *expression* walk, so it is counted as an expression and not as a statement.
    const patterns = [...walkExpressions(parseCode(tokenize("[xx = 1???0???] *", "s").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode")))];
    expect(patterns.map((e) => (e.kind === "neighbour" ? e.pattern : e.kind))).toContain(
      "1???0???",
    );
  });

  it("counts what the corpus contains, so an empty report cannot mean a stopped walk", () => {
    // The census. This is the assertion that keeps the empty list honest: every statement kind
    // the corpus uses, with its count, and every expression kind.
    //
    // **A walk that stopped descending would shrink these numbers** and fail the snapshot, which
    // is the point — "no gaps" and "did not look" are otherwise the same observation.
    const statementCounts = new Map<string, number>();
    for (const tree of trees) {
      for (const node of walkStatements(tree.statements)) {
        statementCounts.set(node.kind, (statementCounts.get(node.kind) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries([...statementCounts.entries()].sort())).toMatchInlineSnapshot(`
      {
        "assign": 5436,
        "block": 2694,
        "busy": 1,
        "call": 1039,
        "commaSequence": 1763,
        "defaultDecl": 18,
        "draw": 1083,
        "effect": 56,
        "if": 1505,
        "letterDraw": 3029,
        "nothing": 321,
        "number": 514,
        "procedureDef": 835,
        "scoped": 441,
        "sequence": 2032,
        "switch": 605,
        "switchCase": 1948,
        "varDecl": 235,
      }
    `);

    const expressionCounts = new Map<string, number>();
    for (const tree of trees) {
      for (const expr of walkExpressions(tree.statements)) {
        expressionCounts.set(expr.kind, (expressionCounts.get(expr.kind) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries([...expressionCounts.entries()].sort())).toMatchInlineSnapshot(`
      {
        "binary": 6780,
        "call": 127,
        "neighbour": 609,
        "number": 13355,
        "positioned": 4422,
        "range": 135,
        "unary": 2749,
        "variable": 11043,
      }
    `);
  });

  it("reaches every statement once, through nesting", () => {
    // The traversal claim, on a hand-built tree rather than a corpus block — a block's line is
    // the line of its opening `<<`, so two `if`s in one block legitimately produce two
    // identical `file:line: construct` triples and "no duplicates" is not a true property of
    // the corpus.
    //
    // A `switch` holds its head case as a statement and the rest of the list hangs off each
    // case's `otherwise` as further cases, so a walk that descended into both the switch's
    // `case` and the case's own `otherwise` would visit every case twice.
    const leaf = (kind: "number"): Stmt => ({ kind, value: 7 });
    const innerCase: Stmt = {
      kind: "switchCase",
      condition: { kind: "number", value: 2 },
      body: leaf("number"),
      latching: false,
      otherwise: null,
      otherwiseLatching: false,
    };
    const headCase: Stmt = {
      kind: "switchCase",
      condition: { kind: "number", value: 1 },
      body: leaf("number"),
      latching: false,
      otherwise: innerCase,
      otherwiseLatching: false,
    };
    const tree: Stmt[] = [
      {
        kind: "switch",
        case: headCase,
      },
      {
        kind: "sequence",
        body: [{ kind: "commaSequence", parts: [leaf("number"), leaf("number")] }],
      },
    ];
    const kinds = [...walkStatements(tree)].map((node) => node.kind);
    expect(kinds.filter((k) => k === "switchCase")).toHaveLength(2);
    expect(kinds.filter((k) => k === "number")).toHaveLength(4);
    // And nothing is visited twice, which is the claim the counts imply.
    expect(kinds).toHaveLength(new Set(kinds.map((k, i) => `${k}#${i}`)).size);
  });

  it("descends into a shared call's body, which is where the code is", () => {
    // `&name` holds a *body*, and 4.14 introduced the node without teaching the walk about it.
    // The gate runs on parsed trees, where a call is still a `call` and no `sharedCall` exists —
    // so nothing failed, and the census above cannot see it either. Asserted on a hand-built
    // tree, which is the only place it can be seen.
    //
    // A `neighbour` inside a shared body, so the assertion is about reaching *and* reporting
    // rather than about a count.
    const shared: Stmt = {
      kind: "sharedCall",
      name: "anim",
      body: [
        {
          kind: "commaSequence",
          parts: [
            { kind: "number", value: 1 },
            { kind: "number", value: 2 },
          ],
        },
      ],
    };
    expect([...walkStatements([shared])].map((n) => n.kind)).toEqual([
      "sharedCall",
      "commaSequence",
      "number",
      "number",
    ]);
    // And it compiles clean, because everything in it is implemented.
    expect(compileStatements([shared], { file: "s.ld", line: 1 })).toEqual([]);
  });

  it("reaches the address in a lettered draw, which is a third of every address", () => {
    // `Y@(1)*` is a `letterDraw` with an `Ort`, and `walkExpressions` handled only `draw`. The
    // corpus has 3372 of these, so they were all skipped — no *gap* hidden, because a coordinate
    // cannot contain a neighbour pattern, but the walk was incomplete while claiming otherwise.
    //
    // The number is the census's `positioned` count, which is what this is really about: if the
    // address of a lettered draw stops being walked, that count drops.
    const lettered: Stmt = {
      kind: "letterDraw",
      letter: 24,
      position: {
        kind: "feld",
        x: { kind: "number", value: 1 },
        y: { kind: "variable", name: "ll" },
        half: null,
        relative: true,
      },
    };
    expect([...walkExpressions([lettered])].map((e) => e.kind)).toEqual([
      "number",
      "variable",
    ]);
    expect(compileStatements([lettered], { file: "s.ld", line: 1 })).toEqual([]);
  });

  it("counts a neighbour pattern as an expression, and not as a statement", () => {
    // The pattern is 298 of the corpus's expressions and none of its statements, and 4.16 closed
    // the entry in `IMPLEMENTED_EXPRESSIONS` — so the two walks really are different lists, and
    // counting it twice would hide that.
    const only: Expr = { kind: "neighbour", pattern: "0??0??0?" };
    expect(compileStatements([], { file: "s.ld", line: 1 })).toEqual([]);
    expect(only.kind).toBe("neighbour");
  });
});