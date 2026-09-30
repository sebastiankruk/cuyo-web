/**
 * Parser for Cuyo's `.ld` level description files.
 *
 * The grammar is transcribed from upstream `src/parser.yy`, which is small:
 *
 * ```text
 *   file        := { definition | code }
 *   definition  := name [ '[' version { ',' version } ']' ] '=' value
 *   value       := '{' { definition | code } '}' | list
 *   list        := item { ',' item }
 *   item        := word | string | number | word '*' count
 *   count       := zahl | '<' expression '>'
 * ```
 *
 * The result is a node tree mirroring upstream's `Knoten` classes, not a resolved
 * `LevelDef`. Resolution is deliberately a separate step (tasks 2.3 to 2.12):
 * `<...>` arithmetic, version selection, kind declarations and `startdist` all
 * need to read the same tree, and folding them in here would make each untestable
 * on its own.
 *
 * Two constructs are captured but deliberately not interpreted:
 *
 *  - `word '*' count` becomes a `repeat` node, so 2.3 expands it in one place
 *    rather than at three call sites.
 *  - `<...>` becomes an `expr` node holding its raw tokens, so 2.3 can evaluate
 *    it against the names defined so far, which is what upstream does by looking
 *    definitions up in the enclosing node as it reduces.
 *
 * A non-section value is always a list, even when it holds a single item, because
 * that is what `rechts_von_def: def_liste` produces. `ListenzKnoten::getEinzigesDatum`
 * exists precisely to unwrap that one-item case.
 *
 * Cual blocks are captured as token runs and attached to the definition they
 * appear inside, mirroring upstream, where the codes store themselves into the
 * current definition node. They are compiled in group 3.
 */

import { tokenize } from "./lexer.ts";
import type { Token } from "./lexer.ts";

export interface LdPos {
  readonly line: number;
  readonly col: number;
}

/** A single value as written in the file. */
export type LdValue =
  | { readonly type: "word"; readonly text: string }
  | { readonly type: "string"; readonly text: string }
  | { readonly type: "number"; readonly value: number };

export type LdNode = LdDatum | LdList | LdSection | LdRepeat | LdExpr;

export interface LdDatum {
  readonly type: "datum";
  readonly value: LdValue;
  readonly pos: LdPos;
}

export interface LdList {
  readonly type: "list";
  readonly items: readonly LdNode[];
  readonly pos: LdPos;
}

export interface LdSection {
  readonly type: "section";
  readonly definitions: readonly LdDefinition[];
  /**
   * Cual blocks written directly inside this section's braces.
   *
   * Upstream attaches them to the enclosing definition node rather than to
   * anything inside it, which is why a level's shared code sits at the top of the
   * level section while a kind's own code sits inside that kind's section.
   */
  readonly code: readonly LdCodeBlock[];
  readonly pos: LdPos;
}

/** `word * count`, unexpanded. */
export interface LdRepeat {
  readonly type: "repeat";
  readonly word: string;
  readonly count: LdNode;
  readonly pos: LdPos;
}

/** A `<...>` expression, unevaluated. */
export interface LdExpr {
  readonly type: "expr";
  readonly tokens: readonly Token[];
  readonly pos: LdPos;
}

/** A Cual block, kept as tokens for group 3 to compile. */
export interface LdCodeBlock {
  readonly tokens: readonly Token[];
  readonly pos: LdPos;
}

export interface LdDefinition {
  readonly name: string;
  /**
   * Version specifiers, e.g. `["2", "hard"]`.
   *
   * Empty means the definition is unqualified and applies to every version. The
   * same name may appear several times with different specifiers; upstream keeps
   * all of them and picks between them at lookup time, so this parser does too.
   */
  readonly versions: readonly string[];
  readonly value: LdNode;
  readonly pos: LdPos;
}

export interface LdFile {
  readonly filename: string;
  readonly definitions: readonly LdDefinition[];
  /** Cual blocks outside any definition. */
  readonly code: readonly LdCodeBlock[];
}

