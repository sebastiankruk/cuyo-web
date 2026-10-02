/**
 * The per-blob store, checked against `Blop`'s constructor rather than against a shape that
 * seems reasonable.
 *
 * Two claims carry most of the weight here. First, that the fourteen special variables come
 * first and keep their slots, because getting that order wrong silently mis-assigns `file`,
 * `pos` and `kind` while every test that uses a variable by slot still passes. Second, the
 * one task 3.7 asks for: two blobs of the same kind have independent busy flags.
 */

import { describe, expect, it } from "vitest";
import { BITS_PER_SLOT, SlotAllocator, allocateSlots } from "./slots.ts";
import {
  BLOBART_AUSSERHALB,
  BlobStore,
  SPECIAL_VARIABLE_COUNT,
  SPECIAL_VARIABLES,
  SPEZVAR_OUT_NICHTS,
  VIERTEL_ALLE,
  specialVariableSlot,
} from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

describe("the special variables", () => {
  it("are fourteen, and their index is their slot", () => {
    expect(SPECIAL_VARIABLE_COUNT).toBe(14);
    expect(SPECIAL_VARIABLES).toHaveLength(14);
    // `spezvar_anz <= mNummer` in definition.h is how a VarDefinition knows it is a real
    // variable rather than a special one, so the count is load-bearing rather than cosmetic.
    expect(SPECIAL_VARIABLES[0].name).toBe("file");
    expect(SPECIAL_VARIABLES[13].name).toBe("");
  });

  it("put the named ones at the slots blop.h says", () => {
    // These `#define`s and the order of `spezvar_namen` are two copies of one fact. If they
    // ever disagree, `file` would be somebody else's slot.
    const expected: [string, number][] = [
      ["file", 0],
      ["pos", 1],
      ["kind", 2],
      ["version", 3],
      ["qu", 4],
      ["out1", 5],
      ["out2", 6],
      ["inhibit", 8],
      ["weight", 9],
      ["behaviour", 10],
      ["falling_speed", 11],
      ["falling_fast_speed", 12],
    ];
    for (const [name, slot] of expected) expect(specialVariableSlot(name)).toBe(slot);
  });

  it("leave slots 7 and 13 unnamed, because they are not for Cual code", () => {
    // 7 is `kind_beim_letzten_draw_aufruf`; 13 is `am_platzen`, which Cual sees only as the
    // constant `exploding`. A lookup by name has to fail for both rather than return 7.
    expect(specialVariableSlot("")).toBe(-1);
    expect(specialVariableSlot("kind_beim_letzten_draw_aufruf")).toBe(-1);
    expect(specialVariableSlot("am_platzen")).toBe(-1);
    expect(specialVariableSlot("no_such_variable")).toBe(-1);
  });

  it("carry the constants from their own headers", () => {
    expect(specialVariableSlot("kind")).toBe(2);
    expect(SPECIAL_VARIABLES[2].defaultValue).toBe(BLOBART_AUSSERHALB);
    expect(BLOBART_AUSSERHALB).toBe(-5);
    expect(SPECIAL_VARIABLES[4].defaultValue).toBe(VIERTEL_ALLE);
    expect(VIERTEL_ALLE).toBe(-1);
    expect(SPECIAL_VARIABLES[5].defaultValue).toBe(SPEZVAR_OUT_NICHTS);
    expect(SPEZVAR_OUT_NICHTS).toBe(0x7fff);
  });

  it("default falling_fast_speed to the level's row count rather than to a number", () => {
    // `gric` is configuration, not a constant. Hard-coding it would bake one configured
    // level's geometry into the runtime, and the value would be wrong on every other one.
    expect(SPECIAL_VARIABLES[12].defaultValue).toBeTypeOf("function");
    expect(new BlobStore(20, 13).getSpecial("falling_fast_speed")).toBe(13);
    expect(new BlobStore(20, 7).getSpecial("falling_fast_speed")).toBe(7);
  });
});

describe("initialisation", () => {
  it("copies the defaults of the three kinds that carry a value", () => {
    const store = new BlobStore(20, 13);
    expect(store.getSpecial("file")).toBe(0);
    expect(store.getSpecial("out1")).toBe(SPEZVAR_OUT_NICHTS);
    expect(store.getSpecial("weight")).toBe(1);
    expect(store.getSpecial("falling_speed")).toBe(6);
  });

  it("leaves 'never' and 'no blob' slots at zero, rather than at their declared default", () => {
    // Blop's constructor switches on the default kind and leaves these two alone. `kind`
    // declares a default of `blopart_ausserhalb` but is `da_keinblob`, and Blop assigns it
    // explicitly a few lines later - reading the default would make every fresh blob claim to
    // be off the board for one instruction too long.
    const store = new BlobStore(20, 13);
    expect(SPECIAL_VARIABLES[2].defaultValue).toBe(BLOBART_AUSSERHALB);
    expect(store.getSpecial("kind")).toBe(0);
    expect(store.getSpecial("version")).toBe(0);
    expect(store.getSpecial("behaviour")).toBe(0);
  });

  it("initialises slot 7 from its default even though it has no name", () => {
    expect(new BlobStore(20, 13).data[7]).toBe(BLOBART_AUSSERHALB);
    expect(new BlobStore(20, 13).data[13]).toBe(0);
  });

  it("applies a kind's user-variable defaults", () => {
    const store = new BlobStore(20, 13, [
      { slot: SPECIAL_VARIABLE_COUNT, value: 7 },
      { slot: SPECIAL_VARIABLE_COUNT + 1, value: -2 },
    ]);
    expect(store.data[14]).toBe(7);
    expect(store.data[15]).toBe(-2);
  });

  it("refuses a user default that would land on a special variable", () => {
    // Silently accepting it would write `file`, which is the failure mode the whole
    // fourteen-first ordering exists to prevent.
    expect(() => new BlobStore(20, 13, [{ slot: 2, value: 1 }])).toThrow(/special variable/);
  });

  it("clears everything on reset, so a respawned blob is not the old one", () => {
    const store = new BlobStore(20, 13);
    store.set(SPECIAL_VARIABLE_COUNT, 99);
    store.setSpecial("weight", 42);
    store.reset(13);
    expect(store.data[SPECIAL_VARIABLE_COUNT]).toBe(0);
    expect(store.getSpecial("weight")).toBe(1);
  });
});

