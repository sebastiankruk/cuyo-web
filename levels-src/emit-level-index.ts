/**
 * Build step: read `summary.ld` and every level it indexes, and emit the catalogue.
 *
 * Run with `node --experimental-transform-types levels-src/emit-level-index.ts`.
 *
 * This is where `summary.ld`'s two halves meet. The file is both a set of level
 * *sections* (filename, name, author) and a set of `level[track,difficulty]` *lists*
 * that say which sections belong where and in what order. A catalogue needs both, and
 * needs them joined: the sections give identity and display names, the lists give
 * grouping and order.
 *
 * Per-difficulty `numexplode` is resolved rather than copied, because it is not a
 * property of the file - it is a property of a *version* of it. `description[1]` and
 * `numexplode` both vary by difficulty, so the index records what each version
 * actually resolves to and which version produced it.
 *
 * Nothing here ships to the browser except the emitted data module.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLd } from "../engine/level-format/parser.ts";
import { Version } from "../engine/level-format/version.ts";
import { DefinitionScope, rootScope } from "../engine/level-format/scope.ts";
import { buildKinds } from "../engine/level-format/kinds.ts";
import {
  kindDefaultsFrom,
  readLevelSettings,
} from "../engine/level-format/settings.ts";
import { UNDEFINED_EXPLODE } from "../engine/level-format/kinds.ts";
import {
  EXPLODES_ON_SIZE,
  unsupportedNeighbourReason,
} from "../engine/game-core/constants.ts";
import { readStartDist } from "../engine/level-format/startdist.ts";
import type {
  Difficulty,
  DifficultyEntry,
  LevelIndex,
  LevelIndexEntry,
  Track,
} from "../engine/level-format/index-data.ts";
import {
  readVendoredSummary,
  contribSummary,
  levelFileExists,
  readGlobals,
  readLevelFile,
} from "./level-sources.ts";
import { DIFFICULTIES } from "../engine/level-format/index-data.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "generated/level-index.ts");

/**
 * Tracks in the order `summary.ld` declares them.
 *
 * That order is the catalogue's default, so it is read rather than assumed - a new
 * track added upstream should appear where its author put it.
 */
const TRACK_ORDER: readonly Track[] = [
  "all",
  "main",
  "game",
  "weird",
  "contrib",
  "extreme",
  "nofx",
];

interface SummarySection {
  readonly id: string;
  readonly filename: string;
  readonly name: string;
  readonly author: string;
}

/** Reads the `Name = { filename = ... name = ... author = ... }` sections. */
function summarySections(source: string, label: string): SummarySection[] {
  const parsed = parseLd(source, label);
  const out: SummarySection[] = [];
  for (const def of parsed.definitions) {
    if (def.value.type !== "section") continue;
    const section = new DefinitionScope(
      def.name,
      undefined,
      Version.of("1", "main"),
      label,
    );
    section.defineAll(def.value.definitions);
    out.push({
      id: def.name,
      filename: section.ownWord("filename", "") ?? "",
      name: section.ownWord("name", "") ?? "",
      author: section.ownWord("author", "") ?? "",
    });
  }
  return out;
}

/**
 * The `level[track,difficulty]=` lists and the `ordered[track]=` flags.
 *
 * The version bracket is read as raw text rather than resolved, because it names a
 * *track and a difficulty*, not a version to apply: `level[main,easy]` means "the
 * easy variant of the main track", and resolving it would collapse the difficulty we
 * are trying to keep.
 */
