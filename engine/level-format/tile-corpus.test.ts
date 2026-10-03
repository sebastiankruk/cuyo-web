/**
 * Every catalogue tile matches the level it sits on, and every level in the corpus.
 *
 * This is the verification task 6.7 names — "verify a tile matches the level it opens" —
 * and it is the reason the tile is built by the engine's own `buildStartLayout` at index
 * time rather than drawn from the `startdist` keys.
 *
 * **It goes through `LevelLoader`, not around it.** The claim is about what a card
 * opens, so the thing that opens it is what the test drives: a real `LevelLoader` over
 * the committed level files, constructed with `TILE_REFERENCE_SEED` as its PRNG. A test
 * that re-derived the layout itself would be checking the generator against a second
 * implementation of itself, and the two could agree while both disagreed with the game.
 *
 * **What "matches" can and cannot mean, stated once here.** `app/levels.ts` seeds the
 * game's PRNG from `Date.now()`, on purpose, so a restart is not the board the player has
 * already seen. The tile is therefore *not* the board the next play will produce, and no
 * test can make it so without changing that decision. Under the same seed it is exactly
 * the loader's own board, which is the strongest claim available and the one that
 * catches the failures that matter:
 *
 *  - a tile attached to the wrong level, or the wrong difficulty of the right level;
 *  - a tile left behind by a `.ld` edit, since the loader reads the file as committed;
 *  - a layout the engine's neighbour-avoidance heuristic would never produce;
 *  - colours chosen against a background other than the level's own, which is the
 *    "the blob is there and cannot be seen" defect `render/palette.ts` warns about.
 *
 * The random cells are a second, weaker claim and are tested as one: every drawn cell
 * must be a kind its own pool permits. That is what makes the tile "one legal start"
 * rather than an arbitrary picture.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LevelLoader } from "./loader.ts";
import { parseLd } from "./parser.ts";
import { DefinitionScope, rootScope } from "./scope.ts";
import { buildKinds } from "./kinds.ts";
import { kindDefaultsFrom, readLevelSettings } from "./settings.ts";
import { readStartDist } from "./startdist.ts";
import { buildStartLayout } from "./startlayout.ts";
import type { Difficulty, Track } from "./index-data.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { LEVEL_INDEX } from "../../levels-src/generated/level-index.ts";
import { TILE_REFERENCE_SEED } from "./index-data.ts";
import type { LevelTile } from "./index-data.ts";
import { createPrng } from "../prng.ts";
import { buildPalette } from "../../render/palette.ts";
import { tileCells } from "../../render/tile.ts";
import { GRX, GRY } from "../game-core/constants.ts";
import type { KindRole } from "./level-data.ts";
import { versionFor } from "./loader.ts";

const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");
const GLOBALS = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");

/**
 * A loader over the committed files, seeded the way a tile is.
 *
 * A fresh loader per call: `LevelLoader` caches by filename, and a cached board from an
 * earlier difficulty would make every comparison after the first vacuous.
 */
function loaderAtReferenceSeed(): LevelLoader {
  return new LevelLoader({
    fetchLevel: async (filename) => readFileSync(resolve(DATA_DIR, filename), "latin1"),
    art: ART_MANIFEST,
    globalsSource: GLOBALS,
    random: createPrng(TILE_REFERENCE_SEED),
  });
}

/** The tile as a sparse board, for comparison against a loader's rows. */
function tileAsBoard(tile: LevelTile): (number | null)[][] {
  const board: (number | null)[][] = Array.from({ length: GRY }, () =>
    Array.from({ length: GRX }, (): number | null => null),
  );
  for (let i = 0; i < tile.at.length; i++) {
    const at = tile.at[i] as number;
    board[Math.floor(at / GRX)]![at % GRX] = tile.kind[i] as number;
  }
  return board;
}

/** Every difficulty of every level, flattened, as the catalogue addresses them. */
function everyDifficulty() {
  return LEVEL_INDEX.levels.flatMap((entry) =>
    [...entry.difficulties.values()].map((difficulty) => ({ entry, difficulty })),
  );
}

