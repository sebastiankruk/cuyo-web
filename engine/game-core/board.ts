/**
 * The blob grid, connectivity rules and component computation.
 *
 * Connectivity follows `src/blopgitter.cpp:BlopGitter::getBesitzVerbindungen`
 * and `src/spielfeld.cpp:Spielfeld::calcFloppRec`: two blobs connect when they
 * are the same kind, the level's neighbour mode includes the offset between
 * them, and neither blob has that direction inhibited. Upstream tests the two
 * blobs' `inhibit` values separately because inhibit is a per-blob variable;
 * the pairwise form below is equivalent and much easier to read.
 */

import {
  CALCULATE_SIZE,
  EXPLODES_ON_SIZE,
  FLOATS,
  GRX,
  GRY,
  NO_HEX,
  NeighbourMode,
  neighbourOffsets,
} from "./constants.ts";
import type { HexGeometry } from "./constants.ts";
import type { Kind, LevelDef } from "../level-format/level-data.ts";

/** Index of the empty kind, used as the "no blob" sentinel. */
export const EMPTY = -1;

export interface Position {
  readonly x: number;
  readonly y: number;
}

/**
 * One blob on the board.
 *
 * `weight`, `behaviour` and `inhibit` are per-blob copies of kind defaults,
 * matching upstream where each blob owns its variable array. `vars` is that
 * array's backing store, reserved for Cual in task group 3.
 */
export class Blob {
  kind: number = EMPTY;
  version = 0;
  weight = 1;
  behaviour = 0;
  /** Bit field of direction constants used to suppress connections. */
  inhibit = 0;
  /** 0 when not exploding, else 1..EXPLOSION_STEPS. */
  exploding = 0;
  /** Latest component size, as seen by this blob. */
  chainSize = 0;
  /** Per-blob variable storage for Cual. */
  readonly vars: Int32Array;

  constructor(variableCount = 0) {
    this.vars = new Int32Array(variableCount);
  }

  /** True when this cell holds a blob rather than being empty. */
  get present(): boolean {
    return this.kind !== EMPTY;
  }

  /** Copies kind defaults into this blob, as upstream does on creation. */
  initFromKind(kind: Kind): void {
    this.kind = kind.id;
    this.weight = kind.weight;
    this.behaviour = kind.behaviour;
  }

  has(behaviourBit: number): boolean {
    return (this.behaviour & behaviourBit) === behaviourBit;
  }
}

export class Board {
  /** `cells[y * GRX + x]`; `null` is an empty cell. */
  readonly cells: (Blob | null)[];

  constructor() {
    this.cells = new Array<Blob | null>(GRX * GRY).fill(null);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < GRX && y >= 0 && y < GRY;
  }

  at(x: number, y: number): Blob | null {
    return this.inBounds(x, y) ? this.cells[y * GRX + x] : null;
  }

  set(x: number, y: number, blob: Blob | null): void {
    if (this.inBounds(x, y)) this.cells[y * GRX + x] = blob;
  }

  clear(): void {
    this.cells.fill(null);
  }

  /** Every occupied position, row-major. */
  *occupied(): Generator<Position> {
    for (let y = 0; y < GRY; y++) {
      for (let x = 0; x < GRX; x++) {
        if (this.cells[y * GRX + x] !== null) yield { x, y };
      }
    }
  }

  /** True when nothing at all occupies the board. */
  get isEmpty(): boolean {
    return this.cells.every((c) => c === null);
  }
}

/**
 * True when blobs `a` at (ax, ay) and `b` at (bx, by) are connected.
 *
 * `mode` is the neighbour mode in force for `a`'s kind, and `hex` is the *board's*
 * geometry. They are separate because upstream is: `NachbarIterator::setXY` takes
 * the mode from the blob's `Sorte` and the shifted-or-unshifted digit row from
 * `ld->getHexShift`, which reads the level-wide `neighbours` and `hexflip`. A kind
 * asking for hex six in a rectangular board therefore gets hex six's offsets laid
 * out on a square grid.
 *
 * Upstream also requires both blobs to agree on the mode, which they do unless a
 * level sets different modes per kind; that combination is used by no ported
 * level.
 */
