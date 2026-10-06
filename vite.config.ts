// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * `CUYO_AI_MODE=1` deliberately changes nothing here.
 *
 * The obvious move is to force a terse reporter, and it is the wrong one. Vitest's
 * default reporter already detects that stdout is not a TTY - which it is not,
 * under an agent - and switches to a compact form: for this suite that is 14 lines
 * and 467 bytes, against 504 lines and 55 kB for `--reporter=verbose`. Forcing a
 * reporter overrides that detection, and the smallest forced choice,
 * `--reporter=dot`, is *larger* at 10 lines but 1474 bytes, because a dot per test
 * costs more than the whole compact summary.
 *
 * So the flag leaves the reporter alone, and the token saving comes from the
 * Makefile instead: no `echo` banners, no npm "notice" preamble, no echo of the
 * command lines. Measured on the full suite, that is the difference between 1458
 * and 467 bytes.
 */
/**
 * The hostnames the dev server will answer to.
 *
 * Vite refuses any request whose `Host` header it does not recognise, which is a
 * DNS-rebinding guard: without it, a page on the open internet could point a
 * hostname at your loopback interface and have the dev server serve it to
 * whoever loaded that page. Coming through the Cloudflare tunnel the header is
 * `dev-cuyo.kruk.me` rather than `localhost`, so the guard fires and the tunnel
 * sees "Blocked request".
 *
 * The hostname is allowed by name rather than by turning the check off with
 * `host: true`. A dev server that answers to any Host header is exactly what the
 * guard exists to prevent, and naming it means anything added later fails loudly
 * instead of quietly working.
 *
 * `CUYO_ALLOWED_HOSTS` overrides the list, comma-separated, for another tunnel
 * hostname or a second one. localhost, 127.0.0.1 and the machine's own address are
 * allowed by Vite already and are not repeated here.
 *
 * The hostname has changed once already (`dev.cuyo.kruk.me` to `dev-cuyo.kruk.me`),
 * and it is written out in `docs/tunnel-dev.md` as well. Those two places plus this
 * one are the whole list: the tunnel's ingress config in `~/.cloudflared/` and the
 * Cloudflare DNS record are yours, not the repository's.
 */
const ALLOWED_HOSTS = (process.env["CUYO_ALLOWED_HOSTS"] ?? "dev-cuyo.kruk.me")
  .split(",")
  .map((h) => h.trim())
  .filter((h) => h !== "");

/**
 * Which commit the running server was built from, and whether the tree had uncommitted
 * changes when it started.
 *
 * Exists to settle one specific argument, which has now come up twice: "it looks the same
 * as before". A screenshot of the dev overlay carries the phase, the step and the seed,
 * but nothing that says which build produced it - so a stale page in a browser and a fix
 * that did not work look identical from the outside, and telling them apart means asking
 * the person looking whether they reloaded, which is the one question they cannot answer
 * reliably.
 *
 * With the commit in the corner, any screenshot says which build it came from. `dirty`
 * matters as much as the hash: a dev server started before a commit and never restarted
 * keeps serving the old modules, and that is exactly the case this is here to catch.
 */
