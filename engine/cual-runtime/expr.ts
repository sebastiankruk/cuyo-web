/**
 * Evaluating Cual expressions, and the operator table they are parsed with.
 *
 * The operators are upstream's and they are not JavaScript's, in two ways that matter
 * beyond `/` and `%`, which live in `divmod.ts`:
 *
 *  - **The six comparisons share one precedence level**, not six. `parser.yy` declares
 *    `%left EQ_TOK NE_TOK '<' '>' GE_TOK LE_TOK` on a single line, and `cual.6` lists them
 *    as one "Comparison" entry. So `a < b == c` parses as `a < (b == c)`.
 *  - **`:`, `!`, `==..`, unary `-` and `.` are non-associative.** `a : b : c` and `a . b . c`
 *    are syntax errors rather than grouped one way or the other.
 *
 * This module evaluates a tree. Precedence is a property of *parsing*, so it is not applied
 * here — but {@link PRECEDENCE} is exported from here anyway, because it would otherwise be
 * the same table twice over: once transcribed into the parser in task 3.5 and once into that
 * parser's test, where the two would drift. The table is ordered loosest binding first.
 *
 * Everything evaluates to an `int`. Bools are 0 and 1, as `cual.6` says, so there is no
 * separate boolean type to get wrong — the distinction is kept in the tests instead, because
 * a comparison returning `true` rather than `1` would break a level that adds to it.
 */

import { divv, modd } from "./divmod.ts";

/** The sentinel either side of an open-ended range: `parser.yy`'s `#define VIEL 32767`. */
export const RANGE_LIMIT = 32767;

/** Operators that take two operands, by their source spelling. */
export type BinaryOperator =
  | "||"
  | "&&"
  | "=="
  | "!="
  | "<"
  | ">"
  | "<="
  | ">="
  | "+"
  | "-"
  | ":"
  | "*"
  | "/"
  | "%"
  | "&"
  | "|"
  /** Set bits: `a .+ b` is `a | b`. Distinct from `.+=`, which assigns. */
  | ".+"
  /** Unset bits: `a .- b` is `a & ~b`. Distinct from `.-=`, which assigns. */
  | ".-"
  /**
   * Bit test: `a . b` is `a & b != 0`.
   *
   * Binary, which the precedence list makes easy to get wrong: it binds tightest of the
   * infix operators and reads like a member access or a range, but `parser.yy` has
   * `ausdruck '.' ausdruck` and `cual.6` spells the meaning out. An earlier draft of this
   * file had it as a prefix operator on a single operand.
   */
  | ".";

/** Operators that take one operand. */
export type UnaryOperator = "!" | "-";

/**
 * Which half of a cell a position refers to, for hex levels.
 *
 * `parser.yy`'s `haelften_spez`, whose four spellings are `=`, `!`, `<` and `>` inside the
 * parentheses of an `@(x, y; SPEC)`. Only meaningful when both coordinates are given.
 */
export type Half = "here" | "opposite" | "left" | "right";

/**
 * A blob's address, `parser.yy`'s `Ort`.
 *
 * Four shapes rather than one, because the grammar has four and they mean different things:
 * `global` and `semiglobal` name blobs, `fall` selects one of the two falling pieces by
 * `0` or `1`, and `feld` is a board cell by `(x, y)`. `half` is set only where the grammar
 * allows it, which is inside parentheses and after a `;`.
 */
export type Ort =
  // `half` is on every variant, not just `feld`, because upstream's is on `Ort` itself:
  // `setzeHaelfte` is called on whatever `absort_geklammert` produced, and that production
  // can be empty. `@@(;!)` - a semiglobal half a step to the right - and `@@(ziel-2;!)` -
  // a falling piece, half a step - are both in the corpus, and neither is a `feld`.
  | { readonly kind: "global"; readonly half: Half | null }
  | { readonly kind: "semiglobal"; readonly half: Half | null }
  /**
 * One coordinate. `relative` distinguishes `@(x)` — a falling-relative offset — from `@@(x)`,
 * which is `absort_fall` and an absolute half-fall index.
 */
  | {
      readonly kind: "fall";
      readonly which: Expr;
      readonly half: Half | null;
      readonly relative: boolean;
    }
  /**
   * Two coordinates. `relative` is the difference between `@(x,y)` and `@@(x,y)`, which are
   * *different productions* rather than two spellings of one: `relort_geklammert` builds a
   * relative `Ort` and `absort_geklammert` an absolute one. It has to be in the tree, because
   * `@(0,0)` and `@@(0,0)` name different cells.
   */
  | {
      readonly kind: "feld";
      readonly x: Expr;
      readonly y: Expr;
      readonly half: Half | null;
      readonly relative: boolean;
    };

