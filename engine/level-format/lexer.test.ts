import { describe, expect, it } from "vitest";
import { LdLexError, decodeLatin1, tokenize } from "./lexer.ts";
import type { Token } from "./lexer.ts";

/** Compact token rendering, so expectations stay readable. */
function kinds(tokens: Token[]): string[] {
  return tokens.map((t) => t.kind);
}

function texts(tokens: Token[]): string[] {
  return tokens.map((t) => {
    switch (t.kind) {
      case "keyword":
      case "word":
      case "string":
      case "neighbour":
      case "operator":
      case "punct":
        return t.text;
      case "number":
      case "halfNumber":
      case "letter":
      case "zeroOne":
        return String(t.value);
      case "arrow":
        return t.latching ? "=>" : "->";
      default:
        return t.kind;
    }
  });
}

describe("decodeLatin1", () => {
  it("maps each byte to the code point of the same value", () => {
    expect(decodeLatin1(new Uint8Array([0x41, 0xdf, 0xff]))).toBe("A\u00df\u00ff");
  });

  it("is lossless for the full byte range", () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    expect(decodeLatin1(all).length).toBe(256);
  });

  it("does not apply windows-1252 remapping in 0x80-0x9F", () => {
    // 0x93 is a curly quote in windows-1252; in latin1 it is a control char.
    expect(decodeLatin1(new Uint8Array([0x93]))).toBe("\u0093");
  });
});

describe("tokenize: whitespace and comments", () => {
  it("skips spaces, tabs and newlines", () => {
    expect(kinds(tokenize("  \t\n  ab  "))).toEqual(["word"]);
  });

  it("treats '#' to end of line as a comment", () => {
    expect(texts(tokenize("# a comment\nabc"))).toEqual(["abc"]);
  });

  it("treats '##' as a comment too", () => {
    expect(kinds(tokenize("## double\nabc"))).toEqual(["word"]);
  });

  it("does not treat '#' inside a string as a comment", () => {
    expect(texts(tokenize('"a#b"'))).toEqual(["a#b"]);
  });

  it("reports line and column", () => {
    const tokens = tokenize("a\n  b\nc");
    expect(tokens.map((t) => [t.line, t.col])).toEqual([
      [1, 1],
      [2, 3],
      [3, 1],
    ]);
  });
});

describe("tokenize: words, keywords and letters", () => {
  it("recognises keywords", () => {
    expect(kinds(tokenize("var if else switch"))).toEqual([
      "keyword",
      "keyword",
      "keyword",
      "keyword",
    ]);
  });

  it("does not treat a keyword prefix as a keyword", () => {
    // `variable` must be a word, not `var` followed by `iable`.
    expect(kinds(tokenize("variable"))).toEqual(["word"]);
    expect(texts(tokenize("variable"))).toEqual(["variable"]);
  });

  it("lexes a single letter as the letter shorthand", () => {
    const tokens = tokenize("A");
    expect(tokens[0]?.kind).toBe("letter");
    expect(tokens[0]).toMatchObject({ value: 0 });
  });

  it("maps letters to 0-25 and 26-51", () => {
    expect(tokenize("Z")[0]).toMatchObject({ kind: "letter", value: 25 });
    expect(tokenize("a")[0]).toMatchObject({ kind: "letter", value: 26 });
    expect(tokenize("z")[0]).toMatchObject({ kind: "letter", value: 51 });
  });

  it("lexes two or more letters as a word", () => {
    expect(kinds(tokenize("ab"))).toEqual(["word"]);
  });

  it("lexes an identifier with digits or underscore as a word", () => {
    expect(texts(tokenize("x_1 inGruen1"))).toEqual(["x_1", "inGruen1"]);
  });

  it("splits a dotted filename into word, punct, word", () => {
    // Upstream's grammar reassembles these via `punktwort`.
    expect(texts(tokenize("inGruen.xpm"))).toEqual(["inGruen", ".", "xpm"]);
  });
});

