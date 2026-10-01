import { useCallback, useEffect, useState } from "react";
import { PlayScreen } from "./PlayScreen.tsx";
import { catalogue, loadLevel } from "./levels.ts";
import { levelsInTrack } from "../engine/level-format/index-data.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";
import type {
  Difficulty,
  LevelIndexEntry,
} from "../engine/level-format/index-data.ts";

/** How a level was chosen, so the loading screen can name it. */
interface Chosen {
  readonly entry: LevelIndexEntry;
  readonly difficulty: Difficulty;
}

/** What the catalogue is doing right now. */
type State =
  | { readonly kind: "catalogue" }
  | { readonly kind: "loading"; readonly chosen: Chosen }
  | {
      readonly kind: "playing";
      readonly level: LevelDef;
      readonly chosen: Chosen;
    }
  | {
      readonly kind: "failed";
      readonly chosen: Chosen;
      readonly message: string;
    };

/**
 * Application shell.
 *
 * React owns screens and the HUD; the simulation runs on its own loop inside
 * `PlayScreen`. The catalogue now lists all 79 upstream levels, read from the index the
 * build generates, and a level's `.ld` file is fetched when it is chosen.
 *
 * The two hand-written fixtures are gone. They existed to exercise the board while the
 * parser was being written, and they are now a worse version of the real thing: they
 * describe two levels by hand where the loader can produce all of them from the same
 * data the game ships.
 */
export function App() {
  const [state, setState] = useState<State>({ kind: "catalogue" });
  const [seed] = useState(() => (Date.now() & 0xffff) | 1);

  const start = useCallback(
    (entry: LevelIndexEntry, difficulty: Difficulty) => {
      const chosen: Chosen = { entry, difficulty };
      setState({ kind: "loading", chosen });
      loadLevel(entry.id, difficulty).then(
        (loaded) => {
          setState({ kind: "playing", level: loaded.level, chosen });
        },
        (error: unknown) => {
          setState({
            kind: "failed",
            chosen,
            message: (error as Error).message,
          });
        },
      );
    },
    [],
  );

  const exit = useCallback(() => setState({ kind: "catalogue" }), []);

  // Escape leaves a level from anywhere, including the loading screen, so a failed or
  // slow fetch is never a dead end.
  useEffect(() => {
    if (state.kind === "catalogue") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.kind, exit]);

  if (state.kind === "playing") {
    return (
      <PlayScreen
        level={state.level}
        seed={seed}
        onExit={exit}
        onRestart={() => start(state.chosen.entry, state.chosen.difficulty)}
      />
    );
  }

  if (state.kind === "loading" || state.kind === "failed") {
    return (
      <main className="shell">
        <header className="shell__header">
          <h1>{state.chosen.entry.name}</h1>
          <p>
            {state.kind === "loading"
              ? "Loading the level file…"
              : state.message}
          </p>
        </header>
        <button type="button" className="btn" onClick={exit}>
          ‹ Levels
        </button>
      </main>
    );
  }

  return <Catalogue onPick={start} />;
}

/** The level list, grouped by track. */
function Catalogue({
  onPick,
}: {
  readonly onPick: (entry: LevelIndexEntry, difficulty: Difficulty) => void;
}) {
  const index = catalogue();
  // The Standard track first, because it is what a new player wants, then whatever else
  // the summary declares. `all` is the author's playing order across every level, which
  // is a better default than alphabetical but a worse first impression than a track.
  const tracks = index.tracks.filter((t) => t !== "all");

  return (
    <main className="shell">
      <header className="shell__header">
        <h1>Cuyo</h1>
        <p>
          A browser reimplementation of the abstract falling-blob puzzle game.{" "}
          {index.levels.length} levels, in {tracks.length} tracks.
        </p>
      </header>

      {tracks.map((track) => {
        const levels = levelsInTrack(index, track);
        if (levels.length === 0) return null;
        return (
          <section key={track} className="track">
            <h2 className="track__name">
              {trackName(track)}
              <span className="track__count">{levels.length}</span>
            </h2>
            <ul className="levels">
              {levels.map((entry) => (
                <li key={`${track}-${entry.id}`}>
                  <LevelCard entry={entry} track={track} onPick={onPick} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <footer className="shell__footer">
        <p>
          Keys: ← → move · ↑ or X rotate · ↓ or Space fast fall · R restart ·
          Esc back. On a phone: drag to steer, tap to rotate, drag down to drop.
        </p>
      </footer>
    </main>
  );
}

/** One level, with a button per difficulty it actually offers. */
function LevelCard({
  entry,
  track,
  onPick,
}: {
  readonly entry: LevelIndexEntry;
  readonly track: Parameters<typeof levelsInTrack>[1];
  readonly onPick: (entry: LevelIndexEntry, difficulty: Difficulty) => void;
}) {
  const offered = [...entry.difficulties.keys()];
  return (
    <div className="levelCard">
      <span className="levelCard__name">{entry.name}</span>
      {entry.author !== "" && (
        <span className="levelCard__author">{entry.author}</span>
      )}
      {entry.description !== "" && (
        <span className="levelCard__desc">{entry.description}</span>
      )}
      <span className="levelCard__tags">
        {coloursAt(entry, track) > 0 && (
          <span>{coloursAt(entry, track)} colours</span>
        )}
        <span>{neighbourLabel(entry)}</span>
        {entry.difficulties.get("normal")?.chainGrass === true && (
          <span>chain grass</span>
        )}
        {offered.map((difficulty) => (
          <button
            key={difficulty}
            type="button"
            className="levelCard__play"
            onClick={() => onPick(entry, difficulty)}
          >
            {difficulty === "normal" ? "Play" : difficulty}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * How many colour kinds the level has at this track's normal difficulty.
 *
 * The index records the total kind count rather than a breakdown, because a breakdown
 * per level would triple the size of a generated file for a number the catalogue shows
 * in one line. `0` when the level has no normal difficulty, which is a level the card
 * cannot usefully describe.
 */
function coloursAt(
  entry: LevelIndexEntry,
  track: Parameters<typeof levelsInTrack>[1],
): number {
  void track;
  const total = entry.difficulties.get("normal")?.kinds ?? 0;
  const nonColours = entry.goalKinds.length + (entry.greyKinds > 0 ? 1 : 0);
  return Math.max(0, total - nonColours - 1);
}

/** A track's display name, as upstream's menus spell it. */
function trackName(track: string): string {
  switch (track) {
    case "main":
      return "Standard";
    case "weird":
      return "Weird";
    case "contrib":
      return "Contributed";
    case "game":
      return "Game";
    case "extreme":
      return "Extreme";
    case "nofx":
      return "No effects";
    default:
      return track;
  }
}

/** How the board connects, in words a player can act on. */
function neighbourLabel(entry: LevelIndexEntry): string {
  const described = entry.difficulties.get("normal");
  switch (described?.neighbours) {
    case 0:
      return "sides";
    case 1:
      return "diagonals";
    case 2:
      return "hex";
    case 3:
      return "hex sides";
    case 4:
      return "knight";
    case 5:
      return "sides and diagonals";
    default:
      return `mode ${String(described?.neighbours ?? 0)}`;
  }
}
