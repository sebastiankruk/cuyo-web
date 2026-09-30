/**
 * Lexer for Cuyo's `.ld` level description files.
 *
 * The token grammar is transcribed from upstream `src/scanner.ll`, including its
 * flex longest-match semantics and rule order, because both are load-bearing:
 *
 *  - `0` and `1` lex as a distinct `zeroOne` token rather than as numbers,
 *    because the `[01]` rule precedes the number rule and ties go to the earlier
 *    rule. `2` and above lex as numbers.
 *  - A single letter lexes as a `letter` shorthand (A=0..Z=25, a=26..z=51),
 *    not as a word. So `x` is not a valid variable reference; `xy` and `x_1`
 *    are. No level in the corpus relies on single-letter variables, but being
 *    laxer here would silently accept programs upstream rejects.
 *  - Numbers are scanned with C `%i` semantics, so `010` is 8 and `0x1f` is 31.
 *    No level currently contains a leading-zero number, but reproducing the
 *    original avoids a latent divergence.
 *  - A character that matches no rule is an error, including `\r`. The corpus is
 *    entirely LF; `.ld` files are shipped pre-built, so the strict behaviour is
 *    kept deliberately rather than quietly relaxed.
 *
 * Files are ISO-8859-1. `decodeLatin1` maps each byte to the code point of the
 * same value, which is lossless and avoids the windows-1252 remapping that
 * `TextDecoder("latin1")` performs in the 0x80-0x9F range.
 */

/** Keyword words recognised by the original scanner. */
export const KEYWORDS = [
  "var",
  "busy",
  "switch",
  "if",
  "else",
  "rnd",
  "gcd",
  "include",
  "bonus",
  "message",
  "sound",
  "lose",
  "explode",
  "default",
  "reapply",
] as const;

export type Keyword = (typeof KEYWORDS)[number];

/** The arrow flavours, matching upstream's `ohne_merk_pfeil` / `mit_merk_pfeil`. */
export const WITHOUT_LATCH = 0;
export const WITH_LATCH = 1;

interface Pos {
  readonly line: number;
  readonly col: number;
}

export type Token =
  | ({ readonly kind: "keyword"; readonly text: Keyword } & Pos)
  /** `<<` opening a Cual block. */
  | ({ readonly kind: "beginCode" } & Pos)
  /** `>>` closing a Cual block. */
  | ({ readonly kind: "endCode" } & Pos)
  /** `..`, the inclusive range operator. */
  | ({ readonly kind: "range" } & Pos)
  | ({ readonly kind: "zeroOne"; readonly value: 0 | 1 } & Pos)
  /** A single letter, as a 0-51 shorthand. */
  | ({ readonly kind: "letter"; readonly value: number } & Pos)
  | ({ readonly kind: "word"; readonly text: string } & Pos)
  | ({ readonly kind: "string"; readonly text: string } & Pos)
  /** A six- or eight-character neighbour pattern such as `1???0???`. */
  | ({ readonly kind: "neighbour"; readonly text: string } & Pos)
  | ({ readonly kind: "number"; readonly value: number } & Pos)
  /** A half-integer row coordinate such as `.5`, only used in hex levels. */
  | ({ readonly kind: "halfNumber"; readonly value: number } & Pos)
  | ({ readonly kind: "arrow"; readonly latching: boolean } & Pos)
  | ({ readonly kind: "operator"; readonly text: string } & Pos)
  | ({ readonly kind: "punct"; readonly text: string } & Pos);

/** A lexical error, carrying the position that caused it. */
export class LdLexError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col: number,
    readonly filename: string,
  ) {
    super(`${filename}:${line}:${col}: ${message}`);
    this.name = "LdLexError";
  }
}

