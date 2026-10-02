# engine

The headless simulation: `game-core`, `level-format`, `progress` and `cual-runtime`.

Must run in plain Node with no host globals. `eslint.config.js` enforces this, so
the whole of `specs/game-core`, `specs/cual-runtime` and `specs/level-catalog` stays
testable without a browser harness.

`progress` is not simulation — it is what the player has finished and what that lets
them play next. It is here rather than in `app/` for the same reason, not for tidiness:
the cases that break it are all properties of the real catalogue (an unplayable level
sitting mid-track, an unordered track, a level in several tracks at several positions),
and those are only reachable by calling the functions. `app/progress-storage.ts` puts it
on the device.

See `openspec/changes/cuyo-web/specs/game-core/spec.md`.
