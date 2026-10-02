/**
 * The system variables and the per-step resets, checked against `Blop::initSchritt` and the
 * list in task 4.4.
 *
 * The reset is the substance. Five variables are cleared at the top of every step for every
 * blob, before any of its own code runs, and `file` and `pos` are written by statements a level
 * writes constantly — so a reset that happens at the wrong moment is invisible in a store test
 * and obvious in a level.
 */

import { describe, expect, it } from "vitest";
import {
  BlobStore,
  PER_STEP_RESETS,
  SPECIAL_VARIABLES,
  SYSTEM_VARIABLE_SLOTS,
  TimeSlices,
  VIERTEL_ALLE,
  SPEZVAR_OUT_NICHTS,
} from "./store.ts";
import { parseCode } from "./code.ts";
import { allocateSlots } from "./slots.ts";
import { runCode } from "./execute.ts";
import type { ExecutionContext } from "./execute.ts";
import { tokenize } from "../level-format/lexer.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

function harness(source: string) {
  const statements = parseCode(lex(source));
  const slices = new TimeSlices();
  const allocation = allocateSlots(statements);
  const store = new BlobStore(allocation.slotCount, 13, slices);
  const ctx: ExecutionContext = {
    store,
    busySlots: allocation.busySlots,
    evaluate: () => 0,
  };
  return { ctx, store, slices, statements };
}

describe("the system variables", () => {
  it("are the twelve task 4.4 names, at blop.h's slots", () => {
    // Each `#define` in blop.h and the order of `spezvar_namen` in knoten.cpp are two copies
    // of one fact. If they disagree, `out1` is somebody else's slot.
    expect(Object.keys(SYSTEM_VARIABLE_SLOTS).sort()).toEqual([
      "behaviour",
      "falling_fast_speed",
      "falling_speed",
      "file",
      "inhibit",
      "kind",
      "out1",
      "out2",
      "pos",
      "qu",
      "version",
      "weight",
    ]);
    expect(SYSTEM_VARIABLE_SLOTS.file).toBe(0);
    expect(SYSTEM_VARIABLE_SLOTS.pos).toBe(1);
    expect(SYSTEM_VARIABLE_SLOTS.kind).toBe(2);
    expect(SYSTEM_VARIABLE_SLOTS.version).toBe(3);
    expect(SYSTEM_VARIABLE_SLOTS.qu).toBe(4);
    expect(SYSTEM_VARIABLE_SLOTS.out1).toBe(5);
    expect(SYSTEM_VARIABLE_SLOTS.out2).toBe(6);
    expect(SYSTEM_VARIABLE_SLOTS.inhibit).toBe(8);
    expect(SYSTEM_VARIABLE_SLOTS.behaviour).toBe(10);
    expect(SYSTEM_VARIABLE_SLOTS.falling_fast_speed).toBe(12);
  });

  it("leave the two unnamed slots unnameable", () => {
    expect(SYSTEM_VARIABLE_SLOTS[""]).toBeUndefined();
    expect(SYSTEM_VARIABLE_SLOTS.am_platzen).toBeUndefined();
    expect(SYSTEM_VARIABLE_SLOTS.kind_beim_letzten_draw_aufruf).toBeUndefined();
  });

  it("round-trip a value, and refuse a name that is not one", () => {
    const { store } = harness("5;");
    store.setSystem("weight", 3);
    expect(store.getSystem("weight")).toBe(3);
    expect(() => store.getSystem("no_such_variable")).toThrow(/no system variable/);
    expect(() => store.setSystem("", 1)).toThrow(/no system variable/);
  });

  it("shadow a system variable write, because a write is a write", () => {
    // `setSystem` goes through `preserve`. A `@` read of a system variable therefore sees the
    // beginning-of-step value, the same as any user variable — which is what makes the resets
    // below observable rather than invisible.
    const { store, slices } = harness("5;");
    // `file` is 7 *before* the slice opens, so that the write inside the slice has something
    // to shadow. Writing 7 inside the slice would make it the shadow's own value.
    store.setSystem("file", 7);
    slices.open();
    store.setSystem("file", 9);
    expect(store.getSystem("file")).toBe(9);
    expect(store.getAlt(0)).toBe(7);
  });
});

