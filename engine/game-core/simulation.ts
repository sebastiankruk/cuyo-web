/**
 * The headless simulation.
 *
 * One `step()` is one 80 ms game step, following the order in
 * `src/cuyo.cpp:Cuyo::spielSchritt`:
 *
 *   border -> random greys -> fall -> test explosions -> settle/spawn
 *
 * with the mode machine from `src/spielfeld.cpp:Spielfeld::spielSchritt`
 * deciding whether a step settles the board or introduces the next piece.
 */

import {
  BONUS_SPEED,
  CALCULATE_SIZE,
  EXPLODES_ON_CHAIN_REACTION,
  EXPLODES_ON_EXPLOSION,
  EXPLODES_ON_SIZE,
  EXPLOSION_STEPS,
  FALLING_FAST_SPEED,
  FALLING_SPEED,
  GOAL_BLOB,
  GRIC,
  GRX,
  GRY,
  GREYS_PER_CHAIN_REACTION,
  GREY_SPAWN_OFFSET_PX,
  NEW_FALL_MARGIN,
  POINTS_PER_CHAIN_REACTION,
  POINTS_PER_GRASS,
  POINTS_PER_NORMAL,
  POINTS_PER_TIME_BONUS,
  neighbourOffsets,
} from "./constants.ts";
import type { NeighbourMode } from "./constants.ts";
import { Blob, Board, EMPTY, componentOf, floats } from "./board.ts";
import { BLOBART_AUSSERHALB, BlobStore, TimeSlices } from "../cual-runtime/store.ts";
import {
  BLOPART_GLOBAL,
  BLOPART_SEMIGLOBAL,
  runStep,
} from "../cual-runtime/global.ts";
import type { Animatable, Field } from "../cual-runtime/global.ts";
import { BlobAnimation, levelPictureSource } from "./cual-blob.ts";
import type { BlobAnimationDeps } from "./cual-blob.ts";
import { accessFieldFor } from "./cual-field.ts";
import { PictureStack } from "../cual-runtime/draw.ts";
import type { PictureSource } from "../cual-runtime/draw.ts";
import type { Here, ResolvedOrt } from "../cual-runtime/access.ts";
import type { ConstantSubject } from "../cual-runtime/constants.ts";
import { hexGeometry } from "./constants.ts";
import {
  RICHTUNG_EINZEL,
  RICHTUNG_SENK,
  RICHTUNG_UNPLATZIERT,
  RICHTUNG_WAAG,
  cellX,
  cellY,
  pixelX,
  pixelY,
} from "./fall-geometry.ts";
import type { FallCoordinates } from "../cual-runtime/constants.ts";
import type { FallPos } from "./fall-geometry.ts";
import type { Stmt } from "../cual-runtime/code.ts";
import type { EffectContext, PlayedSample } from "../cual-runtime/effects.ts";
import type { Position } from "./board.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import { Prng } from "../prng.ts";
import type { RandomSource } from "../prng.ts";

/** Orientation of the falling piece. */
export type Orientation = "horizontal" | "vertical" | "single";

/**
 * The single blob left over after a horizontal piece splits.
 *
 * `src/fall.cpp:Fall::halbiere` advances the column and switches the piece to
 * `richtung_einzel`. A single piece always falls at the fast rate, so the fast
 * flag is inherited from the piece rather than forced on.
 */
function survivingHalf(attempted: FallPiece, x: number, blob: Blob): FallPiece {
  return {
    ...attempted,
    x,
    orientation: "single",
    blobs: [blob, blob],
  };
}

export interface FallPiece {
  /** Column of the left blob, or of the lone blob when `single`. */
  x: number;
  /** Vertical position of the piece's reference edge, in pixels. */
  yPx: number;
  orientation: Orientation;
  /** The two blobs; index 1 is dropped when the piece becomes `single`. */
  blobs: [Blob, Blob];
  /** True while the player is holding fast fall. */
  fast: boolean;
  /** Set while the piece is sliding in horizontally after a move. */
  slideRemaining: number;
  /**
   * `Fall::mExtraX`: how many cells the piece is drawn left of or right of {@link x}.
   *
   * Set by {@link Simulation.shift} and cleared when the slide finishes, because upstream's
   * `rutschen` moves the *picture* by one cell and then leaves `mPos.x` at the destination — so
   * `loc_xx` for a sliding blob has to read the offset, and `getXX` adds it raw.
   */
  extraX: number;
  /**
   * `Fall::mExtraDreh`: the quarter turn a piece is part-way through, 0 when it is square.
   *
   * **Always 0 here, and that is upstream's value on every path this port has.** `mExtraDreh` is
   * set by `dreheX`, the *fast* rotation — a rotate that does not fit, which leaves the piece drawn
   * between orientations so it does not jump. {@link Simulation.rotate} checks whether the
   * destination is free and returns if not, so it never takes that path.
   *
   * It is a field rather than nothing because `getDrehIndex` reads it, and a hard-coded 0 there
   * would be indistinguishable from "fast rotation is modelled and currently never half-way".
   */
  extraDreh: number;
}

export type Phase =
  | "falling"
  /** No piece in play; the next thing to do is look for explosions. */
  | "testing"
  | "exploding"
  | "settling"
  | "spawningGreys"
  | "timeBonus"
  | "won"
  | "lost";

export interface SimulationOptions {
  readonly seed?: number;
  readonly random?: RandomSource;
}

/**
 * `Cuyo::getSpielerZahl()`, and it is 1.
 *
 * Two-player is a documented non-goal (design.md, *Non-Goals*): `[2]` definitions still
 * parse, but no second board is driven and there is no AI opponent. `rechts_ok` is
 * `(!rechts) || (getSpielerZahl() > 1)`, so with one player every right-hand address
 * resolves to nothing — which is why `@(x,y;>)` does not fail on a one-player level, it
 * simply has no right-hand field to reach.
 *
 * A constant rather than a constructor option, because an option would let a caller set 2
 * and then find out at the first `at(true, …)`: this `Simulation` has exactly one `Board`
 * and no second field to point at. Making the claim structural is the point.
 */
export const PLAYER_COUNT = 1;

export class Simulation {
  readonly level: LevelDef;
  readonly board = new Board();
  readonly random: RandomSource;

  /**
   * `Blop::gZZ`, shared by every blob on the board.
   *
   * One instance per simulation, because it is the deferred-write queue and the slice counter
   * for the whole step: a blob's `@`-read has to see the beginning-of-step values whether the
   * read happens in the global blob or in the last cell of the board.
   *
   * Public because the sharing is a claim worth being able to check: `BlobStore` keeps its
   * slices private, so the only way to see that two blobs share one counter is to reach this
   * and watch its queue fill from a blob that does not own it.
   */
  readonly slices = new TimeSlices();

  /**
   * `Spielfeld::getFallAnz()`, which `absort_fall`'s validity check asks.
   *
   * `Fall::getAnz()` is `mPos.getAnz()`, and `FallPos::getAnz` is a three-way switch:
   * `richtung_keins` gives 0, `richtung_einzel` gives 1, and waag/senk/unplatziert give 2.
   * That maps exactly onto this simulation's fall being absent, `single`, or a pair — which
   * is why the translation has three cases rather than one plus a special case.
   *
   * A function rather than a field because it changes within a step: a horizontal piece that
   * splits becomes `single`, and `@(1)` has to stop being reachable in the same step that
   * blob 1 stopped existing.
   */
  fallCount(): number {
    const piece = this.fall;
    if (piece === null) return 0;
    return piece.orientation === "single" ? 1 : 2;
  }

