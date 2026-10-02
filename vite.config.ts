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
    // The root `*.test.ts` is for whole-repository facts that belong to no one
    // directory - currently the licence, which has to agree across the README, the
    // badge, the script headers and the prose, and which no per-directory test can see.
    include: ["{app,engine,levels-src,render}/**/*.test.ts", "*.test.ts"],
  },
});