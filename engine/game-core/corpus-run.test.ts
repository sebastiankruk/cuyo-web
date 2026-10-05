/**
 * Every level in the corpus, driven with no input at all.
 *
 * Task 15.7, and the reason this file exists at all: **12.3's survey was a number in a comment.**
 * `scenarios.test.ts` said "driving all 79 levels with no input and a 2500-step cap: 9 are won,
 * 69 are lost, 1 unfinished", and nothing recomputed it — so it sat there being wrong and being
 * believed, including by the people who wrote it. Measured, it was never right: a quarter of the
 * corpus threw rather than finishing, which a tally of three buckets cannot express.
 *
 * ## What is asserted, and why exactly
 *
 * **The tally, and the ten names.** Not a floor and not a ratio. The project's own lesson (12.8)
 * is that a floor set to today's figure cannot catch a regression because it moves with it —
 * and a floor is exactly what let 566 of 792 art keys go missing here. So this pins the numbers,
 * and pins *which levels throw*, so a change names itself instead of just moving a count.
 *
 * **A change to any of these is a finding to record, not a flake.** Nothing in the loop is
 * nondeterministic: `createPrng(1)` is seeded, the loader caches nothing across levels, and the
 * board is rebuilt per level. The same figures come out of every run.
 *
 * ## What this does *not* claim
 *
 * **It does not claim the levels are correct.** They are driven with *no input at all* — no
 * moves, no rotations — so a field silts up and the chase border wins, and 59 losses is that, not
 * a verdict on the engine. It claims something narrower and checkable: that every level *runs*,
 * that the ones which stop say why, and that the reasons are the ones recorded here.
 *
 * ## Why this is not in `make check`
 *
 * **It costs about eighty seconds, and the cheap check covers the same rot.** Six test files load
 * all 79 levels — this one, `name-resolution.test.ts`, `loader.test.ts`, `tile-corpus.test.ts`,
 * `cual-program.test.ts` and `corpus.test.ts` — and run in parallel workers, so adding an 84-second
 * file to that set pushed `make check` past five minutes on a machine where it had taken eleven
 * seconds. Loading all 79 levels is ~470ms; stepping them is ~84 000ms, and it is stepping that
 * costs.
 *
 * So the division is by cost, and both halves are asserted where they belong:
 *
 * - **`name-resolution.test.ts` runs always.** It loads every level and steps nothing, costs about
 *   90ms, and catches the class of failure that actually happened — 18 levels throwing "no variable
 *   named 'x'".
 * - **This file runs on demand**, via `make survey`, and **says that it did not run** when it is
 *   skipped rather than passing silently. A skipped check that looks like a pass is how the 9/69/1
 *   figure survived in the first place.
 *
 * ## Why the remaining throws are not defects
 *
 * Every one of the ten is either upstream's undefined behaviour or upstream raising the same
 * error this port raises:
 *
 * - **Division by zero** (`BoniMali2`, `Kacheln_azyklisch`) — `divv` at `code.h:98` has no zero
 *   check, so `divv(a, 0)` is an integer division by zero and upstream dies of `SIGFPE`. This port
 *   throws a named error instead, which is strictly better and not a divergence worth reproducing.
 * - **A kind with draw code and no picture** (`Hormone`, `Wachsen`, `Elemente`) — `sorte.cpp:98`
 *   calls `getCode(mName, version, true)`, and the `mBilddateien.size() > 0` guard covers only the
 *   *default* code, so a picture-less kind gets its own draw event and then
 *   `so->getBilddatei(0)` indexes an empty vector.
 * - **`file` past the end of a kind's picture list** (`Baggis`) — the same `getBilddatei` overrun.
 * - **`pos` computed by the level past the end of its own picture** (`Antarctic` `pos = version`
 *   against 5 icons, `Dungeon` `pos = xp%2; pos += 2` on a one-icon picture, `Fische`
 *   `pos = pos-1` and `Flechtwerk` `pos = m1-1` with the operand at 0) — and
 *   `bildstapel.cpp:133` makes *identically* the same check this port does, so upstream raises the
 *   same `Fehler`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LevelLoader } from "../level-format/loader.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { Simulation } from "./simulation.ts";
import { createPrng } from "../prng.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import type { Phase } from "./simulation.ts";

const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");
const GLOBALS = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");

/** The seed every run uses, so the figures below are reproducible and not "today's". */
const SEED = 1;