  score = 0;
  /** Steps elapsed since the level started. */
  time = 0;
  /** Chase border position in pixels from the top. */
  borderPx = 0;
  /** Grey blobs that have been scheduled but have not appeared yet. */
  pendingGreys = 0;
  /** Grey blobs still on the board, for the HUD. */
  greyCount = 0;
  /** Goal blobs still on the board, for the HUD and the win check. */
  goalCount = 0;

  /** The piece in play, or null between pieces. */
  fall: FallPiece | null = null;
  /** The piece that will enter play next. */
  next: FallPiece | null = null;

  phase: Phase = "falling";
  /** True when the current resolution pass is a chain reaction. */
  chainReaction = false;
  /**
   * Set by the last gravity pass when a blob came to rest above the spawn
   * margin, which withholds a new piece. Mirrors `rutschnach_viel`.
   */
  private settledAboveMargin = false;

  /**
   * `Blop::gGlobalBlop`'s variables — the one blob every player shares.
   *
   * Created in {@link reset} rather than in the constructor, because upstream creates it in
   * `LevelDaten::startLevel` and says why: `Blop::gGlobalBlop = Blop(blopart_global)` followed
   * by `gGlobalBlob.setBesitzer(0, ort_absolut(absort_global))`, the second line commented
   * "Damit Code ausgefuehrt werden darf" — *so that code is allowed to run*. A blob without
   * an owner is inert, so the owner is what makes it a participant, and a level started twice
   * gets a fresh one. Only the store is here; 15.5 is what turns it into something that runs
   * code.
   *
   * Public because `accessField` hands it out and a test has to be able to say "the `@()`
   * address is *this* store" rather than "some store with the right numbers in it" — identity
   * is the claim, and a private field would make it unassertable.
   */
  global!: BlobStore;

  /**
   * `Spielfeld::mSemiglobal` for each side, indexed by it.
   *
   * One per field and never shared between players, which with {@link PLAYER_COUNT} of 1
   * leaves exactly one entry and the right-hand slot null. Its kind is
   * `blopart_semiglobal` (-3), so a level reading `kind` in its semiglobal code sees
   * upstream's value rather than a fresh blob's `blopart_ausserhalb` (-5).
   *
   * A table rather than one store because the side is not decoration: `@@(x,y;>)` and
   * `@@(x,y;<)` address a semiglobal by side, and a lookup that could not answer for a side
   * would make those two spellings mean the same thing. It answers about *which fields
   * exist*; whether an address may name one is `rechts_ok`, which `cual-field.ts` applies and
   * which is deliberately not decided in two places.
   */
  private semiglobals: readonly (BlobStore | null)[] = [];

  /** `Spielfeld::mSemiglobal` for a side, or null when this simulation has no such field. */
  semiglobal(right: boolean): BlobStore | null {
    return this.semiglobals[right ? 1 : 0] ?? null;
  }

  /** `Cuyo::getSpielerZahl()`; see {@link PLAYER_COUNT}. */
  readonly players = PLAYER_COUNT;

  /**
   * One `BildStapel` per cell, for a draw aimed at somebody else's cell.
   *
   * Created lazily and **never replaced**, which is upstream's arrangement: `Blop::mBild` is a
   * member of the `Blop`, so a blob that is drawn onto repeatedly keeps the same stack object and
   * `lazyLeereStapel` clears it in place. An array of fresh stacks each step would be a
   * different object every step, and anything holding a reference — the renderer, a test — would
   * be reading a stack nobody writes to any more.
   *
   * Sparse, because most cells are empty most of the time and `new PictureStack()` is not free.
   */
  private readonly cellStacks: (PictureStack | null)[] = new Array<null>(
    GRX * GRY,
  ).fill(null);

  /**
   * `levelPictureSource(level, program)`, built once.
   *
   * A field rather than a call per draw because it cannot change while a level is playing, and
   * `PictureStack.add` asks it for every picture.
   */
  private readonly pictureSource: PictureSource;

  /**
   * `mMessage`, the text `message(m)` sets, and which the renderer draws.
   *
   * Empty rather than null when nothing has been said, because upstream's `Spielfeld::mMessage`
   * is a `Str` that starts empty and `setMessage("")` is a legal thing for a level to do.
   */
  message = "";

  /**
   * `Sound::playSample` calls this step's code made, in order.
   *
   * A queue rather than a callback because nothing consumes sound yet — audio is group 11 — and
   * a queue is assertable: a level's `sound(...)` reaching the queue is checkable, a level's
   * sound reaching an audio device is not. Drained by nothing, so it is cleared per step.
   */
  playedSamples: PlayedSample[] = [];

  constructor(level: LevelDef, options: SimulationOptions = {}) {
    this.level = level;
    this.random = options.random ?? new Prng([options.seed ?? 0x9e3779b9]);
    this.pictureSource = levelPictureSource(level, level.program);
    this.reset();
  }

  /**
   * A blob with a variable array sized for this level's whole program.
   *
   * `DefKnoten::getDatenLaenge` is a per-configuration length, not a per-kind one: a blob can
   * reach any procedure in the level by calling it, so the array has to hold every node the
   * program declares — busy flags and user variables alike. Sizing it per kind would overflow
   * the moment a kind called something declared elsewhere.
   *
   * The array is allocated rather than shared because each blob's is its own `mDaten`; the
   * *slice counter* is shared, which is the part that must not be.
   */
  private makeBlob(): Blob {
    return new Blob(new BlobStore(this.level.program.allocation.slotCount, GRY, this.slices));
  }

  /**
   * `LevelDaten::startLevel`'s global blob and `Spielfeld`'s semiglobal, as variable arrays.
   *
   * Both allocated against **this simulation's** `TimeSlices`, which is the part that is not
   * obvious. `@` reads a target's beginning-of-step value, and the global and semiglobal read
   * board blobs through it — so a global blob on a counter of its own would read the board as
   * it was when the global blob happened to open its window, which is the failure
   * `blob-store.test.ts` describes for a second counter and which this placement prevents.
   *
   * Their own kinds are set to `blopart_global` (-2) and `blopart_semiglobal` (-3), so a level
   * reading `kind` in its global code sees upstream's value rather than a blob's default of
   * `blopart_ausserhalb` (-5). `globalCode` is looked up separately by name and never gets a
   * picture default (`sorte.cpp:98-131`), which is why these two exist as their own kinds.
   */
  private makeSingletons(): void {
    this.global = new BlobStore(this.level.program.allocation.slotCount, GRY, this.slices);
    this.global.setSystem("kind", BLOPART_GLOBAL);
    // One semiglobal per side that has a field, and only the left side has one. Written as a
    // fill rather than a two-element literal so that a two-player port cannot leave the
    // second slot null by accident.
    this.semiglobals = Array.from({ length: Math.max(1, this.players) }, () => {
      const store = new BlobStore(this.level.program.allocation.slotCount, GRY, this.slices);
      store.setSystem("kind", BLOPART_SEMIGLOBAL);
      return store;
    });
  }