function summaryTracks(source: string): {
  /** Membership: `level[track]` with no difficulty, which is the list of what is on it. */
  readonly lists: ReadonlyMap<Track, readonly string[]>;
  /** Which levels have a variant: `level[track,difficulty]` to its names. */
  readonly variants: ReadonlyMap<
    Track,
    ReadonlyMap<Difficulty, readonly string[]>
  >;
  readonly ordered: ReadonlyMap<Track, boolean>;
  /** The size of each track's own list, before variants were merged in. */
  readonly authored: ReadonlyMap<Track, number>;
} {
  const orderedNames = new Map<Track, string[]>();
  const variants = new Map<Track, Map<Difficulty, string[]>>();
  const ordered = new Map<Track, boolean>();
  const text = source;

  for (const match of text.matchAll(/^level\[([^\]]*)\]=/gm)) {
    const key = match[1] ?? "";
    const [trackPart, difficultyPart] = key.split(",").map((s) => s.trim());
    const track = trackPart as Track;

    // The list runs to the next top-level definition. It starts on the rest of *this*
    // line, because summary.ld writes `level[contrib]=A,B,C` on one line while the
    // others put the names on the following lines.
    //
    // Searching the remainder for `^\S` directly gets that case wrong: with
    // multiline `^`, position 0 counts as a line start even though it is mid-line, so
    // a single-line list matched immediately and came out empty. `level[contrib]`'s
    // seven levels were silently on no track at all. So the current line is taken
    // first, and only the text after it is searched for the next definition.
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const newline = rest.indexOf("\n");
    const head = newline === -1 ? rest : rest.slice(0, newline + 1);
    const tail = newline === -1 ? "" : rest.slice(newline + 1);
    const next = tail.search(/^\S/m);
    const chunk = head + (next === -1 ? tail : tail.slice(0, next));
    const names = chunk
      .replace(/#[^\n]*/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");

    if (difficultyPart === "easy" || difficultyPart === "hard") {
      // A difficulty list says which levels *have* that variant. It is not the
      // membership list - treating it as one is how `level[main]`'s 48 entries became
      // 25, because `level[main,easy]` has 26 and was overwriting them.
      //
      // It is still membership for that track, though: `Secret` appears only in
      // `level[weird,hard]`, so it is a weird-track level that exists in its hard
      // variant. Reading membership from the bare lists alone put it on no track at
      // all, which is not what the data says.
      const perDifficulty =
        variants.get(track) ?? new Map<Difficulty, string[]>();
      perDifficulty.set(difficultyPart, names);
      variants.set(track, perDifficulty);
      continue;
    }
    orderedNames.set(track, names);
  }

  // Membership is the track's own list, plus any level that appears only in one of its
  // difficulty lists.
  //
  // The union has to be built this way round rather than by appending variants: the
  // variant lists are *subsets* of the track, so appending them inflated
  // `level[main]`'s 48 to 60 and put two thirds of the Standard track out of its
  // author's order. A name only earns a place if the bare list did not already have
  // it - `Secret`, which is in `level[weird,hard]` and nowhere else.
  const lists = new Map<Track, string[]>();
  for (const track of new Set([...orderedNames.keys(), ...variants.keys()])) {
    const own = orderedNames.get(track) ?? [];
    const merged = [...own];
    for (const names of variants.get(track)?.values() ?? []) {
      for (const name of names) if (!merged.includes(name)) merged.push(name);
    }
    lists.set(track, merged);
  }

  const authored = new Map<Track, number>();
  for (const [track, names] of orderedNames) authored.set(track, names.length);

  for (const match of text.matchAll(/^ordered\[([^\]]*)\]=(\S+)/gm)) {
    ordered.set(match[1]?.trim() as Track, match[2]?.trim() === "1");
  }
  return { lists, variants, ordered, authored };
}

/** The version a track/difficulty pair names. */
function versionFor(track: Track, difficulty: Difficulty): Version {
  return difficulty === "normal"
    ? Version.of("1", track)
    : Version.of("1", track, difficulty);
}

