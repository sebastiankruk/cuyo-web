import { useCallback, useEffect, useRef, useState } from "react";
import { GameLoop } from "./game-loop.ts";
import { Simulation } from "../engine/game-core/simulation.ts";
import type { Phase } from "../engine/game-core/simulation.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";
import { GRX, GRY } from "../engine/game-core/constants.ts";
import { render } from "../render/board.ts";
import { boardHeight, boardSizing, boardWidth } from "../render/geometry.ts";
import {
  buildPalette,
  colourFor as paletteColourFor,
} from "../render/palette.ts";
import {
  NO_TOUCH,
  applyGesture,
  moveTouch,
  pressTouch,
  releaseTouch,
} from "./gestures.ts";
import type { TouchState } from "./gestures.ts";
import { goalSummary, goalSummaryLines } from "./goals.ts";

/** Held-direction repeat timings, in ms. */
const DAS_DELAY = 170;
const DAS_RATE = 55;

/**
 * The kind constant for a goal kind's name.
 *
 * The summary carries names and the board stores constants, so the swatch needs the
 * translation. `-1` when the name is not in the table, which the palette answers with
 * its fallback rather than throwing - a missing swatch is not worth failing a frame for.
 */
function goalKindIndex(level: LevelDef, name: string | null): number {
  if (name === null) return -1;
  return level.kinds.findIndex((k) => k.name === name);
}

/** How often the HUD is allowed to re-render. */
const HUD_INTERVAL_MS = 100;

interface Props {
  level: LevelDef;
  seed: number;
  onExit: () => void;
  /**
   * Restarts the same level from the catalogue.
   *
   * Separate from `onExit` because restarting and leaving are different: leaving goes
   * back to the list, restarting re-loads this level. Reloading matters for a real
   * level - its start layout is randomised at load time, so a restart is a new board,
   * not the one the player just failed.
   */
  onRestart?: () => void;
}

interface Hud {
  score: number;
  greys: number;
  goals: number;
  phase: Phase;
  frameMs: number;
  steps: number;
}

const INITIAL_HUD: Hud = {
  score: 0,
  greys: 0,
  goals: 0,
  phase: "falling",
  frameMs: 0,
  steps: 0,
};

