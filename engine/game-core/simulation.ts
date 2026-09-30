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
function survivingHalf(
  attempted: FallPiece,
  x: number,
  blob: Blob,
): FallPiece {
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

export class Simulation {
  readonly level: LevelDef;
  readonly board = new Board();
  readonly random: RandomSource;

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

  constructor(level: LevelDef, options: SimulationOptions = {}) {
    this.level = level;
    this.random =
      options.random ?? new Prng([options.seed ?? 0x9e3779b9]);
    this.reset();
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

    const dist = this.level.startDist;
    const firstRow = GRY - dist.length;
    for (let i = 0; i < dist.length; i++) {
      const y = firstRow + i;
      for (let x = 0; x < GRX; x++) {
        const cell = dist[i]?.[x];
        if (cell === undefined || cell === null) continue;
        const kind = this.level.kinds[cell.kind];
        if (kind === undefined) continue;
        const blob = new Blob();
        blob.initFromKind(kind);
        blob.version = cell.version;
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
      const blob = new Blob();
      const kind = this.level.kinds[this.random.weighted(weights)];
      if (kind !== undefined) {
        blob.initFromKind(kind);
        blob.version = this.random.int(Math.max(1, kind.versions));
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
      Math.floor((this.borderPx + GREY_SPAWN_OFFSET_PX) / GRIC) + NEW_FALL_MARGIN
    );
  }

  /** The cells a piece currently occupies. */
  piecePositions(piece: FallPiece): Array<{ x: number; y: number }> {
    const base = Math.floor((piece.yPx + GRIC - 1) / GRIC);
    const out: Array<{ x: number; y: number }> = [];
    if (piece.orientation === "horizontal") {
      out.push({ x: piece.x, y: base }, { x: piece.x + 1, y: base });
    } else if (piece.orientation === "vertical") {
      out.push({ x: piece.x, y: base - 1 }, { x: piece.x, y: base });
    } else {
      out.push({ x: piece.x, y: base });
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
    const moved: FallPiece = { ...piece, x: piece.x + dx };
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
      orientation: piece.orientation === "horizontal" ? "vertical" : "horizontal",
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

    this.advanceBorder();
    this.maybeRandomGrey();
    this.stepFall();
    this.resolvePhase();
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

    if (piece.slideRemaining > 0) piece.slideRemaining = Math.max(0, piece.slideRemaining - 8);

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
   * Upstream's `unten = gric * gry - ld->mHetzrandStop`, with `topstop`
   * defaulting to 0.
   */
  bonusTargetPx(): number {
    return GRY * GRIC - this.level.hetzrandStop * GRIC;
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
    const animating = this.board.cells.some((c) => c !== null && c.exploding !== 0);
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
        const stillExploding = this.board.cells.some(
          (c) => c !== null && c.exploding !== 0,
        );
        if (stillExploding) return;
        this.finishExplosions();
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
      const column = freeColumns.splice(this.random.int(freeColumns.length), 1)[0];
      if (column === undefined) break;
      // `nogreyprob` is a weight on *no* grey appearing, rolled per scheduled
      // grey rather than folded into the kind weights, so it has to sit in the
      // same draw as they do. Selecting the trailing entry is the cancel.
      // `src/spielfeld.cpp:Spielfeld::empfangeGraue`.
      const pick = this.random.weighted([...weights, this.level.noGreyProb]);
      if (pick >= weights.length) continue;
      const kind = this.level.kinds[pick];
      if (kind === undefined) continue;
      const blob = new Blob();
      blob.initFromKind(kind);
      blob.version = this.random.int(Math.max(1, kind.versions));
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
