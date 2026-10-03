import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayScreen } from "./PlayScreen.tsx";
import { catalogue, loadLevel } from "./levels.ts";
import {
  DIFFICULTIES,
  describeDifficulty,
  levelsInTrack,
} from "../engine/level-format/index-data.ts";
import { tileSvg } from "../render/tile.ts";
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
  /*
   * The difficulty chosen for each level.
   *
   * One map rather than a button per difficulty. Rendering "Easy" and "Play" side by
   * side reads as two unrelated actions - and it did, which is the question asked about
   * it. A difficulty is a *choice* about the level, so it belongs in a control that
   * shows which one is current, and then there is one thing to press.
   *
   * Held here rather than per card so the choice survives scrolling the list, and so
   * one level's choice does not reset when another re-renders.
   */
  const [chosen, setChosen] = useState<ReadonlyMap<string, Difficulty>>(
    () => new Map(),
  );
  const pick = useCallback((id: string, difficulty: Difficulty) => {
    setChosen((prev) => new Map(prev).set(id, difficulty));
  }, []);
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
                  <LevelCard
                    entry={entry}
                    chosen={chosen.get(entry.id) ?? "normal"}
                    onChoose={(difficulty) => pick(entry.id, difficulty)}
                    onPick={onPick}
                  />
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
        {/*
          The interface notice AGPL section 5(d) requires.

          Not housekeeping: plain GPL-2 imposed no such requirement, so this is an
          obligation the upgrade created. Section 0 defines "Appropriate Legal Notices" as
          a prominently visible feature displaying a copyright notice, a statement that
          there is no warranty, that the work may be conveyed under this licence, and
          where to read it - so all four are here rather than only the first.

          The repository link is section 13's half. This is a static site, so "let people
          interact with it over a network" is simply true of it, and a modified version
          hosted elsewhere has to offer its source the same way. Pointing at ours is the
          version of that we can honour.
        */}
        <p className="shell__licence">
          Cuyo-web © 2026 Sebastian Ryszard Kruk ·{" "}
          <a href="https://github.com/sebastiankruk/cuyo-web">source</a> · free
          software under the{" "}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html">
            GNU Affero General Public License v3 or later
          </a>
          , no warranty
        </p>
      </footer>
    </main>
  );
}

/**
 * One level. The whole card is the thing you press.
 *
 * A 79-entry list where you have to hit a small pill is a list you use one-handed and
 * mis-tap, so the card is the target. It is done with an absolutely positioned
 * `<button>` covering the card rather than by making the card itself a button, for two
 * reasons:
 *
 * - A button inside a button is invalid HTML, and the card needs the difficulty control
 *   inside it.
 * - `role="button"` on a container that holds focusable children is worse: assistive
 *   technology reports one control and then finds nested controls inside it.
 *
 * A single real button, stretched over the card, is both valid and correctly
 * focusable, and its accessible name says what pressing it does. The difficulty control
 * sits above it in the stacking order, so choosing a difficulty does not also start the
 * level - which is what would happen with a naive `onClick` on the card.
 */