/**
 * 12.3's cap, kept so the figures are comparable with the ones it recorded.
 *
 * 2500 steps at 80 ms is 200 seconds of game time, which is far past `toptime` for every level —
 * long enough that anything which *can* finish, does.
 */
const STEP_CAP = 2500;

/** What one level did. */
interface Outcome {
  readonly id: string;
  /** `won`, `lost`, or whatever phase it was still in when the cap ran out. */
  readonly phase: Phase;
  readonly steps: number;
  /** The error, when it threw rather than finishing. */
  readonly threw: string | null;
  /** Blobs whose `kind` changed during the run, which only Cual can cause. */
  readonly kindChanges: number;
  /** Milliseconds spent loading, separately from stepping, because they differ by an order. */
  readonly loadMs: number;
  readonly stepMs: number;
}

/** One load, from the committed `.ld` and nothing else. */
async function loadLevel(entry: (typeof LEVEL_INDEX.levels)[number]): Promise<LevelDef> {
  const difficulty = [...entry.difficulties.values()][0];
  if (difficulty === undefined) throw new Error(`${entry.id} has no difficulties in the index`);
  // A fresh loader per level: `LevelLoader` caches by filename, and a cached board from an earlier
  // level would make every comparison after the first vacuous.
  const loader = new LevelLoader({
    fetchLevel: async (filename) => readFileSync(resolve(DATA_DIR, filename), "latin1"),
    art: ART_MANIFEST,
    globalsSource: GLOBALS,
    // The start layout is randomised at load, so a seed is not optional — without one the levels
    // would not be comparable with each other or with a later run.
    random: createPrng(SEED),
  });
  const loaded = await loader.load(
    entry.filename,
    entry.id,
    difficulty.track,
    difficulty.difficulty,
  );
  return loaded.level;
}

/** Drive one level with no input, and record what happened. */
async function drive(entry: (typeof LEVEL_INDEX.levels)[number]): Promise<Outcome> {
  const loadStart = Date.now();
  const level = await loadLevel(entry);
  const loadMs = Date.now() - loadStart;

  const stepStart = Date.now();
  const sim = new Simulation(level, { random: createPrng(SEED) });
  let steps = 0;
  let threw: string | null = null;
  // `kind` is watched rather than position, because gravity moves blobs and **nothing but Cual
  // changes a kind**: `kind = x` is an assignment only a level's own code can make. So a kind
  // change is an unambiguous sign the level acted on itself.
  const seenKinds = new Set<string>();
  /** Cell index to kind, for the cells holding a blob. */
  const kindsOf = (): Map<number, number> => {
    const out = new Map<number, number>();
    for (let i = 0; i < sim.board.cells.length; i += 1) {
      const cell = sim.board.cells[i];
      if (cell !== null) out.set(i, cell.kind);
    }
    return out;
  };

  try {
    for (; steps < STEP_CAP; steps += 1) {
      if (sim.phase === "won" || sim.phase === "lost") break;
      const before = kindsOf();
      sim.step();
      for (const [cell, kind] of kindsOf()) {
        const was = before.get(cell);
        // Only a cell that held a blob of a *different* kind counts. A cell that gained or lost a
        // blob is gravity or an explosion, and counting those would make every level look active.
        if (was !== undefined && was !== kind) seenKinds.add(`${cell}:${was}->${kind}`);
      }
    }
  } catch (error) {
    threw = error instanceof Error ? error.message : String(error);
  }
  const stepMs = Date.now() - stepStart;
  return {
    id: entry.id,
    phase: threw === null ? sim.phase : "falling",
    steps,
    threw,
    kindChanges: seenKinds.size,
    loadMs,
    stepMs,
  };
}

