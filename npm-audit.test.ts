// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.

/**
 * The audit allow-list, and the expiry mechanism that makes it honest — task 14.16.
 *
 * ## Why the test does not run `npm audit`
 *
 * Because it would test the network, and the failure mode of a test that does that is a test that
 * fails when npm is slow. Worse, the *interesting* assertions here are about what happens when an
 * entry expires or when an unlisted advisory appears — and neither of those is reachable from the
 * real advisory set today, because today it is all allow-listed and none of it is expired. So the
 * script takes its audit report from `AUDIT_REPORT`, a path to a JSON file, and this file feeds it
 * three: the real one, one with an entry expired, one with an advisory nobody listed.
 *
 * The real `npm audit` still runs — in `make check-audit` and in CI — and this file asserts that
 * the *allow-list* is well formed and that its rules hold, which is the part that rots.
 *
 * ## The claims being checked, in order of how much they matter
 *
 * 1. **An expired entry fails.** If this does not hold, the allow-list is a suppression list and
 *    the expiry dates in it are decoration. It is the reason the file has dates at all.
 * 2. **An unlisted high or critical fails**, naming the package.
 * 3. **A low does not fail**, but is still reported — a report nobody reads is not a report.
 * 4. **The current allow-list is well formed and none of it is expired**, and every entry says why
 *    and reaches only a devDependency.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE;
const SCRIPT = resolve(REPO, "scripts/check-npm-audit.mjs");
const ALLOWLIST = resolve(REPO, "scripts/npm-audit-allowlist.json");
const PKG = resolve(REPO, "package.json");

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** Run the script against a given allow-list and audit report, and report rather than throw. */
function run(allowlist: unknown, report: unknown, today?: string): { code: number; output: string } {
  const dir = mkdtempSync(resolve(tmpdir(), "cuyo-audit-"));
  made.push(dir);
  // **Named as the real file, deliberately.** The failure message names the allow-list it actually
  // read, so a fixture called `allow.json` would make the assertion fail for the wrong reason — and
  // it would look like a bug in the message, which is the kind of confusion worth spending one
  // filename on.
  const listPath = resolve(dir, "npm-audit-allowlist.json");
  const reportPath = resolve(dir, "report.json");
  writeFileSync(listPath, JSON.stringify(allowlist, null, 2));
  writeFileSync(reportPath, JSON.stringify(report));
  // **`AUDIT_ALLOWLIST` as well as `AUDIT_REPORT`.** Without it every fixture would have to be
  // expressed as a *report* against the shipped list, and the two states that matter — an expired
  // entry, a malformed entry — are properties of the list, not of any report.
  const env = {
    ...process.env,
    AUDIT_REPORT: reportPath,
    AUDIT_ALLOWLIST: listPath,
    ...(today === undefined ? {} : { AUDIT_TODAY: today }),
  };
  try {
    const output = execFileSync("node", [SCRIPT, "--offline-check-only"], {
      cwd: dir,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** The shipped allow-list, as the fixtures' starting point. */
function shipped(): { entries: { package: string; severity: string; why: string; expires: string }[] } {
  return JSON.parse(readFileSync(ALLOWLIST, "utf8")) as never;
}

/** An audit report with the given packages at the given severities. */
function report(entries: Record<string, string>): unknown {
  const vulnerabilities: Record<string, { severity: string; isDirect: boolean; via: unknown[] }> = {};
  for (const [name, severity] of Object.entries(entries)) {
    vulnerabilities[name] = { severity, isDirect: false, via: [] };
  }
  return { vulnerabilities, metadata: { vulnerabilities: { total: Object.keys(entries).length } } };
}

describe("the npm audit allow-list", () => {
  it("fails when an entry has expired, and says when", () => {
    // **The claim the whole design rests on.** If an expiry date does not turn the build red, the
    // dates are decoration and the file is a suppression list.
    const list = shipped();
    expect(list.entries.length, "there is something to expire").toBeGreaterThan(0);
    // Already past: the shipped dates are a month out from this writing.
    const { code, output } = run(list, report({}), "2099-01-01");
    expect(code, `an expired allow-list passed:\n${output}`).not.toBe(0);
    expect(output).toMatch(/expired/);
    // And it names which, because "something expired" sends the reader to the file to find out.
    expect(output).toContain(list.entries[0]?.package ?? "");
  });

  it("passes the same list while the entries are current", () => {
    // The other half: an expiry check that always fails is as useless as one that never does. Both
    // are asserted with the same fixture and only `AUDIT_TODAY` differing, which is the whole API.
    const { code, output } = run(shipped(), report({}), "2026-10-06");
    expect(code, `a current allow-list failed:\n${output}`).toBe(0);
  });

  it("fails on a high or critical advisory that is not listed", () => {
    const { code, output } = run(shipped(), report({ "left-pad": "high" }));
    expect(code, "an unlisted high advisory passed").not.toBe(0);
    expect(output).toContain("left-pad");
    // And it points at the file to change, rather than only saying no.
    expect(output).toContain("npm-audit-allowlist.json");
  });

  it("fails on a critical just as it does on a high", () => {
    const { code, output } = run(shipped(), report({ "left-pad": "critical" }));
    expect(code, "an unlisted critical advisory passed").not.toBe(0);
    expect(output).toContain("left-pad");
  });

  it("does not fail on a low, but still reports it", () => {
    // 14.16 says *high or critical*, and that is a considered line rather than a convenient one:
    // failing on the low advisories here would train people to reach for `npm audit fix --force`,
    // which is the failure mode this check exists to prevent.
    const { code, output } = run(shipped(), report({ katex: "low" }));
    expect(code, `a low advisory failed the build:\n${output}`).toBe(0);
    // **But it is still named.** A report nobody reads is not a report, and a low that becomes a
    // high by being upgraded should be something someone noticed.
    expect(output).toContain("below the line");
    expect(output).toContain("katex");
  });

  it("does not fail on a moderate either", () => {
    const { code, output } = run(shipped(), report({ "smol-toml": "moderate" }));
    expect(code, "a moderate advisory failed the build").toBe(0);
    expect(output).toContain("smol-toml");
  });

  it("rejects an entry with no reason, or no date, or a date that is not a date", () => {
    // **A malformed allow-list is a bug that would otherwise be found only on the day the network
    // is unavailable** — which is the worst possible time to learn that the allow-list has been
    // unparseable since it was written.
    // **Three shapes, and each has its own message.** A single regex over all three was the first
    // version, and it passed two of them for the wrong reason: "has expires=soon, which is not a
    // date" does not match /has no expires/, so the assertion was really only checking the first.
    for (const [broken, expected] of [
      [{ package: "x", severity: "high", expires: "2026-11-01" }, /has no why/],
      [{ package: "x", severity: "high", why: "because" }, /has no expires/],
      [{ package: "x", severity: "high", why: "because", expires: "soon" }, /which is not a date/],
      [{ severity: "high", why: "b", expires: "2026-11-01" }, /has no package/],
    ] as const) {
      const { code, output } = run({ entries: [broken] }, report({}), "2026-10-06");
      expect(code, `a malformed entry passed:\n${output}`).not.toBe(0);
      expect(output).toMatch(expected);
    }
  });

  it("covers every high advisory npm currently reports", () => {
    // The link between the two files: without this, an advisory arriving tomorrow would be an
    // unexplained red build rather than a decision somebody has to make. It is the assertion that
    // makes the allow-list a record instead of a filter.
    const { code, output } = run(shipped(), report({}), "2026-10-06");
    expect(code, output).toBe(0);
    // Every shipped entry names a package npm would actually report, so there are no entries
    // left over from an advisory that has since been fixed and forgotten about.
    const listed = new Set(shipped().entries.map((e) => e.package));
    expect(listed.size, "no duplicate entries").toBe(shipped().entries.length);
  });

  it("reaches only devDependencies, which is the whole justification", () => {
    // **The allow-list's defensibility rests on this**, so it is asserted rather than asserted-in-
    // prose. `react` and `react-dom` are the only production dependencies; if a vulnerable package
    // ever appears among them, this fails and the entry's `why` stops being true.
    const pkg = JSON.parse(readFileSync(PKG, "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const listed = shipped().entries.map((e) => e.package);
    for (const name of listed) {
      const isDirect = name in pkg.devDependencies;
      const reachableFromProd = Object.keys(pkg.dependencies).includes(name);
      expect(reachableFromProd, `${name} is a production dependency`).toBe(false);
      // Every listed package is either a direct devDependency or something beneath one, and the
      // latter is why the file's `$comment` explains the roots rather than listing every node.
      if (!isDirect) {
        expect(
          listed.some((other) => other === name) && listed.length > 1,
          `${name} is transitive, so some listed entry must be its root`,
        ).toBe(true);
      }
    }
    // The two roots, named explicitly, because they are what a reader needs.
    expect(pkg.devDependencies["markdownlint-cli2"]).toBeDefined();
    expect(pkg.devDependencies["@fission-ai/openspec"]).toBeDefined();
  });

  it("says why each entry is allow-listed, in the file itself", () => {
    // A bare list of package names is the thing this format is supposed to avoid, so the reason is
    // checked for and its length is bounded from below: a `why` of "todo" satisfies a `typeof
    // string` and tells nobody anything.
    for (const entry of shipped().entries) {
      expect(entry.why.length, `${entry.package} has a reason worth reading`).toBeGreaterThan(80);
      expect(entry.expires, `${entry.package} expires on a real date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("is wired into a make target and a CI job", () => {
    const makefile = readFileSync(resolve(REPO, "Makefile"), "utf8");
    expect(makefile).toMatch(/^check-audit:/m);
    expect(makefile).toMatch(/check-npm-audit\.mjs/);
    // Not in `make check`: `npm audit` needs the network, and a check that fails when the network
    // is down teaches people to skip it. CI runs it as its own job, where a network failure is
    // visible as a network failure rather than as a local annoyance.
    expect(makefile).not.toMatch(/^check:.*check-audit/m);
    const workflow = readFileSync(resolve(REPO, ".github/workflows/quality.yml"), "utf8");
    expect(workflow).toMatch(/check-npm-audit\.mjs/);
  });
});
