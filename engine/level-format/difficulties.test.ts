/**
 * The three difficulty settings, described, and what they actually change.
 *
 * Task 6.3. The three have existed since 6.1 — `DIFFICULTIES`, a `difficulty` per resolved
 * version, and `numExplodeAt(entry, difficulty)` — so this is not about making them exist. It is
 * about two things that were missing: the player had nothing to read, and nothing had ever
 * checked that choosing a difficulty changes anything.
 *
 * ## What a difficulty is, measured
 *
 * All 108 difficulty variants in the corpus, compared field by field against `normal`:
 *
 * | field        | variants that change it |
 * | ------------ | ----------------------: |
 * | `numExplode` |                      15 |
 * | `startRows`  |                       7 |
 * | `kinds`      |                       6 |
 * | `chainGrass` |                       3 |
 * | `topTime`    |                       0 |
 * | `neighbours` |                       0 |
 *
 * Three facts fall out of that, and the descriptions are built on all three rather than on what a
 * difficulty is assumed to be:
 *
 * - **Every one of the fifteen `numExplode` changes but one is an `easy` one, and every one of
 *   those lowers the threshold.** A bigger group before it detonates is the gentler direction, so
 *   `easy` is the side that moves the number a player feels.
 * - **`hard` changes anything at all in only 7 of its 44 variants**, and two of those touch
 *   `numExplode`. So "Hard" mostly means a different starting layout or a different set of kinds,
 *   which is why its sentence says "where they wrote any".
 * - **No level anywhere varies the chase border's rate or its connection mode by difficulty.**
 *   Asserted as an absence below, because it is the obvious thing to assume and a description that
 *   assumed it would be wrong about all 79 levels.
 *
 * And 13 of the 79 levels offer no difficulty at all, which is why the catalogue's control only
 * appears when `offered.length > 1`.
 */

import { describe, expect, it } from "vitest";
import {
  DESCRIBED_DIFFICULTIES,
  DIFFICULTIES,
  describeDifficulty,
  numExplodeAt,
} from "./index-data.ts";
import type { Difficulty, DifficultyEntry, LevelIndexEntry } from "./index-data.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";

const LEVELS: readonly LevelIndexEntry[] = LEVEL_INDEX.levels;

describe("the three settings", () => {
  it("are the three, in order, and each is described", () => {
    expect(DIFFICULTIES).toEqual(["easy", "normal", "hard"]);
    expect(Object.keys(DESCRIBED_DIFFICULTIES).sort()).toEqual(["easy", "hard", "normal"]);
    for (const difficulty of DIFFICULTIES) {
      const described = describeDifficulty(difficulty);
      expect(described.name, difficulty).not.toBe("");
      // Capitalised, because each one starts a sentence on a button.
      expect(described.name[0], difficulty).toBe(described.name[0]?.toUpperCase());
      expect(described.description.length, difficulty).toBeGreaterThan(20);
      expect(described.description.endsWith("."), difficulty).toBe(true);
    }
  });

  it("says what picking one does, and not what it is supposed to feel like", () => {
    // The temptation is "the same level, made easier". 6.3's own measurement refuses it: `hard`
    // changes anything in 7 of 44 variants, and two of those are the explosion size. So the
    // descriptions claim only what the corpus supports — a different set of the author's numbers.
    expect(describeDifficulty("easy").description).toMatch(/author/i);
    expect(describeDifficulty("hard").description).toMatch(/author/i);
    // And `normal` is the one with a real statement to make: nothing is qualified.
    expect(describeDifficulty("normal").description).toMatch(/as .*author wrote it|no difficulty/i);
    // Nothing claims the level's length changes. `topTime` is identical across every variant in
    // the corpus, so a "longer" or "shorter" claim would be false everywhere.
    for (const difficulty of DIFFICULTIES) {
      expect(describeDifficulty(difficulty).description, difficulty).not.toMatch(
        /\b(longer|shorter|faster border|slower border)\b/i,
      );
    }
  });

  it("and every level can name all three, whatever it offers", () => {
    // `describeDifficulty` takes the union rather than a string, so a level offering only `easy`
    // cannot ask for a description of a difficulty it does not have — and the catalogue only
    // offers what `difficulties` holds.
    for (const difficulty of DIFFICULTIES) {
      expect(describeDifficulty(difficulty), difficulty).toBe(DESCRIBED_DIFFICULTIES[difficulty]);
    }
  });
});