  /**
   * Rebuilds the board from the level's start layout and clears counters.
   *
   * The random source is rewound too, not just the board: a restart has to
   * replay the same sequence, otherwise the same seed would give a different
   * second game depending on how long the first one lasted.
   */
  reset(): void {
    this.board.clear();
    this.random.restart();
    this.score = 0;
    this.time = 0;
    this.borderPx = 0;
    this.pendingGreys = 0;
    this.greyCount = 0;
    this.goalCount = 0;
    this.chainReaction = false;
    this.settledAboveMargin = false;
    this.phase = "falling";
    // `LevelDaten::startLevel`, which is where upstream creates the global blob. A restart is a
    // new level, so the global blob's variables start over — a `var` in `global` must not
    // carry its value from the game that was just abandoned.
    this.makeSingletons();

    const dist = this.level.startDist;
    const firstRow = GRY - dist.length;
    for (let i = 0; i < dist.length; i++) {
      const y = firstRow + i;
      for (let x = 0; x < GRX; x++) {
        const cell = dist[i]?.[x];
        if (cell === undefined || cell === null) continue;
        const kind = this.level.kinds[cell.kind];
        if (kind === undefined) continue;
        const blob = this.makeBlob();
        blob.initFromKind(kind);
        blob.version = cell.version;
        blob.store.setSystem("version", cell.version);
        this.board.set(x, y, blob);
      }
    }
    this.recount();
    this.next = this.makePiece();
    this.spawnPiece();
  }

  /** Recomputes the HUD counters from the board. */
  recount(): void {
    let grey = 0;
    let goal = 0;
    for (const { x, y } of this.board.occupied()) {
      const kind = this.kindAt(x, y);
      if (kind === null) continue;
      if (kind.role === "grey") grey++;
      else if (kind.role === "grass") goal++;
    }
    this.greyCount = grey;
    this.goalCount = goal;
  }

  kindAt(x: number, y: number) {
    const blob = this.board.at(x, y);
    if (blob === null || blob.kind === EMPTY) return null;
    return this.level.kinds[blob.kind] ?? null;
  }

  /**
   * Neighbour mode for the kind occupying a cell.
   *
   * Per-kind overrides are not implemented yet, so this is the level-wide
   * mode; the signature already takes a cell so adding overrides will not
   * change callers.
   */
  modeAt(): NeighbourMode {
    return this.level.neighbours;
  }

  // ---------------------------------------------------------------- falling

  /** Builds a piece from the level's falling-blob distribution. */
  private makePiece(): FallPiece {
    const weights = this.level.kinds.map((k) => k.colourProb);
    const mk = (): Blob => {
      const blob = this.makeBlob();
      const kind = this.level.kinds[this.random.weighted(weights)];
      if (kind !== undefined) {
        blob.initFromKind(kind);
        blob.version = this.random.int(Math.max(1, kind.versions));
        blob.store.setSystem("version", blob.version);
      }
      return blob;
    };
    const startX = this.level.randomFallPos
      ? this.random.int(GRX - 1)
      : GRX / 2 - 1;
    return {
      x: startX,
      yPx: this.borderPx - GRIC,
      orientation: "horizontal",
      blobs: [mk(), mk()],
      fast: false,
      slideRemaining: 0,
      extraX: 0,
      extraDreh: 0,
    };
  }

  /** Brings the preview piece into play. */
  private spawnPiece(): void {
    const piece = this.next;
    if (piece === null) return;
    // Upstream sets the entry position *before* testing it (`Fall::insSpiel`).
    // Testing the position the piece happened to be created at instead would
    // test a row the piece is not going to occupy, and let it be introduced into
    // cells that are already taken.
    piece.yPx = this.borderPx - GRIC;
    if (!this.canSpawn(piece)) {
      this.phase = "lost";
      this.fall = null;
      return;
    }
    this.fall = piece;
    this.next = this.makePiece();
    this.phase = "falling";
  }

  /**
   * `src/blopgitter.cpp:BlopGitter::testPlatzSpalte`.
   *
   * True when a blob may occupy column `x` at row `y`. The cell itself must be
   * free, and the first blob above it must float *and* be separated by at least
   * one empty cell - so a blob sitting directly overhead blocks, which is what
   * stops a piece from being steered in under a stack.
   */
  private canOccupy(x: number, y: number): boolean {
    if (x < 0 || x >= GRX) return false;
    if (y >= GRY) return false;
    let separated = false;
    for (let row = y; row >= 0; row--) {
      const blob = this.board.at(x, row);
      if (blob !== null) return separated && floats(blob);
      separated = true;
    }
    return true;
  }

  /**
   * Which halves of `piece` cannot descend, as a pair of flags.
   *
   * `src/fall.cpp:Fall::testBelegt` returns a bitmask of the blocked halves, and
   * the split on landing is decided from that - not from whether each half has
   * something underneath it. The two differ whenever a half is stopped by a
   * blob in its own cell with clear space below, and using the wrong one leaves
   * the piece wedged with neither half able to land.
   */
  private blockedHalves(piece: FallPiece): { zero: boolean; one: boolean } {
    const positions = this.piecePositions(piece);
    const blocked = (i: number): boolean => {
      const p = positions[i];
      return p === undefined ? false : !this.canOccupy(p.x, p.y);
    };
    const zero = blocked(0);
    const one = blocked(1);
    // A vertical piece has one blob resting on the other, so if either is
    // blocked the whole piece stops.
    if (piece.orientation === "vertical" && (zero || one)) {
      return { zero: true, one: true };
    }
    return { zero, one };
  }

  private fits(piece: FallPiece): boolean {
    const blocked = this.blockedHalves(piece);
    return !blocked.zero && !blocked.one;
  }

  /**
   * True when `piece` may be introduced.
   *
   * `src/fall.cpp:Fall::insSpiel` is only a fit test: the piece goes in at
   * `hetzrand - gric` unless `testBelegt` refuses. Whether a piece is *ready* to
   * be introduced is a separate question, answered during the gravity pass - see
   * {@link settledAboveMargin}.
   */
  private canSpawn(piece: FallPiece): boolean {
    return this.fits(piece);
  }

  /**
   * Row above which a settling blob still counts as "not low enough".
   *
   * `hya + neues_fall_platz` from `Spielfeld::rutschNach`, where `hya` is the
   * row greys appear in.
   */
  private spawnMarginRow(): number {
    return (
      Math.floor((this.borderPx + GREY_SPAWN_OFFSET_PX) / GRIC) +
      NEW_FALL_MARGIN
    );
  }

  /**
   * The cells a piece currently occupies, each with the blob that fills it.
   *
   * The blob is part of the answer rather than something the caller works out.
   * Which blob sits where is not derivable from a column alone: for a vertical
   * piece both cells share one column and differ only in their row, so a renderer
   * guessing from the column drew the same colour in both - a blue-and-red piece
   * standing up came out red-and-red, and the colours swapped back on the next
   * rotation. Carrying the blob with the position makes that mistake impossible
   * rather than merely avoidable.
   */
  piecePositions(
    piece: FallPiece,
  ): Array<{ x: number; y: number; blob: Blob }> {
    const base = Math.floor((piece.yPx + GRIC - 1) / GRIC);
    const out: Array<{ x: number; y: number; blob: Blob }> = [];
    if (piece.orientation === "horizontal") {
      out.push(
        { x: piece.x, y: base, blob: piece.blobs[0] },
        { x: piece.x + 1, y: base, blob: piece.blobs[1] },
      );
    } else if (piece.orientation === "vertical") {
      out.push(
        { x: piece.x, y: base - 1, blob: piece.blobs[0] },
        { x: piece.x, y: base, blob: piece.blobs[1] },
      );
    } else {
      out.push({ x: piece.x, y: base, blob: piece.blobs[0] });
    }
    return out;
  }

