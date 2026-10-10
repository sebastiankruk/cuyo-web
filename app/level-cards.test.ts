// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The catalogue's cards, as the player sees them — task 9.4.
 *
 * `engine/progress/progress.test.ts` covers whether a level is unlocked. This covers
 * what the card then *says*, which is a different question with its own traps:
 *
 * - **Three reasons a card cannot be played, with a precedence.** Two of them are true at
 *   once more often than intuition suggests, and getting the order wrong tells the
 *   player something false.
 * - **The locked message names a specific level to go and finish.** "Locked" alone is
 *   not actionable, and the corpus has enough levels that "the one before it" is not a
 *   thing a player can find.
 * - **A card is about one difficulty.** The best score shown is the chosen difficulty's,
 *   not the best across all of them, or a player looking at the Hard row is answered
 *   about Easy.
 */

import { describe, expect, it } from "vitest";
import { LEVEL_INDEX } from "../levels-src/generated/level-index.ts";
import {
  cardState,
  cardsInTrack,
  canStart,
  trackCounts,
  type BlockReason,
} from "./level-cards.ts";
import {
  emptyProgress,
  isUnlocked,
  recordCompletion,
} from "../engine/progress/progress.ts";
import type { Progress } from "../engine/progress/progress.ts";
import type { Difficulty, LevelIndexEntry } from "../engine/level-format/index-data.ts";

const entry = (id: string): LevelIndexEntry => {
  const found = LEVEL_INDEX.byId.get(id);
  if (found === undefined) throw new Error(`${id} is not in the catalogue`);
  return found;
};

/** Progress with the named levels won at `normal`. */
function won(...ids: string[]): Progress {
  let progress = emptyProgress();
  for (const id of ids) progress = recordCompletion(progress, id, "normal", 100);
  return progress;
}

describe("a card's block reason", () => {
  it("is none for a level this engine can play and the player has earned", () => {
    const state = cardState(emptyProgress(), LEVEL_INDEX, entry("Nasenkugeln"), "normal");
    expect(state.blockReason).toBe("none");
    expect(state.playable).toBe(true);
  });

  it("is unsupported for a level needing a neighbour mode this engine lacks", () => {
    // `DreiD` is the real case, and it is permanently so — no win opens it.
    const dreiD = entry("DreiD");
    expect(dreiD.supported).toBe(false);
    const state = cardState(emptyProgress(), LEVEL_INDEX, dreiD, "normal");
    expect(state.blockReason).toBe("unsupported");
    expect(state.playable).toBe(false);
  });

  it("is locked for a level the player has not earned", () => {
    // Somewhere in the middle of a chain, so it is not open by position.
    const progress = won("Nasenkugeln");
    const second = LEVEL_INDEX.levels.find(
      (l) => l.supported && !isFirst(progress, l) && !l.tracks.has("contrib"),
    );
    expect(second, "a level that is locked at the start").toBeDefined();
    const state = cardState(progress, LEVEL_INDEX, second!, "normal");
    expect(state.blockReason).toBe("locked");
    expect(state.playable).toBe(false);
  });

  it("prefers unsupported over locked, because unsupported is the truer answer", () => {
    // **The precedence, and the reason it is load-bearing rather than decorative.**
    //
    // `isUnlocked` walks `playableInTrack`, which *drops unsupported levels*. So for
    // `DreiD` the index is always `-1` in every track, the loop `continue`s, and
    // `isUnlocked` returns **false** — not because a gate is in the way, but because
    // there is no chain to be gated in. Both predicates are therefore false at once for
    // every unsupported level, and the order in `cardState` decides which one the player
    // is told.
    //
    // Getting it backwards would label `DreiD` "Locked", which promises the level opens
    // when the one before it is finished. It never will: the neighbour mode is not
    // implemented, and winning levels does not implement it. A gate the player can open
    // is a promise; this one is a fact.
    const dreiD = entry("DreiD");
    expect(isUnlocked(emptyProgress(), LEVEL_INDEX, dreiD)).toBe(false);
    // Even with the entire catalogue won, so no gate could be holding it back.
    const progress = won(...allIds());
    const state = cardState(progress, LEVEL_INDEX, dreiD, "normal");
    expect(state.blockReason).toBe("unsupported");
    expect(state.playable).toBe(false);
  });

  it("uses the catalogue's own words for an unsupported level", () => {
    // Not a generic "This level cannot be played". `unsupportedReason` is the one
    // sentence in the codebase that names the actual neighbour mode, and replacing it
    // with something vaguer would throw away the only explanation the player gets.
    const dreiD = entry("DreiD");
    const state = cardState(emptyProgress(), LEVEL_INDEX, dreiD, "normal");
    expect(state.blockDetail).toBe(dreiD.unsupportedReason);
    expect(state.blockDetail).not.toBe("");
  });

  it("says nothing about blocking when nothing is blocked", () => {
    const state = cardState(emptyProgress(), LEVEL_INDEX, entry("Nasenkugeln"), "normal");
    expect(state.blockDetail).toBe("");
  });
});