describe("busy flags are independent between two blobs of the same kind", () => {
  /**
   * The task's verification, and the reason the flags are variables rather than a parallel
   * structure. Both stores run the *same* compiled tree, so they use the same bit numbers;
   * nothing may be shared.
   */
  it("gives two stores of the same size independent flags", () => {
    const statements = parseCode(lex("alpha, beta;"));
    const { busySlots, slotCount } = allocateSlots(statements);
    const first = new BlobStore(slotCount, 13);
    const second = new BlobStore(slotCount, 13);
    const bit = [...busySlots.values()][0].first;

    expect(first.busyGet(bit)).toBe(false);
    first.busySet(bit, true);
    expect(first.busyGet(bit)).toBe(true);
    // The whole point. Same kind, same tree, same bit - different array.
    expect(second.busyGet(bit)).toBe(false);

    second.busySet(bit, true);
    first.busySet(bit, false);
    expect(first.busyGet(bit)).toBe(false);
    expect(second.busyGet(bit)).toBe(true);
  });

  it("keeps two flags in one int apart", () => {
    const statements = parseCode(lex("alpha, beta; gamma, delta;"));
    const { busySlots, slotCount } = allocateSlots(statements);
    const store = new BlobStore(slotCount, 13);
    const [a, b] = [...busySlots.values()];
    // Both in the same int, so a write to one is a write to that int - and still must not
    // disturb the other.
    expect(Math.floor(a.first / BITS_PER_SLOT)).toBe(Math.floor(b.first / BITS_PER_SLOT));
    store.busySet(a.first, true);
    expect(store.busyGet(b.first)).toBe(false);
    store.busySet(b.first, true);
    expect(store.busyGet(a.first)).toBe(true);
  });

  it("does not disturb a user variable sharing an int with a flag", () => {
    const allocator = new SlotAllocator();
    allocator.allocateDeclaredVariable();
    const bit = allocator.allocateBool();
    const store = new BlobStore(allocator.slotCount, 13);
    const variable = SPECIAL_VARIABLE_COUNT;
    store.set(variable, 0x00ff00ff);
    store.busySet(bit, true);
    expect(store.get(variable)).toBe(0x00ff00ff);
    expect(store.busyGet(bit)).toBe(true);
    store.busySet(bit, false);
    expect(store.get(variable)).toBe(0x00ff00ff);
  });

  it("survives a value that has every other bit set", () => {
    // A variable holding -1 shares the int with the first block of flags. If reading a flag
    // used equality rather than a mask, every flag in that int would read as set.
    const allocator = new SlotAllocator();
    allocator.allocateDeclaredVariable();
    const bit = allocator.allocateBool();
    const store = new BlobStore(allocator.slotCount, 13);
    store.set(SPECIAL_VARIABLE_COUNT, -1);
    expect(store.busyGet(bit)).toBe(false);
    store.busySet(bit, true);
    expect(store.busyGet(bit)).toBe(true);
    expect(store.get(SPECIAL_VARIABLE_COUNT)).toBe(-1);
  });
});

describe("the snapshot", () => {
  it("is an independent copy, not the same array", () => {
    const store = new BlobStore(20, 13);
    store.set(SPECIAL_VARIABLE_COUNT, 5);
    store.busySet(BITS_PER_SLOT * SPECIAL_VARIABLE_COUNT, true);
    const shadow = store.snapshot();
    store.set(SPECIAL_VARIABLE_COUNT, 6);
    store.busySet(BITS_PER_SLOT * SPECIAL_VARIABLE_COUNT, false);
    expect(shadow[SPECIAL_VARIABLE_COUNT]).toBe(5);
    expect(getBusyIn(shadow, BITS_PER_SLOT * SPECIAL_VARIABLE_COUNT)).toBe(true);
  });

  it("has the same length as the store", () => {
    expect(new BlobStore(37, 13).snapshot()).toHaveLength(37);
  });
});

function getBusyIn(array: Int32Array, bit: number): boolean {
  return (array[Math.floor(bit / BITS_PER_SLOT)] & (1 << (bit % BITS_PER_SLOT))) !== 0;
}