  /** The row the chase border has reached. */
  borderRow(): number {
    return Math.floor(this.borderPx / GRIC);
  }

  /** Moves the piece left one cell if the destination is free. */
  moveLeft(): void {
    this.shift(-1);
  }

  /** Moves the piece right one cell if the destination is free. */
  moveRight(): void {
    this.shift(1);
  }

  private shift(dx: number): void {
    const piece = this.fall;
    if (piece === null || piece.orientation === "single") return;
    const moved: FallPiece = { ...piece, x: piece.x + dx, extraX: dx };
    if (!this.fits(moved)) return;
    moved.slideRemaining = 16;
    this.fall = moved;
  }

  /** Rotates between horizontal and vertical when the destination is free. */
  rotate(): void {
    const piece = this.fall;
    if (piece === null || piece.orientation === "single") return;
    const turned: FallPiece = {
      ...piece,
      orientation:
        piece.orientation === "horizontal" ? "vertical" : "horizontal",
    };
    // Upstream swaps blob order so the rotation reads as clockwise. A mirrored
    // level is already drawn flipped, so the swap is inverted for it:
    // `mSpiegeln ? senkrecht : waagerecht`.
    const shouldSwap = this.level.mirror
      ? turned.orientation === "vertical"
      : turned.orientation === "horizontal";
    turned.blobs = shouldSwap
      ? [piece.blobs[1], piece.blobs[0]]
      : [piece.blobs[0], piece.blobs[1]];
    if (!this.fits(turned)) return;
    turned.slideRemaining = 16;
    this.fall = turned;
  }

  /** Toggles fast falling. */
  toggleFast(): void {
    if (this.fall === null) return;
    this.fall = { ...this.fall, fast: !this.fall.fast };
  }

  // ------------------------------------------------------------------- step

  /** Advances the simulation by one 80 ms step. */
  step(): void {
    if (this.phase === "won" || this.phase === "lost") return;

    if (this.phase === "timeBonus") {
      this.stepTimeBonus();
      return;
    }

    // Nothing consumes sound yet (group 11), so the queue is cleared here rather than drained:
    // what a caller can check is "this step's code asked for these samples", and a queue that
    // accumulated would make that a different and much weaker claim.
    this.playedSamples = [];

    this.advanceBorder();
    this.maybeRandomGrey();
    this.stepFall();
    this.resolvePhase();

    // `animiere()` last, which is `cuyo.cpp:473`'s placement: the rules run to completion first
    // and the blobs' code runs after them, so a blob reads the step's *result*.
    //
    // It runs on the step that ends the game, because it sits after `resolvePhase()` rather than
    // behind the early returns above — and upstream's `animiere()` is likewise before the win
    // check at `cuyo.cpp:475`. Steps taken *after* the game has ended return early and skip it,
    // which is the port's own arrangement and not something upstream has an equivalent for.
    this.animate();
  }

  /**
   * `animiere()` — one step's worth of running every blob's Cual code.
   *
   * Task 15.6, and it is called at the **end** of {@link step}, which is the whole of
   * `cuyo.cpp:473`'s placement: `spielSchritt()` (the border, the fall, the explosions) runs to
   * completion first and the blobs' code runs last, so a blob's code sees the step's *result*
   * rather than competing with it. That ordering is also why 15.4's `fallCount` snapshot is
   * benign — the fall is finished before any code runs.
   *
   * `runStep` already holds the order (`global.ts`), so this is a matter of *supplying* it:
   *
   * - `Blop::lazyLeereStapel()` clears **every** stack, before anything animates. One call over
   *   {@link cellStacks}, and each blob's own stack is cleared by its own `animate()`.
   * - `Blop::beginGleichzeitig()` / `endGleichzeitig()` is this simulation's {@link slices},
   *   shared with the global and semiglobal stores for the reason `makeSingletons` gives.
   * - `ld->spielSchritt()` is `Blop::gGlobalBlop.animiere()`, which `runStep` calls first.
   *
   * ## Two of upstream's five lists have nothing to put in them here
   *
   * `mNaechsterFall` is populated — {@link next} is a piece — but `mInfoBlops` is empty, because
   * nothing in this port has created an info blob and upstream's `if (mInfoBlopActive[i])` skips
   * an inactive one anyway. Both are declared empty rather than omitted, so the shape of
   * upstream's step stays visible in the code that runs it.
   */
  private animate(): void {
    runStep(
      this.makeAnimation("global", this.global, () => ({ kind: "global" })),
      [this.field()],
      {
        clearPictureStacks: () => this.clearCellStacks(),
        openWindow: () => this.slices.open(),
        closeWindow: () => this.slices.close(),
      },
    );
  }

  /**
   * `Spielfeld::mDaten.animiere()` and the rest, as `runStep` wants them.
   *
   * `BlopGitter::animiere()` is `for x { for y { … } }` — **column-major**, which is a real
   * order rather than a detail: a level whose left neighbour writes a variable its right
   * neighbour reads depends on which column goes first, and upstream's is x-major.
   *
   * `board.at` is indexed `y * GRX + x`, so the loop is over x outside and y inside and the
   * index arithmetic is the other way round. Asserted rather than assumed in
   * `simulation-animation.test.ts`.
   */
  private field(): Field {
    const board: Animatable[] = [];
    for (let x = 0; x < GRX; x += 1) {
      for (let y = 0; y < GRY; y += 1) {
        const blob = this.board.at(x, y);
        if (blob === null) continue;
        board.push(this.makeAnimation(`(${x},${y})`, blob.store, () => ({
          kind: "cell",
          x,
          y,
          right: false,
        })));
      }
    }
    // `mFall->animiere()` — the two blobs of the piece in play, at its pixel position. Upstream
    // reads `Fall::getPos().getX()` for the *Ort* and the piece's own y for the row, so `here`
    // is a `fall` and not a cell: a falling blob has no cell, and `korrekt` rejects an address
    // that claims otherwise.
    const falling: Animatable[] = [];
    const piece = this.fall;
    if (piece !== null) {
      piece.blobs.forEach((blob, index) => {
        falling.push(
          this.makeAnimation(`fall${index}`, blob.store, () => ({
            kind: "fall",
            x: piece.x + index,
            y: piece.yPx,
            right: false,
          })),
        );
      });
    }
    // `mNaechsterFall->animiere()` — the pieces not in play yet. One slot in this port.
    const nextFalling: Animatable[] = [];
    if (this.next !== null) {
      this.next.blobs.forEach((blob, index) => {
        nextFalling.push(
          this.makeAnimation(`next${index}`, blob.store, () => ({
            kind: "fall",
            x: this.next?.x ?? index,
            y: this.next?.yPx ?? 0,
            right: false,
          })),
        );
      });
    }
    // `mSemiglobal.animiere()` — last in its own field, and one per field, never shared.
    const semiglobalStore = this.semiglobal(false);
    const semiglobal: Animatable =
      semiglobalStore === null
        ? { name: "semiglobal", animate: () => undefined }
        : this.makeAnimation("semiglobal", semiglobalStore, () => ({
            kind: "semiglobal",
            right: false,
          }));
    return {
      right: false,
      board,
      falling,
      nextFalling,
      infoBlops: [],
      semiglobal,
    };
  }

