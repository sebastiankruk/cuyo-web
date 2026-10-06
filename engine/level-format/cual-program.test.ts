// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The Cual program a level carries: its procedures, and the code each blob runs.
 *
 * Task 15.1, verified across the whole corpus rather than on a convenient level. The function
 * under test is `buildLevelProgram`, and the three things worth knowing about it are all things
 * the corpus can be asked about:
 *
 *  - **which code a kind runs** is the procedure *named after the kind*, falling back to a
 *    default chosen by its picture count (`src/sorte.cpp:98-131`);
 *  - **`globals.ld` shares the level's namespace**, so `schema16` and `default3` resolve
 *    exactly as they do upstream, which loads both files into one config
 *    (`src/leveldaten.cpp:220-227`);
 *  - **a blob's variable array has to be long enough for every node in the configuration**,
 *    because a blob can reach any procedure by calling it — which is why the allocation runs
 *    over the trees *as parsed* and not over the linked ones.
 *
 * The kinds come from the real `LevelLoader` and the code from `parseLd`, so nothing here is
 * transcribed by hand. The loader does not build programs yet — that is 15.2 — so the two are
 * joined here rather than in production, which is the one seam this file exists to cover.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LevelLoader } from "./loader.ts";
import { parseLd } from "./parser.ts";
import { buildLevelProgram, EMPTY_PROGRAM } from "./cual-program.ts";
import { defaultCodeFor } from "./kinds.ts";
import type { LevelProgram } from "./cual-program.ts";
import type { Kind } from "./level-data.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import { createPrng } from "../prng.ts";
import { walkStatements } from "../cual-runtime/compile.ts";
import { SPECIAL_VARIABLE_COUNT } from "../cual-runtime/store.ts";
import type { Stmt } from "../cual-runtime/code.ts";

/**
 * The node kinds anywhere in a tree, deduplicated and sorted.
 *
 * Asserted on the tree rather than on the top-level shape, because the top level is an artefact
 * of how a body was written: `parseCode` wraps a body's statements in a `block`, so
 * `default1 = *;` comes back as one `block` containing one `draw` and `a = {first;}` as one
 * `block` containing whatever `first` expanded to. An exact top-level assertion would be
 * asserting the parser's wrapping rather than the level's code.
 */
const nodeKinds = (statements: readonly Stmt[]): string[] =>
  [...new Set([...walkStatements(statements)].map((node) => node.kind))].sort();

/** The names of the `call` nodes left anywhere in a tree. */
const callsIn = (statements: readonly Stmt[]): string[] =>
  [...walkStatements(statements)]
    .filter((node) => node.kind === "call")
    .map((node) => (node as Extract<Stmt, { kind: "call" }>).name);

const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");
const GLOBALS_SOURCE = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");
const GLOBALS = parseLd(GLOBALS_SOURCE, "globals.ld");

/** A fresh loader per call: `LevelLoader` caches by filename. */
function loader() {
  return new LevelLoader({
    fetchLevel: async (filename) => readFileSync(resolve(DATA_DIR, filename), "latin1"),
    art: ART_MANIFEST,
    globalsSource: GLOBALS_SOURCE,
    random: createPrng(1),
  });
}

/** The program's own code and the real kinds that will run it. */
async function programFor(
  id: string,
): Promise<{ program: LevelProgram; kinds: readonly Kind[] }> {
  const entry = LEVEL_INDEX.levels.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`${id} is not in the level index`);
  const difficulty = [...entry.difficulties.values()][0];
  if (difficulty === undefined) throw new Error(`${id} has no difficulties`);
  const loaded = await loader().load(
    entry.filename,
    entry.id,
    difficulty.track,
    difficulty.difficulty,
  );
  // The loader's own program, rather than a second `buildLevelProgram` call here.
  //
  // This used to re-parse the file and rebuild the program, which meant the suite was checking
  // a *different* build from the one the game loads — and it broke when `buildLevelProgram`
  // grew a fourth argument. `konstante`'s name lookup needs a resolved `DefinitionScope`, which
  // only the loader has, so the honest arrangement is that there is one build and the test reads
  // it. What this costs is nothing: the assertions below are about the program, and the loader
  // produces exactly the program `buildLevelProgram` would.
  return { program: loaded.level.program, kinds: loaded.level.kinds };
}

/** Every level and its first difficulty, as the catalogue addresses them. */
function everyLevel() {
  return LEVEL_INDEX.levels.map((entry) => ({
    entry,
    difficulty: [...entry.difficulties.values()][0],
  }));
}

