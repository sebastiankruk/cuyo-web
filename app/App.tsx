// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayScreen } from "./PlayScreen.tsx";
import { catalogue, loadLevel } from "./levels.ts";
import {
  DIFFICULTIES,
  describeDifficulty,
} from "../engine/level-format/index-data.ts";
import { tileSvg } from "../render/tile.ts";
import { cardState, canStart, cardsInTrack, trackCounts } from "./level-cards.ts";
import type { LevelCardState } from "./level-cards.ts";
import { completeAndStore, emptyState, readState } from "./progress-storage.ts";
import type { StoredState } from "./progress-storage.ts";
import type { Progress } from "../engine/progress/progress.ts";
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
    }
  | {
      /**
       * A level that was not allowed to start.
       *
       * A state rather than a silent return, because the requirement is that a locked
       * level cannot be started *and the player can find out why*. Refusing to load is
       * only half of it: a tap that does nothing is indistinguishable from a broken app,
       * and the card's own message is below the fold on a phone.
       */
      readonly kind: "blocked";
      readonly entry: LevelIndexEntry;
      readonly reason: string;
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
  /**
   * What the player has finished, read once per launch.
   *
   * Held in React state rather than re-read on every render so that a win is a state
   * transition like any other, and the catalogue re-renders against a value that cannot
   * change underneath it mid-paint. `readState` is total — a corrupt store yields empty
   * progress rather than throwing — so this cannot take the catalogue down with it.
   */
  const [stored, setStored] = useState<StoredState>(emptyState);

  // Read after the first paint rather than during it, because `readState` touches
  // `localStorage`, which does not exist during a server render and is a synchronous
  // main-thread read either way. The catalogue's first paint is therefore "nothing won",
  // which is the truth for a returning player for exactly one frame.
  useEffect(() => {
    setStored(readState());
  }, []);

  const start = useCallback(
    (entry: LevelIndexEntry, difficulty: Difficulty) => {
      /*
       * The gate, checked here and not only in the card — task 9.4's actual requirement.
       *
       * A card that renders no button is a claim about the card; this is the claim about
       * the game. 9.4 asks that a locked level cannot be *started*, and the way that
       * silently fails is a level reached some other way — a stale card from before a
       * completion, a keyboard activation of a focusable node, a future deep link — with
       * the loader never having been asked. Both ends read `canStart` on one card state,
       * so the two cannot disagree.
       */
      const card = cardState(stored.progress, catalogue(), entry, difficulty);
      if (!canStart(card)) {
        setState({ kind: "blocked", entry, reason: card.blockDetail });
        return;
      }
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
    [stored.progress],
  );

  /**
   * A win, recorded and shown.
   *
   * `completeAndStore` both computes the new record and writes it, so the state set here
   * is the one on the device rather than a copy of it. The catalogue reads this value, so
   * finishing a level ticks its card without a reload.
   */
  const onWin = useCallback((id: string, difficulty: Difficulty, score: number) => {
    setStored(completeAndStore(id, difficulty, score));
  }, []);

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
        onWin={(score) => onWin(state.chosen.entry.id, state.chosen.difficulty, score)}
        onRestart={() => start(state.chosen.entry, state.chosen.difficulty)}
      />
    );
  }

  if (state.kind === "blocked") {
    // The same shell the loading screen uses, because it is the same situation: a level
    // that was asked for and did not happen. Escape already leaves it, so this is never a
    // dead end.
    return (
      <main className="shell">
        <header className="shell__header">
          <h1>{state.entry.name}</h1>
          <p>{state.reason}</p>
        </header>
        <button type="button" className="btn" onClick={exit}>
          ‹ Levels
        </button>
      </main>
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

  return <Catalogue progress={stored.progress} onPick={start} />;
}

/** The level list, grouped by track. */
function Catalogue({
  progress,
  onPick,
}: {
  readonly progress: Progress;
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
        /*
         * The cards for this track, derived once and passed down whole.
         *
         * A `LevelCardState` per level rather than a flag, because the card needs four
         * related facts and recomputing them at the point of use is how two of them end up
         * describing different levels — the button says playable and the text says
         * locked. `cardsInTrack` is also what keeps unplayable levels in the list, which
         * `levelsInTrack` alone did not distinguish.
         *
         * The chosen difficulty is read per level as the cards are built, because a card's
         * best score is its chosen difficulty's score and the control that chooses it is
         * on the card. Changing one re-derives that card, not the other 78.
         */
        const difficultyOf = (entry: LevelIndexEntry): Difficulty =>
          chosen.get(entry.id) ?? "normal";
        const cards = cardsInTrack(progress, index, track, difficultyOf);
        if (cards.length === 0) return null;
        const counts = trackCounts(cards);
        return (
          <section key={track} className="track">
            <h2 className="track__name">
              {trackName(track)}
              {/*
                How far through the track the player is — task 9.4.
                "3 of 59" rather than a percentage, because the fraction is the more
                flattering number and the less useful one: it does not say what is left.
                Only shown once something has been won, since "0 of 59" on a first visit
                is a statement about the player rather than about the game.
              */}
              {counts.completed > 0 && (
                <span className="track__count">
                  {counts.completed} of {counts.total} won
                </span>
              )}
            </h2>
            <ul className="levels">
              {cards.map((card) => (
                <li key={`${track}-${card.entry.id}`}>
                  <LevelCard
                    card={card}
                    chosen={difficultyOf(card.entry)}
                    onChoose={(difficulty) => pick(card.entry.id, difficulty)}
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
  card,
  chosen,
  onChoose,
  onPick,
}: {
  readonly card: LevelCardState;
  readonly chosen: Difficulty;
  readonly onChoose: (difficulty: Difficulty) => void;
  readonly onPick: (entry: LevelIndexEntry, difficulty: Difficulty) => void;
}) {
  const { entry } = card;
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
    <div
      className={
        /*
         * The unsupported modifier, and only for unsupported. The stylesheet cannot tell
         * an unsupported card from a locked one otherwise — both carry
         * `.levelCard__blocked` — and the two say different things: one is a to-do for
         * the player, the other a limitation of the game that no progress fixes.
         */
        card.blockReason === "unsupported"
          ? "levelCard levelCard--unsupported"
          : "levelCard"
      }
    >
      {/*
        The hit target exists if and only if the card is playable — task 9.4.

        **`canStart(card)`, not `entry.supported`.** The old condition predates the gate:
        it asked only whether this engine can run the level, so a locked level got a
        full-card button that started it. The one field is what both this and `App`'s
        loader read, so the button and the loader cannot disagree about a level.
      */}
      {canStart(card) ? (
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
          {card.blockDetail}
        </span>
      )}
      {/*
        The tick, for a level won at any difficulty.

        **A tick rather than dimming or a strike-through**, because this is the one piece
        of progress feedback the card carries and it has to survive a glance down a list of
        79. It is placed on the name rather than beside the tags so that a card's own head
        line says "finished" without the reader having to check which row of small pills
        it belongs to.

        `aria-label` rather than the bare glyph: a tick is announced as "check mark" or
        not at all, and what a player needs to hear is that they have finished this level.
      */}
      {card.completed && (
        <span className="levelCard__tick" role="img" aria-label={`${entry.name} won`}>
          ✓
        </span>
      )}
      {/*
        The tile, before the text, so the grid's source order and reading order agree.

        It follows the *chosen* difficulty, because that is the question it answers — "what
        am I about to play" — and a tile that always showed `normal` would quietly
        contradict the button next to it. `shown` is the resolved entry for that choice,
        which can be undefined for a level that offers the difficulty but resolves to
        nothing; the tile is then omitted rather than drawn empty, since an empty board is
        not the level.
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
      {/*
        The card's text, in two groups rather than one, and that split is the whole layout.

        The tile goes beside the *name*, and everything else runs the full width of the
        card. When the text was a single group the only two ways to place the tile were
        both wrong: a grid column made the column as wide as the tile for the card's
        entire height, so the description and the tags were squeezed beside empty space
        they were nowhere near; and a `float` was supposed to say "beside this for a
        while, then full width", which depends on whether a float intrudes into a
        `display: grid` container — and it does not, so the text either ignored the tile or
        was narrowed by something subtler. Two screenshots and no browser to measure with
        is a poor place to be relying on that.

        Naming the areas removes the question. `head` is beside the tile, `rest` spans both
        columns, `act` spans both. The description is full width because the stylesheet says
        `rest rest` in two places, not because of how a float happens to interact with a
        grid.
      */}
      <span className="levelCard__head">
        {/*
          The lock, on the name's line — from a screenshot.

          **The gate was working and the screenshot could not tell.** Every locked card was
          distinguished only by the *absence* of a Play pill, a 1px dashed border, and a
          name going from `#e8ecf5` to `#97a1b8`. That is three subtractions, and the
          report on that screenshot was "I don't see much difference" — which is the
          correct report of a state expressed only by what is missing.

          A glyph says it positively. It sits beside the name rather than replacing it,
          because the level exists and is findable; a card that hid itself or showed a
          lock *instead of* a name would make 56 levels look like they do not exist,
          which is a different message from "not yet" and is not what is true.

          Drawn rather than an emoji: 🔒 is a colour glyph that renders differently on
          every platform and cannot be given the card's own muted colour, which is the
          whole of the visual language here.
        */}
        {card.blockReason !== "none" && (
          <span
            className="levelCard__lock"
            role="img"
            aria-label={
              card.blockReason === "unsupported"
                ? `${entry.name} cannot be played by this version`
                : `${entry.name} is locked`
            }
            // **The one place `dangerouslySetInnerHTML` is right for a constant.** Written
            // as a child it renders as visible `<svg viewBox=…>` text — the markup,
            // escaped — so every locked card would carry a line of source in it. Caught by
            // `level-cards.dom.test.tsx` asserting `innerHTML` contains `<svg`, which is
            // the assertion that only passes if React parsed it rather than escaped it.
            //
            // Safe because `LOCK_GLYPH` is a module constant with nothing interpolated
            // into it; the tile's use of this is riskier and says so.
            dangerouslySetInnerHTML={{ __html: LOCK_GLYPH }}
          />
        )}
        <span className="levelCard__name">{entry.name}</span>
        {entry.author !== "" && (
          <span className="levelCard__author">{entry.author}</span>
        )}
      </span>
      <span className="levelCard__rest">
        {/*
          The blocked reason, promoted above the description — from a screenshot.

          It was rendering last, below the tags and below the Easy/Normal control, which
          made it read as another item in the difficulty row rather than as the card's
          status. It is the one sentence on the card that says what to do next, so it is
          now the first thing in `rest`: above the description, because the description
          is about the level and the blocker is about the player.

          **Not removed from where it was** — `levelCard__blocked` is the only element
          carrying the reason in the accessible tree for a blocked card's hit target, and
          the stylesheet keys the dashed and dotted borders off it. This is a second,
          visible rendering of the same string rather than a move.
        */}
        {card.blockReason !== "none" && (
          <span className="levelCard__why">{card.blockDetail}</span>
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
          What the chosen difficulty does — but only when it is not the default.

          It was on every card, and for `normal` it is the same sentence 79 times: "The
          level as its author wrote it, with no difficulty qualifier." Repeated that often
          it stops being information and becomes furniture, and it was two lines of a card
          that did not need them — a screenshot showed Octopi's wrapping to two lines
          beside a third of the card left empty.

          So it appears when the choice is not the default, which is the only time it
          answers a question. `normal` is the level as written, which the card already says
          by not qualifying it; `easy` and `hard` change the level, and that is worth a
          sentence. Task 6.3 asked for these descriptions and they are still here — the
          change is when they are shown, not whether they exist.
        */}
        {chosen !== "normal" && (
          <span className="levelCard__difficultyNote">{described.description}</span>
        )}
        {/*
          The best score, as a tag among the tags — task 9.4.

          **Only when there is one.** `null` is "never won at this difficulty", and
          printing "best —" or "best 0" for the 79 cards that have never been won would
          make the two that have look like they lost points. It is the *chosen*
          difficulty's score, so a player who beat this on Easy and is looking at the Hard
          row is not answered about Easy; `cardState` returns null there rather than
          falling back, which is the same distinction `LevelRecord.bestScore` draws.

          A tag and not a heading: it is one fact in a row of small facts, and a number
          given prominence would read as the level's rating rather than the player's own
          best attempt.
        */}
        {card.bestScore !== null && (
          <span className="levelCard__best">Best {card.bestScore}</span>
        )}
      </span>
      <span className="levelCard__actions">
        {/*
          The difficulty control stays on a locked card.

          **Deliberately, and this is the one judgement in 9.4 that could go the other
          way.** Choosing a difficulty changes which level `Play` would load and which
          best score is shown, both of which are still true for a locked level — and a
          player reading a locked card is often reading it *because* they intend to play
          it, so hiding the control removes the only thing they can usefully do.

          The gate is unaffected either way: this control calls `onChoose`, never
          `onPick`, and `App.start` re-checks `canStart` regardless of how it was reached.
        */}
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

          **`canStart`, not `entry.supported`** — a "Play" pill on a locked card is a
          promise the card does not keep, and it is the most misleading thing the card
          could say. A locked level shows its blocked reason instead.
        */}
        {canStart(card) && (
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
 * A padlock, as three rectangles rather than an emoji.
 *
 * **Inline SVG rather than 🔒** for two reasons that both came from looking at it. A
 * colour emoji renders differently on every platform, so the lock in a screenshot from
 * one machine says nothing about the lock on another; and it cannot be given the card's
 * own `--muted`, so it would sit on the dimmed card as the brightest thing in it —
 * louder than the level name it is qualifying.
 *
 * Drawn in a 1em box so it scales with whatever it sits beside, and `currentColor` so
 * the one place that sets a colour is the stylesheet.
 */
const LOCK_GLYPH =
  '<svg viewBox="0 0 12 14" width="11" height="13" fill="none" ' +
  'stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">' +
  '<rect x="1.5" y="6.5" width="9" height="6" rx="1.2" />' +
  '<path d="M3.75 6.5V4.75a2.25 2.25 0 0 1 4.5 0V6.5" />' +
  "</svg>";

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
