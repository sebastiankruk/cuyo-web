/**
 * Which picture keys the bundled levels reference.
 *
 * One function, because two build steps need the same answer and the answer is a fact about the
 * level data rather than about either script:
 *
 * - `emit-art-manifest.ts` turns it into the art-key manifest.
 * - `transcribe-picture-icons.ts` measures each key against upstream's spritesheets.
 *
 * They used to read the key set from each other — the manifest from the emitter, the transcriber
 * from the committed manifest — which made the second step unable to bootstrap the first: a newly
 * referenced key could not be measured because the manifest that would have listed it could not be
 * emitted without a count for it. Extracting the walk breaks the circle, and the emitter's "a key
 * with no stated count is a hard failure" is then a real check rather than a deadlock.
 *
 * **Every picture file a kind declares, not just the first.** `pics = inGruen.xpm,
 * inGruen1.xpm, inGruen2.xpm` is three keys, and the manifest's whole claim is that every picture
 * a level names has an entry. Collecting `artKey` alone — the list's first entry — registered one
 * of the three and left the other two outside the gate entirely: **566 of the corpus's 792 keys
 * were unregistered** until 15.5 asked for an icon count per file and `ArtKeyError` named
 * `inRosaNasen1.xpm`, a key the manifest had never heard of and could not have.
 */

import { parseLd } from "../engine/level-format/parser.ts";
import { Version } from "../engine/level-format/version.ts";
import { DefinitionScope, rootScope } from "../engine/level-format/scope.ts";
import { buildKinds } from "../engine/level-format/kinds.ts";
import { kindDefaultsFrom, readLevelSettings } from "../engine/level-format/settings.ts";
import { availableLevelFiles, readGlobals, readLevelFile } from "./level-sources.ts";

/** The versions to resolve, matching the corpus oracle's list. */
export const VERSIONS = [
  Version.of("1", "main"),
  Version.of("2", "main"),
  Version.of("1", "contrib", "hard"),
];

/** One picture reference, as found in a level. */
export interface Reference {
  readonly key: string;
  readonly kind: string;
  readonly origin: string;
}

/** What a sweep of the corpus found, and enough about it to notice an empty one. */
export interface Sweep {
  readonly refs: readonly Reference[];
  readonly files: number;
  readonly levels: number;
}

/**
 * Every level file that may declare a level.
 *
 * `summary.ld` is the index rather than a level, and `globals.ld` holds the shared
 * definitions both are resolved against. `example.ld` is documentation: its picture names are
 * illustrative and would put keys in the manifest that no level uses.
 *
 * A contributed level naming a picture the vendored levels do not use must still get an entry,
 * or the build fails for the level that is supposed to be adding to the game. Failing on an
 * unknown key is the point of the manifest, and a contributed level is exactly the case it exists
 * to catch.
 */
export function levelFiles(): string[] {
  const files = availableLevelFiles().filter((f) => f !== "globals.ld");
  // Zero is not a legitimate state here. There are 79 vendored levels, so an empty list means an
  // incomplete checkout or a changed directory layout — and an empty manifest would silently
  // blank every level rather than fail.
  if (files.length === 0) {
    throw new Error(
      "No level files found in levels/upstream/ or levels/. The vendored levels are " +
        "committed, so this is an incomplete checkout rather than a missing fetch.",
    );
  }
  return files;
}

/** Every picture key the bundled levels reference, deduplicated, first kind winning. */
export function collectReferences(): Sweep {
  const globals = parseLd(readGlobals(), "globals.ld");
  const refs: Reference[] = [];
  let files = 0;
  let levels = 0;

  for (const file of levelFiles()) {
    const parsed = parseLd(readLevelFile(file), file);
    const sections = parsed.definitions.filter((d) => d.value.type === "section");
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
          // validator (task 2.13) is what reports that; this sweep's job is
          // to collect picture names, not to duplicate its diagnostics.
          continue;
        }
        const where = `${file} ${def.name}[${version.toString()}]`;
        for (const kind of table.kinds) {
          for (const key of kind.pictures) {
            if (key === "") continue;
            refs.push({ key, kind: kind.name, origin: where });
          }
        }
      }
    }
  }

  // Deduplicate by key, keeping the first kind that used it.
  //
  // There is deliberately no conflict check. A picture's role can differ between versions of one
  // level — `ziehlen.ld` uses `mziAlle.xpm` as a colour at [1, main] and as a goal blob at
  // [1, contrib, hard] — and role belongs to the level's kind, which the game already has. An
  // earlier version of the emitter rejected that as a conflict and refused to emit a manifest,
  // which was wrong about the data rather than right about it.
  const byKey = new Map<string, Reference>();
  for (const ref of refs) if (!byKey.has(ref.key)) byKey.set(ref.key, ref);

  return { refs: [...byKey.values()], files, levels };
}