describe("a tile is the board its level opens as", () => {
  it("for every level and difficulty in the corpus", async () => {
    const mismatches: string[] = [];
    let compared = 0;
    let filled = 0;

    for (const { entry, difficulty } of everyDifficulty()) {
      const loaded = await loaderAtReferenceSeed().load(
        entry.filename,
        entry.id,
        difficulty.track,
        difficulty.difficulty,
      );
      // `startDist` is the concrete board, not the declared keys — `LevelLoader` resolves
      // the pool draws and applies the neighbour heuristic before building it. Comparing
      // against it is the whole point.
      const expected = tileAsBoard(difficulty.tile);
      let row = 0;
      for (const cells of loaded.level.startDist) {
        for (let x = 0; x < GRX; x++) {
          const want = expected[row]?.[x] ?? null;
          const got = cells[x]?.kind ?? null;
          if (want !== got) {
            mismatches.push(
              `${entry.id}/${difficulty.difficulty} row ${row} col ${x}: ` +
                `tile says ${String(want)}, loader says ${String(got)}`,
            );
          }
          if (want !== null) filled++;
        }
        row++;
      }
      if (row !== GRY) {
        mismatches.push(`${entry.id}/${difficulty.difficulty}: ${row} rows, expected ${GRY}`);
      }
      compared++;
    }

    expect(mismatches.length, `\n${mismatches.slice(0, 20).join("\n")}`).toBe(0);
    // The census, so an empty comparison cannot pass by having compared nothing. Measured
    // values: 187 difficulty rows, 4391 filled cells of 37400.
    expect(compared).toBeGreaterThan(180);
    expect(filled).toBeGreaterThan(4000);
  });

  it("and the tile's background is the level's own bgcolor", async () => {
    const wrong: string[] = [];
    for (const { entry, difficulty } of everyDifficulty()) {
      const level = await loaderAtReferenceSeed().load(
        entry.filename,
        entry.id,
        difficulty.track,
        difficulty.difficulty,
      );
      // The loader's string, not a re-derivation from the colour triple. `coloursFor`
      // clamps out-of-range channels, so a level writing `bgcolor = 300 0 0` is `rgb(255,0,0)`
      // to the game — and a tile built by a second, non-clamping reader would say
      // `rgb(300,0,0)`: the same colour to a browser, a different claim in a diff.
      if (difficulty.tile.background !== level.level.colours.background) {
        wrong.push(
          `${entry.id}/${difficulty.difficulty}: tile ${difficulty.tile.background}, ` +
            `level ${level.level.colours.background}`,
        );
      }
    }
    expect(wrong.length, `\n${wrong.slice(0, 10).join("\n")}`).toEqual(0);
  });
});

describe("the tile's colours are the level's own", () => {
  it("match what the palette builds for the level's kinds and background", async () => {
    const wrong: string[] = [];
    for (const { entry, difficulty } of everyDifficulty()) {
      const level = await loaderAtReferenceSeed().load(
        entry.filename,
        entry.id,
        difficulty.track,
        difficulty.difficulty,
      );
      // The palette is built from the *loaded* kind table, not the tile's own palette
      // index, so this cannot be satisfied by the tile agreeing with itself.
      const built = buildPalette(
        level.level.kinds.map((k) => ({ role: k.role as KindRole })),
        { background: difficulty.tile.background },
      );
      for (let i = 0; i < difficulty.tile.kind.length; i++) {
        const kind = difficulty.tile.kind[i] as number;
        const want = built.get(kind)?.colour;
        // `tile.palette` is an *index* into the index's shared palette table, not the
        // palette itself. Reading a kind out of the number would be a silent `undefined`
        // and this assertion would pass for the wrong reason.
        const got = (LEVEL_INDEX.palettes[difficulty.tile.palette] ?? "").split("|")[kind];
        if (want !== undefined && got !== want) {
          wrong.push(
            `${entry.id}/${difficulty.difficulty} kind ${kind}: tile ${String(got)}, palette ${want}`,
          );
        }
      }
    }
    expect(wrong.length, `\n${wrong.slice(0, 10).join("\n")}`).toEqual(0);
  });

  it("and every tile's palette index names a palette that exists", () => {
    const missing: string[] = [];
    for (const { entry, difficulty } of everyDifficulty()) {
      if (LEVEL_INDEX.palettes[difficulty.tile.palette] === undefined) {
        missing.push(
          `${entry.id}/${difficulty.difficulty}: palette ${difficulty.tile.palette} of ` +
            `${LEVEL_INDEX.palettes.length}`,
        );
      }
    }
    expect(missing.length, `\n${missing.slice(0, 10).join("\n")}`).toEqual(0);
  });

  it("and a drawn blob is never invisible against its own board", async () => {
    // `buildPalette` chooses colours to be visible against the background it is given, so
    // a blob matching it exactly is a blob a player can see. If a tile were built against
    // the wrong background this is what would break: the level is dark, the palette was
    // built for white, and every ordinary kind lands at the edge of visibility.
    const invisible: string[] = [];
    for (const { entry, difficulty } of everyDifficulty()) {
      const palette = LEVEL_INDEX.palettes[difficulty.tile.palette] ?? "";
      const cells = tileCells(difficulty.tile, palette);
      const drawn = new Set(difficulty.tile.kind);
      for (const kind of drawn) {
        const colour = palette.split("|")[kind];
        if (colour !== undefined && colour === difficulty.tile.background) {
          invisible.push(`${entry.id}/${difficulty.difficulty} kind ${kind}`);
        }
      }
      expect(cells.length, entry.id).toBe(difficulty.tile.at.length);
    }
    expect(invisible.length, `\n${invisible.slice(0, 10).join("\n")}`).toEqual(0);
  });
});

