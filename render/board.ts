/**
 * Canvas board renderer.
 *
 * Artwork is generated procedurally from each kind's art key (design decision 7:
 * an authored base tile per kind plus a variant compositor). Until real art
 * exists, the base tile is derived from the key so kinds stay visually distinct
 * and the game is playable.
 *
 * Connection-aware edges are drawn where two same-kind blobs touch, which is
 * what makes the original art read as one organism rather than a pile of tiles.
 */

import {
  EXPLOSION_STEPS,
  GRIC,
  GRX,
  GRY,
  hexShift,
} from "../engine/game-core/constants.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";
import type { Simulation } from "../engine/game-core/simulation.ts";
import type { Blob } from "../engine/game-core/board.ts";

/**
 * Base colour per art key.
 *
 * A stand-in for the authored art manifest. Keys not listed get a stable hue
 * derived from the key text, so nothing renders as an unidentifiable blank.
 */
const ART_COLOURS: Readonly<Record<string, string>> = {
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

function stableHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function colourFor(key: string, version: number): string {
  const known = ART_COLOURS[key];
  if (known !== undefined) return known;
  return `hsl(${stableHue(key)} 62% ${52 - (version % 3) * 6}%)`;
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex or hsl colour. */
function shade(colour: string, amount: number): string {
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

interface Frame {
  readonly size: number;
  readonly level: LevelDef;
}

/** Top-left corner of a cell, including the hex column offset and mirroring. */
function origin(f: Frame, x: number, y: number): { ox: number; oy: number } {
  const row = f.level.mirror ? GRY - 1 - y : y;
  const shift = hexShift(f.level.neighbours, x) ? f.size / 2 : 0;
  return { ox: x * f.size, oy: row * f.size + shift };
}

/**
 * Draws one blob with a connecting stub towards each same-kind neighbour.
 *
 * Stands in for the authored connection variants: it reads as one shape when
 * blobs touch, which is the property the original art relies on.
 */
function drawCell(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  x: number,
  y: number,
  kind: number,
  version: number,
  sameNeighbour: (dx: number, dy: number) => boolean,
): void {
  const colour = colourFor(f.level.kinds[kind]?.artKey ?? "", version);
  const { ox, oy } = origin(f, x, y);

  const up = sameNeighbour(0, -1);
  const down = sameNeighbour(0, 1);
  const left = sameNeighbour(-1, 0);
  const right = sameNeighbour(1, 0);

  const pad = Math.max(1, f.size * 0.06);
  const w = f.size - pad * 2;
  const h = f.size - pad * 2;
  const cx = ox + pad;
  const cy = oy + pad;

  const x0 = left ? cx : cx + w * 0.3;
  const x1 = right ? cx + w : cx + w * 0.7;
  const y0 = up ? cy : cy + h * 0.3;
  const y1 = down ? cy + h : cy + h * 0.7;

  ctx.fillStyle = colour;
  roundRect(ctx, x0, y0, x1 - x0, y1 - y0, f.size * 0.16);
  ctx.fill();

  // A highlight along the top edge so the tile reads as a solid object.
  const band = Math.max(1, f.size * 0.16);
  ctx.strokeStyle = shade(colour, 0.2);
  ctx.lineWidth = Math.max(1, f.size * 0.04);
  ctx.beginPath();
  ctx.moveTo(x0 + f.size * 0.16, y0 + band);
  ctx.lineTo(x1 - f.size * 0.16, y0 + band);
  ctx.stroke();
}

/** Fades and blooms an exploding blob over its 8-step animation. */
function drawExplosion(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  x: number,
  y: number,
  colour: string,
  step: number,
): void {
  const t = Math.min(1, step / EXPLOSION_STEPS);
  const { ox, oy } = origin(f, x, y);
  const cx = ox + f.size / 2;
  const cy = oy + f.size / 2;
  const reach = f.size * (0.3 + t * 0.7);

  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t);
  const grad = ctx.createRadialGradient(cx, cy, reach * 0.08, cx, cy, reach * 0.55);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.4, shade(colour, 0.3));
  grad.addColorStop(1, "rgba(255,150,20,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, reach * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Renders the board, the falling piece and the chase border. */
export function render(ctx: CanvasRenderingContext2D, sim: Simulation, size: number): void {
  const level = sim.level;
  const f: Frame = { size, level };
  const width = GRX * size;
  const height = GRY * size;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = level.colours.background;
  ctx.fillRect(0, 0, width, height);

  // Chase border, drawn on the side it descends from.
  const travelled = (sim.borderPx / GRIC) * size;
  const shown = Math.max(0, Math.min(height, travelled));
  ctx.fillStyle = level.colours.top;
  if (level.mirror) ctx.fillRect(0, height - shown, width, shown);
  else ctx.fillRect(0, 0, width, shown);

  // Faint grid, so empty cells and the hex offset stay legible.
  ctx.strokeStyle = "rgba(128,128,128,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 1; y < GRY; y++) {
    ctx.moveTo(0, Math.round(y * size) + 0.5);
    ctx.lineTo(width, Math.round(y * size) + 0.5);
  }
  if (hexShift(level.neighbours, 1)) {
    for (let x = 1; x < GRX; x += 2) {
      ctx.moveTo(Math.round(x * size) + 0.5, 0);
      ctx.lineTo(Math.round(x * size) + 0.5, height);
    }
  }
  ctx.stroke();

  for (const { x, y } of sim.board.occupied()) {
    const blob = sim.board.at(x, y);
    if (blob === null) continue;
    const colour = colourFor(level.kinds[blob.kind]?.artKey ?? "", blob.version);
    if (blob.exploding !== 0) {
      drawExplosion(ctx, f, x, y, colour, blob.exploding);
      continue;
    }
    drawCell(ctx, f, x, y, blob.kind, blob.version, (dx, dy) => {
      const other = sim.board.at(x + dx, y + dy);
      return other !== null && other.kind === blob.kind;
    });
  }

  // The falling piece is drawn above everything, as upstream does. It gets no
  // connecting stubs: nothing on the board is connected to it yet.
  const piece = sim.fall;
  if (piece !== null) {
    ctx.globalAlpha = 0.95;
    for (const p of sim.piecePositions(piece)) {
      if (p.y < 0 || p.y >= GRY) continue;
      const blob = fallingBlob(piece, p.x);
      drawCell(ctx, f, p.x, p.y, blob.kind, blob.version, () => false);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * Which half of the falling piece occupies column `x`.
 *
 * A vertical piece stacks blob 0 above blob 1; a horizontal or single piece has
 * blob 0 on the left.
 */
function fallingBlob(
  piece: { x: number; orientation: string; blobs: readonly Blob[] },
  x: number,
): Blob {
  if (piece.orientation === "vertical") {
    return piece.blobs[1] ?? piece.blobs[0];
  }
  return x === piece.x ? (piece.blobs[0] as Blob) : (piece.blobs[1] ?? (piece.blobs[0] as Blob));
}
