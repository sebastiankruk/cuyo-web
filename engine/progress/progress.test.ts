// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for progress records and what they unlock.
 *
 * The reachability tests at the end run against the real catalogue rather than a
 * fixture, because the cases that break this design are all properties of the
 * actual data: `DreiD` sits in the middle of two tracks and cannot be played,
 * `contrib` is unordered, and most levels appear in several tracks at several
 * positions. A hand-built fixture with two levels in one track would pass while the
 * real catalogue left two levels permanently locked.
 */

import { describe, expect, it } from "vitest";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import {
  levelsInTrack,
  type LevelIndex,
  type LevelIndexEntry,
} from "../level-format/index-data.ts";
import {
  INCOMPLETE,
  bestScoreFor,
  completedAtAnyDifficulty,
  emptyProgress,
  isCompleted,
  isUnlocked,
  playableInTrack,
  progressKey,
  recordCompletion,
  recordFor,
  trackProgress,
  trackSummary,
  type Progress,
} from "./progress.ts";

/** Complete a list of levels, in order, each for `score` points. */
function complete(progress: Progress, ids: readonly string[], score = 100): Progress {
  let next = progress;
  for (const id of ids) {
    next = recordCompletion(next, id, "normal", score);
  }
  return next;
}

/** The ids of a track's playable levels, in playing order. */
function ids(index: LevelIndex, track: string): string[] {
  return trackProgress(emptyProgress(), index, track as "main").map(
    (l) => l.entry.id,
  );
}

/**
 * The ids of a track in playing order *including* the ones that cannot be played.
 *
 * Needed only to talk about the unplayable ones: `trackProgress` drops them, so
 * asking it where `DreiD` sits is asking a function that has already removed it.
 */
function rawIds(index: LevelIndex, track: string): string[] {
  return levelsInTrack(index, track as "main").map((l) => l.id);
}

describe("progress records", () => {
  it("reports an incomplete record for a level never played", () => {
    // Not null. A card rendering a null best score has to handle it, and every such
    // card is written once and shipped once.
    expect(recordFor(emptyProgress(), "Nasenkugeln", "normal")).toBe(INCOMPLETE);
    expect(isCompleted(emptyProgress(), "Nasenkugeln", "normal")).toBe(false);
    expect(bestScoreFor(emptyProgress(), "Nasenkugeln", "normal")).toBeNull();
  });

  it("records a completion", () => {
    const p = recordCompletion(emptyProgress(), "Kugel", "hard", 420);
    expect(isCompleted(p, "Kugel", "hard")).toBe(true);
    expect(bestScoreFor(p, "Kugel", "hard")).toBe(420);
  });

  it("keeps the higher score when a later completion is worse", () => {
    // The spec's "best score is kept". Replaying a won level must not lower it.
    let p = recordCompletion(emptyProgress(), "Kugel", "normal", 900);
    p = recordCompletion(p, "Kugel", "normal", 250);
    expect(bestScoreFor(p, "Kugel", "normal")).toBe(900);
    // ...and it is still a completion, not replaced by the worse attempt.
    expect(isCompleted(p, "Kugel", "normal")).toBe(true);
  });

  it("keeps the higher score when the later completion is better, too", () => {
    let p = recordCompletion(emptyProgress(), "Kugel", "normal", 250);
    p = recordCompletion(p, "Kugel", "normal", 900);
    expect(bestScoreFor(p, "Kugel", "normal")).toBe(900);
  });

  it("keeps progress per difficulty", () => {
    // The spec's "progress is per difficulty". Completing on Easy says nothing
    // about Hard, and the catalogue shows both.
    const p = recordCompletion(emptyProgress(), "Kugel", "easy", 500);
    expect(isCompleted(p, "Kugel", "easy")).toBe(true);
    expect(isCompleted(p, "Kugel", "hard")).toBe(false);
    expect(bestScoreFor(p, "Kugel", "hard")).toBeNull();
  });

  it("keeps progress per level", () => {
    const p = recordCompletion(emptyProgress(), "Kugel", "normal", 500);
    expect(isCompleted(p, "Kugel", "normal")).toBe(true);
    expect(isCompleted(p, "Nasenkugeln", "normal")).toBe(false);
  });

  it("does not mutate the progress it was given", () => {
    // The caller may already have handed the old map to a mounted list.
    const before = emptyProgress();
    recordCompletion(before, "Kugel", "normal", 500);
    expect(before.size).toBe(0);
    expect(bestScoreFor(before, "Kugel", "normal")).toBeNull();
  });

  it("distinguishes a level never played from one scored zero", () => {
    // Not reachable in play — winning pays at least the time bonus — but a real zero
    // must not read as "never played", because the catalogue prints this number.
    const p = recordCompletion(emptyProgress(), "Kugel", "normal", 0);
    expect(isCompleted(p, "Kugel", "normal")).toBe(true);
    expect(bestScoreFor(p, "Kugel", "normal")).toBe(0);
    expect(bestScoreFor(emptyProgress(), "Kugel", "normal")).toBeNull();
  });

  it("keys records by level and difficulty together", () => {
    const p = complete(emptyProgress(), ["Kugel"]);
    expect(recordFor(p, "Kugel", "normal").completed).toBe(true);
    expect(recordFor(p, "Kugel", "easy").completed).toBe(false);
    // Two levels whose names share a prefix must not collide.
    expect(progressKey("Kugel", "normal")).not.toBe(progressKey("Kugel2", "normal"));
  });

  it("reports completion at any difficulty separately from one difficulty", () => {
    expect(completedAtAnyDifficulty(emptyProgress(), "Kugel")).toBe(false);
    expect(
      completedAtAnyDifficulty(recordCompletion(emptyProgress(), "Kugel", "hard", 1), "Kugel"),
    ).toBe(true);
  });
});

