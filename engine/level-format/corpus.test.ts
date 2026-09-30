/**
 * Verifies the lexer against the real upstream level data rather than fixtures.
 *
 * Task 2.1 is only satisfied if every `.ld` file in `cuyo-2.1.0/data/` tokenises.
 * These tests read that directory directly, so they fail if upstream gains
 * syntax the lexer does not handle.
 *
 * The upstream tree lives in `.context/upstream-cuyo/`, which is local-only and
 * therefore absent from a fresh clone. `CUYO_DATA_DIR` overrides the location.
 * These tests fail loudly rather than skipping: "the parser handles every real
 * level" is the assertion, and it cannot be evaluated without the corpus.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LdLexError, decodeLatin1, tokenize } from "./lexer.ts";
import type { Token } from "./lexer.ts";

const DATA_DIR =
  process.env["CUYO_DATA_DIR"] ??
  resolve(import.meta.dirname, "../../.context/upstream-cuyo/data");

const ALL_LD_FILES = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".ld"))
      .sort()
  : [];

interface LexedFile {
  readonly name: string;
  readonly tokens: Token[];
  readonly source: string;
}

/**
 * Lexed once and memoised: the suite walks the whole corpus in a dozen tests,
 * and re-reading and re-lexing every file for each one dominated the runtime.
 */
const cache = new Map<string, LexedFile>();

function lexFile(name: string): LexedFile {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const bytes = readFileSync(join(DATA_DIR, name));
  const source = decodeLatin1(bytes);
  const result: LexedFile = { name, tokens: tokenize(source, name), source };
  cache.set(name, result);
  return result;
}

describe("upstream corpus", () => {
  it("finds the upstream data directory", () => {
    expect(
      ALL_LD_FILES.length,
      `no .ld files found in ${DATA_DIR}. The upstream Cuyo tree is ` +
        `local-only; put it at .context/upstream-cuyo or set CUYO_DATA_DIR.`,
    ).toBeGreaterThan(50);
  });

  it("tokenises every .ld file without error", () => {
    const failures: string[] = [];
    for (const name of ALL_LD_FILES) {
      try {
        const { tokens } = lexFile(name);
        expect(tokens.length, `${name} produced no tokens`).toBeGreaterThan(0);
      } catch (error) {
        failures.push(
          error instanceof LdLexError
            ? `${error.message}`
            : `${name}: ${String(error)}`,
        );
      }
    }
    expect(failures, `\n${failures.join("\n")}`).toEqual([]);
  });

  it("balances << and >> in every file", () => {
    const unbalanced: string[] = [];
    for (const name of ALL_LD_FILES) {
      const { tokens } = lexFile(name);
      let depth = 0;
      let minDepth = 0;
      for (const t of tokens) {
        if (t.kind === "beginCode") depth++;
        else if (t.kind === "endCode") depth--;
        if (depth < minDepth) minDepth = depth;
      }
      if (depth !== 0 || minDepth < 0) {
        unbalanced.push(`${name}: final depth ${depth}, min ${minDepth}`);
      }
    }
    expect(unbalanced, `\n${unbalanced.join("\n")}`).toEqual([]);
  });

  it("reports no unterminated string or unknown escape across the corpus", () => {
    // Covered by the tokenise-everything test, but asserted separately so the
    // failure message names the actual cause rather than just "wrong character".
    const errors: string[] = [];
    for (const name of ALL_LD_FILES) {
      try {
        lexFile(name);
      } catch (error) {
        errors.push(`${name}: ${(error as Error).message}`);
      }
    }
    expect(errors, `\n${errors.join("\n")}`).toEqual([]);
  });
});

describe("upstream corpus: shape of what it contains", () => {
  it("finds Cual blocks", () => {
    let withCode = 0;
    for (const name of ALL_LD_FILES) {
      if (lexFile(name).tokens.some((t) => t.kind === "beginCode")) withCode++;
    }
    // Every real level except the pure index and the commented-out example.
    expect(withCode).toBeGreaterThan(70);
  });

  it("finds versioned definitions", () => {
    let bracketed = 0;
    for (const name of ALL_LD_FILES) {
      bracketed += lexFile(name).tokens.filter((t) => t.kind === "punct" && t.text === "[").length;
    }
    expect(bracketed).toBeGreaterThan(20);
  });

  it("finds neighbour patterns in both lengths", () => {
    let eight = 0;
    let six = 0;
    for (const name of ALL_LD_FILES) {
      for (const t of lexFile(name).tokens) {
        if (t.kind !== "neighbour") continue;
        if (t.text.length === 8) eight++;
        else if (t.text.length === 6) six++;
      }
    }
    expect(eight).toBeGreaterThan(0);
    expect(six).toBeGreaterThan(0);
  });

  it("finds all Cual operators", () => {
    const seen = new Set<string>();
    for (const name of ALL_LD_FILES) {
      for (const t of lexFile(name).tokens) {
        if (t.kind === "operator") seen.add(t.text);
        else if (t.kind === "range") seen.add("..");
        else if (t.kind === "arrow") seen.add(t.latching ? "=>" : "->");
      }
    }
    for (const op of [
      "->",
      "=>",
      "..",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
      ".+=",
      ".-=",
      ".+",
      ".-",
    ]) {
      expect(seen.has(op), `operator ${op} never seen in the corpus`).toBe(true);
    }
  });

  it("finds both arrow flavours", () => {
    let plain = 0;
    let latching = 0;
    for (const name of ALL_LD_FILES) {
      for (const t of lexFile(name).tokens) {
        if (t.kind !== "arrow") continue;
        if (t.latching) latching++;
        else plain++;
      }
    }
    expect(plain).toBeGreaterThan(0);
    expect(latching).toBeGreaterThan(0);
  });

  it("tokenises files whose high bytes live in comments", () => {
    // Several upstream files contain ISO-8859-1 bytes (German umlauts) in
    // trailing comments, which is why grep classifies them as binary. The
    // comment rule must consume them rather than reject them as an unknown
    // character, so reaching a non-empty token list is the assertion.
    let filesWithHighBytes = 0;
    for (const name of ALL_LD_FILES) {
      const { source, tokens } = lexFile(name);
      if (!/[-ÿ]/.test(source)) continue;
      filesWithHighBytes++;
      expect(tokens.length, `${name} produced no tokens`).toBeGreaterThan(0);
    }
    expect(filesWithHighBytes).toBeGreaterThan(5);
  });

  it("never emits a single-letter word in the corpus", () => {
    // Single letters must lex as the letter shorthand, so a stray one-letter
    // `word` would mean the two rules are mis-ordered.
    for (const name of ALL_LD_FILES) {
      for (const t of lexFile(name).tokens) {
        if (t.kind === "word") {
          expect(t.text.length, `${name}: one-letter word ${t.text}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("uses the zeroOne literal rather than a number for bare 0 and 1", () => {
    let zeroOne = 0;
    for (const name of ALL_LD_FILES) {
      zeroOne += lexFile(name).tokens.filter((t) => t.kind === "zeroOne").length;
    }
    expect(zeroOne).toBeGreaterThan(0);
  });

  it("tokenises the C-heavy level files that grep treats as binary", () => {
    // kunst.ld, dungeon.ld, wuerfel.ld and angst.ld contain ISO-8859-1 bytes
    // that make grep classify them as binary; they must still lex.
    for (const name of ["kunst.ld", "dungeon.ld", "wuerfel.ld", "angst.ld"]) {
      expect(ALL_LD_FILES, `${name} missing from corpus`).toContain(name);
      const { tokens } = lexFile(name);
      expect(tokens.length).toBeGreaterThan(100);
    }
  });
});