function buildStamp(): { commit: string; dirty: boolean } {
  try {
    // `execFileSync` rather than a shell string, so a path with a space in it cannot turn
    // into something unexpected. And failure is not fatal: a source tree with no git in
    // it should still build, it just cannot say which commit it is.
    const here = fileURLToPath(new URL(".", import.meta.url));
    const run = (args: string[]): string =>
      execFileSync("git", args, {
        cwd: here,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    return {
      commit: run(["rev-parse", "--short", "HEAD"]) || "unknown",
      dirty: run(["status", "--porcelain"]) !== "",
    };
  } catch {
    return { commit: "unknown", dirty: false };
  }
}

const STAMP = buildStamp();

/**
 * Serves the commit hash as a module, so the dev overlay can say which build it is.
 *
 * A virtual module rather than `define`, because `define` is substituted by `vite build`
 * and *not* in the dev server - which is backwards for this, since the dev server is
 * where the question gets asked. Found by grepping what the dev server actually served.
 * A plugin works the same in dev, build and test, since all three use one pipeline.
 */
const buildStampPlugin = {
  name: "build-stamp",
  resolveId: (id: string): string | undefined =>
    id === "virtual:build-stamp" ? "\0build-stamp" : undefined,
  load: (id: string): string | undefined =>
    id === "\0build-stamp"
      ? `export const COMMIT = ${JSON.stringify(STAMP.commit)};\n` +
        `export const DIRTY = ${STAMP.dirty};\n`
      : undefined,
};

/**
 * The floors, as numbers, in one place.
 *
 * Exported so `engine/coverage-floors.test.ts` can assert that what is *configured* is what
 * decision 12 says, without reading a markdown file to find out. Duplicated in design.md
 * deliberately: a table that is generated from the config is a table that changes when the
 * config is wrong, and this is the record of what was decided.
 */
export const COVERAGE_FLOORS = {
  engine: { statements: 90, branches: 85 },
  render: { statements: 80 },
} as const;

export default defineConfig({
  plugins: [react(), buildStampPlugin],
  server: {
    allowedHosts: ALLOWED_HOSTS,
  },
  preview: {
    // The same guard applies to `vite preview`, which serves dist/ - and that one
    // is the more interesting target, since dist/ is the deployed artefact.
    allowedHosts: ALLOWED_HOSTS,
  },
  test: {
    // The engine package must be testable in plain Node with no browser
    // harness, so the default node environment is used deliberately.
    environment: "node",
    // `app/` is included for its canvas-free logic. design.md decision 12 puts the
    // game-feel numbers - gesture thresholds, key repeat - in pure functions
    // precisely so they can be tested without a browser; excluding `app/` would
    // leave those numbers untestable, which is the thing the split was for.
    // Component tests that need a DOM are a separate environment, not this one.
    //
    // **13.5 and 13.8 are what this is for**, and neither existed before: both need a real DOM,
    // and `jsdom` is what supplies one. It is scoped to the files that ask for it by name rather
    // than made the project default, for the reason the paragraph above gives — the engine must
    // stay runnable in plain Node, and a global DOM would quietly let an engine test reach for
    // `document` and pass.
    //
    // Deliberately `jsdom` and not `happy-dom`: it implements more of the platform, and the two
    // tests that use it care about `PointerEvent`, `setPointerCapture` and `performance.now`,
    // all of which `happy-dom` handles less completely.
    // The root `*.test.ts` is for whole-repository facts that belong to no one
    // directory - currently the licence, which has to agree across the README, the
    // badge, the script headers and the prose, and which no per-directory test can see.
    //
    // `*.test.tsx` is here for one file: `app/PlayScreen.dom.test.tsx`, the mounted component test
    // (13.8). JSX cannot live in a `.ts` file, and renaming the file rather than writing the
    // component tree with `createElement` is the smaller of the two costs — a test that renders
    // through `createElement` reads nothing like the component it renders.
    include: ["{app,engine,levels-src,render}/**/*.test.ts", "**/*.test.tsx", "*.test.ts"],

    /**
     * The coverage floors, which are design.md decision 12's and not mine.
     *
     * | tier       | floor                                    |
     * | ---------- | ---------------------------------------- |
     * | `engine/`  | ≥ 90% statements, ≥ 85% branches         |
     * | `render/`  | ≥ 80% statements                         |
     * | `app/`     | none — covered by behaviour tests, review |
     *
     * A ratchet and not a goal: `coverage.floor` is the number the suite enforces, and 13.7
     * records what is actually achieved so a fall shows up in a review diff. **The two must
     * not be the same number.** A floor set to today's measurement cannot catch a regression,
     * because it moves with it — and that is the whole function of a floor. So the floor is
     * below the achieved figure and the README says which is which.
     *
     * `app/` has no floor on purpose and the omission is deliberate: decision 12 puts it under
     * review rather than a percentage, because a component is mostly JSX and its percentage
     * says how much markup it has rather than whether it works. A file listed there with a
     * threshold would be a claim nobody made.
     *
     * `perFile: false` because a per-file floor would demand that every *file* be well covered,
     * and decision 12 says the percentage's job is "to catch whole untested files" — which is a
     * job for the aggregate plus the census-style tests, not for sixty thresholds.
     */
    coverage: {
      provider: "v8",
      // **Exactly the tiers decision 12 floors**, which is `engine/`, `render/` and `app/`.
      //
      // `levels-src/` is excluded on purpose: it is the index and manifest *generators*, which
      // run under `make level-index` and `make art-manifest` rather than in a unit test, and the
      // only thing a unit-test coverage run would say about them is "1.4%", which is true and
      // useless — it measures that a build script is a build script. Their verification is that
      // they run and that what they emit passes the corpus tests, which is what 2.13 and 2.14 are.
      // Including them would also mean inventing a fourth tier and a floor nobody decided on.
      include: ["engine/**/*.ts", "render/**/*.ts", "app/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/testing/**",
        "app/build-stamp.d.ts",
      ],
      reporter: ["text-summary", "json-summary"],
      // Where `coverage/coverage-summary.json` lands. Gitignored, and regenerated on demand
      // rather than committed — a committed report is a diff on every run.
      reportsDirectory: "coverage",
      thresholds: {
        "engine/**/*.ts": {
          statements: COVERAGE_FLOORS.engine.statements,
          branches: COVERAGE_FLOORS.engine.branches,
        },
        "render/**/*.ts": {
          statements: COVERAGE_FLOORS.render.statements,
        },
      },
    },
  },
});
