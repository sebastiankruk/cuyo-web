// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for versioned definitions (task 2.4).
 *
 * The documented cases come from `cual.6`'s VERSIONING section, and the rules
 * themselves from `src/version.cpp`. The interesting one is the redundancy
 * check, where the C++ as written and the C++ as described disagree; see the
 * note at the top of `version.ts` for why the described reading is the one used
 * here. Upstream cannot be built in this environment, so the tests are the
 * oracle, and every rule is pinned in both directions - accepted and rejected.
 */

import { describe, expect, it } from "vitest";
import {
  EXHAUSTIVE,
  MINIMAL_VERSIONS,
  MUTUALLY_EXCLUSIVE,
  TRACKS,
  Version,
  VersionError,
  VersionSet,
  gameVersion,
  isLegal,
} from "./version.ts";

/** A one-player normal-difficulty `main`-track game, plus extras. */
function active(extra: readonly string[] = []): Version {
  return gameVersion({ players: 1, difficulty: "normal", track: "main", extra });
}

/** Builds a set from `name[versions] = value` lines. */
function setOf(lines: readonly (readonly [string, readonly string[]])[]): VersionSet<string> {
  const set = new VersionSet<string>();
  for (const [name, features] of lines) {
    const version = Version.of(...features);
    set.add(name, version, `${name}${version}`);
  }
  return set;
}

/** The value `name` resolves to, or `"<default>"` when there is none. */
function pick(
  set: VersionSet<string>,
  name: string,
  version: Version,
  defaultPresent = true,
): string {
  return set.bestApproximating(name, version, defaultPresent) ?? "<default>";
}

describe("versions", () => {
  it("treats versions as sets, so the order of the specifiers does not matter", () => {
    expect(Version.of("hard", "2").equals(Version.of("2", "hard"))).toBe(true);
    expect(Version.of("2", "hard").key).toBe(Version.of("hard", "2").key);
    expect(Version.of("2", "hard").equals(Version.of("2"))).toBe(false);
  });

  it("refuses the empty string, which is normal difficulty rather than a feature", () => {
    // `schwer_merkmale` contains "", and `stringsetAusCharstern2` drops it.
    expect(() => Version.of("")).toThrow(/not a version feature/);
  });

  it("renders the way upstream's error messages expect", () => {
    // `setToString`: sorted, bracketed, and nothing at all when empty.
    expect(Version.of("hard", "2", "main").toString()).toBe("[2,hard,main]");
    expect(Version.empty.toString()).toBe("");
  });

  it("keeps a prefix feature and a longer one apart", () => {
    // A real hazard once versions become map keys: {a, b} must not collide
    // with {ab}, which is what the NUL separator in the key is for.
    expect(Version.of("a", "b").key).not.toBe(Version.of("ab").key);
  });

  it("builds the version a game is played in from its settings", () => {
    expect(
      gameVersion({ players: 2, difficulty: "hard", track: "weird" }).toString(),
    ).toBe("[2,hard,weird]");
    // Normal difficulty is the absence of a feature, not one.
    expect(
      gameVersion({ players: 1, difficulty: "normal", track: "main" }).toString(),
    ).toBe("[1,main]");
    // `--version=hard,geek` adds a feature of its own.
    expect(
      gameVersion({
        players: 1,
        difficulty: "hard",
        track: "main",
        extra: ["geek"],
      }).toString(),
    ).toBe("[1,geek,hard,main]");
  });
});

describe("the dimensions", () => {
  it("makes difficulty mutually exclusive but not exhaustive", () => {
    expect(MUTUALLY_EXCLUSIVE).toEqual([["easy", "hard"]]);
    // Normal difficulty exists without a feature, so a version need not name
    // one - which is what keeps `easy` and `hard` out of the exhaustiveness
    // check.
    expect(EXHAUSTIVE.some((d) => d.includes("hard"))).toBe(false);
  });

  it("makes the player count and the level tracks exhaustive", () => {
    expect(EXHAUSTIVE[0]).toEqual(["1", "2"]);
    expect(EXHAUSTIVE[1]).toEqual(TRACKS);
    expect(TRACKS).toHaveLength(7);
  });

  it("rejects a version naming two values of one dimension", () => {
    expect(isLegal(Version.of("1", "main"))).toBe(true);
    expect(isLegal(Version.of("easy", "main"))).toBe(true);
    expect(isLegal(Version.of("hard"))).toBe(true);
    // Both sides of every rule in the man page.
    expect(isLegal(Version.of("easy", "hard"))).toBe(false);
    expect(isLegal(Version.of("1", "2"))).toBe(false);
    expect(isLegal(Version.of("main", "all"))).toBe(false);
  });

  it("enumerates one minimal superlegal version per player count and track", () => {
    // 2 players x 7 tracks. Difficulty is left out on purpose: each superlegal
    // version is a superset of one of these, and coverage is monotone.
    expect(MINIMAL_VERSIONS).toHaveLength(14);
    for (const v of MINIMAL_VERSIONS) expect(isLegal(v)).toBe(true);
  });
});

