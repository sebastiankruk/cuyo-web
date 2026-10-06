// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for the `.ld` parser's structure pass (task 2.2).
 *
 * The parser produces a node tree rather than a resolved level, so these tests
 * are about shape: which definitions exist, how they nest, what version
 * specifiers they carry, and what is left unevaluated for task 2.3. The
 * structure is checked against the shape of upstream `data/example.ld`,
 * transcribed inline so the expectations do not depend on the local-only
 * upstream checkout.
 *
 * Names here are never a single letter, because a lone letter lexes with its own
 * rule and upstream's `wort` does not match it - `a=1` is a syntax error in the
 * original, and the parser rejects it for the same reason.
 */

import { describe, expect, it } from "vitest";
import { LdParseError, parseLd } from "./parser.ts";
import type {
  LdDefinition,
  LdExpr,
  LdFile,
  LdList,
  LdNode,
  LdRepeat,
  LdSection,
} from "./parser.ts";

/** The body of upstream `data/example.ld`, comments stripped. */
const EXAMPLE = `
example = {
  name = "Example Level"
  author = "Immi"
  description = "Where do I know all these icons from...?"
  pics=igGo.xpm,inGruen.xpm,my_special
  numexplode = 5
  numexplode[1] = 6
  startpic=ipStart.xpm
  startdist=".AF....AF.","BCDE..BCDE"
  greypic=inSchwarz.xpm
  my_special = {
    pics=ihBlau.xpm,inSchwarz2.xpm
    neighbours=<neighbours_diagonal>
    <<
    my_special={
      file = 0;
      schemaDiag2;
    };
    >>
  }
}
`;

function parse(source: string): LdFile {
  return parseLd(source, "test.ld");
}

function section(def: LdDefinition): LdSection {
  if (def.value.type !== "section") {
    throw new Error(`${def.name} is a ${def.value.type}, not a section`);
  }
  return def.value;
}

function list(def: LdDefinition): LdList {
  if (def.value.type !== "list") {
    throw new Error(`${def.name} is a ${def.value.type}, not a list`);
  }
  return def.value;
}

function find(file: LdFile, name: string): LdDefinition {
  return findIn(file.definitions, name);
}

function findIn(
  definitions: readonly LdDefinition[],
  name: string,
): LdDefinition {
  const def = definitions.find((d) => d.name === name);
  if (def === undefined) throw new Error(`no definition named ${name}`);
  return def;
}

/** The words of a list, for the cases with no repeats or expressions. */
function words(def: LdDefinition): string[] {
  return list(def).items.map((item) => {
    if (item.type !== "datum" || item.value.type !== "word") {
      throw new Error(`expected a word in ${def.name}`);
    }
    return item.value.text;
  });
}

describe("flat definitions", () => {
  it("reads consecutive top-level definitions", () => {
    const file = parse("numexplode=4\nchaingrass=1\n");
    expect(file.definitions.map((d) => d.name)).toEqual([
      "numexplode",
      "chaingrass",
    ]);
    expect(list(find(file, "numexplode")).items[0]).toMatchObject({
      value: { type: "number", value: 4 },
    });
    // `1` lexes with its own rule but is still a plain number here.
    expect(list(find(file, "chaingrass")).items[0]).toMatchObject({
      value: { type: "number", value: 1 },
    });
    // A bare value is still a list, because `rechts_von_def: def_liste` is.
    expect(find(file, "numexplode").value.type).toBe("list");
  });

  it("keeps a single-item value as a one-item list", () => {
    const file = parse('name="Example Level"');
    const items = list(find(file, "name")).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "datum",
      value: { type: "string", text: "Example Level" },
    });
  });

  it("records the position of each definition", () => {
    const file = parse("\n\nnumexplode=4");
    expect(find(file, "numexplode").pos.line).toBe(3);
  });

  it("reads an empty file as no definitions", () => {
    expect(parse("").definitions).toEqual([]);
  });

  it("reads several definitions on one line", () => {
    const file = parse("toptime=50 mirror=1");
    expect(file.definitions.map((d) => d.name)).toEqual(["toptime", "mirror"]);
  });
});

