/**
 * Parsing Cual expressions into the tree `expr.ts` evaluates.
 *
 * Precedence climbing rather than a hand-written level per operator, because
 * {@link PRECEDENCE} already exists as data and the alternative is the same table written a
 * second time inside a nest of `if`s — where the six comparisons and the two meanings of
 * `-` would have to be got right again by hand. Reading the table means one transcription
 * of `parser.yy`, and #16's test keeps that transcription honest.
 *
 * Two things this deliberately does *not* do, both because they belong to other tasks:
 *
 *  - **Statements.** `if`, `switch`, `var`, assignments, `busy`, draw and effect commands
 *    are task 3.5's other half. `parseCode` below rejects them by name rather than
 *    mis-parsing them, so an unimplemented construct is a clear error and not a wrong tree.
 *  - **Evaluation of `ort`.** An addressed variable parses into a `positioned` node that
 *    `evaluate` refuses, which is task 4.7.
 *
 * ## Non-associativity is enforced, not ignored
 *
 * `:` `!` `==..` unary `-` and `.` are declared `%nonassoc`, so `a : b : c` and `a . b . c`
 * are *syntax errors* in Cual. Bison rejects them because a shift/reduce conflict would
 * otherwise be resolved silently; a precedence-climbing parser that just loops would accept
 * them and pick a grouping. {@link CualSyntaxError} is thrown instead, because the alternative
 * is a program that runs upstream's parser and not this one, which is the failure mode this
 * whole port is trying to avoid.
 */

import type { Token } from "../level-format/lexer.ts";
import {
  PRECEDENCE,
  type BinaryOperator,
  type Expr,
  type Half,
  type Ort,
  type UnaryOperator,
} from "./expr.ts";

/** A parse failure, carrying the position, as `parser.yy`'s `Fehler` does. */
export class CualSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col: number,
  ) {
    super(`${line}:${col}: ${message}`);
    this.name = "CualSyntaxError";
  }
}

/**
 * A cursor over a token list, with the lookahead the grammar needs.
 *
 * Exported because `code.ts` drives the same cursor for the statement layer: an expression
 * has to be able to stop at `;` or `,` and hand control back, and a second cursor over the
 * same array would either lose the position or need the caller to thread it through.
 */
export class Cursor {
  private at = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  /** The current token, or undefined at the end. */
  peek(offset = 0): Token | undefined {
    return this.tokens[this.at + offset];
  }

  next(): Token {
    const token = this.tokens[this.at];
    if (token === undefined) {
      const last = this.tokens[this.tokens.length - 1];
      throw new CualSyntaxError(
        "unexpected end of code",
        last?.line ?? 0,
        last?.col ?? 0,
      );
    }
    this.at += 1;
    return token;
  }

  atEnd(): boolean {
    return this.at >= this.tokens.length;
  }

  /** The current position, so a speculative parse can be undone. */
  mark(): number {
    return this.at;
  }

  /**
   * Rewinds to a {@link mark}.
   *
   * Used where the grammar is genuinely ambiguous without more lookahead: `name x = 1` is a
   * procedure definition and `name` on its own is a call, and only trying one and rewinding
   * distinguishes them. Bison gets this from its tables; a hand-written parser backtracks,
   * which is safe here because parsing has no side effects.
   */
  reset(to: number): void {
    this.at = to;
  }

  fail(message: string, token: Token | undefined = this.peek()): never {
    throw new CualSyntaxError(message, token?.line ?? 0, token?.col ?? 0);
  }

  /** Consumes a single-character punctuation token, if it is next. */
  takePunct(text: string): boolean {
    const token = this.peek();
    if (token?.kind === "punct" && token.text === text) {
      this.next();
      return true;
    }
    return false;
  }

  expectPunct(text: string): void {
    if (!this.takePunct(text)) {
      this.fail(`expected '${text}'`);
    }
  }
}

