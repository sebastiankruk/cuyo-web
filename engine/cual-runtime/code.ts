/**
 * Parsing Cual code into a tree of statements.
 *
 * `parse.ts` takes an expression and stops. This takes a whole `<< >>` block and produces
 * {@link Stmt} nodes, transcribed from `parser.yy`'s `code`, `code_1`, `code_zeile` and
 * `set_zeile`.
 *
 * ## The one shape that is not a tree
 *
 * `code_1 ',' code_1` is left-recursive in the grammar and builds `folge_code`, and that is
 * **not** a sequence in the sense `;` is. `;` runs both halves now; `,` runs one member per
 * step, which is how a level animates over time. The distinction is the whole reason the two
 * punctuators exist, so `commaSequence` and `sequence` are separate node kinds rather than
 * one node with a flag — a caller that forgets which is which would animate a level
 * instantly or never, and both are silent.
 *
 * ## Arrows carry data, not just direction
 *
 * `->` and `=>` are the same token with different values (`ohne_merk_pfeil` / `mit_merk_pfeil`),
 * and the grammar folds that value into the condition node: `->` re-tests every step, `=>`
 * latches. So both `if` and each `switch` case record which arrow was written. `else` may
 * itself have an arrow, which upstream accepts deliberately — "you probably don't want one
 * when an `if` follows immediately" — so it is recorded separately from the `if`'s arrow.
 *
 * ## `code_1` may not contain a `;`
 *
 * Upstream says so in a comment and enforces it by having no production for it. A statement
 * that needs two of them is written `{ ... }`, and this parser refuses the flat form rather
 * than silently accepting a program upstream rejects.
 */

import type { Token } from "../level-format/lexer.ts";
import { CualSyntaxError } from "./parse.ts";
import type { Expr, Ort } from "./expr.ts";

/** The eight assignment operators, by their source spelling. */
export type AssignOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | ".+=" | ".-=";

/** One `switch` case. */
export interface SwitchCase {
  /**
   * So a case is addressable like any other node.
   *
   * It was not a discriminated variant, because nothing walked into cases before slot
   * allocation did. A case is a `bedingung_code` upstream and owns two busy flags of its
   * own, so it has to be findable from the node it hangs off - keyed here, and by identity.
   */
  readonly kind: "switchCase";
  /** The condition, as written. */
  readonly condition: Expr;
  readonly body: Stmt;
  /** True for `=>`, which latches; false for `->`, which re-tests every step. */
  readonly latching: boolean;
  /** A second body, for `cond -> a; -> b;` — the arrow on the far side. */
  readonly otherwise: Stmt | null;
}

/** One `var` declaration. */
export interface VarDeclaration {
  readonly name: string;
  /** Version specifiers, empty for an unqualified declaration. */
  readonly versions: readonly string[];
  /** `var x = 4` declares with an initial value; `var x` alone does not. */
  readonly initial: Expr | null;
  /** True for `var x = 4 : reapply`. */
  readonly reapply: boolean;
}

/** One `default` declaration: an initial value for a variable. */
export interface DefaultDeclaration {
  readonly name: string;
  readonly versions: readonly string[];
  readonly value: Expr;
  /** True for `name: reapply`, which re-applies on kind change rather than once. */
  readonly reapply: boolean;
}

