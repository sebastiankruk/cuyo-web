/**
 * Where level files come from.
 *
 * Three sources, in the order they are consulted, and keeping them apart matters
 * more than it looks:
 *
 * - **Vendored levels** live in `levels/upstream/`, committed. These are upstream's own
 *   79 levels, copied verbatim, GPL-2.0-or-later like the rest of this project - see
 *   `levels/upstream/README.md` for the provenance and the licence. They used to be
 *   fetched by `make fetch-corpus` into a local-only checkout, which meant a fresh clone
 *   could not build, could not run five of the test files, and had to reach a Debian
 *   archive pool to do either.
 * - **Contributed levels** live in `levels/`, also committed. They have no upstream
 *   index, so something here has to decide they exist and where they appear.
 * - **An upstream checkout** at `.context/upstream-cuyo/`, optional and local-only. It
 *   is no longer needed to build or test anything. It exists for one purpose -
 *   `make check-levels-upstream`, which diffs the vendored copy against upstream's own
 *   to prove the files have not been altered. Without it, that check is skipped and
 *   says so.
 *
 * Contributed files win over vendored ones with the same name, so a level can be
 * corrected in place without a rename. That is deliberate: the alternative is that the
 * vendored copy silently shadows a fix. It also means a vendored file and a corrected
 * one are distinguishable at a glance - they are in different directories, which is
 * why vendored and contributed are not simply merged into one `levels/`.
 *
 * Everything here is build-time only.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The vendored copy of upstream's levels, committed to this repository.
 *
 * Under `levels/` rather than at the root because a `git log` on a level file should
 * not be mixed up with a `git log` on a build script, and in a subdirectory because
 * `levels/` itself holds contributed levels that may deliberately replace these.
 */
export const VENDORED_DIR = resolve(HERE, "../levels/upstream");

/**
 * Contributed levels, tracked in git.
 *
 * At the repository root rather than under `levels-src/`, because `levels-src` is
 * build-time tooling and its `README` says so explicitly. A level file is content
 * someone else wrote, and mixing it with the tools that read it is the sort of
 * arrangement that makes `git log` on a level unreadable.
 */
export const CONTRIB_DIR = resolve(HERE, "../levels");

/**
 * An optional upstream checkout, for the comparison check only.
 *
 * Not needed to build, test, or run. `CUYO_DATA_DIR` overrides it for anyone who
 * already has the tree somewhere else.
 */
export const CHECKOUT_DIR =
  process.env["CUYO_DATA_DIR"] ??
  resolve(HERE, "../.context/upstream-cuyo/data");

/** Where generated level files are served from, and where they are copied to. */
export const PUBLIC_LEVELS_DIR = resolve(HERE, "../public/levels");

/** True when an upstream checkout is present, so the comparison check can run. */
export function haveCheckout(): boolean {
  return existsSync(resolve(CHECKOUT_DIR, "summary.ld"));
}

/** Upstream's `globals.ld`, which every level resolves its names against. */
export function readGlobals(): string {
  const path = resolve(VENDORED_DIR, "globals.ld");
  if (!existsSync(path)) {
    throw new Error(
      `No globals.ld at ${path}. The vendored level files are missing, which ` +
        `means an incomplete checkout rather than a missing corpus fetch.`,
    );
  }
  return readFileSync(path, "latin1");
}

/**
 * The text of a level file, from whichever source holds it.
 *
 * Contributed first, so a contributed file of the same name replaces the vendored one
 * rather than the other way round.
 */
export function readLevelFile(filename: string): string {
  const contrib = resolve(CONTRIB_DIR, filename);
  if (existsSync(contrib)) return readFileSync(contrib, "latin1");
  const vendored = resolve(VENDORED_DIR, filename);
  if (existsSync(vendored)) return readFileSync(vendored, "latin1");
  throw new Error(
    `Level file ${filename} is in neither levels/upstream/ nor levels/ ` +
      `(${VENDORED_DIR}, ${CONTRIB_DIR}).`,
  );
}

/** Whether a level file exists in either committed source. */
export function levelFileExists(filename: string): boolean {
  return (
    existsSync(resolve(VENDORED_DIR, filename)) ||
    existsSync(resolve(CONTRIB_DIR, filename))
  );
}

/** Which committed source a level file comes from. */
export type LevelSource = "contrib" | "vendored";

export function levelSource(filename: string): LevelSource {
  return existsSync(resolve(CONTRIB_DIR, filename)) ? "contrib" : "vendored";
}

/**
 * Every level file available, in a stable order.
 *
 * Only the two committed sources. The upstream checkout is deliberately not consulted
 * here: a level that exists solely in someone's local checkout is not something the
 * catalogue can promise to ship, and quietly indexing it would produce a build that
 * works on one machine and not another.
 */
export function availableLevelFiles(): string[] {
  const names = new Set<string>();
  for (const dir of [VENDORED_DIR, CONTRIB_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ld")) continue;
      if (f === "summary.ld" || f === "example.ld") continue;
      names.add(f);
    }
  }
  return [...names].sort();
}

/**
 * The vendored `summary.ld`, which indexes upstream's own levels.
 *
 * Read from `levels/upstream/` rather than from a checkout, so the catalogue no longer
 * depends on anything outside the repository.
 */
export function readVendoredSummary(): string {
  const path = resolve(VENDORED_DIR, "summary.ld");
  if (!existsSync(path)) {
    throw new Error(
      `No summary.ld at ${path}. The vendored level files are missing, which ` +
        `means an incomplete checkout rather than a missing corpus fetch.`,
    );
  }
  return readFileSync(path, "latin1");
}

/**
 * The contributed summary, and the summary that indexes contributed levels.
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