/** The operators at one precedence level, indexed by level number. */
const BY_LEVEL = new Map<number, (typeof PRECEDENCE)[number]>();
for (const entry of PRECEDENCE) BY_LEVEL.set(entry.level, entry);

const INFIX_LEVELS = PRECEDENCE.filter((l) => l.position === "infix");

/** The level the six comparisons share, which `==` needs to parse its own right operand. */
const LEVEL_OF_EQ = INFIX_LEVELS.find((l) => l.ops.includes("=="))?.level ?? 0;

/**
 * The level of `==..` itself.
 *
 * Both ends of a range are `ausdruck` in the context of `intervall`, so neither may contain
 * an operator that binds looser than `==..` does. Parsed at the loosest level instead, the
 * upper bound of `1 == 1 .. 2` swallows the following `== 3 .. 4` and produces
 * `1 == (1 .. (2 == 3 .. 4))` — a tree that evaluates, silently, to something else.
 */
const LEVEL_OF_RANGE =
  PRECEDENCE.find((l) => l.ops.includes("==.."))?.level ?? LEVEL_OF_EQ;

/**
 * The level of the probabilistic operator `:`.
 *
 * Needed wherever a `:` is *not* that operator - notably `default x = 0 : reapply`, where
 * the colon introduces a keyword. An expression parsed at the loosest level sees `:` as an
 * infix operator and tries to parse `reapply` as an operand, which fails with a message about
 * a keyword where the reader expected a declaration.
 */
export const LEVEL_OF_COLON =
  PRECEDENCE.find((l) => l.ops.includes(":"))?.level ?? LEVEL_OF_RANGE;

/** One expression, stopping before anything binding looser than `:`. */
export function parseExpressionBeforeColon(cursor: Cursor): Expr {
  // Level 1, with `:` named as a terminator - see `parseExpr`. Doing this by level instead
  // stopped at the first `+`, which made `default inhibit = DIR_UUL+DIR_DDL+DIR_DDR+DIR_UUR;`
  // in gold.ld read as the single constant `DIR_UUL` with a `+` left over as a statement.
  void LEVEL_OF_COLON;
  return parseExpr(cursor, 1, STOP_AT_COLON);
}

const STOP_AT_COLON: ReadonlySet<string> = new Set([":"]);

/**
 * The text an operator token carries, or null if it is not one.
 *
 * Both `operator` and `punct` can hold one, and this is the kind of thing that is easy to
 * get wrong in a way that produces a parser which looks complete and parses nothing: `scanner.ll`
 * returns named tokens for the two-character forms (`==`, `.+`, `&&`) and bare characters for
 * everything else (`+`, `*`, `.`, `!`), and the grammar uses both spellings interchangeably.
 * An earlier draft of this file only looked at `operator`, so every single-character
 * operator was invisible and `1 + 2 * 3` failed to parse at all.
 */
function operatorText(token: Token | undefined): string | null {
  if (token?.kind === "operator" || token?.kind === "punct") return token.text;
  return null;
}

/** Which binary operator a token is, at which level, or undefined. */
function infixFor(token: Token | undefined): { op: BinaryOperator; level: number } | undefined {
  const text = operatorText(token);
  if (text === null) return undefined;
  for (const entry of INFIX_LEVELS) {
    if (entry.ops.includes(text)) {
      return { op: text as BinaryOperator, level: entry.level };
    }
  }
  return undefined;
}

/**
 * Which prefix operator a token is, or undefined.
 *
 * `-` is excluded because it is ambiguous: as a prefix it is unary minus, but the same
 * token is infix subtraction, and deciding which is the parser's job by position, not the
 * token's. `parseUnary` handles it after the infix check has had its chance.
 */
function prefixFor(token: Token | undefined): UnaryOperator | undefined {
  if (operatorText(token) === "!") return "!";
  return undefined;
}

/**
 * Parse a whole expression from a token list, and require the list to be consumed.
 *
 * Trailing tokens are an error rather than ignored, so a caller cannot mistake "parsed the
 * first thing it saw" for "parsed the program". The statement layer cannot use this - it has
 * to let the expression stop at `;` - so it uses {@link parseExpressionFrom} instead.
 */