  /**
   * One `BlobAnimation` over a store, with this simulation as its surroundings.
   *
   * Built fresh per blob per step rather than cached, which is the cheap way round: a
   * `BlobAnimation` is a name, a store, a code array and a dozen closures, while running a
   * kind's code walks its ~1000-node tree. Caching would save an object per cell to keep a
   * `here` up to date by hand, and a stale `here` is the failure 15.4 exists to prevent.
   *
   * `here` is a function rather than a value for the same reason 15.5 made it one on the deps:
   * a falling blob's position moves within the step that animates it.
   */
  private makeAnimation(
    name: string,
    store: BlobStore,
    here: () => Here,
  ): Animatable {
    const deps: BlobAnimationDeps = {
      level: this.level,
      program: this.level.program,
      pictureSource: this.pictureSource,
      here,
      field: () => accessFieldFor(this, here()),
      random: (limit) => this.random.int(limit),
      constantSubject: () => this.constantSubjectFor(store, here()),
      effects: (asked) => this.effectsFor(store, asked),
      slices: this.slices,
      stackAt: (_field, x, y) => this.stackAt(x, y),
    };
    const blob = new BlobAnimation(deps, name, store, this.drawCodeOf(store));
    return blob;
  }

  /**
   * The kind's draw code for whatever blob a store belongs to.
   *
   * Read from the store's own `kind`, so a blob whose code has just changed its kind gets the
   * *new* kind's code on the next step and not the old one's — which is what upstream's
   * `getSorte()->getEventCode(event_draw)` does, since it asks the blob's current sort.
   *
   * `blopart_global` and `blopart_semiglobal` are negative and so index nothing, which is why
   * `null` rather than a throw: they are not kinds and they have no draw event. `globalCode`
   * and `semiglobalCode` are looked up separately, by name, and are not kinds either — see
   * `sorte.cpp:98-131`, which is the same fact seen from the loader.
   */
  private drawCodeOf(store: BlobStore): readonly Stmt[] | null {
    const kind = store.getSpecial("kind");
    if (kind < 0) return null;
    return this.level.program.drawCode[kind] ?? null;
  }

  /**
   * The picture stack of a cell, created on first use.
   *
   * `BildStapel::speichereBild` puts a foreign draw on the *target's* stack, so this cannot be
   * the asking blob's own — which is why the asking blob keeps a `PictureStack` of its own and
   * this one is per cell.
   */
  private stackAt(x: number, y: number): PictureStack | null {
    if (x < 0 || x >= GRX || y < 0 || y >= GRY) return null;
    const index = y * GRX + x;
    let stack = this.cellStacks[index];
    if (stack === null) {
      stack = new PictureStack();
      this.cellStacks[index] = stack;
    }
    return stack;
  }

  /**
   * `Blop::lazyLeereStapel()`: clear every stack, before any blob animates.
   *
   * In place rather than by replacement, because upstream's stacks are members of their blobs
   * and keep their identity across steps.
   */
  private clearCellStacks(): void {
    for (const stack of this.cellStacks) stack?.clear();
  }

  /**
   * The fifteen read-only constants, from the world rather than from any store.
   *
   * Each field is a translation of something upstream reads off the blob or the field, and the
   * two that are *not* modelled yet are 0 rather than invented:
   *
   * - **`verticalScroll`** is `mHochVerschiebung`, which upstream raises as the field fills.
   *   Nothing here scrolls, so `loc_xx` and `loc_yy` are the cell's own pixel position — which
   *   is the *difference* a level like `aliens.ld` compares, and so is unaffected.
   * - **`extraTurn`** is `mExtraDreh`, the quarter turn `dreheX` leaves behind when a fast piece
   *   rotates and does not fit. {@link FallPiece} has no such field, so `turn` reports 0 and the
   *   three constants that depend on it (`turn` itself and nothing else) are the ones that would
   *   be wrong. Recorded rather than guessed: upstream's own comment beside it calls the fourth
   *   quarter a latent bug, and inventing a value would hide the gap rather than show it.
   */
  private constantSubjectFor(store: BlobStore, here: Here): ConstantSubject {
    const hex = hexGeometry(this.level.neighbours, this.level.hexFlip);
    const blob = here.kind === "cell" ? this.board.at(here.x, here.y) : null;
    /** The piece a falling blob belongs to, or null for anything that is not falling. */
    const fallish: { readonly piece: FallPiece; readonly unplaced: boolean } | null =
      here.kind !== "fall"
        ? null
        : this.fall !== null
          ? { piece: this.fall, unplaced: false }
          : this.next !== null
            ? { piece: this.next, unplaced: true }
            : null;
    return {
      position: here.kind === "cell" || here.kind === "fall" ? here : { kind: "nowhere" },
      world: {
        width: GRX,
        height: GRY,
        players: this.players,
        time: this.time,
        mirrored: this.level.mirror,
        rowHeight: GRIC,
        verticalScroll: 0,
        hexShift: (x) => hex.enabled && (x & 1) === (hex.flip & 1),
      },
      chainSize: blob?.chainSize ?? 0,
      // `getSorte(vergangenheit)->getBasekind()` — from the *shadow*, like `verbindetMit` in
      // 3.10, so a blob that changed kind this step still reports the old base kind. A negative
      // shadow kind is one of the three singletons, which have no base kind of their own.
      baseKind: this.level.kinds[store.getSpecial("kind")]?.baseKind ?? BLOBART_AUSSERHALB,
      // A blob of the *next* piece is a `blopart_fall` too, so `Fall::getSpezConst` answers it
      // exactly as it answers the piece in play — `falling` is 1 for both. Reading `this.fall`
      // for a next-piece blob would answer 0, and then `loc_*`'s refusal below would fire on a
      // blob whose position is a fall, which is the confusing half of the bug and not the whole.
      // The piece this blob belongs to, and whether it is the one in play. **A next piece is a
      // `richtung_unplatziert`, not an orientation** — a fourth state, not a fifth orientation —
      // and `getYY`'s unplaced branch returns from the border without reading the rotation table
      // at all, so getting this wrong moves the preview by a whole row.
      fall: fallish === null ? null : { extraTurn: fallish.piece.extraDreh, fast: fallish.piece.fast },
      // Which of the piece's two blobs is asking. `here.x` is the *absolute* column — which is
      // what `@(x,y)` against a falling blob means — and `getX(a)` is `x + a`, so the two differ
      // and the index has to be carried separately.
      fallIndex: fallish === null ? 0 : here.kind === "fall" && here.x > fallish.piece.x ? 1 : 0,
      // The four coordinates, from `fall-geometry.ts`. Present only for a falling blob, because
      // `readConstant` asks for them only there and a cell's are the board's own.
      fallCoordinates:
        fallish === null || here.kind !== "fall"
          ? undefined
          : this.fallCoordinates(fallish.piece, here.x, fallish.unplaced),
      // `getVariableVergangenheit(spezvar_am_platzen)`, slot 13.
      exploding: store.getAlt(13),
    };
  }

