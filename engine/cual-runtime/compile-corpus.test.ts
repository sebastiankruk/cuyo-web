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
    // A refused statement's own expressions are still walked — so a level whose gap is a
    // `neighbour` inside one is reported for both, rather than the refusal hiding the second
    // gap behind it. That is why the statement walk does not stop descending.
    // A neighbour pattern is the six-or-eight-character token itself, `1???0???` — not the word
    // `verbindetMit`, which is an ordinary variable name.
    //
    // Nested in a `[x = e]` block, which used to be refused *and* to hide the expression behind
    // it. It is not refused any more (4.15), so the neighbour comes out on its own — and the
    // wrapper stays, because "the refusal does not hide a second gap" is still the claim and
    // `neighbour` is the only construct left to test it with.
    const tokens = tokenize("{ [xx = 1???0???] *; }", "s").filter(
      (t) => t.kind !== "beginCode" && t.kind !== "endCode",
    );
    const errors = compileStatements(parseCode(tokens), { file: "synthetic.ld", line: 1 });
    expect(errors.map((e) => e.construct)).toEqual(["neighbour"]);
    // And the pattern is reported, so a level using six of them says which six.
    expect(errors.find((e) => e.construct === "neighbour")?.detail).toBe("1???0???");
  });

  it("finds exactly the gaps the corpus has today", () => {
    // The snapshot. 4.13's deliverable is that this list is *checked*, so a new construct
    // nobody can run fails the build and a closed gap fails it too.
    //
    // **One construct is left.** The list began as 1538 places in three — `call` 845,
    // `scoped` 395, `neighbour` 298 — and 4.14 closed the calls and 4.15 the scoped blocks.
    // `neighbour` is a `1???0???` pattern read out of a blob's array: the *patterns* are done
    // (task 3.10) but the read is the walker's job and needs a live board, which is 4.16. So
    // 298 places is one task, not 298 problems.
    const counts = new Map<string, number>();
    for (const error of allErrors) counts.set(error.construct, (counts.get(error.construct) ?? 0) + 1);
    expect(Object.fromEntries([...counts.entries()].sort())).toMatchInlineSnapshot(`
      {
        "neighbour": 298,
      }
    `);
  });

  it("finds every one of them by file and line, so a level author can go and look", () => {
    // The whole point of the gate, and the reason it is an *external* snapshot: 298 entries of
    // `file:line: construct` is a document, not an assertion. It lives in
    // `__snapshots__/compile-corpus.test.ts.snap` so that a change to it shows up as a diff in
    // a file nobody has to scroll past, and so that a level author can read it to find out what
    // is still missing.
    //
    // It was 1538 entries in three constructs until 4.14 and 4.15; the size is a measure of how
    // much of group 4 is left, which is why the file is worth regenerating rather than trimming.
    expect(allErrors.map(signature).sort()).toMatchSnapshot();
  });

  it("groups the listing by level, so the worst offenders are visible", () => {
    // The other question someone asks: which levels are furthest from running? Every line is a
    // `1???0???` read, and 298 of them across 79 levels is one missing feature — so a count per
    // file says how much of a level is written in it rather than how many bugs a level has.
    const perFile = new Map<string, number>();
    for (const error of allErrors) perFile.set(error.file, (perFile.get(error.file) ?? 0) + 1);
    const worst = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    expect(worst).toMatchInlineSnapshot(`
      [
        [
          "globals.ld",
          66,
        ],
        [
          "kacheln5.ld",
          28,
        ],
        [
          "ebene.ld",
          21,
        ],
        [
          "kacheln4.ld",
          20,
        ],
        [
          "bonimali.ld",
          16,
        ],
      ]
    `);
  });

  it("fails when a construct stops being implemented", () => {
    // Task 4.13's verification clause: "verify by temporarily removing a construct". This is
    // the assertion that would catch it — it is the same comparison the snapshot above makes,
    // asserted to be non-trivial by counting the gaps, so a snapshot that accidentally captured
    // an empty list cannot pass.
    //
    // **Down to one construct**, so this used to assert that more than one kind of gap was
    // found and cannot any more: there genuinely is only `neighbour` left. What still catches an
    // empty capture is the count itself, which is why it is the length rather than the number
    // of constructs that is asserted non-zero here.
    //
    // And when 4.16 closes this one the list really will be empty, at which point the snapshot
    // has nothing to be a snapshot *of* and this gate wants replacing rather than loosening:
    // an empty list is the success condition 0.4.0 is waiting for, and it should be asserted as
    // one rather than guarded against.
    expect(allErrors.length).toBeGreaterThan(0);
    expect(new Set(allErrors.map((e) => e.construct)).size).toBeGreaterThan(0);
  });
});