export function parseExpression(tokens: readonly Token[]): Expr {
  const cursor = new Cursor(tokens);
  const expr = parseExpr(cursor, 1);
  if (!cursor.atEnd()) {
    const token = cursor.peek();
    const text = token === undefined ? "end of code" : describe(token);
    cursor.fail(`unexpected ${text} after a complete expression`, token);
  }
  return expr;
}

/**
 * Parse one expression from a shared cursor, stopping wherever the next token is not an
 * operator that can continue it.
 *
 * This is what the statement layer calls: it owns the cursor so it can see the `;`, `,` or
 * `}` that ended the expression.
 */
export function parseExpressionFrom(cursor: Cursor): Expr {
  return parseExpr(cursor, 1);
}

/** A cursor over `tokens`, for a caller that owns the whole block. */
export function makeCursor(tokens: readonly Token[]): Cursor {
  return new Cursor(tokens);
}

/** `@(x,y)` or `@@(x,y)` at a use site, from a shared cursor. */
export function parseOrtFor(cursor: Cursor): Ort {
  const token = cursor.peek();
  const foreign = token?.kind === "operator" && token.text === "@@";
  if (!foreign && !(token?.kind === "punct" && token.text === "@")) {
    cursor.fail("expected '@' or '@@'", token);
  }
  cursor.next();
  return parseOrt(cursor, foreign);
}

/**
 * A readable name for a token, for error messages.
 *
 * Exhaustive over the token union, which is the point: adding a token kind to the lexer
 * without deciding how to name it should be a type error here rather than a message that
 * says `'undefined'`.
 */
function describe(token: Token): string {
  switch (token.kind) {
    case "operator":
      return `operator '${token.text}'`;
    case "punct":
      return `'${token.text}'`;
    case "keyword":
      return `keyword '${token.text}'`;
    case "word":
    case "string":
      return `'${token.text}'`;
    case "neighbour":
      return `neighbour pattern '${token.text}'`;
    case "beginCode":
      return "'<<'";
    case "endCode":
      return "'>>'";
    case "range":
      return "'..'";
    case "number":
    case "zeroOne":
      return `number ${token.value}`;
    case "halfNumber":
      return `half-number ${token.value}`;
    case "letter":
      return `letter ${token.value}`;
    case "arrow":
      return token.latching ? "'=>'" : "'->'";
  }
}

/**
 * Precedence climbing.
 *
 * `minLevel` is the loosest binding this call may consume, so a caller can say "parse an
 * operand of level N" and have the operators above N stop the recursion.
 *
 * `stopBefore` names operators that end the expression even though their level would
 * otherwise allow them. It exists for one caller, and a single `minLevel` cannot express it:
 * in `var x = a + b : reapply` the `:` has to end the value, but `:` is level 7 and `+` is
 * level 6, so "level 7 and tighter" would throw away the addition as well. Upstream has no
 * such problem because `echter_default` ends in `konstante`, which has no `:` production at
 * all - the ambiguity only exists once the grammar is flattened into precedence levels.
 */