const indexOfKind = (kinds: readonly Kind[], name: string): number =>
  kinds.findIndex((kind) => kind.name === name);

/** One colour kind, for the synthetic levels the recursion rule is checked on. */
const syntheticKind = (name: string): Kind[] => [
  {
    id: 0,
    name,
    role: "colour",
    artKey: name,
    baseKind: 0,
    pictures: [],
    pictureCounts: [],
    versions: 1,
    weight: 1,
    behaviour: 0,
    numexplode: 5,
    colourProb: 1,
    greyProb: 0,
    goalProb: 0,
    distKey: null,
    defaultCode: null,
    drawCode: null,
  },
];

describe("a kind runs the procedure named after it", () => {
  it("baggis.ld's kinds each have their own, and it is what they call", async () => {
    const { program, kinds } = await programFor("Baggis");

    // `sbKaese = {geblitzt;schema16;sungl};` — three calls spliced into one body, so the tree
    // holds what all three do and no `call` survives.
    const kaese = program.drawCode[indexOfKind(kinds, "sbKaese")];
    expect(kaese).not.toBeNull();
    expect(callsIn(kaese ?? [])).toEqual([]);
    expect(nodeKinds(kaese ?? [])).toEqual([
      "assign",
      "block",
      "commaSequence",
      "draw",
      "letterDraw",
      "number",
      "sequence",
      "switch",
      "switchCase",
    ]);

    // Every one of the seven kinds names its own code, so none of them falls back.
    const withOwnCode = kinds.filter((kind) => program.procedures.has(kind.name));
    expect(withOwnCode.map((kind) => kind.name)).toEqual([
      "sbKaese",
      "sbBrezel",
      "sbBurger",
      "sbBroetchen",
      "sbSunglas",
      "sbOfen",
      "sbBlitzer",
    ]);
  });

  it("and the level's own procedures are in scope, not only its kinds'", async () => {
    const { program } = await programFor("Baggis");
    // `geblitzt`, `sunglasx` and `sungl` are the level's; `schema16` is globals'.
    expect([...program.procedures.keys()]).toEqual(
      expect.arrayContaining(["geblitzt", "sunglasx", "sungl", "schema16", "default3"]),
    );
  });

  it("leaves no call unresolved anywhere in the corpus", async () => {
    // The strongest single statement available: every call in all 79 levels resolves. A
    // regression here would otherwise show up as one level's blob throwing at run time.
    const unresolved: string[] = [];
    for (const { entry, difficulty } of everyLevel()) {
      const { program } = await programFor(entry.id);
      for (const miss of program.unresolved) {
        unresolved.push(`${entry.id}: ${miss.owner} calls ${miss.name}`);
      }
      expect(difficulty).toBeDefined();
    }
    expect(unresolved).toEqual([]);
  });

  it("leaves no call node in any kind's draw code", async () => {
    // Belt and braces on the same claim, checked on the trees rather than on the report: a
    // `call` reaching the walker throws, so one surviving in a draw tree is a level that would
    // fail the first time a blob of that kind animated.
    const survivors: string[] = [];
    for (const { entry } of everyLevel()) {
      const { program, kinds } = await programFor(entry.id);
      program.drawCode.forEach((code, index) => {
        if (code === null) return;
        for (const name of callsIn(code)) {
          survivors.push(`${entry.id}/${kinds[index]?.name} calls ${name}`);
        }
      });
    }
    expect(survivors).toEqual([]);
  });
});

