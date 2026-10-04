/**
 * A falling piece's own geometry: where each of its blobs is, in cells and in pixels.
 *
 * Task 15.6's missing piece, and the reason `constants.ts` **refuses** to answer `loc_x` for a
 * falling blob rather than approximating it. That refusal was right and it became reachable the
 * moment blobs' code started running: a falling blob's `loc_*` goes through `FallPos::getX/getY`
 * and `Fall::getXX/getYY`, and neither is the cell the piece will land on. `getY` divides a *pixel*
 * position by `gric`, so the pixel offset a slide leaves behind is half the answer, and `getXX`
 * indexes a digit table by rotation and adds `gric * sin(30°)`. Approximating any of that with the
 * cell coordinates would be wrong by half a cell for every rotated piece, and 33 of the 79 levels
 * read `loc_*`.
 *
 * ## Transcribed, not designed
 *
 * | here | upstream |
 * |---|---|
 * | {@link FallPos} | `struct FallPos` (`fall.h:44`) |
 * | {@link fallCount} | `FallPos::getAnz` (`fall.cpp:60`) |
 * | {@link cellX} | `FallPos::getX` (`fall.cpp:68`) |
 * | {@link cellY} | `FallPos::getY` (`fall.cpp:73`) |
 * | {@link pixelX} | `Fall::getXX` (`fall.cpp:514`) |
 * | {@link pixelY} | `Fall::getYY` (`fall.cpp:533`) |
 * | {@link drehIndex} | `Fall::getDrehIndex` (`fall.cpp:556`) |
 *
 * ## The digit table is the whole of `getXX`/`getYY`
 *
 * `getDrehIndex` packs rotation, mirroring, verticalness and which blob is asking into one number,
 * and the two tables read a character out of it:
 *
 *     int drehx = "2215 2243 2215 4322  2"[getDrehIndex(a)] - '1';
 *
 * 22 characters, and the index is one of `0..3`, `5..8`, `10..13`, `15..18` or `21` — the spaces
 * are what make the index arithmetic work, and `21` (the "not rotated at all" case) lands on the
 * last character. Subtracting `'1'` turns the digits into offsets `0..4` into {@link WANDEL}.
 * `getYY` uses the same index into a table with the five groups in a different order, which is not
 * a typo upstream and is why both strings are here verbatim rather than one being derived.
 *
 * {@link WANDEL} is upstream's local `wandel[]`, built from two `#define`s at `fall.cpp:30-31`:
 * `am_drehen_schieb_gross = 28` is `gric * cos(30°)` and `am_drehen_schieb_klein = 16` is
 * `gric * sin(30°)`, with `gric = 32`. They are half-cell trigonometry for a hexagonal grid, and
 * they are written out rather than computed so that a change of `GRIC` is a visible edit.
 */

import { GRIC } from "./constants.ts";

/** `gric * sin(30°)`, `fall.cpp:31`. */
const SCHIEB_KLEIN = 16;
/** `gric * cos(30°)`, `fall.cpp:30`. */
const SCHIEB_GROSS = 28;

/**
 * `fall.cpp:525`'s `wandel[]`: the five ways a rotated blob's picture sits inside its cell.
 *
 * Index 1 is `-gric + SCHIEB_KLEIN` and index 5 is `-gric + SCHIEB_GROSS` — that is, "shifted left
 * by most of a cell, plus the trig offset" — which is what makes a rotated blob straddle two cells
 * the way it does on a hex board.
 */
export const WANDEL: readonly number[] = [
  0 - 32 + SCHIEB_KLEIN,
  0,
  SCHIEB_KLEIN,
  SCHIEB_GROSS,
  0 - 32 + SCHIEB_GROSS,
];

/** `richtung_*`, `fall.h:33-37`. The value is the number, because the port stores it as such. */
export type FallOrientation = 0 | 1 | 2 | 3 | 4;

/** `richtung_keins`: no piece. */
export const RICHTUNG_KEINS = 0;
/** `richtung_einzel`: a lone blob. */
export const RICHTUNG_EINZEL = 1;
/** `richtung_waag`: horizontal, so the two blobs sit side by side. */
export const RICHTUNG_WAAG = 2;
/** `richtung_senk`: vertical, so the two blobs sit one above the other. */
export const RICHTUNG_SENK = 3;
/** `richtung_unplatziert`: the piece that will enter play next. */
export const RICHTUNG_UNPLATZIERT = 4;

/**
 * `struct FallPos`, `fall.h:44`.
 *
 * Three fields and nothing else, which is why the port's `FallPiece` can hold this as well: the
 * direction *is* the orientation and the blob count.
 */
