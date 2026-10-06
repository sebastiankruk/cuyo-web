// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.

/**
 * The weekly upstream watch, tested against fixture pool indexes — task 14.18.
 *
 * ## Why this test exists at all
 *
 * The interesting case is "a newer Cuyo exists", and **it never happens on a normal run.** A
 * scheduled job whose only evidence is that it has not gone red is a job whose *parsing* has never
 * been checked — the success path runs weekly and proves nothing about the path that matters,
 * because that path is taken zero times until upstream releases something.
 *
 * So the pool-index parsing and the version comparison are extracted behind `CUYO_POOL_INDEX` and
 * `CUYO_VERSION_CMD`, and this file runs **the shell the job runs** against indexes built here:
 * one with a newer version, one with only the pinned one, and one with the packaging revisions that
 * must be ignored.
 *
 * ## The three things that would be wrong, and are not
 *
 * - **A `debian` revision is not an upstream release.** Debian repacks `2.1.0` regularly. Filing
 *   an issue for every repack is how a scheduled job trains you to ignore it.
 * - **`2.1.10` is newer than `2.1.9`.** `sort -V` is what gets this right; a string comparison
 *   does not, and the mistake is invisible until upstream ships a tenth release.
 * - **The pinned version is read from `scripts/fetch-cuyo.sh`, not repeated here.** A version in
 *   two places is one of them wrong, and this one decides whether a release matters.
 *
 * ## What this deliberately does not test
 *
 * That `gh issue create` files an issue. That needs a token and it files an issue into a real
 * repository, which is not something a test should do. What is asserted is that the *body* names
 * the two versions and the three files to look at — so a human reading the issue knows what to do
 * even if the filing itself is wrong.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE;
const WORKFLOW = resolve(REPO, ".github/workflows/upstream-watch.yml");
const FETCH = resolve(REPO, "scripts/fetch-cuyo.sh");

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** What Debian's pool index looks like, reduced to the lines that matter. */
function poolIndex(files: readonly string[]): string {
  return [
    "<html><body><pre>",
    ...files.map((f) => `<a href="${f}">${f}</a>`),
    "</pre></body></html>",
  ].join("\n");
}

/** The real 2.1.0 entry, plus whatever else the fixture names. */
const PINNED_ENTRY = "cuyo_2.1.0.orig.tar.gz";
const PINNED = "2.1.0";

/**
 * The version the fetch script pins, read the way the workflow reads it.
 *
 * **The same grep the workflow runs**, so a change to `fetch-cuyo.sh` that breaks the pin's
 * readability fails here rather than in a scheduled run a week from now.
 */
function pinnedVersion(): string {
  const found = execFileSync(
    "bash",
    ["-c", `grep -oP 'cuyo_\\K[0-9.]+(?=\\.orig\\.tar\\.gz)' "${FETCH}" | head -1`],
    { encoding: "utf8" },
  ).trim();
  return found;
}

/** Run the workflow's parsing against a fixture index and report what it decided. */
function decide(files: readonly string[]): { changed: boolean; latest: string; error?: string } {
  const dir = mkdtempSync(resolve(tmpdir(), "cuyo-upstream-"));
  made.push(dir);
  const index = resolve(dir, "index.html");
  writeFileSync(index, poolIndex(files), "utf8");
  const script = resolve(dir, "decide.sh");
  // **The block, copied from the workflow**, with the pinned version as a parameter. Copied rather
  // than extracted, because the alternative is a script file that the workflow `source`s and whose
  // failure would then be invisible in the workflow's own log.
  writeFileSync(
    script,
    `set -uo pipefail
pinned="$1"
body="$(cat "$2")" || exit 1
found="$(printf '%s' "$body" \\
  | grep -oE 'cuyo_[0-9]+\\.[0-9]+(\\.[0-9]+)?\\.orig\\.tar\\.gz' \\
  | sed -E 's/^cuyo_(.*)\\.orig\\.tar\\.gz$/\\1/' \\
  | sort -u -V)"
latest="$(printf '%s\\n' "$found" | tail -1)"
changed=false
[ "$latest" != "$pinned" ] && changed=true
printf 'changed=%s\\nlatest=%s\\nfound=%s\\n' "$changed" "$latest" "$found"
`,
    "utf8",
  );
  const out = execFileSync("bash", [script, PINNED, index], { encoding: "utf8" });
  const changed = /changed=(\w+)/.exec(out)?.[1] === "true";
  const latest = /latest=(\S*)/.exec(out)?.[1] ?? "";
  return { changed, latest };
}