describe("a kind with no code of its own runs a default", () => {
  it("and five kinds in the corpus need one, and three of them were drawing wrong", async () => {
    // The fallback is a tail, not the main path. Of 556 kinds, 502 define a procedure of their
    // own; these five are the ones that do not.
    //
    // **This list was wrong before the icon counts existed, and so was the claim underneath
    // it.** The earlier version read a `pics` run's `count` as an icon count — but `* N` is
    // `getVielfachheit`, the number of `Sorte` objects sharing one picture — so all five came
    // out `default1` and **three of them drew the wrong picture**. `default1 = *` draws icon 0
    // and `default2g = {pos=version; *}` draws the version, so those three goal blobs showed
    // the same face every time whatever their `version` was.
    //
    // | kind                     | picture           | icons | default     |
    // | ------------------------ | ----------------- | ----: | ----------- |
    // | `Pfeile/ipGrau`          | `ipGrau.xpm`      |     1 | `default1`  |
    // | `Explosive/lbBlack`      | `lbBlack.xpm`     |     1 | `default1`  |
    // | `Embroidery/jsGruenGras` | `jsGruenGras.xpm` |     6 | `default2g` |
    // | `Ziehlen/gras`           | `mziAlle.xpm`     |    10 | `default2g` |
    // | `Darken/dnStart`         | `dnBlack.xpm`     |    16 | `default2g` |
    //
    // The five are named rather than counted, because "five" alone would still pass if two of
    // them silently changed which default they take.
    const expected: readonly (readonly [string, string])[] = [
      ["Pfeile/ipGrau", "default1"],
      ["Explosive/lbBlack", "default1"],
      ["Embroidery/jsGruenGras", "default2g"],
      ["Ziehlen/gras", "default2g"],
      ["Darken/dnStart", "default2g"],
    ];
    const found: string[] = [];
    const wrongDefault: string[] = [];
    for (const { entry } of everyLevel()) {
      const { program, kinds } = await programFor(entry.id);
      for (const [index, kind] of kinds.entries()) {
        if (program.drawCode[index] === null) continue;
        if (program.procedures.has(kind.name)) continue;
        const label = `${entry.id}/${kind.name}`;
        found.push(label);
        const want = expected.find(([name]) => name === label)?.[1];
        if (want !== undefined && kind.defaultCode !== want) {
          wrongDefault.push(`${label}: ${String(kind.defaultCode)} is not ${want}`);
        }
      }
    }
    expect(found.sort()).toEqual(expected.map(([name]) => name).sort());
    expect(wrongDefault).toEqual([]);
  });

  it("and all four defaults are chosen somewhere, though only two are ever run", async () => {
    // The census that replaces the claim this file used to make. That claim was that
    // `default2`, `default2g` and `default3` were "unreachable from the corpus because no level
    // writes a kind with exactly one multi-icon picture file" — and it was wrong on all three
    // counts, because the rule choosing between them was reading a `pics` run's multiplicity as
    // an icon count. Every multi-file kind was reported as `default1`.
    //
    // Measured across all 79 levels at the version this suite loads — one entry per level in
    // the catalogue, at its first declared difficulty — by how many kinds each default is
    // chosen for:
    //
    // | default     | kinds | of which the corpus actually runs it |
    // | ----------- | ----: | ------------------------------------: |
    // | `default1`  |     5 |     2 |
    // | `default2`  |   142 |     0 |
    // | `default2g` |    29 |     3 |
    // | `default3`  |   318 |     0 |
    //
    // So all four are reached and only two are ever *run*, which is a fact about the level
    // files rather than about the rule — every `default2` and `default3` kind in the corpus
    // defines a procedure of its own and takes precedence. `default3` is the interesting one:
    // 318 kinds choose it, which is every kind with more than one picture file.
    //
    // **The counts are exact rather than a floor, and the basis matters.** A floor of `>= 1`
    // would still pass with the rule reading multiplicities, because `default1` is then the only
    // value ever produced and the other three would be absent — so a floor cannot distinguish
    // "no kind chooses this" from "the test cannot see that any kind does". Pinning the numbers
    // is what makes it a census.
    //
    // The figures depend on the version loaded: the same census over every track and difficulty
    // separately gives 250 and 322 for `default2` and `default3`, because the version decides
    // which kinds exist at all (`baender.ld` has five bands in one-player and four in
    // two-player). So this asserts *one* basis and says which, rather than quoting a figure
    // that is true of some load and not others.
    const counts = new Map<string, number>();
    let run = 0;
    for (const { entry } of everyLevel()) {
      const { program, kinds } = await programFor(entry.id);
      for (const [index, kind] of kinds.entries()) {
        if (kind.defaultCode === null) continue;
        counts.set(kind.defaultCode, (counts.get(kind.defaultCode) ?? 0) + 1);
        if (program.procedures.has(kind.name)) continue;
        if (program.drawCode[index] !== null) run++;
      }
    }
    expect([...counts.entries()].sort()).toEqual([
      ["default1", 5],
      ["default2", 142],
      ["default2g", 29],
      ["default3", 318],
    ]);
    // And the five of them are named in the test above, so this is the total and not a second
    // way of counting the same thing.
    expect(run).toBe(5);
  });

  it("default1 is a bare draw, because a single-icon file has nothing to choose", async () => {
    // `default1 = *;` — a draw, and nothing else.
    const { program, kinds } = await programFor("Pfeile");
    const grey = kinds.find((kind) => kind.name === "ipGrau");
    expect(grey?.defaultCode).toBe("default1");
    expect(nodeKinds(program.drawCode[indexOfKind(kinds, "ipGrau")] ?? [])).toEqual(["draw"]);
  });

  it("default2g draws the version, which is the difference from default1", async () => {
    // `default2g = {pos=version;*}` against `default1 = *`, so a goal blob with six icons
    // shows which of them it is rather than always the first. Asserted as a draw plus an
    // assignment to `pos`, because "default1 vs default2g" is invisible in the finished
    // picture and is exactly the kind of difference a test has to name.
    const { program, kinds } = await programFor("Ziehlen");
    const gras = kinds.find((kind) => kind.name === "gras");
    expect(gras?.defaultCode).toBe("default2g");
    expect(gras?.pictures).toEqual(["mziAlle.xpm"]);
    const nodes = nodeKinds(program.drawCode[indexOfKind(kinds, "gras")] ?? []);
    expect(nodes).toContain("assign");
    expect(nodes).toContain("draw");
  });

  it("a kind's own procedure wins over its default, which is what upstream does", async () => {
    // `pfeile.ld`'s other seven kinds all have `default3`, and all seven define their own code,
    // so the default is never consulted for them. The lookup is the kind's name first and only
    // then the default — a resolution that took the default first would quietly replace every
    // level's own drawing with `schema16`.
    const { program, kinds } = await programFor("Pfeile");
    const own = kinds.filter((kind) => program.procedures.has(kind.name));
    expect(own).toHaveLength(7);
    // The three defaults all appear in one level, which is a better test than a single one:
    // the colours have six icons each (`ipHoch.xpm` and its five siblings are 64x96) so they
    // are `default2`, the grass has 24 (`ipStart.xpm` is 192x128) so it is `default2g`, and
    // the grey has one so it is `default1`. All seven with code still run their own code
    // instead — `default1` is a bare `*`, `default2` is `schema16` with a switch, and the
    // `if` and `scoped` below are in none of the three.
    expect(kinds.find((k) => k.name === "ipHoch")?.defaultCode).toBe("default2");
    expect(kinds.find((k) => k.name === "ipStart")?.defaultCode).toBe("default2g");
    expect(kinds.find((k) => k.name === "ipGrau")?.defaultCode).toBe("default1");
    const start = program.drawCode[indexOfKind(kinds, "ipStart")] ?? [];
    expect(callsIn(start)).toEqual([]);
    expect(nodeKinds(start)).toContain("if");
    expect(nodeKinds(start)).toContain("scoped");
  });

  it("default3 sets file from version before drawing, on a synthetic kind", async () => {
    // Chosen by 322 corpus kinds and **run by none of them**, because every one defines a
    // procedure of its own and takes precedence — asserted as a census in the test above. So
    // the shape of its code is pinned here rather than left to a level that happens to need it,
    // and `default2` is in the same position: chosen 250 times, run never.
    //
    // `default3 = {file=version;schema16}` — the assignment, then the spliced schema's switch.
    // The level defines a procedure for a *different* kind, so `bolzer` has none of its own and
    // the default is the only thing it can run.
    const file = parseLd(
      `Synthetic={
  pics=bolzer,ander
  <<
  ander = {9*;};
  >>}`,
      "synthetic.ld",
    );
    const [kind] = syntheticKind("bolzer");
    const program = buildLevelProgram(file, GLOBALS, [{ ...kind, defaultCode: "default3" }]);
    const code = program.drawCode[0] ?? [];
    // `default3 = {file=version;schema16}` — the assignment, then the spliced schema's switch,
    // and the switch is what makes this different from `default1`'s bare draw.
    expect(nodeKinds(code)).toEqual([
      "assign",
      "block",
      "draw",
      "letterDraw",
      "sequence",
      "switch",
      "switchCase",
    ]);
    expect(callsIn(code)).toEqual([]);
  });

  it("a kind with no pictures has no code at all, which is also upstream's rule", async () => {
    // `sorte.cpp:104`'s condition starts `mBilddateien.size() > 0`, so a kind with an empty
    // `artKey` gets nothing rather than a default that would try to draw. 49 of the corpus's
    // 556 kinds are in this state.
    const { program, kinds } = await programFor("Himmel");
    const empties = kinds.filter((kind) => kind.defaultCode === null);
    expect(empties.length).toBeGreaterThan(0);
    for (const kind of empties) {
      expect(program.drawCode[indexOfKind(kinds, kind.name)]).toBeNull();
    }
  });
});

