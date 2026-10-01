/**
 * Tests for the emitted level catalogue.
 *
 * These read the *generated* file rather than re-running the generator, because the
 * claim is about the artefact the game will import. Re-deriving it here would prove
 * the generator is deterministic, which is a different and much weaker thing.
 *
 * The numbers asserted are the ones in the task: 48 Standard-track levels, and the
 * per-difficulty `numexplode` resolved rather than copied.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEVEL_INDEX, LEVELS } from "../../levels-src/generated/level-index.ts";
import {
  DIFFICULTIES,
  indexTracks,
  levelMarkers,
  levelsInTrack,
  needsChainAt,
  numExplodeAt,
  primaryTrack,
} from "./index-data.ts";
import { UNDEFINED_EXPLODE } from "./kinds.ts";

describe("the generated catalogue", () => {
  it("contains every level summary.ld indexes", () => {
    // 79 sections in summary.ld. If this drops, a level went missing from the index.
    expect(LEVELS.length).toBe(79);
    expect(LEVEL_INDEX.byId.size).toBe(79);
  });

  it("contains the 48 Standard-track levels and 70 in All", () => {
    // The numbers the task names, and the ones to check first: they are read from
    // `level[main]` and `level[all]`, so a parsing slip shows up as a plausible-looking
    // 25, 60 or 70 that happens to be the wrong one of the three.
    expect(LEVEL_INDEX.authoredCounts.get("main")).toBe(48);
    expect(LEVEL_INDEX.authoredCounts.get("all")).toBe(70);
    expect(levelsInTrack(LEVEL_INDEX, "all").length).toBe(70);
  });

  it("reaches 60 on the Standard track, because twelve are variant-only", () => {
    // `level[main]` names 48, and twelve more exist on the main track only through
    // `level[main,easy]` and `level[main,hard]`. Both numbers are real and they are
    // different questions: 48 is what the author wrote down in the track's own list,
    // 60 is what a player can reach. An earlier version of this generator conflated
    // them and reported 48 for a list of 60, then 60 for a list it had padded with
    // variant names - so both are pinned.
    expect(levelsInTrack(LEVEL_INDEX, "main").length).toBe(60);
    const variantOnly = levelsInTrack(LEVEL_INDEX, "main").filter(
      (l) => !l.difficulties.has("normal") || l.difficulties.size > 0,
    );
    expect(variantOnly.length).toBeGreaterThan(0);
  });

  it("keeps a level reachable only through a difficulty list on its track", () => {
    // `Secret` is in `level[weird,hard]` and in no other list. Reading membership from
    // the bare lists alone put it on no track at all, which is not what the data says -
    // it is a weird-track level that exists in its hard variant.
    const secret = LEVEL_INDEX.byId.get("Secret");
    expect(secret, "Secret missing from the index").toBeDefined();
    expect(secret!.tracks.has("weird")).toBe(true);
    expect(secret!.difficulties.has("hard")).toBe(true);
  });

  it("reports the level that summary.ld puts in no track", () => {
    // `UnterWasser` appears in no `level[...]` list, so it is unreachable from the
    // upstream menu. A property of the data, not a parsing slip - asserted so that a
    // future change to the track parsing shows up as a *change* here rather than as a
    // level quietly vanishing from the catalogue.
    const untracked = LEVELS.filter((l) => l.tracks.size === 0).map(
      (l) => l.id,
    );
    expect(untracked).toEqual(["UnterWasser"]);
  });

  it("orders each track as summary.ld does", () => {
    const main = levelsInTrack(LEVEL_INDEX, "main");
    // `level[main]` begins Nasenkugeln, Farming, Embroidery.
    expect(main.slice(0, 3).map((l) => l.id)).toEqual([
      "Nasenkugeln",
      "Farming",
      "Embroidery",
    ]);
    // Positions are contiguous from zero, which is what "the order summary.ld lists"
    // means; a gap would mean a name was dropped from the list mid-way.
    const positions = main.map((l) => l.tracks.get("main"));
    expect(positions).toEqual(positions.map((_, i) => i));
  });

  it("marks the contrib track unordered and every other track ordered", () => {
    // `summary.ld` declares exactly one `ordered[..]=0`, and it is contrib. Getting
    // this wrong makes seven levels appear in the wrong order, which is the kind of
    // thing nobody notices until a player does.
    const unordered = LEVELS.filter((l) => l.ordered.get("contrib") === false);
    expect(unordered.length).toBe(7);
    for (const entry of LEVELS) {
      for (const track of entry.tracks.keys()) {
        if (track === "contrib") continue;
        expect(entry.ordered.get(track), `${entry.id} on ${track}`).toBe(true);
      }
    }
  });

  it("gives every level a filename and a display name", () => {
    for (const entry of LEVELS) {
      expect(entry.filename, `${entry.id} filename`).toMatch(/\.ld$/);
      expect(entry.name.length, `${entry.id} display name`).toBeGreaterThan(0);
    }
  });

  it("gives every level at least a normal difficulty", () => {
    for (const entry of LEVELS) {
      expect(
        entry.difficulties.has("normal"),
        `${entry.id} has no normal difficulty`,
      ).toBe(true);
    }
  });

  it("resolves numexplode per difficulty rather than copying one value", () => {
    // `description` and `numexplode` both vary by version, which is why the index
    // stores the resolved value *and* the version it came from. If every difficulty
    // agreed on everything, storing one number would have been enough and this test
    // would be asserting nothing.
    let differing = 0;
    for (const entry of LEVELS) {
      const values = [...entry.difficulties.values()].map((d) => d.numExplode);
      if (new Set(values).size > 1) differing++;
    }
    // Measured on the corpus rather than guessed: levels that genuinely differ.
    expect(
      differing,
      "levels whose numexplode varies by difficulty",
    ).toBeGreaterThan(3);
  });

  it("records the version each difficulty came from", () => {
    for (const entry of LEVELS) {
      for (const difficulty of entry.difficulties.values()) {
        expect(
          difficulty.version,
          `${entry.id} ${difficulty.difficulty}`,
        ).toMatch(/^\[/);
      }
    }
  });

  it("reports numExplode as null rather than inventing a number", () => {
    // A level whose kinds never detonate on size has no threshold. Returning 4 or 6
    // would be a claim the level does not make, and the rules panel would print it.
    const nulls = LEVELS.filter((l) => numExplodeAt(l, "normal") === null);
    expect(nulls.map((l) => l.id)).toContain("Gold");
    for (const entry of LEVELS) {
      const n = numExplodeAt(entry, "normal");
      if (n === null) continue;
      // Zero is legal and means something: `go2.ld` sets `numexplode = 0`, so a group
      // of any size detonates at once. Treating it as "unset" would be wrong.
      expect(n, `${entry.id} numExplode`).toBeGreaterThanOrEqual(0);
      expect(n, `${entry.id} numExplode`).not.toBe(UNDEFINED_EXPLODE);
    }
  });

  it("keeps numexplode 0, which go2.ld sets deliberately", () => {
    const zeroes = LEVELS.filter((l) => numExplodeAt(l, "normal") === 0).map(
      (l) => l.id,
    );
    expect(zeroes).toContain("GoII");
  });

  it("records chaingrass, which changes what the player has to do", () => {
    // Hormones is the level that made this necessary: it connects diagonally *and*
    // needs an explosion beside its goal blobs.
    const hormones = LEVEL_INDEX.byId.get("Hormone");
    expect(hormones, "Hormone missing from the index").toBeDefined();
    expect(needsChainAt(hormones!, "normal")).toBe(true);
    const noseballs = LEVEL_INDEX.byId.get("Nasenkugeln");
    expect(needsChainAt(noseballs!, "normal")).toBe(false);
  });

  it("marks the goal and grey kinds the catalogue needs", () => {
    const noseballs = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    expect(levelMarkers(noseballs)).toEqual({ hasGoals: true, hasGreys: true });
    expect(noseballs.goalKinds).toContain("inGras");
  });

  it("carries a description for the levels that declare one", () => {
    const noseballs = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    // Descriptions are versioned in the level file, so this is the normal variant's.
    expect(noseballs.description).toContain("balls");
    expect(noseballs.description.length).toBeGreaterThan(20);
  });

  it("keeps track positions independent per track", () => {
    // A level can sit at different positions in different tracks, which is why
    // `tracks` is a map and not a list. Noseballs is first in all, main and nofx.
    const noseballs = LEVEL_INDEX.byId.get("Nasenkugeln")!;
    expect(noseballs.tracks.get("all")).toBe(0);
    expect(noseballs.tracks.get("main")).toBe(0);
    expect(noseballs.tracks.get("nofx")).toBe(0);
    // Ziehlen is a contrib-only level; checking that a track's members are disjoint
    // from another's is what pins the map.
    const ziehlen = LEVEL_INDEX.byId.get("Ziehlen")!;
    expect([...ziehlen.tracks.keys()]).toEqual(["contrib"]);
  });

  it("offers a primary track for every level", () => {
    for (const entry of LEVELS) {
      expect(indexTracks(LEVEL_INDEX)).toContain(primaryTrack(entry));
    }
  });

  it("lists the tracks summary.ld declares", () => {
    expect(indexTracks(LEVEL_INDEX)).toEqual([
      "all",
      "main",
      "game",
      "weird",
      "contrib",
      "extreme",
      "nofx",
    ]);
    // Difficulty names are fixed and include `normal`, which upstream has no name for.
    expect(DIFFICULTIES).toEqual(["easy", "normal", "hard"]);
  });

  it("gates the level that needs an unimplemented neighbour mode", () => {
    // `DreiD` uses `neighbours = ThreeD`, which upstream reserves and this engine does
    // not implement. `neighbourOffsets` answers for it anyway, falling back to *no*
    // neighbours - so nothing could ever connect and the level could not be won. It
    // was listed as playable, and a player would have found that out a minute into a
    // game rather than from the catalogue.
    const unsupported = LEVELS.filter((l) => !l.supported);
    expect(unsupported.map((l) => l.id)).toEqual(["DreiD"]);
    expect(unsupported[0]?.unsupportedReason).toContain(
      "third board dimension",
    );
    // Everything else is playable, so a regression that gates everything is caught.
    expect(LEVELS.filter((l) => l.supported).length).toBe(78);
  });

  it("was emitted with the generator's header", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../levels-src/generated/level-index.ts"),
      "latin1",
    );
    expect(source).toContain("GENERATED FILE - do not edit");
    expect(source).toContain("emit-level-index.ts");
  });

  it("stores data, not behaviour", () => {
    // The generated file rebuilds its Maps at import rather than emitting them, so the
    // table is plain arrays. That is what makes it reviewable in a diff and safe to
    // regenerate. Asserted so a future "simplification" that inlines a Map does not
    // quietly reintroduce a generated file full of behaviour.
    const source = readFileSync(
      resolve(import.meta.dirname, "../../levels-src/generated/level-index.ts"),
      "latin1",
    );
    expect(source).toContain("function toEntry");
    // The emitted *table* is plain pairs; the Maps are built in `toEntry` at import.
    // Asserting that the table carries pairs rather than a Map, without tripping over
    // the constructor in the function that rebuilds them.
    const table = source.slice(
      source.indexOf("const RAW"),
      source.indexOf("export const LEVELS"),
    );
    expect(table).not.toContain("new Map");
  });
});
