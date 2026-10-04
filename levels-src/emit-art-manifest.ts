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
 *
 * ## The one-way dependency on `transcribe-picture-icons.ts`, and why it fails loudly
 *
 * Each entry carries an icon count, which is the picture's and cannot be derived from the key
 * text. This script *discovers* the keys; `transcribe-picture-icons.ts` *measures* them against
 * upstream's spritesheets and writes `engine/level-format/picture-icons.ts`. So the order is
 * this script, then that one, then this one again — and **a key with no figure is a thrown
 * error rather than a 0**, because a 0 is a real value meaning "this key is not a picture" and
 * a figure of 0 would quietly pick `default1` for a picture with sixteen faces.
 *
 * In practice the committed table already covers the committed manifest, so neither run is part
 * of `make check`. Only adding a level changes that, and then the error says which target to run.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artManifest } from "../engine/level-format/art.ts";
import type { ArtEntry, ArtManifest } from "../engine/level-format/art.ts";
import { iconCountOf } from "../engine/level-format/picture-icons.ts";
import { collectReferences } from "./picture-keys.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "generated/art-manifest.ts");

/**
 * The generated appearance for a picture.
 *
 * Derived from the key text rather than looked up, so adding a level never requires
 * editing this file. The values are stored in the manifest so that a change to this
 * function does not silently repaint every level that was generated before it - the
 * manifest is the record of what was decided, not a cache of a computation.
 *
 * **These colours are not what the game draws.** They were, once: the renderer used to
 * look a kind's colour up from its art key, and this is where that lookup came from.
 * It is per-key and therefore wrong by construction - two picture names in one level
 * will sometimes land a couple of degrees apart, and across the 79 real levels 17 pairs
 * came out under 25° with a worst case of 2°, in `pfeile.ld`, whose kinds are arrows.
 * A palette is a *set* of colours for a level's kinds and has to be chosen as one, so
 * the renderer now uses `render/palette.ts`, which chooses by perceptual distance.
 *
 * The fields are kept because they are cheap, they document what a key would look like,
 * and `resolveArtKey` still needs the manifest for the thing that matters - failing the
 * build when a level names a picture nothing else does. But nothing should read these
 * three numbers to pick a colour. That is how the bug comes back.
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
    icons: ${entry.icons},
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
    icons: ${entry.icons},
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
//
// \`icons\` is the one number here that is not derivable from the key text: how many icons
// the picture has, which decides both the default draw code a kind runs and whether a
// \`pos\` Cual asks for is in range. It comes from engine/level-format/picture-icons.ts,
// which is transcribed from upstream's image dimensions and committed, because there is no
// image at run time to measure.

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
  // Already deduplicated by the sweep, which owns the first-kind-wins rule.
  const byKey = new Map(refs.map((ref) => [ref.key, ref]));

  // Named before the map, so the failure can say how many keys are missing rather than only the
  // first — a level adding a kind with three pictures would otherwise take three runs.
  const missingIcons = [...byKey.keys()].filter((key) => iconCountOf(key) === null);
  const entries: ArtEntry[] = [...byKey.values()].map((ref) => {
    const icons = iconCountOf(ref.key);
    if (icons === null) {
      throw new Error(
        `art-manifest: picture '${ref.key}' (first seen on kind ${ref.kind}) has no stated ` +
          `icon count, so it cannot be emitted. Run \`make picture-icons\` — it needs \`make ` +
          `fetch-corpus\` first — and then run this again. ${missingIcons.length} key(s) in all.`,
      );
    }
    return {
      key: ref.key,
      source: generatedSource(ref.key),
      icons,
      firstKind: ref.kind,
    };
  });

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
