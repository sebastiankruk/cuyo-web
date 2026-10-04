/**
 * Build step: transcribe each picture's icon count out of upstream's spritesheets.
 *
 * Run with `node levels-src/transcribe-picture-icons.ts`. **Not part of `make check`**, and
 * deliberately so: it needs the upstream C++ tree, which is gitignored and absent on CI, so
 * including it would make a check that silently measures nothing. The output is committed, so
 * the property the game depends on — every picture a level names has a stated icon count — is
 * checkable without the tree. `make fetch-corpus` then this script is how the table is
 * refreshed; `engine/level-format/picture-icons.test.ts` is the CI-facing half, which asserts
 * the table covers the manifest and, where the tree exists, re-derives each figure from the
 * image rather than trusting it.
 *
 * ## Why a committed table at all, when the counts are just image dimensions
 *
 * Upstream reads them from the pixels: `Bilddatei::anzBildchen()` is
 * `(mBreite / gric) * (mHoehe / gric)` (`src/bilddatei.cpp:205`). This project does not ship
 * those spritesheets — they are GPL-2.0 and deliberately not redistributed, see
 * `scripts/check-no-upstream-art.sh` — so at run time there is no image to measure and no way
 * to recover the number from one.
 *
 * And the number is not decoration. It decides two things:
 *
 * - **`Sorte::ladeCualEvents`' choice of default draw code** (`src/sorte.cpp:104-130`): more
 *   than one picture *file* is `default3`, otherwise a first file with more than one icon is
 *   `default2` (or `default2g` for grass) and a single-icon file is `default1`. `default1 = *`
 *   and `default2 = {schema16}` draw visibly different things.
 * - **The range check on `pos`.** `BildStapel::speichereBild` refuses a `pos` outside the
 *   file's icon count, because blitting at an offset past the end would draw whatever follows
 *   in the image — a silently wrong picture rather than an error.
 *
 * So the count is *ours* to state, since the artwork is ours: it is the number of icons the
 * new artwork for that key has. Transcribing upstream's figure is the honest starting value,
 * because upstream's icons and Cual's `pos` values are a matched pair — a level's Cual asks
 * for `pos = 7` because upstream's file had at least eight icons — and starting anywhere else
 * would mean guessing which indices the corpus uses.
 *
 * ## Four keys are not pictures, and one file will not decompress
 *
 * `Grau`, `Starr`, `Start` and `start_dummy` are **kind names, not picture names**. A kind
 * declared by a `greypic`/`startpic` *word* has no picture file at all unless its own section
 * declares `pics`, and upstream opens no image for one — so "no image on disk" is the correct
 * answer for them and the entry is 0. That is the same fact `defaultCode = null` already
 * records, reached from the other side.
 *
 * `itGras.xpm.gz` has a valid gzip header and a deflate stream Node's one-shot `gunzipSync`
 * rejects outright. A streaming inflate recovers the first 16 kB, and the XPM header sits about
 * 60 bytes in, so the one line this script needs is still there. Upstream's data is allowed to
 * be slightly broken; this script's job is to say what it could read and to refuse to guess
 * about what it could not.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { constants as Z, createGunzip, gunzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectReferences } from "./picture-keys.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PICS = resolve(HERE, "../.context/upstream-cuyo/data/pics");
const OUT = resolve(HERE, "../engine/level-format/picture-icons.ts");

/** `gric`, the cell size in pixels. Every icon is one cell. */
const GRIC = 32;

/**
 * The XPM header's `<width> <height> <colours> <chars-per-pixel>`, in quotes.
 *
 * Two things about it are not uniform across the 900-odd files, and both had to be measured
 * rather than assumed. **The numbers are not always followed immediately by the closing
 * quote** — `aDragon.xpm` writes `"128 64 2 1 "` with a trailing space, so a pattern anchored
 * on `"` after the last digit silently found no header in that file and dropped its key from
 * the table. And **the header is not always on line 4**: the uncompressed files carry the full
 * GPL notice first and put it around line 15. So the pattern allows trailing spaces and the
 * scan covers forty lines, which is still cheap and is bounded.
 */
function xpmSize(source: string): { width: number; height: number } | null {
  for (const line of source.split("\n", 40)) {
    const m = /^\s*"?\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(line);
    if (m) return { width: Number(m[1]), height: Number(m[2]) };
  }
  return null;
}

/** A one-shot decompression that reports failure as null instead of throwing. */
function tryGunzip(raw: Buffer): Buffer | null {
  try {
    return gunzipSync(raw);
  } catch {
    return null;
  }
}

/**
 * Whatever a streaming inflate managed before the stream went bad.
 *
 * `Z_SYNC_FLUSH` on the way out is what stops zlib demanding a clean end-of-stream, and the
 * promise resolves on `close` rather than on `end` — `end` never arrives for a file whose
 * trailer is bad, and a script that waited for it would wait forever.
 */
function beforeError(raw: Buffer): Promise<Buffer> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    const stream = createGunzip();
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    // Expected for the corrupt files; handled by using the chunks collected so far.
    stream.on("error", () => undefined);
    stream.on("close", () => done(Buffer.concat(chunks)));
    try {
      stream.write(raw);
      stream.flush(Z.Z_SYNC_FLUSH);
    } catch {
      done(Buffer.concat(chunks));
      return;
    }
    stream.end();
  });
}

