# engine

The headless simulation: `game-core`, `level-format` and `cual-runtime`.

Must run in plain Node with no host globals. `eslint.config.js` enforces this, so
the whole of `specs/game-core` and `specs/cual-runtime` stays testable without a
browser harness.

See `openspec/changes/cuyo-web/specs/game-core/spec.md`.
