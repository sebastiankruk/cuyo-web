// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The three draw statements — `*`, `* ort`, `ort *` — and the quarter clipping they perform.
 *
 * Task 4.9. Upstream has exactly two functions for this, and both are short enough to quote:
 *
 *     void Blop::speichereBild() {
 *       braucheLeereStapel();
 *       if ((!mMalenErlaubt) || (!mOrt.bemalbar()))
 *         throw Fehler("%s","Drawing is not allowed at the moment.");
 *       mBild.speichereBild(getSorte(), mDaten[spezvar_file], mDaten[spezvar_pos],
 *                           mDaten[spezvar_quarter]);
 *     }
 *
 *     void Blop::speichereBildFremd(Ort & ort, int ebene) {
 *       ort_absolut ziel = ort.berechne(mOrt,*this);
 *       if (ziel.korrekt(true)) {
 *         Blop & b = ziel.finde();
 *         if ((!mMalenErlaubt) || (!b.mOrt.bemalbar()))
 *           throw Fehler("%s","Drawing is not allowed at the moment.");
 *         b.braucheLeereStapel();
 *         b.mBild.speichereBild(getSorte(), mDaten[spezvar_file], mDaten[spezvar_pos],
 *                               mDaten[spezvar_quarter], ebene);
 *       }
 *     }
 *
 * ## `ebene` is which side of the address you wrote it on
 *
 * `'*' ort` is `newCode2(mal_code_fremd, ort, 1)` and `ort '*'` is `newCode2(mal_code_fremd,
 * ort, -1)`. So the *same* address draws on opposite sides depending only on where the `*`
 * was written: `*@(1,0)` draws at level +1, `@(1,0)*` at level -1. Two spellings of one
 * meaning would have been a reasonable thing to normalise; upstream did not, and a level that
 * uses both would draw twice as deep.
 *
 * ## `korrekt(true)` is one row taller than `korrekt(false)`
 *
 *     bool koordOK   (int x, int y) const { return x >= 0 && x < grx && y >= 0 && y <  getGrY(); }
 *     bool koordMalOK(int x, int y) const { return x >= 0 && x < grx && y >= 0 && y <  getGrY() + 1; }
 *
 * Upstream's comment on the second: "either it is inside the field, or it is one of the
 * hex-mode edge blobs. At the moment we don't test at all whether we are in hex mode (and in
 * a suitable column). That means a bit of time is wasted when Cual code paints at one of the
 * places that isn't visible at all." So the extra row is real, unconditional, and documented by
 * upstream as wasteful in hex mode — transcribed as written, not tidied into a hex check.
 *
 * ## `bemalbar()` is not `korrekt()`
 *
 * A *reachable* address is not necessarily *paintable*. The semiglobal and the global blob are
 * both perfectly readable, and both refuse to be drawn on — `bemalbar()` is false for
 * `absort_semiglobal`, `absort_global` and `absort_nirgends`, and true for `absort_feld`,
 * `absort_fall`, `absort_info` and the `absort_bemalbar` dummy. So `* @@(1,2)` throws
 * "Drawing is not allowed at the moment." while `* @@(1,2)`'s read works, and the same goes
 * for `@()`.
 *
 * ## The quarter is two independent pairs of bits
 *
 *     if (k & viertel_qr) srcr.x += gric/2;   // 1: which half of the *icon*
 *     if (k & viertel_qu) srcr.y += gric/2;   // 2:
 *     if (k & viertel_zr) xx    += gric/2;    // 4: which half of the *cell*
 *     if (k & viertel_zu) yy    += gric/2;    // 8:
 *     srcr.w = srcr.h = gric/2;
 *
 * Low two bits pick the source quarter, high two the destination quarter, and they are
 * independent — `Q_TR_TL` (1) takes the icon's top-right quarter and puts it in the cell's
 * top-left, which is not the same picture as either corner at full size. The constant names
 * spell out exactly that: `Q_<source>_<target>`, and the two-letter `Q_TR` is just
 * `Q_TR_TR` = 5. That is why the corners of the two-letter row are 0, 5, 10, 15 rather than
 * 0, 1, 2, 3.
 */

import type { ResolvedOrt } from "./access.ts";
import type { AccessField } from "./access.ts";

/** `viertel_alle`: draw the whole icon, and the only value that skips the clipping. */
export const VIERTEL_ALLE = -1;
export const VIERTEL_MIN = -1;
export const VIERTEL_MAX = 15;
/** Which half of the *icon* to take: right, up. */
export const VIERTEL_QR = 1;
export const VIERTEL_QU = 2;
/** Which half of the *cell* to fill: right, up. */
export const VIERTEL_ZR = 4;
export const VIERTEL_ZU = 8;

/** One picture queued for drawing, as `BildStapel`'s entry holds it. */
export interface DrawnPicture {
  /** The kind whose image file the entry names. */
  readonly kind: number;
  /** `spezvar_file`. */
  readonly file: number;
  /** `spezvar_pos`: which icon within the file. */
  readonly pos: number;
  /** `spezvar_quarter`. */
  readonly quarter: number;
  /** `ebene`: +1 for `* ort`, -1 for `ort *`, 0 for a plain `*`. */
  readonly level: number;
}

/**
 * `malBildchen`'s clipping, as source rectangle and destination offset.
 *
 * `gric` is the icon grid size in pixels. The two offsets are separate because they answer
 * different questions: which quarter of the icon to read, and where in the cell to put it.
 */
