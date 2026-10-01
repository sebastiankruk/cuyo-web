/**
 * Materialises a start layout: turns each cell's `distkey` choice into a concrete
 * kind, then thins out accidental same-kind adjacency.
 *
 * This is `Spielfeld::createStartDist` in `src/spielfeld.cpp`, in two halves.
 *
 * Upstream's comment calls the second half "a bit of heuristic to make sure no
 * equal blobs are next to each other", and that is exactly what it is: the `+` and
 * pool keys mean "any kind from this pool", and a naive fill regularly lands two of
 * the same colour side by side. That gives the player a free group on the very first
 * move, which is not a gift - it is a start layout that has already partly solved
 * itself.
 *
 * The heuristic is greedy and single-pass over a shuffled worklist rather than a
 * search, so it improves the layout without guaranteeing an optimum. Two details of
 * upstream are reproduced because they change the result, not just the shape:
 *
 * - Each random cell is queued `startlevel_rand_durchgaenge` times, not once. A cell
 *   gets that many chances to improve, so a cell whose neighbours are filled in later
 *   can still be reconsidered.
 * - A replacement is accepted only when it is *strictly* better
 *   (`verb_neu < verb_alt`). Equal is not accepted, so the fill order decides ties
 *   and the result stays a function of the seed.
 */

import { GRX, GRY, NeighbourMode } from "../game-core/constants.ts";
import type { HexGeometry } from "../game-core/constants.ts";
import { neighbourOffsets } from "../game-core/constants.ts";
import type { Kind } from "./level-data.ts";
import type { RandomSource } from "../prng.ts";
import type { StartDist } from "./startdist.ts";

/** `#define startlevel_rand_durchgaenge 10` in `src/spielfeld.cpp`. */
export const RANDOM_PASSES = 10;

/** A cell of the laid-out board: a kind constant, or the empty kind. */
export interface LayoutCell {
  readonly kind: number;
  readonly version: number;
}

/** A whole board of layout cells, row-major, y increasing downward. */
export type LayoutBoard = ReadonlyArray<ReadonlyArray<LayoutCell>>;

/**
 * A built layout, and which of its cells were pool draws.
 *
 * The provenance is not decoration. Task 2.9's claim is that there is no *accidental*
 * same-kind adjacency, and two kinds of adjacency in the corpus are not accidental:
 *
 * - Hand-authored ones. `aliens.ld` has 28 adjacent same-kind pairs over 20 cells,
 *   every one written in the level file by its author on purpose.
 * - The unavoidable ones. `aehnlich.ld` declares exactly one colour, one grey and
 *   one goal kind, and draws all eighteen of its cells from the goal pool. There is
 *   only one candidate, so all eighteen are the same kind and 24 adjacent pairs is
 *   the arithmetic minimum. `theater.ld` is the same at 84 cells. No heuristic can
 *   improve these, and a test that counts them would be reporting the level's design
 *   as a failure.
 *
 * So the layout records which pool each drawn cell came from, and an adjacency counts
 * as accidental only when at least one end was drawn from a pool with more than one
 * candidate.
 */
export interface StartLayout {
  readonly cells: LayoutBoard;
  /** `y * GRX + x` to the pool it was drawn from, for every drawn cell. */
  readonly drawn: ReadonlyMap<number, Pool>;
}

/**
 * The same, with empty cells represented as null.
 *
 * `thinAdjacency` works on this because it needs to tell "no blob" from "a blob of
 * the empty kind" while it is still deciding - a layout under construction has
 * genuinely unfilled cells, and the finished one does not.
 */
export type PartialBoard = ReadonlyArray<ReadonlyArray<LayoutCell | null>>;

/** Which pools the weighted draws come from, named as in the level files. */
type Pool = "colour" | "grey" | "goal";

/**
 * What the layout builder needs to know about a level's kinds.
 *
 * Deliberately narrower than `KindTable`: all it needs is the kinds and the empty
 * constant, so a `KindTable` from `buildKinds` and an already-materialised
 * `LevelDef.kinds` both satisfy it. Requiring the full table would have made this
 * unusable from anywhere that has only parsed a level.
 */
export interface KindSource {
  readonly kinds: readonly Kind[];
  /** Always -1 upstream: `blopart_keins`. */
  readonly emptyKind: number;
}

/** What the layout builder needs beyond the startdist itself. */
export interface LayoutOptions {
  readonly table: KindSource;
  readonly random: RandomSource;
  /** The level-wide `neighbours` mode, which decides what "next to" means. */
  readonly neighbours: NeighbourMode;
  /** The level-wide hex geometry, for the offset columns. */
  readonly hex: HexGeometry;
}