  /**
   * `Fall::getXX/getYY/getX/getY` for one blob of a piece, as `constants.ts` wants them.
   *
   * The `r` a `FallPos` carries is the piece's *orientation*, and `richtung_unplatziert` is a
   * fourth state rather than a fifth orientation — "the piece that will enter play next" — which
   * is why {@link FallPiece.orientation} has three values and `FallPos.r` has five.
   */
  private fallCoordinates(
    piece: FallPiece,
    absoluteX: number,
    unplaced: boolean,
  ): FallCoordinates {
    const r = fallOrientationOf(piece, unplaced);
    // `FallPos.x` is the piece's column, so the asking blob's `a` comes from how far right of it
    // the blob is — which is 1 for a horizontal piece and for an unplaced one, and 0 otherwise.
    // `a` is 0 or 1 by construction: `absort_fall(rechts, a)` names one of the piece's two
    // blobs and nothing else produces a third. Clamped so a caller cannot index off the end.
    const a = absoluteX >= piece.x ? 1 : 0;
    const pos: FallPos = { x: piece.x, yy: piece.yPx, r };
    const offsets = { extraX: piece.extraX, extraDreh: piece.extraDreh };
    const hex = hexGeometry(this.level.neighbours, this.level.hexFlip);
    const world = {
      borderPx: this.borderPx,
      hexShift: (x: number) => hex.enabled && (x & 1) === (hex.flip & 1),
    };
    return {
      cellX: cellX(pos, a),
      cellY: cellY(pos, a, world),
      pixelX: pixelX(pos, a, offsets, this.level.mirror),
      pixelY: pixelY(pos, a, offsets, this.level.mirror, world),
    };
  }

  /**
   * The five effects, bound to the blob whose code is running.
   *
   * Each one is a real call into this simulation where there is something to call, and a
   * recorded value where there is not — `playSample` queues, because audio is group 11 and a
   * queued sample is assertable while a sample reaching a sound card is not.
   *
   * `pop` is the interesting one: `Blop::lassPlatzen()` sets the blob's own `am_platzen`, and
   * here that is `exploding = 1`, which is what `testExplosions` then looks for. Scheduling the
   * explosion and *finishing* it are both already here, so a level's `explode` reaches the same
   * state machine the rules do.
   */
  private effectsFor(_store: BlobStore, here: Here): EffectContext {
    // `ort_absolut`, which the effects' routing and `bonus`'s "which player" both ask. The
    // three singleton positions become `nowhere`, which is upstream's `absort_nirgends`: they
    // have no place on the board, and `ResolvedOrt` is the shape that says so.
    const resolved: ResolvedOrt = {
      kind: here.kind === "cell" || here.kind === "fall" ? here.kind : "nowhere",
      x: "x" in here ? here.x : 0,
      y: "y" in here ? here.y : 0,
      right: "right" in here ? here.right : false,
    };
    return {
      here: resolved,
      falling: this.phase === "falling" && this.fall !== null,
      gridWidth: GRX,
      addPoints: (_right, points) => {
        this.score += points;
      },
      setMessage: (_right, text) => {
        this.message = text;
      },
      pop: () => {
        const blob = this.blobAt(here);
        if (blob === null) return;
        // `Blop::lassPlatzen()` sets the blob's own `am_platzen` to 1, and `testExplosions` is
        // what then walks the animation forward. Both ends already exist here, so a level's
        // `explode` reaches the same state machine the rules reach.
        blob.exploding = 1;
      },
      // `EffectContext.playSample` takes a routed `PlayedSample`, so the panning column is
      // already decided by the time it reaches here — `routeSample` is effects.ts's, and the
      // walker is what calls it.
      playSample: (sample) => {
        this.playedSamples.push(sample);
      },
      playerLost: () => {
        this.phase = "lost";
      },
    };
  }

  /**
   * The blob standing at `here`, or null for the blobs that are not on the board.
   *
   * Only `effectsFor`'s `pop` needs it, and only a board or falling blob can pop — the global
   * and semiglobal have no `Ort` on the board and `lassPlatzen` upstream is a `Blop` method that
   * a blob without a cell does not have.
   */
  private blobAt(here: Here): Blob | null {
    if (here.kind !== "cell") return null;
    return this.board.at(here.x, here.y);
  }

  /**
   * `src/spielfeld.cpp:Spielfeld::bewegeHetzrand`.
   *
   * The border descends first and only then is checked for overlap, so a blob
   * that appears under the border in this very step is fatal.
   */
  private advanceBorder(): void {
    const allowedRow = Math.floor(this.borderPx / GRIC);
    if (allowedRow > 0) {
      for (let x = 0; x < GRX; x++) {
        if (this.board.at(x, allowedRow - 1) !== null) {
          this.phase = "lost";
          return;
        }
      }
    }
    this.time++;
    this.borderPx = Math.floor(this.time / this.level.topTime);
  }

  private maybeRandomGrey(): void {
    if (this.level.randomGreys < 0) return;
    if (this.random.chance(1, this.level.randomGreys)) this.pendingGreys++;
  }

  /** `src/fall.cpp:Fall::spielSchrittPlatziertIntern`, then landing. */
  private stepFall(): void {
    const piece = this.fall;
    if (piece === null) return;

    if (piece.slideRemaining > 0) {
      piece.slideRemaining = Math.max(0, piece.slideRemaining - 8);
      // The slide is over when the offset is, which is upstream's `mExtraX` returning to 0 —
      // and it is *not* the same moment, because `mExtraX` is what the picture is offset by and
      // `slideRemaining` is only how long the renderer keeps drawing it there.
      if (piece.slideRemaining === 0) piece.extraX = 0;
    }

    const speed =
      piece.fast || piece.orientation === "single"
        ? FALLING_FAST_SPEED
        : FALLING_SPEED;
    const dropped: FallPiece = {
      ...piece,
      yPx: Math.max(piece.yPx + speed, this.borderPx - GRIC),
    };

    if (!this.fits(dropped)) {
      this.land(piece, dropped);
      return;
    }
    this.fall = dropped;
  }

  /**
   * One step of the time-bonus animation: pay out, then rush the border down.
   *
   * `src/cuyo.cpp:bonusAnimationSchritt` and `src/spielfeld.cpp:bonusSchritt`.
   * The border is what makes the animation finite, so it also decides how long
   * the payout lasts: a level won early has further to fall and so scores more.
   * The last step both pays out and stops, matching upstream awarding the points
   * before it tests `ba_fertig`.
   */
  private stepTimeBonus(): void {
    this.score += POINTS_PER_TIME_BONUS;
    const target = this.bonusTargetPx();
    this.borderPx = Math.min(this.borderPx + BONUS_SPEED, target);
    if (this.borderPx >= target) this.phase = "won";
  }

  /**
   * Where the border comes to rest once the bonus animation is over.
   *
   * Upstream's `unten = gric * gry - ld->mHetzrandStop`. `hetzrandStop` is
   * `topstop`, which the man page documents as a number of *pixels* to stop
   * before the bottom, not a number of rows.
   */
  bonusTargetPx(): number {
    return GRY * GRIC - this.level.hetzrandStop;
  }