describe("tokenize: numbers", () => {
  it("lexes 0 and 1 as the zeroOne literal", () => {
    expect(tokenize("0")[0]).toMatchObject({ kind: "zeroOne", value: 0 });
    expect(tokenize("1")[0]).toMatchObject({ kind: "zeroOne", value: 1 });
  });

  it("lexes 2 and above as numbers", () => {
    expect(tokenize("2")[0]).toMatchObject({ kind: "number", value: 2 });
  });

  it("lexes multi-digit numbers as numbers", () => {
    expect(tokenize("01")[0]).toMatchObject({ kind: "number", value: 1 });
    expect(tokenize("100")[0]).toMatchObject({ kind: "number", value: 100 });
  });

  it("uses C %i semantics for a leading zero (octal)", () => {
    expect(tokenize("010")[0]).toMatchObject({ kind: "number", value: 8 });
  });

  it("understands hex literals", () => {
    expect(tokenize("0x1f")[0]).toMatchObject({ kind: "number", value: 31 });
    expect(tokenize("0X1F")[0]).toMatchObject({ kind: "number", value: 31 });
  });

  it("lexes half-integers for hex coordinates", () => {
    expect(tokenize(".5")[0]).toMatchObject({ kind: "halfNumber", value: 0 });
    expect(tokenize("1.5")[0]).toMatchObject({ kind: "halfNumber", value: 1 });
  });

  it("prefers the longer half-integer match over a leading number", () => {
    expect(kinds(tokenize("1.5"))).toEqual(["halfNumber"]);
  });

  it("does not treat '0x' with no hex digits as a number", () => {
    // Falls through to `0` plus the letter `x`.
    expect(kinds(tokenize("0x"))).toEqual(["zeroOne", "letter"]);
  });
});

describe("tokenize: neighbour patterns", () => {
  it("lexes an eight-character pattern", () => {
    const tokens = tokenize("1???0???");
    expect(tokens[0]).toMatchObject({ kind: "neighbour", text: "1???0???" });
  });

  it("lexes a six-character pattern", () => {
    expect(tokenize("??101?")[0]).toMatchObject({
      kind: "neighbour",
      text: "??101?",
    });
  });

  it("rejects a seven-character pattern", () => {
    // Neither the 6- nor 8-char rule matches, and '?' is not punctuation.
    expect(() => tokenize("???1???")).toThrow(LdLexError);
  });
});

describe("tokenize: strings", () => {
  it("reads a quoted string", () => {
    expect(tokenize('"hello"')[0]).toMatchObject({
      kind: "string",
      text: "hello",
    });
  });

  it("decodes the three supported escapes", () => {
    expect(tokenize('"a\\nb"')[0]).toMatchObject({ text: "a\nb" });
    expect(tokenize('"a\\"b"')[0]).toMatchObject({ text: 'a"b' });
    expect(tokenize('"a\\\\b"')[0]).toMatchObject({ text: "a\\b" });
  });

  it("accepts an empty string", () => {
    expect(tokenize('""')[0]).toMatchObject({ kind: "string", text: "" });
  });

  it("accepts high bytes", () => {
    expect(tokenize('"caf\u00e9"')[0]).toMatchObject({ text: "caf\u00e9" });
  });

  it("rejects an unknown escape", () => {
    expect(() => tokenize('"a\\qb"')).toThrow(/unknown escape/);
  });

  it("rejects an unterminated string", () => {
    expect(() => tokenize('"abc')).toThrow(/unterminated string/);
  });

  it("rejects a literal newline inside a string", () => {
    expect(() => tokenize('"a\nb"')).toThrow(/control character in string/);
  });
});

