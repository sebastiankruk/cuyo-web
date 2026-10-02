/**
 * Build step: parse and compile every level, failing the build on the first error.
 *
 * Run with `node --experimental-transform-types levels-src/validate-levels.ts`.
 *
 * This is the gate. Until it exists, "the 81 real levels work" is an assumption: the
 * corpus tests parse every file and report failures as a list, but they catch errors
 * per level rather than requiring the level set to compile cleanly, so a level that
 * fails has been visible in a test output rather than impossible to ship.
 *
 * Every level is compiled for every version the engine supports and for both halves
 * of a two-player `startdist`, because the halves are genuinely different boards
 * (`maze.ld` declares four `startdist`s and gets a different layout out of each).
 *
 * Nothing here ships to the browser. The output is a report; the exit code is the
 * product.
 */

import { parseLd } from "../engine/level-format/parser.ts";
import { Version } from "../engine/level-format/version.ts";
import { DefinitionScope, rootScope } from "../engine/level-format/scope.ts";
import { buildKinds, UNDEFINED_EXPLODE } from "../engine/level-format/kinds.ts";
import {
  kindDefaultsFrom,
  readLevelSettings,
} from "../engine/level-format/settings.ts";
import { hexGeometry } from "../engine/game-core/constants.ts";
import { readStartDist } from "../engine/level-format/startdist.ts";
import { buildStartLayout } from "../engine/level-format/startlayout.ts";
import { resolveArtKey } from "../engine/level-format/art.ts";
import { ART_MANIFEST } from "./generated/art-manifest.ts";
import {
  DiagnosticBag,
  capture,
  needsNumExplode,
  undefinedExplode,
} from "../engine/level-format/diagnostics.ts";
import type {
  Captured,
  DiagnosticOrigin,
  LevelDiagnostic,
} from "../engine/level-format/diagnostics.ts";
import { ScriptedPrng } from "../engine/testing/prng-stub.ts";
import {
  readVendoredSummary,
  contribSummary,
  readGlobals,
  readLevelFile,
} from "./level-sources.ts";

/** The versions the engine supports. Kept in step with the corpus oracle's list. */
const VERSIONS = [
  Version.of("1", "main"),
  Version.of("2", "main"),
  Version.of("1", "contrib", "hard"),
];

/** What one compiled level produced, for the summary line. */
interface Compiled {
  readonly kinds: number;
  readonly rows: number;
  readonly cells: number;
}

/**
 * The files to validate, taken from `summary.ld` rather than from the directory.
 *
 * From the directory would validate files no level index points at, which is a
 * different question and the wrong one: the index is what the game will offer, so a
 * level absent from it is unreachable and a file present in it but broken is fatal.
 */
function indexedLevels(): string[] {
  const files: string[] = [];
  // Both summaries, for the same reason the catalogue reads both: a contributed level
  // not in either would never be validated, which is the quietest way for a gate to
  // stop meaning anything.
  const sources: { text: string; label: string }[] = [];
  sources.push({
    text: readVendoredSummary(),
    label: "summary.ld",
  });
  const contributed = contribSummary();
  if (contributed !== null) {
    sources.push({ text: contributed, label: "levels/summary.ld" });
  }

  for (const { text, label } of sources) {
    const summary = parseLd(text, label);
    // Through a `DefinitionScope` rather than by reaching into the token stream: the
    // summary is ordinary level-definition syntax, so reading it the way every other
    // definition is read keeps one code path for "what does this name resolve to".
    for (const def of summary.definitions) {
      if (def.value.type !== "section") continue;
      const section = new DefinitionScope(
        def.name,
        undefined,
        Version.of("1", "main"),
        label,
      );
      section.defineAll(def.value.definitions);
      const filename = section.ownWord("filename", "") ?? "";
      if (filename !== "") files.push(filename);
    }
  }
  return [...new Set(files)].sort();
}