function LevelCard({
  entry,
  chosen,
  onChoose,
  onPick,
}: {
  readonly entry: LevelIndexEntry;
  readonly chosen: Difficulty;
  readonly onChoose: (difficulty: Difficulty) => void;
  readonly onPick: (entry: LevelIndexEntry, difficulty: Difficulty) => void;
}) {
  // Only difficulties the level actually has. `summary.ld` declares variant lists as
  // subsets of a track, so most levels have one and some have all three.
  const offered = DIFFICULTIES.filter((d) => entry.difficulties.has(d));
  const shown =
    entry.difficulties.get(chosen) ?? entry.difficulties.get("normal");
  // What the chosen difficulty does, in words. Shown always rather than only for a non-default
  // one: the interesting sentence is `normal`'s — "the level as its author wrote it" — and it is
  // also the answer to "what does this button do", which a label alone cannot say.
  const described = describeDifficulty(chosen);
  // Memoised on `shown`, which is an object out of the generated index and so is stable
  // for as long as the catalogue is. Without this every re-render of the list — and
  // choosing a difficulty re-renders all of it — would rebuild 79 SVG strings to produce
  // markup React then diffs as unchanged.
  const tile = useMemo(
    () =>
      shown === undefined
        ? ""
        : tileSvg(shown.tile, catalogue().palettes[shown.tile.palette] ?? ""),
    [shown],
  );
  return (
    <div className="levelCard">
      {/*
        First in the DOM, so tab order follows reading order and the difficulty control
        is reached straight after. Its label names the action rather than the level, so
        a screen reader says what pressing it does.
      */}
      {entry.supported ? (
        <button
          type="button"
          className="levelCard__hit"
          onClick={() => onPick(entry, chosen)}
        >
          Play {entry.name}
        </button>
      ) : (
        /*
          No hit target at all rather than a disabled one. A disabled button is
          unreachable by keyboard, so a screen-reader user could not find out *why* the
          level is unavailable - and the reason is the only interesting thing about it.
          The reason is in the card's text instead.
        */
        <span className="levelCard__blocked" role="note">
          {entry.unsupportedReason}
        </span>
      )}
      <span className="levelCard__body">
        <span className="levelCard__name">{entry.name}</span>
        {entry.author !== "" && (
          <span className="levelCard__author">{entry.author}</span>
        )}
        {entry.description !== "" && (
          <span className="levelCard__desc">{entry.description}</span>
        )}
        <span className="levelCard__tags">
          {coloursAt(entry) > 0 && <span>{coloursAt(entry)} colours</span>}
          <span>{neighbourLabel(shown)}</span>
          {shown?.chainGrass === true && <span>chain grass</span>}
        </span>
        {/*
          The chosen difficulty's sentence. In the body rather than on the button, because a
          `title` is a tooltip and this project's first platform is a phone. It names the
          difficulty rather than the level, so a screen reader reads it as the answer to
          "what does this control do".
        */}
        <span className="levelCard__difficultyNote">{described.description}</span>
      </span>
      {/*
        The level's board, as a tile.

        First in the card so it is the first thing the eye lands on, and before the body
        text in the DOM for the same reason: the tile is how the catalogue is meant to be
        read, by shape rather than by name. It follows the *chosen* difficulty, because
        that is the question it answers — "what am I about to play" — and a tile that
        always showed `normal` would quietly contradict the button next to it.

        `shown` is the resolved entry for the chosen difficulty, which can be undefined
        for a level that offers the difficulty but resolves to nothing; the tile is then
        omitted rather than drawn empty, since an empty board is not the level.
      */}
      {shown !== undefined && (
        <div
          className="levelCard__tile"
          // The SVG arrives as a string rather than as elements. React elements for 79
          // cards' worth of rectangles would be reconciled on every render of a list
          // whose pictures never change, and `dangerouslySetInnerHTML` is the one place
          // that risk is acceptable: the string comes from `tileSvg`, whose only inputs
          // are the generated index, and it filters both its colours through a pattern
          // before interpolating them into an attribute.
          dangerouslySetInnerHTML={{ __html: tile }}
        />
      )}
      <span className="levelCard__actions">
        {entry.supported && offered.length > 1 && (
          <span
            className="levelCard__difficulties"
            role="group"
            aria-label={`${entry.name} difficulty`}
          >
            {offered.map((difficulty) => (
              <button
                key={difficulty}
                type="button"
                className="levelCard__difficulty"
                aria-pressed={difficulty === chosen}
                onClick={() => onChoose(difficulty)}
              >
                {describeDifficulty(difficulty).name}
              </button>
            ))}
          </span>
        )}
        {/*
          An affordance, not a control. The card's own button is the hit target, so
          this only says what pressing the card does and repeats the chosen difficulty
          where the finger is about to land.
        */}
        {entry.supported && (
          <span className="levelCard__play" aria-hidden="true">
            Play
            {chosen !== "normal" && (
              <span className="levelCard__playSuffix">
                {" "}
                {describeDifficulty(chosen).name}
              </span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * How many colour kinds the level has at its normal difficulty.
 *
 * The index records the total kind count rather than a breakdown, because a breakdown
 * per level would triple the size of a generated file for a number the catalogue shows
 * in one line. `0` when the level has no normal difficulty, which is a level the card
 * cannot usefully describe.
 */
function coloursAt(entry: LevelIndexEntry): number {
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
function neighbourLabel(
  described: ReturnType<LevelIndexEntry["difficulties"]["get"]>,
): string {
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