function parseExpr(cursor: Cursor, minLevel: number, stopBefore?: ReadonlySet<string>): Expr {
  let left = parseUnary(cursor);

  for (;;) {
    if (stopBefore?.has(operatorText(cursor.peek()) ?? "")) break;
    // `== ..` is its own production with three shapes, and it cannot be told apart from a
    // plain `==` until the right operand has been parsed: the grammar is
    //
    //     ausdruck EQ_TOK intervall
    //     intervall: ausdruck BIS_TOK | BIS_TOK ausdruck | ausdruck BIS_TOK ausdruck
    //
    // so the `..` arrives *after* the lower bound, not straight after the `==`. Deciding by
    // looking one token past the `==` therefore misreads every range as a plain comparison,
    // and then chokes on the `..`. So: parse the right operand, and if a `..` follows, fold
    // what was parsed into a range instead. `a == b` and `a == b .. c` then differ only at
    // the point where the decision is actually knowable.
    // The `minLevel` guard is inside the branch, not before it. `==` is handled specially,
    // and a special case that forgets the guard runs at every level: with `1 < 2 == 1` the
    // left `1 < 2` is built correctly and then the `==` branch claims the `==` regardless
    // of the level the caller allowed, regrouping `1 < (2 == 1)`.
    const eqInfix = infixFor(cursor.peek());
    if (operatorText(cursor.peek()) === "==" && eqInfix !== undefined && eqInfix.level >= minLevel) {
      cursor.next();
      let builtRange = false;
      if (cursor.peek()?.kind === "range") {
        // `a == .. b`: the lower bound is open, so only the upper is parsed.
        cursor.next();
        builtRange = true;
        left = {
          kind: "range",
          value: left,
          lower: null,
          upper: parseExpr(cursor, LEVEL_OF_RANGE, stopBefore),
        };
      } else {
        const bound = parseExpr(cursor, LEVEL_OF_EQ + 1, stopBefore);
        if (cursor.peek()?.kind === "range") {
          cursor.next();
          builtRange = true;
          left = { kind: "range", value: left, lower: bound, upper: parseUpperBound(cursor) };
        } else {
          left = { kind: "binary", op: "==", left, right: bound };
        }
      }
      // `==..` is declared `%nonassoc`, so a range may not itself be the left operand of
      // another range. Only the directly detectable shape is refused: an `==` whose right
      // side *starts* with `..` is unambiguously a second range. `a == b..c == d..e` needs
      // unbounded lookahead to tell from `(a == b..c) == d` followed by a stray `..`, which
      // bison decides from its LALR tables and this parser cannot. That form is accepted
      // and grouped as `(a == b..c) == (d..e)`; the corpus contains no instance of it.
      //
      // The check is scoped to `builtRange` on purpose: a plain `==` is `%left` and may
      // chain freely, and an earlier version fired after every `==` and so refused
      // `1 == 1 == 1`.
      if (builtRange && operatorText(cursor.peek()) === "==" && cursor.peek(1)?.kind === "range") {
        cursor.fail("'==' cannot be chained with a range comparison");
      }
      continue;
    }

    const infix = infixFor(cursor.peek());
    if (infix === undefined || infix.level < minLevel) break;
    const associativity = BY_LEVEL.get(infix.level)?.associativity ?? "left";

    cursor.next();
    // Always `level + 1`, for non-associative operators too. With `level` the right operand
    // could swallow a second operator of the same level, and the non-associativity check
    // below would then find nothing left to object to - `1 . 2 . 3` parsed as `1 . (2 . 3)`
    // instead of being refused. The check only works if the chain reaches this level.
    const nextMin = infix.level + 1;
    const right = parseExpr(cursor, nextMin, stopBefore);

    if (associativity === "nonassoc" && infixFor(cursor.peek())?.level === infix.level) {
      cursor.fail(`'${infix.op}' is not associative and cannot be chained`);
    }
    left = { kind: "binary", op: infix.op, left, right };
  }

  return left;
}

/** A prefix operator, or the start of a primary. */
function parseUnary(cursor: Cursor): Expr {
  const token = cursor.peek();
  const prefix = prefixFor(token);
  if (prefix !== undefined) {
    cursor.next();
    // `%nonassoc '!'`, so `!!x` is a syntax error upstream.
    if (prefixFor(cursor.peek()) === "!") {
      cursor.fail("'!' is not associative and cannot be chained");
    }
    return { kind: "unary", op: prefix, operand: parseUnary(cursor) };
  }
  if (token?.kind === "punct" && token.text === "-") {
    cursor.next();
    // `%prec NEG_PREC`, declared `%nonassoc`, so `--1` is a syntax error upstream. Checking
    // the next token is enough: the operand that follows cannot itself begin with `-` without
    // this being the case.
    if (operatorText(cursor.peek()) === "-") {
      cursor.fail("unary '-' is not associative and cannot be chained");
    }
    return { kind: "unary", op: "-", operand: parseUnary(cursor) };
  }
  return parsePrimary(cursor);
}