  /** True once the level is over, whatever the reason. */
  isOver(): boolean {
    return this.phase === "won" || this.phase === "lost";
  }

  /**
   * True when the last gravity pass left a blob above the spawn margin, which
   * withholds the next piece.
   *
   * Upstream reports this as `rutschnach_viel`. It is exposed because the mode
   * machine here collapses several upstream steps into one, so the flag's effect
   * is not always visible at step granularity and would otherwise be untestable.
   */
  isHeldBack(): boolean {
    return this.settledAboveMargin;
  }

  /**
   * Settles the piece into the board.
   *
   * `src/fall.cpp:Fall::spielSchrittPlatziertIntern`. The blocked mask is taken
   * from the position the piece *failed* to reach, while the committed blobs go
   * where the piece actually is - the drop was refused, so the piece rests where
   * it stopped. The surviving half of a split adopts the attempted position, so
   * it carries straight on without visibly pausing.
   */
  private land(piece: FallPiece, attempted: FallPiece): void {
    const positions = this.piecePositions(piece);

    if (piece.orientation === "single") {
      const p = positions[0];
      if (p !== undefined) this.commit(p, piece, 0);
      this.fall = null;
      return;
    }

    if (piece.orientation === "vertical") {
      // Blob 1 is the lower of the pair, and upstream fixes the lower one first.
      const base = Math.floor((piece.yPx + GRIC - 1) / GRIC);
      this.commit({ x: piece.x, y: base }, piece, 1);
      this.commit({ x: piece.x, y: base - 1 }, piece, 0);
      this.fall = null;
      return;
    }

    const left = positions[0] as { x: number; y: number };
    const right = positions[1] as { x: number; y: number };
    const blocked = this.blockedHalves(attempted);

    if (blocked.zero === blocked.one) {
      // Both halves stop, or - which landing cannot produce - neither does.
      // Committing both keeps the game moving instead of wedging the piece.
      this.commit(left, piece, 0);
      this.commit(right, piece, 1);
      this.fall = null;
      return;
    }

    if (blocked.zero) {
      // The left half is stuck; the right one carries on in its own column.
      this.commit(left, piece, 0);
      this.fall = survivingHalf(attempted, piece.x + 1, piece.blobs[1]);
      return;
    }
    // The right half is stuck; the left one carries on where it already is.
    this.commit(right, piece, 1);
    this.fall = survivingHalf(attempted, piece.x, piece.blobs[0]);
  }

  /**
   * Places a falling blob into the board, sliding it up over anything already
   * in the target cell (`src/fall.cpp:Fall::festige`).
   */
  private commit(
    p: { x: number; y: number },
    piece: FallPiece,
    which: 0 | 1 = 0,
  ): void {
    let y = p.y;
    while (y >= 0 && this.board.at(p.x, y) !== null) y--;
    if (y < 0) return;
    this.board.set(p.x, y, piece.blobs[which]);
  }

  // -------------------------------------------------------------- explosion

  /**
   * `src/spielfeld.cpp:Spielfeld::calcFlopp`.
   *
   * Finds every over-sized component, detonates it, propagates to goal and grey
   * neighbours, awards points and schedules replacement grey blobs.
   *
   * @internal Exposed so tests can exercise a resolution pass without driving
   * the whole step machine.
   */
  testExplosions(): void {
    const animating = this.board.cells.some(
      (c) => c !== null && c.exploding !== 0,
    );
    if (animating) {
      this.phase = "testing";
      return;
    }

    const pendingMarks: Position[] = [];
    const visit = new Uint8Array(GRX * GRY);
    let points = this.chainReaction ? POINTS_PER_CHAIN_REACTION : 0;
    let greyTotal = 1 + (this.chainReaction ? GREYS_PER_CHAIN_REACTION : 0);
    let maxNumexplode = 0;
    let explodedAnything = false;

    for (const { x, y } of this.board.occupied()) {
      const blob = this.board.at(x, y) as Blob;
      if (blob.exploding !== 0) continue;
      if (!blob.has(CALCULATE_SIZE)) continue;

      const kind = this.kindAt(x, y);
      if (kind === null) continue;
      const comp = componentOf(this.board, this.modeAt(), x, y);
      for (const p of comp.positions) {
        const member = this.board.at(p.x, p.y) as Blob;
        member.chainSize = comp.weight;
      }
      if (!blob.has(EXPLODES_ON_SIZE)) continue;
      if (comp.weight < kind.numexplode) continue;

      if (kind.numexplode > maxNumexplode) maxNumexplode = kind.numexplode;

      for (const p of comp.positions) {
        const member = this.board.at(p.x, p.y) as Blob;
        if (visit[p.y * GRX + p.x] === 1) continue;
        visit[p.y * GRX + p.x] = 1;
        member.exploding = 1;
        points += member.has(GOAL_BLOB) ? POINTS_PER_GRASS : POINTS_PER_NORMAL;
        pendingMarks.push(p);
      }
      greyTotal += comp.weight;
      explodedAnything = true;
    }

    if (explodedAnything) {
      // Propagate into goal and grey blobs adjacent to a detonation.
      const propagated = this.propagate(pendingMarks, visit);
      if (propagated > 0) points += 0;
      greyTotal += propagated;
      greyTotal -= maxNumexplode;
      this.pendingGreys += Math.max(0, greyTotal);
      this.score += points;
      this.phase = "exploding";
      this.chainReaction = true;
      return;
    }

    this.chainReaction = false;
    this.phase = "settling";
  }

  /**
   * Detonates goal and grey blobs touching `marks`, recursively.
   *
   * `isChain` follows `calcFloppRec`: a goal blob needs a chain reaction when
   * the level sets `chaingrass`, and a grey blob always propagates.
   */
  private propagate(marks: Position[], visited: Uint8Array): number {
    const queue = [...marks];
    let added = 0;
    while (queue.length > 0) {
      const p = queue.pop() as Position;
      const origin = this.board.at(p.x, p.y);
      if (origin === null) continue;
      // Propagation follows the same neighbour mode as the components, since
      // upstream reaches these cells through the neighbour iterator too.
      for (const o of neighbourOffsets(this.modeAt(), p.x)) {
        const nx = p.x + o.dx;
        const ny = p.y + o.dy;
        if (!this.board.inBounds(nx, ny)) continue;
        if (visited[ny * GRX + nx] === 1) continue;
        const nb = this.board.at(nx, ny);
        if (nb === null || nb.exploding !== 0) continue;
        const kind = this.kindAt(nx, ny);
        if (kind === null) continue;
        const explodes =
          nb.has(EXPLODES_ON_EXPLOSION) ||
          (this.chainReaction && nb.has(EXPLODES_ON_CHAIN_REACTION));
        if (!explodes) continue;
        visited[ny * GRX + nx] = 1;
        nb.exploding = 1;
        this.score += nb.has(GOAL_BLOB) ? POINTS_PER_GRASS : POINTS_PER_NORMAL;
        queue.push({ x: nx, y: ny });
        added++;
      }
    }
    return added;
  }

  // ------------------------------------------------------------ mode machine