/** A syntax error, carrying the position that caused it. */
export class LdParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col: number,
    readonly filename: string,
  ) {
    super(`${filename}:${line}:${col}: ${message}`);
    this.name = "LdParseError";
  }
}

const isPunct = (t: Token, text: string): boolean =>
  t.kind === "punct" && t.text === text;

class Parser {
  private index = 0;
  /** Where the last consumed token ended, so EOF errors point somewhere useful. */
  private lastEnd: LdPos = { line: 1, col: 1 };

  constructor(
    private readonly tokens: readonly Token[],
    private readonly filename: string,
  ) {}

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private next(): Token {
    const t = this.tokens[this.index];
    if (t === undefined) {
      this.fail("unexpected end of file", this.lastEnd.line, this.lastEnd.col);
    }
    this.index++;
    this.lastEnd = endOf(t as Token);
    return t as Token;
  }

  /** Fails at the end of the input rather than at an invented 0:0. */
  private eof(what: string): never {
    return this.fail(
      `expected ${what} but the file ended`,
      this.lastEnd.line,
      this.lastEnd.col,
    );
  }

  private atPunct(text: string): boolean {
    const t = this.peek();
    return t !== undefined && isPunct(t, text);
  }

  private expectPunct(text: string): Token {
    const t = this.peek();
    if (t === undefined) this.eof(`'${text}'`);
    if (!isPunct(t, text)) {
      this.fail(`expected '${text}' but found ${describe(t)}`, t.line, t.col);
    }
    return this.next();
  }

  private fail(message: string, line: number, col: number): never {
    throw new LdParseError(message, line, col, this.filename);
  }

  parseFile(): LdFile {
    const definitions: LdDefinition[] = [];
    const code: LdCodeBlock[] = [];
    while (this.peek() !== undefined) {
      if (this.peek()?.kind === "beginCode") {
        code.push(this.parseCodeBlock());
        continue;
      }
      definitions.push(this.parseDefinition());
    }
    return { filename: this.filename, definitions, code };
  }

  /** Parses `{ definition | code }`, returning both so a section can keep them. */
  private parseBody(closer: "}"): {
    definitions: LdDefinition[];
    code: LdCodeBlock[];
  } {
    const definitions: LdDefinition[] = [];
    const code: LdCodeBlock[] = [];
    for (;;) {
      const t = this.peek();
      if (t === undefined) this.eof(`'${closer}'`);
      if (isPunct(t, closer)) {
        this.next();
        return { definitions, code };
      }
      if (t.kind === "beginCode") {
        code.push(this.parseCodeBlock());
        continue;
      }
      definitions.push(this.parseDefinition());
    }
  }

  private parseDefinition(): LdDefinition {
    const { text: name, first } = this.parseDotted();
    const versions = this.atPunct("[") ? this.parseVersions() : [];
    this.expectPunct("=");
    const value = this.parseValue();
    return {
      name,
      versions,
      value,
      pos: { line: first.line, col: first.col },
    };
  }

  /**
   * `punktwort`: a word, or words joined by dots.
   *
   * Upstream assembles these in the grammar, not the scanner, so `igGo.xpm`
   * arrives here as three tokens and is rejoined. A dot may be followed by a
   * single letter as well as a word, which is what gives the `name.1` forms.
   */
  private parseDotted(): { text: string; first: Token } {
    const first = this.next();
    if (first.kind !== "word") {
      this.fail(
        `expected a name but found ${describe(first)}`,
        first.line,
        first.col,
      );
    }
    let text = first.text;
    for (;;) {
      if (!this.atPunct(".")) return { text, first };
      const after = this.peek(1);
      if (after === undefined) return { text, first };
      if (after.kind !== "word" && after.kind !== "letter") {
        return { text, first };
      }
      this.next(); // the dot
      const part = this.next();
      text += `.${nameFragment(part)}`;
    }
  }