describe("the per-step resets", () => {
  it("reset exactly the five initSchritt resets", () => {
    // `mDaten[spezvar_file] = 0; mDaten[spezvar_pos] = 0; mDaten[spezvar_quarter] =
    // viertel_alle; mDaten[spezvar_out1] = spezvar_out_nichts; mDaten[spezvar_out2] = ...;`
    // Five, and no others: `kind`, `weight`, `inhibit`, `behaviour` and the falling speeds keep
    // their values across steps, because a level writing them means it.
    expect(PER_STEP_RESETS.map(([slot]) => slot)).toEqual([0, 1, 4, 5, 6]);
    expect(PER_STEP_RESETS.map(([, value]) => value)).toEqual([
      0,
      0,
      VIERTEL_ALLE,
      SPEZVAR_OUT_NICHTS,
      SPEZVAR_OUT_NICHTS,
    ]);
  });

  it("clears the five and leaves the rest alone", () => {
    const { store } = harness("5;");
    store.setSystem("file", 7);
    store.setSystem("pos", 3);
    store.setSystem("qu", 2);
    store.setSystem("out1", 42);
    store.setSystem("out2", 43);
    store.setSystem("weight", 9);
    store.setSystem("kind", 5);
    store.setSystem("inhibit", 0xff);
    store.setSystem("behaviour", 3);
    store.setSystem("falling_speed", 11);

    store.beginStep();

    expect(store.getSystem("file")).toBe(0);
    expect(store.getSystem("pos")).toBe(0);
    expect(store.getSystem("qu")).toBe(VIERTEL_ALLE);
    expect(store.getSystem("out1")).toBe(SPEZVAR_OUT_NICHTS);
    expect(store.getSystem("out2")).toBe(SPEZVAR_OUT_NICHTS);
    // Everything else survives.
    expect(store.getSystem("weight")).toBe(9);
    expect(store.getSystem("kind")).toBe(5);
    expect(store.getSystem("inhibit")).toBe(0xff);
    expect(store.getSystem("behaviour")).toBe(3);
    expect(store.getSystem("falling_speed")).toBe(11);
  });

  it("takes the shadow copy first, so the resets are visible to a '@' read", () => {
    // `merkeAlteVarWerte();` comes first in upstream, with a comment saying that writing the
    // resets through `setVariable` would call it a second time. The consequence is that within
    // this step a `@` read of `file` sees 0 - the reset - rather than last step's number.
    const { store, slices } = harness("5;");
    store.setSystem("file", 7);
    slices.open();
    store.beginStep();
    expect(store.getSystem("file")).toBe(0);
    expect(store.getAlt(SYSTEM_VARIABLE_SLOTS.file)).toBe(7);
    expect(store.hasShadow).toBe(true);
  });

  it("happens before the blob's own code, so a step never sees the last step's file", () => {
    // The whole point of the ordering. `initSchritt()` is called at the top of `Blop`'s per-step
    // entry, before the sort's animation.
    const { ctx, store } = harness("9; A;");
    runCode([{ kind: "number", value: 9 }, { kind: "letterDraw", letter: 0, position: null }], ctx);
    expect(store.getSystem("file")).toBe(9);
    expect(store.getSystem("pos")).toBe(0);

    store.beginStep();
    expect(store.getSystem("file")).toBe(0);
    expect(store.getSystem("pos")).toBe(0);

    // And the next step sets them again from scratch.
    runCode([{ kind: "number", value: 3 }, { kind: "letterDraw", letter: 12, position: null }], ctx);
    expect(store.getSystem("file")).toBe(3);
    expect(store.getSystem("pos")).toBe(12);
  });

  it("resets before each step rather than once", () => {
    const { ctx, store, slices } = harness("9;");
    for (const file of [9, 4, 7]) {
      slices.open();
      store.beginStep();
      expect(store.getSystem("file")).toBe(0);
      // A fresh statement each time: `9;` would set `file` to 9 whatever the step number, and
      // the test would pass for a store that never reset.
      runCode(parseCode(lex(`${file};`)), ctx);
      expect(store.getSystem("file")).toBe(file);
    }
  });
});

describe("the statements that write them", () => {
  it("set file from a number, and pos from a letter", () => {
    // `zahl_code` sets `file`; `buchstabe_code` sets `pos`. `9;` opening a run of draws in
    // aliens.ld is the ninth frame, and `A` picks a position within it.
    const { ctx, store } = harness("9; A;");
    const statements = parseCode(lex("9; A;"));
    runCode(statements, ctx);
    expect(store.getSystem("file")).toBe(9);
    expect(store.getSystem("pos")).toBe(0);
    runCode(parseCode(lex("4; B;")), ctx);
    expect(store.getSystem("file")).toBe(4);
    expect(store.getSystem("pos")).toBe(1);
  });

  it("are never busy, and leave the rest of the statement's own work alone", () => {
    const { ctx } = harness("9;");
    const statements = parseCode(lex("9; A;"));
    expect(runCode(statements, ctx)).toBe(false);
    // A letter draw does not draw yet: that is `mal_code`, task 4.9, which reads file, pos and
    // qu together. Asserted as "no throw" rather than as "drew", because the latter is 4.9's
    // claim and asserting it here would be asserting something untrue.
    expect(() => runCode(statements, ctx)).not.toThrow();
  });

  it("leave the unnamed slot 7 alone, which is the kind as of the last draw", () => {
    // `spezvar_kind_beim_letzten_draw_aufruf` is not reset by `initSchritt` and is not writable
    // from Cual. Its comparison at the top of `Blop`'s per-step entry is what triggers the
    // busy-reset after a kind change — task 4.8.
    const { store } = harness("5;");
    store.data[7] = 3;
    store.beginStep();
    expect(store.data[7]).toBe(3);
    expect(SPECIAL_VARIABLES[7].name).toBe("");
  });
});
