/**
 * Loads a level at runtime: fetch the `.ld`, parse it, compile it, cache the result.
 *
 * The catalogue knows 79 levels exist; loading all of them to draw a menu would mean 79
 * parses before the player has chosen anything, and the whole corpus is 660 kB. So a
 * level's file is fetched only when it is chosen, and kept afterwards - a player who
 * restarts, or goes back and picks it again, pays for it once.
 *
 * Two things are injected rather than reached for, and both are so that this module
 * has no environment of its own:
 *
 * - **How to fetch.** The browser gets `fetch`; the tests get a function that counts
 *   calls. That is what makes "a second request hits the cache" a testable claim rather
 *   than an assertion about timing.
 * - **How to roll dice.** The start layout is randomised, and a level loaded twice with
 *   different layouts would look like a bug in the cache. The source is injected so a
 *   test can pin it and see the same board twice.
 */

import { parseLd } from "./parser.ts";
import type { LdDefinition } from "./parser.ts";
import { LdLexError } from "./lexer.ts";
import { Version } from "./version.ts";
import { DefinitionScope, rootScope } from "./scope.ts";
import { buildKinds, UNDEFINED_EXPLODE } from "./kinds.ts";
import { kindDefaultsFrom, readLevelSettings } from "./settings.ts";
import type { LevelSettings } from "./settings.ts";
import type { Colour } from "./scope.ts";
import { readStartDist } from "./startdist.ts";
import { buildStartLayout } from "./startlayout.ts";
import type { LayoutBoard, LayoutCell } from "./startlayout.ts";
import { needsNumExplode, undefinedExplode } from "./diagnostics.ts";
import type { DiagnosticOrigin } from "./diagnostics.ts";
import { ArtKeyError, resolveArtKey } from "./art.ts";
import type { ArtManifest } from "./art.ts";
import type {
  LevelColours,
  LevelDef,
  StartCell,
  StartRow,
} from "./level-data.ts";
import type { Difficulty, Track } from "./index-data.ts";