/** Everything a Cual block can contain. */
export type Stmt =
  /** `a; b; c` — each part runs now, in order. */
  | { readonly kind: "sequence"; readonly body: readonly Stmt[] }
  /** `{ ... }` — grouping, so a `;` sequence can appear where one statement may. */
  | { readonly kind: "block"; readonly body: readonly Stmt[] }
  /** `a, b, c` — one part per step. The animation mechanism. */
    /**
   * Exactly two members, never more: `code_1: code_1 ',' code_1` is binary and `a, b, c`
   * nests to the left. See `parseCode1`.
   */
  | { readonly kind: "commaSequence"; readonly parts: readonly [Stmt, Stmt] }
  | {
      readonly kind: "if";
      readonly condition: Expr;
      readonly then: Stmt;
      readonly otherwise: Stmt | null;
      /** The arrow on the `if`: `=>` latches. */
      readonly latching: boolean;
      /** The arrow after `else`, when there is one. Recorded separately on purpose. */
      readonly elseLatching: boolean | null;
    }
  | { readonly kind: "switch"; readonly cases: readonly SwitchCase[] }
  /** One `switch` case, i.e. one upstream `bedingung_code`. */
  | SwitchCase
  | {
      readonly kind: "assign";
      readonly target: Expr;
      readonly operator: AssignOperator;
      readonly value: Expr;
    }
  /** `[x = e] body` — a value pushed for the duration of one statement. */
  | { readonly kind: "scoped"; readonly variable: string; readonly value: Expr; readonly body: Stmt }
  | { readonly kind: "busy" }
  /** `*`, `*@(x,y)` or `@(x,y)*` — the draw shorthand. */
  | { readonly kind: "draw"; readonly position: Ort | null }
  /** A single letter optionally followed by a position: `A`, `A@(2,3)`. */
  | { readonly kind: "letterDraw"; readonly letter: number; readonly position: Ort | null }
  | {
      readonly kind: "effect";
      readonly name: "bonus" | "message" | "sound" | "explode" | "lose";
      readonly argument: Expr | null;
      /** For `message` and `sound`, which name a file rather than evaluate a number. */
      readonly filename: string | null;
    }
  /** `name` or `&name` — a procedure call, the latter without copying the definition. */
  | { readonly kind: "call"; readonly name: string; readonly sharesDefinition: boolean }
  /** A bare number used as a statement: it means nothing and is legal. */
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "nothing" }
  | { readonly kind: "varDecl"; readonly declarations: readonly VarDeclaration[] }
  | { readonly kind: "defaultDecl"; readonly declarations: readonly DefaultDeclaration[] }
  | {
      readonly kind: "procedureDef";
      readonly name: string;
      readonly versions: readonly string[];
      readonly body: Stmt;
    }
  | { readonly kind: "include"; readonly name: string };

export { CualSyntaxError };

/**
 * The text of a punctuation token `offset` ahead, or null.
 *
 * Written as a function because TypeScript will not narrow one `peek()` call using another,
 * and there are a dozen places that need "is this a `;`?" - each spelled out inline, each a
 * place where the two calls could drift apart and quietly stop matching.
 */
function punctAhead(cursor: SharedCursor, offset = 0): string | null {
  const token = cursor.peek(offset);
  return token?.kind === "punct" ? token.text : null;
}

/**
 * Whether an address follows: `@` or `@@`.
 *
 * Two spellings and *two token kinds*: `scanner.ll` returns `@@` as a named operator
 * (`FREMD_TOK`) and `@` as a bare character. Checking only for punctuation therefore sees
 * half of every address in the language - `7A*@@(col,row)` in aliens.ld left its whole
 * `@@(col,row)` behind to be read as a statement, and 52 blocks reported `expected '}'`.
 */
function isOrtAhead(cursor: SharedCursor, offset = 0): boolean {
  const token = cursor.peek(offset);
  if (token?.kind === "punct") return token.text === "@";
  return token?.kind === "operator" && token.text === "@@";
}

/** Whether a punctuation token `offset` ahead equals `text`. */
function isPunctAhead(cursor: SharedCursor, text: string, offset = 0): boolean {
  return punctAhead(cursor, offset) === text;
}

/** Whether an arrow token `offset` ahead is present. */
function isArrowAhead(cursor: SharedCursor, offset = 0): boolean {
  return cursor.peek(offset)?.kind === "arrow";
}

/** Reaches into the expression parser for the shared cursor and helpers. */
import {
  parseExpressionBeforeColon,
  parseOrtFor,
  makeCursor,
  type Cursor as SharedCursor,
} from "./parse.ts";