describe("data types", () => {
  it("distinguishes words, strings and numbers", () => {
    const file = parse("aa=word\nbb=\"quoted\"\ncc=42");
    expect(list(find(file, "aa")).items[0]).toMatchObject({
      value: { type: "word", text: "word" },
    });
    expect(list(find(file, "bb")).items[0]).toMatchObject({
      value: { type: "string", text: "quoted" },
    });
    expect(list(find(file, "cc")).items[0]).toMatchObject({
      value: { type: "number", value: 42 },
    });
  });

  it("joins a dotted name into one word", () => {
    // `punktwort` is built by the grammar, not the scanner, so the dots arrive as
    // separate tokens and are rejoined here.
    expect(find(parse("aa.bb.cc=1"), "aa.bb.cc")).toBeDefined();
  });

  it("joins a dotted picture name in a list", () => {
    const file = parse("pics=igGo.xpm,inGruen.xpm");
    expect(words(find(file, "pics"))).toEqual(["igGo.xpm", "inGruen.xpm"]);
  });

  it("accepts a dotted name on a repeat item", () => {
    const file = parse("pics = inGruen.xpm * 2");
    const repeat = list(find(file, "pics")).items[0] as LdRepeat;
    expect(repeat.type).toBe("repeat");
    expect(repeat.word).toBe("inGruen.xpm");
  });

  it("accepts a single letter after a dot", () => {
    // `punktwort '.' BUCHSTABE_TOK`: a lone letter is allowed here even though
    // it cannot stand as a name on its own.
    expect(find(parse("aa.bb.c=2"), "aa.bb.c")).toBeDefined();
  });

  it("rejects a number after a dot in a name", () => {
    // The arm after a dot takes a word or a letter, never a number, so `1` ends
    // the name and the dot is then a syntax error.
    expect(() => parse("aa.bb.1=2")).toThrow();
  });

  it("rejects a lone letter as a name, as upstream does", () => {
    // `wort` is WORT_TOK or REINWORT_TOK; the single-letter rule is a different
    // token that never reduces to a name.
    expect(() => parse("a=1")).toThrow(/expected a name but found letter/);
  });

  it("reads a comma-separated list", () => {
    const file = parse("pics=aa.xpm,bb.xpm,cc.xpm");
    expect(words(find(file, "pics"))).toEqual([
      "aa.xpm",
      "bb.xpm",
      "cc.xpm",
    ]);
  });

  it("allows whitespace around the punctuation", () => {
    const spaced = parse("pics = aa.xpm , bb.xpm");
    const tight = parse("pics=aa.xpm,bb.xpm");
    expect(words(find(spaced, "pics"))).toEqual(words(find(tight, "pics")));
  });

  it("reads a signed number", () => {
    // `vorzeichen_zahl`; the scanner has no rule for `-5` as a single token.
    expect(list(find(parse("aa=-5"), "aa")).items[0]).toMatchObject({
      value: { type: "number", value: -5 },
    });
  });

  it("keeps a Cual range as one token", () => {
    // `..` is only meaningful inside Cual (`switch { 1 .. 5 -> ... }`), and it
    // lexes as a single token so it can never be mistaken for two dots in a name.
    const file = parse("aa={ << switch { 1 .. 5 -> *; }; >> }");
    const block = section(find(file, "aa")).code[0];
    expect(block?.tokens.some((t) => t.kind === "range")).toBe(true);
  });

  it("rejects a range outside a code block", () => {
    expect(() => parse("aa=1..2")).toThrow();
  });
});

describe("the repeat shorthand", () => {
  it("is captured unexpanded, with its count", () => {
    const file = parse("pics = aa.xpm, bb.xpm * 3");
    const items = list(find(file, "pics")).items;
    expect(items).toHaveLength(2);
    const repeat = items[1] as LdRepeat;
    expect(repeat.type).toBe("repeat");
    expect(repeat.word).toBe("bb.xpm");
    expect(repeat.count).toMatchObject({
      type: "datum",
      value: { type: "number", value: 3 },
    });
  });

  it("accepts an expression as the count", () => {
    const file = parse("pics = aa.xpm * <2 + 1>");
    const repeat = list(find(file, "pics")).items[0] as LdRepeat;
    expect(repeat.type).toBe("repeat");
    expect(repeat.count.type).toBe("expr");
  });

  it("rejects a star straight after a number", () => {
    // The shorthand is `punktwort '*' ld_konstante`, so it needs a name.
    expect(() => parse("aa=1*2")).toThrow(LdParseError);
  });
});

