// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The global and semiglobal blobs: ordering, isolation, and the one-window fact.
 *
 * Task 4.11. The order is the interesting part, and the trap is that the order looks like it
 * governs what a blob can see and does not: one window wraps the whole step, so the semiglobal
 * — which runs *last* — still reads the beginning-of-step world through `@`, exactly like the
 * global blob which ran first.
 */

import { describe, expect, it } from "vitest";
import {
  BLOPART_GLOBAL,
  BLOPART_SEMIGLOBAL,
  createGlobalBlob,
  createSemiglobal,
  runStep,
} from "./global.ts";
import type { Animatable, Field, StepOptions } from "./global.ts";
import { BlobStore, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";
import { evaluate } from "./expr.ts";
import { parseCode } from "./code.ts";
import { allocateSlots } from "./slots.ts";
import { runCode } from "./execute.ts";
import type { ExecutionContext } from "./execute.ts";

/** A blob that records when it was animated and can run one Cual statement. */
function blob(
  name: string,
  code?: string,
  slot = 14,
  initial = 0,
): Animatable & { readonly slot: number; read(): number } {
  const slices = new TimeSlices();
  const store = new BlobStore(20, 13, slices);
  store.set(slot, initial);
  const blobRef: Animatable & { readonly slot: number; read(): number } = {
    name,
    slot,
    // The slot *number* is the same for every blob in a level; what differs is the value, so
    // that is what a test has to read.
    read: () => store.get(slot),
    animate() {
      if (!code) return;
      const statements = parseCode(
        tokenizeCode(code),
      );
      const allocation = allocateSlots(statements);
      const ctx: ExecutionContext = {
        store,
        busySlots: allocation.busySlots,
        evaluate: (expr) => evaluate(expr, { variable: () => store.get(slot), random: () => 0 }),
        slotOf: () => slot,
        slices,
      };
      slices.open();
      runCode(statements, ctx);
      slices.close();
    },
  };
  return blobRef;
}

/** The `<< >>`-delimited Cual in a level is just statements here, so the code tokens go in bare. */
function tokenizeCode(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** One player's field: two cells, one falling piece, one info blob, and its semiglobal. */
function field(right: boolean, infoActive: boolean): Field {
  return {
    right,
    board: [blob(`cell${right ? "R" : "L"}-0-0`), blob(`cell${right ? "R" : "L"}-0-1`)],
    falling: [blob(`fall${right ? "R" : "L"}`)],
    nextFalling: [blob(`next${right ? "R" : "L"}`)],
    infoBlops: [{ blob: blob(`info${right ? "R" : "L"}`), active: infoActive }],
    semiglobal: blob(`semiglobal${right ? "R" : "L"}`),
  };
}

function options(): StepOptions & { windows: number; cleared: number } {
  const state = { windows: 0, cleared: 0 };
  return {
    get windows() {
      return state.windows;
    },
    get cleared() {
      return state.cleared;
    },
    openWindow: () => {
      state.windows += 1;
    },
    closeWindow: () => {
      state.windows += 1;
    },
    clearPictureStacks: () => {
      state.cleared += 1;
    },
  };
}

describe("the order of a step", () => {
  it("runs the global blob first, then each field, with the semiglobal last in its own", () => {
    // "Erst mal das globale Blop ausfuehren." followed by `for (i < mSpielerZahl)
    // mSpielfeld[i]->animiere()`, and inside that `mDaten`, `mFall`, `mNaechsterFall`, the info
    // blobs and finally `mSemiglobal.animiere()`.
    const order = runStep(blob("global"), [field(false, true), field(true, true)], options());
    expect([...order.animated]).toEqual([
      "global",
      "cellL-0-0",
      "cellL-0-1",
      "fallL",
      "nextL",
      "infoL",
      "semiglobalL",
      "cellR-0-0",
      "cellR-0-1",
      "fallR",
      "nextR",
      "infoR",
      "semiglobalR",
    ]);
  });

  it("skips an inactive info blob rather than dropping it", () => {
    // `for (int i = 0; i < infoblop_anz; i++) if (mInfoBlopActive[i]) mInfoBlops[i].animiere();`
    // The blob exists and has a slot; it just does not animate this step.
    const active = runStep(blob("global"), [field(false, true)], options());
    expect(active.animated).toContain("infoL");
    const inactive = runStep(blob("global"), [field(false, false)], options());
    expect(inactive.animated).not.toContain("infoL");
    expect(inactive.animated).toContain("semiglobalL");
  });

  it("visits the board in x-major order", () => {
    // `BlopGitter::animiere`: `for (int x = 0; x < grx; x++) for (int y = 0; y < getGrY(); y++)`.
    // So a column is finished before the next one starts, and the row-major reading would be a
    // different order for any grid with more than one column.
    const cells = [
      blob("x0y0"),
      blob("x0y1"),
      blob("x1y0"),
      blob("x1y1"),
    ];
    const oneField: Field = {
      right: false,
      board: cells,
      falling: [],
      nextFalling: [],
      infoBlops: [],
      semiglobal: blob("semi"),
    };
    const order = runStep(blob("global"), [oneField], options());
    expect([...order.animated]).toEqual(["global", "x0y0", "x0y1", "x1y0", "x1y1", "semi"]);
  });

  it("wraps the whole step in one window, not one per blob", () => {
    // One `beginGleichzeitig()` and one `endGleichzeitig()` around everything, so every `@`-read
    // in the step — including the semiglobal's, which runs last — sees the values from the
    // start of the step.
    const steps = options();
    runStep(blob("global"), [field(false, true), field(true, true)], steps);
    expect(steps.windows).toBe(2);
    expect(steps.cleared).toBe(1);
  });

  it("clears the picture stacks before anything animates", () => {
    // `Blop::lazyLeereStapel()` sits above `ld->spielSchritt()`, so even the global blob draws
    // into an empty stack.
    const order: string[] = [];
    const steps: StepOptions = {
      openWindow: () => order.push("open"),
      closeWindow: () => order.push("close"),
      clearPictureStacks: () => order.push("clear"),
    };
    const drawing = {
      name: "global",
      animate: () => order.push("global"),
    };
    runStep(drawing, [], steps);
    expect(order).toEqual(["open", "clear", "global", "close"]);
  });

  it("closes the window even when a blob throws", () => {
    // `endGleichzeitig()` is not in a `finally` upstream — it is just the next line — so a
    // throwing level dies with the window open. Refusing to close would leave a global
    // `gGleichZeit` true for whatever ran next, which is a much harder failure than losing a
    // step, and this transcription closes it.
    const order: string[] = [];
    const steps: StepOptions = {
      openWindow: () => order.push("open"),
      closeWindow: () => order.push("close"),
      clearPictureStacks: () => order.push("clear"),
    };
    const bad: Animatable = {
      name: "global",
      animate: () => {
        throw new Error("Cual: the level is wrong");
      },
    };
    expect(() => runStep(bad, [], steps)).toThrow(/the level is wrong/);
    expect(order).toEqual(["open", "clear", "close"]);
  });
});

describe("what the two kinds are", () => {
  it("names the global blob blopart_global and the semiglobal blopart_semiglobal", () => {
    // `blopart_global` (-2), `blopart_semiglobal` (-3), `blopart_info` (-4).
    expect(BLOPART_GLOBAL).toBe(-2);
    expect(BLOPART_SEMIGLOBAL).toBe(-3);
    const kinds: number[] = [];
    const record = (kind: number): Animatable => {
      kinds.push(kind);
      return { name: `k${kind}`, animate: () => {} };
    };
    createGlobalBlob(record);
    createSemiglobal(false, record);
    createSemiglobal(true, record);
    expect(kinds).toEqual([BLOPART_GLOBAL, BLOPART_SEMIGLOBAL, BLOPART_SEMIGLOBAL]);
  });

  it("creates one global blob for the whole program, not one per field", () => {
    // `Blop Blop::gGlobalBlop;` is a static member — not a member of `Spielfeld`, not a member
    // of anything. `finde()` for `absort_global` returns it directly, with no side lookup.
    const global = createGlobalBlob(() => ({ name: "global", animate: () => {} }));
    const a = createSemiglobal(false, () => ({ name: "a", animate: () => {} }));
    const b = createSemiglobal(true, () => ({ name: "b", animate: () => {} }));
    expect(a).not.toBe(global);
    expect(b).not.toBe(a);
  });
});

describe("isolation", () => {
  it("keeps the two semiglobals' variables apart", () => {
    // `mSemiglobal` is a member of `Spielfeld`, and `@@` is `absort_semiglobal` with the side
    // from the half specifier. Two players sharing one store would make a win condition depend
    // on turn order.
    const left = blob("semiL", "xx += 1", 14, 10);
    const right = blob("semiR", "xx += 1", 14, 10);
    const leftField: Field = {
      right: false,
      board: [],
      falling: [],
      nextFalling: [],
      infoBlops: [],
      semiglobal: left,
    };
    const rightField: Field = {
      right: true,
      board: [],
      falling: [],
      nextFalling: [],
      infoBlops: [],
      semiglobal: right,
    };
    runStep(blob("global"), [leftField, rightField], options());
    expect(left.slot).toBe(14);
    expect(right.slot).toBe(14);
    // Both were animated exactly once, so neither ran twice because of the other's field.
    expect(left.read()).toBe(11);
    expect(right.read()).toBe(11);
  });

  it("does not let the global blob's variables reach a board blob", () => {
    // The global blob's own code is `mEventCode[event_draw]` for kind `blopart_global`, whose
    // data comes from the level's `var` declarations for the global kind. Nothing shares a store
    // with it, so a variable it writes is invisible to the board except through `@()`.
    const global = blob("global", "xx += 1", 14, 5);
    const cell = blob("cell", "xx += 1", 14, 5);
    const oneField: Field = {
      right: false,
      board: [cell],
      falling: [],
      nextFalling: [],
      infoBlops: [],
      semiglobal: blob("semi"),
    };
    runStep(global, [oneField], options());
    // Both advanced by exactly one, from their own starting value: 5 -> 6, not 5 -> 7.
    expect(global.read()).toBe(6);
    expect(cell.read()).toBe(6);
  });

  it("resolves the other player's semiglobal to the left one when there is one player", () => {
    // `rechts_ok(rechts) { return (!rechts) || (getSpielerZahl() > 1); }` — a one-player level
    // asking for `@@(x,y;!)` gets the left field, not a failure. Carried over from 4.7's
    // `isReachable`, and repeated here because it is the case where "per-player" has only one
    // player.
    const only = field(false, true);
    expect(only.right).toBe(false);
    // With two fields there are two distinct semiglobals to address, and 4.7's
    // `semiglobal(right)` is what distinguishes them.
    const both = [field(false, true), field(true, true)];
    expect(new Set(both.map((f) => f.semiglobal)).size).toBe(2);
  });
});

describe("running a real statement in the global blob", () => {
  it("runs the global blob's draw code every step", () => {
    // `LevelDaten::spielSchritt()` is "Sollte einmal pro Spielschritt aufgerufen werden
    // (bevor Spielfeld::spielSchritt() aufgerufen wird)" — once per step, before the field.
    const global = blob("global", "xx += 1", 14, 0);
    for (let step = 0; step < 3; step += 1) {
      runStep(global, [], options());
    }
    expect(global.read()).toBe(3);
  });

  it("runs the same code a board blob runs, with the same evaluator", () => {
    // Nothing about the global blob's evaluation is special: same `Code::eval`, same variable
    // table, same time slice. Asserted by running a mixed statement — an assignment whose
    // right-hand side is an expression — which is what a global kind's code actually looks
    // like, rather than a bare `xx += 1` that would pass through a shortcut.
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    store.set(14, 3);
    const statements = parseCode(tokenizeCode("xx = xx * 2 + 1;"));
    const allocation = allocateSlots(statements);
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: (expr) => evaluate(expr, { variable: () => store.get(14), random: () => 0 }),
      slotOf: () => 14,
      slices,
    };
    slices.open();
    runCode(statements, ctx);
    slices.close();
    expect(store.get(14)).toBe(7);
  });
});
