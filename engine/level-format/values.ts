// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Value resolution for `.ld` nodes: the `<...>` arithmetic and the `*` repeat
 * shorthand.
 *
 * The grammar for both is small and comes from upstream `src/parser.yy`:
 *
 * ```text
 *   def_liste_eintrag : punktwort | ld_konstante | punktwort '*' ld_konstante
 *   ld_konstante      : vorzeichen_zahl | '<' konstante '>'
 *   konstante        : zahl | wort | '(' konstante ')'
 *                    | '-' konstante            (unary, binds tightest)
 *                    | konstante '+' konstante
 *                    | konstante '-' konstante
 *                    | konstante '*' konstante
 *                    | konstante '/' konstante   (divv)
 *                    | konstante '%' konstante   (modd)
 * ```
 *
 * This is deliberately *not* the Cual expression language. That one has boolean
 * and bitwise operators and is compiled per blob in group 3; this one only
 * computes a number while a level file is being read, over literals and names
 * already defined. Keeping them apart stops the two precedence tables from being
 * confused for one another.
 *
 * Names are resolved through a callback rather than by walking the tree here.
 * Upstream looks a name up in the enclosing definition node *for the active
 * version*, which is version resolution (task 2.4) and is not this file's
 * business. Taking a resolver keeps the arithmetic testable on its own and lets
 * 2.4 supply the real thing.
 */

import type { LdExpr, LdNode, LdPos, LdValue } from "./parser.ts";
import { LdParseError } from "./parser.ts";
import type { Token } from "./lexer.ts";

/**
 * Looks up a previously defined numeric value.
 *
 * @param name the identifier as written
 * @param pos where it was used, for the error message
 * @throws LdParseError if the name is undefined or is not a number
 */
export type NameResolver = (name: string, pos: LdPos) => number;

/** A resolved list entry: still just a word, string or number. */
export type ResolvedValue = LdValue;

/**
 * `src/code.h:divv`, transcribed.
 *
 * C's `/` truncates toward zero, which is not what the level format wants: the
 * man page's own example is that `13 / 5` is 2 and `-13 / 5` is -3, so division
 * floors. The sign cases are the ones that make this more than `Math.floor`,
 * because upstream computes them from truncated pieces rather than adjusting a
 * result after the fact.
 */
export function divv(a: number, b: number): number {
  if (a < 0) {
    if (b < 0) return trunc(-a / -b);
    return -trunc((b - 1 - a) / b);
  }
  if (b < 0) return -trunc((a - b - 1) / -b);
  return trunc(a / b);
}

/**
 * `src/code.h:modd`, transcribed.
 *
 * Every division inside is C integer division, which truncates toward zero - not
 * `divv`. That is the whole reason the function is written in four sign cases
 * rather than as `a - b * divv(a, b)`, and the two are genuinely different
 * functions; the tests pin the difference.
 *
 * The result is *not* a mathematical modulo. It is a value consistent with the
 * expression upstream actually evaluates, which is why `modd(13, -5)` is 28 and
 * not 3. No level in the corpus uses `%` with a negative divisor, so this is
 * transcribed rather than corrected - see the tests, which say so explicitly.
 */
export function modd(a: number, b: number): number {
  if (a < 0) {
    if (b < 0) return -crem(-a, -b);
    return a + (1 + trunc(trunc(-1 - a) / b)) * b;
  }
  if (b < 0) return a - (1 + trunc(trunc(a - 1) / -b)) * b;
  return a % b;
}

/** C's `%`: the remainder with the dividend's sign. */
function crem(a: number, b: number): number {
  return a - trunc(a / b) * b;
}

/** Integer division truncating toward zero, as C's `/` does. */
function trunc(n: number): number {
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}

/** A value that is a plain word, string or number, with repeats expanded. */
export interface ResolvedList {
  readonly type: "list";
  readonly values: readonly ResolvedValue[];
}

/**
 * One entry of a list as it was *written*, keeping the repeat multiplier.
 *
 * `ListenKnoten` keeps `VielfachheitKnoten` children and offers two ways to
 * read them: `getLaenge` counts entries and `getImpliziteLaenge` counts
 * repetitions. Kind numbering needs both - a name takes the number of the slot it
 * lands in, and the counter advances by the multiplicity either way - so the
 * structure has to survive resolution rather than be flattened away.
 */
