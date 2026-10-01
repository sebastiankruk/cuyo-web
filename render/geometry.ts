/**
 * Canvas-free board geometry and colour maths.
 *
 * Everything here is a pure function of the simulation state, so it is
 * unit-testable in Node with no canvas. `render/board.ts` is left holding only
 * the `fill`/`stroke` calls that actually need a context. This split is required
 * by design.md decision 12: a canvas context appearing in a Node test is a
 * smell pointing at logic in the wrong place.
 */

import { GRX, GRY, columnShift } from "../engine/game-core/constants.ts";
import type { HexGeometry } from "../engine/game-core/constants.ts";

/** The level properties that affect board geometry. */
export interface BoardFrame {
  /** Cell size in CSS pixels. */
  readonly size: number;
  /**
   * The board's hex geometry, from the level-wide `neighbours` and `hexflip`.
   *
   * Not the kind's mode: a kind may ask for hex connections in a rectangular
   * board, and that changes which cells connect without offsetting any column.
   * See `HexGeometry`.
   */
  readonly hex: HexGeometry;
  readonly mirror: boolean;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Board height in pixels for a given cell size. */
export function boardHeight(size: number): number {
  return GRY * size;
}

/** Board width in pixels for a given cell size. */
export function boardWidth(size: number): number {
  return GRX * size;
}

/**
 * Largest centred board that fits `available`, preserving the 10:20 proportion.
 *
 * The board is a 1:2 column-to-row rectangle, so the binding constraint is
 * whichever of width/height-relative-to-aspect is tighter.
 */
export function fitBoard(
  availableWidth: number,
  availableHeight: number,
): { width: number; height: number } {
  const aspect = GRY / GRX; // 2
  const byWidth = availableWidth;
  const byHeight = availableHeight / aspect;
  const width = Math.max(0, Math.min(byWidth, byHeight));
  return { width, height: width * aspect };
}

/** Cell size that fits a board of `availableWidth` across. */
export function cellSizeFor(availableWidth: number): number {
  return availableWidth / GRX;
}

/** How a canvas showing the whole board should be sized. */
export interface BoardSizing {
  /** Cell size in CSS pixels, for {@link render} to draw with. */
  readonly size: number;
  /** Backing-store width in device pixels. */
  readonly pixelsX: number;
  /** Backing-store height in device pixels. */
  readonly pixelsY: number;
}

/**
 * Size a canvas so that all twenty rows fit inside it.
 *
 * The renderer works in whole cells and derives the board's own height as
 * `20 * size`, so a canvas that is not exactly ten cells wide and twenty tall
 * gets a board drawn at the wrong scale. Sizing it from the *available box* rather
 * than from the canvas's own width is what keeps the two in step.
 *
 * This was a real bug: the canvas was displayed at 600x300 by
 * `aspect-ratio: 1 / 2` while the renderer drew a 600x1200 board into it, so only
 * the top five of twenty rows were visible. Both shipped levels put every blob in
 * the bottom row, so the board looked empty. `board.test.ts` now pins the ratio
 * from both ends.
 *
 * `dpr` scales the backing store only. CSS then scales the canvas to whatever the
 * layout gives it, and because the backing store is exactly 1:2 the `aspect-ratio`
 * on the element cannot distort it.
 */
export function boardSizing(
  availableWidth: number,
  availableHeight: number,
  dpr = 1,
): BoardSizing {
  // A flex or grid parent reports zero height on the first commit, before layout
  // has run. `fitBoard` would take that as a hard constraint and return a
  // zero-sized board - a second way to get a blank canvas, and one that only
  // appears on the frame the effect runs. So an unusable height is ignored rather
  // than obeyed, and the width governs.
  const heightUsable = Number.isFinite(availableHeight) && availableHeight > 0;
  // Same for the width, except that zero is a genuine constraint there and must
  // not become a fallback size: no room means no board, not a default board.
  const width = Number.isFinite(availableWidth) ? availableWidth : 0;
  const fitted = heightUsable ? fitBoard(width, availableHeight).width : width;
  const size = fitted / GRX;
  // A zero or non-finite ratio would make the backing store 0x0, which renders as
  // a blank canvas even though `size` is perfectly good - the same symptom one
  // layer down. `PlayScreen` guards this already; guard it here as well so the
  // helper is safe to call from anywhere.
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    size,
    pixelsX: Math.round(GRX * size * ratio),
    pixelsY: Math.round(GRY * size * ratio),
  };
}

/**
 * Top-left corner of a cell, in pixels.
 *
 * In hex modes odd columns are offset half a cell downward. A mirrored level
 * flips the row order, so row 0 draws at the bottom.
 */
export function cellOrigin(f: BoardFrame, x: number, y: number): Point {
  const row = f.mirror ? GRY - 1 - y : y;
  const shift = columnShift(f.hex, false, x) ? f.size / 2 : 0;
  return { x: x * f.size, y: row * f.size + shift };
}

/** The cell a pixel point falls in, for hit testing. */
export function cellAt(f: BoardFrame, px: number, py: number): Point | null {
  const x = Math.floor(px / f.size);
  if (x < 0 || x >= GRX) return null;
  const rawY = Math.floor(py / f.size);
  const row = f.mirror ? GRY - 1 - rawY : rawY;
  if (row < 0 || row >= GRY) return null;
  return { x, y: row };
}

/** Which cells a horizontal drag of `dx` pixels covers. */
export function dragCells(f: BoardFrame, dx: number): number {
  return Math.trunc(dx / f.size);
}