export function connected(
  board: Board,
  mode: NeighbourMode,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  hex: HexGeometry = NO_HEX,
): boolean {
  const a = board.at(ax, ay);
  const b = board.at(bx, by);
  if (a === null || b === null) return false;
  if (a.kind !== b.kind) return false;

  const dx = bx - ax;
  const dy = by - ay;
  const allowed = neighbourOffsets(mode, ax, hex);
  const inMode = allowed.some((o) => o.dx === dx && o.dy === dy);
  if (!inMode) return false;

  // Inhibit is per blob and suppresses connections in its own frame only; the
  // opposite direction is the negation of (dx, dy), which is handled by each
  // blob testing its own frame below.
  if (isInhibited(a, dx, dy)) return false;
  if (isInhibited(b, -dx, -dy)) return false;

  return true;
}

/**
 * Direction constants for `inhibit`, matching the `DIR_*` names in
 * `src/knoten.cpp`. Encoded as compass steps so a blob can be tested with the
 * raw offset it was reached by.
 */
const DIR = {
  U: 1,
  UR: 2,
  R: 4,
  DR: 8,
  UUL: 0x10,
  UUR: 0x20,
  RRU: 0x40,
  RRD: 0x80,
  F: 0x100,
  D: 0x10000,
  DL: 0x20000,
  L: 0x40000,
  UL: 0x80000,
  DDR: 0x100000,
  DDL: 0x200000,
  LLD: 0x400000,
  LLU: 0x800000,
  B: 0x1000000,
} as const;

const DIR_BY_OFFSET: ReadonlyMap<string, number> = new Map([
  ["0,-1", DIR.U],
  ["1,-1", DIR.UR],
  ["1,0", DIR.R],
  ["1,1", DIR.DR],
  ["-1,-2", DIR.UUL],
  ["1,-2", DIR.UUR],
  ["2,-1", DIR.RRU],
  ["2,1", DIR.RRD],
  ["0,-2", DIR.F],
  ["0,1", DIR.D],
  ["-1,1", DIR.DL],
  ["-1,0", DIR.L],
  ["-1,-1", DIR.UL],
  ["-2,1", DIR.DDR],
  ["-1,2", DIR.DDL],
  ["-2,-1", DIR.LLD],
  ["-2,0", DIR.B],
]);

function isInhibited(blob: Blob, dx: number, dy: number): boolean {
  const bit = DIR_BY_OFFSET.get(`${dx},${dy}`);
  return bit !== undefined && (blob.inhibit & bit) !== 0;
}

export interface Component {
  readonly positions: Position[];
  /** Sum of member weights. */
  readonly weight: number;
}

/**
 * The connected component of `kind` containing (x, y), with its total weight.
 *
 * Corresponds to the `w == 1` pass of `calcFloppRec`, which accumulates
 * `getKettenBeitrag()` over same-kind blobs reachable through the neighbour
 * mode. `hex` is the board's geometry, as in {@link connected}.
 */
export function componentOf(
  board: Board,
  mode: NeighbourMode,
  x: number,
  y: number,
  hex: HexGeometry = NO_HEX,
): Component {
  const start = board.at(x, y);
  if (start === null || start.exploding !== 0) {
    return { positions: [], weight: 0 };
  }

  const seen = new Uint8Array(GRX * GRY);
  const positions: Position[] = [];
  let weight = 0;
  const stack: Position[] = [{ x, y }];
  seen[y * GRX + x] = 1;

  while (stack.length > 0) {
    const p = stack.pop() as Position;
    const blob = board.at(p.x, p.y) as Blob;
    positions.push(p);
    weight += blob.weight;

    for (const o of neighbourOffsets(mode, p.x, hex)) {
      const nx = p.x + o.dx;
      const ny = p.y + o.dy;
      if (!board.inBounds(nx, ny)) continue;
      if (seen[ny * GRX + nx] === 1) continue;
      if (!connected(board, mode, p.x, p.y, nx, ny, hex)) continue;
      seen[ny * GRX + nx] = 1;
      stack.push({ x: nx, y: ny });
    }
  }

  return { positions, weight };
}

/** True when the blob explodes when its component reaches `numexplode`. */
export function explodesOnSize(blob: Blob): boolean {
  return blob.has(EXPLODES_ON_SIZE);
}

/** True when the blob's component size is tracked for the info display. */
export function calculatesSize(blob: Blob): boolean {
  return blob.has(CALCULATE_SIZE);
}

/** True when the blob ignores gravity. */
export function floats(blob: Blob): boolean {
  return blob.has(FLOATS);
}

/** The kind occupying a cell, or `null` when the cell is empty. */
export function kindAt(
  level: LevelDef,
  board: Board,
  x: number,
  y: number,
): Kind | null {
  const blob = board.at(x, y);
  if (blob === null || blob.kind === EMPTY) return null;
  return level.kinds[blob.kind] ?? null;
}