/** Everything an expression can be. */
export type Expr =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "variable"; readonly name: string }
  | { readonly kind: "neighbour"; readonly pattern: string }
  | {
      readonly kind: "range";
      readonly value: Expr;
      /** null for an open lower bound, i.e. `x == .. 5`. */
      readonly lower: Expr | null;
      /** null for an open upper bound, i.e. `x == 2 ..`. */
      readonly upper: Expr | null;
    }
  | { readonly kind: "unary"; readonly op: UnaryOperator; readonly operand: Expr }
  | {
      readonly kind: "binary";
      readonly op: BinaryOperator;
      readonly left: Expr;
      readonly right: Expr;
    }
  | { readonly kind: "call"; readonly name: "rnd" | "gcd"; readonly args: readonly Expr[] }
  /**
   * A variable at an explicit address: `name@(x, y)`, `name@@(x, y)`, `name@()`, and so on.
   *
   * Split from the bare `variable` case because `parser.yy` has them as two productions
   * (`variable: lokale_variable | wort ort`), and because a bare variable takes no address
   * while this one always does. Evaluating it is task 4.7.
   */
  | { readonly kind: "positioned"; readonly name: string; readonly position: Ort };

/** How one operator associates. A parsing rule, kept beside the operator it applies to. */
export type Associativity = "left" | "nonassoc";

/** Where an operator sits relative to its operand. `-` appears twice, at levels 6 and 10. */
export type Position = "infix" | "prefix";

export interface PrecedenceLevel {
  readonly level: number;
  readonly ops: readonly string[];
  readonly position: Position;
  readonly associativity: Associativity;
}

/**
 * The operators, loosest binding first.
 *
 * Transcribed from `src/parser.yy`'s `%left` / `%nonassoc` declarations, which are the
 * authority; `cual.6` agrees with them and is the readable statement of the same thing. The
 * `;` and `,` levels and the `IF_PREC` / `ELSE_TOK` levels are statements rather than
 * expressions and are not here.
 *
 * `openspec/changes/cuyo-web/specs/cual-runtime/spec.md` lists the comparisons as six
 * increasing levels, and lists `.+=` / `.-=` among the operators. Both are wrong against the
 * grammar: the six comparisons are one level, and `.+=` / `.-=` are assignments while `.+` /
 * `.-` are the expression operators at `&` / `|` level. This table follows the grammar.
 */
export const PRECEDENCE: readonly PrecedenceLevel[] = [
  { level: 1, ops: ["||"], position: "infix", associativity: "left" },
  { level: 2, ops: ["&&"], position: "infix", associativity: "left" },
  { level: 3, ops: ["==", "!=", "<", ">", "<=", ">="], position: "infix", associativity: "left" },
  { level: 4, ops: ["==.."], position: "infix", associativity: "nonassoc" },
  { level: 5, ops: ["!"], position: "prefix", associativity: "nonassoc" },
  { level: 6, ops: ["+", "-"], position: "infix", associativity: "left" },
  { level: 7, ops: [":"], position: "infix", associativity: "nonassoc" },
  { level: 8, ops: ["*", "/", "%"], position: "infix", associativity: "left" },
  { level: 9, ops: ["&", "|", ".+", ".-"], position: "infix", associativity: "left" },
  { level: 10, ops: ["-"], position: "prefix", associativity: "nonassoc" },
  { level: 11, ops: ["."], position: "infix", associativity: "nonassoc" },
];