function main(): void {
  const bag = new DiagnosticBag();
  const files = indexedLevels();
  const globals = parseLd(readGlobals(), "globals.ld");

  let sections = 0;
  const compiled: Compiled[] = [];
  let failures = 0;

  for (const file of files) {
    const parsed = capture(
      { file, definition: file, version: "-", twoPlayers: false },
      "lex",
      () => parseLd(readLevelFile(file), file),
    );
    if (!parsed.ok) continue;
    const levelSections = parsed.value.definitions.filter(
      (d) => d.value.type === "section",
    );

    for (const version of VERSIONS) {
      const root = rootScope(file, version);
      root.defineAll(globals.definitions);
      root.defineAll(parsed.value.definitions);
      for (const def of levelSections) {
        if (def.value.type !== "section") continue;
        for (const two of [false, true]) {
          const origin: DiagnosticOrigin = {
            file,
            definition: def.name,
            version: version.toString(),
            twoPlayers: two,
          };
          sections++;
          const before = bag.length;
          const result = compileLevel(
            root,
            version,
            def.name,
            def.value.definitions,
            origin,
            two,
            bag,
          );
          if (bag.length > before) {
            failures++;
            continue;
          }
          if (result !== null) compiled.push(result);
        }
      }
    }
  }

  const lines = bag.format();
  const quiet = process.env["CUYO_AI_MODE"] === "1";
  if (!bag.ok) {
    process.stderr.write(
      `validate-levels: ${failures} of ${sections} level sections failed ` +
        `(${bag.length} diagnostics)\n`,
    );
    // All of them, not just the first: the point of the structured form is that a
    // level set is only useful in full, so "which of these are broken" is the
    // question. Capped so a systemic mistake cannot bury the log.
    for (const line of lines.slice(0, 200)) process.stderr.write(`${line}\n`);
    if (lines.length > 200) {
      process.stderr.write(
        `validate-levels: ... and ${lines.length - 200} more\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const kinds = compiled.reduce((n, c) => n + c.kinds, 0);
  const cells = compiled.reduce((n, c) => n + c.cells, 0);
  if (!quiet) {
    process.stdout.write(
      `validate-levels: ${sections} level sections from ${files.length} files, all ` +
        `compiled\n`,
    );
    process.stdout.write(
      `validate-levels: ${kinds} kinds, ${cells} start-layout cells\n`,
    );
  }
}

/**
 * Compiles one level section, recording diagnostics and returning null on failure.
 *
 * No `try`/`catch` anywhere: every stage goes through `capture`, which returns a union,
 * so there is no path where an exception can escape and be mistaken for a data error.
 * A stage that throws unexpectedly - an engine bug rather than bad level data - is
 * still caught, by `capture`, and reported as a diagnostic with its message intact,
 * which is what keeps this validator trustworthy about its own health.
 */
function compileLevel(
  root: DefinitionScope,
  version: Version,
  name: string,
  definitions: readonly unknown[],
  origin: DiagnosticOrigin,
  two: boolean,
  bag: DiagnosticBag,
): Compiled | null {
  /** Records a failed stage and returns null, so each check is one line. */
  const fail = (result: { ok: false; diagnostic: LevelDiagnostic }): null => {
    bag.add(result.diagnostic);
    return null;
  };

  const level = new DefinitionScope(name, root, version, origin.file);
  level.defineAll(definitions as never);

  const settings = capture(origin, "settings", () => readLevelSettings(level));
  if (!settings.ok) return fail(settings);

  const table = capture(origin, "kinds", () =>
    buildKinds(level, kindDefaultsFrom(settings.value)),
  );
  if (!table.ok) return fail(table);

  // `numexplode` unset is upstream a load error - but only for kinds that detonate on
  // size. A kind without that behaviour may leave it unset, and real levels do: grey
  // and goal blobs generally never detonate on size.
  for (const kind of table.value.kinds) {
    if (kind.numexplode !== UNDEFINED_EXPLODE) continue;
    if (!needsNumExplode(kind)) continue;
    bag.add(undefinedExplode(kind, origin));
    return null;
  }

  if (!level.hasOwn("startdist")) {
    bag.add({
      code: "no-startdist",
      ...origin,
      message: "The level declares no startdist, so there is no board to play.",
    });
    return null;
  }

  const dist = capture(origin, "startdist", () =>
    readStartDist(level, table.value, two),
  );
  if (!dist.ok) return fail(dist);

  const hex = hexGeometry(settings.value.neighbours, settings.value.hexFlip);
  const layout: Captured<unknown> = capture(origin, "startdist", () =>
    buildStartLayout(dist.value, {
      table: table.value,
      // A fixed seed on purpose. The layout's *contents* are not this step's
      // business beyond "it builds", and a validator that failed intermittently
      // would be worse than no validator at all.
      random: FIXED_RANDOM,
      neighbours: settings.value.neighbours,
      hex,
    }),
  );
  if (!layout.ok) return fail(layout);

  // Every picture the level names must resolve through the manifest - the same call,
  // with the same failure, that the game makes at load time.
  for (const kind of table.value.kinds) {
    if (kind.artKey === "") continue;
    const resolved = capture(origin, "art-key", () =>
      resolveArtKey(ART_MANIFEST, kind.artKey, kind.name, origin.file),
    );
    if (!resolved.ok) return fail(resolved);
  }

  return {
    kinds: table.value.count,
    rows: dist.value.rows.length,
    cells: dist.value.rows.length * 10,
  };
}

/**
 * A deterministic source for the layout build.
 *
 * Fixed rather than seeded per level: the validator checks that a layout can be
 * *built*, and the layout's own randomness is pinned by the corpus oracle. Sharing
 * one source here also means the validator consumes the same number of values for
 * every level, so a failure cannot be an artefact of how far one got through the
 * stream.
 */
const FIXED_RANDOM = new ScriptedPrng(
  Array.from(
    { length: 200000 },
    (_, i) => ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff,
  ),
);

main();