describe("a locked card names the level to finish", () => {
  it("names the level before it in the chain", () => {
    const progress = won("Nasenkugeln");
    const target = LEVEL_INDEX.levels.find(
      (l) =>
        l.supported &&
        l.id !== "Nasenkugeln" &&
        l.tracks.has("main") &&
        blockOf(progress, l) === "locked",
    );
    expect(target, "a locked level on the main track").toBeDefined();
    const state = cardState(progress, LEVEL_INDEX, target!, "normal");
    expect(state.blockReason).toBe("locked");
    expect(state.blockDetail).toMatch(/^Finish .+\.$/);
    // And it is a real level's *display* name, not its id — `Noseballs`, not
    // `Nasenkugeln`. The catalogue lists names everywhere else, so an id here would be
    // the one string on the card a player cannot match against the card below it.
    expect(state.blockDetail).not.toContain(target!.id);
  });

  it("does not name a level for a card that is not blocked", () => {
    // A "locked" message on a playable card would be a worse bug than a missing one: it
    // is the only text on the card that changes what a player tries next.
    for (const track of LEVEL_INDEX.tracks.filter((t) => t !== "all")) {
      for (const card of cardsInTrack(won(...allIds()), LEVEL_INDEX, track, () => "normal")) {
        if (card.blockReason === "none") expect(card.blockDetail, card.entry.id).toBe("");
      }
    }
  });
});

describe("a card's best score is the chosen difficulty's", () => {
  it("is null before the level is won at all", () => {
    const state = cardState(emptyProgress(), LEVEL_INDEX, entry("Nasenkugeln"), "normal");
    expect(state.bestScore).toBeNull();
  });

  it("is the score from the difficulty the card is about to start", () => {
    // Won Easy at 400, Hard at 900. Looking at the Easy row must show 400 — the number
    // answers "what did I do here", and a player who beats a level on Easy and then
    // looks at it again is asking about Easy. Showing the max across difficulties would
    // answer a question they did not ask, and would make Easy look worse than it was.
    const id = "Nasenkugeln";
    let progress = emptyProgress();
    progress = recordCompletion(progress, id, "easy", 400);
    progress = recordCompletion(progress, id, "hard", 900);
    expect(cardState(progress, LEVEL_INDEX, entry(id), "easy").bestScore).toBe(400);
    expect(cardState(progress, LEVEL_INDEX, entry(id), "hard").bestScore).toBe(900);
    // And the one never played stays null rather than falling back to another
    // difficulty's number.
    expect(cardState(progress, LEVEL_INDEX, entry(id), "normal").bestScore).toBeNull();
  });

  it("reports completion at any difficulty even when the score is another one", () => {
    // The tick and the score answer different questions. `completed` is "have I finished
    // this", which is per-level; `bestScore` is "how did I do at this difficulty", which
    // is per-difficulty. Making the tick follow the score would untick a card the player
    // has genuinely finished, which reads as losing their progress.
    const id = "Nasenkugeln";
    const progress = recordCompletion(emptyProgress(), id, "easy", 400);
    const onEasy = cardState(progress, LEVEL_INDEX, entry(id), "easy");
    const onHard = cardState(progress, LEVEL_INDEX, entry(id), "hard");
    expect(onEasy.completed).toBe(true);
    expect(onHard.completed).toBe(true);
    expect(onHard.bestScore).toBeNull();
  });
});