/** Parses a whole Cual block: `<< ... >>`'s contents, as a flat token list. */
export function parseCode(tokens: readonly Token[]): Stmt[] {
  const cursor = makeCursor(tokens);
  const lines: Stmt[] = [];
  while (!cursor.atEnd()) {
    const before = cursor.mark();
    lines.push(parseCodeLine(cursor));
    // A loop that can spin forever is a defect in its own right, and it presents as an
    // out-of-memory crash with no location rather than as a parse error. Found by running
    // the corpus: `1 -> busy` reached the loop with the cursor on the arrow and returned
    // without consuming it, so it looped until the heap ran out. Naming the condition is the
    // fix; the underlying mistake it hides is a separate bug and this says where it is.
    if (cursor.mark() === before) {
      const token = cursor.peek();
      cursor.fail(
        `internal: parsing ${token === undefined ? "the end" : "a statement"} consumed ` +
          `nothing, which would loop forever`,
        token,
      );
    }
  }
  if (lines.length === 0) {
    throw new CualSyntaxError("empty code block", 0, 0);
  }
  return lines;
}

/**
 * One `code_zeile`: a declaration or an include, or a whole `code`.
 *
 * `code_zeile` is the top level of a block, and only three things are declarations. Everything
 * else is ordinary code. Distinguishing them by lookahead rather than by trying each and
 * backtracking keeps the error messages honest: a mistyped `var` says so.
 */
function parseCodeLine(cursor: SharedCursor): Stmt {
  const token = cursor.peek();
  if (token?.kind === "keyword") {
    if (token.text === "var") return parseVarDecl(cursor);
    if (token.text === "default") return parseDefaultDecl(cursor);
    if (token.text === "include") return parseInclude(cursor);
  }
  // `proc_def_wort version '=' code_1 ';'`. Probed for *any* leading word and rewound on
  // failure, because the only reliable test is whether an `=` with a statement after it
  // turns up. An earlier version skipped the probe when the token after the name was
  // punctuation, which is wrong for exactly the forms that need it: `Gras = if ...` and
  // `werbung[easy] = { ... }` both have `=` or `[` next, and both are definitions.
  if (token?.kind === "word") {
    const save = cursor.mark();
    const procedure = tryParseProcedureDef(cursor);
    if (procedure !== null) return procedure;
    cursor.reset(save);
  }
  return parseCodeSequence(cursor);
}

/** `name[versions] = body;`, or null when this is not a definition. */
function tryParseProcedureDef(cursor: SharedCursor): Stmt | null {
  const name = parseDottedWord(cursor);
  const versions = isPunctAhead(cursor, "[") ? parseVersionList(cursor) : [];
  if (!cursor.takePunct("=")) return null;
  const body = parseCode1(cursor);
  // The trailing `;` is what distinguishes a definition from an assignment, and requiring it
  // is not pedantry: `zaehler = 2` is a *statement* assigning to `zaehler`, and treating it
  // as `zaehler = (2)` as a procedure definition silently rewrites every assignment in the
  // corpus. Bison separates the two by exactly this token.
  if (!cursor.takePunct(";")) return null;
  return { kind: "procedureDef", name, versions, body };
}

/** `punktwort`: `name`, `name.name`, or `name.A` with the letter spelled back out. */
function parseDottedWord(cursor: SharedCursor): string {
  const first = cursor.next();
  if (first.kind !== "word") cursor.fail("expected a procedure name", first);
  let name = first.text;
  while (isPunctAhead(cursor, ".")) {
    cursor.next();
    const part = cursor.next();
    if (part.kind === "word") {
      name += `.${part.text}`;
    } else if (part.kind === "letter") {
      // `punktwort '.' BUCHSTABE_TOK` spells the letter back into the name.
      name += `.${letterName(part.value)}`;
    } else {
      cursor.fail("expected a name after '.'", part);
    }
  }
  return name;
}

/** `letterName` in reverse: 0-25 are `A`-`Z` and 26-51 are `a`-`z`. */
function letterName(value: number): string {
  return value >= 26
    ? String.fromCharCode(97 + (value - 26))
    : String.fromCharCode(65 + value);
}