export interface FallPos {
  /**
   * The piece's column, in cells.
   *
   * "bei unplatzierten Blops ist das die Pos, an der der Blop spaeter auftauchen wird" — for the
   * next piece this is where it will *appear*, not where it is drawn.
   */
  readonly x: number;
  /**
   * The piece's row, in **pixels**, and absolute — not relative to a field scrolled by a
   * Rüberreihe.
   *
   * For the next piece it is relative to the preview area instead, which is why
   * {@link pixelY} has a separate branch for it rather than reusing {@link cellY}'s.
   */
  readonly yy: number;
  /** `r`: direction and blob count together. See {@link FallOrientation}. */
  readonly r: FallOrientation;
}

/** The two things upstream reads off the field rather than off the piece. */
export interface FallWorld {
  /**
   * `Spielfeld::getHetzrandYPix()`: the chase border's position in pixels.
   *
   * Needed twice and in opposite roles: {@link cellY} adds it for an unplaced piece (its row is
   * measured from the preview, not from the border), and {@link pixelY} returns it as the whole
   * answer for one.
   */
  readonly borderPx: number;
  /**
   * `Spielfeld::getHexShift(x)`: whether column `x` is offset by half a row.
   *
   * A function, because it is asked of the blob's *own* column (`getHexShift(getX(a))`) and not of
   * the piece's — the two differ for a vertical piece, which is exactly where a constant would be
   * wrong.
   */
  readonly hexShift: (x: number) => boolean;
}

/**
 * The two per-piece offsets upstream keeps and this port did not have.
 *
 * Both are "the piece is a little bit off its resting position", which is what a slide and a fast
 * rotation leave behind. They are inputs here rather than fields of {@link FallPos} because
 * upstream keeps them on `Fall` and not on the position, and because a caller that does not model
 * a slide passes zero for both — which is the *correct* answer for a piece that is not sliding.
 */
export interface FallOffsets {
  /**
   * `Fall::mExtraX`: -1, 0 or 1, how many cells the piece is drawn left of or right of `x`.
   *
   * Set by `rutschen` — the horizontal move — and cleared when the slide finishes. It is why
   * {@link pixelX} adds `mExtraX` on top of `mPos.x`: during a slide the picture is between two
   * cells while `mPos.x` is already the cell it is heading for.
   */
  readonly extraX: number;
  /**
   * `Fall::mExtraDreh`: 0 when the piece is square to the grid, otherwise the quarter turn it is
   * part-way through.
   *
   * Upstream's own comment says "3 bedeutet eigentlich: Noch gar nicht gedreht" — *3 really means
   * not rotated at all* — and treats it as 2, because "the player presses a key, a `spielSchritt()`
   * runs first (with the turn), and for simplicity we already draw it turned". So {@link drehIndex}
   * collapses 3 to 2 before packing, and a value of 0 takes a different path entirely.
   */
  readonly extraDreh: number;
}

/** The orientation's blob count: `FallPos::getAnz`, `fall.cpp:60`. */
export function fallCount(pos: FallPos): number {
  if (pos.r === RICHTUNG_KEINS) return 0;
  if (pos.r === RICHTUNG_EINZEL) return 1;
  // waag / senk / unplatziert
  return 2;
}

/** `FallPos::getX(a)`, `fall.cpp:68`. One line, and the `a *` is the orientation. */
export function cellX(pos: FallPos, a: number): number {
  return pos.x + a * (pos.r === RICHTUNG_WAAG || pos.r === RICHTUNG_UNPLATZIERT ? 1 : 0);
}

/**
 * `FallPos::getY(a, spf)`, `fall.cpp:73`.
 *
 * Four steps and each one earns its place:
 *
 * 1. `yy + gric - 1` — `yy` is the piece's *top* row in pixels, and a blob is `gric` tall, so this
 *    is its bottom edge. The `- 1` is upstream's and is why this is not simply `yy + gric`.
 * 2. `+ spf->getHochVerschiebung()` — the Rüberreihe scroll. **Always 0 here**, and that is not a
 *    shortcut: `mHochVerschiebung` moves only in `rrmodus_gib_runter` (`spielfeld.cpp:1464`), which
 *    needs `bitteUmReihe` to have asked for a Rüberreihe, and a Rüberreihe needs a second player
 *    field. Two-player is a design non-goal, so upstream's own value on every reachable path is 0.
 * 3. `+ hetzrandYPix - gric` for an unplaced piece, because its `yy` is measured from the preview
 *    area rather than from the border.
 * 4. `+ gric / 2` when this blob's own column is hex-shifted — again on `getX(a)`, not on `pos.x`.
 *
 * Then the division, which is what makes this a *pixel* input producing a *cell*: `y0 / gric` is
 * integer division in C++ and truncates toward zero, so `Math.trunc` and not `Math.floor` — they
 * differ for the negative `y0` a piece above the border has, and `loc_y` is read by levels.
 */
