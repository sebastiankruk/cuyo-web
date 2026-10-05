/**
 * Every name every level's Cual code mentions, resolved — statically.
 *
 * ## Why this file exists, separately from `corpus-run.test.ts`
 *
 * 15.7's survey found that **18 of the 79 levels threw "no variable named 'x'"** the first time
 * a level's code actually ran. Every one of those was a *missing namespace*, and they arrived over
 * the course of group 15 as: the fifteen `spezconst_*`, `Kind.baseKind`, kind names used as values,
 * the level's own `.ld` numbers, an addressed constant, and the empty kind's name.
 *
 * The survey catches that class, but the survey costs **about eighty seconds** — 79 levels, 55 000
 * simulation steps, and the cap turned out to be load-bearing (at 600 steps the active-level count
 * falls from 9 to 5 and a survey assertion fails), so it cannot be made cheap by asking for less.
 * This file costs a *load* per level and no steps at all, and it catches the same class.
 *
 * So the division is deliberate: **this is the rot-catcher, the survey is the measurement.** The
 * rot is what happened; the measurement is what the numbers are. Neither replaces the other, and
 * the cheap one is the one worth running every time.
 *
 * ## What "resolves" means
 *
 * Every name is put through {@link nameResolves}, which is the *same function* the running game
 * uses — `BlobAnimation`'s five namespaces, not a second copy. A parallel implementation would be a
 * second answer to the same question, and that is precisely how `.ld` numbers went missing from
 * `valueOf` in the first place.
 *
 * A level's own `var` counts as resolving, so this is about the *game's* namespaces only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LevelLoader } from "../level-format/loader.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { nameResolves } from "./cual-blob.ts";
import type { BlobAnimationDeps } from "./cual-blob.ts";
import type { Stmt } from "../cual-runtime/code.ts";
import type { Expr } from "../cual-runtime/expr.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import { levelPictureSource } from "./cual-blob.ts";
import { BLOBART_AUSSERHALB, TimeSlices } from "../cual-runtime/store.ts";
import { GRIC, GRX, GRY } from "./constants.ts";
import { createPrng } from "../prng.ts";

const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");
const GLOBALS = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");

/** Enough deps for {@link nameResolves}, which reads the level and the program and nothing else. */
function depsFor(level: LevelDef): BlobAnimationDeps {
  return {
    level,
    program: level.program,
    pictureSource: levelPictureSource(level, level.program),
    // None of these are reached: `nameResolves` asks only whether a *name* resolves, and the
    // namespaces it consult are the program, the level and the built-in tables.
    here: () => ({ kind: "global" }),
    field: () => {
      throw new Error("nameResolves must not need a field");
    },
    random: () => {
      throw new Error("nameResolves must not need a random source");
    },
    effects: () => {
      throw new Error("nameResolves must not need effects");
    },
    slices: new TimeSlices(),
    // **A cell, not `absort_nirgends`.** `nameResolves` asks for a subject, and the obvious choice
    // of "no position" is wrong here: `loc_p` is *refused* at `nowhere` upstream
    // (`constants.ts`'s "not defined for the global, semiglobal or nowhere blob"), so a check using
    // it would report a **refusal** as an unresolved name — and `loc_p` does resolve, for every
    // blob that has a left or a right. A cell at (0,0) is the position for which every constant
    // upstream answers is answered.
    //
    // Only existence is read. The values are whatever a cell at (0,0) on a level with one player
    // would have, which is the point: this asks "can this name be answered at all", not "what does
    // it say here".
    constantSubject: () => ({
      position: { kind: "cell", x: 0, y: 0, right: false },
      world: {
        width: GRX,
        height: GRY,
        players: 1,
        time: 0,
        mirrored: false,
        rowHeight: GRIC,
        verticalScroll: 0,
        hexShift: () => false,
      },
      chainSize: 0,
      baseKind: BLOBART_AUSSERHALB,
      fall: null,
      fallIndex: 0,
      exploding: 0,
    }),
    stackAt: () => null,
  };
}

/**
 * Every name a `Stmt` or `Expr` mentions, in reads and in assignment targets alike.
 *
 * **One walker over both**, because they nest inside each other — an `assign` holds expressions and
 * a `switchCase` holds a condition — and two walkers would need to agree about which is which.
 *
 * It reads each node's `kind` and then *structurally* every field, so a new node or expression form
 * is walked without being listed here. The one thing structural walking cannot do is read a plain
 * string field, and that is exactly where the names live: a `variable` node's value is its `name`.
 * An earlier version recursed over child nodes only and therefore collected **zero** names from 507
 * drawing kinds — a test which asserted `> 500` names checked is the only reason that was caught
 * rather than shipped.
 */