export interface ResolvedRun {
  /** The word, as written, extension and all. */
  readonly word: string;
  /** How many slots this entry occupies; 1 for an unmultiplied entry. */
  readonly count: number;
}

/**
 * Resolves a node to its list entries with multiplicities intact.
 *
 * Only words can be repeated, so a run is always a word; a bare number in a list
 * becomes a one-slot run whose text is its value, which keeps the caller from
 * having to re-check what it was handed. `Sorte::Sorte` would fail on such an
 * entry with `assert_datatype(type_WortDatum)`, and the kind builder says so.
 */
export function resolveRuns(
  node: LdNode,
  resolve: NameResolver,
  filename = "<input>",
): readonly ResolvedRun[] {
  if (node.type === "section") {
    throw new LdParseError(
      "expected a list of values but found a section",
      node.pos.line,
      node.pos.col,
      filename,
    );
  }
  if (node.type === "expr") {
    return [{ word: String(evaluate(node, resolve, filename)), count: 1 }];
  }
  if (node.type === "datum") {
    return [{ word: runWord(node.value), count: 1 }];
  }
  if (node.type === "repeat") {
    return [{ word: node.word, count: repeatCount(node, resolve, filename) }];
  }
  const out: ResolvedRun[] = [];
  for (const item of node.items) out.push(...resolveRuns(item, resolve, filename));
  return out;
}

/** The text of a value, as `runWord` needs it. */
function runWord(value: LdValue): string {
  return value.type === "number" ? String(value.value) : value.text;
}

/** `getImpliziteLaenge`: the number of slots a list of runs occupies. */
export function implicitLength(runs: readonly ResolvedRun[]): number {
  let total = 0;
  for (const run of runs) total += run.count;
  return total;
}

/**
 * Resolves a node to a list of plain values.
 *
 * A `repeat` expands to `count` copies of its word, matching
 * `VielfachheitKnoten`. An `expr` becomes a number. A section is not a list and
 * is rejected - `DatenKnoten::assert_datatype` would fail on it too.
 */
export function resolveList(
  node: LdNode,
  resolve: NameResolver,
  filename = "<input>",
): ResolvedList {
  if (node.type === "section") {
    throw new LdParseError(
      "expected a list of values but found a section",
      node.pos.line,
      node.pos.col,
      filename,
    );
  }
  if (node.type === "expr") {
    return { type: "list", values: [numberValue(evaluate(node, resolve, filename))] };
  }
  if (node.type === "datum") {
    return { type: "list", values: [node.value] };
  }
  if (node.type === "repeat") {
    const count = repeatCount(node, resolve, filename);
    const out: ResolvedValue[] = [];
    for (let i = 0; i < count; i++) {
      out.push({ type: "word", text: node.word });
    }
    return { type: "list", values: out };
  }
  // A list: expand each item in place.
  const values: ResolvedValue[] = [];
  for (const item of node.items) {
    values.push(...resolveList(item, resolve, filename).values);
  }
  return { type: "list", values };
}

/**
 * The single number a node denotes.
 *
 * This is upstream's `getEinzigesDatum` followed by `assert_datatype(ZahlDatum)`,
 * which is how a setting written either as `numexplode = 4` or as
 * `numexplode = a, b` would be read - except that a genuine list of more than one
 * value is an error rather than a silent first-wins.
 */
export function resolveNumber(
  node: LdNode,
  resolve: NameResolver,
  filename = "<input>",
): number {
  const { values } = resolveList(node, resolve, filename);
  if (values.length !== 1) {
    throw new LdParseError(
      `expected a single number but found ${values.length} values`,
      node.pos.line,
      node.pos.col,
      filename,
    );
  }
  const only = values[0] as LdValue;
  if (only.type !== "number") {
    throw new LdParseError(
      `expected a number but found ${only.type === "word" ? `the word '${only.text}'` : `the string '${only.text}'`}`,
      node.pos.line,
      node.pos.col,
      filename,
    );
  }
  return only.value;
}

function repeatCount(
  node: LdNode & { type: "repeat" },
  resolve: NameResolver,
  filename: string,
): number {
  const n = resolveNumber(node.count, resolve, filename);
  if (!Number.isInteger(n)) {
    throw new LdParseError(
      `repeat count must be a whole number, got ${n}`,
      node.count.pos.line,
      node.count.pos.col,
      filename,
    );
  }
  if (n < 0) {
    throw new LdParseError(
      `repeat count must not be negative, got ${n}`,
      node.count.pos.line,
      node.count.pos.col,
      filename,
    );
  }
  return n;
}