/**
 * Builds the start layout.
 *
 * Rows are bottom-aligned as upstream does them: `mAnfangsZeilen` lists the rows
 * top-first, and row `i` lands at `gry - normallines + i`, so the last declared row
 * is the bottom row of the board.
 */
export function buildStartLayout(
  dist: StartDist,
  options: LayoutOptions,
): StartLayout {
  const { table, random } = options;
  const board: (LayoutCell | null)[][] = [];
  for (let y = 0; y < GRY; y++) {
    board.push(new Array<LayoutCell | null>(GRX).fill(null));
  }
  const drawn = new Map<number, Pool>();

  const rows = dist.rows;
  const firstRow = GRY - rows.length;
  /** Cells whose key was a pool draw, and so may still be improved. */
  const queued: { x: number; y: number; pool: Pool }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const y = firstRow + i;
    const row = rows[i];
    if (row === undefined) continue;
    for (let x = 0; x < GRX; x++) {
      const cell = row.cells[x];
      if (cell === undefined) continue;
      if (cell.kind === "empty") {
        board[y]![x] = { kind: table.emptyKind, version: 0 };
        continue;
      }
      if (cell.kind === "named") {
        board[y]![x] = { kind: cell.kindId, version: cell.version };
        continue;
      }
      if (cell.kind === "info") {
        // An informational cell is not part of the playable board: upstream reads
        // the info values out of the layout rather than leaving a blob there.
        board[y]![x] = null;
        continue;
      }
      board[y]![x] = { kind: drawKind(table, random, cell.pool), version: 0 };
      drawn.set(y * GRX + x, cell.pool);
      for (let pass = 0; pass < RANDOM_PASSES; pass++) {
        queued.push({ x, y, pool: cell.pool });
      }
    }
  }

  thinAdjacency(board, queued, options);
  return {
    cells: board.map((row) =>
      row.map((cell) => cell ?? { kind: table.emptyKind, version: 0 }),
    ),
    drawn,
  };
}

/** The board alone, for callers that do not need the provenance. */
export function layoutCells(layout: StartLayout): LayoutBoard {
  return layout.cells;
}

/** How many kinds a pool can draw from. */
function poolSize(table: KindSource, pool: Pool): number {
  let count = 0;
  for (const kind of table.kinds) {
    const weight =
      pool === "colour"
        ? kind.colourProb
        : pool === "grey"
          ? kind.greyProb
          : kind.goalProb;
    if (weight > 0) count++;
  }
  return count;
}

/**
 * Adjacent same-kind pairs that the player was handed for free.
 *
 * A pair counts when at least one end was drawn from a pool with **more than one**
 * candidate, since only then could the draw have gone differently. Pairs between
 * named kinds are the level author's, and pairs inside a single-candidate pool are
 * forced by it.
 */
export function accidentalPairs(
  layout: StartLayout,
  table: KindSource,
  mode: NeighbourMode,
  hex: HexGeometry,
): number {
  const { cells, drawn } = layout;
  const avoidable = new Set<number>();
  for (const [index, pool] of drawn) {
    if (poolSize(table, pool) > 1) avoidable.add(index);
  }
  const emptyKind = table.emptyKind;
  let pairs = 0;
  for (let y = 0; y < GRY; y++) {
    for (let x = 0; x < GRX; x++) {
      const kind = cells[y]?.[x]?.kind;
      if (kind === undefined || kind === emptyKind) continue;
      for (const offset of neighbourOffsets(mode, x, hex)) {
        // Only look right and down, so each pair is counted once.
        if (offset.dx < 0 || (offset.dx === 0 && offset.dy < 0)) continue;
        const nx = x + offset.dx;
        const ny = y + offset.dy;
        if (nx < 0 || nx >= GRX || ny < 0 || ny >= GRY) continue;
        if (cells[ny]?.[nx]?.kind !== kind) continue;
        const a = y * GRX + x;
        const b = ny * GRX + nx;
        if (avoidable.has(a) || avoidable.has(b)) pairs++;
      }
    }
  }
  return pairs;
}

/**
 * The second half: `Spielfeld::createStartDist`'s neighbour-avoidance loop.
 *
 * Exported for tests, because the interesting properties are all about the *result*
 * rather than about any single step, and they cannot be observed from the loop
 * alone.
 */
