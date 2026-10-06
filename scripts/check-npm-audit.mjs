#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.

/**
 * `npm audit`, with an allow-list that expires — task 14.16.
 *
 * ## Why an allow-list at all, and why it has expiry dates in it
 *
 * The alternative is `npm audit` failing on any high or critical advisory and nothing else. That
 * has a well-known failure mode: the advisory arrives, the check goes red, and the cheapest way to
 * make it green is `--force`, which silently downgrades packages and leaves the next person
 * believing the dependency tree is current. An allow-list says *this specific advisory, in this
 * specific package, for this specific reason, and not after this date* — which is a claim someone
 * has to stand behind rather than a switch.
 *
 * **Every entry carries an `expires` date and an expired entry fails.** That is the whole design.
 * An allow-list with no expiry is a suppression list, and a suppression list that cannot go stale is
 * indistinguishable from having turned the check off. So the failure is the default: an entry past
 * its date turns the build red with the date in the message, and removing the check is a visible
 * edit rather than a slow drift nobody noticed.
 *
 * ## What is actually allow-listed here, and why it is defensible
 *
 * **Every advisory in this project is in a `devDependency`, and none is reachable from the shipped
 * bundle.** The production dependencies are `react` and `react-dom`, and neither appears in
 * `npm audit`'s output. The eleven advisories come from three places:
 *
 * - **`markdownlint-cli2`** — lints Markdown in CI. It reads this repository's own prose and never
 *   a user's input, and every advisory beneath it is a denial of service or a prototype pollution
 *   in a path that requires an attacker who can already edit the repository.
 * - **`@fission-ai/openspec`** — validates this project's specs in CI. Same argument.
 * - **`source-map-js`** — reached through Vite's CSS pipeline, and only when *building* rather than
 *   when serving. It is not in the output bundle.
 *
 * **`npm audit fix` is not available as a remedy for any of them**, which is worth recording
 * because it is the reason the allow-list is the only option rather than a shortcut. Both direct
 * dependencies are already at their latest published version (`markdownlint-cli2` 0.23.3,
 * `@fission-ai/openspec` 1.14.0), and the fix npm offers is a *downgrade* to `markdownlint-cli2`
 * 0.21.0 or `@fission-ai/openspec` 0.17.2. Taking it would move the project backwards to satisfy a
 * check about the version it is already past.
 *
 * ## Why low and moderate do not fail the build
 *
 * 14.16 says *high or critical*, and that is the right line rather than a convenient one. The
 * three low and one moderate advisories here are `katex`'s prototype pollution and `smol-toml`'s
 * quadratic parse — both real, both in `markdownlint-cli2`'s subtree, and both requiring the same
 * "attacker who can already edit the repository" premise. Failing on them would train people to
 * reach for `--force`, which is the failure mode this file exists to prevent. They are still
 * **reported**, because a report nobody reads is not a report.
 *
 * Usage: `node scripts/check-npm-audit.mjs [--offline-check-only]`
 *
 *   `AUDIT_REPORT`    read the report from this file instead of running `npm audit`
 *   `AUDIT_ALLOWLIST` read the allow-list from this file
 *   `AUDIT_REPORT`    read the report from this file
 *   `AUDIT_TODAY`     today's date, as `YYYY-MM-DD`
 *
 * All three exist so `npm-audit.test.ts` can reach the two states that matter and that the real
 * advisory set never produces — an expired entry and an unlisted advisory — without running
 * `npm audit` in a test, which would make it a test of the network. The real audit still runs, in
 * `make check-audit` and in CI.
 *
 * `--offline-check-only` means *no report source at all*: validate the allow-list's shape and stop.
 * It is a different thing from the seams above, and the distinction matters — an earlier version
 * documented it as "skips npm audit", which is true of a real run and false of a test, and every
 * rule then passed vacuously in every fixture.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST =
  process.env["AUDIT_ALLOWLIST"] ?? resolve(ROOT, "scripts/npm-audit-allowlist.json");

/** Severities that fail the build. 14.16's line. */
const BLOCKING = new Set(["high", "critical"]);

/** Read by both this script and its test, so the two cannot disagree about the rule. */
const TODAY = process.env["AUDIT_TODAY"] ?? new Date().toISOString().slice(0, 10);

function fail(message, detail) {
  process.stderr.write(`check-npm-audit: ${message}\n`);
  if (detail !== undefined) process.stderr.write(`${detail}\n`);
  process.exit(1);
}