describe("the man page's examples", () => {
  //   numexplode = 8
  //   numexplode[2] = 6
  //   numexplode[1,hard] = 10
  const manPage = (): VersionSet<string> =>
    setOf([
      ["numexplode", []],
      ["numexplode", ["2"]],
      ["numexplode", ["1", "hard"]],
    ]);

  it("uses the unqualified definition in one-player mode", () => {
    expect(pick(manPage(), "numexplode", active())).toBe("numexplode");
  });

  it("uses the [2] definition in two-player mode", () => {
    const two = gameVersion({ players: 2, difficulty: "normal", track: "main" });
    expect(pick(manPage(), "numexplode", two)).toBe("numexplode[2]");
  });

  it("uses the [1,hard] definition in one-player hard mode", () => {
    const hard = gameVersion({ players: 1, difficulty: "hard", track: "main" });
    expect(pick(manPage(), "numexplode", hard)).toBe("numexplode[1,hard]");
  });

  it("lets [2] apply to two-player hard mode, which has no definition of its own", () => {
    // "A given version also applies to every more specialized version, for which
    //  no definition is given."
    const twoHard = gameVersion({ players: 2, difficulty: "hard", track: "main" });
    expect(pick(manPage(), "numexplode", twoHard)).toBe("numexplode[2]");
    const twoEasy = gameVersion({ players: 2, difficulty: "easy", track: "main" });
    expect(pick(manPage(), "numexplode", twoEasy)).toBe("numexplode[2]");
  });

  it("lets a general definition apply where only a specialised one is defined", () => {
    // "WHEN a level defines only numexplode[2] = 6 and the game is running in
    //  two-player hard mode THEN the value is 6."
    const set = setOf([["numexplode", ["2"]]]);
    const twoHard = gameVersion({ players: 2, difficulty: "hard", track: "main" });
    expect(pick(set, "numexplode", twoHard)).toBe("numexplode[2]");
    // And nothing applies in one-player mode, so the caller's default stands in.
    expect(pick(set, "numexplode", active(), true)).toBe("<default>");
  });

  it("prefers the most specific of several applicable definitions", () => {
    const set = setOf([
      ["numexplode", []],
      ["numexplode", ["2"]],
      ["numexplode", ["2", "hard"]],
    ]);
    const twoHard = gameVersion({ players: 2, difficulty: "hard", track: "main" });
    expect(pick(set, "numexplode", twoHard)).toBe("numexplode[2,hard]");
  });

  it("ignores a definition whose features the game does not have", () => {
    // `[contrib]` is a level track, so it cannot apply while playing `main`.
    const set = setOf([
      ["numexplode", []],
      ["numexplode", ["contrib"]],
    ]);
    expect(pick(set, "numexplode", active())).toBe("numexplode");
  });

  it("applies a level-track definition when that track is being played", () => {
    const set = setOf([
      ["numexplode", []],
      ["numexplode", ["contrib"]],
    ]);
    const contrib = gameVersion({
      players: 1,
      difficulty: "normal",
      track: "contrib",
    });
    expect(pick(set, "numexplode", contrib)).toBe("numexplode[contrib]");
  });
});

