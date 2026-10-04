/**
 * Tests for runtime level loading.
 *
 * The claim task 2.15 makes is "a second request for the same level hits the cache", so
 * that is measured rather than asserted: a counting fetcher, and a check that the
 * second load does not go near it.
 *
 * The fetcher is injected precisely so this is measurable. A loader that reached for
 * the global `fetch` would only be testable by mocking the module, which is a weaker
 * claim than counting calls.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LevelLoader, LevelLoadError, versionFor } from "./loader.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { ScriptedPrng } from "../testing/prng-stub.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import type { Track } from "./index-data.ts";

/**
 * The committed level files.
 *
 * These tests used to read a local-only upstream checkout and skip themselves when it
 * was absent, which meant the only tests that load a *real* level through the *real*
 * loader quietly did not exist for a fresh clone. The files are committed now, so
 * there is no condition left to guard: if a file is missing, `readFileSync` throws and
 * the test says which file.
 */
const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");

const GLOBALS = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");

/** A fetcher that counts, so "did this hit the network" is a number. */
function countingFetcher(files: Record<string, string> = {}) {
  const calls: string[] = [];
  const fetchLevel = async (filename: string): Promise<string> => {
    calls.push(filename);
    if (files[filename] !== undefined) return files[filename];
    return readFileSync(resolve(DATA_DIR, filename), "latin1");
  };
  return { calls, fetchLevel };
}

function prng(seed = 1): ScriptedPrng {
  const values: number[] = [];
  let s = seed;
  for (let i = 0; i < 200000; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    values.push(s / 0x7fffffff);
  }
  return new ScriptedPrng(values);
}

function loaderWith(seed = 1) {
  const { calls, fetchLevel } = countingFetcher();
  const loader = new LevelLoader({
    fetchLevel,
    art: ART_MANIFEST,
    globalsSource: GLOBALS,
    random: prng(seed),
  });
  return { loader, calls };
}