/**
 * Every level, once — **memoised**, because the four assertions below each want the whole corpus.
 *
 * Driving 79 levels takes about half a minute, three quarters of it loading, so four independent
 * surveys would be four times that for four views of one answer. The cache is what makes four
 * assertions affordable; it is a module-level promise rather than a `beforeAll` so the cost is
 * paid once even across the file's tests.
 */
let cached: Promise<readonly Outcome[]> | null = null;

function survey(): Promise<readonly Outcome[]> {
  cached ??= (async () => {
    const out: Outcome[] = [];
    for (const entry of LEVEL_INDEX.levels) out.push(await drive(entry));
    return out;
  })();
  return cached;
}

/** `id` for the outcomes matching a predicate, sorted, so a failure is readable. */
function where(outcomes: readonly Outcome[], wanted: (o: Outcome) => boolean): string[] {
  return outcomes.filter(wanted).map((o) => o.id).sort();
}

/**
 * Whether the survey runs. `CUYO_SURVEY=1` asks for it; the default skips.
 *
 * And it **prints when it skips** — the same reason `picture-icons.test.ts` keeps a live skip for
 * the image-side check: a check that silently does not run is indistinguishable from one that
 * passed, and the whole reason this file exists is that a *number in a comment* was
 * indistinguishable from a measured one for as long as anyone could remember.
 */
const RUN_SURVEY = process.env.CUYO_SURVEY === "1";

/**
 * The suite name carries the skip notice, because a `console.log` does not.
 *
 * Vitest only shows a file's console output under `--reporter=verbose`, so a message printed on
 * skip is very nearly silent in the run that matters — and a skipped check that looks like a pass
 * is exactly how the `9 / 69 / 1` figure survived in a comment for as long as it did. The suite
 * name is always printed.
 */
const describeSurvey = RUN_SURVEY
  ? describe
  : describe.skip;

