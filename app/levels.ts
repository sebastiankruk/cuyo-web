/**
 * The browser's half of level loading.
 *
 * `engine/level-format/loader.ts` has no environment of its own - it is handed a
 * fetcher and a dice source - precisely so that this file can be the only place that
 * knows about `window.fetch` and a seed. Everything about *what* to load and how to
 * compile it stays in the engine, where it is tested against the real corpus.
 *
 * The module is created once and shared, so the cache is shared too: a player who
 * restarts a level or returns to it from the catalogue pays for the fetch once per
 * session.
 */

import { LevelLoader } from "../engine/level-format/loader.ts";
import type { LevelLoader as LevelLoaderType } from "../engine/level-format/loader.ts";
import { ART_MANIFEST } from "../levels-src/generated/art-manifest.ts";
import { LEVEL_INDEX } from "../levels-src/generated/level-index.ts";
import { createPrng } from "../engine/prng.ts";
import type {
  LevelIndex,
  LevelIndexEntry,
} from "../engine/level-format/index-data.ts";
import type { Difficulty, Track } from "../engine/level-format/index-data.ts";

/** Where the generated `.ld` files are served from. */
export const LEVEL_BASE = "levels/";

/**
 * Fetches a level file.
 *
 * `cache: "force-cache"` because the files are content-addressed by the build: a
 * deploy that changes a level changes its bytes, and the default HTTP caching already
 * handles that correctly. Asking for it explicitly says so rather than leaving it to a
 * default nobody chose.
 */
async function fetchLevelFile(filename: string): Promise<string> {
  const response = await fetch(`${LEVEL_BASE}${filename}`, {
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(
      `${filename}: HTTP ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

/** The globals file, fetched once by the loader and shared by every level. */
let globalsSource: string | null = null;

async function globals(): Promise<string> {
  if (globalsSource !== null) return globalsSource;
  globalsSource = await fetchLevelFile("globals.ld");
  return globalsSource;
}

/**
 * The shared loader, so the cache is shared: a player who restarts a level or returns
 * to it from the catalogue pays for the fetch once per session.
 */
let shared: LevelLoaderType | null = null;

export function levelLoader(): LevelLoaderType {
  if (shared !== null) return shared;
  shared = new LevelLoader({
    fetchLevel: async (filename) => {
      if (filename === "globals.ld") return globals();
      return fetchLevelFile(filename);
    },
    art: ART_MANIFEST,
    // Replaced below by the real text on first use; `LevelLoader` only reads this
    // through `parseGlobals`, which goes through the fetcher.
    globalsSource: "",
    // A fresh source per load, so a restart gives a different start layout rather than
    // the board the player has already seen.
    random: createPrng(Date.now() & 0xffffffff),
  });
  return shared;
}

/** The catalogue. */
export function catalogue(): LevelIndex {
  return LEVEL_INDEX;
}

/** One entry by id. */
export function levelById(id: string): LevelIndexEntry | undefined {
  return LEVEL_INDEX.byId.get(id);
}

/**
 * Loads a level the way the catalogue describes it.
 *
 * The track comes from the index rather than from the caller, because a level that
 * offers `hard` only on `weird` resolves to a different level when asked for on
 * `main`. Passing the caller's track through would load something the catalogue never
 * described.
 */
export async function loadLevel(
  id: string,
  difficulty: Difficulty = "normal",
): Promise<{
  readonly level: import("../engine/level-format/level-data.ts").LevelDef;
  readonly version: string;
  readonly track: Track;
  readonly difficulty: Difficulty;
}> {
  const entry = levelById(id);
  if (entry === undefined) throw new Error(`No level called ${id}`);
  const described = entry.difficulties.get(difficulty);
  if (described === undefined) {
    throw new Error(`${entry.name} has no ${difficulty} variant`);
  }
  const loader = levelLoader();
  return loader.load(entry.filename, entry.id, described.track, difficulty);
}
