#!/usr/bin/env node
/**
 * Check that the version is consistent across `package.json` and `CHANGELOG.md`, and
 * print the section for the release notes.
 *
 * The version lives in two files because it has to: npm reads one, humans read the
 * other. That is two sources of truth, and the failure mode is a release tagged `0.3.0`
 * whose changelog still says `[Unreleased]` — a tag that points at something nobody can
 * describe.
 *
 * So the rule is: `CHANGELOG.md` must have a heading for the exact version in
 * `package.json`, and that section must not be `[Unreleased]`. Getting a release out
 * therefore means renaming the section, which is a deliberate act.
 *
 * Deliberately plain JavaScript with no dependencies. It runs in `make check`, in CI and
 * in the release workflow, and a release gate that needs a build to run is a release gate
 * that gets skipped.
 *
 * Usage:
 *   check-version.mjs            verify, and print nothing on success
 *   check-version.mjs --notes    print the section body, for the release notes
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WANT_NOTES = process.argv.includes("--notes");

const fail = (message, detail = "") => {
  console.error(`check-version: ${message}`);
  if (detail !== "") console.error(detail);
  process.exit(1);
};

/** `0.3.0`, and the leading `v` stripped if it is there. */
function versionOf(pkg) {
  const v = pkg?.version;
  if (typeof v !== "string" || v === "") {
    fail("package.json has no `version` string.");
  }
  if (!/^v?\d+\.\d+\.\d+([-+].+)?$/.test(v)) {
    fail(
      `package.json version is not semver: ${JSON.stringify(v)}`,
      "Expected `MAJOR.MINOR.PATCH`, optionally with a suffix.",
    );
  }
  return v.replace(/^v/, "");
}

/**
 * The changelog section for a version, and whether it exists.
 *
 * Matched on the heading rather than on a range, because `## [0.3.0]` and `## [0.3.0] -
 * 2026-10-02` are both legitimate and both name the version.
 */
function sectionFor(markdown, version) {
  // A heading is a line starting `## [`, optionally with a closing bracket.
  const heading = new RegExp(
    `^## \\[(${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\][^\\n]*$`,
    "m",
  );
  const at = heading.exec(markdown);
  if (at === null) return null;
  const bodyStart = at.index + at[0].length;
  // The next `## ` heading, or the end of the document.
  const rest = markdown.slice(bodyStart);
  const next = /^## /m.exec(rest);
  return {
    heading: at[0],
    body: (next === null ? rest : rest.slice(0, next.index)).trim(),
  };
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const changelog = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf8");
const version = versionOf(pkg);

// Every version the changelog already has, so the failure can say what is there.
const released = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)]
  .map((m) => m[1] ?? "")
  .filter((v) => v !== "Unreleased");

const section = sectionFor(changelog, version);
if (section === null) {
  const hasUnreleased = /^## \[Unreleased\]/m.test(changelog);
  const how = hasUnreleased
    ? [
        `  It has an [Unreleased] section. Rename it to [${version}] - and set the`,
        "  date on the same line, when you are ready to cut the release.",
      ]
    : [`  Add a "## [${version}]" section.`];
  fail(
    `CHANGELOG.md has no section for ${version}, which package.json declares.`,
    [
      ...how,
      hasUnreleased
        ? ""
        : `  Sections present: ${released.join(", ") || "(none)"}`,
      "",
      "  A tag points at something. A tag whose changelog entry is called",
      "  [Unreleased] points at something nobody can describe.",
    ].join("\n"),
  );
}

if (section.heading.trim() === "## [Unreleased]") {
  fail(
    "the changelog section for the current version is still called [Unreleased].",
  );
}

// A release section with nothing in it is a version bump with no user-visible change,
// which is worth knowing about before the tag exists rather than after.
if (WANT_NOTES) {
  if (section.body === "") {
    fail(
      `the ${version} changelog section is empty; there is nothing to release.`,
    );
  }
  console.log(section.body);
} else {
  console.log(
    `check-version: ${version} is consistent across package.json and CHANGELOG.md`,
  );
}
