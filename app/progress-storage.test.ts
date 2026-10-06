// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for keeping progress on the device.
 *
 * The corrupt-data cases are most of this file on purpose. `localStorage` is the one
 * piece of the game that survives a bad deploy, a half-finished write and a browser
 * extension, and the spec's requirement is narrow and absolute: when stored data
 * cannot be read, the game starts with defaults instead of failing to launch. A test
 * that only round-trips clean data would pass while every one of these threw.
 *
 * The store is a two-method object rather than a `localStorage` stub, so these run in
 * plain Node and each case is three lines rather than a fixture.
 */

import { describe, expect, it } from "vitest";
import {
  bestScoreFor,
  completedAtAnyDifficulty,
  isCompleted,
} from "../engine/progress/progress.ts";
import { hasSeen } from "../engine/progress/introductions.ts";
import {
  PROGRESS_KEY,
  completeAndStore,
  emptyState,
  markIntroductionSeen,
  readState,
  writeState,
  type KeyValueStore,
} from "./progress-storage.ts";

/** A `KeyValueStore` in memory, optionally hostile. */
function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/** A store that throws the way a locked-down browser does. */
function hostileStore(failOn: "get" | "set"): KeyValueStore {
  return {
    getItem: () => {
      if (failOn === "get") throw new Error("SecurityError");
      return null;
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
}

describe("storing progress", () => {
  it("keeps a completion across a restart", () => {
    // The whole point of the file. "Restart" here is a second read of the same bytes,
    // which is what closing the game and opening it again amounts to.
    const store = fakeStore();
    completeAndStore("Kugel", "normal", 900, store);
    expect(store.getItem(PROGRESS_KEY)).not.toBeNull();

    const { progress: reopened } = readState(store);
    expect(isCompleted(reopened, "Kugel", "normal")).toBe(true);
    expect(bestScoreFor(reopened, "Kugel", "normal")).toBe(900);
  });

  it("keeps per-difficulty records apart across a restart", () => {
    const store = fakeStore();
    completeAndStore("Kugel", "easy", 400, store);
    const { progress: reopened } = readState(store);
    expect(isCompleted(reopened, "Kugel", "easy")).toBe(true);
    expect(isCompleted(reopened, "Kugel", "hard")).toBe(false);
  });

  it("keeps the better score when a worse replay is stored", () => {
    // Retention across sessions, not just within one. A player who replays a level
    // badly after a good run must not lose the good number on the next launch.
    const store = fakeStore();
    completeAndStore("Kugel", "normal", 900, store);
    completeAndStore("Kugel", "normal", 120, store);
    expect(bestScoreFor(readState(store).progress, "Kugel", "normal")).toBe(900);
  });

  it("accumulates records for several levels rather than replacing them", () => {
    const store = fakeStore();
    completeAndStore("Kugel", "normal", 900, store);
    completeAndStore("Nasenkugeln", "normal", 300, store);
    const { progress: reopened } = readState(store);
    expect(isCompleted(reopened, "Kugel", "normal")).toBe(true);
    expect(isCompleted(reopened, "Nasenkugeln", "normal")).toBe(true);
  });

  it("reads an empty store as no progress", () => {
    expect(readState(fakeStore()).progress.size).toBe(0);
  });

  it("reads an empty string as no progress", () => {
    // Distinct from absent: some stores hand back "" rather than null for a key that
    // was never written to real.
    expect(readState(fakeStore({ [PROGRESS_KEY]: "" })).progress.size).toBe(0);
  });

  it("reports whether the write landed", () => {
    expect(writeState(emptyState(), fakeStore())).toBe(true);
  });
});

describe("unreadable stored data", () => {
  // Each case must return no progress rather than throw. A throw here reaches the
  // player as a game that will not start.

  it("starts with defaults when the bytes are not JSON", () => {
    // Control bytes included: a store truncated mid-write leaves whatever was
    // written so far, and a NUL is the likeliest thing to be left behind.
    for (const bad of ["{not json at all", "   ", "\u0000", "\u0001", "{,}", "[1,2", "undefined"]) {
      expect(readState(fakeStore({ [PROGRESS_KEY]: bad })).progress.size, JSON.stringify(bad)).toBe(0);
    }
  });

  it("starts with defaults when the JSON is not an object", () => {
    for (const bad of ["[]", "null", '"a string"', "42", "true"]) {
      expect(readState(fakeStore({ [PROGRESS_KEY]: bad })).progress.size, bad).toBe(0);
    }
  });

  it("starts with defaults when the records field is missing or the wrong shape", () => {
    for (const bad of [
      '{"version":1}',
      '{"version":1,"records":null}',
      '{"version":1,"records":[]}',
      '{"version":1,"records":"nope"}',
      '{"version":1,"records":7}',
    ]) {
      expect(readState(fakeStore({ [PROGRESS_KEY]: bad })).progress.size, bad).toBe(0);
    }
  });

  it("starts with defaults when reading throws", () => {
    // Safari private mode throws on access rather than returning null.
    expect(() => readState(hostileStore("get"))).not.toThrow();
    expect(readState(hostileStore("get")).progress.size).toBe(0);
  });

  it("ignores data written under a different version of the key", () => {
    // The point of the version in the key name: an old shape is left alone and read as
    // absent, rather than half-understood.
    const store = fakeStore({ "cuyo.progress": '{"version":1,"records":{"a normal":{"completed":true,"bestScore":5}}}' });
    expect(readState(store).progress.size).toBe(0);
  });
});

describe("partly unreadable stored data", () => {
  // One bad entry is not a reason to tell a player they have finished nothing.

  it("keeps the good entries and drops only the broken one", () => {
    const stored = JSON.stringify({
      version: 1,
      records: {
        "Kugel normal": { completed: true, bestScore: 900 },
        "Nasenkugeln normal": "not an object",
        "Wachsen normal": null,
        "Gehause normal": 42,
        "Pfeile normal": { completed: true, bestScore: 700 },
      },
    });
    const { progress } = readState(fakeStore({ [PROGRESS_KEY]: stored }));
    expect(bestScoreFor(progress, "Kugel", "normal")).toBe(900);
    expect(bestScoreFor(progress, "Pfeile", "normal")).toBe(700);
    expect(progress.size).toBe(2);
  });

  it("keeps a completion whose score did not survive", () => {
    // A level that was won was won. Losing the number is bad; losing the fact that the
    // player finished it also silently re-locks everything behind it.
    for (const bad of [{ completed: true }, { completed: true, bestScore: "900" }, { completed: true, bestScore: null }]) {
      const stored = JSON.stringify({ version: 1, records: { "Kugel normal": bad } });
      const { progress } = readState(fakeStore({ [PROGRESS_KEY]: stored }));
      expect(isCompleted(progress, "Kugel", "normal"), JSON.stringify(bad)).toBe(true);
      expect(bestScoreFor(progress, "Kugel", "normal")).toBeNull();
    }
  });

  it("drops an entry that claims nothing at all", () => {
    const stored = JSON.stringify({
      version: 1,
      records: { "Kugel normal": { completed: false, bestScore: null } },
    });
    expect(readState(fakeStore({ [PROGRESS_KEY]: stored })).progress.size).toBe(0);
  });

  it("drops a score with no completion, rather than crediting a win", () => {
    // The mirror of the case above: a number without the completed flag is not a win.
    const stored = JSON.stringify({
      version: 1,
      records: { "Kugel normal": { completed: false, bestScore: 900 } },
    });
    const { progress } = readState(fakeStore({ [PROGRESS_KEY]: stored }));
    expect(isCompleted(progress, "Kugel", "normal")).toBe(false);
    expect(completedAtAnyDifficulty(progress, "Kugel")).toBe(false);
  });

  it("ignores a score that is not a finite number", () => {
    // Hand-written rather than built with JSON.stringify, because the values in
    // question cannot be produced by stringify: `Infinity` becomes `null` on the way
    // out, and so does `1e999`. They *can* come back out of `JSON.parse`, which is
    // where a hand-edited or truncated store would leave one — and an Infinity printed
    // on a level card is not a score.
    // `Infinity` is not in this list because JSON has no literal for it: a store
    // containing one fails to parse at all, which the malformed-bytes test above
    // already covers. `1e999` is the interesting one - a perfectly valid number
    // literal that happens to overflow the double it lands in.
    for (const raw of ["1e999", "-1e999"]) {
      const stored =
        `{"version":1,"records":{"Kugel normal":{"completed":true,"bestScore":${raw}}}}`;
      expect(JSON.parse(stored).records["Kugel normal"].bestScore, raw).not.toBeNull();
      const { progress } = readState(fakeStore({ [PROGRESS_KEY]: stored }));
      expect(bestScoreFor(progress, "Kugel", "normal"), raw).toBeNull();
      // Still a completion: the flag survives even though the number did not.
      expect(isCompleted(progress, "Kugel", "normal"), raw).toBe(true);
    }
  });
});

describe("a store that will not take writes", () => {
  it("reports the failure instead of throwing", () => {
    // The score is already in memory, so the worst case is that this session is
    // forgotten. Throwing here would end the session instead.
    expect(() => completeAndStore("Kugel", "normal", 900, hostileStore("set"))).not.toThrow();
  });

  it("still returns the new progress even when it was not stored", () => {
    // The caller shows the result of the level it just finished. Refusing to hand back
    // the progress because the device said no would leave the player looking at a
    // level they just won as if they had not.
    const state = completeAndStore("Kugel", "normal", 900, hostileStore("set"));
    expect(isCompleted(state.progress, "Kugel", "normal")).toBe(true);
  });
});
describe("which introductions have been read", () => {
  it("keeps a seen level across a restart", () => {
    const store = fakeStore();
    markIntroductionSeen("Kugel", store);
    expect(hasSeen(readState(store).seen, "Kugel")).toBe(true);
    expect(hasSeen(readState(store).seen, "Nasenkugeln")).toBe(false);
  });

  it("keeps completions and seen levels in the same write", () => {
    // One blob, one read. Two would also work and fail quietly: a read that took the
    // completions but not the seen levels would re-show every introduction the player
    // had already read, and nothing would say why.
    const store = fakeStore();
    completeAndStore("Kugel", "hard", 700, store);
    markIntroductionSeen("Kugel", store);
    const state = readState(store);
    expect(isCompleted(state.progress, "Kugel", "hard")).toBe(true);
    expect(hasSeen(state.seen, "Kugel")).toBe(true);
  });

  it("does not lose a completion when an introduction is marked", () => {
    // The write that marks seen must not truncate the records, and vice versa.
    const store = fakeStore();
    completeAndStore("Kugel", "normal", 700, store);
    markIntroductionSeen("Kugel", store);
    markIntroductionSeen("Nasenkugeln", store);
    expect(bestScoreFor(readState(store).progress, "Kugel", "normal")).toBe(700);
  });

  it("does not lose a seen level when a completion is recorded", () => {
    const store = fakeStore();
    markIntroductionSeen("Kugel", store);
    completeAndStore("Kugel", "normal", 700, store);
    expect(hasSeen(readState(store).seen, "Kugel")).toBe(true);
  });

  it("reads no seen levels from a document that has none", () => {
    // A store written before this field existed. The version in the key is the same, so
    // this is the case that would break a reader which insisted on the field.
    const stored = JSON.stringify({
      version: 1,
      records: { "Kugel normal": { completed: true, bestScore: 5 } },
    });
    const state = readState(fakeStore({ [PROGRESS_KEY]: stored }));
    expect(state.seen.size).toBe(0);
    expect(isCompleted(state.progress, "Kugel", "normal")).toBe(true);
  });

  it("keeps completions when the seen field is unusable", () => {
    // The two halves are independent facts, so damage to one is not evidence about the
    // other. Reading them together would throw away a player's wins over a stray array.
    for (const bad of [null, 7, "nope", { a: 1 }]) {
      const stored = JSON.stringify({
        version: 1,
        records: { "Kugel normal": { completed: true, bestScore: 900 } },
        seen: bad,
      });
      const state = readState(fakeStore({ [PROGRESS_KEY]: stored }));
      expect(isCompleted(state.progress, "Kugel", "normal"), JSON.stringify(bad)).toBe(
        true,
      );
      expect(state.seen.size, JSON.stringify(bad)).toBe(0);
    }
  });

  it("keeps seen levels when the records are unusable", () => {
    // And the mirror, which matters more: a corrupt records field must not reset which
    // introductions have been read, or every level suddenly introduces itself again.
    const stored = JSON.stringify({
      version: 1,
      records: "not an object",
      seen: ["Kugel", "Nasenkugeln"],
    });
    const state = readState(fakeStore({ [PROGRESS_KEY]: stored }));
    expect(hasSeen(state.seen, "Kugel")).toBe(true);
    expect(hasSeen(state.seen, "Nasenkugeln")).toBe(true);
    expect(state.progress.size).toBe(0);
  });

  it("drops entries in the seen list that are not level ids", () => {
    const stored = JSON.stringify({
      version: 1,
      records: {},
      seen: ["Kugel", 42, null, "", { id: "X" }, ["Nested"], "Nasenkugeln"],
    });
    const state = readState(fakeStore({ [PROGRESS_KEY]: stored }));
    expect([...state.seen]).toEqual(["Kugel", "Nasenkugeln"]);
  });

  it("still returns the new state when the write is refused", () => {
    const state = markIntroductionSeen("Kugel", hostileStore("set"));
    expect(hasSeen(state.seen, "Kugel")).toBe(true);
  });
});