/** `['2', 'hard']` — versions are numbers or words. */
function parseVersionList(cursor: SharedCursor): string[] {
  cursor.expectPunct("[");
  const versions: string[] = [];
  for (;;) {
    const token = cursor.next();
    if (token.kind === "string" || token.kind === "word") {
      versions.push(token.text);
    } else if (token.kind === "number") {
      versions.push(String(token.value));
    } else {
      cursor.fail("expected a version", token);
    }
    if (cursor.takePunct(",")) continue;
    cursor.expectPunct("]");
    return versions;
  }
}

/** `var a, b[2];` */
function parseVarDecl(cursor: SharedCursor): Stmt {
  cursor.next();
  const declarations: VarDeclaration[] = [];
  for (;;) {
    const token = cursor.next();
    if (token.kind !== "word") cursor.fail("expected a variable name", token);
    const versions = isPunctAhead(cursor, "[") ? parseVersionList(cursor) : [];
    // `var_def` ends in `unechter_default`, which is either nothing or `= value`. So
    // `var xc = 4;` is a declaration with an initial value, not two statements - and the
    // corpus uses it, in 36 blocks.
    let initial: Expr | null = null;
    let reapply = false;
    if (cursor.takePunct("=")) {
      initial = parseExpressionBeforeColon(cursor);
      if (cursor.takePunct(":")) {
        reapply = true;
        const keyword = cursor.next();
        if (keyword.kind !== "keyword" || keyword.text !== "reapply") {
          cursor.fail("expected 'reapply' after ':'", keyword);
        }
      }
    }
    declarations.push({ name: token.text, versions, initial, reapply });
    if (cursor.takePunct(",")) continue;
    cursor.takePunct(";");
    return { kind: "varDecl", declarations };
  }
}

/** `default a = 3, b = 4:reapply;` */
function parseDefaultDecl(cursor: SharedCursor): Stmt {
  cursor.next();
  const declarations: DefaultDeclaration[] = [];
  for (;;) {
    const token = cursor.next();
    if (token.kind !== "word") cursor.fail("expected a variable name", token);
    const versions = isPunctAhead(cursor, "[") ? parseVersionList(cursor) : [];
    if (!cursor.takePunct("=")) cursor.fail("expected '=' in a default declaration");
    // Parsed at a level tighter than `:`, because in a default declaration the colon is
    // not the probabilistic operator - it introduces `reapply`.
    const value = parseExpressionBeforeColon(cursor);
    let reapply = false;
    if (cursor.takePunct(":")) {
      const keyword = cursor.next();
      if (keyword.kind !== "keyword" || keyword.text !== "reapply") {
        cursor.fail("expected 'reapply' after ':'", keyword);
      }
      reapply = true;
    }
    declarations.push({ name: token.text, versions, value, reapply });
    if (cursor.takePunct(",")) continue;
    cursor.takePunct(";");
    return { kind: "defaultDecl", declarations };
  }
}

/** `include "file";` */
function parseInclude(cursor: SharedCursor): Stmt {
  cursor.next();
  const token = cursor.next();
  if (token.kind !== "word" && token.kind !== "string") {
    cursor.fail("expected a file name after 'include'", token);
  }
  cursor.takePunct(";");
  return { kind: "include", name: token.text };
}

/**
 * `code`: `code_1` or `code_1 ';' code`.
 *
 * Left-recursive in the grammar and built with `stapel_code`; here it is a list, because a
 * list is what a caller wants and the associativity of `;` is not observable from outside.
 */