/** Resolves one level section at one version. */
function compile(
  globals: ReturnType<typeof parseLd>,
  file: string,
  section: SummarySection,
  track: Track,
  difficulty: Difficulty,
): {
  entry: DifficultyEntry;
  description: string;
  goalKinds: string[];
  greyKinds: number;
} {
  const version = versionFor(track, difficulty);
  // From whichever source holds it, so a contributed level compiles exactly like an
  // upstream one and there is no second code path to keep in step.
  const parsed = parseLd(readLevelFile(file), file);
  const def = parsed.definitions.find(
    (d) => d.value.type === "section" && d.name === section.id,
  );
  if (def === undefined || def.value.type !== "section") {
    throw new Error(
      `${file}: no section ${section.id} for ${track}/${difficulty}`,
    );
  }
  const root = rootScope(file, version);
  root.defineAll(globals.definitions);
  root.defineAll(parsed.definitions);
  const level = new DefinitionScope(section.id, root, version, file);
  level.defineAll(def.value.definitions);

  const settings = readLevelSettings(level);
  const table = buildKinds(level, kindDefaultsFrom(settings));
  const dist = readStartDist(level, table, false);

  // The largest `numexplode` among kinds that detonate on size, which is the number a
  // player would be told. Null rather than a fallback number when no kind detonates on
  // size, because "6" would be a claim the level does not make.
  let numExplode: number | null = null;
  for (const kind of table.kinds) {
    if ((kind.behaviour & EXPLODES_ON_SIZE) === 0) continue;
    if (kind.numexplode === UNDEFINED_EXPLODE) continue;
    if (numExplode === null || kind.numexplode > numExplode)
      numExplode = kind.numexplode;
  }

  return {
    entry: {
      difficulty,
      version: version.toString(),
      track,
      numExplode,
      chainGrass: settings.chainGrass,
      topTime: settings.topTime,
      neighbours: settings.neighbours,
      kinds: table.count,
      startRows: dist.rows.length,
    },
    description: level.ownWord("description", "") ?? "",
    goalKinds: table.kinds.filter((k) => k.role === "grass").map((k) => k.name),
    greyKinds: table.kinds.filter((k) => k.role === "grey").length,
  };
}