/** Decodes ISO-8859-1 bytes losslessly, one byte per code point. */
export function decodeLatin1(bytes: Uint8Array): string {
  // Chunked to stay clear of the argument-count limit on large inputs.
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

const isDigit = (c: string) => c >= "0" && c <= "9";
const isUpper = (c: string) => c >= "A" && c <= "Z";
const isLower = (c: string) => c >= "a" && c <= "z";
const isAlpha = (c: string) => isUpper(c) || isLower(c);
const isIdentStart = (c: string) => isAlpha(c) || c === "_";
const isIdentPart = (c: string) => isAlpha(c) || isDigit(c) || c === "_";
const isPatternChar = (c: string) => c === "0" || c === "1" || c === "?";
const isHexDigit = (c: string) =>
  isDigit(c) || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");

/** Character count of a hex literal starting at `i`, or 0. */
function matchHex(src: string, i: number): number {
  if (src[i] !== "0" || (src[i + 1] !== "x" && src[i + 1] !== "X")) return 0;
  let j = i + 2;
  while (j < src.length && isHexDigit(src[j] as string)) j++;
  return j > i + 2 ? j - i : 0;
}

/** Character count of a decimal run starting at `i`, or 0. */
function matchDecimal(src: string, i: number): number {
  let j = i;
  while (j < src.length && isDigit(src[j] as string)) j++;
  return j - i;
}

/** Character count of `[0-9]* ".5"` starting at `i`, or 0. */
function matchHalf(src: string, i: number): number {
  let j = i;
  while (j < src.length && isDigit(src[j] as string)) j++;
  if (src[j] !== "." || src[j + 1] !== "5") return 0;
  return j - i + 2;
}

/** Character count of a run of `[01?]`, or 0. */
function matchPattern(src: string, i: number, length: number): number {
  if (i + length > src.length) return 0;
  for (let k = 0; k < length; k++) {
    if (!isPatternChar(src[i + k] as string)) return 0;
  }
  return length;
}

/** Character count of a keyword at `i`, or null. */
function matchKeyword(
  src: string,
  i: number,
): { len: number; word: Keyword } | null {
  for (const kw of KEYWORDS) {
    if (src.startsWith(kw, i)) {
      // A keyword only counts when not glued to more identifier characters.
      // Longest-match would let a word rule win anyway, but being explicit keeps
      // the boundary rule visible.
      const after = src[i + kw.length];
      if (after === undefined || !isIdentPart(after)) {
        return { len: kw.length, word: kw };
      }
    }
  }
  return null;
}

/** Scans a quoted string at `i`, returning its decoded contents. */
function scanString(
  src: string,
  i: number,
  pos: Pos,
  filename: string,
): { text: string; length: number } {
  let j = i + 1;
  let out = "";
  while (j < src.length) {
    const c = src[j] as string;
    if (c === '"') return { text: out, length: j + 1 - i };
    if (c === "\\") {
      const esc = src[j + 1];
      if (esc === "n") out += "\n";
      else if (esc === '"') out += '"';
      else if (esc === "\\") out += "\\";
      else {
        throw new LdLexError(
          "unknown escape sequence in string",
          pos.line,
          pos.col + (j - i),
          filename,
        );
      }
      j += 2;
      continue;
    }
    // Upstream's STRINGBUCH class admits 0x20..0xff except `"` and `\`,
    // so control characters inside a string are rejected.
    if (c < " ") {
      throw new LdLexError(
        "control character in string",
        pos.line,
        pos.col + (j - i),
        filename,
      );
    }
    out += c;
    j++;
  }
  throw new LdLexError("unterminated string", pos.line, pos.col, filename);
}

/**
 * C `%i` semantics: `0x` hex, leading `0` octal, otherwise decimal.
 *
 * Reproduced because upstream passes the matched text through `sscanf("%i")`.
 */
function parseCInteger(text: string): number {
  if (/^0[xX][0-9A-Fa-f]+$/.test(text)) return parseInt(text.slice(2), 16);
  if (/^0[0-9]+$/.test(text)) return parseInt(text.slice(1), 8);
  return parseInt(text, 10);
}

/** Multi-character operators, longest first so greedy matching is correct. */
const OPERATORS = [
  ".+=",
  ".-=",
  "<<",
  ">>",
  "..",
  "->",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  ".+",
  ".-",
  "@@",
];

/** Single characters the original passes through as themselves. */
const PUNCT = new Set([
  "=",
  "+",
  ",",
  ";",
  "(",
  ")",
  "{",
  "}",
  "*",
  "@",
  "/",
  "~",
  "!",
  "%",
  ":",
  "<",
  ">",
  "&",
  "|",
  ".",
  "-",
  "[",
  "]",
]);

/**
 * Turns `.ld` source into tokens, or throws {@link LdLexError} on the first
 * character that matches no rule.
 */
export function tokenize(source: string, filename = "<input>"): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const pos = (): Pos => ({ line, col: i - lineStart + 1 });

  while (i < source.length) {
    const c = source[i] as string;

    // Whitespace.
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    // Comment: one or more '#' to end of line.
    if (c === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "\n") {
      line++;
      i++;
      lineStart = i;
      continue;
    }

    const p = pos();

    // Every rule that matches at this position contributes a candidate. The
    // longest wins, and a tie goes to whichever rule was added first, which is
    // how flex resolves equal-length matches by rule order. Collecting into an
    // array rather than a mutable `best` keeps TypeScript's narrowing honest.
    const candidates: Array<{ len: number; token: Token }> = [];
    const add = (len: number, token: Token) => {
      if (len > 0) candidates.push({ len, token });
    };

    // Keywords, added before identifiers so `if` does not lex as a word.
    const kw = matchKeyword(source, i);
    if (kw !== null) add(kw.len, { kind: "keyword", text: kw.word, ...p });

    // Multi-character operators, in length-descending order.
    for (const op of OPERATORS) {
      if (source.startsWith(op, i)) {
        if (op === "<<") add(2, { kind: "beginCode", ...p });
        else if (op === ">>") add(2, { kind: "endCode", ...p });
        else if (op === "..") add(2, { kind: "range", ...p });
        else if (op === "->") add(2, { kind: "arrow", latching: false, ...p });
        else if (op === "=>") add(2, { kind: "arrow", latching: true, ...p });
        else add(op.length, { kind: "operator", text: op, ...p });
      }
    }

    // Quoted string.
    if (c === '"') {
      const s = scanString(source, i, p, filename);
      add(s.length, { kind: "string", text: s.text, ...p });
    }

    // Numbers, including C `%i` prefixes.
    const hex = matchHex(source, i);
    if (hex > 0) {
      add(hex, {
        kind: "number",
        value: parseCInteger(source.slice(i, i + hex)),
        ...p,
      });
    }
    const dec = matchDecimal(source, i);
    if (dec > 0) {
      const raw = source.slice(i, i + dec);
      if (dec === 1 && (raw === "0" || raw === "1")) {
        // `0` and `1` are the zeroOne literal. This ties with nothing longer, and
        // the `[01]` rule precedes the number rule upstream, so it wins.
        add(dec, { kind: "zeroOne", value: raw === "0" ? 0 : 1, ...p });
      } else {
        add(dec, {
          kind: "number",
          value: parseCInteger(raw),
          ...p,
        });
      }
    }
    const half = matchHalf(source, i);
    if (half > 0) {
      const digits = source.slice(i, i + half - 2);
      add(half, {
        kind: "halfNumber",
        value: digits.length > 0 ? parseInt(digits, 10) : 0,
        ...p,
      });
    }

    // Neighbour patterns. Fixed length, so eight present beats six.
    for (const len of [8, 6]) {
      const m = matchPattern(source, i, len);
      if (m > 0) add(m, { kind: "neighbour", text: source.slice(i, i + m), ...p });
    }

    // Identifiers and words. A lone letter is the letter shorthand; anything
    // longer is a word. Longest-match makes `x_1` a word even though the letter
    // rule also matches its first character.
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < source.length && isIdentPart(source[j] as string)) j++;
      const len = j - i;
      if (len === 1) {
        const value = isUpper(c)
          ? c.charCodeAt(0) - 65
          : c.charCodeAt(0) - 97 + 26;
        add(len, { kind: "letter", value, ...p });
      } else {
        add(len, { kind: "word", text: source.slice(i, j), ...p });
      }
    }

    // Single punctuation characters.
    if (PUNCT.has(c)) add(1, { kind: "punct", text: c, ...p });

    let best: { len: number; token: Token } | undefined;
    for (const candidate of candidates) {
      if (best === undefined || candidate.len > best.len) best = candidate;
    }

    if (best === undefined) {
      throw new LdLexError(
        `wrong character '${c}' (U+${c.charCodeAt(0)
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")})`,
        p.line,
        p.col,
        filename,
      );
    }

    tokens.push(best.token);
    i += best.len;
  }

  return tokens;
}