/**
 * The band occupied by the chase border.
 *
 * The border descends from the top, or from the bottom in a mirrored level.
 * `borderCell` is the border position expressed in cells.
 */
export function borderBand(f: BoardFrame, borderCell: number): Rect {
  const height = boardHeight(f.size);
  const travelled = Math.max(0, Math.min(height, borderCell * f.size));
  return f.mirror
    ? { x: 0, y: height - travelled, w: boardWidth(f.size), h: travelled }
    : { x: 0, y: 0, w: boardWidth(f.size), h: travelled };
}

/** The four orthogonal contacts a cell has. */
export interface Contacts {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/**
 * The rounded rectangle to fill for one blob.
 *
 * The edges extend towards any same-kind neighbour so touching blobs read as
 * one shape, which is the property the original connection artwork relies on.
 * An unconnected edge is inset instead.
 */
export function stubRect(f: BoardFrame, contacts: Contacts): Rect {
  const pad = Math.max(1, f.size * 0.06);
  const w = f.size - pad * 2;
  const h = f.size - pad * 2;
  const x0 = contacts.left ? pad : pad + w * 0.3;
  const x1 = contacts.right ? pad + w : pad + w * 0.7;
  const y0 = contacts.up ? pad : pad + h * 0.3;
  const y1 = contacts.down ? pad + h : pad + h * 0.7;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Corner radius used for blob fills. */
export function stubRadius(f: BoardFrame): number {
  return f.size * 0.16;
}

/*
 * Blob markers.
 *
 * A goal blob gets a dot and a grey a square, so the two roles are distinguishable
 * from each other and from an ordinary blob by *shape* rather than by colour. Shape
 * because goal blobs already have their own colour and recolouring them would work
 * against telling them apart from each other, and because a shape survives both a black
 * background and a colour that happens to match.
 *
 * Which marker a kind gets comes from `palette.ts`, which is what knows about roles.
 * This file keeps the geometry of the mark - its size and the ink colour - because that
 * is geometry.
 */

/**
 * Radius of the marker's inner shape, as a fraction of the cell.
 *
 * A fraction of the cell, but the number that matters is its fraction of the *blob*,
 * because that is what the eye compares. An isolated blob is 35% of the cell wide -
 * `stubRect` insets it by 6% and then pulls the free edges in to 30% - so a mark
 * wider than about a fifth of the cell stops reading as a mark on a blob and becomes
 * the blob.
 *
 * It was 0.16, which is a diameter of 32% of the cell: **91% of the blob's width.** A
 * screenshot of a dark level showed the consequence exactly - a row of goal blobs read
 * as a row of white circles sitting in green pills, and the greys as grey squares with a
 * white bar across them. The mark had become the object. The shape distinction still
 * worked, so nothing looked *broken*; it just stopped looking like a marked blob, which
 * is the thing the marker is for.
 *
 * 0.075 puts the diameter at 43% of the blob: unmistakably a mark, still solid enough
 * to see on a phone. `geometry.test.ts` ties the two numbers together so they cannot
 * drift apart, since a change to `stubRect` would silently undo this.
 */
export const MARKER_RADIUS = 0.075;

/** A colour that reads against the blob's own, for the marker's inner shape. */
export function markerInk(colour: string): string {
  return shade(colour, 0.55);
}

/*
 * Per-key colour, gone.
 *
 * These hashed a picture name to a hue independently of every other name, which meant
 * two kinds in one level could land a couple of degrees apart: across the 79 real
 * levels, 17 pairs under 25° and a worst case of 2°, in `pfeile.ld`. No improvement to
 * the hash fixes it, because two names can hash near each other however good the hash
 * is - a palette is a set, and has to be chosen as one.
 *
 * `palette.ts` builds one per level instead. It is kept out of this file deliberately:
 * geometry is about where things go, and a palette is about what they look like.
 */

/*
 * Base colours per art key.
 *
 * Artwork is generated procedurally rather than authored, so there is nothing to
 * look up here. Upstream's spritesheets are GPL-2.0 and deliberately not shipped;
 * see scripts/check-no-upstream-art.sh.
 */

/** A stable hue in [0, 360) derived from a key, so it never varies per run. */
export function stableHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

/**
 * Lightens (amount > 0) or darkens (amount < 0) a hex or hsl colour.
 *
 * Unrecognised formats are returned unchanged rather than throwing, so a
 * malformed art key degrades to a visible colour instead of a blank cell.
 */
export function shade(colour: string, amount: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  if (hex !== null) {
    const n = parseInt(hex[1] as string, 16);
    const f = (c: number) =>
      Math.max(0, Math.min(255, Math.round(c + amount * 255)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  const hsl = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(colour);
  if (hsl !== null) {
    const l = Number(hsl[3]);
    const next = Math.max(4, Math.min(96, l + amount * 100));
    return `hsl(${hsl[1]} ${hsl[2]}% ${next}%)`;
  }
  return colour;
}

/**
 * Progress through the explosion animation, 0 at the start and 1 at the end.
 *
 * Used to scale both the bloom radius and its alpha.
 */
export function explosionProgress(step: number, steps: number): number {
  if (steps <= 0) return 1;
  return Math.max(0, Math.min(1, step / steps));
}

/** Radius of the explosion bloom for a given progress. */
export function explosionRadius(f: BoardFrame, progress: number): number {
  return f.size * (0.3 + progress * 0.7) * 0.55;
}
