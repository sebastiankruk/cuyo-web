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
import { parseLd } from "./parser.ts";
import type { LdDefinition, LdNode } from "./parser.ts";
import type { Token } from "./lexer.ts";
import { Version, VersionSet } from "./version.ts";
import { DefinitionScope, rootScope } from "./scope.ts";
import { buildKinds, UNDEFINED_EXPLODE } from "./kinds.ts";
import { GRX, hexGeometry, isHexMode } from "../game-core/constants.ts";
import {
  NO_RANDOM_GREYS,
  isHexNeighbourMode,
  kindDefaultsFrom,
  readLevelSettings,
} from "./settings.ts";
import {
  boardHex,
  readNeighbourOverrides,
  requireNeighbourMode,
} from "./neighbours.ts";
import { placeRows, readStartDist } from "./startdist.ts";
import { accidentalPairs, buildStartLayout } from "./startlayout.ts";
import { ScriptedPrng } from "../testing/prng-stub.ts";

/**
 * A deterministic PRNG for a corpus case, seeded from the case's own name.
 *
 * The layout is a function of the seed, so naming the seed after the level means a
 * failure report identifies the exact layout that produced it - reproducible without
 * having to guess which of several seeds CI happened to use.
 */
function corpusPrng(where: string): ScriptedPrng {
  let seed = 0x2545f491;
  for (let i = 0; i < where.length; i++) {
    seed = (Math.imul(seed, 31) + where.charCodeAt(i)) | 0;
  }
  const values: number[] = [];
  let s = seed >>> 0 || 1;
  for (let i = 0; i < 400000; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    values.push(s / 0x7fffffff);
  }
  return new ScriptedPrng(values);
}

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
      bracketed += lexFile(name).tokens.filter(
        (t) => t.kind === "punct" && t.text === "[",
      ).length;
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
      expect(seen.has(op), `operator ${op} never seen in the corpus`).toBe(
        true,
      );
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
          expect(
            t.text.length,
            `${name}: one-letter word ${t.text}`,
          ).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("uses the zeroOne literal rather than a number for bare 0 and 1", () => {
    let zeroOne = 0;
    for (const name of ALL_LD_FILES) {
      zeroOne += lexFile(name).tokens.filter(
        (t) => t.kind === "zeroOne",
      ).length;
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

describe("upstream corpus: the parser reads it", () => {
  it("parses every .ld file", () => {
    // Tokenising is not parsing. The grammar has several rules the lexer knows
    // nothing about - dotted names rejoined from three tokens, version specifiers
    // that may be numbers, signed numbers split across two tokens - and each one
    // was wrong here until the corpus was run through it.
    const failures: string[] = [];
    let definitions = 0;
    for (const name of ALL_LD_FILES) {
      try {
        definitions += parseLd(lexFile(name).source, name).definitions.length;
      } catch (error) {
        failures.push(`${name}: ${(error as Error).message}`);
      }
    }
    expect(failures, `\n${failures.join("\n")}`).toEqual([]);
    expect(definitions).toBeGreaterThan(100);
  });

  it("finds the constructs the resolution steps depend on", () => {
    // Each of these is needed by a later task, and none of them appears in the
    // inline fixtures, so the corpus is the only place they are exercised.
    let dotted = 0;
    let versioned = 0;
    let repeats = 0;
    let expressions = 0;
    let signed = 0;
    let numericVersions = 0;

    const walk = (node: LdNode): void => {
      if (node.type === "section") {
        for (const def of node.definitions) {
          // Dotted names are only reached through the picture lists here; no
          // definition in the corpus is itself dotted, because the dot always
          // belongs to a file name.
          if (def.name.includes(".")) dotted++;
          if (def.versions.length > 0) versioned++;
          if (def.versions.some((v) => /^[0-9]+$/.test(v))) numericVersions++;
          walk(def.value);
        }
        return;
      }
      if (node.type === "list") {
        for (const item of node.items) {
          if (item.type === "repeat") {
            repeats++;
            if (item.word.includes(".")) dotted++;
          }
          if (item.type === "expr") expressions++;
          if (
            item.type === "datum" &&
            item.value.type === "word" &&
            item.value.text.includes(".")
          ) {
            dotted++;
          }
          if (
            item.type === "datum" &&
            item.value.type === "number" &&
            item.value.value < 0
          ) {
            signed++;
          }
          walk(item);
        }
        return;
      }
      if (node.type === "repeat") walk(node.count);
    };

    for (const name of ALL_LD_FILES) {
      const file = parseLd(lexFile(name).source, name);
      for (const def of file.definitions) walk(def.value);
    }

    expect(dotted, "no dotted names").toBeGreaterThan(0);
    expect(versioned, "no versioned definitions").toBeGreaterThan(0);
    expect(numericVersions, "no numeric [1]/[2] versions").toBeGreaterThan(0);
    expect(repeats, "no repeat shorthand").toBeGreaterThan(0);
    expect(expressions, "no <...> expressions").toBeGreaterThan(0);
    expect(signed, "no negative numbers").toBeGreaterThan(0);
  });

  it("passes the version rules on every versioned definition upstream ships", () => {
    // Task 2.4's real oracle. The rules are transcribed from `src/version.cpp`,
    // and this is what says the transcription is right: every `[2]` beside
    // `[hard]` in the corpus has the joint definition the man page demands,
    // every `[easy,hard]` is absent, and every `[1]`/`[2]` pair is legal with no
    // unqualified definition - `baender.ld` is one, and so are fifteen others.
    //
    // What the corpus cannot settle is the redundancy rule, where the C++ as
    // written and as described differ, because no shipped level is eclipsed
    // under either reading. `version.test.ts` pins that one.
    //
    // `defaultPresent` is true, which is what every level setting and every
    // section lookup upstream uses (`DatenDateiPush` passes `verlange = true`),
    // so a name defined only for some versions is legal.
    const failures: string[] = [];
    let versionedNames = 0;
    for (const name of ALL_LD_FILES) {
      const file = parseLd(lexFile(name).source, name);
      const check = (defs: readonly LdDefinition[], path: string): void => {
        const set = new VersionSet<string>();
        for (const def of defs) {
          if (def.versions.length === 0) continue;
          // Upstream compares the version as a set, so `a,b` and `b,a` collide.
          set.add(def.name, Version.of(...def.versions), path);
        }
        for (const key of set.names()) {
          versionedNames++;
          try {
            set.checkWellFormed(key, true);
          } catch (error) {
            failures.push(
              `${name} ${path}/${key}: ${(error as Error).message}`,
            );
          }
        }
        for (const def of defs) {
          if (def.value.type === "section") {
            check(def.value.definitions, `${path}/${def.name}`);
          }
        }
      };
      check(file.definitions, "");
    }
    expect(failures, `\n${failures.join("\n")}`).toEqual([]);
    expect(versionedNames).toBeGreaterThan(20);
  });

  it("builds the kind table of every level section in the corpus", () => {
    // Task 2.5's oracle. Kind numbering is where the level format stops being
    // obvious - a name that appears in two declaration lists takes the number of
    // its first appearance - so the only way to know the transcription is right
    // is to run it over the real level data.
    //
    // The scope chain is the one `ladLevelConfig` produces: `globals.ld` is loaded
    // into the same root node as the level files, and a level section's parent is
    // that root. `<...>` expressions such as `<neighbours_hex6>` resolve through
    // it, so a level whose kinds are built without it would fail on every hex
    // mode in the corpus.
    //
    // Every version is tried, because the versioned declarations are where the
    // numbering gets interesting: `baender.ld` has five bands in one-player and
    // four in two-player, and both have to build.
    const globals = parseLd(lexFile("globals.ld").source, "globals.ld");
    const versions = [
      Version.of("1", "main"),
      Version.of("2", "main"),
      Version.of("1", "main", "hard"),
      Version.of("2", "contrib", "easy"),
    ];

    const failures: string[] = [];
    let levels = 0;
    let kinds = 0;
    let constants = 0;

    for (const name of ALL_LD_FILES) {
      if (
        name === "summary.ld" ||
        name === "globals.ld" ||
        name === "example.ld"
      ) {
        continue;
      }
      const file = parseLd(lexFile(name).source, name);
      const levelSections = file.definitions.filter(
        (d) => d.value.type === "section",
      );
      if (levelSections.length === 0) continue;

      for (const version of versions) {
        const root = rootScope(name, version);
        root.defineAll(globals.definitions);
        root.defineAll(file.definitions);
        for (const def of levelSections) {
          if (def.value.type !== "section") continue;
          levels++;
          const level = new DefinitionScope(def.name, root, version, name);
          level.defineAll(def.value.definitions);
          try {
            const table = buildKinds(level, {
              neighbours: 0,
              chainGrass: false,
              numExplode: 4,
            });
            // A kind table with holes would mean a list's slots were claimed by a
            // list that has since shrunk, which the kind array could not index.
            expect(
              table.kinds.map((k) => k.id),
              `${name} ${def.name}[${version}]: kind ids are not 0..count-1`,
            ).toEqual(table.kinds.map((_, i) => i));
            expect(table.count, `${name} ${def.name}: kind count`).toBe(
              table.kinds.length,
            );
            kinds += table.count;
            constants += table.constants.size;
          } catch (error) {
            failures.push(
              `${name} ${def.name}[${version}]: ${(error as Error).message}`,
            );
          }
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}`).toEqual([]);
    // Floors, not exact figures: what they say is that a large part of the corpus
    // is being built, so a future change that makes `buildKinds` quietly skip
    // levels cannot pass unnoticed. Four versions of every level section, which
    // is 2556 kinds and 1184 distinct kind names.
    expect(levels).toBeGreaterThan(300);
    expect(kinds).toBeGreaterThan(2000);
    expect(constants).toBeGreaterThan(1000);
  });

  it("reads the settings of every level section in the corpus", () => {
    // Task 2.6's oracle. The defaults are upstream's, and the only way to know
    // they are the right defaults is to read every real level and see which of
    // them it relies on: a level that sets `bgcolor` everywhere would mean the
    // white default was never exercised, and a level that sets it nowhere would
    // mean the value is untested in the other direction.
    const globals = parseLd(lexFile("globals.ld").source, "globals.ld");
    const versions = [
      Version.of("1", "main"),
      Version.of("2", "main"),
      Version.of("1", "contrib", "hard"),
    ];

    const failures: string[] = [];
    const setCounts = new Map<string, number>();
    let levels = 0;
    let withoutDescription = 0;
    let withRandomGreys = 0;
    let hexLevels = 0;
    let noNumExplode = 0;

    for (const name of ALL_LD_FILES) {
      if (
        name === "summary.ld" ||
        name === "globals.ld" ||
        name === "example.ld"
      ) {
        continue;
      }
      const file = parseLd(lexFile(name).source, name);
      const levelSections = file.definitions.filter(
        (d) => d.value.type === "section",
      );
      if (levelSections.length === 0) continue;

      for (const version of versions) {
        const root = rootScope(name, version);
        root.defineAll(globals.definitions);
        root.defineAll(file.definitions);
        for (const def of levelSections) {
          if (def.value.type !== "section") continue;
          levels++;
          const level = new DefinitionScope(def.name, root, version, name);
          level.defineAll(def.value.definitions);
          try {
            const settings = readLevelSettings(level);
            for (const header of level.definitionsInOrder()) {
              const counted = setCounts.get(header.name) ?? 0;
              setCounts.set(header.name, counted + 1);
            }
            if (settings.description === "") withoutDescription++;
            if (settings.randomGreys !== NO_RANDOM_GREYS) withRandomGreys++;
            if (isHexNeighbourMode(settings.neighbours)) hexLevels++;
            if (settings.numExplode === UNDEFINED_EXPLODE) noNumExplode++;
          } catch (error) {
            failures.push(
              `${name} ${def.name}[${version}]: ${(error as Error).message}`,
            );
          }
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}`).toEqual([]);

    // Every one of these is a documented setting that at least one real level
    // uses, so a reader of the corpus knows the readers are all reached.
    for (const setting of [
      "name",
      "author",
      "description",
      "numexplode",
      "neighbours",
      "chaingrass",
      "toptime",
      "toppic",
      "topoverlap",
      "topstop",
      "mirror",
      "randomfallpos",
      "randomgreys",
      "nogreyprob",
      "bgcolor",
      "textcolor",
      "topcolor",
      "bgpic",
      "emptypic",
      "hexflip",
    ]) {
      expect(
        setCounts.get(setting) ?? 0,
        `${setting} never appears`,
      ).toBeGreaterThan(0);
    }

    // And the defaults are exercised rather than assumed. The description is the
    // exception rather than the rule - 81 of 237 level reads leave it out - and a
    // good number set no `numexplode` at all, relying on the per-kind ones.
    expect(withoutDescription).toBeGreaterThan(0);
    expect(withoutDescription).toBeLessThan(levels / 2);
    expect(noNumExplode).toBeGreaterThan(0);
    expect(withRandomGreys).toBeGreaterThan(0);
    expect(hexLevels).toBeGreaterThan(0);
    expect(levels).toBeGreaterThan(200);
  });

  it("resolves the neighbour mode of every level and kind in the corpus", () => {
    // Task 2.7's oracle. Two things are checked for every real level: that its
    // own `neighbours` is one of the ten, and that every kind overriding it is
    // too. The second is the one worth having - a per-kind mode is a number in
    // the level data like any other, and there is no other point at which a bad
    // one would be noticed.
    //
    // The hex flag is checked separately, because it comes from the level-wide
    // value alone: a level may set a hex mode on one kind in a rectangular board
    // and that must not turn the geometry on.
    const globals = parseLd(lexFile("globals.ld").source, "globals.ld");
    const versions = [
      Version.of("1", "main"),
      Version.of("2", "main"),
      Version.of("1", "weird", "hard"),
    ];

    const failures: string[] = [];
    let levels = 0;
    let hexBoards = 0;
    let perKindHexInRectBoard = 0;
    let withOverrides = 0;

    for (const name of ALL_LD_FILES) {
      if (
        name === "summary.ld" ||
        name === "globals.ld" ||
        name === "example.ld"
      ) {
        continue;
      }
      const file = parseLd(lexFile(name).source, name);
      const levelSections = file.definitions.filter(
        (d) => d.value.type === "section",
      );
      if (levelSections.length === 0) continue;

      for (const version of versions) {
        const root = rootScope(name, version);
        root.defineAll(globals.definitions);
        root.defineAll(file.definitions);
        for (const def of levelSections) {
          if (def.value.type !== "section") continue;
          levels++;
          const level = new DefinitionScope(def.name, root, version, name);
          level.defineAll(def.value.definitions);
          try {
            const settings = readLevelSettings(level);
            requireNeighbourMode(settings.neighbours, level, "neighbours");
            const hex = boardHex(level);
            if (hex.enabled) hexBoards++;
            const table = buildKinds(level, kindDefaultsFrom(settings));
            const overrides = readNeighbourOverrides(level, table);
            if (overrides.length > 0) withOverrides++;
            for (const o of overrides) {
              // A per-kind hex mode in a rectangular board must not have enabled
              // the geometry; if the level-wide mode is rectangular, the board
              // stays square no matter what the kinds say.
              if (!hex.enabled && isHexMode(o.mode)) perKindHexInRectBoard++;
            }
          } catch (error) {
            failures.push(
              `${name} ${def.name}[${version}]: ${(error as Error).message}`,
            );
          }
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}`).toEqual([]);
    // The corpus really does use hex boards and really does override the mode per
    // kind - five levels do, with `neighbours_none`, `neighbours_horizontal`,
    // `neighbours_vertical`, `neighbours_diagonal`, `neighbours_knight` and
    // `neighbours_eight` among them, so every rectangular mode is reached.
    expect(hexBoards).toBeGreaterThan(0);
    expect(withOverrides).toBeGreaterThan(0);
    expect(levels).toBeGreaterThan(200);

    // What the corpus does *not* have: a hex mode on a kind in a rectangular
    // board. All eleven hex levels set the mode level-wide. Asserted as an
    // absence on purpose - it says the mode/geometry separation is covered only by
    // `neighbours.test.ts`, so nobody reads a green corpus run as evidence that
    // it is exercised by the level data.
    expect(perKindHexInRectBoard).toBe(0);
  });

  it("decodes the startdist of every level in the corpus", () => {
    // Task 2.8's oracle. `startdist` is where the level format stops being
    // readable and starts being arithmetic - a base-62 predecessor search over
    // the kinds' distkeys, four or eight keys that may run backwards - so the only
    // way to know the transcription is right is to run it over the real data.
    //
    // Several levels declare `startdist` more than once for different versions or
    // player counts, so this exercises version resolution too: `maze.ld` has four
    // declarations and the two players get different boards out of the same file.
    const globals = parseLd(lexFile("globals.ld").source, "globals.ld");
    const versions = [
      Version.of("1", "main"),
      Version.of("2", "main"),
      Version.of("1", "contrib", "hard"),
    ];

    const failures: string[] = [];
    let decoded = 0;
    let cells = 0;
    let infoRows = 0;
    let twoPlayer = 0;
    let multiKey = 0;
    const characters = new Set<string>();

    for (const name of ALL_LD_FILES) {
      if (
        name === "summary.ld" ||
        name === "globals.ld" ||
        name === "example.ld"
      ) {
        continue;
      }
      const file = parseLd(lexFile(name).source, name);
      const levelSections = file.definitions.filter(
        (d) => d.value.type === "section",
      );
      if (levelSections.length === 0) continue;

      for (const version of versions) {
        const root = rootScope(name, version);
        root.defineAll(globals.definitions);
        root.defineAll(file.definitions);
        for (const def of levelSections) {
          if (def.value.type !== "section") continue;
          const level = new DefinitionScope(def.name, root, version, name);
          level.defineAll(def.value.definitions);
          if (!level.hasOwn("startdist")) continue;
          for (const two of [false, true]) {
            try {
              const settings = readLevelSettings(level);
              const table = buildKinds(level, kindDefaultsFrom(settings));
              const dist = readStartDist(level, table, two);
              decoded++;
              if (dist.keyLen > 1) multiKey++;
              if (dist.twoPlayers) twoPlayer++;
              if (dist.info !== null) infoRows++;
              // Every placed cell, which is rows times 10 for each mode.
              for (const boardRow of placeRows(dist)) cells += boardRow.length;
              const list = level.ownList("startdist");
              for (const v of list?.values ?? []) {
                if (v.type === "number") continue;
                for (const ch of v.text) characters.add(ch);
              }
            } catch (error) {
              failures.push(
                `${name} ${def.name}[${version}]${two ? " 2P" : ""}: ${(error as Error).message}`,
              );
            }
          }
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}`).toEqual([]);
    expect(decoded).toBeGreaterThan(200);
    expect(cells).toBeGreaterThan(20000);

    // Every construct the decoder implements, reached by the real data rather than
    // only by the unit tests: the informational rows, the two-player rows, the
    // multi-character keys, and the six single-character keys.
    expect(infoRows).toBeGreaterThan(0);
    expect(twoPlayer).toBeGreaterThan(0);
    // The six sentinels, and one character from each base-62 branch - a digit, an
    // uppercase letter and a lowercase one. `A` is the one that matters most: it is
    // the default distkey, so almost every named cell in the corpus uses it.
    const required = [".", "+", "-", "*", "%", "&", "1", "A", "a"];
    const missing = required.filter((ch) => !characters.has(ch));
    expect(
      missing,
      `never appears in a startdist: ${missing.join(" ")}`,
    ).toEqual([]);

    // What the corpus does *not* have: a level whose kinds declare a multi-character
    // distkey, so that every cell is two or more characters wide. The extension is
    // documented in cual.6 and no shipped level uses it, which means `distKeyLen`
    // is 1 everywhere here and the multi-character paths - and the error for
    // distkeys of differing lengths - are covered only by `startdist.test.ts`.
    // Asserted as an absence on purpose, so a green corpus run is never read as
    // evidence that they are exercised.
    expect(multiKey).toBe(0);
  });

  it("finds the Cual blocks the runtime will need", () => {
    let blocks = 0;
    let insideSections = 0;
    for (const name of ALL_LD_FILES) {
      const file = parseLd(lexFile(name).source, name);
      blocks += file.code.length;
      const walk = (node: LdNode): void => {
        if (node.type === "section") {
          blocks += node.code.length;
          insideSections += node.code.length;
          for (const def of node.definitions) walk(def.value);
        } else if (node.type === "list") {
          for (const item of node.items) walk(item);
        } else if (node.type === "repeat") {
          walk(node.count);
        }
      };
      for (const def of file.definitions) walk(def.value);
    }
    expect(insideSections, "no Cual inside a section").toBeGreaterThan(70);
    expect(blocks).toBeGreaterThan(70);
  });
});

/**
 * Task 2.9's oracle: the start layouts of every real level, with the
 * neighbour-avoidance heuristic applied.
 *
 * This is where the unit tests stop being enough. `startlayout.test.ts` shows the
 * heuristic removes adjacency from a synthetic row of pool draws; it cannot show
 * that it behaves on the real data, where rows have mixed keys, where some cells are
 * fixed and some are drawn, and where the neighbour mode is diagonal or hexagonal and
 * therefore changes what counts as adjacency at all.
 *
 * Two things are asserted, and the second is the one that matters:
 *
 * 1. Every real level's startdist materialises without error.
 * 2. The number of accidental same-kind adjacencies stays low. This is the claim
 *    task 2.9 makes, and it is checked per level rather than in aggregate - an
 *    aggregate would let one bad level hide inside a good average.
 */
describe("upstream corpus: start layouts", () => {
  /**
   * How many avoidable same-kind adjacencies a real level may keep.
   *
   * One. Measured across all 81 levels, three versions and both player counts: the
   * heuristic leaves exactly one pair in four cases, all hex or knight geometry, and
   * zero everywhere else. Anything that raises this number is a regression.
   */
  const MAX_ACCIDENTAL_PAIRS = 1;

  it("materialises every real level's startdist, with few accidental adjacencies", () => {
    const globals = parseLd(lexFile("globals.ld").source, "globals.ld");
    const versions = [
      Version.of("1", "main"),
      Version.of("2", "main"),
      Version.of("1", "contrib", "hard"),
    ];

    const failures: string[] = [];
    /** Levels whose heuristicised layout still has avoidable adjacency. */
    const adjacencies: string[] = [];
    let laid = 0;
    let levelsWithRows = 0;
    let worst = 0;
    let worstWhere = "";

    for (const name of ALL_LD_FILES) {
      if (
        name === "summary.ld" ||
        name === "globals.ld" ||
        name === "example.ld"
      ) {
        continue;
      }
      const file = parseLd(lexFile(name).source, name);
      const levelSections = file.definitions.filter(
        (d) => d.value.type === "section",
      );
      if (levelSections.length === 0) continue;

      for (const version of versions) {
        const root = rootScope(name, version);
        root.defineAll(globals.definitions);
        root.defineAll(file.definitions);
        for (const def of levelSections) {
          if (def.value.type !== "section") continue;
          const level = new DefinitionScope(def.name, root, version, name);
          level.defineAll(def.value.definitions);
          if (!level.hasOwn("startdist")) continue;
          for (const two of [false, true]) {
            const where = `${name} ${def.name}[${version.toString()}]${two ? " 2P" : ""}`;
            try {
              const settings = readLevelSettings(level);
              const table = buildKinds(level, kindDefaultsFrom(settings));
              const dist = readStartDist(level, table, two);
              const hex = hexGeometry(settings.neighbours, settings.hexFlip);
              const layout = buildStartLayout(dist, {
                table,
                random: corpusPrng(where),
                neighbours: settings.neighbours,
                hex,
              });
              laid++;
              if (dist.rows.length > 0) levelsWithRows++;

              // Only pairs with a drawn end count: a hand-authored layout is full of
              // deliberate same-kind neighbours, and calling those accidental would
              // be reporting the level author's work as a failure.
              const pairs = accidentalPairs(
                layout,
                table,
                settings.neighbours,
                hex,
              );
              // One accidental pair is the worst the corpus produces, in four
              // level/version combinations - all hex or knight geometry, where a
              // cell's neighbours are not the four around it and the greedy descent
              // can paint itself into a corner. So the threshold is one, not zero:
              // the heuristic is very nearly perfect on real data and this is what
              // "very nearly" measures at.
              if (pairs > MAX_ACCIDENTAL_PAIRS) {
                adjacencies.push(
                  `${where}: ${pairs} pairs over ${dist.rows.length * GRX} cells`,
                );
              }
              if (pairs > worst) {
                worst = pairs;
                worstWhere = where;
              }
            } catch (error) {
              failures.push(`${where}: ${(error as Error).message}`);
            }
          }
        }
      }
    }

    expect(failures, `\n${failures.join("\n")}`).toEqual([]);
    expect(laid, "start layouts built").toBeGreaterThan(200);
    expect(levelsWithRows).toBeGreaterThan(150);

    // Reported rather than hidden: the worst level is worth knowing about, and a
    // future corpus that grows a genuinely bad layout should be visible in review.
    expect(
      adjacencies,
      `levels with more than ${MAX_ACCIDENTAL_PAIRS} accidental same-kind pair ` +
        `(worst single: ${worst} at ${worstWhere})\n` +
        adjacencies.slice(0, 10).join("\n"),
    ).toEqual([]);
  });
});
