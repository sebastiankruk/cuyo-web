#!/usr/bin/env node
/**
 * Read `coverage/coverage-summary.json` and print the per-tier figures 13.7 records.
 *
 * Vitest's own summary is one number for the whole run, and the floors are per tier — so
 * "Statements: 84.22%" says nothing about whether `engine/` met 90%. This aggregates the
 * per-file entries by their first path segment, which is the tier, and prints the table the
 * README quotes.
 *
 * **The floor is not printed next to the achieved figure without saying which is which.** A
 * table that showed "engine 97.7 / 90" reads as headroom and invites someone to raise the floor
 * to the measurement, which turns a ratchet into a mirror: it then moves down with every
 * regression. So the headroom is printed, and the README says the floor is the number that
 * catches the fall.
 *
 * Exits non-zero when a tier is below its floor, so this doubles as a check that does not
 * need vitest's threshold machinery — which is what makes it useful for reading the JSON
 * that `make coverage` leaves behind.
 *
 * Usage: `npm run test:coverage && node scripts/coverage-tiers.mjs`
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The floors, from design.md decision 12. Duplicated in `vite.config.ts` on purpose. */
const FLOORS = {
  engine: { statements: 90, branches: 85 },
  render: { statements: 80 },
  app: null,
};

const ROOT = resolve(import.meta.dirname, "..");
const SUMMARY = resolve(ROOT, "coverage/coverage-summary.json");

/** One coverage metric, as vitest's JSON summary shape holds it. */
function ratio(entries, metric) {
  const covered = entries.reduce((n, e) => n + e[metric].covered, 0);
  const total = entries.reduce((n, e) => n + e[metric].total, 0);
  return { covered, total, percent: total === 0 ? 100 : (100 * covered) / total };
}

function percent(value) {
  return `${value.toFixed(1)}%`;
}

let summary;
try {
  summary = JSON.parse(readFileSync(SUMMARY, "utf8"));
} catch (error) {
  // The two failures are different and the reason says which: "no such file" means nobody ran
  // the suite under coverage, while a parse error means the file is there and is not a report.
  // Collapsing them into "cannot read" would send someone to re-run an 18-second suite to fix a
  // truncated file.
  const reason = error?.code === "ENOENT" ? "it does not exist" : `unreadable: ${error?.message}`;
  console.error(`coverage-tiers: ${SUMMARY} — ${reason}`);
  if (error?.code === "ENOENT") {
    console.error("  Run `npm run test:coverage` first — this script reads what it leaves.");
  }
  process.exit(2);
}

const byTier = new Map();
for (const [file, entry] of Object.entries(summary)) {
  if (file === "total") continue;
  // Vitest keys the summary by **absolute** path, so the tier has to be read off a relative
  // one. Then the tier is the first segment, and the rest is the file's path within it.
  // Splitting on the *last* two segments — which is the obvious thing — puts
  // `engine/cual-runtime/x.ts` in a tier called `cual-runtime`, and every tier then reads as
  // having exactly one file.
  const relative = resolve(file).startsWith(ROOT + "/")
    ? resolve(file).slice(ROOT.length + 1)
    : file;
  const slash = relative.indexOf("/");
  if (slash < 0) continue;
  const tier = relative.slice(0, slash);
  if (!byTier.has(tier)) byTier.set(tier, []);
  byTier.get(tier).push(entry);
}

const rows = [];
const failures = [];
for (const [tier, floor] of Object.entries(FLOORS)) {
  const entries = byTier.get(tier);
  if (!entries || entries.length === 0) {
    failures.push(`${tier}: no files were measured at all, so no floor was applied`);
    continue;
  }
  const statements = ratio(entries, "statements");
  const branches = ratio(entries, "branches");
  const floorText = floor === null ? "none" : `${floor.statements}% stmts`;
  rows.push({
    tier,
    files: entries.length,
    statements: percent(statements.percent),
    branches: percent(branches.percent),
    floor: floorText,
    headroom:
      floor === null ? "—" : `${(statements.percent - floor.statements).toFixed(1)} pts`,
  });
  if (floor !== null) {
    if (statements.percent < floor.statements) {
      failures.push(
        `${tier}: statements ${percent(statements.percent)} is below the floor of ${floor.statements}%`,
      );
    }
    if (branches.percent < floor.branches) {
      failures.push(
        `${tier}: branches ${percent(branches.percent)} is below the floor of ${floor.branches}%`,
      );
    }
  }
}

const unlisted = [...byTier.keys()].filter((tier) => !(tier in FLOORS));
if (unlisted.length > 0) {
  // A directory with source files and no floor is not a mistake on its own — `app/` has no
  // floor by decision — but it should be a decision, and this says which ones are.
  console.log(`coverage-tiers: measured but unfloored: ${unlisted.join(", ")}`);
}

const header = ["tier", "files", "statements", "branches", "floor", "headroom"];
const table = rows.map((r) => [r.tier, String(r.files), r.statements, r.branches, r.floor, r.headroom]);
const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
console.log(line(header));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const row of table) console.log(line(row));

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`coverage-tiers: ${failure}`);
  process.exit(1);
}