describe("mutual exclusion and exhaustiveness", () => {
  it("needs no joint definition for two mutually exclusive dimensions", () => {
    // "Cuyo knows that easy and hard exclude each other. Consequently, it is
    //  unnecessary (and indeed prohibited) to give an [easy,hard] definition,
    //  even if both [easy] and [hard] are given."
    const set = setOf([
      ["numexplode", []],
      ["numexplode", ["easy"]],
      ["numexplode", ["hard"]],
    ]);
    const easy = gameVersion({ players: 1, difficulty: "easy", track: "main" });
    const hard = gameVersion({ players: 1, difficulty: "hard", track: "main" });
    expect(pick(set, "numexplode", easy)).toBe("numexplode[easy]");
    expect(pick(set, "numexplode", hard)).toBe("numexplode[hard]");
    expect(pick(set, "numexplode", active())).toBe("numexplode");
  });

  it("rejects an [easy,hard] definition outright", () => {
    const set = setOf([
      ["numexplode", []],
      ["numexplode", ["easy", "hard"]],
    ]);
    expect(() => pick(set, "numexplode", active())).toThrow(
      /Illegal version numexplode\[easy,hard\]/,
    );
  });

  it("needs no unqualified definition when both player counts are given", () => {
    // "if there are definitions for both, it is unnecessary, (and again
    //  illegal) also to define a version without any of both."
    // This is `baender.ld`, which ships exactly this and no default.
    const set = setOf([
      ["numexplode", ["1"]],
      ["numexplode", ["2"]],
    ]);
    const two = gameVersion({ players: 2, difficulty: "normal", track: "main" });
    expect(pick(set, "numexplode", active(), false)).toBe("numexplode[1]");
    expect(pick(set, "numexplode", two, false)).toBe("numexplode[2]");
  });

  it("rejects a name that is not defined for every version", () => {
    // Only the `main` track is defined and there is no default, so playing
    // `contrib` has nothing to fall back on.
    const set = setOf([["name", ["main"]]]);
    // Which of the fourteen is named first depends on the order the
    // dimensions are enumerated in, so the assertion is on the shape.
    expect(() => set.checkWellFormed("name", false)).toThrow(
      /^name lacks version name\[1,[a-z]+\]$/,
    );
    // With a default the empty version covers all fourteen. A second set,
    // because the first check left its stamp behind.
    expect(() => setOf([["name", ["main"]]]).checkWellFormed("name", true)).not.toThrow();
  });

  it("says a required name is not defined rather than returning nothing", () => {
    const strict = new VersionSet<string>();
    expect(() => strict.bestApproximating("name", active(), false)).toThrow(
      /name required but not defined/,
    );
    // A separate set, because the failed check left a stamp behind - see
    // "refuses a version added after a failed check" below.
    const lenient = new VersionSet<string>();
    expect(lenient.bestApproximating("name", active(), true)).toBeUndefined();
  });
});

describe("ambiguity", () => {
  it("rejects [2] and [hard] without a [2,hard]", () => {
    // "All resulting conflicts must be resolved. For example, if you make a
    //  definition for [2] and one for [hard], you must also make a definition for
    //  [2,hard]."
    const set = setOf([
      ["numexplode", ["2"]],
      ["numexplode", ["hard"]],
    ]);
    expect(() => pick(set, "numexplode", active())).toThrow(
      /numexplode\[2,hard\] not uniquely defined/,
    );
  });

  it("accepts the joint definition the man page asks for, in either order", () => {
    for (const joint of [["2", "hard"], ["hard", "2"]]) {
      const set = setOf([
        ["numexplode", ["2"]],
        ["numexplode", ["hard"]],
        ["numexplode", joint],
      ]);
      const twoHard = gameVersion({
        players: 2,
        difficulty: "hard",
        track: "main",
      });
      expect(pick(set, "numexplode", twoHard)).toBe(
        `numexplode${Version.of(...joint)}`,
      );
    }
  });

  it("does not demand a joint definition when the union would be illegal", () => {
    // [1] and [2] cannot both apply, so [1,2] is not something one can be asked
    // to write and there is nothing to resolve.
    const set = setOf([
      ["numexplode", ["1"]],
      ["numexplode", ["2"]],
    ]);
    expect(() => set.checkWellFormed("numexplode", true)).not.toThrow();
  });

  it("accepts either order of the two specifiers as the same version", () => {
    const set = setOf([["numexplode", ["2", "hard"]]]);
    // Adding the same version again, spelled the other way round, collides.
    expect(() => set.add("numexplode", Version.of("hard", "2"), "x")).toThrow(
      /"numexplode" already defined/,
    );
  });

  it("accepts summary.ld's own `level` set, twelve versions and no default", () => {
    // The most intricate version set upstream ships, transcribed from
    // `summary.ld:403-540`. It is the shape that decides whether the mutual
    // exclusion rules were understood: [easy,main] and [hard,main] may sit
    // beside [main] because no version is ever both easy and hard, and
    // [main,easy] is not a subset of any difficulty-free play, so [main] is
    // still needed.
    const set = setOf([
      ["level", ["all"]],
      ["level", ["contrib"]],
      ["level", ["easy", "main"]],
      ["level", ["easy", "nofx"]],
      ["level", ["easy", "weird"]],
      ["level", ["extreme"]],
      ["level", ["game"]],
      ["level", ["hard", "main"]],
      ["level", ["hard", "weird"]],
      ["level", ["main"]],
      ["level", ["nofx"]],
      ["level", ["weird"]],
    ]);
    expect(() => set.checkWellFormed("level", false)).not.toThrow();

    // Each track is answered by its own definition, and the difficulty variants
    // where summary.ld bothered to write them.
    const at = (players: 1 | 2, difficulty: "easy" | "normal" | "hard", track: string): string =>
      pick(set, "level", gameVersion({ players, difficulty, track }));
    expect(at(1, "normal", "main")).toBe("level[main]");
    expect(at(1, "easy", "main")).toBe("level[easy,main]");
    expect(at(2, "hard", "weird")).toBe("level[hard,weird]");
    expect(at(2, "normal", "contrib")).toBe("level[contrib]");
  });

  it("rejects an unqualified version that the track variants already cover", () => {
    // The same set with a plain `level = ...` added. Every play now has a track
    // that names itself, so the unqualified definition is dead weight - and
    // because the level track is exhaustive, an unqualified one is also
    // forbidden outright.
    const lines: [string, readonly string[]][] = [["level", []]];
    for (const track of TRACKS) lines.push(["level", [track]]);
    const set = setOf(lines);
    expect(() => set.checkWellFormed("level", true)).toThrow(
      /^level eclipsed by more specialized versions$/,
    );
  });
});

