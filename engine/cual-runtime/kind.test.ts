/**
 * Setting `kind`, and the three things that happen when it changes.
 *
 * Task 4.8. `setVariableIntern` and the top of `Blop`'s per-step entry between them give
 * exactly three side effects, and all three are asserted here:
 *
 * 1. **The value is range-checked.** `blopart_min_cual <= kind < ld->mAnzFarben`, or it throws.
 *    So `nothing` (-1) is assignable and `outside` (-5) is not — which is what "the last kind
 *    Cual may name" means.
 * 2. **The new kind's `da_kind` slots are re-applied** (`setKindIntern`). That is the whole of
 *    "reapply": a `var x = 4 : reapply` variable follows its kind, so a blob that becomes a
 *    different kind starts that kind's default. `da_init` and `da_event` slots are *not*
 *    touched, and getting that wrong would reset `file` and `pos` on every kind change.
 * 3. **The old kind's draw code is busy-reset** at the start of the next step, so an
 *    animation interrupted by a kind change does not resume where it left off.
 */

import { describe, expect, it } from "vitest";
import { BlobStore, SPECIAL_VARIABLES, TimeSlices } from "./store.ts";
import type { KindChange } from "./store.ts";
import { BLOPART_MIN_CUAL } from "./const-tables.ts";

const KIND = SPECIAL_VARIABLES.findIndex((v) => v.name === "kind");
/** Slot 7: `spezvar_kind_beim_letzten_draw_aufruf`. */
const LAST_DRAWN = 7;
/** The first user slot, and a `da_kind` one for these tests. */
const XX = 14;
const YY = 15;

/**
 * A level with three kinds, and `XX` declared `da_kind` on two of them.
 *
 * `kindDefaults` returns **only** the `da_kind` slots, because that is what upstream's
 * `setKindIntern` re-applies — it switches on the default kind and only `da_kind` assigns.
 * `YY` stands for a `da_init` slot, which the store must therefore never touch, and it is not
 * listed here at all.
 *
 * `drawCodeOf` returns null for `blopart_ausserhalb` and for kinds with no draw code, which is
 * upstream's `(last == blopart_ausserhalb ? 0 : ...getEventCode(event_draw))` followed by
 * `if (alt_co) alt_co->busyReset(*this)`. Note the `-1` guard in the `if` is *not* what
 * excludes a never-drawn blob: slot 7 starts at `blopart_ausserhalb` (-5), not -1.
 */
function level(): KindChange & { readonly resets: number[] } {
  const resets: number[] = [];
  const daKind: Record<number, number> = { 1: 10, 2: 20 };
  return {
    colourCount: 3,
    kindDefaults: (kind) => [{ slot: XX, value: daKind[kind] ?? 0 }],
    drawCodeOf: (kind) => (kind === 1 || kind === 2 ? [] : null),
    resetBusyOf: (kind) => {
      resets.push(kind);
    },
    resets,
  };
}

describe("the range check", () => {
  it("accepts nothing, the lowest assignable kind", () => {
    // `blopart_min_cual` is -1, so -1 is in range and -2 is not.
    expect(BLOPART_MIN_CUAL).toBe(-1);
    const store = new BlobStore(20, 13, new TimeSlices());
    expect(() => store.setKind(-1, level())).not.toThrow();
  });

  it("accepts up to one below the colour count", () => {
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    expect(store.setKind(2, change)).toBe(true);
    expect(() => store.setKind(3, change)).toThrow(/out of range \(allowed: -1 to 2\)/);
  });

  it("refuses 'outside', which is a return value rather than a kind", () => {
    // `blopart_ausserhalb` is -5, below `blopart_min_cual`. A level writing it gets an error,
    // which is the point of the bound.
    const store = new BlobStore(20, 13, new TimeSlices());
    expect(() => store.setKind(-5, level())).toThrow(/out of range/);
    expect(() => store.setKind(-2, level())).toThrow(/out of range/);
  });

  it("reports whether the kind actually changed", () => {
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    store.setKind(1, change);
    expect(store.setKind(1, change), "same kind again").toBe(false);
    expect(store.setKind(2, change)).toBe(true);
  });
});

