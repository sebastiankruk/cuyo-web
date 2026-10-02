/**
 * Addressed access: `@@(x,y)`, `@@(x)`, `@@()`, `@(dx,dy)`, `@(dx)`, `@()`.
 *
 * Task 4.7, and the rule that decides every read and write is two lines of `Blop`:
 *
 *     int  Blop::getVariable(const Variable & v) {
 *       if (v.Ort_hier()) return getVariable(v.getNummer());
 *       else {
 *         ort_absolut ziel = v.getOrt(mOrt, *this);
 *         if (ziel.korrekt()) return ziel.finde().getVariableVergangenheit(v.getNummer());
 *         else return v.getDefaultWert();          // out of range: the variable's default
 *       }
 *     }
 *
 *     void Blop::setVariable(const Variable & v, int wert, int op) {
 *       if (v.getNummer() < 0) throw Fehler("The variable \"%s\" is read-only.", ...);
 *       if (v.Ort_hier()) setVariable(v.getNummer(), wert, op);
 *       else {
 *         ort_absolut ziel = v.getOrt(mOrt, *this);
 *         if (ziel.korrekt()) ziel.finde().setVariableZukunft(v.getNummer(), wert, op);
 *       }                                          // out of range: nothing, and no error
 *     }
 *
 * Four consequences, each of which a level depends on:
 *
 * - **A read is the *target's* shadow.** `getVariableVergangenheit`, not `getVariable`, so
 *   `@` reads the beginning-of-step value of another blob.
 * - **Out of range reads the variable's declared default**, not the kind's. The comment says
 *   "den Default unabhängig von der Default-Art nehmen" - take the default regardless of the
 *   default-art. `cual.6` says the kind's default applies; the code says the variable's. The
 *   code is what runs, so the code is what this does, and the disagreement is noted rather
 *   than resolved by picking whichever reads better.
 * - **A write is deferred** (`setVariableZukunft`), which is task 3.9's queue.
 * - **Writing a read-only name throws.** `time`, `loc_x`, `turn` and the rest have negative
 *   numbers, so `time = 5` is an error rather than a silent no-op.
 *
 * ## `@(0,0)` is not "here"
 *
 * `Ort_hier()` is true when the variable carries *no* address at all. `@(0,0)` is an address,
 * so it resolves to the asking blob's own cell and takes the foreign path — which is exactly
 * why `cual.6` can say "This is also true if a blob accesses its own variables with `@(0,0)`":
 * it reads its own beginning-of-step value, not its live one. Confusing the two would make
 * `x = x@(0,0) + 1` see the write it just made.
 *
 * ## The spelling carries the meaning
 *
 * The *same* `Ort` shape means different things per spelling, because `relort` and `absort`
 * are separate productions:
 *
 * | written | meaning |
 * |---|---|
 * | `@(x,y)` | cell **relative** to the asking blob |
 * | `@@(x,y)` | cell **absolute** |
 * | `@(x)` / `@x` | the falling-relative form |
 * | `@@(x)` / `@@x` | `absort_fall`, one argument |
 * | `@` / `@()` | the **global** blob |
 * | `@@` / `@@()` | the **semiglobal** blob |
 *
 * So the empty parenthesised address is the global blob with `@` and the semiglobal with `@@`.
 * That is not a typo to be tidied; it is what the two empty productions say.
 */

import type { Expr, Ort } from "./expr.ts";
import type { AssignOperator } from "./code.ts";
import type { BlobStore, TimeSlices } from "./store.ts";

/** Where the asking blob is. Which resolution is legal depends on it. */
export type Here =
  | { readonly kind: "cell"; readonly x: number; readonly y: number; readonly right: boolean }
  | { readonly kind: "fall"; readonly x: number; readonly y: number; readonly right: boolean }
  | { readonly kind: "global" }
  | { readonly kind: "semiglobal"; readonly right: boolean }
  /** `absort_info`. `korrekt` returns false for it - upstream says so and admits it is a guess. */
  | { readonly kind: "info" };