describe("redundancy", () => {
  it("accepts [1] and [2] side by side, which is the corpus's commonest shape", () => {
    // `baender.ld` and `labskaus.ld` both ship this with no unqualified
    // definition. The two-player definitions are not reachable from a
    // one-player play, so nothing eclipses anything - and that is only true
    // because the check is a conjunction over the enumeration. Read as an
    // `any`, this pair would be rejected. See the note in `version.ts`.
    const set = setOf([
      ["numexplode", ["1"]],
      ["numexplode", ["2"]],
    ]);
    expect(() => set.checkWellFormed("numexplode", true)).not.toThrow();
  });

  it("accepts [1] when some other track still needs the unqualified version", () => {
    const set = setOf([
      ["numexplode", ["1", "main"]],
      ["numexplode", ["1", "all"]],
    ]);
    // `main` and `all` are both defined for one player, but `contrib` is not, so
    // [1] is the only thing that can decide those plays.
    expect(() => set.checkWellFormed("numexplode", true)).not.toThrow();
  });

  it("rejects [1] once every one-player track is defined by itself", () => {
    // Now [1] could never be selected: whichever track is being played, a more
    // specific definition answers, and two-player plays have the default. That
    // is a mistake worth reporting - and it is the one case where the C++ as
    // written and the C++ as described part company, since the written code
    // demands that the two-player plays be covered too and so finds nothing.
    const lines: [string, readonly string[]][] = [["numexplode", ["1"]]];
    for (const track of TRACKS) lines.push(["numexplode", ["1", track]]);
    const set = setOf(lines);
    expect(() => set.checkWellFormed("numexplode", true)).toThrow(
      /numexplode\[1\] eclipsed by more specialized versions/,
    );
  });

  it("rejects an unqualified version covered by both player counts", () => {
    const lines: [string, readonly string[]][] = [["numexplode", []]];
    for (const players of ["1", "2"]) {
      for (const track of TRACKS) lines.push(["numexplode", [players, track]]);
    }
    const set = setOf(lines);
    expect(() => set.checkWellFormed("numexplode", true)).toThrow(
      /numexplode eclipsed by more specialized versions/,
    );
  });

  it("accepts a default that the exhaustive dimensions still need", () => {
    // One player is covered by [1] alone, but the unqualified version is still
    // what two-player plays get, so it is not eclipsed.
    const set = setOf([
      ["numexplode", []],
      ["numexplode", ["1"]],
    ]);
    expect(() => set.checkWellFormed("numexplode", true)).not.toThrow();
  });
});

describe("entries are frozen by the first lookup", () => {
  it("refuses a version added after the name has been read", () => {
    // The man page's first constraint: "All versions of a definition must be
    // made before the first use of the thing defined."
    const set = setOf([["numexplode", []]]);
    expect(pick(set, "numexplode", active())).toBe("numexplode");
    expect(() => set.add("numexplode", Version.of("2"), "late")).toThrow(
      /numexplode was already accessed, new version numexplode\[2\] is not allowed/,
    );
  });

  it("refuses a version added after a failed check", () => {
    const set = setOf([
      ["numexplode", ["2"]],
      ["numexplode", ["hard"]],
    ]);
    expect(() => set.checkWellFormed("numexplode", true)).toThrow();
    expect(() => set.checkWellFormed("numexplode", true)).toThrow(
      /Previous problem with numexplode still persists/,
    );
    expect(() => set.add("numexplode", Version.of("2", "hard"), "late")).toThrow(
      /already accessed/,
    );
  });

  it("leaves other names alone", () => {
    const set = setOf([["numexplode", []]]);
    pick(set, "numexplode", active());
    expect(() => set.add("toptime", Version.of("hard"), "toptime[hard]")).not.toThrow();
  });
});

describe("error reporting", () => {
  it("names the definition that caused the problem", () => {
    const set = setOf([
      ["numexplode", ["2"]],
      ["numexplode", ["hard"]],
    ]);
    let caught: unknown;
    try {
      set.checkWellFormed("numexplode", true);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(VersionError);
    expect((caught as VersionError).key).toBe("numexplode");
  });
});
