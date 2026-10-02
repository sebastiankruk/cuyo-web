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
  | { readonly kind: "cell"; readonly x: number; readonly y: number }
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
  /** `getVariableVergangenheit(spezvar_am_platzen)` — slot 13, the shadow read. */
  readonly exploding: number;
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
      // Throws upstream for the global and semiglobal blobs: they have no left or right.
      if (position.kind === "global" || position.kind === "semiglobal") {
        throw new Error("Cual: `loc_p` is not defined for the global or semiglobal blob");
      }
      // `return mOrt.rechts ? 2 : 1;`
      return position.kind === "fall" && position.right ? 2 : 1;
    case "loc_x":
    case "loc_y":
      // Only answered here for a blob actually on a cell; `break` otherwise.
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

  // A falling piece's own coordinates come from `pos_fall`'s half-cell geometry, not from its
  // cell: `Fall::getX` delegates to `mPos.getX(a)`, and `getXX`/`getYY` index a digit table by
  // rotation and add trigonometric offsets. That is the fall simulation's own geometry, and
  // it is refused here rather than approximated with the cell coordinates — the approximation
  // would differ by half a cell for every rotated fall, and the default of -1 would be a
  // silent wrong answer rather than an absent one.
  if (position.kind === "fall") {
    throw new Error(
      `Cual: '${name}' of a falling piece needs pos_fall's half-cell geometry, which is not written yet`,
    );
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