function namesIn(node: Stmt | Expr, into: Set<string>): void {
  const any = node as unknown as Record<string, unknown>;
  if (any.kind === "variable" && typeof any.name === "string") into.add(any.name);
  // A `call` names a *procedure*, which `linkCalls` has already resolved — and a name that survived
  // as a call is either a builtin or an unresolved call, and `cual-program.test.ts` already
  // asserts there are none of the latter. So only the builtins are skipped, by name.
  if (any.kind === "call" && typeof any.name === "string" && !BUILTIN_CALLS.has(any.name)) {
    into.add(any.name);
  }
  for (const value of Object.values(any)) {
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) namesIn(item, into);
    } else if (isNode(value)) {
      namesIn(value, into);
    }
  }
}

/**
 * Cual's builtin *functions*, which are calls and not variables.
 *
 * `rnd(expr)` is the only one `cual.6` documents (line 628), and the corpus confirms it: 126 uses
 * of `rnd(`, against 24 `message(`, 16 `bonus(` and 4 `sound(` — which are *statements*, not calls,
 * and are reached as such. Everything else call-shaped in the corpus is a comment or a string.
 */
const BUILTIN_CALLS = new Set(["rnd"]);

/** A `Stmt` or an `Expr`, told apart from a scalar by having a `kind`. */
function isNode(value: unknown): value is Stmt | Expr {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}

/** Every level, loaded once. */
async function levels(): Promise<readonly LevelDef[]> {
  const out: LevelDef[] = [];
  for (const entry of LEVEL_INDEX.levels) {
    const difficulty = [...entry.difficulties.values()][0];
    if (difficulty === undefined) continue;
    const loader = new LevelLoader({
      fetchLevel: async (filename) => readFileSync(resolve(DATA_DIR, filename), "latin1"),
      art: ART_MANIFEST,
      globalsSource: GLOBALS,
      random: createPrng(1),
    });
    const loaded = await loader.load(
      entry.filename,
      entry.id,
      difficulty.track,
      difficulty.difficulty,
    );
    out.push(loaded.level);
  }
  return out;
}

describe("every name a level's Cual mentions", () => {
  it("resolves, for all 79 levels", async () => {
    const unresolved: string[] = [];
    let checked = 0;

    for (const level of await levels()) {
      const deps = depsFor(level);
      // **`program.drawCode`, not `kind.drawCode`.** The loader leaves every `Kind.drawCode` null
      // on purpose — the compiled code lives on the program, which is what `Simulation.drawCodeOf`
      // reads. An earlier version of this check walked the kinds and found *no names at all*,
      // which is how a vacuous test nearly shipped.
      for (let i = 0; i < level.kinds.length; i += 1) {
        const code = level.program.drawCode[i];
        if (code === null || code === undefined) continue;
        const names = new Set<string>();
        for (const statement of code) namesIn(statement, names);
        for (const name of names) {
          checked += 1;
          if (!nameResolves(deps, name)) {
            unresolved.push(`${level.id}/${level.kinds[i]?.name}: ${name}`);
          }
        }
      }
    }
    // **This is the assertion group 15 was for.** Before it, 18 levels threw "no variable named
    // 'x'" at the moment their code first ran; there are now none, and there is a cheap test
    // standing in front of the expensive one.
    expect([...new Set(unresolved)]).toEqual([]);
    // And the check is not vacuous: it looked at a real number of names.
    expect(checked, "names checked across the corpus").toBeGreaterThan(500);
  });

  it("does find a name that resolves to nothing, so the check can fail", async () => {
    // A test that cannot fail is not a test. `noSuchVariableAnywhere` is in none of the five
    // namespaces, so the check must reject it — and this says the *rejection* is the mechanism,
    // not that the corpus happens to be clean.
    const level = (await levels())[0];
    if (level === undefined) throw new Error("no levels loaded");
    const deps = depsFor(level);
    expect(nameResolves(deps, "noSuchVariableAnywhere")).toBe(false);
    // And a name that does resolve, so the two are distinguishable.
    expect(nameResolves(deps, "kind")).toBe(true);
  });
});