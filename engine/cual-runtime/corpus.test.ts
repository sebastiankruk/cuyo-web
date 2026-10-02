/**
 * Runs the Cual statement parser over every Cual block in the real level data.
 *
 * The oracle is the corpus itself. Fixtures can only ever cover the shapes somebody
 * thought of, and the shapes somebody thought of are exactly the ones that already work -
 * every production missing from the parser was missing because no fixture mentioned it.
 * Counting is deliberately the assertion rather than "all 339 blocks parse", because that
 * is still false; a number can go down without anyone deciding it went down on purpose.
 *
 * `levels/upstream/` is committed, so this runs on a fresh clone.
 *
 * If a block fails, read the source rather than the message. The count in `BLOCKS_EXPECTED
 * TO PARSE` is a floor, not a target to hit by loosening a check: the way to move it is a
 * new production in `parser.yy` that is transcribed faithfully, not a test that accepts more.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLatin1, tokenize } from "../level-format/lexer.ts";
import type { Token } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";

/** Every `<< >>` block in every level file, tagged with where it came from. */
function cualBlocks(): { file: string; endLine: number; tokens: Token[] }[] {
  const dir = resolve(import.meta.dirname, "../../levels/upstream");
  const blocks: { file: string; endLine: number; tokens: Token[] }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ld"))) {
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

describe("Cual statement parser against the corpus", () => {
  const blocks = cualBlocks();

  it("finds the corpus", () => {
    // A silently empty list would make the count below pass for the wrong reason, which is
    // the failure mode this file exists to prevent.
    expect(blocks.length).toBeGreaterThan(300);
  });

  it("parses at least this many blocks", () => {
    const failures: string[] = [];
    let parsed = 0;
    for (const block of blocks) {
      try {
        parseCode(block.tokens);
        parsed += 1;
      } catch (error) {
        failures.push(
          `${block.file}@${block.endLine}: ${(error as Error).message.split("\n")[0]}`,
        );
      }
    }
    // 322 of 339, as of this commit. Raise it in the same change that fixes a production.
    expect(parsed, `failed:\n  ${failures.slice(0, 12).join("\n  ")}`).toBeGreaterThanOrEqual(322);
  });
});