describe("what a difficulty changes in the corpus", () => {
  it("alters numExplode for 15 of the 108 variants, and only easy lowers it", () => {
    // 6.3's own verification clause, and the numbers are in the header because they are what the
    // descriptions rest on. A corpus that grew a level would move them, which is the point.
    const changed: { id: string; difficulty: Difficulty; from: number; to: number }[] = [];
    let compared = 0;
    for (const entry of LEVELS) {
      const normal = entry.difficulties.get("normal");
      for (const difficulty of ["easy", "hard"] as const) {
        const variant = entry.difficulties.get(difficulty);
        if (!normal || !variant) continue;
        if (normal.numExplode === null || variant.numExplode === null) continue;
        compared += 1;
        if (normal.numExplode !== variant.numExplode) {
          changed.push({
            id: entry.id,
            difficulty,
            from: normal.numExplode,
            to: variant.numExplode,
          });
        }
      }
    }
    // Every variant that has a number on both sides was compared — 106 of 108, the other two
    // being the levels with no `numexplode` at all.
    expect(compared).toBe(106);
    expect(changed).toHaveLength(15);
    // The two `hard` changes, and both *raise* the threshold: `Jump` 4 -> 5 and `Fische` 9 -> 10.
    // Two of forty-four, which is why `hard`'s sentence says "where they wrote any".
    //
    // Sorted by id, so the assertion is about *which* levels and not about where the index
    // happens to list them — adding a level would otherwise fail this for no reason.
    const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
    expect(changed.filter((c) => c.difficulty === "hard").sort(byId)).toEqual([
      { id: "Fische", difficulty: "hard", from: 9, to: 10 },
      { id: "Jump", difficulty: "hard", from: 4, to: 5 },
    ]);
    // And every `easy` change lowers it, which is the direction the description claims.
    expect(changed.filter((c) => c.difficulty === "easy").every((c) => c.to < c.from)).toBe(true);
    expect(changed.filter((c) => c.difficulty === "easy")).toHaveLength(13);
  });

  it("leaves the chase border and the connection mode alone everywhere", () => {
    // The absence that stops a description claiming a level gets shorter or the pieces stop
    // connecting. Both are per-variant fields in the index, so this is a real check rather than
    // a comment.
    const fields: (keyof DifficultyEntry)[] = [
      "numExplode",
      "chainGrass",
      "topTime",
      "neighbours",
      "kinds",
      "startRows",
    ];
    const counts = new Map<string, number>();
    for (const entry of LEVELS) {
      const normal = entry.difficulties.get("normal");
      if (!normal) continue;
      for (const difficulty of ["easy", "hard"] as const) {
        const variant = entry.difficulties.get(difficulty);
        if (!variant) continue;
        for (const field of fields) {
          if (normal[field] === variant[field]) continue;
          counts.set(field, (counts.get(field) ?? 0) + 1);
        }
      }
    }
    expect(Object.fromEntries([...counts.entries()].sort())).toEqual({
      chainGrass: 3,
      kinds: 6,
      numExplode: 15,
      startRows: 7,
    });
    // Named rather than left implicit, because a number that is missing from a table reads like
    // an oversight and these two are the whole point.
    expect(counts.has("topTime")).toBe(false);
    expect(counts.has("neighbours")).toBe(false);
  });

  it("is offered by 66 of the 79 levels, and 13 offer none", () => {
    // Which is why the catalogue's difficulty control only appears when a level has more than
    // one — a level with no variants would get a control with one button on it.
    let either = 0;
    let all = 0;
    for (const entry of LEVELS) {
      const offered = DIFFICULTIES.filter((d) => entry.difficulties.has(d));
      if (offered.length > 1) either += 1;
      if (offered.length === DIFFICULTIES.length) all += 1;
    }
    expect(LEVELS).toHaveLength(79);
    expect(either).toBe(66);
    expect(all).toBeGreaterThan(0);
    // `normal` is always there: it is the unqualified version, so every level has it.
    for (const entry of LEVELS) {
      expect(entry.difficulties.has("normal"), entry.id).toBe(true);
    }
  });
});

describe("the helper the catalogue and the rules panel both read", () => {
  it("answers the same number as the entry it wraps", () => {
    // `numExplodeAt` is the documented way in, and it defaults to `normal`. Asserted against the
    // map directly so the two cannot drift.
    for (const entry of LEVELS) {
      expect(numExplodeAt(entry), entry.id).toBe(entry.difficulties.get("normal")?.numExplode ?? null);
      for (const difficulty of DIFFICULTIES) {
        expect(numExplodeAt(entry, difficulty), `${entry.id}/${difficulty}`).toBe(
          entry.difficulties.get(difficulty)?.numExplode ?? null,
        );
      }
    }
  });

  it("returns null for a level whose kinds never detonate on size", () => {
    // `null` and not 0: a level with no `numexplode` is a different thing from one that
    // detonates at zero, and collapsing them would make the rules panel claim a threshold.
    const without = LEVELS.filter((e) => numExplodeAt(e) === null);
    expect(without.length).toBeGreaterThan(0);
    for (const entry of without) {
      expect(entry.difficulties.get("normal")?.numExplode, entry.id).toBeNull();
    }
  });
});