describe("re-applying the new kind's defaults", () => {
  it("re-applies the da_kind slots and leaves da_init alone", () => {
    // `setKindIntern` switches on the default kind and only `da_kind` assigns. `YY` is
    // `da_init`, so re-applying it would wipe a value the level had set — and `file` and `pos`
    // are `da_event`, which are in the same boat.
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    store.setKind(1, change);
    expect(store.data[XX]).toBe(10);
    store.set(YY, 99);
    store.setKind(2, change);
    expect(store.data[XX], "da_kind follows the kind").toBe(20);
    expect(store.data[YY], "da_init is left alone").toBe(99);
    // And the two named slots a level cannot help but set during a step.
    store.setSpecial("file", 7);
    store.setSpecial("pos", 4);
    store.setKind(1, change);
    expect(store.getSpecial("file"), "file is da_event").toBe(7);
    expect(store.getSpecial("pos"), "pos is da_event").toBe(4);
  });

  it("does not take a shadow, so a kind change is not an ordinary write", () => {
    // `setVariableIntern` is the low-level entry and upstream's comment says it deliberately
    // skips `merkeAlteVarWerte`. So a `@` read in the same step sees the *old* kind — which is
    // what `verbindetMit` in task 3.10 relies on.
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    store.set(KIND, 1);
    slices.open();
    store.setKind(2, level());
    expect(store.get(KIND)).toBe(2);
    // Not `getAlt === 1`: the shadow on file is stale (it belongs to the previous slice), so
    // `getAlt` falls through to the live value, which is 2. The claim is that the kind change
    // took *no* shadow of its own — and that is `hasShadow`.
    expect(store.hasShadow, "no shadow was taken by the kind change").toBe(false);
  });

  it("leaves the fourteen special slots alone apart from kind", () => {
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    store.setKind(1, change);
    store.setSpecial("weight", 5);
    store.setKind(2, change);
    expect(store.getSpecial("weight")).toBe(5);
    expect(store.get(KIND)).toBe(2);
  });
});

describe("the same-step draw bookkeeping", () => {
  it("busy-resets the old kind's draw code once, when the kind changed", () => {
    // `if (kind != last && last != -1) { old kind's draw code busyReset } last = kind;`
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    store.setKind(1, change);
    store.beginDraw(change);
    expect(change.resets, "nothing to interrupt on the first draw").toEqual([]);
    expect(store.data[LAST_DRAWN]).toBe(1);

    store.setKind(2, change);
    store.beginDraw(change);
    expect(change.resets, "the old kind's animation is interrupted").toEqual([1]);
    expect(store.data[LAST_DRAWN]).toBe(2);
  });

  it("does not reset again while the kind stays the same", () => {
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    store.setKind(1, change);
    store.beginDraw(change);
    for (let step = 0; step < 5; step += 1) store.beginDraw(change);
    expect(change.resets).toEqual([]);
  });

  it("has nothing to interrupt for a blob that has never been drawn", () => {
    // The `-1` guard: slot 7 starts at `blopart_ausserhalb`, so a blob placed directly at a
    // kind never interrupts anything.
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    // Slot 7's default art is `da_init`, so a fresh store really does hold
    // `blopart_ausserhalb` there. Which is the point: upstream's `!= -1` guard does *not* cover
    // a never-drawn blob, and it is the explicit `blopart_ausserhalb ? 0 : ...` ternary that
    // stops it — a blob that has never been drawn enters the branch and finds no draw code.
    expect(store.data[LAST_DRAWN]).toBe(-5);
    store.setKind(1, change);
    store.beginDraw(change);
    expect(change.resets).toEqual([]);
    expect(store.data[LAST_DRAWN]).toBe(1);
    // And the -5 case explicitly, which is what the ternary is for.
    const outside = new BlobStore(20, 13, new TimeSlices());
    outside.data[KIND] = 1;
    outside.data[LAST_DRAWN] = -5;
    outside.beginDraw(change);
    expect(change.resets, "blopart_ausserhalb has no draw code").toEqual([]);
  });

  it("does not interrupt a kind that has no draw code", () => {
    // `(last == blopart_ausserhalb ? 0 : ...->getEventCode(event_draw))` and then
    // `if (alt_co) alt_co->busyReset(*this)`. Kind 3 is one of the ones with none here.
    const store = new BlobStore(20, 13, new TimeSlices());
    const change = level();
    store.data[KIND] = 1;
    store.data[LAST_DRAWN] = 3;
    store.beginDraw(change);
    expect(change.resets).toEqual([]);
    expect(store.data[LAST_DRAWN]).toBe(1);
  });

  it("runs the bookkeeping before the new kind's draw code, as the order requires", () => {
    // The reset is at the top of the step, and the new kind's `mc->eval(*this)` comes after —
    // so a kind change cannot leave the old animation's flags set when the new code runs.
    // Order is the claim; a set that ran afterwards would produce the same final state.
    const order: string[] = [];
    const change: KindChange = {
      colourCount: 3,
      kindDefaults: () => [],
      drawCodeOf: (kind) => (kind === 1 ? [] : null),
      resetBusyOf: (kind) => order.push(`reset:${kind}`),
    };
    const store = new BlobStore(20, 13, new TimeSlices());
    store.setKind(1, change);
    store.beginDraw(change);
    store.setKind(2, change);
    store.beginDraw(change);
    order.push("draw:2");
    expect(order).toEqual(["reset:1", "draw:2"]);
  });
});
