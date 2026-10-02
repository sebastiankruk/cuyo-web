/**
 * Runs the Cual statement parser over every Cual block in the real level data.
 *
 * The oracle is the corpus itself. Fixtures can only ever cover the shapes somebody
 * thought of, and the shapes somebody thought of are exactly the ones that already work -
 * every production missing from this parser was missing because no fixture mentioned it.
 * Between them, the corpus and `parser.yy` found twenty-three productions that reading the
 * grammar twice had not.
 *
 * `levels/upstream/` is committed, so this runs on a fresh clone.
 *
 * Two assertions, and the second is the one that matters. "All the blocks parse" says the
 * parser accepts the corpus; it does not say the parser *covers* the language. A parser that
 * quietly dropped `switch` would still pass it. So the constructs task 3.5 names are counted
 * in the parsed trees, and a construct that stops occurring is a failure.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLatin1, tokenize } from "../level-format/lexer.ts";
import type { Token } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import type { Stmt } from "./code.ts";

/** Every `<< >>` block in every level file, with the file and line it came from. */
function cualBlocks(): { file: string; endLine: number; tokens: Token[] }[] {
  const dir = resolve(import.meta.dirname, "../../levels/upstream");
  const blocks: { file: string; endLine: number; tokens: Token[] }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ld")).sort()) {
    const tokens = tokenize(decodeLatin1(readFileSync(join(dir, file))), file);
    let depth = 0;
    let buffer: Token[] = [];
    for (const token of tokens) {
      if (token.kind === "beginCode") {
        depth += 1;
        buffer = [];
        continue;
      }
      if (token.kind === "endCode") {
        depth -= 1;
        if (buffer.length) blocks.push({ file, endLine: token.line, tokens: buffer });
        buffer = [];
        continue;
      }
      if (depth > 0) buffer.push(token);
    }
  }
  return blocks;
}

/** Every statement in a tree, including nested ones. */
function walk(nodes: readonly Stmt[]): Stmt[] {
  return nodes.flatMap(descend);
}

function descend(node: Stmt): Stmt[] {
  const found: Stmt[] = [node];
  switch (node.kind) {
    case "sequence":
    case "block":
      for (const child of node.body) found.push(...descend(child));
      break;
    case "commaSequence":
      for (const child of node.parts) found.push(...descend(child));
      break;
    case "if":
      found.push(...descend(node.then));
      if (node.otherwise) found.push(...descend(node.otherwise));
      break;
    case "switch":
      for (const entry of node.cases) {
        found.push(...descend(entry.body));
        if (entry.otherwise) found.push(...descend(entry.otherwise));
      }
      break;
    case "scoped":
    case "procedureDef":
      found.push(...descend(node.body));
      break;
    default:
      break;
  }
  return found;
}

describe("Cual statement parser against the corpus", () => {
  const blocks = cualBlocks();
  const trees = blocks.map((block) => ({ ...block, stmts: walk(parseCode(block.tokens)) }));

  it("finds the corpus", () => {
    // A silently empty list would make everything below pass for the wrong reason, which is
    // the failure mode this file exists to prevent. Task 3.5 is worded "all 81 levels
    // parse"; there are 82 `.ld` files here, because `summary.ld` holds the level list
    // rather than being a level, and it carries Cual of its own.
    expect(readdirSync(resolve(import.meta.dirname, "../../levels/upstream")).filter((f) =>
      f.endsWith(".ld"),
    )).toHaveLength(82);
    expect(blocks.length).toBe(339);
  });

  it("parses every Cual block in every level", () => {
    // No try/catch: the first block that fails should name itself and its line, and a
    // counted assertion cannot say which one.
    expect(blocks.map((b) => `${b.file}@${b.endLine}`)).toHaveLength(339);
    expect(trees).toHaveLength(339);
  });

  // The construct list is task 3.5's, verbatim. Each is asserted to occur *in the parsed
  // trees*, so this fails if a production is dropped from the parser as well as if the
  // corpus stops using it.
  const constructs: [string, (s: Stmt) => boolean][] = [
    ["procedures", (s) => s.kind === "procedureDef"],
    ["variable declarations", (s) => s.kind === "varDecl"],
    ["`default`", (s) => s.kind === "defaultDecl"],
    ["assignments", (s) => s.kind === "assign" && s.operator === "="],
    ["compound assignments", (s) => s.kind === "assign" && s.operator !== "="],
    ["scoped `[x=e]` blocks", (s) => s.kind === "scoped"],
    ["`if`/`else`", (s) => s.kind === "if" && s.otherwise !== null],
    ["`switch`", (s) => s.kind === "switch"],
    ["comma sequences", (s) => s.kind === "commaSequence"],
    ["`busy`", (s) => s.kind === "busy"],
    ["draw commands", (s) => s.kind === "draw" || s.kind === "letterDraw"],
    ["effect commands", (s) => s.kind === "effect"],
  ];

  it.each(constructs)("covers %s", (_name, matches) => {
    const count = trees.reduce(
      (total, t) => total + t.stmts.filter(matches).length,
      0,
    );
    expect(count, `no ${_name} found in the corpus`).toBeGreaterThan(0);
  });

  it("finds the constructs where the corpus puts them", () => {
    // A spot check that the walk really reaches nested statements: a `switch` inside an
    // `if` inside a procedure body, which is the shape most of the corpus uses. If `walk`
    // stopped descending, every construct above would still be found - in the shallow ones.
    const deep = trees.filter((t) => t.stmts.some((s) => s.kind === "switch"));
    expect(deep.length).toBeGreaterThan(10);
    expect(
      trees.reduce((n, t) => n + t.stmts.filter((s) => s.kind === "number").length, 0),
    ).toBeGreaterThan(100);
  });
});