describe("the tile is one legal start, not an arbitrary picture", () => {
  // The weaker half of the claim, and the half 6.7's wording overstates. Under a
  // different seed the loader draws different kinds for the pool cells, so equality is
  // impossible; what must hold is that every cell the loader *drew* is a kind the level's
  // own pool for that cell allows.
  it("every kind drawn into a pool cell belongs to that cell's pool", async () => {
    const outside: string[] = [];
    let drawnChecked = 0;

    for (const { entry, difficulty } of everyDifficulty()) {
      const loader = loaderAtReferenceSeed();
      const level = await loader.load(
        entry.filename,
        entry.id,
        difficulty.track,
        difficulty.difficulty,
      );
      // Which kinds each role can produce, from the level's own kind table — which is
      // where `drawKind` draws from, so this is the level's own permission.
      const pools = new Map<string, Set<number>>();
      for (let i = 0; i < level.level.kinds.length; i++) {
        const role = level.level.kinds[i]?.role;
        if (role === "colour" || role === "grey" || role === "grass") {
          if (!pools.has(role)) pools.set(role, new Set());
          pools.get(role)?.add(i);
        }
      }

      // Re-run the loader's own layout build to learn which cells were draws, then check
      // the tile's kind there against that pool. `StartLayout.drawn` is the engine's own
      // record of it, so this does not re-derive the rule.
      const layout = layoutFor(entry.filename, entry.id, difficulty);
      for (const [cell, pool] of layout.drawn) {
        const kind = difficulty.tile.kind[difficulty.tile.at.indexOf(cell)] ?? -1;
        const allowed = pools.get(pool);
        if (kind < 0) {
          outside.push(`${entry.id}/${difficulty.difficulty} cell ${cell}: no kind in the tile`);
        } else if (allowed !== undefined && !allowed.has(kind)) {
          outside.push(
            `${entry.id}/${difficulty.difficulty} cell ${cell}: kind ${kind} is not a ${pool}`,
          );
        }
        drawnChecked++;
      }
    }

    expect(outside.length, `\n${outside.slice(0, 20).join("\n")}`).toEqual(0);
    // 6.6% of 37400 cells are draws. A floor well under the measured 2461, so a walk that
    // stopped early would fail rather than pass on a small sample.
    expect(drawnChecked).toBeGreaterThan(2000);
  });
});

/**
 * The loader's start layout, which is also the record of which cells were pool draws.
 *
 * `LevelLoader.load` returns the level with its board resolved but not the layout's
 * `drawn` map, so this goes one level down rather than guessing: it resolves the same
 * section at the same version through the engine's own `versionFor`, and calls
 * `buildStartLayout` with the same seed. That is a second *call*, not a second
 * implementation — and the equality test above is what proves the two agree, so this
 * cannot drift into a private opinion about which cells were draws.
 */
function layoutFor(
  filename: string,
  id: string,
  difficulty: { readonly track: Track; readonly difficulty: Difficulty },
) {
  const globals = parseLd(GLOBALS, "globals.ld");
  const parsed = parseLd(readFileSync(resolve(DATA_DIR, filename), "latin1"), filename);
  const version = versionFor(difficulty.track, difficulty.difficulty);
  const root = rootScope(filename, version);
  root.defineAll(globals.definitions);
  root.defineAll(parsed.definitions);
  const section = parsed.definitions.find((d) => d.name === id);
  if (section === undefined || section.value.type !== "section") {
    throw new Error(`${filename}: no section ${id}`);
  }
  const level = new DefinitionScope(section.name, root, version, filename);
  level.defineAll(section.value.definitions);
  const settings = readLevelSettings(level);
  const table = buildKinds(level, kindDefaultsFrom(settings));
  const dist = readStartDist(level, table, false);
  return buildStartLayout(dist, {
    table,
    random: createPrng(TILE_REFERENCE_SEED),
    neighbours: settings.neighbours,
    hex: { enabled: false, flip: settings.hexFlip },
  });
}