/** A number, a variable, a call, an address, or a parenthesised expression. */
function parsePrimary(cursor: Cursor): Expr {
  const token = cursor.next();

  if (token.kind === "number") return { kind: "number", value: token.value };
  if (token.kind === "halfNumber") {
    // `parser.yy`'s `halbzahl` rounds the half *up* in the parser, not the lexer.
    return { kind: "number", value: token.value + 1 };
  }
  if (token.kind === "zeroOne") return { kind: "number", value: token.value };
  if (token.kind === "neighbour") return { kind: "neighbour", pattern: token.text };
  if (token.kind === "string") return { kind: "variable", name: token.text };

  if (token.kind === "keyword") {
    if (token.text === "rnd" || token.text === "gcd") return parseCall(cursor, token.text);
    cursor.fail(`keyword '${token.text}' is not an expression`, token);
  }

  if (token.kind === "letter") {
    // `lokale_variable`'s own error message, verbatim: "Variable names can't be single
    // letters." Being laxer here would accept programs upstream rejects.
    cursor.fail("Variable names can't be single letters.", token);
  }

  if (token.kind === "word") return parseWordOrAddressed(cursor, token.text);

  if (token.kind === "punct" && token.text === "(") {
    const inner = parseExpr(cursor, 1);
    cursor.expectPunct(")");
    return inner;
  }

  cursor.fail(`expected an expression, found ${describe(token)}`, token);
}

/** `rnd(expr)` and `gcd(a, b)`. */
function parseCall(cursor: Cursor, name: "rnd" | "gcd"): Expr {
  cursor.expectPunct("(");
  const first = parseExpr(cursor, 1);
  const args: Expr[] = [first];
  while (cursor.takePunct(",")) {
    args.push(parseExpr(cursor, 1));
  }
  cursor.expectPunct(")");
  if (name === "rnd" && args.length !== 1) {
    cursor.fail("rnd takes exactly one argument");
  }
  if (name === "gcd" && args.length !== 2) {
    cursor.fail("gcd takes exactly two arguments");
  }
  return { kind: "call", name, args };
}

/** `name`, or `name@(...)` / `name@@(...)`. */
function parseWordOrAddressed(cursor: Cursor, name: string): Expr {
  const token = cursor.peek();
  const isRelative = token?.kind === "punct" && token.text === "@";
  const isForeign = token?.kind === "operator" && token.text === "@@";
  if (!isRelative && !isForeign) return { kind: "variable", name };

  cursor.next();
  return { kind: "positioned", name, position: parseOrt(cursor, isForeign) };
}

/**
 * Whether a token could begin a primary expression.
 *
 * Used to decide whether a bare `@` carries an address or stands alone - the only way to tell
 * `@ 5 *` from `@*`. Listed explicitly rather than "is not an operator", because `!` and `-`
 * are operators that also begin an expression.
 */
export function canStartExpression(token: Token | undefined): boolean {
  switch (token?.kind) {
    case "number":
    case "zeroOne":
    case "halfNumber":
    case "word":
    case "string":
    case "neighbour":
      return true;
    case "punct":
      return token.text === "(" || token.text === "-";
    case "operator":
      return token.text === "!";
    default:
      return false;
  }
}

