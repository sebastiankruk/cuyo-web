/**
 * Canvas-free board geometry and colour maths.
 *
 * Everything here is a pure function of the simulation state, so it is
 * unit-testable in Node with no canvas. `render/board.ts` is left holding only
 * the `fill`/`stroke` calls that actually need a context. This split is required
 * by design.md decision 12: a canvas context appearing in a Node test is a
 * smell pointing at logic in the wrong place.
 */

import {
  GRX,
  GRY,
  hexShift,
} from "../engine/game-core/constants.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";

/** The level properties that affect board geometry. */
export interface BoardFrame {
  /** Cell size in CSS pixels. */
  readonly size: number;
  readonly neighbours: LevelDef["neighbours"];
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

/**
 * Top-left corner of a cell, in pixels.
 *
 * In hex modes odd columns are offset half a cell downward. A mirrored level
 * flips the row order, so row 0 draws at the bottom.
 */
export function cellOrigin(f: BoardFrame, x: number, y: number): Point {
  const row = f.mirror ? GRY - 1 - y : y;
  const shift = hexShift(f.neighbours, x) ? f.size / 2 : 0;
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
export function borderBand(
  f: BoardFrame,
  borderCell: number,
): Rect {
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

// ------------------------------------------------------------------- colour

/**
 * Base colours per art key.
 *
 * A stand-in for the authored art manifest (design.md decision 7). Keys not
 * listed get a stable hue derived from the key text, so an unstyled kind is
 * still visually distinct rather than an unidentifiable blank.
 */
export const ART_COLOURS: Readonly<Record<string, string>> = {
  inGruen: "#3bb03b",
  inGelb: "#e0c020",
  inSchwarz: "#303030",
  inRosaNasen: "#d05090",
  inOrangeNasen: "#e08030",
  inGras: "#7a9a4a",
  inGrau: "#909090",
  ihRot: "#c03030",
  ihGruen: "#30a050",
  ihBlau: "#3060c0",
  ihLila: "#9050c0",
  ihBunt: "#b07040",
  ihGrau: "#808080",
};

/** A stable hue in [0, 360) derived from a key, so it never varies per run. */
export function stableHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/**
 * Colour for an art key and version.
 *
 * `version` shifts the lightness so kinds sharing a fallback hue stay
 * distinguishable.
 */
export function colourFor(key: string, version: number): string {
  const known = ART_COLOURS[key];
  if (known !== undefined) return known;
  return `hsl(${stableHue(key)} 62% ${52 - (version % 3) * 6}%)`;
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