describe("cards in a track", () => {
  it("keeps levels this engine cannot play, so they can say why", () => {
    // **Not `trackProgress`, which drops them.** Dropping them was the old behaviour by
    // omission rather than by decision, and it is the silent omission
    // `LevelIndexEntry.supported` exists to prevent: a level that is in the catalogue
    // and cannot be played should be visible and should explain itself.
    const cards = cardsInTrack(emptyProgress(), LEVEL_INDEX, "all", () => "normal");
    expect(cards.some((c) => c.entry.id === "DreiD")).toBe(true);
    const dreiD = cards.find((c) => c.entry.id === "DreiD");
    expect(dreiD?.blockReason).toBe("unsupported");
    expect(dreiD?.blockDetail).not.toBe("");
  });

  it("covers every level in the track exactly once", () => {
    for (const track of LEVEL_INDEX.tracks) {
      const cards = cardsInTrack(emptyProgress(), LEVEL_INDEX, track, () => "normal");
      const fromTrack = LEVEL_INDEX.levels.filter((l) => l.tracks.has(track));
      expect(cards.length, track).toBe(fromTrack.length);
      expect(new Set(cards.map((c) => c.entry.id)).size, track).toBe(cards.length);
    }
  });

  it("passes each level its own chosen difficulty rather than one for the list", () => {
    // A single difficulty for the whole track would show the wrong best score on every
    // card where the player's choice is not the default — and the control that chooses it
    // is on the card.
    //
    // **`normal` for the baseline, not `hard`.** `Nasenkugeln` offers `easy` and `normal`
    // and no `hard`, and a record is keyed by a difficulty the level actually has. A
    // fixture that won it on `hard` reads back `null` — correctly, since nothing was ever
    // won at a difficulty this level does not offer, and the first version of this test
    // failed on exactly that.
    const id = "Nasenkugeln";
    const progress = recordCompletion(emptyProgress(), id, "normal", 100);
    const chosen = new Map<string, Difficulty>([[id, "normal"]]);
    const cards = cardsInTrack(progress, LEVEL_INDEX, "all", (e) => chosen.get(e.id) ?? "easy");
    const kugel = cards.find((c) => c.entry.id === id);
    // Every other level fell back to `easy` and was never won there, so a wrong
    // difficulty reaching the card would show as null rather than as a wrong number.
    expect(kugel?.bestScore).toBe(100);
    expect(cards.filter((c) => c.bestScore !== null).map((c) => c.entry.id)).toEqual([id]);
  });
});

describe("the track header's counts", () => {
  it("counts only levels this engine can play", () => {
    // A header that counted an unplayable level in its denominator would never reach it,
    // so a player would watch "5 of 59" and never get to 59. `DreiD` is in `all` and
    // `main`, so this is not hypothetical.
    const cards = cardsInTrack(emptyProgress(), LEVEL_INDEX, "main", () => "normal");
    const counts = trackCounts(cards);
    const supported = cards.filter((c) => c.entry.supported).length;
    expect(counts.total).toBe(supported);
    expect(counts.total).toBe(cards.length - 1);
  });

  it("agrees with the cards on what is unlocked", () => {
    // The header and the cards are rendered from one list, so a disagreement means one of
    // them is wrong — and "3 of 59 unlocked" beside 57 cards that all look playable is
    // exactly the sort of thing that gets believed.
    for (const track of LEVEL_INDEX.tracks.filter((t) => t !== "all")) {
      for (const progress of [emptyProgress(), won(...allIds())]) {
        const cards = cardsInTrack(progress, LEVEL_INDEX, track, () => "normal");
        const counts = trackCounts(cards);
        expect(counts.unlocked, track).toBe(cards.filter((c) => c.playable).length);
        expect(counts.completed, track).toBe(cards.filter((c) => c.completed).length);
      }
    }
  });

  it("reaches every playable level as the player wins them", () => {
    // The gate's promise, measured at the header rather than at the rule: a track's
    // unlocked count should climb to its total as the player works through it, and stop
    // at the total rather than at something less.
    let progress = emptyProgress();
    for (let round = 0; round < 50; round += 1) {
      const cards = cardsInTrack(progress, LEVEL_INDEX, "main", () => "normal");
      const open = cards.filter((c) => c.playable && !c.completed);
      if (open.length === 0) break;
      for (const card of open) {
        progress = recordCompletion(progress, card.entry.id, "normal", 1);
      }
    }
    const counts = trackCounts(cardsInTrack(progress, LEVEL_INDEX, "main", () => "normal"));
    expect(counts.completed).toBe(counts.total);
    expect(counts.unlocked).toBe(counts.total);
  });
});