function parseCodeSequence(cursor: SharedCursor): Stmt {
  // `code_1` has an empty production, so `{}` and a trailing `;` are both legal and mean
  // `nop_code`. Checked here rather than in `parseCode1` because a `parseCode1` that returns
  // without consuming would make the loop in `parseCode` spin forever - which it did, on
  // `{ } , { }` in schemen.ld, until the heap ran out.
  if (isBlockEnd(cursor)) return { kind: "nothing" };
  const parts: Stmt[] = [parseCode1(cursor)];
  while (cursor.takePunct(";")) {
    // A trailing `;` before `>>` or `}` is a separator with nothing after it.
    if (isBlockEnd(cursor)) break;
    parts.push(parseCode1(cursor));
  }
  if (parts.length === 1) return parts[0]!;
  return { kind: "sequence", body: parts };
}

/**
 * Whether the statement here may be empty.
 *
 * `code_1` has an empty production, so it can be empty in three places: before a `,`
 * between comma-sequence members, before the `;` that ends one - `switch { gemalt -> ; ... }`
 * in angst.ld is a case whose body does nothing - and at the end of a block.
 *
 * Allowing it before `;` is the riskier of the two, because a missing statement and an
 * empty one look the same. Upstream resolves it with LALR tables and a hand-written parser
 * cannot, and the alternative - refusing - rejects a construct the corpus uses sixteen times.
 */
function isEmptyMemberAhead(cursor: SharedCursor): boolean {
  return isPunctAhead(cursor, ",") || isPunctAhead(cursor, ";") || isBlockEnd(cursor);
}

/** Whether the next token closes the enclosing block rather than continuing a statement. */
function isBlockEnd(cursor: SharedCursor): boolean {
  const token = cursor.peek();
  if (token === undefined) return true;
  if (token.kind === "endCode") return true;
  return token.kind === "punct" && (token.text === "}" || token.text === ")");
}

/**
 * One statement, including any comma sequence.
 *
 * `code_1: code_1 ',' code_1` binds tighter than `;` (`code: code_1 ';' code`), so the commas
 * are collected here rather than in `parseCodeSequence`: in `a ; b , c` the comma belongs to
 * `b`, giving `a ; (b , c)` - one animated pair after one immediate statement. Collecting it
 * at the `;` level would have grouped it as `(a ; b) , c` and run the last member on the same
 * step as the first two.
 *
 * This is the animation mechanism, and the distinction from `;` is the whole reason both
 * punctuators exist.
 */
function parseCode1(cursor: SharedCursor): Stmt {
  // An empty member is legal, and `code_1` can be empty between commas:
  // `if 1:5 => {,,,,,version=rnd(3)}` in aliens.ld is a comma sequence whose first five
  // members do nothing. Only legal *here* - at the start of a `code` the same check is
  // `isBlockEnd`, and a `,` there is a real separator.
  const first: Stmt = isEmptyMemberAhead(cursor)
    ? { kind: "nothing" }
    : parseCode1Single(cursor);
  if (!isPunctAhead(cursor, ",")) return first;

  // **Left-nested and binary**, because `code_1: code_1 ',' code_1` is: `a, b, c` is
  // `folge_code(folge_code(a, b), c)`, and *each* of those is a node with a busy flag of its
  // own. Collecting the members into one flat list was wrong in a way that looked harmless:
  // it parsed, it walked, and it allocated one slot instead of n-1 - so of the 250 comma
  // sequences in the corpus only 48 have two members, one has 114, and the flags are all
  // wrong. One bool cannot index a flat list anyway; the flag says "my second member is
  // next", and the nesting is what makes that mean anything.
  //
  // So `parts` is a two-tuple rather than an array, which puts the binary shape in the type
  // instead of in a comment.
  let node: Stmt = first;
  while (cursor.takePunct(",")) {
    // An empty member is legal on either side of a comma, since `code_1` may be empty:
    // `{,,,,,version=rnd(3)}` in aliens.ld and bunt.ld. It has to be *pushed*, not treated
    // as the end of the sequence - stopping there left four commas and a statement behind,
    // and the enclosing `{` then asked for a `}` that had already gone past.
    const next: Stmt = isEmptyMemberAhead(cursor)
      ? { kind: "nothing" }
      : parseCode1Single(cursor);
    node = { kind: "commaSequence", parts: [node, next] };
  }
  return node;
}

