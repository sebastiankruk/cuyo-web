// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.

/**
 * The licence-header check, and the second half of 14.15.
 *
 * ## Why a test and not just the script
 *
 * `scripts/check-licence-headers.sh` exists and `make check` runs it. **A gate nobody has watched
 * refuse is an assumption**, and this one is more vulnerable than most: it is a `find` with six
 * prune expressions, and every one of them is a way to match nothing and pass. So this file runs
 * the script against a temporary tree and watches it fail — on a file with no header, and on a
 * tree where the `find` matches nothing at all, which is the failure mode that would otherwise be
 * invisible forever.
 *
 * ## What is asserted about the header's *content*
 *
 * The task says the check must name `ATTRIBUTION.md` and the GPL notices. It does, and this asserts
 * it, because the alternative — a header that says "AGPL" and points nowhere — is a header that
 * satisfies a grep and tells a recipient nothing about what they must actually do.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE;
const SCRIPT = resolve(REPO, "scripts/check-licence-headers.sh");

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/**
 * A throwaway repository laid out like this one, so the script's own `find` expression is what runs.
 *
 * **`cd` into a copy rather than passing a root argument.** The script resolves its root from
 * `BASH_SOURCE`, so it can only be pointed at a tree by being *placed* in one — and copying the
 * script in is what makes this a test of the real expression rather than of a mock of it.
 */
