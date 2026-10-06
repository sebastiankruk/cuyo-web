// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The coverage floors are design.md decision 12's, and every source file is inside one.
 *
 * Tasks 13.6 and 13.7. 13.6 sets the floors; 13.7 records what is actually achieved. This is
 * the part that keeps them honest, and it is a test about the *configuration* rather than about
 * coverage, for two reasons.
 *
 * **A floor set to today's measurement cannot catch anything.** If `engine/` sits at 93.7% and
 * the floor says 93.7, then a file losing all its tests drops the figure to 91 and still passes.
 * So the floors are below the measurement, and the table below says which is which. The other
 * direction is the real failure: someone deleting the thresholds, or narrowing the `include` so
 * the files that are untested stop being counted.
 *
 * **That second one is the likely accident.** `coverage.include` is a glob list, and a glob list
 * is silent: a file that stops matching is not reported as missing, it is simply not measured. So
 * every non-test source file under the three floored tiers is checked against the globs here, and
 * an unmeasured file fails this test rather than quietly disappearing from the percentage.
 *
 * The tiers decision 12 does *not* floor — `levels-src/`, which is build tooling — are excluded
 * from the coverage set on purpose, and `app/` has no floor on purpose. Both are asserted, because
 * an omission nobody states reads like an oversight and both are decisions.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import config, { COVERAGE_FLOORS } from "./vite.config.ts";

const ROOT = import.meta.dirname;

/**
 * The README, read once at module scope.
 *
 * At the top rather than inside a `describe`, because two of the blocks below read it and a
 * `const` inside the first one is not in scope for the second. That is not a hypothetical:
 * it is exactly what happened when the CI block was added and failed with
 * `ReferenceError: README is not defined`.
 */
const README = readFileSync(join(ROOT, "README.md"), "utf8");

/** The coverage section of the vitest config, typed as far as this file needs it. */
function coverage(): {
  include?: string[];
  exclude?: string[];
  thresholds?: Record<string, Record<string, number>>;
} {
  const test = (config as { test?: { coverage?: unknown } }).test;
  return (test?.coverage ?? {}) as {
    include?: string[];
    exclude?: string[];
    thresholds?: Record<string, Record<string, number>>;
  };
}

/** Every `.ts` under `dir`, excluding tests and test helpers. */
function sources(dir: string): string[] {
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      found.push(relative(ROOT, full));
    }
  };
  walk(join(ROOT, dir));
  return found.sort();
}

/**
 * Whether a path matches an `exclude` glob's.
 *
 * A simplified prefix match rather than a glob engine: every exclusion in the set is a
 * test-file glob, a `testing/` directory, or a named file, so a prefix is the whole test. It is
 * deliberately *separate* from {@link measured} — a file that is excluded is a decision and a
 * file that is merely unmatched is a bug, and collapsing the two would hide the second.
 */
function excluded(file: string): boolean {
  return (coverage().exclude ?? []).some((glob) => {
    const stem = glob.replaceAll("**", "").replace(/\/\*/g, "").replace(/\/$/, "");
    return stem === "" ? false : file.includes(stem);
  });
}

/** Whether a path matches an `include` glob's leading directory. */
function measured(file: string): boolean {
  return (coverage().include ?? []).some((glob) => {
    // Every glob in the set is `<dir>/**/*.ts`, so the directory prefix is the whole test. This
    // is not a glob engine and does not pretend to be: it answers the question that matters —
    // is this file under a directory that is measured at all.
    const prefix = glob.slice(0, glob.indexOf("/**"));
    return file === prefix || file.startsWith(`${prefix}/`);
  });
}

