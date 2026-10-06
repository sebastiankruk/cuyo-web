// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The build gate, watched failing — task 12.4.
 *
 * ## The thing being tested
 *
 * 12.4 asks for two things and they are not the same thing:
 *
 * 1. **`npm run build` compiles every bundled level and fails if one does not parse or compile.**
 *    `levels-src/validate-levels.ts` already did the compiling and already failed on the first
 *    error; it was simply not in the build. It is now `npm run build:levels`, and both `build`
 *    and `build:terse` run it before `tsc`. Levels first, deliberately: a level that does not
 *    parse is a more specific failure than a type error, and it is the one this gate exists for.
 *
 * 2. **And that it can be verified to fail.** A gate nobody has seen refuse is an assumption
 *    wearing a test's clothes. "It exits non-zero" is cheap to claim and this file is what turns
 *    the claim into an observation — by pointing the gate at a temporary corpus containing one
 *    deliberately broken level and watching it refuse, with the broken file named.
 *
 * ## Why a real level is copied rather than a synthetic one written here
 *
 * A hand-written level would have to be *valid* for the passing case to mean anything, and the
 * failure mode of getting that wrong is quiet: the gate refuses the harness, the "accepts a good
 * corpus" test fails, and the obvious fix is to relax the assertion until it passes. Copying
 * upstream's own `maennchen.ld` — 1.3 KB, the smallest in the corpus, and genuinely compilable —
 * makes the passing case true by construction, so a failure there is a finding about the gate
 * rather than about this file.
 *
 * ## Why the corpus is copied rather than edited
 *
 * The other way to make a level that does not compile is to break one of the 79. That is racy —
 * other test files read the same files in parallel workers — and alarming, because a failure that
 * leaves the corpus modified is a bad thing to have automated. So `CUYO_LEVELS_DIR` overrides
 * *both* committed level directories, and this file copies `globals.ld`, `maennchen.ld` and a
 * summary into a temporary directory and runs the gate there.
 *
 * The copy is small because the gate reads only what `summary.ld` indexes. It does not walk the
 * directory, and its own header says why: a file present in the directory but absent from the
 * index is unreachable, which is a different question and the wrong one.
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const VENDORED = resolve(REPO, "levels/upstream");

/**
 * The level copied into every temporary corpus, and the settings it is broken by changing.
 *
 * `numexplode = 10` is inside `maennchen`'s own section and is a number the engine reads with
 * `ownNumber`, which *fails loudly* rather than shrugging (`scope.ts`: "is the word 'x' but a
 * number was expected"). So replacing it with a word produces a level that **parses** and then
 * fails to **compile** — the interesting case, and a different code path from a parse error.
 */
const SAMPLE = "maennchen.ld";
const BREAKABLE = "numexplode = 10";

/** The script under test, and the flags it needs for Node to read TypeScript. */
const SCRIPT = resolve(HERE, "validate-levels.ts");
const TS_FLAGS = ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"];

/** Every temporary corpus this file made, removed afterwards however the run ended. */
const made: string[] = [];

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/**
 * A temporary corpus: the real `globals.ld`, and `maennchen.ld` — intact or with one token
 * replaced — indexed by a summary in upstream's own format.
 *
 * The summary names the file rather than the level's section, and the section keeps its own name
 * `Maennchen`, because that is how a corrected level is done too: a contributed file may replace a
 * vendored one under a different filename.
 */
function corpus(replacements: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(resolve(tmpdir(), "cuyo-gate-"));
  made.push(dir);
  cpSync(resolve(VENDORED, "globals.ld"), resolve(dir, "globals.ld"));

  let level = readFileSync(resolve(VENDORED, SAMPLE), "latin1");
  for (const [from, to] of Object.entries(replacements)) {
    // Asserted rather than assumed: if the sample level ever stops containing the text the test
    // means to break, the substitution silently becomes a no-op and every "gate refuses" test
    // below would start failing for a reason that has nothing to do with the gate.
    expect(level, `sample level no longer contains ${JSON.stringify(from)}`).toContain(from);
    level = level.replace(from, to);
  }
  writeFileSync(resolve(dir, SAMPLE), level, "latin1");

  writeFileSync(
    resolve(dir, "summary.ld"),
    ['Maennchen = {', `  filename = "${SAMPLE}"`, '  name = "Characters"', '  author = "Mark Weyer"', "}", ""].join(
      "\n",
    ),
    "latin1",
  );
  return dir;
}

