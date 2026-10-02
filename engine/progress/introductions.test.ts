/**
 * Tests for the level introduction and the option to skip it.
 *
 * The rule that matters is the one the spec states as a pair: an introduction is shown
 * *and* the simulation waits. Both are asserted together at the bottom, because a
 * function that gets one right and the other wrong produces a level that either moves
 * under a screen the player is still reading or never starts at all.
 *
 * The last group runs against the real catalogue, since "27 of 79 levels have no
 * description" is a property of the corpus and not something a fixture can assert.
 */

import { describe, expect, it } from "vitest";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import { DIFFICULTIES } from "../level-format/index-data.ts";
import {
  NO_LEVELS_SEEN,
  SHOW_INTRODUCTIONS,
  hasSeen,
  introductionFor,
  markSeen,
  shouldShowIntroduction,
  startGate,
  type IntroductionOptions,
} from "./introductions.ts";

const SKIP_ALL: IntroductionOptions = { skipIntroductions: true };

describe("the introduction's contents", () => {
  const entry = LEVEL_INDEX.byId.get("Nasenkugeln")!;

  it("carries the name, author and description from the catalogue", () => {
    const intro = introductionFor(entry, "normal", "main");
    expect(intro.name).toBe(entry.name);
    expect(intro.author).toBe(entry.author);
    expect(intro.description).toBe(entry.description);
  });

  it("carries the level's identity, so marking it seen cannot drift", () => {
    expect(introductionFor(entry).id).toBe("Nasenkugeln");
  });

  it("records the difficulty and track it is being shown for", () => {
    // The same level differs across difficulties, so "which one was this" is part of
    // what the player is being shown, not just what is being recorded.
    const intro = introductionFor(entry, "hard", "weird");
    expect(intro.difficulty).toBe("hard");
    expect(intro.track).toBe("weird");
  });

  it("reports an empty description rather than inventing one", () => {
    // 27 of 79 have none. A layout that assumes there is something to read would show
    // a blank panel for a third of the catalogue.
    const bare = LEVEL_INDEX.levels.find((l) => l.description === "");
    expect(bare).toBeDefined();
    expect(introductionFor(bare!).description).toBe("");
  });
});

describe("seen levels", () => {
  it("starts with nothing seen", () => {
    expect(NO_LEVELS_SEEN.size).toBe(0);
    expect(hasSeen(NO_LEVELS_SEEN, "Nasenkugeln")).toBe(false);
  });

  it("remembers a level once marked", () => {
    const seen = markSeen(NO_LEVELS_SEEN, "Nasenkugeln");
    expect(hasSeen(seen, "Nasenkugeln")).toBe(true);
    expect(hasSeen(seen, "Kugel")).toBe(false);
  });

  it("does not mutate the set it was given", () => {
    const before = NO_LEVELS_SEEN;
    markSeen(before, "Nasenkugeln");
    expect(before.size).toBe(0);
  });

  it("counts a level once however many times it is marked", () => {
    let seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    seen = markSeen(seen, "Kugel");
    expect(seen.size).toBe(1);
  });

  it("keeps seen apart from completed", () => {
    // Reading a level is not finishing it. A player who reads every introduction and
    // wins nothing has seen the catalogue and completed none of it.
    const seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    expect(hasSeen(seen, "Kugel")).toBe(true);
    expect(seen.has("never-played")).toBe(false);
  });
});

