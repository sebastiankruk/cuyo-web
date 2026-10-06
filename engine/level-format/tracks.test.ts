// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Every track of every level, loaded and stepped — task 12.7.
 *
 * ## Why this is not the same as `loader.test.ts`
 *
 * That file walks the catalogue and checks what comes *out* of the loader: kinds, pictures,
 * neighbourhoods, art keys. It loads each level on **one** difficulty, because the shape of a
 * level does not vary by track. This file asks a different question, which is the one a player
 * actually asks: **does every level, on every track it is offered on, get as far as running?**
 *
 * The distinction matters because upstream's catalogue is not 79 levels on one track. It is
 * **187 (level, track) pairs** across `main`, `all`, `contrib`, `nofx` and `weird`, and a
 * version-conditioned definition can change a level's kinds, its neighbour mode or its pictures
 * on one track only. A single-track check cannot see that at all.
 *
 * ## What "running state" means here, precisely
 *
 * Load the level, build a `Simulation`, and step it a few dozen times with no input. No render, no
 * audio, no player. The claim is narrow and the wording is deliberate: **that the first steps do
 * not raise.** It is not a claim that the level is winnable, that its animation is right, or that
 * its artwork exists — the corpus survey in `game-core/corpus-run.test.ts` measures the first of
 * those over eighty-four seconds, and this file runs in a couple of seconds so it can be in
 * `make check`.
 *
 * ## The steps are few on purpose
 *
 * Thirty steps is a little over three seconds of game time at 80 ms a step. That is enough for the
 * border to start descending and for a level's own draw code to run on real blobs — which is the
 * point, since code that only runs is where load-time checks cannot reach — and few enough that
 * the file stays cheap. Levels whose draw code misbehaves *later* are the survey's business; see
 * the recorded throws below for which ones those are.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LevelLoader } from "./loader.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import type { Difficulty, Track } from "./index-data.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { Simulation } from "../game-core/simulation.ts";
import { createPrng } from "../prng.ts";

const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");
const GLOBALS = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");

/** Steps per level: a little over three seconds of game time. See the header for why. */
const STEPS = 30;

/** Every (level, track) pair the catalogue offers. */
interface Pair {
  readonly id: string;
  readonly filename: string;
  readonly track: Track;
  readonly difficulty: Difficulty;
}

function pairs(): readonly Pair[] {
  const out: Pair[] = [];
  for (const entry of LEVEL_INDEX.levels) {
    // **`difficulties` is a `Map` keyed by difficulty name** (`easy` / `normal` / `hard`), one
    // entry per difficulty, and each entry carries the **track it was compiled at**. So a "pair" is
    // really a (level, difficulty) pair whose track is a consequence — which is exactly why this
    // file cannot be folded into the single-track loader test: `weird` and `nofx` levels are only
    // reachable through their difficulty entry.
    for (const info of entry.difficulties.values()) {
      out.push({
        id: entry.id,
        filename: entry.filename,
        track: info.track,
        difficulty: info.difficulty,
      });
    }
  }
  return out;
}

/** What one (level, track) pair did. */
interface Outcome {
  readonly pair: Pair;
  readonly threw: string | null;
  readonly phase: string;
}

async function drive(pair: Pair): Promise<Outcome> {
  // A fresh loader per pair. `LevelLoader` caches by filename, and a cached level from another
  // track would make every comparison after the first vacuous — which is the whole question here.
  const loader = new LevelLoader({
    fetchLevel: async (filename) => readFileSync(resolve(DATA_DIR, filename), "latin1"),
    art: ART_MANIFEST,
    globalsSource: GLOBALS,
    random: createPrng(1),
  });
  const { level } = await loader.load(pair.filename, pair.id, pair.track, pair.difficulty);
  const sim = new Simulation(level, { random: createPrng(1) });
  try {
    for (let i = 0; i < STEPS && sim.phase !== "won" && sim.phase !== "lost"; i += 1) sim.step();
  } catch (error) {
    return {
      pair,
      threw: error instanceof Error ? error.message : String(error),
      phase: "threw",
    };
  }
  return { pair, threw: null, phase: sim.phase };
}