/**
 * The file's bytes, whole or partial.
 *
 * Both are offered rather than one or the other, because "decompressed cleanly but the header
 * is further down" and "decompressed only as far as the corruption" want the same treatment:
 * look for the header in whatever arrived.
 */
async function read(key: string): Promise<{ size: { width: number; height: number }; file: string } | null> {
  const base = key.endsWith(".xpm") ? key.slice(0, -".xpm".length) : key;
  for (const name of [`${base}.xpm.gz`, `${base}.xpm`, key]) {
    const path = resolve(PICS, name);
    if (!existsSync(path)) continue;
    const raw = readFileSync(path);
    const whole = name.endsWith(".gz") ? tryGunzip(raw) : raw;
    if (whole !== null) {
      const size = xpmSize(whole.toString("latin1"));
      if (size) return { size, file: name };
      continue;
    }
    const size = xpmSize((await beforeError(raw)).toString("latin1"));
    if (size) return { size, file: name };
  }
  return null;
}

async function main(): Promise<void> {
  if (!existsSync(PICS)) {
    throw new Error(
      `No upstream spritesheets at ${PICS}. Run \`make fetch-corpus\` first; this step ` +
        `reads image dimensions and there is nothing to read them from.`,
    );
  }
  // **The key set comes from the level files, not from the committed manifest.** It used to be
  // read out of the manifest, which made this step unable to bootstrap the emitter: a newly
  // referenced key could not be measured because the manifest listing it could not be emitted
  // without a count for it. `picture-keys.ts` is the shared answer, so the two steps have a
  // one-way dependency that can actually be run.
  const keys = collectReferences().refs.map((ref) => ref.key);
  if (keys.length === 0) {
    throw new Error(
      "No picture keys found in the bundled levels, so there is nothing to transcribe. " +
        "Either the vendored levels are missing or the parser stopped recognising `pics`.",
    );
  }

  const measured: string[] = [];
  const absent: string[] = [];
  const onDisk = readdirSync(PICS).length;

  for (const key of [...keys].sort()) {
    const found = await read(key);
    if (found === null) {
      absent.push(key);
      continue;
    }
    measured.push(
      `  ["${key}", ${(found.size.width / GRIC) * (found.size.height / GRIC)}],` +
        ` // ${found.file} ${found.size.width}x${found.size.height}`,
    );
  }

  writeFileSync(OUT, source(measured, absent, onDisk, keys.length));
  process.stdout.write(
    `transcribe-picture-icons: ${measured.length} of ${keys.length} keys measured from ` +
      `${onDisk} images on disk\n` +
      `transcribe-picture-icons: written to ${OUT}\n`,
  );
  if (absent.length > 0) {
    // A warning and not a throw, because for these keys "there is no image" is the answer
    // rather than a gap in the reading — see the header. The table records them as 0, and the
    // rule that needs a count only asks about kinds that declare pictures.
    process.stdout.write(
      `transcribe-picture-icons: ${absent.length} keys have no upstream image and are ` +
        `recorded as 0 (not a picture): ${absent.join(", ")}\n`,
    );
  }
}

function source(measured: readonly string[], absent: readonly string[], onDisk: number, total: number): string {
  return `// GENERATED by levels-src/transcribe-picture-icons.ts - do not edit by hand.
//
// One entry per picture key the committed art manifest carries: how many icons that picture
// has, which is \`Bilddatei::anzBildchen()\` = \`(breite/gric) * (hoehe/gric)\` at \`gric\` =
// ${GRIC} (\`src/bilddatei.cpp:205\`), transcribed from upstream's spritesheets.
//
// It is committed rather than computed at build time because upstream's spritesheets are
// GPL-2.0 and deliberately not shipped - see scripts/check-no-upstream-art.sh - so at run
// time there is no image to measure. The artwork is this project's own, so the count is a
// fact about it, and the honest starting value is the number of icons the Cual that draws it
// expects.
//
// Two things depend on it, and both fail visibly when it is wrong:
//
//   - \`Sorte::ladeCualEvents\` (\`src/sorte.cpp:104-130\`) picks \`default3\` for more than one
//     picture file, \`default2\`/\`default2g\` for one file with several icons and \`default1\`
//     for a single-icon file. Those draw visibly different things.
//   - \`BildStapel::speichereBild\` refuses a \`pos\` outside the count, because blitting past
//     the end of a file would draw whatever follows it.
//
// Measured from ${onDisk} images on disk, covering ${measured.length} of ${total} manifest
// keys. The figure after each key is the file it came from and that file's pixel size, so a
// transcription slip is checkable against the image rather than taken on trust.

/** How many icons each picture key has. Zero means the key is not a picture. */
export const PICTURE_ICONS: ReadonlyMap<string, number> = new Map<string, number>([
${measured.join("\n")}
${absent.map((key) => `  ["${key}", 0],`).join("\n")}
]);

/** The icon count for a key, or null when the table does not carry it. */
export function iconCountOf(key: string): number | null {
  return PICTURE_ICONS.get(key) ?? null;
}
`;
}

await main();