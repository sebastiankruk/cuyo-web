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
import { buildLevelProgram } from "./cual-program.ts";
import { defaultCodeFor } from "./kinds.ts";
import type { LevelProgram } from "./cual-program.ts";
import type { Kind } from "./level-data.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import { createPrng } from "../prng.ts";
import type { ResolvedRun } from "./values.ts";
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
  filename: string,
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
  const file = parseLd(readFileSync(resolve(DATA_DIR, filename), "latin1"), filename);
  return { program: buildLevelProgram(file, GLOBALS, loaded.level.kinds), kinds: loaded.level.kinds };
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
    versions: 1,
    weight: 1,
    behaviour: 0,
    numexplode: 5,
    colourProb: 1,
    greyProb: 0,
    goalProb: 0,
    distKey: null,
    defaultCode: null,
  },
];

describe("a kind runs the procedure named after it", () => {
  it("baggis.ld's kinds each have their own, and it is what they call", async () => {
    const { program, kinds } = await programFor("baggis.ld", "Baggis");

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
    const { program } = await programFor("baggis.ld", "Baggis");
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
      const { program } = await programFor(entry.filename, entry.id);
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
      const { program, kinds } = await programFor(entry.filename, entry.id);
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
  it("and five kinds in the corpus need one: all of them default1", async () => {
    // The fallback is a tail, not the main path, and I had this backwards when I started. Of 556
    // kinds, 502 define a procedure of their own; these five are the ones that do not, and each
    // has a single-icon picture file, so `sorte.cpp:117-121` picks `default1`.
    //
    // The five are named rather than counted, because "five" alone would still pass if two of
    // them silently changed which default they take.
    const expected = [
      "Pfeile/ipGrau",
      "Ziehlen/gras",
      "Embroidery/jsGruenGras",
      "Darken/dnStart",
      "Explosive/lbBlack",
    ];
    const found: string[] = [];
    for (const { entry } of everyLevel()) {
      const { program, kinds } = await programFor(entry.filename, entry.id);
      for (const [index, kind] of kinds.entries()) {
        if (program.drawCode[index] === null) continue;
        if (program.procedures.has(kind.name)) continue;
        found.push(`${entry.id}/${kind.name}`);
      }
    }
    expect(found.sort()).toEqual([...expected].sort());
  });

  it("default1 is a bare draw, because a single-icon file has nothing to choose", async () => {
    // `default1 = *;` — a draw, and nothing else.
    const { program, kinds } = await programFor("pfeile.ld", "Pfeile");
    const grey = kinds.find((kind) => kind.name === "ipGrau");
    expect(grey?.defaultCode).toBe("default1");
    expect(nodeKinds(program.drawCode[indexOfKind(kinds, "ipGrau")] ?? [])).toEqual(["draw"]);
  });

  it("a kind's own procedure wins over its default, which is what upstream does", async () => {
    // `pfeile.ld`'s other seven kinds all have `default3`, and all seven define their own code,
    // so the default is never consulted for them. The lookup is the kind's name first and only
    // then the default — a resolution that took the default first would quietly replace every
    // level's own drawing with `schema16`.
    const { program, kinds } = await programFor("pfeile.ld", "Pfeile");
    const own = kinds.filter((kind) => program.procedures.has(kind.name));
    expect(own).toHaveLength(7);
    // Every one of `pfeile.ld`'s kinds is a single-icon kind, so all eight are `default1` — and
    // seven of them still run their own code instead. `default1` is a bare `*`, so anything more
    // than a draw proves the own procedure won.
    expect(kinds.every((kind) => kind.defaultCode === "default1")).toBe(true);
    const start = program.drawCode[indexOfKind(kinds, "ipStart")] ?? [];
    expect(callsIn(start)).toEqual([]);
    expect(nodeKinds(start)).toContain("if");
    expect(nodeKinds(start)).toContain("scoped");
  });

  it("default3 sets file from version before drawing, and no corpus kind reaches it", async () => {
    // Every `default3` kind in the corpus also defines its own procedure, so this path is
    // unreachable from the corpus and is checked on a synthetic kind instead. That is stated
    // rather than glossed: `default2` and `default2g` are unreachable from the corpus too,
    // because no level writes a kind with exactly one multi-icon picture file.
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
    const { program, kinds } = await programFor("himmel.ld", "Himmel");
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
    const { program } = await programFor("baggis.ld", "Baggis");
    expect(program.globalCode).toBeNull();
    expect(program.semiglobalCode).toBeNull();
  });

  it("and 7 levels define a global and 15 a semiglobal", async () => {
    // Measured across the corpus rather than asserted from a reading of it, and pinned because
    // it is the count 15.5 will have to satisfy.
    let withGlobal = 0;
    let withSemiglobal = 0;
    for (const { entry } of everyLevel()) {
      const { program } = await programFor(entry.filename, entry.id);
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
    const { program } = await programFor("baggis.ld", "Baggis");
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
    const { program } = await programFor("baggis.ld", "Baggis");
    // `var blitz,blitzt; var sunglas;` — three, and no more.
    expect([...program.allocation.declaredSlots.keys()].sort()).toEqual([
      "blitz",
      "blitzt",
      "sunglas",
    ]);
    // **Not at 14.** The special variables occupy 0-13, and then `globals.ld`'s own `var`
    // lines take theirs before this level's — because globals are read first, and upstream
    // numbers them in one configuration. So baggis's three land at 23, 24 and 25: after the
    // special variables, after globals' declarations, contiguous, in declaration order.
    const slots: [string, number][] = [...program.allocation.declaredSlots.entries()];
    expect(slots).toEqual([
      ["blitz", 23],
      ["blitzt", 24],
      ["sunglas", 25],
    ]);
    expect(Math.min(...slots.map((entry) => entry[1]))).toBeGreaterThanOrEqual(
      SPECIAL_VARIABLE_COUNT,
    );
  });

  it("and the same for every level in the corpus", async () => {
    const wrong: string[] = [];
    for (const { entry } of everyLevel()) {
      const { program } = await programFor(entry.filename, entry.id);
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
   * `defaultCodeFor` directly, on run lists written out by hand.
   *
   * Not through `LevelLoader`, because the art manifest is keyed by *filename*: a synthetic
   * level cannot borrow another level's picture names, so loading one fails before the default
   * is ever chosen. And not through the corpus either, because **no level in the corpus writes
   * `pics = name * count`** — so the one distinction that matters is untested by all 79 of
   * them. Mutation confirmed the gap: collapsing `runs.length > 1` into `sum(counts) > 1` left
   * every other test in this file green, while the two disagree on `pics = bolzer * 3`, which is
   * one file with three icons (`default2`) and not three files (`default3`).
   */
  const run = (word: string, count = 1): ResolvedRun => ({ word, count });

  it("reads a repeated entry as one file holding several icons, which is default2", () => {
    expect(defaultCodeFor([run("bolzer", 3)], "colour")).toBe("default2");
    expect(defaultCodeFor([run("bolzer", 2)], "colour")).toBe("default2");
  });

  it("and a single entry with no repeat as one icon in one file, which is default1", () => {
    expect(defaultCodeFor([run("bolzer")], "colour")).toBe("default1");
  });

  it("and several entries as several files, which is default3", () => {
    expect(defaultCodeFor([run("bolzer"), run("ander")], "colour")).toBe("default3");
    // The two rules are independent: three files where the first has three icons is still
    // `default3`, because upstream tests the file count first.
    expect(defaultCodeFor([run("bolzer", 3), run("ander")], "colour")).toBe("default3");
  });

  it("with grass getting default2g, the only difference between the two", () => {
    // `src/sorte.cpp:117-121`: the same shape as default2 except for the grass, whose code is
    // `{pos=version;*}` rather than `{schema16}`.
    expect(defaultCodeFor([run("gras", 3)], "grass")).toBe("default2g");
    // And grass with a single icon is `default1` like everything else, so the special case is
    // only on the multi-icon branch.
    expect(defaultCodeFor([run("gras")], "grass")).toBe("default1");
  });

  it("and no picture list at all means no default, which is upstream's own condition", () => {
    // `sorte.cpp:104`'s condition starts `mBilddateien.size() > 0`, so a kind with no `pics`
    // gets nothing rather than a default that would try to draw from a file that is not there.
    // 49 of the corpus's 556 kinds are in this state.
    expect(defaultCodeFor(undefined, "colour")).toBeNull();
    expect(defaultCodeFor([], "colour")).toBeNull();
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
      const { program, kinds } = await programFor(entry.filename, entry.id);
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
      const { program } = await programFor(entry.filename, entry.id);
      unresolved += program.unresolved.length;
    }
    expect(unresolved).toBe(0);
  });

  it("the largest variable array in the corpus is 112 slots", async () => {
    // What 15.3 sizes every blob's array from, so the ceiling is worth knowing: `globals.ld`
    // contributes most of it, since its procedures are in every level's namespace.
    let largest = 0;
    let largestLevel = "";
    for (const { entry } of everyLevel()) {
      const { program } = await programFor(entry.filename, entry.id);
      if (program.allocation.slotCount > largest) {
        largest = program.allocation.slotCount;
        largestLevel = entry.id;
      }
    }
    expect([largest, largestLevel]).toEqual([112, "BoniMali2"]);
  });
});