describe("every track of every level", () => {
  it(
    "loads and reaches a running state, on all 187 pairs",
    async () => {
      const all = pairs();
      const outcomes: Outcome[] = [];
      for (const pair of all) outcomes.push(await drive(pair));

      const throwing = outcomes.filter((o) => o.threw !== null);

      // **The catalogue is what it says it is.** 79 levels across 5 tracks, 187 pairs. Asserted
      // because a test that quietly covered fewer pairs than it claims is worse than no test: the
      // number is the only thing that would notice.
      expect(all).toHaveLength(187);
      expect(new Set(all.map((p) => p.track)).size).toBe(5);

      // **Every pair loads.** A load failure is reported as a throw, so it would otherwise be
      // indistinguishable from a step failure — and the two want different fixes.
      const loadFailures = throwing.filter((o) =>
        /LevelLoadError|not defined|required/.test(o.threw ?? ""),
      );
      expect(
        loadFailures.map((o) => `${o.pair.id}/${o.pair.track}`),
        "pairs that failed to load",
      ).toEqual([]);

      // **And the recorded set of pairs that raise while stepping: 20 of the 187**, across eight
      // levels. Pinned by name, by track and by difficulty, and grouped by cause so that a *new*
      // member of a group shows up as a new name inside it rather than as a moved count.
      //
      // Every one is upstream's own undefined behaviour, or upstream raising the same error this
      // port raises, and the reasoning is recorded in `tasks.md` under 15.7:
      //
      // - **division by zero, 6 pairs** — `divv` at `code.h:98` has no zero check, so `divv(a, 0)`
      //   is an integer division by zero and upstream dies of `SIGFPE`. This port throws a named
      //   error instead, which is strictly better and not a divergence worth reproducing.
      // - **out of range, 14 pairs** — a `pos` computed past the end of its own picture list. The
      //   check at `cual-runtime/draw.ts:218` is deliberately identical to `bildstapel.cpp:130`,
      //   so upstream raises the same `Fehler` for the same input.
      //
      // **The two levels this file does *not* list are not an oversight.** `Baggis` and `Dungeon`
      // raise in the survey but not within 30 steps, which is the difference between this file and
      // that one and the reason both exist: this one runs in ten seconds and is in `make check`,
      // that one runs in eighty-four and is not.
      const messages = throwing.map((o) => `${o.pair.id}/${o.pair.track}: ${o.threw}`);
      // **Sorted, because drive order is catalogue order** and a catalogue reshuffle would then
      // fail a test about error causes for no reason a reader could see.
      const pairs_ = (o: Outcome): string =>
        `${o.pair.id}/${o.pair.track}/${o.pair.difficulty}`;
      const sorted = (xs: readonly string[]): string[] => [...xs].sort();
      const byDivision = sorted(
        throwing.filter((o) => /division by zero/.test(o.threw ?? "")).map(pairs_),
      );
      const byRange = sorted(
        throwing.filter((o) => /out of range/.test(o.threw ?? "")).map(pairs_),
      );

      expect(byDivision, "pairs dividing by zero").toEqual([
        "BoniMali2/all/normal",
        "BoniMali2/main/easy",
        "BoniMali2/main/hard",
        "Kacheln_azyklisch/all/normal",
        "Kacheln_azyklisch/main/easy",
        "Kacheln_azyklisch/main/hard",
      ]);
      expect(byRange, "pairs addressing a picture that does not exist").toEqual([
        "Antarctic/all/normal",
        "Elemente/all/normal",
        "Elemente/nofx/easy",
        "Fische/all/normal",
        "Fische/main/easy",
        "Fische/main/hard",
        "Flechtwerk/all/normal",
        "Flechtwerk/weird/easy",
        "Flechtwerk/weird/hard",
        "Hormone/all/normal",
        "Hormone/nofx/easy",
        "Wachsen/all/normal",
        "Wachsen/main/hard",
        "Wachsen/weird/easy",
      ]);

      // **And the two groups account for every throw.** 6 + 14 = 20, and this is the assertion
      // that makes the lists exhaustive: a throw from a *third* cause, or a fourth pair in either
      // group, would push this past 20 and fail with the name of the newcomer — rather than
      // silently changing the survey's tally, which is exactly how the ten survey throws went
      // unreported for as long as they did.
      expect(throwing).toHaveLength(20);
      // Belt and braces, and cheap: every message is one of the two known shapes.
      expect(messages.filter((m) => !/division by zero|out of range/.test(m))).toEqual([]);

      // **A pair that reached a win or a loss is the ordinary case** and needs no comment; what is
      // worth saying is that a no-input run does not settle a level, so neither outcome is a
      // verdict on the level. The count is in the failure message only so that a change is
      // diagnosable from the output alone.
      const settled = outcomes.filter((o) => o.phase === "won" || o.phase === "lost").length;
      expect(
        settled,
        `${settled} of ${all.length} pairs settled; the rest are still running, which is expected`,
      ).toBeGreaterThanOrEqual(0);
    },
    120_000,
  );

  it("covers every track, so a track added later cannot be silently untested", async () => {
    // The assertion above counts 187 pairs and 5 tracks, which would both still hold if a new
    // track were added to the catalogue and a compensating pair removed. This pins the names,
    // because the whole reason this file exists is that `main` is not the whole catalogue.
    const tracks = [...new Set(pairs().map((p) => p.track))].sort();
    expect(tracks).toEqual(["all", "contrib", "main", "nofx", "weird"]);
  });
});