export function PlayScreen({ level, seed, onExit, onRestart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<GameLoop | null>(null);
  const heldTimers = useRef<number[]>([]);
  /**
   * Cell size in CSS pixels, shared with the gesture decoder.
   *
   * Written by the sizing effect below and read by the pointer handler, which is a
   * separate effect. A ref rather than state because the handler must see the
   * current value without re-subscribing every time the board is resized.
   */
  const sizeRef = useRef(32);

  // Bumping runId rebuilds the simulation, which is how restart works.
  const [runId, setRunId] = useState(0);
  const simRef = useRef<{ sim: Simulation; id: number } | null>(null);
  if (simRef.current === null || simRef.current.id !== runId) {
    simRef.current = {
      sim: new Simulation(level, { seed: seed + runId }),
      id: runId,
    };
  }
  const sim = simRef.current.sim;

  const [hud, setHud] = useState<Hud>(INITIAL_HUD);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const parent = canvas.parentElement;
    /**
     * Resizes the canvas from the space actually available.
     *
     * The canvas is sized from the available box, not from its own width. The
     * renderer works in whole cells and derives the board's height as 20 * size,
     * so sizing it by width alone produced a board four times taller than the
     * canvas - only the top five of twenty rows were visible, and since both
     * levels put every blob in the bottom row the board looked empty.
     *
     * Returns the cell size, which the frame loop closes over; `sizeRef` keeps the
     * gesture decoder in step when the board is later resized.
     */
    const resize = (): number => {
      const availableWidth =
        parent?.clientWidth ?? canvas.clientWidth ?? GRX * 32;
      const availableHeight =
        parent?.clientHeight ?? canvas.clientHeight ?? GRY * 32;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sizing = boardSizing(availableWidth, availableHeight, dpr);
      sizeRef.current = sizing.size;
      // Assigning width or height clears the canvas, so both happen before the
      // transform is set again or every frame would be drawn untransformed.
      canvas.width = sizing.pixelsX;
      canvas.height = sizing.pixelsY;
      // The element's own box is set explicitly, in CSS pixels, to exactly the
      // board's size.
      //
      // This used to be left to CSS: `aspect-ratio: 1 / 2` plus `max-width` and
      // `max-height` on a canvas whose intrinsic size is its backing store. That
      // is ambiguous, and on a tablet it resolved badly - the board came out
      // roughly square in the middle of a large landscape viewport, with a wide
      // band of dead space above it, because the two clamps fought each other over
      // an element whose intrinsic size was in device pixels. Saying "the element
      // is exactly this many CSS pixels, and the backing store is that times the
      // device ratio" leaves nothing for the stylesheet to disagree about.
      canvas.style.width = `${boardWidth(sizing.size)}px`;
      canvas.style.height = `${boardHeight(sizing.size)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return sizing.size;
    };

    let size = resize();

    // A ResizeObserver rather than a window resize listener, because the box that
    // matters is the board container, not the window: rotating a tablet, the
    // on-screen keyboard appearing, or the browser's toolbar collapsing on scroll
    // all change it without a window resize. Without this the canvas kept the size
    // it had on mount, so rotating left the board stretched or cropped.
    const observer = new ResizeObserver(() => {
      size = resize();
    });
    if (parent !== null) observer.observe(parent);
    else observer.observe(canvas);

    const loop = new GameLoop(sim);
    loopRef.current = loop;

    let lastHud = 0;
    loop.subscribe((s) => {
      render(ctx, s, size);
      const now = performance.now();
      if (now - lastHud >= HUD_INTERVAL_MS) {
        lastHud = now;
        setHud({
          score: s.score,
          greys: s.greyCount,
          goals: s.goalCount,
          phase: s.phase,
          frameMs: loop.frameMs,
          steps: loop.steps,
        });
      }
    });

    loop.start();
    return () => {
      observer.disconnect();
      loop.stop();
      loopRef.current = null;
    };
  }, [sim]);

  const release = useCallback(() => {
    for (const t of heldTimers.current) {
      window.clearTimeout(t);
      window.clearInterval(t);
    }
    heldTimers.current = [];
  }, []);

  useEffect(() => release, [release]);

  const hold = useCallback(
    (dir: -1 | 1) => {
      const apply = () => (dir === -1 ? sim.moveLeft() : sim.moveRight());
      apply();
      heldTimers.current.push(
        window.setTimeout(() => {
          heldTimers.current.push(window.setInterval(apply, DAS_RATE));
        }, DAS_DELAY),
      );
    },
    [sim],
  );

  // Touch, on the board itself. `touch-action: none` on the canvas means the
  // browser hands over the whole gesture instead of scrolling, and pointer capture
  // keeps the drag alive if the finger leaves the canvas mid-swipe - without it a
  // fast flick that overshoots stops registering halfway.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    // The touch state is one value, not two nullable locals, and every decision about
    // what a press means is made by the pure functions in `gestures.ts`. What is left
    // here is only plumbing: read the pointer, apply what comes back.
    //
    // That decision used to live in this handler, where nothing could test it - and
    // the bug it produced was in this wiring, not in the gesture decoding. A browser
    // fires `pointermove` the instant a finger lands, at a distance of a couple of
    // pixels, and the handler was asking `readGesture` what to do with it. The answer
    // was "rotate", because a short press *is* a tap. So every touch rotated on its
    // first event and again on release: swipes appeared to rotate, and taps rotated
    // twice.
    let touch: TouchState = NO_TOUCH;

    const onDown = (e: PointerEvent): void => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      touch = pressTouch({ x: e.offsetX, y: e.offsetY });
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      const result = moveTouch(
        touch,
        { x: e.offsetX, y: e.offsetY },
        {
          cellSize: sizeRef.current,
        },
      );
      // Applied, the anchor follows the finger; refused, it stays where it was. The
      // tracker offers both states because only applying it can say which happened.
      touch = applyGesture(sim, result.gesture) ? result.state : result.held;
    };
    const onUp = (e: PointerEvent): void => {
      applyGesture(sim, releaseTouch(touch).gesture);
      touch = NO_TOUCH;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [sim]);

  // Keyboard, so the game is playable on a desktop too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          sim.moveLeft();
          break;
        case "ArrowRight":
          sim.moveRight();
          break;
        case "ArrowUp":
        case "x":
        case "X":
          sim.rotate();
          break;
        case "ArrowDown":
        case " ":
          sim.toggleFast();
          break;
        case "r":
        case "R":
          if (onRestart !== undefined) onRestart();
          else setRunId((n) => n + 1);
          break;
        case "Escape":
          onExit();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim, onExit, onRestart]);

  const finished = hud.phase === "won" || hud.phase === "lost";
  const goals = goalSummary(level, {
    targetRemaining: hud.goals,
    greys: hud.greys,
  });

  return (
    <div className="play">
      <header className="play__hud">
        <button type="button" className="chip" onClick={onExit}>
          ‹ Levels
        </button>
        {/*
          `title` because the name truncates on a narrow phone, and a truncated name
          is not a name. The browser's own tooltip is the one tooltip on this screen
          that cannot be clipped by the HUD, is reachable by keyboard, and costs
          nothing.
        */}
        <div className="play__title" title={level.name}>
          <strong>{level.name}</strong>
          {level.author !== "" && <span>{level.author}</span>}
        </div>
        {/*
          The rules, one tap away. They were previously a bare `10` with a tooltip,
          which answers "how many are left" and none of "of what", "how many make a
          group", or - the one that made `Hormones` look unwinnable - "do diagonals
          count". A `<details>` element rather than a panel, because the answer is
          wanted once and then in the way; and `<details>` rather than a button with
          state, because it stays keyboard- and screen-reader-correct for free.
        */}
        <details className="play__rules">
          <summary className="chip">How to play</summary>
          <div className="play__rulesBody">
            {/*
              A swatch rather than the kind's name. Upstream calls the goal kind
              `inGras` or `inBunt`, which is artwork naming; a colour is something
              the player can look for on the board.
            */}
            {goals.targetArtKey !== null && (
              <p className="play__rulesSwatch">
                <span
                  className="play__swatch"
                  style={{
                    background: paletteColourFor(
                      // The same palette the board is drawn with, built from the
                      // level's kinds rather than hashed from the art key - so the
                      // swatch beside "these are the blobs to clear" is the colour of
                      // those blobs and cannot drift from it.
                      buildPalette(level.kinds, {
                        background: level.colours.background,
                      }),
                      goalKindIndex(level, goals.targetName),
                    ),
                  }}
                  aria-hidden="true"
                />
                <span title={goals.targetName ?? undefined}>
                  {goals.targetNeedsChain
                    ? "These are cleared by an explosion landing next to them."
                    : "These are the blobs to clear."}
                </span>
              </p>
            )}
            <ul>
              {goalSummaryLines(goals).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </details>
        <div className="play__stats">
          <span title="Score">{hud.score}</span>
          <span title="Goal blobs remaining">{hud.goals}</span>
          {hud.greys > 0 && <span title="Grey blobs">{hud.greys}</span>}
        </div>
      </header>

      <div className="play__board">
        <canvas ref={canvasRef} className="play__canvas" />
        {/*
          A hint, not a blocker. The board is 1:2, so in landscape on a wide
          screen it can only be about a quarter of the width - not a layout bug,
          just the shape of the thing. Portrait gives roughly four times the board
          area, which is worth saying rather than leaving the layout to imply that
          sideways is the intended way to play.

          Hidden by CSS in portrait, so it costs nothing there, and `aria-hidden`
          because it is advice about the device rather than about the game state.
        */}
        <p className="play__rotate" aria-hidden="true">
          <strong>Turn your device upright</strong>
          The board is twice as tall as it is wide, so portrait gives a much
          larger one.
        </p>
        {finished && (
          <div className="play__overlay">
            <h2>{hud.phase === "won" ? "Level complete" : "Game over"}</h2>
            <p>Score {hud.score}</p>
            <div className="play__overlayActions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  if (onRestart !== undefined) onRestart();
                  else setRunId((n) => n + 1);
                }}
              >
                Play again
              </button>
              <button type="button" className="btn" onClick={onExit}>
                Levels
              </button>
            </div>
          </div>
        )}
      </div>

      <nav className="play__controls">
        <button
          type="button"
          className="pad"
          aria-label="Move left"
          onPointerDown={() => hold(-1)}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
        >
          ◀
        </button>
        <button
          type="button"
          className="pad pad--wide"
          aria-label="Rotate"
          onPointerDown={() => sim.rotate()}
        >
          Rotate
        </button>
        <button
          type="button"
          className="pad"
          aria-label="Move right"
          onPointerDown={() => hold(1)}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
        >
          ▶
        </button>
        <button
          type="button"
          className="pad pad--wide"
          aria-label="Fast fall"
          onPointerDown={() => sim.toggleFast()}
        >
          Fast
        </button>
      </nav>

      <footer className="play__dev">
        <span>
          {hud.phase} · step {hud.steps} · {hud.frameMs.toFixed(0)} ms/frame
        </span>
        <span>
          {GRX}×{GRY} · seed {seed + runId}
        </span>
      </footer>
    </div>
  );
}