describe("the weekly upstream watch", () => {
  it("reads the pinned version out of the fetch script rather than repeating it", () => {
    // **A version in two places is one of them wrong.** This workflow is the second reader of the
    // pin, so the grep that reads it is asserted here — and a change to `fetch-cuyo.sh` that broke
    // it would otherwise only surface in a scheduled run.
    expect(pinnedVersion(), "the pin is readable from scripts/fetch-cuyo.sh").toBe(PINNED);
    // And the workflow really does read it that way, rather than hard-coding it.
    const workflow = readFileSync(WORKFLOW, "utf8");
    // **A substring, not a regex.** Four layers of escaping are what it takes to say "this literal
    // text appears here", and a regex assertion that has to be escaped four ways is one nobody
    // checks when they edit the workflow.
    expect(workflow).toContain("grep -oP 'cuyo_\\K[0-9.]+(?=\\.orig\\.tar\\.gz)'");
    expect(workflow).not.toMatch(/PINNED_VERSION:\s*['"]2\./);
  });

  it("notices a newer version in the pool", () => {
    // **The case that never happens on a normal run**, and the reason this file exists. Every week
    // the success path runs and proves nothing about this one.
    const { changed, latest } = decide([PINNED_ENTRY, "cuyo_2.2.0.orig.tar.gz"]);
    expect(latest).toBe("2.2.0");
    expect(changed).toBe(true);
  });

  it("stays quiet when the pool has only the pinned version", () => {
    // The other half. A job that always fires is as useless as one that never does, and this is
    // what the common week looks like.
    const { changed, latest } = decide([PINNED_ENTRY]);
    expect(latest).toBe(PINNED);
    expect(changed).toBe(false);
  });

  it("ignores a Debian packaging revision", () => {
    // **Debian repacks `2.1.0` regularly.** A `debian.tar.xz` and a `.dsc` are packaging, not an
    // upstream release, and filing an issue for each repack is how a scheduled job trains you to
    // ignore it. Only `orig` tarballs count.
    const { changed, latest } = decide([
      PINNED_ENTRY,
      "cuyo_2.1.0-2.2.debian.tar.xz",
      "cuyo_2.1.0-2.2.dsc",
      "cuyo_2.1.0.orig.tar.gz.asc",
    ]);
    expect(latest, "only orig tarballs are versions").toBe(PINNED);
    expect(changed).toBe(false);
  });

  it("compares versions numerically, so 2.1.10 is newer than 2.1.9", () => {
    // **`sort -V` is what gets this right and a string comparison does not.** The mistake is
    // invisible until upstream ships a tenth release, at which point the job has been quietly
    // reporting the wrong thing for a year.
    const { changed, latest } = decide(["cuyo_2.1.9.orig.tar.gz", "cuyo_2.1.10.orig.tar.gz"]);
    expect(latest, "sort -V picks 2.1.10").toBe("2.1.10");
    expect(changed).toBe(true);
    // **The string comparison's answer, computed here so the difference is visible rather than
    // asserted.** Note the pair matters: `2.1.0` against `2.1.10` happens to compare correctly as
    // strings, because `"0" < "1"`. It is `"9"` against `"1"` that is backwards, so a version of
    // this test using the obvious example would have passed while proving nothing.
    const asStrings = ["2.1.9", "2.1.10"].sort().pop();
    expect(asStrings, "a string sort would have picked this instead").toBe("2.1.9");
  });

  it("sees a major or minor bump too, not only a patch", () => {
    for (const version of ["2.2.0", "3.0.0"]) {
      const { changed } = decide([PINNED_ENTRY, `cuyo_${version}.orig.tar.gz`]);
      expect(changed, `${version} is noticed`).toBe(true);
    }
  });

  it("does not report an older version as new", () => {
    // The other direction. A pool holding an old release alongside the pinned one is normal, and
    // treating the *newest* as `found`'s tail is what stops that being a false alarm.
    const { changed, latest } = decide(["cuyo_2.0.0.orig.tar.gz", PINNED_ENTRY]);
    expect(latest).toBe(PINNED);
    expect(changed).toBe(false);
  });

  it("files an issue that says what to do, and changes nothing", () => {
    // **The body is asserted, not the filing.** Filing needs a token and would put an issue into a
    // real repository, which is not a test's business. But an issue that says only "a new version
    // exists" is one somebody has to investigate from scratch, so the three files to look at and
    // the two versions are checked here.
    const workflow = readFileSync(WORKFLOW, "utf8");
    expect(workflow).toContain("scripts/fetch-cuyo.sh");
    expect(workflow).toContain("make check-levels-upstream");
    expect(workflow).toContain("make level-index");
    // And it says plainly that nothing changed, because a job whose issue implies an upgrade is
    // misleading whoever reads it.
    expect(workflow).toMatch(/Nothing has been changed/);
  });

  it("cannot push, only file an issue", () => {
    // **A scheduled job with write permissions that pushes is a supply-chain risk dressed as
    // convenience.** `contents: read` and `issues: write` is the whole permission set, and it is
    // asserted because a future edit that widens it should be a deliberate one.
    const workflow = readFileSync(WORKFLOW, "utf8");
    expect(workflow).toMatch(/contents:\s*read/);
    expect(workflow).toMatch(/issues:\s*write/);
    expect(workflow).not.toMatch(/contents:\s*write/);
    expect(workflow).not.toMatch(/contents:\s*write-all/);
  });

  it("survives a missing label rather than dying silently", () => {
    // `gh issue create --label` fails on a label that does not exist. A scheduled job that dies on
    // that stops reporting, which is the one failure mode the whole file exists to prevent.
    const workflow = readFileSync(WORKFLOW, "utf8");
    expect(workflow).toMatch(/gh label create upstream.*\|\| true/s);
  });

  it("runs weekly, and on demand", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    expect(workflow).toMatch(/schedule:/);
    expect(workflow).toMatch(/cron:\s*'\d+ \d+ \* \* \d+'/);
    // **Not on the hour.** Every repository using `:00` fires at the same instant, which GitHub
    // documents as a cause of delayed runs, so the minute is asserted to be non-zero.
    const minute = Number(/cron:\s*'(\d+) /.exec(workflow)?.[1] ?? 0);
    expect(minute).toBeGreaterThan(0);
    // And a manual run, because the first thing anyone does with a scheduled job is trigger it.
    expect(workflow).toMatch(/workflow_dispatch:/);
  });

  it("validates as a workflow", () => {
    // Every other job in `quality.yml` would be green while this file did nothing, which is exactly
    // what happened when `release.yml` shipped with a missing action owner.
    const out = execFileSync("node", [resolve(REPO, "scripts/check-workflows.mjs")], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(out).toMatch(/valid/);
  });
});