/**
 * Build step: read every bundled level, collect the picture names it references, and
 * emit the art-key manifest.
 *
 * Run with `node levels-src/emit-art-manifest.ts`. Node 22 runs TypeScript directly,
 * so this needs no build step of its own and no dependency.
 *
 * Why the manifest is generated rather than hand-written: the set of picture names is
 * a property of the level data, not of this project. It is 81 files of upstream level
 * text naming around 1,200 sprites between them, and every one of them has to be
 * accounted for. A hand-maintained list would drift the first time a level was added,
 * and the failure mode of that drift is a level that renders blank in the browser
 * while every build-time check still passed.
 *
 * So the manifest is derived from the same parse the game uses, and the check that
 * every referenced key is registered runs over the real corpus rather than over a
 * sample.
 *
 * Nothing here ships to the browser. The output is a TypeScript module of plain data,
 * imported by the game at build time and bundled like any other.
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
import { artManifest } from "../engine/level-format/art.ts";
import type { ArtEntry, ArtManifest } from "../engine/level-format/art.ts";
import {
  availableLevelFiles,
  readGlobals,
  readLevelFile,
} from "./level-sources.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "generated/art-manifest.ts");

/** The versions to resolve, matching the corpus oracle's list. */
const VERSIONS = [
  Version.of("1", "main"),
  Version.of("2", "main"),
  Version.of("1", "contrib", "hard"),
];

/** One picture reference, as found in a level. */
interface Reference {
  readonly key: string;
  readonly kind: string;
  readonly origin: string;
}

/**
 * Every `.ld` file that may declare a level.
 *
 * `summary.ld` is the index rather than a level, and `globals.ld` holds the shared
 * definitions both are resolved against. `example.ld` is documentation: its picture
 * names are illustrative and would put keys in the manifest that no level uses.
 */
/**
 * Every level file, from both committed sources.
 *
 * A contributed level naming a picture the vendored levels do not use must still get an
 * entry, or the build fails for the level that is supposed to be adding to the game.
 * Failing on an unknown key is the point of the manifest, and a contributed level is
 * exactly the case it exists to catch.
 */
function levelFiles(): string[] {
  const files = availableLevelFiles().filter((f) => f !== "globals.ld");
  // Zero is not a legitimate state here. There are 79 vendored levels, so an empty
  // list means an incomplete checkout or a changed directory layout - and an empty
  // manifest would silently blank every level rather than fail.
  if (files.length === 0) {
    throw new Error(
      "No level files found in levels/upstream/ or levels/. The vendored levels are " +
        "committed, so this is an incomplete checkout rather than a missing fetch.",
    );
  }
  return files;
}

/**
 * The generated appearance for a picture.
 *
 * Derived from the key text rather than looked up, so adding a level never requires
 * editing this file. The values are stored in the manifest so that a change to this
 * function does not silently repaint every level that was generated before it - the
 * manifest is the record of what was decided, not a cache of a computation.
 */
function generatedSource(key: string): ArtEntry["source"] {
  let h = 0;
  for (let i = 0; i < key.length; i++)
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  // Saturation and lightness are held in a band that keeps every hue readable on both
  // the white and the black board backgrounds the levels use.
  const saturation = 58 + (Math.abs(h >> 8) % 14);
  const lightness = 46 + (Math.abs(h >> 16) % 12);
  return { kind: "generated", hue, saturation, lightness };
}