/** `parser.yy`'s `relort` and `absort`, which differ only in their empty case. */
function parseOrt(cursor: Cursor, foreign: boolean): Ort {
  const open = cursor.peek();
  const parenthesised = open?.kind === "punct" && open.text === "(";
  if (!parenthesised) {
    // `relort_klammerfrei` / `absort_klammerfrei` are empty, a bare `0`/`1`, or a bare
    // expression. All three occur: `pos = drehpos@;` in baelle.ld writes the address with no
    // parentheses at all, and the empty form is how a global is named.
    //
    // `Ort::Ort(Code*)` is `ortart_relativ_fall` in ort.cpp, so a one-argument address is a
    // falling piece whichever spelling produced it - `@0`, `@expr`, `@@expr` are all the
    // same kind of thing.
    if (open?.kind === "zeroOne") {
      cursor.next();
      return { kind: "fall", which: { kind: "number", value: open.value } };
    }
    if (canStartExpression(open)) {
      return { kind: "fall", which: parseExpr(cursor, 1) };
    }
    return foreign ? { kind: "semiglobal" } : { kind: "global" };
  }

  cursor.expectPunct("(");
  // `relort_klammerfrei` and `absort_klammerfrei` both admit an *empty* address, so `@()`
  // and `@@()` are legal and mean "the global" and "the semiglobal". Reading an expression
  // unconditionally fails on the closing bracket.
  if (cursor.takePunct(")")) {
    return foreign ? { kind: "semiglobal" } : { kind: "global" };
  }

  const first = parseExpr(cursor, 1);
  if (!cursor.takePunct(",")) {
    let half: Half | null = null;
    if (cursor.takePunct(";")) half = parseHalf(cursor);
    cursor.expectPunct(")");
    // One argument: a falling piece for `@@`, a bare address otherwise.
    return foreign
      ? { kind: "fall", which: first }
      : half === null
        ? { kind: "global" }
        : { kind: "feld", x: first, y: { kind: "number", value: 0 }, half };
  }

  const second = parseExpr(cursor, 1);
  let half: Half | null = null;
  if (cursor.takePunct(";")) half = parseHalf(cursor);
  cursor.expectPunct(")");
  return { kind: "feld", x: first, y: second, half };
}

/** `parser.yy`'s `haelften_spez`: `=`, `!`, `<`, `>`. */
function parseHalf(cursor: Cursor): Half {
  const token = cursor.next();
  if (token.kind !== "punct") cursor.fail("expected one of '=', '!', '<', '>'", token);
  switch (token.text) {
    case "=":
      return "here";
    case "!":
      return "opposite";
    case "<":
      return "left";
    case ">":
      return "right";
    default:
      return cursor.fail(`expected one of '=', '!', '<', '>' but found '${token.text}'`, token);
  }
}

/**
 * The upper bound after a `..`, or null when the comparison ends there.
 *
 * `x == 2 ..` is a complete comparison with the upper bound open, and upstream substitutes
 * `+VIEL` for it *in the parser* - which is why the bound is `null` in the tree rather than
 * 32767. `..` is the last thing in its production, so whether a bound follows is knowable
 * only by looking at what comes next: the end of the code, or a `;` or `)` that closes the
 * enclosing statement.
 */
function parseUpperBound(cursor: Cursor): Expr | null {
  const next = cursor.peek();
  if (next === undefined) return null;
  if (next.kind === "punct" && (next.text === ";" || next.text === ")")) return null;
  return parseExpr(cursor, LEVEL_OF_RANGE);
}

/**
 * Parse Cual code, which is statements rather than a bare expression.
 *
 * Rejects everything for now rather than returning a partial tree. Task 3.5's other half is
 * `if`, `switch`, `var`, `default`, assignments, `busy`, comma sequences and the draw and
 * effect commands; a parser that accepted some of them and ignored the rest would make
 * "all 81 levels parse" true for the wrong reason.
 */
export function parseCode(tokens: readonly Token[]): never {
  const cursor = new Cursor(tokens);
  if (cursor.atEnd()) {
    throw new CualSyntaxError("empty code block", 0, 0);
  }
  const token = cursor.next();
  // A plain `throw` rather than `cursor.fail`, so the `never` return type does not depend on
  // the caller proving that `fail` cannot return.
  throw new CualSyntaxError(
    `${describe(token)} starts a Cual statement, and the statement parser is not written ` +
      `yet (task 3.5). Only expressions parse so far.`,
    token.line,
    token.col,
  );
}