function numberValue(n: number): LdValue {
  return { type: "number", value: n };
}

/** Evaluates a `<...>` expression. */
export function evaluate(
  expr: LdExpr,
  resolve: NameResolver,
  filename = "<input>",
): number {
  const p = new ExprParser(expr.tokens, resolve, filename, expr.pos);
  const value = p.parseExpression();
  p.expectEnd();
  return value;
}

const ADD_OPS = new Set(["+", "-"]);
const MUL_OPS = new Set(["*", "/", "%"]);

/**
 * The punctuation a token denotes, or undefined if it is not punctuation.
 *
 * A narrowing helper, so callers get the text without repeating the kind check.
 */
function punctText(t: Token | undefined): string | undefined {
  return t !== undefined && t.kind === "punct" ? t.text : undefined;
}

class ExprParser {
  private index = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly resolve: NameResolver,
    private readonly filename: string,
    private readonly origin: LdPos,
  ) {}

  expectEnd(): void {
    const t = this.peek();
    if (t !== undefined) {
      this.fail(`unexpected ${describeToken(t)} after the expression`, t);
    }
  }

  /** `konstante ('+' | '-') konstante`, left-associative. */
  parseExpression(): number {
    let left = this.parseTerm();
    for (;;) {
      const op = punctText(this.peek());
      if (op === undefined || !ADD_OPS.has(op)) return left;
      this.index++;
      const right = this.parseTerm();
      left = op === "+" ? left + right : left - right;
    }
  }

  /** `konstante ('*' | '/' | '%') konstante`, left-associative. */
  private parseTerm(): number {
    let left = this.parseUnary();
    for (;;) {
      const op = punctText(this.peek());
      if (op === undefined || !MUL_OPS.has(op)) return left;
      const at = this.peek() as Token;
      this.index++;
      const right = this.parseUnary();
      if (op === "*") {
        left = left * right;
      } else if (op === "/") {
        if (right === 0) this.fail("division by zero", at);
        left = divv(left, right);
      } else {
        if (right === 0) this.fail("division by zero in a modulo", at);
        left = modd(left, right);
      }
    }
  }

  /**
   * `'-' konstante`, which binds tighter than `*`, `/` and `%`.
   *
   * That ordering is not a detail: it is why `-13 / 5` is `(-13) / 5` and floors
   * to -3 rather than being the negation of a truncated 13/5.
   */
  private parseUnary(): number {
    if (punctText(this.peek()) === "-") {
      this.index++;
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.peek();
    if (t === undefined) {
      this.fail("the expression ended unexpectedly", undefined);
    }
    this.index++;

    if (punctText(t) === "(") {
      const inner = this.parseExpression();
      const close = this.peek();
      if (punctText(close) !== ")") {
        this.fail("expected ')' to close the group", close);
      }
      this.index++;
      return inner;
    }

    if (t.kind === "number" || t.kind === "zeroOne" || t.kind === "halfNumber") {
      return t.value;
    }

    if (t.kind === "word") {
      return this.resolve(t.text, t);
    }

    this.fail(`${describeToken(t)} is not a value`, t);
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private fail(message: string, at: Token | undefined): never {
    const line = at?.line ?? this.origin.line;
    const col = at?.col ?? this.origin.col;
    throw new LdParseError(message, line, col, this.filename);
  }
}

function describeToken(t: Token): string {
  switch (t.kind) {
    case "word":
    case "string":
    case "operator":
    case "punct":
      return `'${t.text}'`;
    case "number":
    case "halfNumber":
    case "zeroOne":
      return `the number ${t.value}`;
    case "letter":
      return `the letter '${letterName(t.value)}'`;
    case "neighbour":
      return `the neighbour pattern '${t.text}'`;
    case "keyword":
      return `the keyword '${t.text}'`;
    case "beginCode":
      return "'<<'";
    case "endCode":
      return "'>>'";
    case "range":
      return "'..'";
    case "arrow":
      return t.latching ? "'=>'" : "'->'";
  }
}

/** A letter shorthand rendered back to its source spelling. */
function letterName(value: number): string {
  return value < 26
    ? String.fromCharCode(65 + value)
    : String.fromCharCode(97 + value - 26);
}
