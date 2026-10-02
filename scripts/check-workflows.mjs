#!/usr/bin/env node
/**
 * Check that the GitHub Actions workflows are valid, before GitHub has to find out.
 *
 * This exists because of a specific failure, and the specific failure is the reason to
 * believe it will not rot. `release.yml` shipped with `uses: setup-node@v7` instead of
 * `uses: actions/setup-node@v7`. Every CI job passed — eight of them, green — because
 * none of them look at the workflows. GitHub then refused to run the file at all: zero
 * jobs, no log, "this run likely failed because of a workflow file issue". The releases
 * this repository is supposed to publish on merge were silently not publishing, and the
 * evidence was a red X on a workflow nobody reads.
 *
 * So the gap is not "we should lint YAML". It is that `make check` covers code,
 * documentation, shell scripts and specs, and nothing covered the one file whose
 * invalidity stops all of the others from being able to run a release.
 *
 * Actionlint, not a hand-rolled check. A regex over `uses:` would catch today's bug and
 * miss the next one, and this file exists to be the gate rather than the guess. It runs
 * here as WebAssembly, so there is no binary to download, no checksum to pin, and no
 * difference between what `make check` sees and what CI sees.
 *
 * The npm package is a WebAssembly port of `rhysd/actionlint`, not the Go binary. That is
 * a real difference and it is why the version is pinned and why the check below was
 * verified against four known actionlint findings before being trusted: a missing action
 * owner, an unparseable expression, an unknown key in a step, and an undefined expression
 * context. It has no shellcheck integration, which `make lint-shell` already covers.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WORKFLOW_DIR = join(fileURLToPath(import.meta.url), "..", "..", ".github", "workflows");

/** Workflow files, sorted so a failure reads the same way twice. */
function workflowFiles() {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => join(WORKFLOW_DIR, name));
}

const files = workflowFiles();
if (files.length === 0) {
  console.error("check-workflows: no workflow files found; that is not what was expected.");
  process.exit(1);
}

const { createLinter } = require("actionlint");
const lint = await createLinter();

let problems = 0;
for (const file of files) {
  // Source text, not a path: the WASM build has no filesystem of its own, and handing it
  // a filename silently lints the empty string and reports three phantom errors.
  const found = await lint(readFileSync(file, "utf8"));
  for (const message of found) {
    const where = message.line > 0 ? `:${message.line}:${message.column}` : "";
    console.error(`${file}${where}: ${message.message} [${message.kind}]`);
    problems += 1;
  }
}

if (problems > 0) {
  console.error(
    `\ncheck-workflows: ${problems} problem(s) in ${files.length} workflow(s).\n` +
      "  A workflow that GitHub cannot parse does not fail loudly — it produces a run\n" +
      "  with zero jobs and no log, and whatever it was supposed to do silently does\n" +
      "  not happen.",
  );
  process.exit(1);
}

console.log(`check-workflows: ${files.length} workflow(s) valid`);