/**
 * What evaluating an expression can call out to.
 *
 * Injected rather than reached for, so the evaluator depends on no RNG and no board and can
 * be tested against a scripted sequence. Task 3.3 supplies the real implementation;
 * `engine/prng.ts` is already there to build it from.
 */
export interface EvalContext {
  /** Reads a user variable. Every value in the game is an `int`, so this is a `number`. */
  readonly variable: (name: string) => number;
  /** A value in `0 .. limit - 1`, as `Aufnahme::rnd`. Throws if `limit <= 0`. */
  readonly random: (limit: number) => number;
  /**
   * A variable reached through an address: `positioned`.
   *
   * Separate from `variable` rather than folded into it, because the two differ in *which
   * value* they see: `variable` reads the live array, and an addressed read reads the target's
   * beginning-of-step shadow (`getVariableVergangenheit`). Optional, so a context without
   * addressed access still evaluates everything else and an addressed variable in it throws by
   * name rather than reading something plausible.
   */
  readonly addressed?: (
    name: string,
    position: Ort,
    evaluate: (expr: Expr) => number,
  ) => number;
  /**
   * A neighbour pattern: `1???0???`, `0??1??0?` and the rest.
   *
   * Separate from `variable` and `addressed` for the same reason those are — each names a
   * different *value* — but this one needs a board rather than a single blob, and `neighbour`
   * is the only expression that does. Optional for the same reason: a context without a board
   * still evaluates everything else, and a pattern in it throws by name rather than answering
   * `0`, which every pattern would silently match against.
   *
   * `neighbourReader` in `access.ts` is the one to hand it.
   */
  readonly neighbour?: (pattern: string) => boolean;
}

/** Thrown for anything the language rules out at evaluation time. */
export class CualError extends Error {
  constructor(message: string) {
    super(`Cual: ${message}`);
    this.name = "CualError";
  }
}

