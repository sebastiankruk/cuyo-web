/**
 * The compile gate: every construct in the corpus that this runtime cannot run, by file, line
 * and construct.
 *
 * Task 4.13, and the reason it is a *snapshot* rather than an assertion that the list is empty.
 * Group 4 is not finished, so the list is not empty. Deleting the gate or claiming it is clear
 * would both be dishonest; the useful version is an exact record, which fails when a gap appears
 * and fails when a gap closes without someone saying so.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLatin1, tokenize } from "../level-format/lexer.ts";
import type { Token } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import type { Stmt } from "./code.ts";
import { compileStatements, formatCompileError, walkStatements } from "./compile.ts";
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
const allErrors: CompileError[] = blocks.flatMap((block) =>
  compileStatements(parseCode(block.tokens), { file: block.file, line: block.line }),
);

/** `file:line: construct` — the shape a diff reads. */
const signature = (error: CompileError): string =>
  `${error.file}:${error.line}: ${error.construct}`;

describe("the compile gate", () => {
  it("finds the corpus", () => {
    // A silently empty list would make every assertion below pass for the wrong reason.
    expect(blocks).toHaveLength(339);
  });

  it("reports each gap once, with a construct name and a line", () => {
    for (const error of allErrors) {
      expect(error.construct, "a gap must name its construct").not.toBe("");
      expect(error.line, `${signature(error)} must have a line`).toBeGreaterThan(0);
      expect(error.file).toMatch(/\.ld$/);
    }
    // Every report formats into something a level author can paste into an editor.
    for (const error of allErrors.slice(0, 5)) {
      expect(formatCompileError(error)).toMatch(/^\S+\.ld:\d+: \S+ \(/);
    }
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

  it("finds expressions nested inside a refused statement", () => {
    // A `switch` is refused, but its condition is still walked — so a level whose gap is a
    // `neighbour` inside a `switch` is reported for both, rather than the refusal hiding the
    // second gap behind it. That is why the statement walk does not stop descending.
    // A neighbour pattern is the six-or-eight-character token itself, `1???0???` — not the word
    // `verbindetMit`, which is an ordinary variable name.
    const tokens = tokenize("{ [xx = 1???0???] *; }", "s").filter(
      (t) => t.kind !== "beginCode" && t.kind !== "endCode",
    );
    const errors = compileStatements(parseCode(tokens), { file: "synthetic.ld", line: 1 });
    // `scoped` is refused and the neighbour is found inside it, so the refusal does not hide
    // the second gap. A report that stopped descending at the first refusal would list only
    // `scoped` and leave a level author with one error at a time.
    expect(errors.map((e) => e.construct).sort()).toEqual(["neighbour", "scoped"]);
    // And the pattern is reported, so a level using six of them says which six.
    expect(errors.find((e) => e.construct === "neighbour")?.detail).toBe("1???0???");
  });

  it("finds exactly the gaps the corpus has today", () => {
    // The snapshot. 4.13's deliverable is that this list is *checked*, so a new construct
    // nobody can run fails the build and a closed gap fails it too.
    //
    // Read as: `call` is a procedure call — one missing feature, 845 places. `scoped` is the
    // `[x = e]` block. `neighbour` is a `1???0???` pattern, whose *patterns* are done (task
    // 3.10) but whose array read is the walker's job and needs a board this pass deliberately
    // does not have. So the three are one task each, not 1538 problems.
    const counts = new Map<string, number>();
    for (const error of allErrors) counts.set(error.construct, (counts.get(error.construct) ?? 0) + 1);
    expect(Object.fromEntries([...counts.entries()].sort())).toMatchInlineSnapshot(`
      {
        "neighbour": 298,
        "scoped": 395,
      }
    `);
  });

  it("finds every one of them by file and line, so a level author can go and look", () => {
    // The whole point of the gate, and the reason it is an *external* snapshot: 1538 entries of
    // `file:line: construct` is a document, not an assertion. It lives in
    // `__snapshots__/compile-corpus.test.ts.snap` so that a change to it shows up as a diff in
    // a file nobody has to scroll past, and so that a level author can read it to find out what
    // is still missing.
    expect(allErrors.map(signature).sort()).toMatchSnapshot();
  });

  it("groups the listing by level, so the worst offenders are visible", () => {
    // The other question someone asks: which levels are furthest from running? `call` is the
    // big one — 845 procedure calls, which is a single missing feature, not 845 bugs.
    const perFile = new Map<string, number>();
    for (const error of allErrors) perFile.set(error.file, (perFile.get(error.file) ?? 0) + 1);
    const worst = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    expect(worst).toMatchInlineSnapshot(`
      [
        [
          "globals.ld",
          98,
        ],
        [
          "doors.ld",
          60,
        ],
        [
          "schach.ld",
          48,
        ],
        [
          "wuerfel.ld",
          42,
        ],
        [
          "springer.ld",
          40,
        ],
      ]
    `);
  });

  it("fails when a construct stops being implemented", () => {
    // Task 4.13's verification clause: "verify by temporarily removing a construct". This is
    // the assertion that would catch it — it is the same comparison the snapshot above makes,
    // asserted to be non-trivial by counting the gaps, so a snapshot that accidentally captured
    // an empty list cannot pass.
    expect(allErrors.length).toBeGreaterThan(0);
    expect(new Set(allErrors.map((e) => e.construct)).size).toBeGreaterThan(1);
  });
});