  private parseVersions(): readonly string[] {
    this.expectPunct("[");
    const versions: string[] = [];
    for (;;) {
      const t = this.next();
      // `versionsmerkmal: wort | zahl`. The numeric alternative exists only so
      // that the player-count versions `[1]` and `[2]` can be written, which
      // upstream acknowledges in a comment. A single letter is neither, so it is
      // rejected: accepting it would admit files the original refuses.
      if (t.kind === "word") {
        versions.push(t.text);
      } else if (t.kind === "number" || t.kind === "zeroOne") {
        versions.push(String(t.value));
      } else {
        this.fail(
          `expected a version specifier but found ${describe(t)}`,
          t.line,
          t.col,
        );
      }
      if (this.atPunct(",")) {
        this.next();
        continue;
      }
      this.expectPunct("]");
      return versions;
    }
  }

  private parseValue(): LdNode {
    const t = this.peek();
    if (t !== undefined && isPunct(t, "{")) {
      const open = this.next();
      const body = this.parseBody("}");
      return {
        type: "section",
        definitions: body.definitions,
        code: body.code,
        pos: { line: open.line, col: open.col },
      };
    }
    return this.parseList();
  }

  private parseList(): LdNode {
    const first = this.peek();
    if (first === undefined) this.eof("a value");
    const items: LdNode[] = [this.parseItem()];
    while (this.atPunct(",")) {
      this.next();
      items.push(this.parseItem());
    }
    return {
      type: "list",
      items,
      pos: { line: first.line, col: first.col },
    };
  }

  private parseItem(): LdNode {
    const t = this.peek();
    if (t !== undefined && t.kind === "word") {
      const { text, first } = this.parseDotted();
      // `punktwort '*' ld_konstante` is the repeat shorthand; expanding it is
      // task 2.3.
      if (this.atPunct("*")) {
        this.next();
        return {
          type: "repeat",
          word: text,
          count: this.parseCount(),
          pos: { line: first.line, col: first.col },
        };
      }
      return {
        type: "datum",
        value: { type: "word", text },
        pos: { line: first.line, col: first.col },
      };
    }

    if (t !== undefined && isPunct(t, "<")) {
      // `ld_konstante: '<' konstante '>'`, so a whole definition may be an
      // expression with nothing else around it.
      return this.parseExpr();
    }

    if (t !== undefined && isPunct(t, "-")) {
      // `vorzeichen_zahl`, a signed number. The scanner has no rule for `-5` as
      // one token, so the sign is joined here. `sgrad[easy] = -1` in the corpus
      // needs the `[01]` arm too, not just ordinary numbers.
      return this.parseSigned(t.line, t.col);
    }

    const token = this.next();
    if (token.kind === "string") {
      return {
        type: "datum",
        value: { type: "string", text: token.text },
        pos: { line: token.line, col: token.col },
      };
    }

    // `zahl` covers the scanner's `[01]` rule as well as ordinary numbers, so
    // `mirror = 1` and `mirror = 7` are the same kind of value.
    if (
      token.kind === "number" ||
      token.kind === "halfNumber" ||
      token.kind === "zeroOne"
    ) {
      return {
        type: "datum",
        value: { type: "number", value: token.value },
        pos: { line: token.line, col: token.col },
      };
    }

    this.fail(
      `expected a value but found ${describe(token)}`,
      token.line,
      token.col,
    );
  }

  private parseCount(): LdNode {
    const t = this.peek();
    if (t === undefined) this.eof("a repeat count");
    if (t.kind === "number" || t.kind === "halfNumber" || t.kind === "zeroOne") {
      this.next();
      return {
        type: "datum",
        value: { type: "number", value: t.value },
        pos: { line: t.line, col: t.col },
      };
    }
    if (isPunct(t, "<")) return this.parseExpr();
    if (isPunct(t, "-")) return this.parseSigned(t.line, t.col);
    this.fail(
      `expected a repeat count but found ${describe(t)}`,
      t.line,
      t.col,
    );
  }