/** One statement, with no comma sequence attached. */
function parseCode1Single(cursor: SharedCursor): Stmt {
  const token = cursor.peek();
  if (token === undefined) cursor.fail("unexpected end of code");

  if (token.kind === "punct") {
    if (token.text === "{") {
      cursor.next();
      const inner = parseCodeSequence(cursor);
      cursor.expectPunct("}");
      return { kind: "block", body: [inner] };
    }
    if (token.text === "[") return parseScoped(cursor);
    if (token.text === "&") {
      cursor.next();
      return { kind: "call", name: parseDottedWord(cursor), sharesDefinition: true };
    }
    if (token.text === "*") return parseDraw(cursor);
  }

  if (token.kind === "keyword") {
    switch (token.text) {
      case "if":
        return parseIf(cursor);
      case "switch":
        return parseSwitch(cursor);
      case "busy":
        cursor.next();
        return { kind: "busy" };
      case "bonus":
        return parseEffect(cursor, "bonus", "expression");
      case "message":
        return parseEffect(cursor, "message", "file");
      case "sound":
        return parseEffect(cursor, "sound", "file");
      case "explode":
        cursor.next();
        return { kind: "effect", name: "explode", argument: null, filename: null };
      case "lose":
        cursor.next();
        return { kind: "effect", name: "lose", argument: null, filename: null };
      default:
        cursor.fail(`'${token.text}' cannot start a statement`, token);
    }
  }

  if (token.kind === "letter") return parseLetterDraw(cursor);

  if (token.kind === "word") {
    // Either an assignment, a procedure call, or a dotted name.
    const save = cursor.mark();
    const assigned = tryParseAssignment(cursor);
    if (assigned !== null) return assigned;
    cursor.reset(save);
    return { kind: "call", name: parseDottedWord(cursor), sharesDefinition: false };
  }

  if (token.kind === "number" || token.kind === "zeroOne") {
    // No assignment probe here, deliberately. `set_zeile` starts with `variable`, and
    // `variable` is a word or a letter — never a number — so a number can never be an
    // assignment target. Probing for one anyway made `1*` parse as `1 * <missing operand>`
    // and fail with "unexpected end of code", when it is in fact `code_1: zahl` followed by
    // `code_1: buch_stern` — a number that means nothing, then a draw. `Baelle1={...;1*}` is
    // that shape, and 11 blocks are.
    //
    // `code_1: zahl buch_stern` builds `stapel_code(zahl, buch_stern)` - a sequence of two
    // statements. Written `2 R *` in schemen.ld, so it occurs.
    const after = cursor.peek(1);
    const startsSternAt =
      after?.kind === "letter" || (after?.kind === "punct" && after.text === "*");
    if (startsSternAt || isOrtAhead(cursor, 1)) {
      const number: Stmt = { kind: "number", value: token.value };
      cursor.next();
      return { kind: "sequence", body: [number, parseBuchStern(cursor)] };
    }
    // `cursor.next()` before the return. A bare number as a statement is legal and means
    // nothing - `9;` opens a long run of draws in aliens.ld - and this path returned the
    // node without consuming it, so the loop above had made no progress and `parseCode`'s
    // guard fired. Read here as "the number was never parsed", which is a confusing way to
    // learn that.
    cursor.next();
    return { kind: "number", value: token.value };
  }

  // `ort '*'` and `ausdruck '*'`: the draw shorthand with a position in front.
  if (startsWithOrt(cursor)) {
    return parseDraw(cursor);
  }

  cursor.fail(`cannot start a statement here`, token);
}

/**
 * `buch_stern`: a letter, a `*`, or an address followed by `*`.
 *
 * All three are the same production's alternatives, and which one it is depends only on
 * which token comes first. Needed separately from `parseCode1Single` because
 * `code_1: zahl buch_stern` needs it *without* a statement separator - `Baelle1={...;1*}` has
 * no `;` between the `1` and the `*`, and a parser that only recognised a following letter
 * stopped the statement there and then asked for the closing brace.
 */
