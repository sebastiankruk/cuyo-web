/**
 * The art manifest: picture names as logical keys, resolved to something drawable.
 *
 * A level file names its pictures - `pics inGruen.xpm inGelb.xpm` - and nothing else.
 * Turning that name into pixels is this project's problem, not the level's, and the
 * mapping is *data*: a table emitted at build time, so that resolving a key is a map
 * lookup and never a filesystem call.
 *
 * That last point is the design, not an implementation detail. A resolver that opened
 * files would work until the day it ran in a browser bundle, where there is no
 * filesystem, and would then fail on exactly the levels it had been validating.
 * Keeping resolution to a pure lookup means the same code path serves the build-time
 * validator, the browser, and the tests, so a key that resolves in one resolves in
 * all three.
 *
 * There is no authored artwork yet, and upstream's 912 spritesheets are GPL-2.0 and
 * deliberately not shipped (see `scripts/check-no-upstream-art.sh`). So every entry
 * currently describes *generated* art: the manifest says what a key should look like,
 * and the renderer draws it. Swapping in real sprites later means adding an
 * `image` source to this union and emitting a different manifest, with nothing else
 * changing.
 */

/** How to draw one picture. */
export type ArtSource =
  /**
   * Procedurally drawn from the key.
   *
   * The parameters are stored rather than recomputed so that the manifest is the
   * authority: a key's appearance is decided when the manifest is emitted and does
   * not drift if the hashing function is ever changed.
   */
  | {
      readonly kind: "generated";
      /** Hue in degrees, 0 to 360. */
      readonly hue: number;
      /** Saturation and lightness in percent. */
      readonly saturation: number;
      readonly lightness: number;
    }
  /** A raster asset, for when real artwork exists. */
  | { readonly kind: "image"; readonly path: string };

/** One picture the build knows how to draw. */
export interface ArtEntry {
  /**
   * The logical key: the picture name exactly as the level file wrote it, extension
   * and all.
   *
   * Upstream sprites are all `.xpm.gz`, so the extension is load-bearing - but it is
   * *not* normalised away, because a level that names `logo.png` is naming something
   * specific and silently rewriting it would hide a typo.
   */
  readonly key: string;
  readonly source: ArtSource;
  /**
   * How many icons this picture has.
   *
   * `Bilddatei::anzBildchen()`, which is `(breite/gric) * (hoehe/gric)` at `gric` = 32 —
   * upstream computes it from the image and this project does not ship the images, so the
   * number is stated here and transcribed by `levels-src/transcribe-picture-icons.ts`. See
   * `engine/level-format/picture-icons.ts` for why it is committed rather than measured.
   *
   * **Two decisions hang off it**, and both are silent when it is wrong:
   *
   * - `Sorte::ladeCualEvents` (`src/sorte.cpp:104-130`) picks the default draw code from it:
   *   more than one picture *file* is `default3`, one file with several icons is
   *   `default2`/`default2g`, and a single-icon file is `default1`. Those draw visibly
   *   different things.
   * - `BildStapel::speichereBild` refuses a `pos` outside it, because blitting past the end of
   *   a file would draw whatever follows it there.
   *
   * **Never zero for a key that is in the manifest.** A kind declared by a `greypic` or
   * `startpic` *word* has no picture file at all unless its own section declares `pics`, and
   * upstream opens no image for one — so such a kind has no key here rather than a key with no
   * icons. That is the fix for a confusing earlier state, where `artKey` fell back to the kind's
   * own name and four kind names were registered as pictures with zero icons.
   */
  readonly icons: number;
  /**
   * The kind this picture was first seen on.
   *
   * Recorded so a resolution failure can say which kind asked for the missing key,
   * which is the difference between a diagnostic someone can act on and one they have
   * to search for.
   */
  readonly firstKind: string;
}

/** A whole manifest: key to entry. */
export interface ArtManifest {
  readonly entries: ReadonlyMap<string, ArtEntry>;
}

/** Raised when a level names a picture the manifest does not carry. */
export class ArtKeyError extends Error {
  constructor(
    readonly key: string,
    readonly kind: string,
    readonly origin: string,
  ) {
    super(
      `Kind ${kind} names picture "${key}", which is not in the art manifest ` +
        `(${origin}). Every picture a level names must be registered by the build ` +
        `step; re-run the manifest generator after adding a level or a picture.`,
    );
    this.name = "ArtKeyError";
  }
}

/** An empty manifest, for tests and for a level that names no pictures. */
export function emptyManifest(): ArtManifest {
  return { entries: new Map() };
}

/**
 * Builds a manifest from entries, keeping the first entry for each key.
 *
 * Duplicate keys are normal rather than exceptional: two kinds may share a picture,
 * and a picture's role can legitimately differ between versions of the same level.
 * `ziehlen.ld` uses `mziAlle.xpm` as an ordinary colour at `[1, main]` and as a goal
 * blob at `[1, contrib, hard]` - the first version of this function treated that as a
 * conflict and refused to build a manifest, which was wrong about the data rather than
 * right about it.
 *
 * Which is also why an entry carries no role or version count. Those are properties of
 * a *kind* in a *level*, and the game already has them from `Kind`; storing them on
 * the picture would have meant storing one version's answer for a key that has
 * several. A manifest entry answers one question - can this name be drawn - and that
 * is all it holds.
 */
export function artManifest(entries: readonly ArtEntry[]): ArtManifest {
  const map = new Map<string, ArtEntry>();
  for (const entry of entries) {
    // First entry wins, so a shared picture keeps the kind it was first seen on.
    if (!map.has(entry.key)) map.set(entry.key, entry);
  }
  return { entries: map };
}

/**
 * Resolves a picture name, or throws naming the key, the kind and where it came from.
 *
 * No filesystem access, deliberately - see the note at the top of the file.
 */
export function resolveArtKey(
  manifest: ArtManifest,
  key: string,
  kind: string,
  origin: string,
): ArtEntry {
  const entry = manifest.entries.get(key);
  if (entry === undefined) throw new ArtKeyError(key, kind, origin);
  return entry;
}

/** Whether the manifest carries a key, without throwing. */
export function hasArtKey(manifest: ArtManifest, key: string): boolean {
  return manifest.entries.has(key);
}

/** Every key in the manifest, sorted, for stable generated output. */
export function manifestKeys(manifest: ArtManifest): string[] {
  return [...manifest.entries.keys()].sort();
}