/** An int, so nothing downstream has to wonder whether a `true` got in. */
function bool(value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Evaluate an expression.
 *
 * Left operands are evaluated before right ones everywhere, with one documented exception:
 * `:`, where upstream evaluates the right operand first and draws from the RNG before
 * touching the left. That order is reproduced because a level whose two operands both
 * consume randomness would otherwise desynchronise from upstream's, and the level would be
 * wrong in a way that only shows up as "the animation looks slightly off".
 */
export function evaluate(expr: Expr, ctx: EvalContext): number {
  switch (expr.kind) {
    case "number":
      return expr.value;

    case "variable":
      return ctx.variable(expr.name);

    case "neighbour":
      // `case nachbar_acode: return (b.getVariable(spezconst_connect) & mZahl) == mZahl2;`
      // — an int used as truth, so 1 and 0 are the whole of its range.
      //
      // Task 4.16, which is what read the pattern out of a blob's array. The mask arithmetic is
      // `neighbours.ts`'s (3.10) and the board behind it is `access.ts`'s; what is here is the
      // one line that turns the match into a number every other operator can consume.
      if (!ctx.neighbour) {
        throw new CualError(
          `a neighbour pattern needs a context with a board to read the blob's connections from`,
        );
      }
      return ctx.neighbour(expr.pattern) ? 1 : 0;

    case "positioned":
      if (!ctx.addressed) {
        throw new CualError(
          `addressed variable '${expr.name}' needs a context with addressed access`,
        );
      }
      // The coordinate inside an address is evaluated in the same context, so `@(rnd(2),0)`
      // draws from the simulation's sequence rather than a second generator.
      return ctx.addressed(expr.name, expr.position, (inner) => evaluate(inner, ctx));

    case "range":
      return evaluateRange(expr, ctx);

    case "unary":
      return evaluateUnary(expr.op, evaluate(expr.operand, ctx));

    case "call":
      return evaluateCall(expr, expr.args.map((a) => evaluate(a, ctx)), ctx);

    case "binary":
      return evaluateBinary(expr.op, expr.left, expr.right, ctx);
  }
}

/** `x == a .. b`, with either bound open. */
function evaluateRange(
  expr: Extract<Expr, { kind: "range" }>,
  ctx: EvalContext,
): number {
  const value = evaluate(expr.value, ctx);
  const lower = expr.lower === null ? -RANGE_LIMIT : evaluate(expr.lower, ctx);
  const upper = expr.upper === null ? RANGE_LIMIT : evaluate(expr.upper, ctx);
  return bool(value >= lower && value <= upper);
}

function evaluateUnary(op: UnaryOperator, operand: number): number {
  switch (op) {
    case "!":
      return bool(operand === 0);
    case "-":
      return -operand;
  }
}

function evaluateCall(
  expr: Extract<Expr, { kind: "call" }>,
  args: readonly number[],
  ctx: EvalContext,
): number {
  if (expr.name === "rnd") {
    const limit = args[0] ?? 0;
    // `code.cpp` throws on `w <= 0` rather than on `w == 0`, so `rnd(0)` and `rnd(-1)`
    // are the same error. A level guarding a count can reach both.
    if (limit <= 0) throw new CualError(`rnd(${limit})`);
    return ctx.random(limit);
  }

  // Task 3.3 supplies this against the real RNG; the Euclidean loop is here so the operator
  // is evaluable and so the call has one implementation rather than two.
  const [a = 0, b = 0] = args;
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Binary operators.
 *
 * Both operands arrive unevaluated, because three operators need to decide what to evaluate:
 * `&&` and `||` skip the right, and `:` evaluates the right first, draws, and only then
 * touches the left.
 */
function evaluateBinary(
  op: BinaryOperator,
  leftExpr: Expr,
  rightExpr: Expr,
  ctx: EvalContext,
): number {
  // `:`, first and separately, because it is the one operator whose operand order is not
  // left-then-right. `code.cpp` evaluates `mF2`, checks it is non-zero, draws, and only then
  // evaluates `mF1`. Evaluating the left first would put a level whose two operands both
  // consume randomness one draw out of step with upstream, which shows up as an animation
  // that is subtly wrong rather than as anything that fails.
  if (op === ":") {
    const limit = evaluate(rightExpr, ctx);
    if (limit === 0) throw new CualError(`probability x:${limit}`);
    return bool(ctx.random(limit) < evaluate(leftExpr, ctx));
  }

  const left = evaluate(leftExpr, ctx);

  // Short-circuiting, as C's does, and not as an optimisation: `&&` guarding a division, or
  // `||` guarding a `rnd(0)` that throws, is how levels write conditions. `Aufnahme::rnd`
  // advances the simulation's sequence, so a skipped right operand also means one fewer
  // draw — which is observable in a replay.
  if (op === "||") return left !== 0 ? 1 : bool(evaluate(rightExpr, ctx) !== 0);
  if (op === "&&") return left === 0 ? 0 : bool(evaluate(rightExpr, ctx) !== 0);

  // `:`, `||` and `&&` are absent from this switch, and that is the point: the returns above
  // narrow `op` to everything else, so adding an operator to `BinaryOperator` without giving
  // it a case here is a type error rather than a runtime `undefined`.
  const right = evaluate(rightExpr, ctx);
  switch (op) {
    case "==":
      return bool(left === right);
    case "!=":
      return bool(left !== right);
    case "<":
      return bool(left < right);
    case ">":
      return bool(left > right);
    case "<=":
      return bool(left <= right);
    case ">=":
      return bool(left >= right);

    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    // Flooring, not JavaScript's truncation. See divmod.ts for why that matters.
    case "/":
      return divv(left, right);
    case "%":
      return modd(left, right);

    case "&":
      return left & right;
    case "|":
      return left | right;
    // `code.h` defines `bitset_acode` as `bitor_acode`, so `.+` is `|` spelled differently.
    case ".+":
      return left | right;
    // Upstream writes `a & (-1 - b)` rather than `a & ~b`. The same value in two's
    // complement, kept in that form so the correspondence with the source is checkable.
    case ".-":
      return left & (-1 - right);
    // `cual.6`: "a.b is the same as a&b != 0". Tightest-binding infix operator, and the one
    // most easily mistaken for a range or a member access.
    case ".":
      return bool((left & right) !== 0);
  }
}