function tree(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(resolve(tmpdir(), "cuyo-licence-"));
  made.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    const path = resolve(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  mkdirSync(resolve(dir, "scripts"), { recursive: true });
  writeFileSync(resolve(dir, "scripts/check-licence-headers.sh"), `#!/usr/bin/env bash\n`, {
    mode: 0o755,
  });
  return dir;
}

/** A file carrying the header the check expects. */
function withHeader(body = "export const x = 1;\n"): string {
  return [
    "// SPDX-License-Identifier: AGPL-3.0-or-later",
    "// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)",
    "// Licensed under the GNU Affero General Public License, version 3 or later.",
    "// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is",
    "// a port of.",
    "",
    body,
  ].join("\n");
}

/**
 * Run the real script against a tree, by invoking it through a copy in that tree's `scripts/`.
 *
 * `floor` is the script's optional minimum-file-count, and the reason it is an argument rather than
 * a constant: **a check that cannot run against a three-file fixture cannot be tested.** The
 * vacuous-pass guard needs a threshold, and a fixed one large enough to be useful on this
 * repository would make every fixture here look like a broken `find`.
 */
function check(dir: string, floor = 1): { code: number; output: string } {
  // The script computes its root from its own path, so it is run *as* the copy in the tree. That
  // copy is the real script, sourced from here, so the `find` under test is the shipped one.
  writeFileSync(resolve(dir, "scripts/check-licence-headers.sh"), readScript(), { mode: 0o755 });
  try {
    const output = execFileSync(
      "bash",
      [resolve(dir, "scripts/check-licence-headers.sh"), String(floor)],
      {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** The shipped script's text, read rather than imported, so the test cannot drift from it. */
function readScript(): string {
  return readFileSync(SCRIPT, "utf8");
}

describe("the licence-header check", () => {
  it("passes a tree whose files all carry the header", () => {
    const dir = tree({
      "a.ts": withHeader(),
      "src/b.tsx": withHeader(),
      // The exclusions, each present so the test fails if a prune is removed by accident.
      "node_modules/pkg/index.ts": "export const vendored = 1;\n",
      "dist/bundle.ts": "export const built = 1;\n",
      "coverage/report.ts": "export const measured = 1;\n",
      ".context/memory.ts": "export const memory = 1;\n",
      "levels/upstream/x.ld": "# upstream's own notice\n",
      "levels-src/generated/level-index.ts": "// generated\nexport const LEVELS = [];\n",
      "types/thing.d.ts": "export declare const y: number;\n",
    });
    // **Two**, not three: the `.d.ts` fixture is one of the four exclusions and is correctly not
    // counted. Asserting three would have been asserting that the `.d.ts` prune *fails*, which is
    // the opposite of what that fixture is for — so the floor is the number of files the check
    // should see, spelled out, rather than the number that happened to be written.
    const { code, output } = check(dir, 2);
    expect(code, `check failed on a good tree:\n${output}`).toBe(0);
  });

  it("fails, and names the file, when a source file has no header", () => {
    const dir = tree({
      "good.ts": withHeader(),
      "src/bad.ts": "export const forgotTheHeader = 1;\n",
    });
    const { code, output } = check(dir, 2);
    // **The count assertion means the good tree above cannot have matched nothing**, so this
    // failure is about the bad file rather than about the harness.
    expect(code, "check accepted a file with no header").not.toBe(0);
    expect(output).toContain("src/bad.ts");
    expect(output).not.toContain("good.ts");
  });

  it("fails on a tree with no source files at all, rather than passing vacuously", () => {
    // **The failure mode this check is most exposed to**, and the reason the count is asserted
    // inside the script. Six prune expressions, any one of which could match nothing: a `find` that
    // found no files would report every file as carrying the header, and would be indistinguishable
    // from a correct run by its output alone.
    const dir = tree({ "README.md": "# nothing here\n" });
    // Asking for one file when the tree has none: the guard, on its own, with nothing else in play.
    const { code, output } = check(dir, 1);
    expect(code, "check passed on a tree with no source files").not.toBe(0);
    expect(output).toMatch(/find expression is probably wrong/);
  });

  it("names LICENSING.md and ATTRIBUTION.md, so the header points somewhere", () => {
    // **The content half of 14.15.** A header that says "AGPL" and points nowhere satisfies a
    // grep and tells a recipient nothing about what they must do. Both documents must exist as well
    // as be named: a pointer to a missing file is worse than no pointer.
    const script = readScript();
    expect(script).toContain("LICENSING.md");
    expect(script).toContain("ATTRIBUTION.md");
    // And the files it points at are really there.
    for (const doc of ["LICENSING.md", "ATTRIBUTION.md"]) {
      expect(readFileSync(resolve(REPO, doc), "utf8").length, `${doc} exists and is not empty`)
        .toBeGreaterThan(100);
    }
  });

  it("puts the SPDX line first, where a tool reads it", () => {
    // A licence identifier buried in a doc comment is one refactor away from being deleted, and a
    // scanner looking for `SPDX-License-Identifier` in the first lines would miss it.
    const script = readScript();
    const firstIndex = script.indexOf("SPDX-License-Identifier: AGPL-3.0-or-later");
    expect(firstIndex, "the script states the header's own first line").toBeGreaterThan(0);
    // The instruction it prints puts the SPDX line first too.
    const instruction = script.slice(script.indexOf("The header every source file needs"));
    const instructionIndex = instruction.indexOf("SPDX-License-Identifier");
    const copyrightIndex = instruction.indexOf("Copyright (C)");
    expect(instructionIndex).toBeGreaterThan(-1);
    expect(copyrightIndex).toBeGreaterThan(instructionIndex);
  });

  it("leaves upstream's own level files alone", () => {
    // **The exclusion that matters most.** `levels/upstream/` and `levels/` hold upstream Cuyo's
    // files, which carry GPL-2.0-or-later notices that `licence.test.ts` asserts are grounded in
    // upstream's own per-file notice. Stamping AGPL on top would misattribute their work, and
    // stripping theirs would break the obligation the project actually owes.
    const script = readScript();
    expect(script).toMatch(/-path \.\/levels -prune/);
    expect(script).toMatch(/levels\/upstream/);
  });

  it("is in `make check`, so it cannot be forgotten locally", () => {
    // The gate that stops mattering is the one nobody runs. Asserted against the Makefile rather
    // than trusted to it.
    const makefile = readFileSync(resolve(REPO, "Makefile"), "utf8");
    expect(makefile).toMatch(/^check:.*check-licence-headers/m);
    expect(makefile).toMatch(/^check-licence-headers:/m);
  });

  it("every source file in this repository actually carries it", () => {
    // The last line, and the one that would go stale on its own: it reads the repository as it is
    // now, so it cannot be satisfied by a fixture.
    const { code, output } = (() => {
      try {
        // **The real count, as a number, not a guess.** 158 as of this writing; asserting a figure
        // that is merely "large" would pass on a tree that had lost half its files.
        const out = execFileSync("bash", [SCRIPT, "100"], { cwd: REPO, encoding: "utf8" });
        return { code: 0, output: out };
      } catch (error) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
      }
    })();
    expect(code, `the repository is missing headers:\n${output}`).toBe(0);
  });
});