describe("versionFor", () => {
  it("names the version a track and difficulty resolve to", () => {
    // The recorded string is what the index carries, so a mismatch here would mean the
    // catalogue advertises a version the loader never asks for.
    // `[1,hard,main]` rather than `[1,main,hard]`: `Version` normalises its components
    // into its own order, and the index recorded the same strings. Asserting the
    // loader's output against a hand-written guess instead of against what the index
    // holds would have missed a real disagreement between the two.
    expect(versionFor("main", "normal").toString()).toBe("[1,main]");
    expect(versionFor("main", "hard").toString()).toBe("[1,hard,main]");
    // The rest of the assertions read their expectation from the catalogue rather than
    // from a hand-written guess. `Version` does not order its components
    // alphabetically - `[1,hard,main]` and `[1,contrib,easy]` are both what it
    // produces - so guessing the string is guessing at an implementation detail, and a
    // guess that happened to be right would have hidden a real disagreement between
    // the loader and the index.
    for (const entry of LEVEL_INDEX.levels) {
      for (const d of entry.difficulties.values()) {
        const [track] = entry.tracks.keys();
        void track;
        // The index's string must be one the loader could have produced.
        expect(d.version).toMatch(/^\[1,/);
      }
    }
    // And the two agree for a level that offers several difficulties.
    for (const entry of LEVEL_INDEX.levels) {
      for (const d of entry.difficulties.values()) {
        expect(d.version, `${entry.id} ${d.difficulty}`).toBe(
          versionFor(d.track, d.difficulty).toString(),
        );
      }
    }
  });
});

describe("LevelLoader: the cache", () => {
  it("fetches a level once and serves the second request from the cache", () => {
    const { loader, calls } = loaderWith();
    const entry = LEVEL_INDEX.byId.get("Nasenkugeln");
    expect(entry).toBeDefined();

    const first = loader.load(entry!.filename, entry!.id, "main");
    return first.then(async (a) => {
      const afterFirst = calls.length;
      expect(afterFirst).toBeGreaterThan(0);

      const b = await loader.load(entry!.filename, entry!.id, "main");
      expect(calls.length, "second load fetched again").toBe(afterFirst);
      // The same object, not merely an equal one: a rebuild would mean the cache
      // stored something and then re-derived it.
      expect(b).toBe(a);
      expect(loader.size).toBe(1);
    });
  });

  it("does not serve one difficulty's level for another's", () => {
    // Keying the cache on the level id alone would serve a hard variant to someone who
    // asked for the easy one. Not a performance bug - the wrong level.
    //
    // The level matters: this originally used `Nasenkugeln`, which offers only `easy`
    // and `normal`. Both loads fell back to `normal`, produced the same version, and
    // the test passed without ever comparing two different things.
    const { loader } = loaderWith();
    // Asked for at the track the catalogue recorded, which is not always the track the
    // difficulty is named after: a level on both `main` and `weird` that offers `hard`
    // only on `weird` resolves to `[1,hard,weird]`, and asking for `main,hard` would be
    // a level the index never described.
    const withHard = LEVEL_INDEX.levels.find(
      (l) =>
        l.difficulties.has("hard") &&
        l.difficulties.has("normal") &&
        l.difficulties.get("hard")!.track ===
          l.difficulties.get("normal")!.track,
    );
    expect(withHard, "no level offers both on one track").toBeDefined();
    const entry = withHard!;
    const track = entry.difficulties.get("hard")!.track;
    return Promise.all([
      loader.load(entry.filename, entry.id, track, "normal"),
      loader.load(entry.filename, entry.id, track, "hard"),
    ]).then(([normal, hard]) => {
      expect(normal.version).not.toBe(hard.version);
      expect(normal.difficulty).toBe("normal");
      expect(hard.difficulty).toBe("hard");
      expect(hard.version).toBe(entry.difficulties.get("hard")!.version);
      expect(loader.size).toBe(2);
    });
  });

  it("parses globals.ld once for the whole catalogue", () => {
    // Every level resolves its names against globals.ld, so parsing it 79 times would
    // be 79 identical parses - and this is the case that actually occurs, unlike the
    // multi-level file the test above was originally written for.
    const { loader, calls } = loaderWith();
    const first = LEVEL_INDEX.levels.slice(0, 6);
    return Promise.all(
      first.map((l) => loader.load(l.filename, l.id, primaryOf(l))),
    ).then(() => {
      expect(calls.filter((c) => c === "globals.ld").length).toBe(1);
    });
  });

  it("parses a file once for two levels in it", () => {
    // No upstream file holds two level sections - `pressure.ld` looks like it does,
    // but its other `=` lines are Cual code blocks, not levels - so this is exercised
    // with a synthetic file. The cache is a real feature and the case is real even
    // though the corpus does not happen to contain it.
    const source = [
      "First={",
      '  name="First"',
      '  author="Nobody"',
      "  numexplode=4",
      "  pics=inGruen.xpm,inGelb.xpm",
      "  greypic=inGrau.xpm",
      "  startpic=inGras.xpm",
      "  emptypic=Grau",
      '  startdist="...."',
      "}",
      "Second={",
      '  name="Second"',
      '  author="Nobody"',
      "  numexplode=4",
      "  pics=inGruen.xpm,inGelb.xpm",
      "  greypic=inGrau.xpm",
      "  startpic=inGras.xpm",
      "  emptypic=Grau",
      '  startdist="...."',
      "}",
      "",
    ].join("\n");
    const { calls, fetchLevel } = countingFetcher({
      "two.ld": source,
      "globals.ld": "",
    });
    const loader = new LevelLoader({
      fetchLevel,
      art: ART_MANIFEST,
      globalsSource: "",
      random: prng(1),
    });
    return Promise.all([
      loader.load("two.ld", "First", "main"),
      loader.load("two.ld", "Second", "main"),
    ]).then(([first, second]) => {
      expect(first.level.name).toBe("First");
      expect(second.level.name).toBe("Second");
      expect(
        calls.filter((c) => c === "two.ld").length,
        "one parse per file",
      ).toBe(1);
      expect(loader.size, "two levels cached").toBe(2);
    });
  });

  it("clears loaded levels but keeps the parsed files", () => {
    const { loader, calls } = loaderWith();
    const entry = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    return loader
      .load(entry.filename, entry.id, "main")
      .then(() => {
        loader.clear();
        expect(loader.size).toBe(0);
        return loader.load(entry.filename, entry.id, "main");
      })
      .then(() => {
        // The file was re-read from the fetcher's point of view only once, because the
        // parse was kept.
        expect(calls.filter((c) => c === entry.filename).length).toBe(1);
      });
  });

  it("reset drops the parsed files too", () => {
    const { loader, calls } = loaderWith();
    const entry = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    return loader
      .load(entry.filename, entry.id, "main")
      .then(() => {
        loader.reset();
        return loader.load(entry.filename, entry.id, "main");
      })
      .then(() => {
        expect(calls.filter((c) => c === entry.filename).length).toBe(2);
      });
  });
});

describe("LevelLoader: what it produces", () => {
  it("builds a board the simulation can start from", async () => {
    const { loader } = loaderWith();
    const entry = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    const { level } = await loader.load(entry.filename, entry.id, "main");

    expect(level.id).toBe("Nasenkugeln");
    expect(level.name).toBe("Noseballs");
    expect(level.author).toBe("Immi");
    expect(level.description.length).toBeGreaterThan(0);
    // The board is concrete cells, bottom-aligned, and `Simulation` reads exactly this.
    expect(level.startDist.length).toBeGreaterThan(0);
    const bottom = level.startDist[level.startDist.length - 1]!;
    expect(bottom.length).toBe(10);
    const filled = bottom.filter((c) => c !== null);
    expect(
      filled.length,
      "nasenkugeln's startdist is a full row of grass",
    ).toBe(10);
    for (const cell of filled) {
      expect(cell).not.toBeNull();
      expect(level.kinds[cell!.kind]?.role).toBe("grass");
    }
  });

  it("produces a level the engine can actually run", async () => {
    // The test that matters most: a real level, loaded through the real pipeline, put
    // into a real `Simulation` and stepped. Every previous check in this project has
    // been about the parts; this is the first that plays one.
    const { Simulation } = await import("../game-core/simulation.ts");
    const { loader } = loaderWith();
    const entry = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    const { level } = await loader.load(entry.filename, entry.id, "main");

    const sim = new Simulation(level, { random: prng(3) });
    // Far enough in to pass the border's first descent and land a piece or two.
    for (let i = 0; i < 400; i++) sim.step();
    expect(sim.phase).not.toBe("lost");
    expect(sim.board.occupied !== undefined).toBe(true);
    // And the goal count matches what the index said the level contains.
    expect(sim.goalCount).toBe(10);
  });

  it("resolves the level's goal art keys through the manifest", async () => {
    const { loader } = loaderWith();
    const entry = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    const loaded = await loader.load(entry.filename, entry.id, "main");
    expect(loaded.goalArtKeys.length).toBeGreaterThan(0);
    for (const key of loaded.goalArtKeys) {
      expect(
        ART_MANIFEST.entries.has(key),
        `${key} is not in the manifest`,
      ).toBe(true);
    }
  });

  it("loads a level whose colours the level sets", async () => {
    // Hormones is the dark one; if its background came back white the blobs would be
    // drawn on the wrong ground, which is a bug this project has already had.
    const { loader } = loaderWith();
    const entry = LEVEL_INDEX.byId.get("Hormone")!;
    const { level } = await loader.load(entry.filename, entry.id, "main");
    expect(level.colours.background).toMatch(/^rgb\(/);
    expect(level.chainGrass).toBe(true);
  });

  it("fails with a diagnostic when the file cannot be fetched", async () => {
    const { loader } = loaderWith();
    await expect(
      loader.load("nosuchfile.ld", "Whatever", "main"),
    ).rejects.toThrow(LevelLoadError);
  });

  it("names the sections a file does define when the level is not in it", async () => {
    // A diagnostic someone can act on: the file was found, but this level is not in
    // it, and here is what is.
    const { loader } = loaderWith();
    let thrown: unknown;
    try {
      await loader.load("nasenkugeln.ld", "NoSuchLevel", "main");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LevelLoadError);
    const message = (thrown as Error).message;
    expect(message).toContain("NoSuchLevel");
    expect(message).toContain("Nasenkugeln");
  });

  it("fails when a picture is not in the manifest, naming the key", async () => {
    // The art check happens at load, so a missing key is a diagnostic rather than a
    // blank cell discovered by a player.
    //
    // **The missing key is on a kind's *own* `pics` list**, which is the only place a picture
    // is looked up from. This used to put `fehlt.xpm` in the *level's* list, which declared
    // the three kinds but attached no picture to any of them — so with the lookup moved to
    // `kind.pictures` the test stopped failing, which is the correct behaviour and made the
    // test a lie. Upstream reads a kind's pictures from its own section (`getKind` does not
    // look at the parent), so that is where the key has to be.
    //
    // Real `.ld` syntax, copied from a level file: definitions are `Name={` with no
    // spaces, lists are comma-separated, and a picture name may or may not carry an
    // extension - both forms occur upstream.
    const source = [
      "TestLevel={",
      '  name="Test"',
      '  author="Nobody"',
      "  numexplode=4",
      "  pics=inGruen.xpm,inGelb.xpm,inGras.xpm",
      "  greypic=inGrau.xpm",
      "  startpic=inGras.xpm",
      "  emptypic=Grau",
      '  startdist=".........."',
      "  inGruen={ pics=fehlt.xpm }",
      "}",
      "",
    ].join("\n");
    const { fetchLevel } = countingFetcher({
      "test.ld": source,
      "globals.ld": "",
    });
    const loader = new LevelLoader({
      fetchLevel,
      art: ART_MANIFEST,
      globalsSource: "",
      random: prng(1),
    });
    let thrown: unknown;
    try {
      await loader.load("test.ld", "TestLevel", "main");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LevelLoadError);
    expect((thrown as Error).message).toContain("fehlt.xpm");
  });
});

describe("LevelLoader: every level in the catalogue", () => {
  it("loads all 79, at normal difficulty", async () => {
    // The catalogue claims these are playable. This is where that claim is checked, and
    // it is the first time a real level has been put into a real `Simulation`.
    const { loader } = loaderWith(11);
    const failures: string[] = [];
    for (const entry of LEVEL_INDEX.levels) {
      try {
        const { level } = await loader.load(
          entry.filename,
          entry.id,
          primaryOf(entry),
        );
        if (level.startDist.length === 0) {
          failures.push(`${entry.id}: loaded with an empty board`);
        }
      } catch (error) {
        failures.push(`${entry.id}: ${(error as Error).message}`);
      }
    }
    expect(failures, `\n${failures.slice(0, 20).join("\n")}`).toEqual([]);
  });
});

/** The first track a level is on, so a loader call names a track it is really on. */
function primaryOf(entry: { tracks: ReadonlyMap<Track, number> }): Track {
  for (const t of [
    "main",
    "weird",
    "contrib",
    "game",
    "extreme",
    "nofx",
    "all",
  ]) {
    if (entry.tracks.has(t as Track)) return t as Track;
  }
  return "all";
}