export interface QuarterClip {
  /** The rectangle to read from the image file, relative to the icon's own cell. */
  readonly source: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Where to put it, relative to the destination cell's top-left. */
  readonly target: { readonly dx: number; readonly dy: number };
}

/**
 * `Bilddatei::malBildchen`'s quarter branch.
 *
 * `k != viertel_alle` narrows the source to a quarter *and* moves the destination, both by
 * `gric/2`. Anything but -1 and 0..15 is rejected upstream before this point.
 */
export function clipQuarter(quarter: number, gric: number): QuarterClip {
  if (quarter === VIERTEL_ALLE) {
    return { source: { x: 0, y: 0, w: gric, h: gric }, target: { dx: 0, dy: 0 } };
  }
  const half = gric / 2;
  return {
    source: {
      x: quarter & VIERTEL_QR ? half : 0,
      y: quarter & VIERTEL_QU ? half : 0,
      w: half,
      h: half,
    },
    target: {
      dx: quarter & VIERTEL_ZR ? half : 0,
      dy: quarter & VIERTEL_ZU ? half : 0,
    },
  };
}

/** `ort_absolut::korrekt(willNurMalen = true)`: may this address be *drawn on*? */
export function canDrawAt(field: AccessField, resolved: ResolvedOrt): boolean {
  switch (resolved.kind) {
    case "global":
      return true;
    case "cell":
      // `koordMalOK`, not `koordOK`: one row further than the field, for the hex edge blobs.
      return (
        rightOk(field, resolved.right) &&
        resolved.x >= 0 &&
        resolved.x < field.width &&
        resolved.y >= 0 &&
        resolved.y < field.height + 1
      );
    case "semiglobal":
      return rightOk(field, resolved.right) && field.semiglobal(resolved.right) !== null;
    case "fall":
      return (
        rightOk(field, resolved.right) &&
        (resolved.x & 1) === resolved.x &&
        resolved.y >= 0 &&
        resolved.y <= 1 &&
        (resolved.y > 0 || resolved.x < field.fallCount)
      );
    default:
      return false;
  }
}

/**
 * `ort_absolut::bemalbar`: does this kind of place have a screen position at all?
 *
 * Takes only the `kind`, because the question is asked of two different shapes — a resolved
 * address, and the asking blob's own `mOrt` — and upstream's answer does not depend on which.
 */
export function isPaintable(place: { readonly kind: string }): boolean {
  // `absort_feld`, `absort_fall` and `absort_info` are true, along with the `absort_bemalbar`
  // dummy that "should not occur here anyway". `absort_semiglobal`, `absort_global` and
  // `absort_nirgends` are false.
  return place.kind === "cell" || place.kind === "fall" || place.kind === "info";
}

function rightOk(field: AccessField, right: boolean): boolean {
  return !right || field.players > 1;
}

/** What `PictureStack.add` needs to know about the level's image files. */
export interface PictureSource {
  /** `so->getBilddatei(dat)->anzBildchen()`: how many icons `file` holds for `kind`. */
  pictureCount(kind: number, file: number): number;
  /** `mMaxAnz`, the per-blob picture budget. */
  readonly maxPictures: number;
}

/**
 * `BildStapel` as far as Cual can reach it: an ordered list of pictures to draw.
 *
 * The three range checks are upstream's and all three throw, because a picture with a bad
 * `pos` would blit whatever happens to be in the image file at that offset — a silently wrong
 * picture rather than an error.
 */
export class PictureStack {
  #entries: DrawnPicture[] = [];

  /** The pictures queued so far, in draw order. `BildStapel` draws back to front. */
  get entries(): readonly DrawnPicture[] {
    return this.#entries;
  }

  /** `BildStapel::leere`, called at the start of each draw. */
  clear(): void {
    this.#entries = [];
  }

  /** `BildStapel::speichereBild`. */
  add(entry: DrawnPicture, source: PictureSource): void {
    if (this.#entries.length >= source.maxPictures) {
      throw new Error("Cual: too many pictures drawn for one single blob");
    }
    const available = source.pictureCount(entry.kind, entry.file);
    if (entry.pos < 0 || entry.pos >= available) {
      throw new Error(
        `Cual: position pos=${entry.pos} out of range (allowed for file=${entry.file}: 0 - ${available - 1})`,
      );
    }
    if (entry.quarter < VIERTEL_MIN || entry.quarter > VIERTEL_MAX) {
      throw new Error(
        `Cual: quarter qu=${entry.quarter} out of range (allowed: ${VIERTEL_MIN} - ${VIERTEL_MAX})`,
      );
    }
    this.#entries = [...this.#entries, entry];
  }
}

/** What the walker needs in order to run the three draw statements. */
export interface DrawContext {
  /** `mMalenErlaubt`: set only around the draw event, so a draw elsewhere throws. */
  readonly drawingAllowed: boolean;
  /** `mDaten[spezvar_file]`, `spezvar_pos` and `spezvar_quarter` of the *asking* blob. */
  readonly picture: { readonly file: number; readonly pos: number; readonly quarter: number };
  /** `getSorte()` of the asking blob — the *kind* the entry names, even for a foreign draw. */
  readonly kind: number;
  /** The board. */
  readonly field: AccessField;
  /**
   * The asking blob's own `mOrt`, for `bemalbar()`.
   *
   * Only the kind is needed, and it is deliberately not a `ResolvedOrt`: `mOrt` is the
   * *unresolved* absolute position the blob lives at, which for a blob on a cell is the same
   * thing and for the global blob is a different type entirely.
   */
  readonly here: { readonly kind: string };
  /** `PictureSource` for the range checks. */
  readonly source: PictureSource;
}