/** The board, as addressed access sees it. */
export interface AccessField {
  /** `Cuyo::getSpielerZahl()`, which `rechts_ok` asks. */
  readonly players: number;
  /** `ld->mSechseck`. */
  readonly hex: boolean;
  /** `ld->mSpiegeln`. */
  readonly mirrored: boolean;
  /** `ld->getHexShift(rechts, x)`, on the *from* column. */
  readonly hexShift: (right: boolean, x: number) => boolean;
  /**
   * `absort_global`'s target.
   *
   * Always correct: `korrekt` returns `true` for `absort_global` unconditionally, so the
   * global blob is the one address that cannot be out of range.
   */
  readonly global: BlobStore;
  /** The semiglobal for a side, or null when that side has none. */
  semiglobal(right: boolean): BlobStore | null;
  /** The blob at a cell on a side, or null when the coordinates are off the board. */
  at(right: boolean, x: number, y: number): BlobStore | null;
  /** `getSpielfeld(rechts)->getFallAnz()`, for the fall's validity check. */
  readonly fallCount: number;
  /** Where the asking blob is. */
  readonly here: Here;
}

/** An `absort_*`, as `Ort::berechne` produces it. */
export interface ResolvedOrt {
  readonly kind: "cell" | "fall" | "semiglobal" | "global" | "nowhere";
  readonly x: number;
  readonly y: number;
  readonly right: boolean;
}

/**
 * `inline bool rechts_ok(bool rechts) { return (!rechts) || (Cuyo::getSpielerZahl()>1); }`
 *
 * So "the right-hand field" only exists in a two-player game. A one-player level asking for
 * `@@(x,y;!)` resolves to the *left* field rather than failing — which is why the half
 * specifier cannot be treated as a flag.
 */
function rechtsOk(field: AccessField, right: boolean): boolean {
  return !right || field.players > 1;
}

/**
 * `berechne_rechts(vonhieraus.rechts, mHaelfte)`: the half specifier chooses a side.
 *
 * `=` keeps the side, `!` flips it, and `<`/`>` pick the left or right field directly. The
 * flip is XOR with "not the current side", so `!` on the left field is the right one.
 */
function sideWithHalf(field: AccessField, half: Half | null): boolean {
  const here = field.here;
  const right = here.kind === "cell" || here.kind === "fall" || here.kind === "semiglobal"
    ? here.right
    : false;
  switch (half) {
    case "here":
      return right;
    case "opposite":
      return !right;
    case "left":
      return false;
    case "right":
      return true;
    default:
      return right;
  }
}

/** `Half` from `expr.ts`, restated so this file does not import a type it only reads. */
type Half = "here" | "opposite" | "left" | "right";

/** Evaluates one expression node — the coordinate inside an address. */
export type Evaluate = (expr: Expr) => number;

/**
 * `Ort::berechne`: resolve an address against where the asking blob is.
 *
 * The two relative forms bail out with `absort_nirgends` unless the asking blob is in the
 * right *kind* of place — `@(x,y)` from a falling piece is `nirgends`, not a cell. That is
 * the whole of "relative to me": there is no falling-relative cell offset.
 */