describe("expressions", () => {
  it("captures the tokens between the angle brackets", () => {
    const file = parse("mm = <nn * 2 + 1>");
    const expr = list(find(file, "mm")).items[0] as LdExpr;
    expect(expr.type).toBe("expr");
    // Captured verbatim; task 2.3 evaluates it.
    // The trailing `1` lexes with the scanner's `[01]` rule, so it arrives as
    // `zeroOne` rather than `number`. Evaluating either is task 2.3's business.
    expect(
      expr.tokens.map((t) => (t.kind === "word" ? t.text : t.kind)),
    ).toEqual(["nn", "punct", "number", "punct", "zeroOne"]);
  });

  it("may be a whole definition's value", () => {
    const file = parse("neighbours=<neighbours_diagonal>");
    expect(list(find(file, "neighbours")).items[0]?.type).toBe("expr");
  });

  it("keeps parenthesised subexpressions together", () => {
    const file = parse("mm = <(1 + 2) * 3>");
    const expr = list(find(file, "mm")).items[0] as LdExpr;
    expect(expr.type).toBe("expr");
    // The closing bracket of the group must not end the expression early.
    expect(expr.tokens.some((t) => t.kind === "punct" && t.text === ")")).toBe(
      true,
    );
  });

  it("does not end at a >= comparison", () => {
    // `>=` lexes as one operator token, so it cannot close the expression.
    const file = parse("mm = <1 >= 2>");
    const expr = list(find(file, "mm")).items[0] as LdExpr;
    expect(expr.type).toBe("expr");
    expect(expr.tokens).toHaveLength(3);
  });

  it("reports an unterminated expression", () => {
    expect(() => parse("mm = <1 + 2")).toThrow(/expected '>'/);
  });
});

describe("nested sections", () => {
  it("reads a section's definitions", () => {
    const file = parse('Level = { name = "Example" pics = aa.xpm, bb.xpm }');
    expect(file.definitions).toHaveLength(1);
    const level = section(find(file, "Level"));
    expect(level.definitions.map((d) => d.name)).toEqual(["name", "pics"]);
  });

  it("nests sections to arbitrary depth", () => {
    const file = parse("aa={ bb={ cc={ dd=1 } } }");
    const aa = section(find(file, "aa"));
    const bb = section(findIn(aa.definitions, "bb"));
    const cc = section(findIn(bb.definitions, "cc"));
    expect(findIn(cc.definitions, "dd")).toBeDefined();
  });

  it("keeps a section and a list distinct", () => {
    const file = parse("aa={ bb=1 }\ncc=2");
    expect(find(file, "aa").value.type).toBe("section");
    expect(find(file, "cc").value.type).toBe("list");
  });

  it("accepts an empty section", () => {
    expect(section(find(parse("aa={ }"), "aa")).definitions).toEqual([]);
  });

  it("reports a missing closing brace with a position", () => {
    let caught: unknown;
    try {
      parse("aa={\n bb=1\n");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(LdParseError);
    const err = caught as LdParseError;
    // A truncated file is reported at the end of its last token, which is far
    // more use than an invented 0:0.
    expect(err.line).toBe(2);
    expect(err.message).toContain("test.ld:2:");
  });
});

describe("version specifiers", () => {
  it("reads an unqualified definition as applying to every version", () => {
    const file = parse("numexplode=8\nnumexplode[2]=6");
    const [general, twoPlayer] = file.definitions;
    expect(general?.versions).toEqual([]);
    expect(twoPlayer?.versions).toEqual(["2"]);
  });

  it("reads the player-count versions as numbers", () => {
    // `versionsmerkmal: wort | zahl`, where the numeric arm exists precisely so
    // that `[1]` and `[2]` can be written.
    const file = parse("numexplode[1]=6\nnumexplode[2]=5");
    expect(file.definitions[0]?.versions).toEqual(["1"]);
    expect(file.definitions[1]?.versions).toEqual(["2"]);
  });

  it("reads several specifiers", () => {
    expect(find(parse("numexplode[2,hard]=5"), "numexplode").versions).toEqual([
      "2",
      "hard",
    ]);
  });

  it("tolerates whitespace inside the brackets", () => {
    expect(
      find(parse("numexplode[ 2 , hard ] = 5"), "numexplode").versions,
    ).toEqual(["2", "hard"]);
  });

  it("keeps every definition of a repeated name", () => {
    const file = parse("nn=1\nnn[2]=2\nnn[hard]=3\nnn[2,hard]=4");
    expect(file.definitions).toHaveLength(4);
  });

  it("rejects a single letter as a version specifier", () => {
    // The letter shorthand is a different token and never reduces to
    // `versionsmerkmal`, so upstream rejects this.
    expect(() => parse("nn[x]=1")).toThrow(/expected a version specifier/);
  });

  it("reports an unterminated version bracket", () => {
    expect(() => parse("nn[2=1")).toThrow(/expected .*\]/);
  });
});

describe("comments", () => {
  it("ignores a trailing comment", () => {
    const file = parse("numexplode=4 # four");
    expect(list(find(file, "numexplode")).items).toHaveLength(1);
  });

  it("ignores whole-line comments", () => {
    const file = parse("# a comment\nnumexplode=4\n# another");
    expect(file.definitions.map((d) => d.name)).toEqual(["numexplode"]);
  });

  it("ignores a comment inside a section", () => {
    const file = parse("aa={ # note\n bb=1 # trailing\n }");
    expect(section(find(file, "aa")).definitions).toHaveLength(1);
  });
});

