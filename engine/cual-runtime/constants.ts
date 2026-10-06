// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
import { BLOBART_AUSSERHALB } from "./store.ts";

/**
 * The read-only constants: `time`, `turn`, `size`, `basekind`, `loc_*`, `falling`, `players`,
 * `exploding`, `informational`.
 *
 * Task 4.5. Upstream does not answer these from one place, which is the whole difficulty. The
 * name resolves to a *negative* variable number (`spezconst_turn` is -1, `spezconst_info` is
 * -15), and the answer comes from a three-step chain:
 *
 *     Blop::getSpezConst  -  the blob's own facts
 *       ↓ not answered here
 *     BlopBesitzer::getSpezConst  -  a falling piece, or the board
 *       ↓ returned spezconst_defaultwert ("I don't know")
 *     spezconst_default[-vnr - 1]
 *
 * The owner's answer *overrides* the blob's, and the default is the last resort rather than a
 * per-blob initialiser. That ordering matters: a falling piece reports `falling` as 1 even
 * though the default is 0, and reports `turn` as `"0211"[mExtraDreh]` even though the default
 * is 0.
 *
 * `connect` is in the table because it is one of the fifteen, but it is not answered here —
 * it is the neighbour bitmask, and task 3.10 has it.
 */

/** `spezconst_anz` in `blop.h`. */
export const READ_ONLY_CONSTANT_COUNT = 15;

/**
 * `spezconst_namen` and `spezconst_default` from `knoten.cpp`, in number order.
 *
 * `number` is `spezconst_anz`'s negative numbering: -1 is `turn`, -15 is `informational`, and
 * the default is looked up at `-number - 1`. Kept as the numbers rather than as indices
 * because the numbering is what the parser's `spezconst_*` constants mean.
 */
export const READ_ONLY_CONSTANTS: readonly {
  readonly name: string;
  readonly number: number;
  readonly defaultValue: number;
}[] = [
  { name: "turn", number: -1, defaultValue: 0 },
  { name: "connect", number: -2, defaultValue: 0 },
  { name: "falling", number: -3, defaultValue: 0 },
  { name: "size", number: -4, defaultValue: 0 },
  { name: "loc_x", number: -5, defaultValue: -1 },
  { name: "loc_y", number: -6, defaultValue: -1 },
  { name: "loc_p", number: -7, defaultValue: 0 },
  { name: "players", number: -8, defaultValue: 0 },
  { name: "falling_fast", number: -9, defaultValue: 0 },
  { name: "exploding", number: -10, defaultValue: 0 },
  { name: "loc_xx", number: -11, defaultValue: -1 },
  { name: "loc_yy", number: -12, defaultValue: -1 },
  { name: "basekind", number: -13, defaultValue: BLOBART_AUSSERHALB },
  { name: "time", number: -14, defaultValue: 0 },
  { name: "informational", number: -15, defaultValue: 0 },
];

const BY_NAME: ReadonlyMap<string, (typeof READ_ONLY_CONSTANTS)[number]> = new Map(
  READ_ONLY_CONSTANTS.map((constant) => [constant.name, constant]),
);

/** Whether a name is one of the read-only constants. */
export function isReadOnlyConstant(name: string): boolean {
  return BY_NAME.has(name);
}

/** Where a blob is, in the terms `absort_*` uses. Which answer a constant gets depends on it. */
export type BlobPosition =
  /** `absort_feld`: a cell on the board. */
  | {
      readonly kind: "cell";
      readonly x: number;
      readonly y: number;
      /**
       * `mOrt.rechts` — **and a cell blob has one**, which this did not until 5.20.
       *
       * `absort_feld` carries `rechts` exactly as `absort_fall` does; it says which of the two
       * fields the blob is on, and `loc_p` is `return mOrt.rechts ? 2 : 1;` with no `art` test at
       * all. Without it here, `loc_p` could only be answered for a falling piece, and a blob
       * standing on the right-hand field of a two-player game reported 1.
       */
      readonly right: boolean;
    }
  /**
   * `absort_fall`: between cells. `right` is `mOrt.rechts`, which `loc_p` reports and which
   * decides which of the fall's two blobs is asking — `Fall::getSpezConst` reads
   * `wer->getOrt().x == 1`.
   */
  | { readonly kind: "fall"; readonly x: number; readonly y: number; readonly right: boolean }
  /** `absort_global`: the global blob. `loc_p` throws for this one. */
  | { readonly kind: "global" }
  /** `absort_semiglobal`: the per-player blob. `loc_p` throws for this one too. */
  | { readonly kind: "semiglobal" }
  /** `absort_info`: the informational blob. `informational` is true for this. */
  | { readonly kind: "info" }
  /** `absort_nirgends`: nowhere. Nothing on the board. */
  | { readonly kind: "nowhere" };

