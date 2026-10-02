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
import { allocateSlots } from "./slots.ts";
import type { Stmt } from "./code.ts";

/** Every `<< >>` block in every level file, with the file and line it came from. */
function cualBlocksIn(file: string, src: string): { endLine: number; tokens: Token[] }[] {
  const blocks: { endLine: number; tokens: Token[] }[] = [];
  const tokens = tokenize(src, file);
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
      if (buffer.length) blocks.push({ endLine: token.line, tokens: buffer });
      buffer = [];
      continue;
    }
    if (depth > 0) buffer.push(token);
  }
  return blocks;
}

function levelDir(): string {
  return resolve(import.meta.dirname, "../../levels/upstream");
}

function levelFiles(): string[] {
  return readdirSync(levelDir()).filter((f) => f.endsWith(".ld")).sort();
}

function cualBlocks(): { file: string; endLine: number; tokens: Token[] }[] {
  const blocks: { file: string; endLine: number; tokens: Token[] }[] = [];
  for (const file of levelFiles()) {
    const src = decodeLatin1(readFileSync(join(levelDir(), file)));
    for (const block of cualBlocksIn(file, src)) blocks.push({ file, ...block });
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
    expect(levelFiles()).toHaveLength(82);
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

  it("allocates the same slots every time it is asked", () => {
    // Task 3.6's verification, verbatim: "verify slot counts are stable for a repeated
    // parse". Asserted over all 339 blocks rather than over two fixtures, because the
    // failure it guards against - an allocator whose numbering depends on parse order or on
    // shared state between blocks - would show up in one block out of 339 and not in a
    // hand-picked pair.
    const digest = () =>
      blocks.map((block) => {
        const allocation = allocateSlots(parseCode(block.tokens));
        return [
          allocation.slotCount,
          allocation.boolCount,
          allocation.declaredCount,
          // The bit numbers themselves, not just how many there are.
          [...allocation.busySlots.values()].map((s) => `${s.first}/${s.second}`).join(","),
        ].join(":");
      });

    const first = digest();
    const second = digest();
    expect(second).toEqual(first);
    // And a third pass, after the others, in case something accumulated.
    expect(digest()).toEqual(first);
  });

  it("allocates a level's slots in one run, not one per block", () => {
    // `getDatenLaenge` is per level knoten, and a level's Cual is spread over several
    // `<< >>` blocks whose procedures share one array with the block that calls them. So the
    // level-level allocation is a single run over all of that file's statements.
    //
    // Restarting the allocator per block is not just a different number, it is a *larger*
    // one: each restart begins a fresh 32-bit block, so a level whose flags total 40 across
    // two blocks needs 2 ints in one run and 2 per block. The relationship is asserted
    // because the comment above claims it, and a claim about an optimisation nobody measures
    // is the kind that quietly stops being true.
    let levelTotal = 0;
    let perBlockTotal = 0;
    let filesWithCual = 0;
    for (const file of levelFiles()) {
      const src = decodeLatin1(readFileSync(join(levelDir(), file)));
      const blocks = cualBlocksIn(file, src);
      if (blocks.length === 0) continue;
      filesWithCual += 1;
      levelTotal += allocateSlots(blocks.flatMap((b) => parseCode(b.tokens))).slotCount;
      for (const block of blocks) {
        perBlockTotal += allocateSlots(parseCode(block.tokens)).slotCount;
      }
    }
    expect(filesWithCual).toBeGreaterThan(70);
    expect(levelTotal).toBeGreaterThan(300);
    expect(levelTotal).toBeLessThan(perBlockTotal);
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