export function thinAdjacency(
  board: (LayoutCell | null)[][],
  queued: readonly { x: number; y: number; pool: Pool }[],
  options: LayoutOptions,
): void {
  const { table, random, neighbours, hex } = options;
  // A mutable copy of the worklist, because upstream removes entries as it goes by
  // moving the last element into the vacated slot.
  const work = queued.map((q) => ({ ...q }));

  while (work.length > 0) {
    const at = random.int(work.length);
    const last = work.length - 1;
    const item = work[at]!;
    work[at] = work[last]!;
    work.pop();

    const current = board[item.y]?.[item.x];
    if (current === undefined || current === null) continue;
    const candidate: LayoutCell = {
      kind: drawKind(table, random, item.pool),
      version: 0,
    };
    // Strictly better only, so ties are decided by the fill order and the layout
    // stays a function of the seed rather than of iteration accidents.
    if (
      connections(board, candidate.kind, item.x, item.y, neighbours, hex) <
      connections(board, current.kind, item.x, item.y, neighbours, hex)
    ) {
      board[item.y]![item.x] = candidate;
    }
  }
}

/**
 * `Spielfeld::blopVerbindungen`: how many neighbours of `kind` are already `kind`.
 *
 * A replacement is judged by this alone, so it is exactly the count that matters -
 * it is what decides whether the cell starts the game already part of a group.
 */
export function connections(
  board: PartialBoard,
  kind: number,
  x: number,
  y: number,
  mode: NeighbourMode,
  hex: HexGeometry,
): number {
  let count = 0;
  for (const offset of neighbourOffsets(mode, x, hex)) {
    const nx = x + offset.dx;
    const ny = y + offset.dy;
    if (nx < 0 || nx >= GRX || ny < 0 || ny >= GRY) continue;
    if (board[ny]?.[nx]?.kind === kind) count++;
  }
  return count;
}

/**
 * One weighted draw from a pool.
 *
 * Upstream's `getSorte` walks the kinds once accumulating `colourProb`, `greyProb`
 * and `goalProb` and takes the one the accumulated weight crosses. `weighted` is the
 * same arithmetic with the weights collected first.
 */
function drawKind(table: KindSource, random: RandomSource, pool: Pool): number {
  const weights: number[] = [];
  for (const kind of table.kinds) {
    weights.push(
      pool === "colour"
        ? kind.colourProb
        : pool === "grey"
          ? kind.greyProb
          : kind.goalProb,
    );
  }
  const chosen = random.weighted(weights);
  // A pool with no members - a level with no goal kinds, say - must not produce a
  // phantom kind. The empty kind is the only safe answer, and it is what upstream
  // gets when the accumulated weight never crosses: `getSorte` returns the last
  // kind examined, and `mAnzFarben` counts only numbered ones.
  return chosen < 0 || chosen >= table.kinds.length ? table.emptyKind : chosen;
}

/**
 * How many separate same-kind groups the layout puts on the board.
 *
 * A group is a set of touching blobs of one kind, counted once from its top-left
 * cell: a cell starts a group when nothing above or to its left shares its kind. This
 * is the number the heuristic is trying to reduce, and unlike the count of adjacent
 * *pairs* it is the one a player perceives as "how many groups did I start with".
 *
 * Part of the module rather than the test because the corpus check wants it, and a
 * diagnostic that only exists inside a test cannot be used to explain a bad draw.
 */
export function countGroups(board: LayoutBoard, emptyKind: number): number {
  let groups = 0;
  for (let y = 0; y < GRY; y++) {
    for (let x = 0; x < GRX; x++) {
      const kind = board[y]?.[x]?.kind;
      if (kind === undefined || kind === emptyKind) continue;
      const above = board[y - 1]?.[x]?.kind === kind;
      const left = board[y]?.[x - 1]?.kind === kind;
      if (!above && !left) groups++;
    }
  }
  return groups;
}

/**
 * How many same-kind neighbour pairs the layout contains.
 *
 * The quantity the heuristic actually optimises, unlike {@link countGroups}: a cell
 * in the middle of a run of five contributes four pairs but is one group. Both are
 * reported because they can disagree, and when they do the heuristic has traded
 * group count for pair count, which is worth being able to see.
 */
export function adjacentPairs(
  board: LayoutBoard,
  mode: NeighbourMode,
  hex: HexGeometry,
  emptyKind: number,
): number {
  let pairs = 0;
  for (let y = 0; y < GRY; y++) {
    for (let x = 0; x < GRX; x++) {
      const kind = board[y]?.[x]?.kind;
      if (kind === undefined || kind === emptyKind) continue;
      pairs += connections(board, kind, x, y, mode, hex);
    }
  }
  // Each pair is seen from both of its cells.
  return Math.floor(pairs / 2);
}