describe("canStart", () => {
  it("is false for every block reason and true for none", () => {
    // The one function the hit target and the loader both read. 9.4 asks that a locked
    // level cannot be *started*, and that fails by the card having no button while the
    // loader has no check — so this asserts the two ends agree for every reason there is.
    for (const progress of [emptyProgress(), won(...allIds())]) {
      for (const track of LEVEL_INDEX.tracks) {
        for (const card of cardsInTrack(progress, LEVEL_INDEX, track, () => "normal")) {
          expect(canStart(card), card.entry.id).toBe(card.blockReason === "none");
          // And the same fact reached the other way round, because `playable` is the
          // field the button reads and `canStart` is the one the loader reads — two
          // reads of one value, asserted from both sides so neither can drift alone.
          expect(canStart(card), card.entry.id).toBe(card.playable);
        }
      }
    }
  });
});

describe("the precedence, held across the whole catalogue", () => {
  it("makes every unsupported level read as unsupported, at every progress and difficulty", () => {
    // **The invariant, stated once.** An unsupported level is never `locked` and never
    // `none`, whatever the player has done — which is the precedence in one sentence.
    //
    // Run over every level at both ends of the progress range rather than over chosen
    // examples, because the interesting bug is the combination nobody thought of. `Pfeile`
    // is in the list because it *is* at position 11 of `main`: a supported level that
    // genuinely reads `locked` at a fresh install, and must still not be confused with
    // one that reads `unsupported`.
    for (const progress of [emptyProgress(), won(...allIds())]) {
      for (const id of LEVEL_INDEX.byId.keys()) {
        const level = LEVEL_INDEX.byId.get(id)!;
        for (const difficulty of ["easy", "normal", "hard"] as const) {
          const state = cardState(progress, LEVEL_INDEX, level, difficulty);
          const label = `${id}/${difficulty}`;
          if (!level.supported) {
            expect(state.blockReason, label).toBe("unsupported");
            expect(state.playable, label).toBe(false);
          }
          // And for every level, supported or not, the three fields agree with each
          // other. This is the part that catches a card whose text, button and gate have
          // drifted apart, which is what "verify a locked level cannot be started" is
          // actually about.
          expect(state.playable, label).toBe(state.blockReason === "none");
          expect(canStart(state), label).toBe(state.playable);
          expect(state.blockDetail === "", label).toBe(state.blockReason === "none");
          expect(state.blockDetail !== "", label).toBe(state.blockReason !== "none");
        }
      }
    }
  });

  it("agrees with isUnlocked on every supported level, so the card cannot flatter the gate", () => {
    // `cardState` recomputes the gate rather than being handed it. If the two ever
    // disagree, a card could offer a button for a level the loader refuses — so the
    // loader's own answer is checked here, at both extremes and at a partial progress.
    for (const progress of [emptyProgress(), won("Nasenkugeln"), won(...allIds())]) {
      for (const id of LEVEL_INDEX.byId.keys()) {
        const level = LEVEL_INDEX.byId.get(id)!;
        if (!level.supported) continue;
        const state = cardState(progress, LEVEL_INDEX, level, "normal");
        expect(state.blockReason, id).toBe(
          isUnlocked(progress, LEVEL_INDEX, level) ? "none" : "locked",
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ helpers */

/** Every playable level's id, for a progress that has unlocked everything. */
function allIds(): string[] {
  return LEVEL_INDEX.levels.filter((l) => l.supported).map((l) => l.id);
}

/** Whether a level is open with no progress — i.e. it heads every chain it is in. */
function isFirst(_progress: Progress, level: LevelIndexEntry): boolean {
  return blockOf(emptyProgress(), level) !== "locked";
}

/** The block reason with no progress, for choosing fixtures. */
function blockOf(_progress: Progress, level: LevelIndexEntry): BlockReason {
  return cardState(emptyProgress(), LEVEL_INDEX, level, "normal").blockReason;
}
