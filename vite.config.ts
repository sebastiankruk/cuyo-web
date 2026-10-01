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
 * `dev.cuyo.kruk.me` rather than `localhost`, so the guard fires and the tunnel
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
 */
const ALLOWED_HOSTS = (process.env["CUYO_ALLOWED_HOSTS"] ?? "dev.cuyo.kruk.me")
  .split(",")
  .map((h) => h.trim())
  .filter((h) => h !== "");

export default defineConfig({
  plugins: [react()],
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
    include: ["{app,engine,levels-src,render}/**/*.test.ts"],
  },
});