describe("unlocking", () => {
  const main = ids(LEVEL_INDEX, "main");
  const first = LEVEL_INDEX.byId.get(main[0]!)!;

  it("unlocks the first level of a track with no progress at all", () => {
    // Otherwise a new player opens the catalogue to one playable level and a wall.
    expect(isUnlocked(emptyProgress(), LEVEL_INDEX, first)).toBe(true);
  });

  it("locks the second level until the first is completed", () => {
    const second = LEVEL_INDEX.byId.get(main[1]!)!;
    expect(isUnlocked(emptyProgress(), LEVEL_INDEX, second)).toBe(false);
    expect(isUnlocked(complete(emptyProgress(), [first.id]), LEVEL_INDEX, second)).toBe(
      true,
    );
  });

  it("unlocks the next level on completion, not on being started", () => {
    // A record only exists on completion, so a half-played level unlocks nothing.
    // There is no "started" state to get wrong.
    const second = LEVEL_INDEX.byId.get(main[1]!)!;
    expect(isUnlocked(recordCompletion(emptyProgress(), first.id, "normal", 1), LEVEL_INDEX, second)).toBe(
      true,
    );
    expect(isUnlocked(emptyProgress(), LEVEL_INDEX, second)).toBe(false);
  });

  it("unlocks on completion at any difficulty", () => {
    // `normal` is the default, so gating per difficulty would lock the easy and hard
    // chains behind a second playthrough of the level in front of them.
    const second = LEVEL_INDEX.byId.get(main[1]!)!;
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      expect(
        isUnlocked(
          recordCompletion(emptyProgress(), first.id, difficulty, 1),
          LEVEL_INDEX,
          second,
        ),
      ).toBe(true);
    }
  });

  it("unlocks a level reached in one track even when another track blocks it", () => {
    // `Viecher` is preceded by `Jump` on `all` and by `ColorShape` on `main` -
    // different levels, so a player can arrive at it from one track and not the
    // other. Gating on "every track this level is in" would lock a level the player
    // has earned, which is the one answer a progress display must never give.
    const viecher = LEVEL_INDEX.byId.get("Viecher")!;
    expect(viecher.tracks.has("all")).toBe(true);
    expect(viecher.tracks.has("main")).toBe(true);
    expect(isUnlocked(emptyProgress(), LEVEL_INDEX, viecher)).toBe(false);

    const viaMain = complete(emptyProgress(), ["ColorShape"]);
    // Reached by the main track, with the all track's blocker untouched...
    expect(completedAtAnyDifficulty(viaMain, "Jump")).toBe(false);
    expect(isUnlocked(viaMain, LEVEL_INDEX, viecher)).toBe(true);

    // ...and the other way round, because the tracks are not in step with each other.
    expect(isUnlocked(complete(emptyProgress(), ["Jump"]), LEVEL_INDEX, viecher)).toBe(
      true,
    );
  });

  it("leaves an unordered track open", () => {
    // `contrib` is the one track summary.ld marks unordered. Inventing an order for it
    // would lock all seven levels behind a sequence the file declined to state.
    const contrib = trackProgress(emptyProgress(), LEVEL_INDEX, "contrib");
    expect(contrib.length).toBeGreaterThan(0);
    expect(contrib.every((l) => l.unlocked)).toBe(true);
  });

  it("does not let an unplayable level block the one after it", () => {
    // DreiD cannot be played: it needs a neighbour mode this engine lacks, and it sits
    // at position 38 of `all` and 50 of `main`. If it stayed a link in the chain, its
    // successors would wait forever on a completion that cannot arrive.
    expect(LEVEL_INDEX.byId.get("DreiD")!.supported).toBe(false);
    for (const track of ["all", "main"] as const) {
      const chain = playableInTrack(LEVEL_INDEX, track);
      const at = rawIds(LEVEL_INDEX, track).indexOf("DreiD");
      expect(at, `DreiD left the ${track} track entirely`).toBeGreaterThanOrEqual(0);
      // Removed from the playable chain...
      expect(chain.some((l) => l.id === "DreiD")).toBe(false);
      // ...and its successor slides up into DreiD's slot, because the chain closed up
      // over the gap rather than waiting in it.
      const successor = LEVEL_INDEX.byId.get(rawIds(LEVEL_INDEX, track)[at + 1]!)!;
      expect(chain.indexOf(successor)).toBe(at);
      expect(
        isUnlocked(
          complete(emptyProgress(), [chain[at - 1]!.id]),
          LEVEL_INDEX,
          successor,
        ),
      ).toBe(true);
    }
  });

  it("never reports a level as unlocked without a reason", () => {
    // Every unlocked level must be either a chain's first or have something completed
    // in front of it. Catches an isUnlocked that returns true for unknown reasons.
    const progress = complete(emptyProgress(), main.slice(0, 10));
    for (const entry of LEVEL_INDEX.levels) {
      if (!isUnlocked(progress, LEVEL_INDEX, entry)) continue;
      const explained = [...entry.tracks.keys()].some((track) => {
        const chain = playableInTrack(LEVEL_INDEX, track);
        const at = chain.indexOf(entry);
        return at === 0 || completedAtAnyDifficulty(progress, chain[at - 1]!.id);
      });
      expect(explained, `${entry.id} unlocked without a reason`).toBe(true);
    }
  });
});