describe("the floors are decision 12's", () => {
  it("are 90% statements and 85% branches for engine, 80% for render", () => {
    expect(COVERAGE_FLOORS).toEqual({
      engine: { statements: 90, branches: 85 },
      render: { statements: 80 },
    });
  });

  it("and the test config enforces exactly those", () => {
    // Asserted against the *config*, not against the numbers repeated here, so renaming
    // `COVERAGE_FLOORS` cannot leave a stale threshold behind it.
    expect(coverage().thresholds?.["engine/**/*.ts"]).toEqual({ statements: 90, branches: 85 });
    expect(coverage().thresholds?.["render/**/*.ts"]).toEqual({ statements: 80 });
  });

  it("and app has no percentage floor, which is a decision and not a gap", () => {
    // decision 12: "`app/` — covered by behaviour tests; no percentage floor". A component is
    // mostly JSX, so its percentage measures how much markup it has. A threshold here would be a
    // claim nobody made — asserted absent so it cannot be added by accident.
    expect(COVERAGE_FLOORS).not.toHaveProperty("app");
    expect(Object.keys(coverage().thresholds ?? {})).toEqual([
      "engine/**/*.ts",
      "render/**/*.ts",
    ]);
  });
});

describe("every source file is inside the measured set", () => {
  // The failure this prevents is invisible in the output: a file that stops matching `include`
  // is not reported as unmeasured, it is simply absent, and the percentage goes *up*.
  for (const tier of ["engine", "render", "app"]) {
    it(`${tier}/ has no source file that is neither measured nor excluded`, () => {
      const files = sources(tier);
      expect(files.length, `${tier} has no sources at all — did the path change?`).toBeGreaterThan(0);
      const orphans = files.filter((f) => !measured(f) && !excluded(f));
      expect(
        orphans,
        `${tier} files that coverage neither measures nor excludes: ${orphans.join(", ")}`,
      ).toEqual([]);
      // And the other side of it, which is what a typo in one glob looks like from the
      // percentage: a tier whose files are all excluded measures nothing at all.
      const counted = files.filter((f) => measured(f) && !excluded(f));
      expect(counted.length, `${tier} measures nothing`).toBeGreaterThan(0);
    });
  }

  it("excludes only test helpers and the build-stamp shim, by name", () => {
    // The whole exclusion list, because "a few entries" stops being true without anything
    // failing. `testing/` holds stubs written *for* tests and `build-stamp.d.ts` is a
    // declaration for the virtual module a plugin provides — neither has statements to cover.
    const files = ["engine", "render", "app"].flatMap(sources);
    const skip = files.filter((f) => excluded(f)).sort();
    expect(skip).toEqual([
      "app/build-stamp.d.ts",
      "app/testing/manual-clock.ts",
      "engine/testing/blob.ts",
      "engine/testing/field.ts",
      "engine/testing/prng-stub.ts",
    ]);
  });

  it("does not measure levels-src, which is build tooling", () => {
    // `emit-level-index.ts` and `emit-art-manifest.ts` run under `make`, not under a unit test,
    // so a coverage run says "1.4%" about them — true, and about the wrong thing. Their
    // verification is that they run and that their output passes the corpus tests.
    const generators = sources("levels-src");
    expect(generators.length).toBeGreaterThan(0);
    expect(generators.every((f) => !measured(f))).toBe(true);
  });
});

