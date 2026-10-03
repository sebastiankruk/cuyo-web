/**
 * The catalogue's level tile: a level's start layout as a small SVG.
 *
 * SVG rather than a canvas per card, for three reasons that all came from the same
 * place. A canvas would mean ~79 of them alive at once in a list that is mostly
 * scrolled off screen, which is GPU memory spent on pictures that never change. It would
 * mean the tile's correctness could only be checked by reading pixels, in a project with
 * no DOM and no canvas in its tests — so "does the tile match the level" would be
 * untestable, which is the one thing 6.7 asks for. And it would mean a tile that is
 * blurry on the phone this was built for, since a canvas rasterises at the size it was
 * drawn and a CSS-scaled one does not.
 *
 * Coordinates are in **board units** — the `viewBox` is `0 0 GRX GRY` — so the SVG is
 * resolution-independent and CSS decides the size. The alternative, baking a pixel size
 * into the numbers, makes every rect's coordinates depend on the tile's display width,
 * which is a thing you learn at one size and then forget.
 */

import type { LevelTile } from "../engine/level-format/index-data.ts";
import { GRX, GRY } from "../engine/game-core/constants.ts";

/** How much of a cell a blob leaves bare, as a fraction of the cell. */
const INSET = 0.08;

/**
 * Rows of background left above and below the drawn band, so blobs do not touch the edge.
 *
 * Half a row rather than a whole one, because a whole row of margin on a tile that is
 * three rows tall is a third of it back to empty.
 */
const MARGIN = 0.5;

/**
 * The shortest tile that is still legible.
 *
 * A level with one occupied row would otherwise be a 10 × 1.5 strip, which at a card's
 * width is about eleven pixels tall — a coloured line rather than a picture, and two such
 * levels would be indistinguishable however differently they were coloured.
 */
const MIN_ROWS = 3;

/**
 * The part of the board the tile shows: `top` and `height`, in board units.
 *
 * **The board is 88.3% empty at the start** — measured over 187 compiled difficulty rows,
 * with a median of three rows filled out of twenty — so a tile of the whole board is a tall
 * rectangle that is almost entirely the level's background, with a strip of blobs at the
 * bottom. Faithful, and not much of a picture. So the tile crops to the band the level
 * actually occupies.
 *
 * Two things the crop deliberately keeps:
 *
 *  - **Bottom alignment.** The band is anchored to the board's bottom, so blobs stay at the
 *    bottom of the tile. Every level's blobs are bottom-aligned already, and a tile that
 *    floated them to the middle would lose the one spatial fact the shape carries.
 *  - **How much the level fills.** A level with one filled row and one with twelve look
 *    different, which is a real difference between levels rather than an artefact of where
 *    the tile was cut.
 *
 * A tile can therefore be shorter than the board and never taller, and `top` is allowed to
 * be negative: the viewBox extends above row 0 into background, which costs nothing and
 * keeps `MIN_ROWS` reachable for a level whose blobs are already at the bottom.
 */
export function crop(tile: LevelTile): { readonly top: number; readonly height: number } {
  if (tile.at.length === 0) {
    // Nothing to crop to. No corpus level has an empty start layout — all 187 have at
    // least six filled cells — so this shows the whole board rather than guessing at a
    // shape, which is the honest answer for a level with no start.
    return { top: 0, height: GRY };
  }
  let lo = GRY;
  let hi = 0;
  for (const at of tile.at) {
    const y = Math.floor(at / GRX);
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const bottom = Math.min(GRY, hi + 1 + MARGIN);
  const height = Math.max(MIN_ROWS, bottom - Math.max(0, lo - MARGIN));
  return { top: bottom - height, height };
}

/**
 * A colour the generator can have produced, or nothing.
 *
 * The values are interpolated into an XML attribute, so a stray quote would produce a
 * document that parses as something other than what was written — and the failure would
 * be a tile missing a blob, not an error. Nothing here is user input: `background` comes
 * from the level's `bgcolor` and the palette from `buildPalette`, both machine-generated.
 * It is a total function because "this cannot happen" is not the same claim as "this
 * cannot render", and only one of them is checkable.
 */
const SAFE_COLOUR = /^(?:rgb|hsl)a?\(\s*[0-9.,%\s/+-]+\)$/;

/** Shown when a colour fails the check. Deliberately loud rather than plausible. */
const FALLBACK = "#ff00ff";

/** One blob's rectangle, in board units. */
interface CellRect {
  readonly x: number;
  readonly y: number;
  readonly colour: string;
}

/**
 * The rectangles a tile draws, top row first.
 *
 * Split out from the SVG so the geometry can be asserted as numbers. A test that checks
 * "the SVG contains 20 rects" passes just as well when all twenty are stacked in the
 * corner, which is the failure this project's tests were written to stop repeating.
 */
export function tileCells(tile: LevelTile, palette: string): CellRect[] {
  const colours = palette.split("|");
  const out: CellRect[] = [];
  for (let i = 0; i < tile.at.length; i++) {
    const at = tile.at[i] as number;
    const kind = tile.kind[i] as number | undefined;
    if (kind === undefined) continue;
    // A kind index with no colour in the palette is a mismatch between the tile and the
    // palette it names, and the only honest thing to draw is the background: a blob in
    // some third colour would be a claim about the level that nothing supports.
    const colour = colours[kind] ?? tile.background;
    out.push({
      x: (at % GRX) + INSET / 2,
      y: Math.floor(at / GRX) + INSET / 2,
      colour: SAFE_COLOUR.test(colour) ? colour : FALLBACK,
    });
  }
  return out;
}

/**
 * The tile as an SVG string.
 *
 * `aria-hidden` because the tile carries nothing a screen reader can use. It is a
 * picture of coloured squares; describing it would be twenty colour names, and the facts
 * it shows — the level's background, roughly how open it is, how many kinds it uses —
 * are already in the card as words (`coloursAt`, `neighbourLabel`). A tile is a way of
 * recognising a level you have played, not information a player does not otherwise have.
 */
export function tileSvg(tile: LevelTile, palette: string): string {
  const background = SAFE_COLOUR.test(tile.background) ? tile.background : FALLBACK;
  const view = crop(tile);
  const rects = tileCells(tile, palette)
    .map(
      (c) =>
        `<rect x="${c.x}" y="${c.y}" width="${1 - INSET}" height="${1 - INSET}" fill="${c.colour}"/>`,
    )
    .join("");
  return (
    `<svg class="tile" viewBox="0 ${view.top} ${GRX} ${view.height}" aria-hidden="true" ` +
    `shape-rendering="crispEdges">` +
    // The background rect covers the whole board rather than the viewBox, so a cropped
    // tile is the level's colour to its edges without the generator having to know the
    // crop. Clipping is the viewBox's job; this rect's extent is not.
    `<rect width="${GRX}" height="${GRY}" fill="${background}"/>` +
    rects +
    `</svg>`
  );
}