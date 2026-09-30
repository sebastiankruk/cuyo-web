import { useCallback, useState } from "react";
import { PlayScreen } from "./PlayScreen.tsx";
import { FIXTURES } from "../engine/level-format/fixtures.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";

/**
 * Application shell.
 *
 * React owns screens and the HUD; the simulation runs on its own loop inside
 * `PlayScreen`. Two levels are available for now, transcribed from upstream
 * `.ld` files; the parser in task group 2 will replace `FIXTURES`.
 */
export function App() {
  const [playing, setPlaying] = useState<LevelDef | null>(null);
  const [seed] = useState(() => (Date.now() & 0xffff) | 1);

  const exit = useCallback(() => setPlaying(null), []);

  if (playing !== null) {
    return <PlayScreen level={playing} seed={seed} onExit={exit} />;
  }

  return (
    <main className="shell">
      <header className="shell__header">
        <h1>Cuyo</h1>
        <p>
          A browser reimplementation of the abstract falling-blob puzzle game.
          Two of {FIXTURES.length} ported levels so far.
        </p>
      </header>

      <ul className="levels">
        {FIXTURES.map(({ make }) => {
          const level = make();
          return (
            <li key={level.id}>
              <button
                type="button"
                className="levelCard"
                onClick={() => setPlaying(level)}
              >
                <span className="levelCard__name">{level.name}</span>
                <span className="levelCard__author">{level.author}</span>
                <span className="levelCard__desc">{level.description}</span>
                <span className="levelCard__tags">
                  <span>{level.kinds.filter((k) => k.role === "colour").length} colours</span>
                  <span>
                    {level.neighbours === 0
                      ? "rect"
                      : level.neighbours === 1
                        ? "diagonal"
                        : `mode ${level.neighbours}`}
                  </span>
                  <span>{level.chainGrass ? "chain grass" : "plain grass"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="shell__footer">
        <p>
          Keys: ← → move · ↑ or X rotate · ↓ or Space fast fall · R restart ·
          Esc back
        </p>
      </footer>
    </main>
  );
}
