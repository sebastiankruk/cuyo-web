import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // The engine package must be testable in plain Node with no browser
    // harness, so the default node environment is used deliberately.
    environment: "node",
    include: ["{engine,levels-src,render}/**/*.test.ts"],
  },
});
