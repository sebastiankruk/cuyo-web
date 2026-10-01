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
export default defineConfig({
  plugins: [react()],
  test: {
    // The engine package must be testable in plain Node with no browser
    // harness, so the default node environment is used deliberately.
    environment: "node",
    include: ["{engine,levels-src,render}/**/*.test.ts"],
  },
});