export function resolveOrt(field: AccessField, ort: Ort, evaluateExpr: Evaluate): ResolvedOrt {
  const side = (half: Half | null): boolean => sideWithHalf(field, half);

  switch (ort.kind) {
    case "global":
      // `case absort_global: case absort_nirgends: return ort_absolut(mAbsArt, false, 0, 0);`
      // The global blob always belongs to the left player, whatever half was written.
      return { kind: "global", x: 0, y: 0, right: false };

    case "semiglobal":
      return { kind: "semiglobal", x: 0, y: 0, right: side(ort.half) };

    case "feld": {
      if (!ort.relative) {
        // `absort_feld`: both coordinates evaluated, absolute.
        return {
          kind: "cell",
          x: evaluateExpr(ort.x),
          y: evaluateExpr(ort.y),
          right: side(ort.half),
        };
      }
      // `ortart_relativ_feld`, and only from a blob that is on a cell.
      if (field.here.kind !== "cell") return { kind: "nowhere", x: 0, y: 0, right: false };
      const dx = evaluateExpr(ort.x);
      const dy = evaluateExpr(ort.y);
      const x = field.here.x + dx;
      // "Spiegeln für den Himmel-Level: the user gives y downwards; internally it is upwards."
      let y = field.here.y + (field.mirrored ? -dy : dy);
      // "Anpassung an die Hex-Koordinaten: internally, at odd dx relative coordinates are
      // stored so that dy = 0 means slightly diagonally up. That is right for the even
      // columns and the odd ones have to be shifted. If this field is hex-mirrored, `odd` is
      // replaced by `even`."
      if (field.hex) {
        const odd = field.mirrored ? (dx & 1) === 0 : (dx & 1) === 1;
        if (odd && field.hexShift(field.here.right, field.here.x)) y -= 1;
      }
      return { kind: "cell", x, y, right: side(ort.half) };
    }

    case "fall": {
      if (!ort.relative) {
        // `absort_fall`: `x = expr & 1, y = 0`.
        return {
          kind: "fall",
          x: evaluateExpr(ort.which) & 1,
          y: 0,
          right: side(ort.half),
        };
      }
      // `ortart_relativ_fall`, and only from a blob that is itself falling.
      if (field.here.kind !== "fall") return { kind: "nowhere", x: 0, y: 0, right: false };
      return {
        kind: "fall",
        x: (field.here.x + evaluateExpr(ort.which)) & 1,
        y: field.here.y,
        right: side(ort.half),
      };
    }

    default:
      return { kind: "nowhere", x: 0, y: 0, right: false };
  }
}

/**
 * `ort_absolut::korrekt` — may the target be used at all?
 *
 * `absort_info` and `absort_nirgends` are false. Upstream's comment on `absort_info` reads
 * "you cannot access info blobs from Cual code yet, so I assume returning false here is
 * right - Immi": a guess, marked as one, and transcribed as the guess rather than as an
 * opinion about what it ought to be.
 */
export function isReachable(field: AccessField, resolved: ResolvedOrt): boolean {
  switch (resolved.kind) {
    case "global":
      return true;
    case "cell":
      return rechtsOk(field, resolved.right) && field.at(resolved.right, resolved.x, resolved.y) !== null;
    case "semiglobal":
      return rechtsOk(field, resolved.right) && field.semiglobal(resolved.right) !== null;
    case "fall":
      // `(x==(x & 1)) && (y>=0) && (y<=1)` and, at `y == 0`, `x < getFallAnz()`.
      return (
        rechtsOk(field, resolved.right) &&
        (resolved.x & 1) === resolved.x &&
        resolved.y >= 0 &&
        resolved.y <= 1 &&
        (resolved.y > 0 || resolved.x < field.fallCount)
      );
    default:
      return false;
  }
}

/** The store a resolved address names, or null when it is unreachable. */
export function storeAt(field: AccessField, resolved: ResolvedOrt): BlobStore | null {
  if (!isReachable(field, resolved)) return null;
  switch (resolved.kind) {
    case "global":
      return field.global;
    case "cell":
      return field.at(resolved.right, resolved.x, resolved.y);
    case "semiglobal":
      return field.semiglobal(resolved.right);
    default:
      // A falling piece's two blobs are one store each; the fall simulation owns them.
      return null;
  }
}

/**
 * The read half: the target's *shadow*, or the variable's default when unreachable.
 *
 * `defaultValue` is the variable's own declared default, per the comment at the branch.
 */
export function readAddressed(
  field: AccessField,
  resolved: ResolvedOrt,
  slot: number,
  defaultValue: number,
): number {
  const store = storeAt(field, resolved);
  // Unreachable: the default, "independent of the default-art".
  if (store === null) return defaultValue;
  return store.getAlt(slot);
}

/**
 * The write half: deferred to the end of the step, or nothing at all when unreachable.
 *
 * Returns whether anything was queued, which is only for the tests — a caller that ignores
 * it behaves exactly as upstream, where the out-of-range branch simply does not call
 * `setVariableZukunft`.
 */
export function writeAddressed(
  field: AccessField,
  resolved: ResolvedOrt,
  slot: number,
  value: number,
  operation: AssignOperator,
  slices: TimeSlices,
): boolean {
  const store = storeAt(field, resolved);
  // Out of range: does nothing, and is not an error.
  if (store === null) return false;
  slices.defer(store, slot, value, operation);
  return true;
}