export function cellY(pos: FallPos, a: number, world: FallWorld): number {
  let y0 = pos.yy + GRIC - 1;
  if (pos.r === RICHTUNG_UNPLATZIERT) y0 += world.borderPx - GRIC;
  if (world.hexShift(cellX(pos, a))) y0 += Math.trunc(GRIC / 2);
  return Math.trunc(y0 / GRIC) + a * (pos.r === RICHTUNG_SENK ? 1 : 0);
}


/**
 * `Fall::getDrehIndex(a)`, `fall.cpp:556`.
 *
 * Upstream's comment names the packing: "Bit 21: gar nicht gedreht | Bit 10: Spiegel? | Bit 5:
 * wirdSenk? | Bit 2: Blob1? | Bit 1: Schritt1?" — so the number is read as *digits in base 5*, and
 * the two lookup tables are indexed by it.
 *
 * `21` is the "not rotated at all" answer, which is not one of the five-digit combinations at all —
 * it is a sixth case, and it is what a piece with `mExtraDreh == 0` always gets.
 *
 * `a * 2` is "Blob1?" and `ed == 1` is "Schritt1?". `istSenkrecht()` is `r == waag || r == senk`
 * (`fall.h:111`) — vertical or horizontal, i.e. neither a lone blob nor an unplaced one.
 */
export function drehIndex(
  pos: FallPos,
  a: number,
  offsets: FallOffsets,
  mirrored: boolean,
): number {
  if (offsets.extraDreh === 0) return 21;
  // `int ed = mExtraDreh; if (ed == 3) ed = 2;`
  const ed = offsets.extraDreh === 3 ? 2 : offsets.extraDreh;
  const senkrecht = pos.r === RICHTUNG_WAAG || pos.r === RICHTUNG_SENK ? 1 : 0;
  return 10 * (mirrored ? 1 : 0) + 5 * senkrecht + 2 * a + (ed === 1 ? 1 : 0);
}

/**
 * `Fall::getXX(a)`, `fall.cpp:514`.
 *
 * `(mPos.x + a * (waag || unplatziert)) * gric + mExtraX + wandel[drehx]`
 *
 * Note the shape of `mExtraX`: it is added **raw**, not scaled by `gric`. That looks like an
 * upstream bug and is transcribed as written, with the reason left open rather than guessed at —
 * `mExtraX` is set to `-1`/`0`/`1` by `rutschen`, and if it were meant as a cell offset the
 * drawing would be off by a whole `gric` during a slide, which is plainly not what happens. So it
 * is either a half-cell measure or upstream compensates elsewhere; **this transcription says what
 * the source says**, and `fall-geometry.test.ts` pins the formula rather than the appearance.
 */
export function pixelX(
  pos: FallPos,
  a: number,
  offsets: FallOffsets,
  mirrored: boolean,
): number {
  const drehx = DREH_X.charCodeAt(drehIndex(pos, a, offsets, mirrored)) - "1".charCodeAt(0);
  const column = pos.x + a * (pos.r === RICHTUNG_WAAG || pos.r === RICHTUNG_UNPLATZIERT ? 1 : 0);
  return column * GRIC + offsets.extraX + (WANDEL[drehx] ?? 0);
}

/**
 * `Fall::getYY(a)`, `fall.cpp:533`.
 *
 * Two branches and the first is not a special case of the second: an **unplaced** piece's `yy` is
 * relative to the preview area, so its absolute row comes from the border instead —
 * `getHetzrandYPix() - gric + mPos.yy`. The unplaced branch returns before the digit table is
 * consulted at all, which is why `pixelX` has no such branch and this one does: `getXX` still reads
 * `mPos.x` for a next piece, because "where it will appear" is exactly what that comment means.
 */
export function pixelY(
  pos: FallPos,
  a: number,
  offsets: FallOffsets,
  mirrored: boolean,
  world: FallWorld,
): number {
  if (pos.r === RICHTUNG_UNPLATZIERT) return world.borderPx - GRIC + pos.yy;
  const drehy = DREH_Y.charCodeAt(drehIndex(pos, a, offsets, mirrored)) - "1".charCodeAt(0);
  return (
    pos.yy + a * (pos.r === RICHTUNG_SENK ? 1 : 0) * GRIC + (WANDEL[drehy] ?? 0)
  );
}

/** `fall.cpp:520`: the `getXX` table, verbatim — 22 characters, spaces included. */
export const DREH_X = "2215 2243 2215 4322  2";

/** `fall.cpp:542`: the `getYY` table, verbatim. Same five groups, different order. */
export const DREH_Y = "4322 2215 2243 2215  2";