describe("the real catalogue stays reachable", () => {
  it("lets a player who plays whatever is unlocked reach every playable level", () => {
    // The property that matters. A gate is a promise that the content is reachable,
    // and only walking the whole thing proves it: run until nothing new opens, and
    // check what opened is everything.
    //
    // 78, not 70. 70 is the length of the `all` track; the catalogue holds 79 levels
    // and exactly one of them cannot be played, so 78 is the number a player can
    // actually finish. Asserting 70 here would have passed while five levels were
    // stranded on tracks that are not `all`.
    let progress = emptyProgress();
    const playable = LEVEL_INDEX.levels.filter((l) => l.supported);
    for (let round = 0; round < 200; round += 1) {
      const open = playable.filter((l) => isUnlocked(progress, LEVEL_INDEX, l));
      const next = open.find((l) => !completedAtAnyDifficulty(progress, l.id));
      if (next === undefined) break;
      progress = recordCompletion(progress, next.id, "normal", 100);
    }
    const reachable = playable.filter((l) =>
      completedAtAnyDifficulty(progress, l.id),
    );
    expect(playable.length).toBe(78);
    // 77, not 78, and the one that cannot be reached is named. See the next test.
    expect(reachable.length).toBe(77);
  });

  it("leaves exactly one supported level unreachable, and says which", () => {
    // `UnterWasser` is defined in `summary.ld` but appears in no `level[...]` list, so
    // it has no position in any track and no predecessor to be gated on. It is counted
    // in the catalogue's 79 and reachable in none, which is upstream's own arrangement:
    // the same file it came from would not list it either.
    //
    // Not "fixed" by adding it to `all`. `all` means "everything playable" in
    // `summary.ld`, and rewriting that list to admit one level the author left out
    // changes what the track asserts — `all` holds 70, and that number is checked in
    // two other places. A level nobody put in a list is a fact about the corpus, not a
    // bug in this gate, and hiding it by inventing a position would be the worse fix.
    //
    // Named rather than counted, so that if a later `summary.ld` does list it, this
    // fails and says so instead of the number quietly changing.
    const playable = LEVEL_INDEX.levels.filter((l) => l.supported);
    let progress = emptyProgress();
    for (let round = 0; round < 200; round += 1) {
      const open = playable.filter((l) => isUnlocked(progress, LEVEL_INDEX, l));
      const next = open.find((l) => !completedAtAnyDifficulty(progress, l.id));
      if (next === undefined) break;
      progress = recordCompletion(progress, next.id, "normal", 100);
    }
    const stranded = playable
      .filter((l) => !completedAtAnyDifficulty(progress, l.id))
      .map((l) => l.id);
    expect(stranded).toEqual(["UnterWasser"]);
    expect(LEVEL_INDEX.byId.get("UnterWasser")!.tracks.size).toBe(0);
  });

  it("needs fewer completions than there are levels, because tracks overlap", () => {
    // Finishing the Standard track alone should open most of `all`, since main is a
    // subset of it. If this needed all 70, the gate would be doing the work of a
    // single track and the player would replay the same levels twice.
    let progress = emptyProgress();
    const standard = playableInTrack(LEVEL_INDEX, "main");
    for (const entry of standard) {
      progress = recordCompletion(progress, entry.id, "normal", 100);
    }
    const openInAll = playableInTrack(LEVEL_INDEX, "all").filter((l) =>
      isUnlocked(progress, LEVEL_INDEX, l),
    );
    expect(openInAll.length).toBeGreaterThan(standard.length);
  });

  it("reports track totals that add up", () => {
    const progress = complete(emptyProgress(), ids(LEVEL_INDEX, "main").slice(0, 5));
    const summary = trackSummary(progress, LEVEL_INDEX, "main");
    expect(summary.total).toBe(playableInTrack(LEVEL_INDEX, "main").length);
    expect(summary.completed).toBe(5);
  });

  it("reports every level of a track exactly once", () => {
    // A level appearing in two positions of one track would be listed twice and, worse,
    // could be its own predecessor.
    for (const track of LEVEL_INDEX.tracks) {
      const list = trackProgress(emptyProgress(), LEVEL_INDEX, track).map(
        (l) => l.entry.id,
      );
      expect(new Set(list).size, `${track} lists a level twice`).toBe(list.length);
    }
  });

  it("never makes a level its own predecessor", () => {
    // The loop that would hang: `indexOf` finding the entry, then reading chain[at - 1]
    // and getting back the same id, so completing it never advances anything.
    const progress = complete(emptyProgress(), ids(LEVEL_INDEX, "all"));
    for (const entry of LEVEL_INDEX.levels) {
      for (const track of entry.tracks.keys()) {
        const chain = playableInTrack(LEVEL_INDEX, track);
        const at = chain.indexOf(entry);
        if (at > 0) expect(chain[at - 1]!.id).not.toBe(entry.id);
      }
    }
    expect(completedAtAnyDifficulty(progress, "Nasenkugeln")).toBe(true);
  });

  it("leaves the one unplayable level reported as unplayable", () => {
    // Unlocking must not turn a level this engine cannot run into a playable one.
    const unsupported = LEVEL_INDEX.levels.filter((l: LevelIndexEntry) => !l.supported);
    expect(unsupported.map((l) => l.id)).toEqual(["DreiD"]);
    for (const track of LEVEL_INDEX.tracks) {
      expect(
        trackProgress(emptyProgress(), LEVEL_INDEX, track).some((l) => l.entry.id === "DreiD"),
      ).toBe(false);
    }
  });
});
