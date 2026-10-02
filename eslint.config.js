import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "public/levels/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Build-time scripts under `scripts/`, which are plain JavaScript run directly by
    // Node rather than TypeScript. They are real code and get the same treatment —
    // without this they fall through to the recommended config with no globals at all,
    // so every `process` and `console` reads as an undefined variable.
    //
    // Node only, and deliberately not the browser globals the app gets: a script that
    // reaches for `window` is a script that cannot run in the release workflow.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
  },

  // ---------------------------------------------------------------------------
  // Engine boundary (design.md decision 1)
  //
  // `engine/` is the headless simulation. It must stay runnable in plain Node
  // so that every rule in specs/game-core and specs/cual-runtime can be tested
  // without a browser. Reaching for a host global there is the one mistake that
  // would silently break that, so it is a lint error rather than a convention.
  // ---------------------------------------------------------------------------
  {
    files: ["engine/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message:
            "engine/ is headless and must run in plain Node. Move DOM or canvas work to render/ or app/.",
        },
        {
          name: "document",
          message:
            "engine/ is headless and must run in plain Node. Move DOM or canvas work to render/ or app/.",
        },
        {
          name: "navigator",
          message:
            "engine/ is headless and must run in plain Node. Move DOM or canvas work to render/ or app/.",
        },
        {
          name: "localStorage",
          message:
            "engine/ is headless and must run in plain Node. Persistence belongs in mobile-experience code.",
        },
        {
          name: "Image",
          message:
            "engine/ is headless and must run in plain Node. Image decoding belongs in render/.",
        },
      ],
    },
  },

  // Browser-side packages.
  {
    files: ["app/**/*.{ts,tsx}", "render/**/*.ts"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
);