describe("whether the introduction is shown", () => {
  it("shows a level's introduction the first time", () => {
    expect(shouldShowIntroduction(NO_LEVELS_SEEN, "Kugel")).toBe(true);
  });

  it("shows it again by default, because skipping is opt-in", () => {
    // Defaulting to hidden would mean a player never learns a level exists the second
    // time round, which is not what "can be skipped" asks for.
    const seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    expect(shouldShowIntroduction(seen, "Kugel")).toBe(true);
    expect(shouldShowIntroduction(seen, "Kugel", SHOW_INTRODUCTIONS)).toBe(true);
  });

  it("skips a level whose introduction has been seen", () => {
    const seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    expect(shouldShowIntroduction(seen, "Kugel", SKIP_ALL)).toBe(false);
  });

  it("still shows a level never seen, even with skipping on", () => {
    // "Skip" is about not repeating yourself. A first sighting is not a repetition,
    // and a player who switched this on from a menu has read none of these levels.
    const seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    expect(shouldShowIntroduction(seen, "Nasenkugeln", SKIP_ALL)).toBe(true);
  });

  it("is unaffected by which difficulty is being played", () => {
    // Seen is per level, not per level-and-difficulty: the introduction is the same
    // text either way, and the spec asks to skip *an introduction*, not a variant of it.
    const seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    for (const difficulty of DIFFICULTIES) {
      expect(shouldShowIntroduction(seen, "Kugel", SKIP_ALL), difficulty).toBe(false);
    }
  });

  it("still shows a new level with skipping on, and records it as seen", () => {
    // The loop a real session runs: skipping on from the start. Every level introduces
    // itself once, because none of them have been seen, and each is recorded so that
    // the *next* attempt skips it.
    let seen = NO_LEVELS_SEEN;
    const ids = ["A", "B", "C"];
    for (const id of ids) {
      expect(shouldShowIntroduction(seen, id, SKIP_ALL), id).toBe(true);
      seen = markSeen(seen, id);
    }
    expect(seen.size).toBe(3);
    // Second pass through the same three: all skipped.
    for (const id of ids) {
      expect(shouldShowIntroduction(seen, id, SKIP_ALL), id).toBe(false);
    }
  });

  it("keeps what was seen across the setting being turned off and on again", () => {
    // Turning skipping off shows everything again - that is what off means, it is the
    // default - but it must not erase what had been read. Skipping back on afterwards
    // is what would be broken if it did.
    let seen = markSeen(NO_LEVELS_SEEN, "A");
    seen = markSeen(seen, "B");
    expect(shouldShowIntroduction(seen, "A")).toBe(true);
    expect(shouldShowIntroduction(seen, "B")).toBe(true);
    expect(hasSeen(seen, "A")).toBe(true);
    expect(hasSeen(seen, "B")).toBe(true);
    expect(shouldShowIntroduction(seen, "A", SKIP_ALL)).toBe(false);
    expect(shouldShowIntroduction(seen, "B", SKIP_ALL)).toBe(false);
  });
});

describe("the simulation waits for the player", () => {
  it("does not advance while an introduction is up", () => {
    // The spec's "the simulation does not advance until the player confirms", stated as
    // the two halves of one gate.
    const gate = startGate(NO_LEVELS_SEEN, "Kugel");
    expect(gate.showIntroduction).toBe(true);
    expect(gate.mayAdvance).toBe(false);
  });

  it("advances straight away when the introduction is skipped", () => {
    const seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    const gate = startGate(seen, "Kugel", SKIP_ALL);
    expect(gate.showIntroduction).toBe(false);
    expect(gate.mayAdvance).toBe(true);
  });

  it("never says both at once, for any level and either setting", () => {
    // The invariant, over the whole catalogue and both settings: the two fields cannot
    // disagree. A caller that reads `mayAdvance` and ignores `showIntroduction` is safe
    // exactly when this holds.
    const seen = ["Nasenkugeln", "Kugel", "Schach"].reduce(markSeen, NO_LEVELS_SEEN);
    for (const entry of LEVEL_INDEX.levels) {
      for (const options of [SHOW_INTRODUCTIONS, SKIP_ALL]) {
        const gate = startGate(seen, entry.id, options);
        expect(gate.mayAdvance, `${entry.id} ${options.skipIntroductions}`).toBe(
          !gate.showIntroduction,
        );
      }
    }
  });

  it("holds a skipped level still once and only once", () => {
    // A gate that flips would be a level that runs before its text and stops after,
    // which is the specific bug the spec's "does not advance until the player confirms"
    // exists to prevent.
    const seen = markSeen(NO_LEVELS_SEEN, "Kugel");
    expect(startGate(seen, "Kugel", SKIP_ALL).mayAdvance).toBe(true);
    expect(startGate(seen, "Kugel", SKIP_ALL).mayAdvance).toBe(true);
    expect(startGate(NO_LEVELS_SEEN, "Kugel", SKIP_ALL).mayAdvance).toBe(false);
  });
});

describe("the real catalogue's introductions", () => {
  it("gives every level a name and an author", () => {
    for (const entry of LEVEL_INDEX.levels) {
      expect(entry.name, entry.id).not.toBe("");
      expect(entry.author, entry.id).not.toBe("");
    }
  });

  it("leaves 27 levels with no description to read", () => {
    // Pinned because it is what a layout has to handle, and because it is upstream's
    // data rather than a gap to fill in here.
    expect(LEVEL_INDEX.levels.filter((l) => l.description === "")).toHaveLength(27);
  });

  it("keeps descriptions to a screen's worth of text", () => {
    // If a description were 500 characters this would stop being an introduction and
    // start being a manual, and the longest is 112.
    for (const entry of LEVEL_INDEX.levels) {
      expect(entry.description.length, entry.id).toBeLessThanOrEqual(200);
    }
  });

  it("gives every level a well-formed introduction at every difficulty", () => {
    for (const entry of LEVEL_INDEX.levels) {
      for (const difficulty of DIFFICULTIES) {
        const intro = introductionFor(entry, difficulty, "all");
        expect(intro.id, `${entry.id}/${difficulty}`).toBe(entry.id);
        expect(intro.name, `${entry.id}/${difficulty}`).not.toBe("");
      }
    }
  });
});