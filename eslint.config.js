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
