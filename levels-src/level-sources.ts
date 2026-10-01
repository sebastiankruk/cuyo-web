/**
 * Where level files come from.
 *
 * Two sources, and keeping them apart matters more than it looks:
 *
 * - **Upstream's own levels** live in a local-only checkout at
 *   `.context/upstream-cuyo/data/`, fetched by `make corpus`. They are GPL-2.0 content
 *   this repository deliberately does not commit, and they are the *source of truth for
 *   the catalogue* - `summary.ld` is what says which levels exist, in what order, and on
 *   which track.
 * - **Contributed levels** live in `levels/`, which is committed. They have no upstream
 *   index, so something here has to decide they exist and where they appear.
 *
 * Reading two directories as one flat list would be simpler and wrong in a specific way:
 * a contributed level is *not* in `summary.ld`, so nothing would place it on a track, and
 * a level absent from every `level[...]` list is unreachable in the original game. The
 * catalogue has to say so rather than quietly inventing a track for it.
 *
 * Everything here is build-time only.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The local-only upstream checkout. */
export const UPSTREAM_DIR =
  process.env["CUYO_DATA_DIR"] ?? resolve(HERE, "../.context/upstream-cuyo/data");

/**
 * Contributed levels, tracked in git.
 *
 * At the repository root rather than under `levels-src/`, because `levels-src` is
 * build-time tooling and its `README` says so explicitly. A level file is content
 * someone else wrote, and mixing it with the tools that read it is the sort of
 * arrangement that makes `git log` on a level unreadable.
 */
export const CONTRIB_DIR = resolve(HERE, "../levels");

/** Where generated level files are served from, and where they are copied to. */
export const PUBLIC_LEVELS_DIR = resolve(HERE, "../public/levels");

/** True when the upstream corpus has been fetched. */
export function haveUpstream(): boolean {
  return existsSync(resolve(UPSTREAM_DIR, "summary.ld"));
}

/** Upstream's `globals.ld`, which every level resolves its names against. */
export function readGlobals(): string {
  const path = resolve(UPSTREAM_DIR, "globals.ld");
  if (!existsSync(path)) {
    throw new Error(
      `No globals.ld at ${path}. Run "make fetch:corpus" first, or set ` +
        `CUYO_DATA_DIR.`,
    );
  }
  return readFileSync(path, "latin1");
}

/** The text of a level file, from whichever source holds it. */
export function readLevelFile(filename: string): string {
  const contrib = resolve(CONTRIB_DIR, filename);
  if (existsSync(contrib)) return readFileSync(contrib, "latin1");
  const upstream = resolve(UPSTREAM_DIR, filename);
  if (existsSync(upstream)) return readFileSync(upstream, "latin1");
  throw new Error(
    `Level file ${filename} is in neither levels/ nor the upstream checkout ` +
      `(${UPSTREAM_DIR}).`,
  );
}

/** Whether a level file exists in either source. */
export function levelFileExists(filename: string): boolean {
  return (
    existsSync(resolve(CONTRIB_DIR, filename)) ||
    existsSync(resolve(UPSTREAM_DIR, filename))
  );
}

/** Which source a level file comes from. */
export type LevelSource = "contrib" | "upstream";

export function levelSource(filename: string): LevelSource {
  return existsSync(resolve(CONTRIB_DIR, filename))
    ? "contrib"
    : "upstream";
}

/**
 * Every level file available, contributed first.
 *
 * A contributed file with the same name as an upstream one wins, so a level can be
 * corrected in place without a rename. That is deliberate: the alternative is that the
 * upstream copy silently shadows a fix.
 */
export function availableLevelFiles(): string[] {
  const names = new Set<string>();
  if (existsSync(CONTRIB_DIR)) {
    for (const f of readdirSync(CONTRIB_DIR)) {
      if (f.endsWith(".ld")) names.add(f);
    }
  }
  if (haveUpstream()) {
    for (const f of readdirSync(UPSTREAM_DIR)) {
      if (!f.endsWith(".ld")) continue;
      if (f === "summary.ld" || f === "example.ld") continue;
      names.add(f);
    }
  }
  return [...names].sort();
}

/**
 * The contributed levels, and the summary that indexes them.
 *
 * A contributed level set is indexed the same way upstream's is: a `summary.ld` beside
 * the files, with `Name = { filename name author }` sections and `level[track]` lists.
 * Reusing the format rather than inventing a sidecar means a contributor copies an
 * upstream file and changes its contents, with nothing new to learn.
 *
 * Optional, because a repository with no contributed levels yet has no `summary.ld` in
 * `levels/`, and every generator has to work without one.
 */
export function contribSummary(): string | null {
  const path = resolve(CONTRIB_DIR, "summary.ld");
  if (!existsSync(path)) return null;
  return readFileSync(path, "latin1");
}