/** The world a blob reads its constants out of. */
export interface ConstantWorld {
  /** `grx`: the field's width in cells. Needed for the mirrored `loc_x`. */
  readonly width: number;
  /** `gry`: the field's height in cells. Needed for the mirrored `loc_y`. */
  readonly height: number;
  /** `ld->mSpielerZahl`. */
  readonly players: number;
  /** `Cuyo::getSpielfeld(false)->getZeit()`. */
  readonly time: number;
  /** `ld->mSpiegeln`: the level is mirrored. */
  readonly mirrored: boolean;
  /** `gric`: a row's height in pixels, from configuration. */
  readonly rowHeight: number;
  /** `mHochVerschiebung`: how far the field is scrolled, in pixels. */
  readonly verticalScroll: number;
  /** `getHexShift(x)`, which column `x`'s diagonal neighbours are offset in. */
  readonly hexShift: (x: number) => boolean;
}

/** What is asking, and what it knows about itself. */
export interface ConstantSubject {
  readonly position: BlobPosition;
  readonly world: ConstantWorld;
  /** `mKettenGroesse`: the size of the chain this blob belongs to. */
  readonly chainSize: number;
  /**
   * `getSorte(vergangenheit)->getBasekind()`.
   *
   * From the *beginning of the step*, like `verbindetMit` in 3.10 — `vergangenheit` is
   * `getVariableVergangenheit`, the shadow. A blob that changed kind this step still reports
   * the old basekind.
   */
  readonly baseKind: number;
  /**
   * The falling piece's own state, or null for anything not falling.
   *
   * `mExtraDreh` and `mSchnell`. Only a fall answers `turn`, `falling` and `falling_fast`; a
   * blob standing on a cell reports the defaults for all three, which is why `falling` reads
   * 0 for a stationary blob and not "false by another route".
   */
  readonly fall: { readonly extraTurn: number; readonly fast: boolean } | null;
  /**
   * **Which of the piece's two blobs is asking** — upstream's `absort_fall(rechts, 0)` or
   * `absort_fall(rechts, 1)`, the `a` in `FallPos::getX(a)`.
   *
   * Separate from {@link position}, whose `x` for a fall is the *absolute* column — that is what
   * `@(x,y)` against a falling blob means, and the two differ: a horizontal piece at column 3 has
   * its second blob at column 4 with `a == 1`, while `getX(1)` is `3 + 1`.
   */
  readonly fallIndex: number;
  /** `getVariableVergangenheit(spezvar_am_platzen)` — slot 13, the shadow read. */
  readonly exploding: number;
  /**
   * The four coordinates of a **falling** blob, and absent for anything else.
   *
   * Computed by the caller rather than asked for here, because the arithmetic is the fall
   * simulation's own — `FallPos::getX/getY` and `Fall::getXX/getYY`, half-cell trigonometry for a
   * hexagonal grid — and `cual-runtime` must not know about `engine/game-core`. Four numbers
   * rather than a callback, because `readConstant` never asks about a *different* blob: every
   * question here is about the one whose code is running, which is why the caller's answer is
   * enough and a general interface would not be.
   *
   * `cellX`/`cellY` are in cells, `pixelX`/`pixelY` in pixels, which is the same split as
   * `loc_x`/`loc_y` against `loc_xx`/`loc_yy` and for the same reason: upstream's `getXX` is
   * "where is the picture drawn" and `getX` is "which cell is it over".
   */
  readonly fallCoordinates?: FallCoordinates;
}

/** The four coordinates of a falling blob, from `fall-geometry.ts`. */
export interface FallCoordinates {
  readonly cellX: number;
  readonly cellY: number;
  readonly pixelX: number;
  readonly pixelY: number;
}

/**
 * `Spielfeld::getFeldKoord`: a cell's pixel position.
 *
 * `xx = x * gric; yy = y * gric - mHochVerschiebung - getHexShift(x) * gric / 2;`
 *
 * So `loc_xx` and `loc_yy` are **pixels**, not cells, and include the vertical scroll. That
 * looks wrong for a scripting constant and is probably not: `aliens.ld` compares a blob's
 * `loc_xx` with a neighbour's (`loc_xx == loc_xx@@(0)`), which works for any consistent
 * coordinate. Asserted here against the formula rather than against a nice number.
 */
export function cellPixel(
  world: ConstantWorld,
  x: number,
  y: number,
): { readonly xx: number; readonly yy: number } {
  return {
    xx: x * world.rowHeight,
    yy: y * world.rowHeight - world.verticalScroll - (world.hexShift(x) ? world.rowHeight / 2 : 0),
  };
}

/**
 * Read a read-only constant, or return null if the name is not one.
 *
 * Null rather than a throw, because the caller has to fall through to the *user* variables and
 * a level may name one of these in a `var` declaration. Upstream keeps them in one namespace
 * with `VarDefinition`, so redeclaration is possible there too.
 */