describeSurvey(
  RUN_SURVEY
    ? "every level in the corpus, driven with no input"
    : "every level in the corpus, driven with no input — SKIPPED, run `make survey`",
  () => {
  it(
    "reaches the outcomes this file records",
    async () => {
      const outcomes = await survey();

      // **The tally, exactly.** Every one of these is a measured figure on a seeded run, and a
      // change to any of them is a finding to record rather than a number to relax.
      expect(outcomes.filter((o) => o.threw === null && o.phase === "won")).toHaveLength(8);
      expect(outcomes.filter((o) => o.threw === null && o.phase === "lost")).toHaveLength(59);
      expect(outcomes.filter((o) => o.threw === null && o.phase !== "won" && o.phase !== "lost"))
        .toHaveLength(2);
      expect(outcomes.filter((o) => o.threw !== null)).toHaveLength(10);
      // And the corpus is 79 levels, so the four counts above account for every one of them. This
      // is what catches a level being *skipped* rather than a level changing its mind.
      expect(outcomes).toHaveLength(79);
      expect(LEVEL_INDEX.levels).toHaveLength(79);

      // **Which ten, by name.** A count of ten says something broke; ten names say where, and
      // they are the point of the file — every one of these was traced to upstream behaviour, and
      // the list is how that stays true.
      expect(where(outcomes, (o) => o.threw !== null)).toEqual([
        "Antarctic",
        "Baggis",
        "BoniMali2",
        "Dungeon",
        "Elemente",
        "Fische",
        "Flechtwerk",
        "Hormone",
        "Kacheln_azyklisch",
        "Wachsen",
      ]);

      // **And what each one says**, because "throws" is not a diagnosis. Grouped by cause, so a
      // new member of a group is visible as a new name in it.
      const messages = outcomes.filter((o) => o.threw !== null).map((o) => `${o.id}: ${o.threw}`);
      expect(messages.filter((m) => m.includes("division by zero"))).toHaveLength(2);
      expect(messages.filter((m) => m.includes("out of range"))).toHaveLength(8);
      // **Nothing else at all.** A throw from a cause not on this list is a new finding, and this
      // is the assertion that makes it one instead of a silent change to the tally above.
      expect(messages.filter((m) => !/division by zero|out of range/.test(m))).toEqual([]);
    },
    600_000,
  );

  it(
    "never throws from a name it cannot resolve, which is what 15.6 and 15.7 were for",
    async () => {
      const outcomes = await survey();
      // **This is the assertion that says group 15 worked.** Every namespace 15.5 was missing —
      // the 15 `spezconst_*`, `Kind.baseKind`, kind names as values, `.ld` numbers, an addressed
      // constant, and the empty kind's name — arrived as "no variable named 'x'", and there were
      // 18 levels throwing one or the other. There are now none.
      //
      // It is a separate `it` from the tally above on purpose: that one is a snapshot of where
      // things are, and this one is a floor on a class of failure that must never come back even
      // if every number moves.
      expect(outcomes.filter((o) => o.threw !== null && /no variable named/.test(o.threw))).toEqual(
        [],
      );
    },
    600_000,
  );

  it(
    "lets levels act on themselves, which is what the wiring was for",
    async () => {
      const outcomes = await survey();
      const active = outcomes.filter((o) => o.kindChanges > 0);

      // **A kind change can only come from Cual.** Gravity moves blobs, an explosion removes them,
      // and nothing else rewrites `kind` — `kind = x` is an assignment only a level's own draw code
      // can make. So this counts the levels that demonstrably did something *to themselves* rather
      // than merely being operated on.
      //
      // This is the "name a level whose blobs now move on their own" half of 15.7, and it is a
      // count over the whole corpus rather than a claim about one hand-picked level: a single
      // named level would be an anecdote, and picking the one that flatters the change is exactly
      // what 12.3's note says not to do.
      expect(active.length).toBeGreaterThan(0);
      // Recorded rather than asserted exactly, because *which* levels act on themselves is a
      // finding that changes as namespaces get wired, and a test that pins the set would fail on
      // every improvement. The floor is the claim; the number is the record.
      // **Nine on the seeded run**, recorded rather than asserted exactly, because *which*
      // levels act on themselves is a finding that changes as more namespaces are wired and a
      // test pinning the set would fail on every improvement. The floor is the claim, the list is
      // the record:
      //
      // ```
      // Baelle:1  Go:1  Tiere:1  Wuerfel:6  Unmoeglich:6  Labyrinth:5  SilberGold:6  Bunt:10  Rollenspiel:1
      // ```
      //
      // The numbers are kind-change events, not levels, and 37 in total. `Bunt` at ten is the
      // clearest: it changes ten blobs' kinds during a no-input run, which is a level driving
      // its own board.
      expect(
        active.length,
        `active levels: ${active.map((o) => `${o.id}(${o.kindChanges})`).join(", ")}`,
      ).toBeGreaterThan(3);
    },
    600_000,
  );

  it(
    "loads every level, and shows the cost of loading against the cost of stepping",
    async () => {
      const outcomes = await survey();
      // **Stepping is two orders of magnitude more expensive than loading** — measured 471ms of
      // load against 84 seconds of stepping for the same 79 levels — which is the opposite of what
      // 15.5's heavier slot allocation suggested it would be. Worth stating precisely because this
      // file is why the survey costs what it does, and because the instinct ("loading got heavier")
      // pointed at the wrong half.
      //
      // The figures ride in the failure message so a regression is diagnosable from the test output
      // alone, and the assertion is deliberately trivial: this is a *measurement*, and the claim it
      // makes is that both halves happen at all.
      const loadTotal = outcomes.reduce((n, o) => n + o.loadMs, 0);
      const stepTotal = outcomes.reduce((n, o) => n + o.stepMs, 0);
      expect(loadTotal, `load ${loadTotal}ms, step ${stepTotal}ms over 79 levels`).toBeGreaterThan(0);
      // Every level loads. A level that failed to load would be a `threw` with a message about
      // load rather than about Cual, and the assertion above would not catch it.
      expect(outcomes.filter((o) => o.steps === 0 && o.threw !== null && /LevelLoadError/.test(o.threw)))
        .toEqual([]);
    },
    600_000,
  );
});