  /** The settling/spawn half of `src/spielfeld.cpp:Spielfeld::spielSchritt`. */
  private resolvePhase(): void {
    // Modes chain within a single step. Upstream spends one step per
    // transition, but nothing observable depends on those extra frames, and
    // collapsing them keeps a piece cycle down to roughly its true length.
    for (let guard = 0; guard < 8; guard++) {
      switch (this.phase) {
        case "falling": {
          // A new piece is only introduced once the field has drained, so while
          // one is in play there is nothing else to do.
          if (this.fall !== null) return;
          this.phase = "testing";
          continue;
        }
        case "testing":
          this.testExplosions();
          continue;
        case "exploding": {
          // Advance the animation *first*, then ask whether anything is still
          // exploding.
          //
          // The order is the whole bug. Asking first and returning on a true answer
          // meant the only call to `finishExplosions` sat behind a condition that
          // could never be false: `exploding` is set to 1 when the detonation is
          // scheduled, and `finishExplosions` is what increments it past that, so
          // nothing ever incremented it and the game sat in this phase forever. The
          // visible symptom was an explosion animation that started and never
          // finished, with the game frozen behind it - and since the border and the
          // piece both stop advancing, it looked like the game had ended rather than
          // hung.
          //
          // Upstream keeps the same separation: `spielSchritt` only *waits* on
          // `getWasAmPlatzen()`, while the animation itself is driven by
          // `BlopGitter::animiere()`. Here one `step()` is both, so it has to do the
          // animating as well as the waiting.
          this.finishExplosions();
          const stillExploding = this.board.cells.some(
            (c) => c !== null && c.exploding !== 0,
          );
          if (stillExploding) return;
          this.phase = "settling";
          continue;
        }
        case "settling": {
          if (this.applyGravity()) continue;
          this.phase = "spawningGreys";
          continue;
        }
        case "spawningGreys": {
          if (this.spawnGreys()) continue;
          if (this.goalCount === 0) {
            this.phase = "timeBonus";
            return;
          }
          // Upstream stays in `modus_neue_graue` while `rutschnach_viel` is
          // reported, giving the field another step to come down before a piece is
          // sent. Returning to `settling` is the equivalent here.
          if (this.settledAboveMargin) {
            this.phase = "settling";
            continue;
          }
          this.spawnPiece();
          continue;
        }
        default:
          return;
      }
    }
  }

  /**
   * Advances every exploding blob and removes the finished ones.
   *
   * An exploding blob still occupies its cell, which is why removal happens
   * only on the last step of the animation.
   *
   * @internal Exposed so tests can drive the animation without the step machine.
   */
  finishExplosions(): void {
    for (let y = 0; y < GRY; y++) {
      for (let x = 0; x < GRX; x++) {
        const blob = this.board.at(x, y);
        if (blob === null || blob.exploding === 0) continue;
        blob.exploding += 1;
        if (blob.exploding > EXPLOSION_STEPS) this.board.set(x, y, null);
      }
    }
    this.recount();
  }

  /**
   * Lets blobs fall one cell where there is room.
   *
   * Returns true when anything moved. Blobs marked as floating stay put.
   *
   * A blob that comes to rest above the spawn margin sets
   * {@link settledAboveMargin}, which is how upstream's `rutschnach_viel` keeps a
   * new piece from being sent while the field is still draining. Without this
   * the margin would never apply, because a blob sitting in the row a piece
   * spawns into has already been caught by the chase border first.
   */
  private applyGravity(): boolean {
    let moved = false;
    this.settledAboveMargin = false;
    const margin = this.spawnMarginRow();
    for (let y = GRY - 1; y >= 0; y--) {
      for (let x = 0; x < GRX; x++) {
        const blob = this.board.at(x, y);
        if (blob === null || blob.exploding !== 0) continue;
        if (floats(blob)) continue;
        if (y + 1 >= GRY) continue;
        if (this.board.at(x, y + 1) !== null) continue;
        this.board.set(x, y + 1, blob);
        this.board.set(x, y, null);
        moved = true;
        if (y + 1 < margin) this.settledAboveMargin = true;
      }
    }
    return moved;
  }

  /**
   * Introduces pending grey blobs above the border.
   *
   * Returns true when a spawn happened, so the caller keeps the game in this
   * phase until the field has drained.
   */
  private spawnGreys(): boolean {
    if (this.pendingGreys <= 0) return false;
    const spawnRow = Math.floor((this.borderPx + GREY_SPAWN_OFFSET_PX) / GRIC);
    if (spawnRow < 0) return false;

    const freeColumns: number[] = [];
    for (let x = 0; x < GRX; x++) {
      if (this.board.at(x, spawnRow) === null) freeColumns.push(x);
    }
    if (freeColumns.length === 0) return false;

    const weights = this.level.kinds.map((k) => k.greyProb);
    const greyTotal = weights.reduce((sum, w) => sum + w, 0);
    // Upstream rejects a level where neither greys nor `nogreyprob` are positive,
    // so there is nothing to roll for here.
    if (greyTotal + this.level.noGreyProb <= 0) return false;

    let spawned = false;
    while (this.pendingGreys > 0 && freeColumns.length > 0) {
      const column = freeColumns.splice(
        this.random.int(freeColumns.length),
        1,
      )[0];
      if (column === undefined) break;
      // `nogreyprob` is a weight on *no* grey appearing, rolled per scheduled
      // grey rather than folded into the kind weights, so it has to sit in the
      // same draw as they do. Selecting the trailing entry is the cancel.
      // `src/spielfeld.cpp:Spielfeld::empfangeGraue`.
      const pick = this.random.weighted([...weights, this.level.noGreyProb]);
      if (pick >= weights.length) continue;
      const kind = this.level.kinds[pick];
      if (kind === undefined) continue;
      const blob = this.makeBlob();
      blob.initFromKind(kind);
      blob.version = this.random.int(Math.max(1, kind.versions));
      blob.store.setSystem("version", blob.version);
      this.board.set(column, spawnRow, blob);
      this.pendingGreys--;
      spawned = true;
    }
    if (spawned) this.recount();
    return spawned;
  }

  /** A snapshot for the HUD, read without touching simulation state. */
  snapshot(): {
    score: number;
    time: number;
    greys: number;
    goals: number;
    borderRow: number;
    phase: Phase;
  } {
    return {
      score: this.score,
      time: this.time,
      greys: this.greyCount,
      goals: this.goalCount,
      borderRow: this.borderRow(),
      phase: this.phase,
    };
  }
}


/**
 * `FallPos.r` from the port's three orientations.
 *
 * The port models a piece as horizontal / vertical / single, and `FallPos.r` as `richtung_waag`
 * / `richtung_senk` / `richtung_einzel` — plus `richtung_unplatziert`, which is not an
 * orientation but a *state*: the piece that will enter play next. A piece is in that state when
 * it is not the one in play, which is why the caller says which piece it means rather than this
 * function guessing from the orientation.
 */
export function fallOrientationOf(piece: FallPiece, unplaced = false): FallPos["r"] {
  if (unplaced) return RICHTUNG_UNPLATZIERT;
  if (piece.orientation === "single") return RICHTUNG_EINZEL;
  return piece.orientation === "horizontal" ? RICHTUNG_WAAG : RICHTUNG_SENK;
}