  /** A `-` already consumed, joined with the number that follows it. */
  private parseSigned(line: number, col: number): LdDatum {
    this.next(); // the minus
    const value = this.next();
    if (
      value.kind !== "number" &&
      value.kind !== "halfNumber" &&
      value.kind !== "zeroOne"
    ) {
      this.fail(
        `expected a number after '-' but found ${describe(value)}`,
        value.line,
        value.col,
      );
    }
    return {
      type: "datum",
      value: { type: "number", value: -value.value },
      pos: { line, col },
    };
  }

  /**
   * Captures a `<...>` expression verbatim.
   *
   * Parentheses are tracked because `konstante` allows them, and `>=`/`<=` lex
   * as single operator tokens so they cannot be mistaken for the closing angle
   * bracket.
   */
  private parseExpr(): LdExpr {
    const open = this.expectPunct("<");
    const inner: Token[] = [];
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (t === undefined) this.eof("'>' to close the expression");
      if (depth === 0 && isPunct(t, ">")) {
        this.next();
        break;
      }
      if (isPunct(t, "(")) depth++;
      if (isPunct(t, ")")) depth--;
      if (depth < 0) {
        this.fail(
          "unbalanced ')' inside an expression",
          t.line,
          t.col,
        );
      }
      inner.push(this.next());
    }
    return {
      type: "expr",
      tokens: inner,
      pos: { line: open.line, col: open.col },
    };
  }

  private parseCodeBlock(): LdCodeBlock {
    const open = this.next();
    const inner: Token[] = [];
    for (;;) {
      const t = this.peek();
      if (t === undefined) this.eof("'>>' to close the code block");
      if (t.kind === "endCode") {
        this.next();
        break;
      }
      inner.push(this.next());
    }
    return {
      tokens: inner,
      pos: { line: open.line, col: open.col },
    };
  }
}

/** A letter shorthand rendered back to its source spelling. */
function letterName(value: number): string {
  return value < 26
    ? String.fromCharCode(65 + value)
    : String.fromCharCode(97 + value - 26);
}

/**
 * The spelling of a name part, which may be a word or the single-letter
 * shorthand.
 *
 * A separate function so the narrowing is total: the caller has already checked
 * the token kind, but TypeScript cannot see that across two bindings.
 */
function nameFragment(t: Token): string {
  switch (t.kind) {
    case "word":
      return t.text;
    case "letter":
      return letterName(t.value);
    default:
      // Unreachable: callers only ever pass a word or a letter. Written out
      // rather than cast so that adding a token kind cannot silently produce a
      // nonsense name.
      throw new Error(`not a name fragment: ${describe(t)}`);
  }
}

/** Where a token ends, used to report a truncated file at a useful position. */
function endOf(t: Token): LdPos {
  const width = textWidth(t);
  return { line: t.line, col: t.col + width };
}

function textWidth(t: Token): number {
  switch (t.kind) {
    case "word":
    case "string":
    case "operator":
    case "punct":
    case "neighbour":
      return t.text.length;
    case "number":
    case "halfNumber":
    case "zeroOne":
      return String(t.value).length;
    case "letter":
      return 1;
    case "keyword":
      return t.text.length;
    case "beginCode":
    case "endCode":
    case "range":
      return 2;
    case "arrow":
      return 2;
  }
}

function describe(t: Token): string {
  switch (t.kind) {
    case "word":
    case "string":
    case "operator":
    case "punct":
      return `'${t.text}'`;
    case "number":
    case "halfNumber":
      return `number ${t.value}`;
    case "zeroOne":
      return `'${t.value}'`;
    case "letter":
      return `letter '${letterName(t.value)}'`;
    case "neighbour":
      return `neighbour pattern '${t.text}'`;
    case "keyword":
      return `keyword '${t.text}'`;
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

/**
 * Parses `.ld` source into a node tree.
 *
 * `source` must already be decoded from ISO-8859-1; see `decodeLatin1`.
 */
export function parseLd(source: string, filename = "<input>"): LdFile {
  return new Parser(tokenize(source, filename), filename).parseFile();
}