describe("Cual blocks", () => {
  it("captures a block's tokens without parsing them", () => {
    const file = parse("aa={ << xx = 1; >> }");
    const aa = section(find(file, "aa"));
    expect(aa.code).toHaveLength(1);
    // Cual compilation is group 3; the block is only captured here.
    expect(aa.code[0]?.tokens.length).toBeGreaterThan(0);
    expect(aa.code[0]?.tokens.some((t) => t.kind === "endCode")).toBe(false);
  });

  it("attaches a block to the section it is written in, not to a sibling", () => {
    const file = parse("outer={ inner={ << code >> } }");
    const outer = section(find(file, "outer"));
    const inner = section(findIn(outer.definitions, "inner"));
    expect(inner.code).toHaveLength(1);
    expect(outer.code).toHaveLength(0);
  });

  it("collects several blocks in one section", () => {
    expect(section(find(parse("aa={ << one >> << two >> }"), "aa")).code).toHaveLength(2);
  });

  it("keeps file-level blocks outside any section", () => {
    const file = parse("<< top >>\naa=1");
    expect(file.code).toHaveLength(1);
    expect(file.definitions.map((d) => d.name)).toEqual(["aa"]);
  });

  it("reports an unterminated block", () => {
    expect(() => parse("aa={ << xx=1; }")).toThrow(/expected '>>'/);
  });
});

describe("upstream's example.ld", () => {
  const file = parse(EXAMPLE);
  const level = section(file.definitions[0] as LdDefinition);

  it("finds one top-level definition", () => {
    expect(file.definitions).toHaveLength(1);
    expect(file.definitions[0]?.name).toBe("example");
  });

  it("reads the level's settings", () => {
    expect(findIn(level.definitions, "name")).toBeDefined();
    expect(findIn(level.definitions, "author")).toBeDefined();
    expect(findIn(level.definitions, "description")).toBeDefined();
  });

  it("reads the kind lists", () => {
    expect(words(findIn(level.definitions, "pics"))).toEqual([
      "igGo.xpm",
      "inGruen.xpm",
      "my_special",
    ]);
    expect(words(findIn(level.definitions, "startpic"))).toEqual(["ipStart.xpm"]);
    expect(words(findIn(level.definitions, "greypic"))).toEqual([
      "inSchwarz.xpm",
    ]);
  });

  it("reads both numexplode definitions with their versions", () => {
    const general = findIn(level.definitions, "numexplode");
    expect(general.versions).toEqual([]);
    const single = level.definitions.filter((d) => d.name === "numexplode")[1];
    expect(single?.versions).toEqual(["1"]);
  });

  it("reads the startdist rows as strings", () => {
    const rows = list(findIn(level.definitions, "startdist")).items;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      value: { type: "string", text: ".AF....AF." },
    });
  });

  it("reads the nested kind section with its expression and code", () => {
    const special = section(findIn(level.definitions, "my_special"));
    expect(words(findIn(special.definitions, "pics"))).toEqual([
      "ihBlau.xpm",
      "inSchwarz2.xpm",
    ]);
    const neighbours = list(findIn(special.definitions, "neighbours")).items[0];
    expect(neighbours?.type).toBe("expr");
    expect(special.code).toHaveLength(1);
  });
});

describe("errors", () => {
  it("rejects a definition with no name", () => {
    expect(() => parse("=4")).toThrow(/expected a name/);
  });

  it("rejects a missing equals sign", () => {
    expect(() => parse("numexplode 4")).toThrow(/expected '='/);
  });

  it("rejects a value that is not a datum", () => {
    expect(() => parse("aa=,")).toThrow();
  });

  it("reports the filename in the message", () => {
    let caught: unknown;
    try {
      parseLd("=4", "nasenkugeln.ld");
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toContain("nasenkugeln.ld:1:");
  });
});

describe("node shape", () => {
  it("gives every node a type tag and a position", () => {
    const file = parse(EXAMPLE);
    const walk = (node: LdNode): void => {
      expect(typeof node.type).toBe("string");
      expect(node.pos.line).toBeGreaterThan(0);
      if (node.type === "section") {
        for (const def of node.definitions) walk(def.value);
      }
      if (node.type === "list") {
        for (const item of node.items) walk(item);
      }
      if (node.type === "repeat") walk(node.count);
    };
    for (const def of file.definitions) walk(def.value);
  });
});