describe("the README records what was measured", () => {
  // 13.7's requirement is that the achieved figure is written down, so a fall shows up in a
  // review diff rather than being found later. What is *not* asserted here is the figures: they
  // only exist after a coverage run, and a test that reads them would fail in every ordinary
  // `npm test` — the same trap `events-corpus.test.ts` fell into by reading an untracked
  // directory. So the table's shape is pinned and the numbers are left to a person, which is
  // also the only arrangement in which the numbers can be wrong without anything going red.
  it("names every tier the coverage set measures", () => {
    const tiers = new Set(
      (coverage().include ?? []).map((glob) => glob.slice(0, glob.indexOf("/**"))),
    );
    expect(tiers.size).toBeGreaterThan(0);
    const missing = [...tiers].filter((t) => !README.includes(`\`${t}/\``));
    expect(missing, `tiers the coverage set measures but the README does not: ${missing}`).toEqual(
      [],
    );
  });

  it("quotes each floor, so the two numbers cannot be confused for one", () => {
    // The failure this is about is a floor quietly raised to the measurement, at which point it
    // stops being a floor. It is invisible in a diff of the config alone, because both numbers
    // move together and the README is where they are supposed to be distinguishable.
    const quoted = [90, 85, 80].filter((floor) => README.includes(`${floor} %`));
    expect(quoted, "the README should quote the floors as percentages").toEqual([90, 85, 80]);
  });

  it("says which is the floor and which is the measurement", () => {
    // Cheap, and it is the sentence that carries the whole point. Without it the table reads
    // "93.7% / floor 90%" as headroom and invites someone to close the gap by raising the floor.
    expect(README).toMatch(/floor[s]?\b[^\n]*not a measurement/i);
    expect(README).toMatch(/cannot catch a regression/i);
  });

  it("says that make test does not enforce the floors, because it does not", () => {
    // The claim is the opposite of the intuitive one and it is easy to "fix" the prose by
    // accident, which is why it is checked. Vitest evaluates `coverage.thresholds` only under
    // `--coverage`: with `render/` floored at 99% against 91.7% achieved, `vitest run` exits 0.
    // So a reader who assumes `make check` guards coverage is wrong, and the README is the only
    // place that can say so. A test cannot assert the framework's behaviour without running the
    // whole suite twice, and the fact was measured instead — see 13.6 in the change.
    expect(README).toMatch(/only when coverage is enabled/i);
    expect(README).toMatch(/`make test` cannot catch a coverage regression/i);
    // And it says CI does enforce them, since that is now true (14.17). Without this the
    // README would read as "nothing checks these", which is the sentence a reader takes
    // away from "make test cannot" and stops reading.
    expect(README).toMatch(/CI enforces them too/i);
  });
});

describe("CI enforces the floors", () => {
  // 14.17. The point of a floor is that it fails something, and until this job existed
  // there was nowhere for it to fail: `npm test` does not evaluate thresholds at all.
  const WORKFLOW = readFileSync(
    resolve(import.meta.dirname, ".github/workflows/quality.yml"),
    "utf8",
  );

  /** Just the `coverage` job's text, up to the next top-level job. */
  function coverageJob(): string {
    const start = WORKFLOW.indexOf("\n  coverage:\n");
    expect(start, "the coverage job is missing").toBeGreaterThan(-1);
    const rest = WORKFLOW.slice(start + 1);
    const next = rest.slice(1).search(/^ {2}\S/m);
    return next < 0 ? rest : rest.slice(0, next + 1);
  }

  it("runs the suite under coverage, in a job of its own", () => {
    // Its own job, because a coverage breach reports every test green and then exits 1.
    // Inside the `test` job that reads as "the suite is broken", which points the reader at
    // an assertion instead of at the percentage.
    expect(WORKFLOW).toMatch(/^ {2}coverage:$/m);
    expect(coverageJob()).toMatch(/npm run test:coverage/);
  });

  it("checks each tier as well as vitest's aggregate", () => {
    // Two readers of one claim. `thresholds` globs and this script read the same numbers,
    // and the script is the one whose table the README quotes.
    expect(coverageJob()).toMatch(/node scripts\/coverage-tiers\.mjs/);
  });

  it("without fetching the upstream corpus, which no test reads any more", () => {
    // Measured rather than copied from the `test` job: with `.context/upstream-cuyo` moved
    // away entirely, all 1490 tests still pass. Asserted because the obvious "copy the test
    // job and drop the coverage flag" reintroduces the fetch, and a network step in a gate
    // that does not need one is a gate that fails for unrelated reasons. Scoped to *this*
    // job — the later `agent-mode` and `human-mode` jobs legitimately fetch.
    expect(coverageJob()).not.toMatch(/fetch-cuyo/);
  });

  it("and the README counts the jobs it added", () => {
    // The README's CI table is the only place the job count is written down, so a new job
    // that is not added there leaves the documentation quietly wrong.
    expect(README).toMatch(/^\| `coverage`\s+\|.*fails the build/m);
  });
});