function loadAllowlist() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
  } catch (error) {
    return fail(`cannot read ${ALLOWLIST}`, String(error));
  }
  const problems = [];
  for (const entry of raw.entries ?? []) {
    for (const field of ["package", "severity", "why", "expires"]) {
      if (typeof entry[field] !== "string" || entry[field].length === 0) {
        problems.push(`entry ${JSON.stringify(entry.package)} has no ${field}`);
      }
    }
    if (typeof entry.expires === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires)) {
      problems.push(`entry ${entry.package} has expires=${entry.expires}, which is not a date`);
    }
  }
  if (problems.length > 0) {
    // **Reported before anything else runs.** A malformed allow-list is a bug that would otherwise
    // surface only on the day the network is unavailable — the worst possible moment to learn that
    // the file has been unparseable since it was written.
    fail("the allow-list is malformed", problems.join("\n"));
  }
  return raw;
}

/** `npm audit --json`, from `AUDIT_REPORT` if given, otherwise from npm. */
function audit() {
  // **The seam first.** A test that shells out to `npm audit` is a test of the network, and it
  // fails when npm is slow rather than when the code is wrong.
  const fromFile = process.env["AUDIT_REPORT"];
  if (fromFile !== undefined) {
    try {
      return JSON.parse(readFileSync(fromFile, "utf8"));
    } catch (error) {
      fail(`cannot read AUDIT_REPORT at ${fromFile}`, String(error));
    }
  }
  try {
    const out = execFileSync("npm", ["audit", "--json", "--audit-level=low"], {
      cwd: ROOT,
      encoding: "utf8",
      // npm exits non-zero when it finds anything, which is not this script failing.
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } catch (error) {
    const err = error;
    // npm's exit code is 1 when it reports vulnerabilities and its JSON is still on stdout.
    if (typeof err.stdout === "string" && err.stdout.trim().length > 0) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        fail("npm audit produced output that is not JSON", err.stdout.slice(0, 400));
      }
    }
    fail("npm audit could not be run", String(err.stderr ?? err).slice(0, 400));
  }
  return null;
}

// The allow-list is validated whether or not an audit ran, because a malformed allow-list is a bug
// that would otherwise be discovered only on the day the network is unavailable.
const allow = loadAllowlist();

if (process.argv.includes("--offline-check-only") && process.env["AUDIT_REPORT"] === undefined) {
  process.stdout.write(
    `check-npm-audit: allow-list is well formed (${allow.entries.length} entries, today ${TODAY})\n`,
  );
  process.exit(0);
}

const report = audit();
const advisories = report?.vulnerabilities ?? {};
const counts = report?.metadata?.vulnerabilities ?? {};

/** Everything in the report that should fail, keyed `package@severity`. */
const blocking = [];
for (const [name, advisory] of Object.entries(advisories)) {
  if (BLOCKING.has(advisory.severity)) blocking.push({ name, severity: advisory.severity });
}

const allowed = new Set(allow.entries.map((e) => `${e.package}@${e.severity}`));
const expired = allow.entries.filter((entry) => entry.expires < TODAY);

process.stdout.write(
  `check-npm-audit: ${counts.total ?? 0} advisories ` +
    `(${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ` +
    `${counts.low ?? 0} low); ${allow.entries.length} allow-listed, ${expired.length} expired\n`,
);

// **Every advisory below the blocking line is still named**, because a report nobody reads is not a
// report, and a low that becomes a high by being upgraded should be a thing someone noticed.
for (const [name, advisory] of Object.entries(advisories)) {
  if (BLOCKING.has(advisory.severity)) continue;
  process.stdout.write(`  below the line: ${name} ${advisory.severity}\n`);
}

if (expired.length > 0) {
  fail(
    `${expired.length} allow-list entries expired on or before ${TODAY}:\n` +
      expired.map((e) => `  ${e.package}@${e.severity} expired ${e.expires}`).join("\n") +
      `\n\n  Each entry is a decision about a specific advisory, listed in ${basename(ALLOWLIST)}.\n` +
      "  Re-check it, then either remove the entry (if the package moved) or write down why it still\n" +
      "  applies and give it a new date. This failure is the point of having dates in the file.",
  );
}

const unlisted = blocking.filter((b) => !allowed.has(`${b.name}@${b.severity}`));
if (unlisted.length > 0) {
  fail(
    `${unlisted.length} high or critical advisories are not allow-listed:\n` +
      unlisted.map((b) => `  ${b.name} ${b.severity}`).join("\n") +
      "\n\n  If `npm audit fix` offers a fix, take it. If it offers a *downgrade*, the entry belongs in\n" +
      `  ${ALLOWLIST.replace(ROOT + "/", "")} with a why and an expires date — and if it does not apply here at all,\n` +
      "  say why in the why.",
  );
}

process.stdout.write("check-npm-audit: clean\n");