/** Collects every picture name the bundled levels reference. */
function collectReferences(): {
  refs: Reference[];
  files: number;
  levels: number;
} {
  const globals = parseLd(readGlobals(), "globals.ld");
  const refs: Reference[] = [];
  let files = 0;
  let levels = 0;

  for (const file of levelFiles()) {
    const parsed = parseLd(readLevelFile(file), file);
    const sections = parsed.definitions.filter(
      (d) => d.value.type === "section",
    );
    if (sections.length === 0) continue;
    files++;

    for (const version of VERSIONS) {
      const root = rootScope(file, version);
      root.defineAll(globals.definitions);
      root.defineAll(parsed.definitions);
      for (const def of sections) {
        if (def.value.type !== "section") continue;
        const level = new DefinitionScope(def.name, root, version, file);
        level.defineAll(def.value.definitions);
        levels++;
        let table;
        try {
          const settings = readLevelSettings(level);
          table = buildKinds(level, kindDefaultsFrom(settings));
        } catch {
          // A level that cannot be resolved contributes no references. The
          // validator (task 2.13) is what reports that; this step's job is to
          // collect picture names, not to duplicate its diagnostics.
          continue;
        }
        const where = `${file} ${def.name}[${version.toString()}]`;
        for (const kind of table.kinds) {
          if (kind.artKey === "") continue;
          refs.push({ key: kind.artKey, kind: kind.name, origin: where });
        }
      }
    }
  }
  return { refs, files, levels };
}

/** The manifest source, as a module with no imports so it is trivially auditable. */
function emit(
  manifest: ArtManifest,
  stats: { files: number; levels: number },
): string {
  const rows = [...manifest.entries.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => {
      // Array entries, not a record: `ArtEntry[]` is the declared type, and emitting
      // record syntax into it produced a file that would not parse. `key` is written
      // out rather than relying on position, so the generated file stays readable and
      // diffable on its own.
      if (entry.source.kind === "image") {
        return `  {
    key: ${JSON.stringify(entry.key)},
    source: { kind: "image", path: ${JSON.stringify(entry.source.path)} },
    firstKind: ${JSON.stringify(entry.firstKind)},
  },`;
      }
      return `  {
    key: ${JSON.stringify(entry.key)},
    source: {
      kind: "generated",
      hue: ${entry.source.hue},
      saturation: ${entry.source.saturation},
      lightness: ${entry.source.lightness},
    },
    firstKind: ${JSON.stringify(entry.firstKind)},
  },`;
    });
  return `// GENERATED FILE - do not edit.
//
// Emitted by levels-src/emit-art-manifest.ts from ${stats.files} level files
// (${stats.levels} level sections across three versions). Every picture name those
// levels reference has an entry here; a level naming a key that is missing from this
// table fails to resolve at load time, naming the key and the kind.
//
// The artwork is generated from each key rather than authored, and upstream's
// spritesheets are deliberately not shipped - see scripts/check-no-upstream-art.sh.

import { artManifest } from "../../engine/level-format/art.ts";
import type { ArtEntry } from "../../engine/level-format/art.ts";

const ENTRIES: ArtEntry[] = [
${rows.join("\n")}
];

export const ART_MANIFEST = artManifest(ENTRIES);
`;
}

function main(): void {
  const { refs, files, levels } = collectReferences();
  if (refs.length === 0) {
    throw new Error(
      `No picture references found across the ${files} level files. Either the ` +
        `vendored levels are missing or the parser stopped recognising \`pics\`, ` +
        `which would silently emit an empty manifest and blank every level.`,
    );
  }
  // Deduplicate by key, keeping the first kind that used it.
  //
  // There is deliberately no conflict check here. A picture's role can differ between
  // versions of one level - `ziehlen.ld` uses `mziAlle.xpm` as a colour at
  // [1, main] and as a goal blob at [1, contrib, hard] - and role belongs to the
  // level's kind, which the game already has. An earlier version of this file
  // rejected that as a conflict and refused to emit a manifest, which was wrong.
  const byKey = new Map<string, Reference>();
  for (const ref of refs) if (!byKey.has(ref.key)) byKey.set(ref.key, ref);

  const entries: ArtEntry[] = [...byKey.values()].map((ref) => ({
    key: ref.key,
    source: generatedSource(ref.key),
    firstKind: ref.kind,
  }));

  const manifest = artManifest(entries);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, emit(manifest, { files, levels }));
  process.stdout.write(
    `art-manifest: ${manifest.entries.size} keys from ${refs.length} references ` +
      `across ${files} files, ${levels} level sections\n` +
      `art-manifest: written to ${OUT}\n`,
  );
}

main();