describe("tokenize: operators and punctuation", () => {
  it("recognises both arrow flavours", () => {
    expect(tokenize("->")[0]).toMatchObject({
      kind: "arrow",
      latching: false,
    });
    expect(tokenize("=>")[0]).toMatchObject({ kind: "arrow", latching: true });
  });

  it("prefers the two-character operator over its first character", () => {
    expect(kinds(tokenize("->"))).toEqual(["arrow"]);
    expect(kinds(tokenize(".."))).toEqual(["range"]);
    expect(kinds(tokenize("=="))).toEqual(["operator"]);
    expect(kinds(tokenize("@@"))).toEqual(["operator"]);
    expect(kinds(tokenize("<<"))).toEqual(["beginCode"]);
  });

  it("recognises the Cual bit operators", () => {
    expect(texts(tokenize(".+="))).toEqual([".+="]);
    expect(texts(tokenize(".-="))).toEqual([".-="]);
    expect(texts(tokenize(".+"))).toEqual([".+"]);
    expect(texts(tokenize(".-"))).toEqual([".-"]);
  });

  it("keeps a lone '.' as punctuation", () => {
    expect(texts(tokenize("."))).toEqual(["."]);
  });

  it("keeps single characters as punctuation", () => {
    expect(texts(tokenize("=+,;(){}*@/~!%:<>&|"))).toEqual([
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
    ]);
  });

  it("prefers '=' over '==' only when longer", () => {
    expect(texts(tokenize("ab=cd"))).toEqual(["ab", "=", "cd"]);
    expect(texts(tokenize("ab==cd"))).toEqual(["ab", "==", "cd"]);
  });
});

describe("tokenize: errors", () => {
  it("rejects a character matching no rule", () => {
    expect(() => tokenize("a ? b")).toThrow(/wrong character '\?'/);
  });

  it("rejects a carriage return, matching upstream", () => {
    expect(() => tokenize("a\r\nb")).toThrow(/wrong character/);
  });

  it("reports the filename and position", () => {
    expect(() => tokenize("a\nb\n  ?", "level.ld")).toThrow(
      /level\.ld:3:3: wrong character/,
    );
  });
});

describe("tokenize: realistic snippets", () => {
  it("lexes a level section header", () => {
    expect(texts(tokenize('Nasenkugeln = {\n  name = "Noseballs"\n}'))).toEqual(
      ["Nasenkugeln", "=", "{", "name", "=", "Noseballs", "}"],
    );
  });

  it("lexes a kind list with the repeat shorthand", () => {
    expect(texts(tokenize("pics=Band * 5, Grau"))).toEqual([
      "pics",
      "=",
      "Band",
      "*",
      "5",
      ",",
      "Grau",
    ]);
  });

  it("lexes a versioned definition", () => {
    expect(texts(tokenize("numexplode[1,hard] = 10"))).toEqual([
      "numexplode",
      "[",
      "1",
      ",",
      "hard",
      "]",
      "=",
      "10",
    ]);
  });

  it("lexes a bracketed expression", () => {
    expect(texts(tokenize("neighbours = <neighbours_hex6>"))).toEqual([
      "neighbours",
      "=",
      "<",
      "neighbours_hex6",
      ">",
    ]);
  });

  it("lexes a Cual block with schema calls", () => {
    expect(texts(tokenize("<<\n  inGruen = gruengelb;\n>>"))).toEqual([
      "beginCode",
      "inGruen",
      "=",
      "gruengelb",
      ";",
      "endCode",
    ]);
  });

  it("lexes a Cual switch with both arrow flavours", () => {
    // `A`, `B`, `C`, `D` are single letters, so they lex as the letter
    // shorthand with values 0-3. That is exactly how Cual's `pos = A` idiom
    // works, so the letters are expected here rather than as words.
    expect(texts(tokenize("switch { 1:600 => {A,B,C}; -> D; }"))).toEqual([
      "switch",
      "{",
      "1",
      ":",
      "600",
      "=>",
      "{",
      "0",
      ",",
      "1",
      ",",
      "2",
      "}",
      ";",
      "->",
      "3",
      ";",
      "}",
    ]);
  });

  it("lexes foreign-variable access", () => {
    expect(texts(tokenize("punkte@+=1"))).toEqual([
      "punkte",
      "@",
      "+=",
      "1",
    ]);
    // The variable must be multi-character: a single letter lexes as the letter
    // shorthand, so `x` is not a valid variable reference.
    expect(texts(tokenize("xx@@(3, 5)"))).toEqual([
      "xx",
      "@@",
      "(",
      "3",
      ",",
      "5",
      ")",
    ]);
  });
});