export function readConstant(name: string, subject: ConstantSubject): number | null {
  const constant = BY_NAME.get(name);
  if (!constant) return null;

  // `connect` is answered by the neighbour bitmask, which is task 3.10's `connectionsAt`.
  // Refused rather than approximated: returning the default 0 would make every neighbour
  // pattern false.
  if (name === "connect") {
    throw new Error("Cual: `connect` is the neighbour bitmask; use connectionsAt (task 3.10)");
  }

  const { position, world } = subject;

  // `Blop::getSpezConst` — the blob's own facts. Each case that cannot answer falls through by
  // `break`, which is how a fall or the board gets to answer instead.
  switch (name) {
    case "size":
      return subject.chainSize;
    case "players":
      return world.players;
    case "time":
      return world.time;
    case "exploding":
      // `getVariableVergangenheit(spezvar_am_platzen)` — the shadow, not the live value.
      return subject.exploding;
    case "basekind":
      return subject.baseKind;
    case "informational":
      // `mOrt.art == absort_info || (mOrt.art == absort_fall && mOrt.y)`
      return position.kind === "info" || (position.kind === "fall" && position.y !== 0) ? 1 : 0;
    case "loc_p":
      // Upstream throws for the global, semiglobal **and nowhere** blobs: they have no left or
      // right. `absort_nirgends` was missing here and is with them now.
      if (position.kind === "global" || position.kind === "semiglobal" || position.kind === "nowhere") {
        throw new Error(
          `Cual: 'loc_p' is not defined for the global, semiglobal or nowhere blob`,
        );
      }
      // `return mOrt.rechts ? 2 : 1;`
      //
      // **Every** place with an `Ort` that has a `rechts`, which is a cell and a fall — so the
      // check belongs *above* this line, where the three that have none are refused. This read
      // `position.kind === "fall" && position.right` until 5.20 checked it, so a blob standing
      // on the **right-hand field of a two-player game** reported 1.
      //
      // `absort_info` is the one left: it has no side of its own, so its `mOrt.rechts` is false.
      if (position.kind === "cell" || position.kind === "fall") {
        return position.right ? 2 : 1;
      }
      return 1;
    case "loc_x":
    case "loc_y":
      // **A falling blob goes through the fall's own geometry**, not the board's. `getX`/`getY`
      // delegate to `FallPos`, whose `getY` divides a *pixel* row by `gric` and whose two blobs
      // can be in different rows for a horizontal piece on a hex board. Approximating with the
      // cell coordinates would be half a row out for every rotated piece, so this used to throw.
      //
      // Asked for as a closure rather than an interface, because `engine/` must not be imported
      // here (a layer rule: `cual-runtime` knows nothing about the board), and the fall's
      // geometry is genuinely a *fall* concern — `fall-geometry.ts` owns it.
      if (position.kind === "fall") {
        const at = subject.fallCoordinates;
        // `absort_nirgends` upstream throws; the default of -1 is this table's own default for a
        // coordinate it cannot place, and a fall with no geometry is a wiring gap rather than a
        // thing the level did wrong.
        if (at === undefined) break;
        return name === "loc_x" ? at.cellX : at.cellY;
      }
      if (position.kind === "cell") {
        // `ld->mSpiegeln ? grx - 1 - mOrt.x : mOrt.x`
        return name === "loc_x"
          ? world.mirrored
            ? world.width - 1 - position.x
            : position.x
          : world.mirrored
            ? world.height - 1 - position.y
            : position.y;
      }
      break;
    default:
      break;
  }

  // `Fall::getSpezConst` — a falling piece, or nothing.
  if (subject.fall) {
    switch (name) {
      case "falling":
        // `return 1;`
        return 1;
      case "falling_fast":
        // `return mSchnell;`
        return subject.fall.fast ? 1 : 0;
      case "turn":
        // `return "0211"[mExtraDreh] - '0';`
        //
        // Upstream flags this as a latent bug beside it: the assert was once `mExtraDreh < 3`,
        // the table has four entries, and the assertion was violated non-reproducibly at the
        // first image build before the game but not in the first game. So the fourth quarter is
        // reachable and reads as the digit 1. Transcribed as the table, not as the assert.
        return "0211".charCodeAt(subject.fall.extraTurn) - "0".charCodeAt(0);
      default:
        break;
    }
  }

  // `loc_xx` and `loc_yy` for a falling piece, from the same supplied geometry as `loc_x`/`loc_y`
  // above. `getXX`/`getYY` add a rotation offset from a digit table and `gric * sin(30°)`, which is
  // `fall-geometry.ts`'s — and `getXX` genuinely differs from `getX`, so falling back to the cell
  // coordinates here would be a silent wrong answer rather than an absent one. **Still refused**
  // when the caller supplied nothing, because that is a wiring gap and not something the level did.
  if (position.kind === "fall") {
    const at = subject.fallCoordinates;
    if (at === undefined) {
      throw new Error(
        `Cual: '${name}' of a falling piece needs pos_fall's half-cell geometry, which this ` +
          `caller did not supply. Build the coordinates with engine/game-core/fall-geometry.ts.`,
      );
    }
    return name === "loc_xx" ? at.pixelX : at.pixelY;
  }

  // `BlopGitter::getSpezConst` — the board, for the half-cell coordinates.
  if (name === "loc_xx" || name === "loc_yy") {
    if (position.kind === "cell") {
      const { xx, yy } = cellPixel(world, position.x, position.y);
      return name === "loc_xx" ? xx : yy;
    }
  }
  if (position.kind === "cell" && (name === "loc_x" || name === "loc_y")) {
    return name === "loc_x" ? position.x : position.y;
  }

  // `spezconst_default[-vnr - 1]`
  return constant.defaultValue;
}