function parseBuchStern(cursor: SharedCursor): Stmt {
  if (isPunctAhead(cursor, "*") || isOrtAhead(cursor)) return parseDraw(cursor);
  return parseLetterDraw(cursor);
}

/**
 * `buch_stern`: a letter, optionally followed by a position.
 *
 * `A` on its own is a draw command, and `A@(2,3)` draws at a place. The same two shapes as
 * `stern_at`, with the letter in front - which is why the letter branch is a function rather
 * than inline: `code_1: zahl buch_stern` needs it too.
 */
function parseLetterDraw(cursor: SharedCursor): Stmt {
  const letter = cursor.next();
  if (letter.kind !== "letter") cursor.fail("expected a letter", letter);
  // `buch_stern: BUCHSTABE_TOK stern_at`, and `stern_at` is `'*' | '*' ort | ort '*'`. So all
  // three of `R`, `R*`, `R*@(1)` and `R@(1)*` are one letter followed by one `stern_at`.
  //
  // The last of those is `Y@(1)*` in 3d.ld, and consuming only the address left the star to
  // be read as a statement of its own - which is why 55 blocks reported `expected '}'`.
  let position: Ort | null = null;
  if (isPunctAhead(cursor, "*")) {
    cursor.next();
    position = isOrtAhead(cursor) ? takeOrt(cursor) : null;
  } else if (isOrtAhead(cursor)) {
    position = takeOrt(cursor);
    if (!cursor.takePunct("*")) cursor.fail("expected '*' after a letter's position");
  }
  return { kind: "letterDraw", letter: letter.value, position };
}

/** `set_zeile`: `variable` followed by one of the eight assignment operators. */
function tryParseAssignment(cursor: SharedCursor): Stmt | null {
  const target = parseExpression2(cursor);
  const token = cursor.peek();
  const text = operatorSpelling(token);
  if (text === null || !isAssignOperator(text)) return null;
  cursor.next();
  const value = parseExpression2(cursor);
  return { kind: "assign", target, operator: text, value };
}

function isAssignOperator(text: string): text is AssignOperator {
  return ["=", "+=", "-=", "*=", "/=", "%=", ".+=", ".-="].includes(text);
}

function operatorSpelling(token: Token | undefined): string | null {
  if (token?.kind === "operator" || token?.kind === "punct") return token.text;
  return null;
}

/** Whether the tokens ahead form `ort '*'`. */
function startsWithOrt(cursor: SharedCursor): boolean {
  return isOrtAhead(cursor);
}

/** `[x = e] code_1` — `push_code`. */
function parseScoped(cursor: SharedCursor): Stmt {
  cursor.expectPunct("[");
  const name = cursor.next();
  if (name.kind !== "word") {
    cursor.fail("expected a variable name after '['", name);
  }
  if (!cursor.takePunct("=")) cursor.fail("expected '=' in a scoped block");
  const value = parseExpression2(cursor);
  cursor.expectPunct("]");
  return { kind: "scoped", variable: name.text, value, body: parseCode1(cursor) };
}

/** `*`, `* ort`, or `ort *`. */
function parseDraw(cursor: SharedCursor): Stmt {
  if (isPunctAhead(cursor, "*")) {
    cursor.next();
    const position = isOrtAhead(cursor) ? takeOrt(cursor) : null;
    return { kind: "draw", position };
  }
  const position = takeOrt(cursor);
  if (!cursor.takePunct("*")) cursor.fail("expected '*' after a position");
  return { kind: "draw", position };
}

/** `if cond -> then`, `... else otherwise`, `... else -> otherwise`. */
function parseIf(cursor: SharedCursor): Stmt {
  cursor.next();
  const condition = parseExpression2(cursor);
  const arrow = takeArrow(cursor);
  const then = parseCode1(cursor);
  let otherwise: Stmt | null = null;
  let elseLatching: boolean | null = null;

  const next = cursor.peek();
  if (next?.kind === "keyword" && next.text === "else") {
    cursor.next();
    // `else` may carry its own arrow, and upstream accepts it deliberately.
    if (isArrowAhead(cursor)) {
      elseLatching = takeArrow(cursor);
    }
    otherwise = parseCode1(cursor);
  }

  return { kind: "if", condition, then, otherwise, latching: arrow, elseLatching };
}

