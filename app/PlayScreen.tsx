import { useCallback, useEffect, useRef, useState } from "react";
import { GameLoop } from "./game-loop.ts";
import { Simulation } from "../engine/game-core/simulation.ts";
import type { Phase } from "../engine/game-core/simulation.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";
import { GRX, GRY } from "../engine/game-core/constants.ts";
import { render } from "../render/board.ts";
import { boardSizing } from "../render/geometry.ts";
import { applyGesture, readGesture } from "./gestures.ts";
import type { PointerSample } from "./gestures.ts";

/** Held-direction repeat timings, in ms. */
const DAS_DELAY = 170;
const DAS_RATE = 55;

/** How often the HUD is allowed to re-render. */
const HUD_INTERVAL_MS = 100;

interface Props {
  level: LevelDef;
  seed: number;
  onExit: () => void;
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

export function PlayScreen({ level, seed, onExit }: Props) {
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
    let start: PointerSample | null = null;

    const onDown = (e: PointerEvent): void => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start = { x: e.offsetX, y: e.offsetY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      if (start === null) return;
      // Applied per crossing, so a drag follows the finger and stops at a wall.
      // `cellSize` comes from the same sizing the board was drawn with, so a
      // finger-width always means one cell however large the board is drawn.
      const gesture = readGesture(start, { x: e.offsetX, y: e.offsetY }, {
        cellSize: sizeRef.current,
      });
      if (applyGesture(sim, gesture)) start = { x: e.offsetX, y: e.offsetY };
    };
    const onUp = (e: PointerEvent): void => {
      start = null;
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
          setRunId((n) => n + 1);
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
  }, [sim, onExit]);

  const finished = hud.phase === "won" || hud.phase === "lost";

  return (
    <div className="play">
      <header className="play__hud">
        <button type="button" className="chip" onClick={onExit}>
          ‹ Levels
        </button>
        <div className="play__title">
          <strong>{level.name}</strong>
          <span>{level.author}</span>
        </div>
        <div className="play__stats">
          <span title="Score">{hud.score}</span>
          <span title="Goal blobs remaining">{hud.goals}</span>
          {hud.greys > 0 && <span title="Grey blobs">{hud.greys}</span>}
        </div>
      </header>

      <div className="play__board">
        <canvas ref={canvasRef} className="play__canvas" />
        {finished && (
          <div className="play__overlay">
            <h2>{hud.phase === "won" ? "Level complete" : "Game over"}</h2>
            <p>Score {hud.score}</p>
            <div className="play__overlayActions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setRunId((n) => n + 1)}
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