function main(): void {
  const upstreamSummary = readVendoredSummary();
  const globals = parseLd(readGlobals(), "globals.ld");

  // Both summaries, upstream first so its levels take the canonical positions when a
  // contributed level lands on a track it also uses.
  const contributed = contribSummary();
  const contributedSections =
    contributed === null
      ? []
      : summarySections(contributed, "levels/summary.ld");
  const sections = [
    ...summarySections(upstreamSummary, "summary.ld"),
    ...contributedSections,
  ];
  // Each summary is parsed on its own, then merged - not concatenated and scanned.
  //
  // Concatenating looks equivalent and is not. `summaryTracks` finds a list's body by
  // scanning forward to the next line starting in column 0, which is how it reads
  // `level[contrib]=A,B,C` followed by `ordered[contrib]=0`. Joining two files put
  // upstream's `ordered[...]` line where the contributed list's body should end, and
  // contrib's seven levels lost their list entirely - every one of them silently
  // dropped to "on no track". A parser that has to survive its input being
  // concatenated is a parser with a hidden assumption about what follows it.
  const parsedTracks = [upstreamSummary, contributed]
    .filter((t): t is string => t !== null)
    .map(summaryTracks);
  const lists = new Map<Track, readonly string[]>();
  const ordered = new Map<Track, boolean>();
  const authored = new Map<Track, number>();
  for (const part of parsedTracks) {
    /*
     * Union, not first-wins.
     *
     * A contributed level goes on `contrib` - upstream's own track for community levels
     * - and upstream's summary already defines that track with seven names in it. So
     * "later summaries do not overwrite earlier ones" silently discarded every
     * contributed level on any track upstream already has, and the level came out on no
     * track at all. The build failed with "no section TestLevel for all/normal", which
     * is true and says nothing about the cause.
     *
     * Names are appended in order and deduplicated, so a contributed level lands after
     * the ones the author listed rather than displacing them.
     */
    for (const [track, names] of part.lists) {
      const merged = [...(lists.get(track) ?? [])];
      for (const name of names) if (!merged.includes(name)) merged.push(name);
      lists.set(track, merged);
    }
    for (const [track, flag] of part.ordered) ordered.set(track, flag);
    for (const [track, count] of part.authored) {
      if (!authored.has(track)) authored.set(track, count);
    }
  }
  const variants = new Map<Track, Map<Difficulty, readonly string[]>>();
  for (const part of parsedTracks) {
    // Same union, for the same reason: a contributed level offered on `contrib,easy`
    // must not vanish because upstream already declared that variant.
    for (const [track, perDifficulty] of part.variants) {
      const existing =
        variants.get(track) ?? new Map<Difficulty, readonly string[]>();
      for (const [difficulty, names] of perDifficulty) {
        const merged = [...(existing.get(difficulty) ?? [])];
        for (const name of names) if (!merged.includes(name)) merged.push(name);
        existing.set(difficulty, merged);
      }
      variants.set(track, existing);
    }
  }
  const byId = new Map(sections.map((s) => [s.id, s]));

  /*
   * A summary may name a file that is not there.
   *
   * The missing-file case is a plain build failure with the filename in it, because a
   * contributor who has written a level but not saved it should be told that, not
   * shown a confusing error from further down.
   *
   * But a stale *committed* index is the case that matters more. The generated file is
   * what the tests read, so if a level is removed from `levels/` and the index is not
   * regenerated, every test fails on a file that no longer exists and the reason is
   * invisible from the failure. That happened while building this: it reads as "seven
   * unrelated tests broke", which is the worst possible error message.
   *
   * So a missing file drops the level and is reported, rather than crashing the
   * generator. `make level-index && git commit` regenerates; the drift checks fail if it
   * was not.
   */
  const missingFiles: string[] = [];

  const tracksSeen = new Set<Track>();
  for (const track of lists.keys()) tracksSeen.add(track);
  const trackOrder = [
    ...TRACK_ORDER.filter((t) => tracksSeen.has(t)),
    // Anything upstream added that this file has not heard of, so a new track is
    // visible rather than dropped.
    ...[...tracksSeen].filter((t) => !TRACK_ORDER.includes(t)),
  ];

  const levels: LevelIndexEntry[] = [];
  const missing: string[] = [];
  const unsupported: string[] = [];

  for (const section of sections) {
    if (section.filename === "") {
      missing.push(`${section.id}: no filename`);
      continue;
    }
    if (!levelFileExists(section.filename)) {
      missingFiles.push(
        `${section.id}: ${section.filename} is in neither levels/ nor the upstream ` +
          `checkout`,
      );
      continue;
    }
    // Positions come from the track's own list where it appears there, so the
    // playing order is the author's. A level that only appears in a difficulty list
    // goes after them, in the order that list gives.
    const trackPositions = new Map<Track, number>();
    const trackOrdered = new Map<Track, boolean>();
    for (const [track, names] of lists) {
      const at = names.indexOf(section.id);
      if (at === -1) continue;
      trackPositions.set(track, at);
      trackOrdered.set(track, ordered.get(track) ?? true);
    }

    // Resolve at each difficulty this level actually has a variant of, plus `normal`
    // so every level has at least one entry. A variant exists when the level's name
    // appears in that track's `level[track,difficulty]` list - which is a different
    // question from whether it is on the track at all.
    const wanted = new Set<Difficulty>(["normal"]);
    for (const track of trackPositions.keys()) {
      for (const [difficulty, names] of variants.get(track) ?? []) {
        if (names.includes(section.id)) wanted.add(difficulty);
      }
    }

    const byDifficulty = new Map<Difficulty, DifficultyEntry>();
    let description = "";
    let goalKinds: string[] = [];
    let greyKinds = 0;
    for (const difficulty of DIFFICULTIES) {
      if (!wanted.has(difficulty)) continue;
      // Compiled at the first track that offers this difficulty, so the number matches
      // a version a player can actually reach.
      //
      // The fallback is the level's *own* track rather than `"main"`. A contributed
      // level on `contrib` has no `main` entry, so resolving `normal` against `main`
      // asked for a version that does not contain it - and the generator died with
      // "no section TestLevel for main/normal", which is both true and useless. The
      // default only ever mattered because upstream's levels are all on `main` too.
      const track =
        [...trackPositions.keys()].find((t) =>
          (variants.get(t)?.get(difficulty) ?? []).includes(section.id),
        ) ??
        trackPositions.keys().next().value ??
        "all";
      const compiled = compile(
        globals,
        section.filename,
        section,
        track,
        difficulty,
      );
      byDifficulty.set(difficulty, compiled.entry);
      if (description === "") description = compiled.description;
      if (goalKinds.length === 0) goalKinds = compiled.goalKinds;
      if (greyKinds === 0) greyKinds = compiled.greyKinds;
    }

    // Availability across every difficulty, since a level is offered as a whole.
    const reasons = [...byDifficulty.values()]
      .map((d) => unsupportedNeighbourReason(d.neighbours))
      .filter((r): r is string => r !== null);
    const supported = reasons.length === 0;

    levels.push({
      id: section.id,
      filename: section.filename,
      name: section.name,
      author: section.author,
      description,
      tracks: trackPositions,
      ordered: trackOrdered,
      difficulties: byDifficulty,
      goalKinds,
      greyKinds,
      supported,
      unsupportedReason: reasons[0] ?? "",
    });
    if (!supported) unsupported.push(section.id);
  }

  if (missing.length > 0) {
    throw new Error(`A summary is inconsistent:\n  ${missing.join("\n  ")}`);
  }
  if (missingFiles.length > 0) {
    process.stderr.write(
      `level-index: WARNING - ${missingFiles.length} level(s) indexed but their file ` +
        `is missing; they are omitted from the catalogue:\n  ` +
        `${missingFiles.join("\n  ")}\n` +
        `level-index: run "make level-index" and commit, or restore the file.\n`,
    );
  }
  // Levels in no `level[...]` list at all. Upstream's menu is built from those lists,
  // so such a level is unreachable there - `UnterWasser` is the one, and it is a
  // property of the data rather than a parsing slip. Reported rather than dropped, and
  // rather than invented into a track it was not put in: the catalogue can offer it,
  // but it must be visibly "not in a track" rather than quietly pretending otherwise.
  const untracked = levels.filter((l) => l.tracks.size === 0).map((l) => l.id);
  if (untracked.length > 0) {
    process.stdout.write(
      `level-index: note - ${untracked.length} level(s) in no level[track] list, so ` +
        `unreachable from the menu: ${untracked.join(", ")}\n`,
    );
  }
  // Every name in every list must resolve to a section, or a level would be listed and
  // unloadable. This is the check that catches `summary.ld` referring to a level file
  // that was renamed.
  const dangling: string[] = [];
  for (const [track, names] of lists) {
    for (const name of names) {
      if (!byId.has(name)) dangling.push(`${track}: ${name}`);
    }
  }
  if (dangling.length > 0) {
    throw new Error(
      `summary.ld lists levels it does not define:\n  ${dangling.join("\n  ")}`,
    );
  }

  const index: LevelIndex = {
    levels,
    byId: new Map(levels.map((l) => [l.id, l])),
    tracks: trackOrder,
    authoredCounts: authored,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, emit(index));
  const standard = index.levels.filter((l) => l.tracks.has("main")).length;
  process.stdout.write(
    `level-index: ${levels.length} levels across ${trackOrder.length} tracks; ` +
      `Standard track lists ${index.authoredCounts.get("main")} and reaches ` +
      `${standard}\n`,
  );
  if (unsupported.length > 0) {
    process.stdout.write(
      `level-index: ${unsupported.length} level(s) listed but not playable, because ` +
        `they need an unimplemented neighbour mode: ${unsupported.join(", ")}\n`,
    );
  }
  process.stdout.write(`level-index: written to ${OUT}\n`);
}