describe("the global and semiglobal blobs", () => {
  it("run a procedure named after them, and get no default", async () => {
    // `Sorte("global")` and `Sorte("semiglobal")` from `leveldaten.cpp:520-521`, and
    // `sorte.cpp:104` excludes both from the default. So a level with no `global` procedure
    // has a global blob that does nothing, which is the common case.
    const { program } = await programFor("Baggis");
    expect(program.globalCode).toBeNull();
    expect(program.semiglobalCode).toBeNull();
  });

  it("and 7 levels define a global and 15 a semiglobal", async () => {
    // Measured across the corpus rather than asserted from a reading of it, and pinned because
    // it is the count 15.5 will have to satisfy.
    let withGlobal = 0;
    let withSemiglobal = 0;
    for (const { entry } of everyLevel()) {
      const { program } = await programFor(entry.id);
      if (program.globalCode !== null) withGlobal += 1;
      if (program.semiglobalCode !== null) withSemiglobal += 1;
    }
    expect([withGlobal, withSemiglobal]).toEqual([7, 15]);
  });
});

describe("a blob's variable array is long enough for the whole configuration", () => {
  it("is the special variables, the declared ones, and one slot per 32 flags", async () => {
    // `DefKnoten::getDatenLaenge`, and the identity is checkable rather than a number copied
    // out of a run: `speicherGlobaleVordefinierte` reserves the special variables before
    // anything is parsed, every `var` takes a whole int, and `allocateBool` takes a new int
    // every 32 flags.
    const { program } = await programFor("Baggis");
    const expected =
      SPECIAL_VARIABLE_COUNT +
      program.allocation.declaredCount +
      Math.ceil(program.allocation.boolCount / 32);
    expect(program.allocation.slotCount).toBe(expected);
  });

  it("finds the level's declared variables by name, at their own slots", async () => {
    // `allocateSlots` discarded the index of each declaration, so a name could not be resolved
    // at run time at all: a user variable reaches the evaluator as `{ kind: "variable", name }`
    // and `EvalContext.variable(name)` is the only thing that turns it into an array index.
    const { program } = await programFor("Baggis");
    // `var blitz,blitzt; var sunglas;` — three, and no more.
    expect([...program.allocation.declaredSlots.keys()].sort()).toEqual([
      "blitz",
      "blitzt",
      "sunglas",
    ]);
    // **After the special variables, contiguous, in declaration order — and not at a pinned
    // number any more.** They used to be asserted at 23, 24 and 25, which was measured and
    // which was *wrong*: it depended on the 9 `int`s of busy flags that `globals.ld`'s own
    // procedures took, numbered once from the parsed blocks. 15.5 numbers the linked copies as
    // well, so baggis's three now sit at 14, 15 and 16 — still after the special variables,
    // still contiguous, still in declaration order, and that is everything a caller's slot
    // number can be relied on to be.
    //
    // `globals.ld` declares no variables of its own (measured), so there is nothing above them
    // to displace; the earlier 23 was a side effect of flag placement, not of any declaration.
    const slots: [string, number][] = [...program.allocation.declaredSlots.entries()];
    expect(slots.map(([name]) => name)).toEqual(["blitz", "blitzt", "sunglas"]);
    expect(slots.map(([, slot]) => slot)).toEqual(
      slots.map(([, slot]) => slot).slice().sort((a, b) => a - b),
    );
    expect(slots[0]?.[1]).toBe(SPECIAL_VARIABLE_COUNT);
    expect(slots[1]?.[1]).toBe(SPECIAL_VARIABLE_COUNT + 1);
    expect(slots[2]?.[1]).toBe(SPECIAL_VARIABLE_COUNT + 2);
    expect(Math.min(...slots.map((entry) => entry[1]))).toBeGreaterThanOrEqual(
      SPECIAL_VARIABLE_COUNT,
    );
  });

  it("and the same for every level in the corpus", async () => {
    const wrong: string[] = [];
    for (const { entry } of everyLevel()) {
      const { program } = await programFor(entry.id);
      const expected =
        SPECIAL_VARIABLE_COUNT +
        program.allocation.declaredCount +
        Math.ceil(program.allocation.boolCount / 32);
      if (program.allocation.slotCount !== expected) {
        wrong.push(`${entry.id}: ${program.allocation.slotCount} != ${expected}`);
      }
      // No two declarations may share a slot: upstream throws on a duplicate name, so a name
      // can only ever have one, and two names sharing would mean the numbering had wrapped.
      const values = [...program.allocation.declaredSlots.values()];
      if (new Set(values).size !== values.length) wrong.push(`${entry.id}: duplicate slots`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("Cual's one non-recursive rule is kept", () => {
  it("a procedure cannot call itself, because it does not exist while its body is read", () => {
    // `proc_def_wort … '=' code_1 ';'` runs `speicherDefinition` after `code_1` is fully
    // reduced, so `tor_1` is not defined while `tor_1`'s own body is being linked. Collecting
    // every definition first would resolve the self-call and produce an infinitely recursive
    // tree — the failure `link.ts`'s comment warns about, and the reason each body here is
    // linked against the scope as it stood *before* it joined.
    const file = parseLd(
      `Torus={
  pics=bolzer
  <<
  var counter;
  tor_1 = { counter=counter+1; tor_1; };
  bolzer = {tor_1;};
  >>
}`,
      "torus.ld",
    );
    const program = buildLevelProgram(file, GLOBALS, syntheticKind("bolzer"));

    // The self-call survives as a `call` node, which is what upstream's `undefiniert_code`
    // becomes — and what `execute.ts` throws on, naming the procedure.
    expect(callsIn(program.drawCode[0] ?? [])).toEqual(["tor_1"]);
    // **Two, not one.** The self-call is refused once while `tor_1`'s own body is linked, and
    // again when that body is spliced into `bolzer`, because `tor_1` is on the expansion stack
    // then too. Registering definitions after rewriting their bodies stops the first; only the
    // stack stops the second, and without it this input blew the stack.
    expect(program.unresolved).toEqual([
      { owner: "tor_1", name: "tor_1" },
      { owner: "bolzer", name: "tor_1" },
    ]);
  });

  it("while a call to an earlier procedure does resolve", () => {
    // The other half of the same rule, and the reason source order is the order: `first` is
    // defined before `bolzer`, so the call to it is spliced in rather than left dangling —
    // and `first` is not on the expansion stack, so the splice is allowed.
    const file = parseLd(
      `Ordered={
  pics=bolzer
  <<
  first = {1*;};
  bolzer = {first;};
  >>
}`,
      "ordered.ld",
    );
    const program = buildLevelProgram(file, GLOBALS, syntheticKind("bolzer"));
    expect(program.unresolved).toEqual([]);
    // `first = {1*;}` spliced in: the draw, the `1` that chose its picture, and the wrapper
    // `parseCode` puts around a body's statements.
    expect(nodeKinds(program.drawCode[0] ?? [])).toEqual(["block", "draw", "number", "sequence"]);
  });
});

describe("which default a kind falls back to", () => {
  /**
   * `defaultCodeFor` directly, on picture lists naming **real keys from the committed icon
   * table**, so the counts are the ones the game will use rather than numbers written out
   * beside the assertion.
   *
   * Not through `LevelLoader`, because the art manifest is keyed by *filename*: a synthetic
   * level cannot borrow another level's picture names, so loading one fails before the default
   * is ever chosen.
   *
   * **The keys and their measured counts, so a stale table fails loudly here:**
   * `ipGrau.xpm` 1, `aDragon.xpm` 8, `jsGruenGras.xpm` 6, `dnBlack.xpm` 16.
   */
  const ONE = "ipGrau.xpm";
  const EIGHT = "aDragon.xpm";
  const SIX = "jsGruenGras.xpm";
  const SIXTEEN = "dnBlack.xpm";

  it("reads a single-icon picture as default1", () => {
    expect(defaultCodeFor([ONE], "colour")).toBe("default1");
  });

  it("reads a multi-icon picture as default2, because the count is the picture's", () => {
    expect(defaultCodeFor([EIGHT], "colour")).toBe("default2");
    expect(defaultCodeFor([SIX], "colour")).toBe("default2");
    expect(defaultCodeFor([SIXTEEN], "colour")).toBe("default2");
  });

  it("and several pictures as several files, which is default3", () => {
    expect(defaultCodeFor([ONE, SIXTEEN], "colour")).toBe("default3");
    // The file count is tested first upstream, so a multi-icon first file does not rescue it.
    expect(defaultCodeFor([EIGHT, SIXTEEN], "colour")).toBe("default3");
    // Three files is still `default3`, not something else: there is no fourth default.
    expect(defaultCodeFor([ONE, EIGHT, SIXTEEN], "colour")).toBe("default3");
  });

  it("with grass getting default2g, the only difference between the two", () => {
    // `src/sorte.cpp:117-121`: the same shape as default2 except for the grass, whose code is
    // `{pos=version;*}` rather than `{schema16}``.
    expect(defaultCodeFor([SIX], "grass")).toBe("default2g");
    // And grass with a single icon is `default1` like everything else, so the special case is
    // only on the multi-icon branch.
    expect(defaultCodeFor([ONE], "grass")).toBe("default1");
    expect(defaultCodeFor([ONE, SIXTEEN], "grass")).toBe("default3");
  });

  it("and no picture list at all means no default, which is upstream's own condition", () => {
    // `sorte.cpp:104`'s condition starts `mBilddateien.size() > 0`, so a kind with no `pics`
    // gets nothing rather than a default that would try to draw from a file that is not there.
    // 49 of the corpus's 556 kinds are in this state.
    expect(defaultCodeFor([], "colour")).toBeNull();
    expect(defaultCodeFor([], "grass")).toBeNull();
  });

  it("and a picture the table does not carry is refused rather than guessed", () => {
    // The one failure this rule has to have. Upstream computed the count from an image this
    // project does not ship, so a key with no stated figure is a stale table — and `default1`
    // is both the available guess and the wrong picture, since `default1 = *` draws icon 0 of
    // whatever the level wanted to choose between.
    expect(() => defaultCodeFor(["notInTheTable.xpm"], "colour")).toThrow(
      /notInTheTable\.xpm.*no stated icon count/s,
    );
    // The file count is checked first upstream, so a multi-file list never needs the figure and
    // is not refused for want of it.
    expect(defaultCodeFor(["notInTheTable.xpm", SIXTEEN], "colour")).toBe("default3");
  });
});

describe("the corpus, measured", () => {
  it("502 of 556 kinds define their own procedure, and 5 fall back", async () => {
    // Pinned because it is the figure that decided how much the defaults matter, and I got it
    // backwards first: a probe counted a kind as "using a default" whenever its `defaultCode`
    // was non-null, which is true of nearly every kind whether or not its own procedure won,
    // and reported 494 fallbacks against 13 own-code kinds. Measured properly it is the other
    // way round. The count and the split are both here so the error cannot come back quietly.
    let own = 0;
    let fallback = 0;
    let none = 0;
    for (const { entry } of everyLevel()) {
      const { program, kinds } = await programFor(entry.id);
      for (const [index, kind] of kinds.entries()) {
        if (program.drawCode[index] === null) none += 1;
        else if (program.procedures.has(kind.name)) own += 1;
        else fallback += 1;
      }
    }
    expect([own, fallback, none]).toEqual([502, 5, 49]);
    expect(own + fallback + none).toBe(556);
  });

  it("and every call in all 79 levels resolves", async () => {
    let unresolved = 0;
    for (const { entry } of everyLevel()) {
      const { program } = await programFor(entry.id);
      unresolved += program.unresolved.length;
    }
    expect(unresolved).toBe(0);
  });

  it("the largest variable array in the corpus is 807 slots", async () => {
    // What 15.3 sizes every blob's array from, so the ceiling is worth knowing: `globals.ld`
    // contributes most of it, since its procedures are in every level's namespace.
    let largest = 0;
    let largestLevel = "";
    for (const { entry } of everyLevel()) {
      const { program } = await programFor(entry.id);
      if (program.allocation.slotCount > largest) {
        largest = program.allocation.slotCount;
        largestLevel = entry.id;
      }
    }
    // **764, and this figure moved in 15.5 — it used to be 112, which was wrong.**
    //
    // `Blop::Blop` sizes every blob's array with `ld->mLevelKnoten->getDatenLaenge()`
    // (`blop.cpp:59`), read *after* the level has been loaded. Loading a level copies each
    // kind's draw code with `neueBusyNummern`, and each copy's fresh busy flags come from
    // `knoten->neueBoolVariable()` (`code.cpp:192`), which walks up to the parent — the level
    // knoten itself (`knoten.cpp:545`). So the level knoten **grows by every kind's copy**, and
    // the figure is read afterwards.
    //
    // The port sized the array from the *parsed* blocks instead, which is 112 for `BoniMali2`: the
    // 44 kinds' copies' busy flags were never counted. 15.5 found it, because allocating
    // over the linked trees is the first thing a run needs — a comma sequence in any spliced
    // procedure had no busy slot at all, so **no level's draw code could run**. Measured now:
    // 68 declared variables and 23184 busy flags, which is 725 ints of flags plus the
    // variables — measured on this file, and the reason the corpus's largest blob carries an
    // 807-entry array rather than 112.
    expect([largest, largestLevel]).toEqual([807, "BoniMali2"]);
  });
});

describe("a loaded level carries its program", () => {
  /** Straight through the loader — no hand-joining, which is what 15.1's tests did. */
  const loaded = async (id: string) => {
    const entry = LEVEL_INDEX.levels.find((candidate) => candidate.id === id);
    if (entry === undefined) throw new Error(`${id} is not in the level index`);
    const difficulty = [...entry.difficulties.values()][0];
    if (difficulty === undefined) throw new Error(`${id} has no difficulties`);
    return loader().load(entry.filename, entry.id, difficulty.track, difficulty.difficulty);
  };

  it("and its kinds carry the code they run", async () => {
    const { level } = await loaded("Baggis");
    // All seven, which is the figure 15.1 measured — so attaching the program changed nothing
    // about which code a kind runs, which is the point of putting it on the kind rather than
    // recomputing it.
    const withCode = level.kinds.filter((kind) => kind.drawCode !== null);
    expect(withCode.map((kind) => kind.name)).toEqual([
      "sbKaese",
      "sbBrezel",
      "sbBurger",
      "sbBroetchen",
      "sbSunglas",
      "sbOfen",
      "sbBlitzer",
    ]);
  });

  it("with `Kind.drawCode` being the very array the program holds, not a copy", async () => {
    // The two could drift if either were built separately, so this asserts identity. A `toEqual`
    // would pass on a copy and miss a level whose kinds had been re-linked against something
    // else, which is exactly the failure that would be hardest to see.
    const { level } = await loaded("Baggis");
    level.kinds.forEach((kind, index) => {
      expect(kind.drawCode, `${kind.name} is not the program's array`).toBe(
        level.program.drawCode[index] ?? null,
      );
    });
  });

  it("including globals.ld's code, which the loader used to throw away entirely", async () => {
    // `parseLd(source).definitions` is what the loader took, and it discarded `file.code` — the
    // `<< >>` blocks outside any definition. For a level that is nearly nothing; for
    // `globals.ld` it is **everything**, because `schema16` and `default1` through `default3`
    // all live there. So before 15.2 a loaded level had no access to any of it, and this
    // assertion is the one that would have failed then.
    const { level } = await loaded("Baggis");
    expect(level.program.procedures.has("schema16")).toBe(true);
    expect(level.program.procedures.has("default1")).toBe(true);
    expect(level.program.procedures.has("default3")).toBe(true);
    // And the level's own, which are the ones only its file has.
    expect(level.program.procedures.has("geblitzt")).toBe(true);
  });

  it("and every call still resolves, for all 79 levels", async () => {
    // The figure 15.1 measured from hand-joined files, re-measured through the loader. If the
    // loader's files were joined differently — the discarded `file.code` being the obvious
    // candidate — this is where it would show.
    const broken: string[] = [];
    for (const { entry, difficulty } of everyLevel()) {
      const result = await loader().load(
        entry.filename,
        entry.id,
        difficulty.track,
        difficulty.difficulty,
      );
      for (const miss of result.level.program.unresolved) {
        broken.push(`${entry.id}: ${miss.owner} calls ${miss.name}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("and the same 502 / 5 / 49 split between own code, a default and none", async () => {
    let own = 0;
    let fallback = 0;
    let none = 0;
    for (const { entry, difficulty } of everyLevel()) {
      const { level } = await loader().load(
        entry.filename,
        entry.id,
        difficulty.track,
        difficulty.difficulty,
      );
      for (const [index, kind] of level.kinds.entries()) {
        if (level.program.drawCode[index] === null) none += 1;
        else if (level.program.procedures.has(kind.name)) own += 1;
        else fallback += 1;
      }
    }
    expect([own, fallback, none]).toEqual([502, 5, 49]);
  });

  it("and a hand-written fixture carries the empty program, honestly", async () => {
    // `fixtures.ts` transcribes a level's data and never had its Cual, so its kinds have none
    // and its program is `EMPTY_PROGRAM`. Asserted rather than assumed, because a fixture that
    // quietly grew a program would mean the game-core tests were exercising something no real
    // level does.
    const { nasenkugeln } = await import("./fixtures.ts");
    const level = nasenkugeln();
    expect(level.program).toBe(EMPTY_PROGRAM);
    expect(level.kinds.every((kind) => kind.drawCode === null)).toBe(true);
    // Its allocation is the smallest `getDatenLaenge` can be: the special variables and
    // nothing else, because there are no user variables in a fixture.
    expect(level.program.allocation.slotCount).toBe(SPECIAL_VARIABLE_COUNT);
    expect(level.program.allocation.declaredCount).toBe(0);
  });
});