/**
 * The child's environment, with `CUYO_AI_MODE` removed.
 *
 * `validate-levels.ts:163` reads it and suppresses the success report under it — it is a flag for
 * terser output in `make`, not part of the gate's behaviour. It is inherited by vitest, so
 * without removing it this file's assertions passed when run directly and failed under
 * `make check`, which is the worst possible shape for a test: correct alone, wrong in CI. The
 * gate always reports here, and these tests can then assert on what it said.
 */
function childEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CUYO_LEVELS_DIR: dir };
  delete env["CUYO_AI_MODE"];
  return env;
}

/** Run the gate against a corpus, and report what it did rather than throwing on failure. */
function runGate(dir: string): { code: number; output: string } {
  try {
    const output = execFileSync("node", [...TS_FLAGS, SCRIPT], {
      cwd: REPO,
      env: childEnv(dir),
      encoding: "latin1",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("the build gate", () => {
  it(
    "accepts a corpus whose every level compiles",
    () => {
      // The other half of "fails on a level that does not compile": a gate that refused everything
      // would satisfy that assertion too. So the passing case is tested, and **first**, because if
      // the copy or the summary were wrong then the failing tests below would pass for the wrong
      // reason — the gate would be refusing the whole harness rather than the broken level.
      const { code, output } = runGate(corpus({}));
      expect(code, `gate refused a good corpus:\n${output}`).toBe(0);
      // And it really did compile something, rather than finding no levels and saying so. Six
      // sections, because `maennchen.ld` is one file holding six kinds and the gate counts kinds
      // as the thing it compiled; "from 1 files" is the level count, which is the number this
      // corpus was built to be.
      expect(output).toMatch(/6 level sections from 1 files, all compiled/);
    },
    120_000,
  );

  it(
    "fails when a level parses but does not compile",
    () => {
      const { code, output } = runGate(corpus({ [BREAKABLE]: "numexplode = kaputt" }));
      // **The claim 12.4 makes.**
      expect(code, `gate accepted a level that does not compile:\n${output}`).not.toBe(0);
      // And it says which, because "the build failed" is not a diagnosis — and it names the
      // *setting*, not just the file, which is the difference between a five-second fix and a
      // bisect through 79 levels.
      expect(output).toContain(BREAKABLE.split(" ")[0] ?? "numexplode");
      expect(output).toContain("kaputt");
    },
    120_000,
  );

  it(
    "fails when a level does not parse at all",
    () => {
      // Truncating mid-section is rejected by the parser, before any of the compile step runs. The
      // two failure modes are separate paths through the gate and either could have lost its exit
      // code on the way out, so both are watched rather than one standing in for the other.
      const { code, output } = runGate(corpus({ [BREAKABLE]: "" }));
      expect(code, `gate accepted an unparseable level:\n${output}`).not.toBe(0);
      expect(output).toContain(SAMPLE);
    },
    120_000,
  );

  it("is wired into the build, so `npm run build` cannot skip it", () => {
    // **The assertion that keeps 12.4 from quietly regressing.** Everything above proves the gate
    // works; nothing above proves the build runs it. A gate that works but is not called is a very
    // common and very quiet failure, and it is the one this task exists to prevent.
    const pkg = JSON.parse(readFileSync(resolve(REPO, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["build"]).toMatch(/build:levels/);
    expect(pkg.scripts["build:terse"]).toMatch(/build:levels/);
    // And the gate really is the compile-every-level script, not a placeholder that happens to
    // match the pattern above.
    expect(pkg.scripts["build:levels"]).toMatch(/levels-src\/validate-levels\.ts/);
  });
});