/** The catalogue as a module, with Maps rebuilt at import so it is plain data. */
function emit(index: LevelIndex): string {
  const levelChunks = index.levels.map((entry) => {
    const tracks = [...entry.tracks.keys()].sort(
      (a, b) => TRACK_ORDER.indexOf(a) - TRACK_ORDER.indexOf(b),
    );
    // `entry.tracks` holds *positions* and `entry.ordered` holds the flags. Reading the
    // second out of the first made position 0 mean "unordered", so every track whose
    // first level happened to be at index 0 came out unordered - which was all of
    // them, since each track lists its own first level first.
    const unordered = tracks.filter((t) => entry.ordered.get(t) === false);
    return `  {
    id: ${JSON.stringify(entry.id)},
    filename: ${JSON.stringify(entry.filename)},
    name: ${JSON.stringify(entry.name)},
    author: ${JSON.stringify(entry.author)},
    description: ${JSON.stringify(entry.description)},
    tracks: ${JSON.stringify(tracks.map((t) => [t, entry.tracks.get(t) ?? 0]))},
    unordered: ${JSON.stringify(unordered)},
    difficulties: ${JSON.stringify([...entry.difficulties.values()])},
    goalKinds: ${JSON.stringify(entry.goalKinds)},
    greyKinds: ${entry.greyKinds},
    supported: ${entry.supported},
    unsupportedReason: ${JSON.stringify(entry.unsupportedReason)},
  },`;
  });
  return `// GENERATED FILE - do not edit.
//
// Emitted by levels-src/emit-level-index.ts from summary.ld and the ${index.levels.length}
// level files it indexes: enough to draw the catalogue and sort it, and nothing that
// has to be kept in step with a level file. The per-difficulty numbers were resolved
// once, here, from the version each difficulty names.
//
// Emitted as plain arrays and rebuilt into Maps by the module below. A Map does not
// survive JSON, and a generator that wrote one directly would have produced a file
// that looked like data but carried behaviour - which is exactly the sort of thing
// that makes a generated file hard to trust in review.

import type {
  Difficulty,
  DifficultyEntry,
  LevelIndex,
  LevelIndexEntry,
  Track,
} from "../../engine/level-format/index-data.ts";

/** The shape of one level as the table above stores it. */
interface RawLevel {
  readonly id: string;
  readonly filename: string;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly tracks: readonly (readonly [Track, number])[];
  readonly unordered: readonly Track[];
  readonly difficulties: readonly DifficultyEntry[];
  readonly goalKinds: readonly string[];
  readonly greyKinds: number;
  readonly supported: boolean;
  readonly unsupportedReason: string;
}

function toEntry(raw: RawLevel): LevelIndexEntry {
  const unordered = new Set(raw.unordered);
  const difficulties = new Map<Difficulty, DifficultyEntry>();
  for (const d of raw.difficulties) difficulties.set(d.difficulty, d);
  return {
    id: raw.id,
    filename: raw.filename,
    name: raw.name,
    author: raw.author,
    description: raw.description,
    tracks: new Map(raw.tracks.map(([t, at]) => [t, at] as const)),
    ordered: new Map(
      raw.tracks.map(([t]) => [t, !unordered.has(t)] as const),
    ),
    difficulties,
    goalKinds: raw.goalKinds,
    greyKinds: raw.greyKinds,
    supported: raw.supported,
    unsupportedReason: raw.unsupportedReason,
  };
}

const RAW: readonly RawLevel[] = [
${levelChunks.join("\n")}
];

export const LEVELS: readonly LevelIndexEntry[] = RAW.map(toEntry);

export const LEVEL_INDEX: LevelIndex = {
  levels: LEVELS,
  byId: new Map(LEVELS.map((l) => [l.id, l])),
  tracks: ${JSON.stringify(index.tracks)} as readonly Track[],
  authoredCounts: new Map(
    ${JSON.stringify([...index.authoredCounts])} as const,
  ) as Map<Track, number>,
};
`;
}

main();
