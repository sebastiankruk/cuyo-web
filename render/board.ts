/**
 * Canvas board renderer.
 *
 * All geometry, colour and layout maths lives in `./geometry.ts`, which is
 * canvas-free and unit-tested in Node. This module holds only the `fill` and
 * `stroke` calls that genuinely need a rendering context.
 *
 * Artwork is generated procedurally from each kind's art key (design decision 7:
 * an authored base tile per kind plus a variant compositor). Until real art
 * exists the base tile is derived from the key, so kinds stay visually distinct
 * and the game is playable.
 */

import {
  EXPLOSION_STEPS,
  GRIC,
  hexGeometry,
} from "../engine/game-core/constants.ts";
import type { Blob } from "../engine/game-core/board.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";
import type { Simulation } from "../engine/game-core/simulation.ts";
import {
  borderBand,
  cellOrigin,
  colourFor,
  explosionProgress,
  explosionRadius,
  shade,
  stubRadius,
  stubRect,
} from "./geometry.ts";
import type { BoardFrame, Contacts, Point, Rect } from "./geometry.ts";

function roundRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  radius: number,
): void {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  f: BoardFrame,
  level: LevelDef,
  x: number,
  y: number,
  kind: number,
  version: number,
  contacts: Contacts,
): void {
  const origin = cellOrigin(f, x, y);
  const colour = colourFor(level.kinds[kind]?.artKey ?? "", version);
  // `stubRect` gives the shape *within* a cell, so it has to be moved to the
  // cell's origin before it is filled. This was missing: every blob was filled at
  // the same near-origin rectangle, so the whole board piled up in the top-left
  // corner and read as one sprite on a blank grid.
  const rect = atOrigin(stubRect(f, contacts), origin);

  ctx.fillStyle = colour;
  roundRect(ctx, rect, stubRadius(f));
  ctx.fill();

  // A highlight along the top edge so the tile reads as a solid object.
  const band = Math.max(1, f.size * 0.16);
  ctx.strokeStyle = shade(colour, 0.2);
  ctx.lineWidth = Math.max(1, f.size * 0.04);
  ctx.beginPath();
  ctx.moveTo(rect.x + f.size * 0.16, rect.y + band);
  ctx.lineTo(rect.x + rect.w - f.size * 0.16, rect.y + band);
  ctx.stroke();

  // A seam along each edge that touches a same-kind neighbour.
  //
  // Touching blobs deliberately meet with no gap, so that a run of them reads as
  // one shape - that is the whole point of the connection artwork upstream, and it
  // is how you tell at a glance which blobs are joined. But with no seam at all a
  // six-blob group renders as one large rectangle of colour, and counting the
  // blobs is impossible, which is not a small thing when the win condition is
  // "connect six of these".
  //
  // So the shared edge is drawn rather than the gap. The silhouette stays joined
  // while each cell remains countable, which is what the original artwork does:
  // the connection variants tile continuously but each tile keeps its edge.
  ctx.strokeStyle = shade(colour, -0.28);
  ctx.lineWidth = Math.max(1, f.size * 0.05);
  ctx.beginPath();
  if (contacts.left) {
    const sx = rect.x;
    ctx.moveTo(sx, rect.y + (contacts.up ? 0 : f.size * 0.2));
    ctx.lineTo(sx, rect.y + rect.h - (contacts.down ? 0 : f.size * 0.2));
  }
  if (contacts.right) {
    const sx = rect.x + rect.w;
    ctx.moveTo(sx, rect.y + (contacts.up ? 0 : f.size * 0.2));
    ctx.lineTo(sx, rect.y + rect.h - (contacts.down ? 0 : f.size * 0.2));
  }
  if (contacts.up) {
    const sy = rect.y;
    ctx.moveTo(rect.x + (contacts.left ? 0 : f.size * 0.2), sy);
    ctx.lineTo(rect.x + rect.w - (contacts.right ? 0 : f.size * 0.2), sy);
  }
  if (contacts.down) {
    const sy = rect.y + rect.h;
    ctx.moveTo(rect.x + (contacts.left ? 0 : f.size * 0.2), sy);
    ctx.lineTo(rect.x + rect.w - (contacts.right ? 0 : f.size * 0.2), sy);
  }
  ctx.stroke();
}

/** A rect moved by an offset. */
function atOrigin(r: Rect, origin: Point): Rect {
  return { x: r.x + origin.x, y: r.y + origin.y, w: r.w, h: r.h };
}

/** Fades and blooms an exploding blob over its animation. */
function drawExplosion(
  ctx: CanvasRenderingContext2D,
  f: BoardFrame,
  x: number,
  y: number,
  colour: string,
  step: number,
): void {
  const t = explosionProgress(step, EXPLOSION_STEPS);
  const origin = cellOrigin(f, x, y);
  const cx = origin.x + f.size / 2;
  const cy = origin.y + f.size / 2;
  const reach = explosionRadius(f, t);

  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t);
  const grad = ctx.createRadialGradient(cx, cy, reach * 0.15, cx, cy, reach);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.4, shade(colour, 0.3));
  grad.addColorStop(1, "rgba(255,150,20,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, reach, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Renders the board, the falling piece and the chase border. */
export function render(
  ctx: CanvasRenderingContext2D,
  sim: Simulation,
  size: number,
): void {
  const level = sim.level;
  const f: BoardFrame = {
    size,
    hex: hexGeometry(level.neighbours),
    mirror: level.mirror,
  };
  const width = 10 * size;
  const height = 20 * size;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = level.colours.background;
  ctx.fillRect(0, 0, width, height);

  const band = borderBand(f, sim.borderPx / GRIC);
  ctx.fillStyle = level.colours.top;
  if (band.h > 0) ctx.fillRect(band.x, band.y, band.w, band.h);

  // Faint grid, so empty cells and the hex offset stay legible.
  ctx.strokeStyle = "rgba(128,128,128,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 1; y < 20; y++) {
    ctx.moveTo(0, Math.round(y * size) + 0.5);
    ctx.lineTo(width, Math.round(y * size) + 0.5);
  }
  ctx.stroke();

  for (const { x, y } of sim.board.occupied()) {
    const blob = sim.board.at(x, y);
    if (blob === null) continue;
    const colour = colourFor(
      level.kinds[blob.kind]?.artKey ?? "",
      blob.version,
    );
    if (blob.exploding !== 0) {
      drawExplosion(ctx, f, x, y, colour, blob.exploding);
      continue;
    }
    const same = (dx: number, dy: number): boolean => {
      const other = sim.board.at(x + dx, y + dy);
      return other !== null && other.kind === blob.kind;
    };
    drawCell(ctx, f, level, x, y, blob.kind, blob.version, {
      up: same(0, -1),
      down: same(0, 1),
      left: same(-1, 0),
      right: same(1, 0),
    });
  }

  // The falling piece is drawn above everything, as upstream does. It gets no
  // connecting stubs: nothing on the board is connected to it yet.
  const piece = sim.fall;
  if (piece !== null) {
    ctx.globalAlpha = 0.95;
    const isolated: Contacts = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    for (const p of sim.piecePositions(piece)) {
      if (p.y < 0 || p.y >= 20) continue;
      const blob = fallingBlob(piece, p.x);
      drawCell(ctx, f, level, p.x, p.y, blob.kind, blob.version, isolated);
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
    return (piece.blobs[1] ?? piece.blobs[0]) as Blob;
  }
  if (x === piece.x) return piece.blobs[0] as Blob;
  return (piece.blobs[1] ?? piece.blobs[0]) as Blob;
}