/** Raised when a level cannot be loaded. Carries a diagnostic rather than just text. */
export class LevelLoadError extends Error {
  constructor(
    readonly origin: DiagnosticOrigin,
    readonly reason: string,
    options: { cause?: unknown } = {},
  ) {
    super(
      `${origin.file} ${origin.definition}[${origin.version}]` +
        `${origin.twoPlayers ? " (2P)" : ""}: ${reason}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "LevelLoadError";
  }
}

/** How to fetch a level file. Returns the file's text. */
export type LevelFetcher = (filename: string) => Promise<string>;

/** Everything the loader needs from outside itself. */
export interface LoaderDeps {
  /** Fetches a `.ld` by bare filename. */
  readonly fetchLevel: LevelFetcher;
  /** Supplies the art manifest, so an unregistered key fails here and not on screen. */
  readonly art: ArtManifest;
  /** The globals file's text, which every level resolves its names against. */
  readonly globalsSource: string;
  /** Rolls the start layout. Injected so a reload is reproducible. */
  readonly random: import("../prng.ts").RandomSource;
  /** Two-player halves, when the level has them. */
  readonly twoPlayers?: boolean;
}

/** The version a track and difficulty name. */
export function versionFor(track: Track, difficulty: Difficulty): Version {
  return difficulty === "normal"
    ? Version.of("1", track)
    : Version.of("1", track, difficulty);
}

/** What a load produced, alongside the level itself. */
export interface LoadedLevel {
  readonly level: LevelDef;
  /** The version that was resolved, for the rules panel and for a restart. */
  readonly version: string;
  /** The track and difficulty it was loaded at. */
  readonly track: Track;
  readonly difficulty: Difficulty;
  /**
   * The goal kinds' art keys, resolved through the manifest.
   *
   * Resolved at load rather than at draw time so a missing key is a load failure with
   * a diagnostic, instead of a blank cell discovered by a player.
   */
  readonly goalArtKeys: readonly string[];
}

/**
 * Loads levels, caching by identity.
 *
 * The cache key is everything that can change the result: file, section, version and
 * the two-player flag. Keying on the level id alone would serve a hard variant to
 * someone who asked for the easy one - which is not a performance bug, it is the wrong
 * level.
 */
export class LevelLoader {
  private readonly cache = new Map<string, LoadedLevel>();
  /**
   * In-flight and finished parses, keyed by filename.
   *
   * The *promise* is cached, not the result. Caching the result looked correct and was
   * not: the cache check and the store sit either side of an `await`, so two loads
   * started together - which is exactly what loading a list of levels does - both saw
   * an empty cache and both fetched. Loading six levels fetched globals.ld six times.
   *
   * Holding the promise collapses that: the second caller awaits the first caller's
   * work instead of starting its own, whether or not it has finished. A rejected parse
   * is removed again so a failed load is retried rather than cached as a failure.
   */
  private readonly files = new Map<string, Promise<readonly LdDefinition[]>>();
  private globals: readonly LdDefinition[] | null = null;
  /** Fetch calls, for the cache test and for a diagnostics readout. */
  fetches = 0;

  constructor(private readonly deps: LoaderDeps) {}

  /** Whether a level is already loaded, without loading it. */
  isCached(
    filename: string,
    id: string,
    track: Track,
    difficulty: Difficulty,
  ): boolean {
    return this.cache.has(cacheKey(filename, id, track, difficulty));
  }

  /** How many levels are loaded. */
  get size(): number {
    return this.cache.size;
  }

  /** Drops every cached level. The parsed files stay, since they do not depend on it. */
  clear(): void {
    this.cache.clear();
  }

  /** Drops everything, including the parsed files. */
  reset(): void {
    this.clear();
    this.files.clear();
    this.globals = null;
  }

  /**
   * Loads a level, or returns the cached one.
   *
   * `id` is the definition name from the index, not the filename: one file can hold
   * several levels, and the two are not always related the way the names suggest.
   */
  async load(
    filename: string,
    id: string,
    track: Track,
    difficulty: Difficulty = "normal",
  ): Promise<LoadedLevel> {
    const two = this.deps.twoPlayers ?? false;
    const key = cacheKey(filename, id, track, difficulty);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const version = versionFor(track, difficulty);
    const origin: DiagnosticOrigin = {
      file: filename,
      definition: id,
      version: version.toString(),
      twoPlayers: two,
    };

    const definitions = await this.parseFile(filename);
    const def = definitions.find(
      (d) => d.value.type === "section" && d.name === id,
    );
    if (def === undefined || def.value.type !== "section") {
      throw new LevelLoadError(
        origin,
        `no definition named ${id}. ${describeSectionNames(definitions)}`,
      );
    }

    const root = rootScope(filename, version);
    root.defineAll(await this.parseGlobals());
    root.defineAll(definitions);
    const scope = new DefinitionScope(id, root, version, filename);
    scope.defineAll(def.value.definitions);

    const loaded = this.compile(scope, origin, { track, difficulty, version });
    this.cache.set(key, loaded);
    return loaded;
  }

  /** Lexes and parses a file, once however many callers ask at the same time. */
  private parseFile(filename: string): Promise<readonly LdDefinition[]> {
    const cached = this.files.get(filename);
    if (cached !== undefined) return cached;
    const started = this.parseFileUncached(filename);
    this.files.set(filename, started);
    // A failed parse is not cached: the next attempt should try again, and leaving a
    // rejected promise behind would make a transient failure permanent for the session.
    started.catch(() => {
      if (this.files.get(filename) === started) this.files.delete(filename);
    });
    return started;
  }

  private async parseFileUncached(
    filename: string,
  ): Promise<readonly LdDefinition[]> {
    let source: string;
    try {
      this.fetches++;
      source = await this.deps.fetchLevel(filename);
    } catch (cause) {
      throw new LevelLoadError(
        {
          file: filename,
          definition: "-",
          version: "-",
          twoPlayers: false,
        },
        `could not be fetched: ${(cause as Error).message}`,
        { cause },
      );
    }
    let definitions: readonly LdDefinition[];
    try {
      definitions = parseLd(source, filename).definitions;
    } catch (cause) {
      const e = cause as LdLexError | Error;
      throw new LevelLoadError(
        { file: filename, definition: "-", version: "-", twoPlayers: false },
        e.message,
        { cause },
      );
    }
    return definitions;
  }

  private async parseGlobals(): Promise<readonly LdDefinition[]> {
    if (this.globals !== null) return this.globals;
    const definitions = await this.parseFile("globals.ld");
    this.globals = definitions;
    return definitions;
  }

  /** Turns a resolved scope into a playable `LevelDef`. */
  private compile(
    scope: DefinitionScope,
    origin: DiagnosticOrigin,
    meta: {
      readonly track: Track;
      readonly difficulty: Difficulty;
      readonly version: Version;
    },
  ): LoadedLevel {
    const { art } = this.deps;
    let settings;
    try {
      settings = readLevelSettings(scope);
    } catch (cause) {
      throw new LevelLoadError(origin, (cause as Error).message, { cause });
    }
    let table;
    try {
      table = buildKinds(scope, kindDefaultsFrom(settings));
    } catch (cause) {
      throw new LevelLoadError(origin, (cause as Error).message, { cause });
    }

    // Resolving the keys here means a missing picture is a load failure with a
    // diagnostic, rather than a blank cell a player notices.
    const goalArtKeys: string[] = [];
    for (const kind of table.kinds) {
      if (kind.artKey === "") continue;
      try {
        const entry = resolveArtKey(art, kind.artKey, kind.name, origin.file);
        if (kind.role === "grass") goalArtKeys.push(entry.key);
      } catch (cause) {
        throw new LevelLoadError(origin, (cause as Error).message, { cause });
      }
      // Upstream refuses to load a kind that detonates on size with no threshold.
      if (kind.numexplode === UNDEFINED_EXPLODE && needsNumExplode(kind)) {
        const d = undefinedExplode(kind, origin);
        throw new LevelLoadError(origin, d.message);
      }
    }

    let dist;
    try {
      dist = readStartDist(scope, table, origin.twoPlayers);
    } catch (cause) {
      throw new LevelLoadError(origin, (cause as Error).message, { cause });
    }

    let rows: LayoutBoard;
    try {
      const hex = { enabled: false, flip: settings.hexFlip };
      rows = buildStartLayout(dist, {
        table,
        random: this.deps.random,
        neighbours: settings.neighbours,
        hex,
      }).cells;
    } catch (cause) {
      throw new LevelLoadError(origin, (cause as Error).message, { cause });
    }

    const level: LevelDef = {
      id: scope.name,
      // `readLevelSettings` already resolves these, version-aware, which `ownWord`
      // would not be. One reader for a value, not two that can disagree.
      name: settings.name,
      author: settings.author,
      description: settings.description,
      kinds: table.kinds,
      emptyKind: table.emptyKind,
      neighbours: settings.neighbours,
      chainGrass: settings.chainGrass,
      topTime: settings.topTime,
      hetzrandStop: settings.topStop,
      randomGreys: settings.randomGreys,
      noGreyProb: settings.noGreyProb,
      randomFallPos: settings.randomFallPos,
      mirror: settings.mirror,
      colours: coloursFor(settings),
      // The concrete board, not the keys the level declared.
      //
      // `LevelDef.startDist` is what `Simulation` builds its board from, so it has to
      // be resolved cells - and that is what `buildStartLayout` produces, with the
      // neighbour-avoidance heuristic already applied. The declared keys are a separate
      // thing and are not carried here; keeping both would mean two representations of
      // a start layout in one object, and only one of them is ever played.
      startDist: toStartRows(rows, table.emptyKind),
    };

    return {
      level,
      version: meta.version.toString(),
      track: meta.track,
      difficulty: meta.difficulty,
      goalArtKeys,
    };
  }
}

/**
 * The board's colours, as the level declares them.
 *
 * Upstream reads these per level; none of the 79 set them, so these defaults apply and
 * are read from the level anyway in case one starts doing so. A wrong background makes
 * blobs invisible, which is a bug this project has already had once, so the values are
 * stated here rather than left to a caller.
 */
function coloursFor(settings: LevelSettings): LevelColours {
  return {
    background: cssColour(settings.background),
    top: cssColour(settings.top),
    text: cssColour(settings.text),
  };
}

/**
 * A colour as CSS, clamped and rounded.
 *
 * Upstream stores r, g and b as numbers it never range-checks, and a level that wrote
 * 300 would otherwise produce `rgb(300,...)`, which the browser clamps silently -
 * so the value on screen would differ from the value on the level, which is exactly
 * the kind of divergence that is hard to notice and hard to explain.
 */
function cssColour(colour: Colour): string {
  const channel = (n: number): number =>
    Math.max(0, Math.min(255, Math.round(Number.isFinite(n) ? n : 0)));
  return `rgb(${channel(colour.r)},${channel(colour.g)},${channel(colour.b)})`;
}

/** Resolved layout cells to the rows `LevelDef` carries, with empties as null. */
function toStartRows(
  rows: readonly (readonly LayoutCell[])[],
  emptyKind: number,
): readonly StartRow[] {
  return rows.map((row) =>
    row.map((cell): StartCell | null => {
      if (cell.kind === emptyKind) return null;
      return { kind: cell.kind, version: cell.version };
    }),
  );
}

/** The cache key: everything that can change the result. */
function cacheKey(
  filename: string,
  id: string,
  track: Track,
  difficulty: Difficulty,
): string {
  return `${filename}#${id}#${track}#${difficulty}`;
}

/** Names the sections a file does define, for a "no such level" message. */
function describeSectionNames(definitions: readonly LdDefinition[]): string {
  const names = definitions
    .filter((d) => d.value.type === "section")
    .map((d) => d.name);
  if (names.length === 0) return "The file defines no levels at all.";
  return `It defines: ${names.join(", ")}.`;
}

/** Re-exported so a caller can check a key without importing the art module. */
export { ArtKeyError };