/** `switch { cond -> body; cond -> body; => body; }` */
function parseSwitch(cursor: SharedCursor): Stmt {
  cursor.next();
  cursor.expectPunct("{");
  const cases: SwitchCase[] = [];
  while (!cursor.atEnd() && !isSwitchEnd(cursor)) {
    cases.push(parseSwitchCase(cursor));
  }
  cursor.expectPunct("}");
  if (cases.length === 0) cursor.fail("a switch needs at least one case");
  return { kind: "switch", cases };
}

function isSwitchEnd(cursor: SharedCursor): boolean {
  const token = cursor.peek();
  return token?.kind === "punct" && token.text === "}";
}

/**
 * One case.
 *
 * `auswahl_liste` has three shapes: a plain body, a body plus an arrow-led second body, and
 * a chain into further cases. The chain is flattened here into `cases`, because a linked list
 * of cases is not what anything downstream wants to walk — and because the flat form makes
 * "the last case in the list" visible, which is what the default branch of the `switch`
 * evaluation depends on.
 */
function parseSwitchCase(cursor: SharedCursor): SwitchCase {
  const condition = parseExpression2(cursor);
  const latching = takeArrow(cursor);
  const body = parseCode1(cursor);
  cursor.expectPunct(";");

  let otherwise: Stmt | null = null;
  if (isArrowAhead(cursor)) {
    // The grammar's second shape is `ausdruck PFEIL code_1 ';' PFEIL code_1 ';'`, so the
    // arrow belongs to this second body and has to be consumed *before* it. Parsing the body
    // with the arrow still in front failed on it, and this is the shape every `switch` in
    // the corpus ends with - `-> gemalt=0;` as the default case.
    takeArrow(cursor);
    otherwise = parseCode1(cursor);
    cursor.expectPunct(";");
  }
  return { kind: "switchCase", condition, body, latching, otherwise };
}

/** `->` and `=>` are the same token with a value, so read it as one. */
function takeArrow(cursor: SharedCursor): boolean {
  const token = cursor.next();
  if (token.kind !== "arrow") {
    cursor.fail("expected '->' or '=>'", token);
  }
  return token.latching;
}

/** `bonus(e)`, `message("file")`, `sound("file")`. */
function parseEffect(
  cursor: SharedCursor,
  name: "bonus" | "message" | "sound",
  argumentKind: "expression" | "file",
): Stmt {
  cursor.next();
  cursor.expectPunct("(");
  if (argumentKind === "expression") {
    const argument = parseExpression2(cursor);
    cursor.expectPunct(")");
    return { kind: "effect", name, argument, filename: null };
  }
  const token = cursor.next();
  if (token.kind !== "word" && token.kind !== "string") {
    cursor.fail(`expected a file name in ${name}(...)`, token);
  }
  cursor.expectPunct(")");
  return { kind: "effect", name, argument: null, filename: token.text };
}

/** `@(x,y)` or `@@(x,y)` at a use site. */
function takeOrt(cursor: SharedCursor): Ort {
  return parseOrtFor(cursor);
}

/**
 * An expression, stopping before `;`, `,` and `}`.
 *
 * `parseExpression` insists on reaching the end of its input, which is right at an
 * expression's own use site and wrong here: the expression parser needs to hand control back
 * so the statement layer can see the terminator. So the statement layer owns the cursor and
 * asks for one expression from it.
 */
function parseExpression2(cursor: SharedCursor): Expr {
  return parseExpressionFrom(cursor);
}

// Imported at the bottom to keep the statement rules together above.
import { parseExpressionFrom } from "./parse.ts";