/**
 * The per-blob store, checked against `Blop`'s constructor rather than against a shape that
 * seems reasonable.
 *
 * Two claims carry most of the weight here. First, that the fourteen special variables come
 * first and keep their slots, because getting that order wrong silently mis-assigns `file`,
 * `pos` and `kind` while every test that uses a variable by slot still passes. Second, the
 * one task 3.7 asks for: two blobs of the same kind have independent busy flags.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { BITS_PER_SLOT, SlotAllocator, allocateSlots } from "./slots.ts";
import {
  BLOBART_AUSSERHALB,
  BlobStore,
  TimeSlices,
  SPECIAL_VARIABLE_COUNT,
  SPECIAL_VARIABLES,
  SPEZVAR_OUT_NICHTS,
  VIERTEL_ALLE,
  specialVariableSlot,
} from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import { evaluate } from "./expr.ts";
import { divv } from "./divmod.ts";
import type { AssignOperator } from "./code.ts";

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
    expect(new BlobStore(20, 13, new TimeSlices()).getSpecial("falling_fast_speed")).toBe(13);
    expect(new BlobStore(20, 7, new TimeSlices()).getSpecial("falling_fast_speed")).toBe(7);
  });
});

describe("initialisation", () => {
  it("copies the defaults of the three kinds that carry a value", () => {
    const store = new BlobStore(20, 13, new TimeSlices());
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
    const store = new BlobStore(20, 13, new TimeSlices());
    expect(SPECIAL_VARIABLES[2].defaultValue).toBe(BLOBART_AUSSERHALB);
    expect(store.getSpecial("kind")).toBe(0);
    expect(store.getSpecial("version")).toBe(0);
    expect(store.getSpecial("behaviour")).toBe(0);
  });

  it("initialises slot 7 from its default even though it has no name", () => {
    expect(new BlobStore(20, 13, new TimeSlices()).data[7]).toBe(BLOBART_AUSSERHALB);
    expect(new BlobStore(20, 13, new TimeSlices()).data[13]).toBe(0);
  });

  it("applies a kind's user-variable defaults", () => {
    const store = new BlobStore(20, 13, new TimeSlices(), [
      { slot: SPECIAL_VARIABLE_COUNT, value: 7 },
      { slot: SPECIAL_VARIABLE_COUNT + 1, value: -2 },
    ]);
    expect(store.data[14]).toBe(7);
    expect(store.data[15]).toBe(-2);
  });

  it("refuses a user default that would land on a special variable", () => {
    // Silently accepting it would write `file`, which is the failure mode the whole
    // fourteen-first ordering exists to prevent.
    expect(() => new BlobStore(20, 13, new TimeSlices(), [{ slot: 2, value: 1 }])).toThrow(/special variable/);
  });

  it("clears everything on reset, so a respawned blob is not the old one", () => {
    const store = new BlobStore(20, 13, new TimeSlices());
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
    const first = new BlobStore(slotCount, 13, new TimeSlices());
    const second = new BlobStore(slotCount, 13, new TimeSlices());
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
    const store = new BlobStore(slotCount, 13, new TimeSlices());
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
    const store = new BlobStore(allocator.slotCount, 13, new TimeSlices());
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
    const store = new BlobStore(allocator.slotCount, 13, new TimeSlices());
    store.set(SPECIAL_VARIABLE_COUNT, -1);
    expect(store.busyGet(bit)).toBe(false);
    store.busySet(bit, true);
    expect(store.busyGet(bit)).toBe(true);
    expect(store.get(SPECIAL_VARIABLE_COUNT)).toBe(-1);
  });
});

describe("the beginning-of-step shadow copy", () => {
  it("is not taken until the first write of the slice", () => {
    // `merkeAlteVarWerte` is called by the write, not when the slice opens. Upstream copies
    // on a blob's first write; copying eagerly would allocate a second Int32Array for every
    // blob on the board on every slice whether or not anything reads it.
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    expect(store.hasShadow).toBe(false);
    store.get(SPECIAL_VARIABLE_COUNT);
    store.getAlt(SPECIAL_VARIABLE_COUNT);
    expect(store.hasShadow).toBe(false);
    store.set(SPECIAL_VARIABLE_COUNT, 1);
    expect(store.hasShadow).toBe(true);
  });

  it("keeps the value a slot had at the beginning of the slice", () => {
    // This is the whole of statement 4 of cual.6's six: `X = X@(0, 0) + 1` sets X to one
    // more than it was at the beginning of the step, not one more than it is now.
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    store.set(SPECIAL_VARIABLE_COUNT, 5);
    slices.open();
    store.set(SPECIAL_VARIABLE_COUNT, 9);
    expect(store.get(SPECIAL_VARIABLE_COUNT)).toBe(9);
    expect(store.getAlt(SPECIAL_VARIABLE_COUNT)).toBe(5);
    // And the value it had before this slice began is 5, not 0.
    expect(store.getAlt(SPECIAL_VARIABLE_COUNT)).toBe(5);
  });

  it("takes the shadow once per slice, not once per write", () => {
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    slices.open();
    store.set(SPECIAL_VARIABLE_COUNT, 1);
    store.set(SPECIAL_VARIABLE_COUNT, 2);
    // The shadow is from before the first write, so it still reads 0.
    expect(store.getAlt(SPECIAL_VARIABLE_COUNT)).toBe(0);
    slices.open();
    expect(store.hasShadow).toBe(false);
    store.set(SPECIAL_VARIABLE_COUNT, 3);
    expect(store.getAlt(SPECIAL_VARIABLE_COUNT)).toBe(2);
  });

  it("falls back to the live value when the shadow is from an older slice", () => {
    // A stale shadow is a blob's history, not this slice's past. `getVariableAlt` falls
    // through to the live array, which is right: nothing has been written this slice yet.
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    slices.open();
    store.set(SPECIAL_VARIABLE_COUNT, 7);
    slices.open();
    expect(store.hasShadow).toBe(false);
    expect(store.getAlt(SPECIAL_VARIABLE_COUNT)).toBe(7);
  });

  it("preserves the busy flag too, since a flag is a variable", () => {
    const allocator = new SlotAllocator();
    allocator.allocateBool();
    const slices = new TimeSlices();
    const store = new BlobStore(allocator.slotCount, 13, slices);
    const bit = [...allocateSlots(parseCode(lex("alpha, beta;"))).busySlots.values()][0].first;
    slices.open();
    expect(store.busyGet(bit)).toBe(false);
    store.busySet(bit, true);
    // Written this slice, so the beginning-of-slice value is false.
    expect(store.busyGetAlt(bit)).toBe(false);
    slices.open();
    expect(store.busyGetAlt(bit)).toBe(true);
  });

  it("does not let setInternal overwrite the shadow", () => {
    // `endGleichzeitig` applies deferred writes through this. A preserve here would replace
    // the beginning-of-slice values that the *next* slice's @ reads are relative to.
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    slices.open();
    store.set(SPECIAL_VARIABLE_COUNT, 5);
    expect(store.getAlt(SPECIAL_VARIABLE_COUNT)).toBe(0);
    store.setInternal(SPECIAL_VARIABLE_COUNT, 42);
    expect(store.get(SPECIAL_VARIABLE_COUNT)).toBe(42);
    // The shadow still says what the slice began with.
    expect(store.getAlt(SPECIAL_VARIABLE_COUNT)).toBe(0);
  });

  it("drops the shadow on reset, so a respawned blob has no past", () => {
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    slices.open();
    store.set(SPECIAL_VARIABLE_COUNT, 5);
    expect(store.hasShadow).toBe(true);
    store.reset(13);
    expect(store.hasShadow).toBe(false);
  });
});

describe("time slices", () => {
  it("starts at zero and increments on open", () => {
    const slices = new TimeSlices();
    expect(slices.current).toBe(0);
    expect(slices.open()).toBe(1);
    expect(slices.current).toBe(1);
  });

  it("gives the step and each event its own slice", () => {
    // The step is one `beginGleichzeitig` window and so is each draw, key and land event, so
    // a @ read during a draw does not see what a @ read during the step saw.
    const slices = new TimeSlices();
    slices.open(); // step
    const duringStep = slices.current;
    slices.open(); // draw
    slices.open(); // key
    slices.open(); // land
    expect(duringStep).toBe(1);
    expect(slices.current).toBe(4);
  });

  it("opens a window, and refuses to close one that is not open", () => {
    const slices = new TimeSlices();
    expect(slices.isOpen).toBe(false);
    slices.open();
    expect(slices.isOpen).toBe(true);
    slices.close();
    expect(slices.isOpen).toBe(false);
    expect(() => slices.close()).toThrow(/without beginGleichzeitig/);
  });

  it("refuses to queue a write outside a window, as setVariableZukunft's assert does", () => {
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    expect(() => slices.defer(store, 14, 1, "=")).toThrow(/outside a Gleichzeitig/);
  });
});

/**
 * `cual.6`'s six `@`-assignment examples, and what 3.8 can honestly say about each.
 *
 * The man page asks for all six to produce the documented results. Two of the three things
 * that need are not in this task:
 *
 * - a *deferred write* (statements 2, 5 and 6 all write through `@`, and the write happens
 *   at the end of the step) - that is task 3.9;
 * - an *addressed read* (`X@(0, 0)` on the right-hand side) - that is task 4.7, and
 *   `expr.ts` still refuses `positioned` outright.
 *
 * So this block does two things and deliberately does not do a third. It verifies the
 * mechanism each documented result rests on, where that mechanism is 3.8's, and it asserts
 * that the statements which cannot yet work are **refused**. Not skipped, and not asserted
 * with the wrong answer: a test that quietly passes on unimplemented behaviour is worse than
 * no test, because the number in the summary stays the same either way and only one of them
 * means anything.
 */
describe("cual.6's six examples", () => {
  const X = SPECIAL_VARIABLE_COUNT;
  const slices = new TimeSlices();
  const store = new BlobStore(20, 13, slices);

  beforeEach(() => {
    slices.open();
    store.reset(13);
  });

  /**
   * The documented text, kept in the test so that "verified" means verified against these
   * words rather than against my recollection of them.
   */
  const documented = {
    "1) X += 1": "only 1) and 3) do the same; they simply increment X by 1",
    "2) X@(0, 0) += 1": "X is set to one more than the value of X just before the change",
    "3) X = X + 1": "only 1) and 3) do the same; they simply increment X by 1",
    "4) X = X@(0, 0) + 1": "sets X to one more than it was at the beginning of the step",
    "5) X@(0, 0) = X + 1": "X is set to one more than the current value of X",
    "6) X@(0, 0) = X@(0, 0) + 1": "X is set to one more than the value of X at the beginning of the step",
  } as const;

  it("has transcribed all six documented results", () => {
    // A transcription that quietly lost a statement would make the rest of this block look
    // complete. Six in, six out.
    expect(Object.keys(documented)).toHaveLength(6);
    for (const text of Object.values(documented)) expect(text).toMatch(/X/);
  });

  it("1) and 3) increment X by one, which needs no snapshot at all", () => {
    // Both are a plain read of the live value and a plain write.
    //
    // The slice has to open *after* X is set, or the shadow is right and the expectation is
    // wrong: setting X during a slice makes the beginning-of-slice value 0, not the value
    // just written. The man page's example presumes X already had a value, so the slice
    // begins with X = 5.
    store.set(X, 5);
    slices.open();
    // `X += 1`
    store.set(X, store.get(X) + 1);
    expect(store.get(X)).toBe(6);
    // `X = X + 1`
    store.set(X, store.get(X) + 1);
    expect(store.get(X)).toBe(7);
    // Neither touches the beginning-of-slice value, which is what "they simply increment"
    // means: no `@` involved, so no deferred anything.
    expect(store.getAlt(X)).toBe(5);
  });

  it("4) reads the value from the beginning of the step, which is the shadow's whole job", () => {
    store.set(X, 5);
    slices.open(); // a new step begins; X is 5 at its start
    store.set(X, 9); // something wrote during the step
    // `X = X@(0, 0) + 1`
    store.set(X, store.getAlt(X) + 1);
    expect(store.get(X)).toBe(6);
    // "one more than it was at the beginning of the step" - not 10.
    expect(store.get(X)).not.toBe(10);
  });

  it("refuses an addressed read when the context has no addressed access", () => {
    // The refusal moved rather than disappeared. `EvalContext.addressed` is optional, so a
    // context that only supplies plain variables still evaluates everything else, and an
    // addressed variable in it is refused *by name* rather than read from the wrong place.
    expect(() =>
      evaluate(
        { kind: "positioned", name: "XC", position: { kind: "feld", x: { kind: "number", value: 0 }, y: { kind: "number", value: 0 }, half: null, relative: false } },
        { variable: () => 0, random: () => 0 },
      ),
    ).toThrow(/needs a context with addressed access/);
  });

  it("refuses a deferred write, which is 3.9", () => {
    // Every statement that writes through `@` needs the queue. `close` applies nothing yet,
    // so there is no way to produce statements 2, 5 or 6 - and no way to produce them
    // *wrongly* either, which is the outcome that would be dangerous to discover later.
    slices.open();
    store.set(X, 5);
    slices.open();
    store.set(X, 9);
    slices.close();
    // Nothing was queued, so nothing was applied: X is still 9, not 10.
    expect(store.get(X)).toBe(9);
    // And 3.9 will change this assertion. It is here so that the change is a test failing
    // rather than a behaviour shifting unnoticed.
  });
});

/**
 * The deferred write queue: `setVariableZukunft` and `endGleichzeitig`.
 *
 * The whole mechanism is two rules from `cual.6`: a write through `@` happens at the end of
 * the step, and its *right-hand side* is evaluated immediately. Everything below is those two
 * rules plus the order they compose in.
 */
describe("deferred writes", () => {
  const slices = new TimeSlices();
  const writer = new BlobStore(20, 13, slices);
  const other = new BlobStore(20, 13, slices);
  const X = SPECIAL_VARIABLE_COUNT;
  const Y = SPECIAL_VARIABLE_COUNT + 1;

  beforeEach(() => {
    slices.open();
    writer.reset(13);
    other.reset(13);
  });

  it("is invisible until the window closes", () => {
    // The task's verification: a cross-blob write is not visible to the reader until the
    // step ends. Both blobs are in the same window, which is the whole point - simultaneity
    // is what makes the write invisible.
    writer.set(X, 1);
    slices.defer(writer, X, 99, "=");
    expect(slices.pending).toBe(1);
    // The writer cannot see it either.
    expect(writer.get(X)).toBe(1);
    // Nor can a different blob of the same kind.
    expect(other.get(X)).toBe(0);
    slices.close();
    expect(writer.get(X)).toBe(99);
  });

  it("applies in queue order, so two writes to one slot compose", () => {
    writer.set(X, 5);
    slices.defer(writer, X, 1, "+=");
    slices.defer(writer, X, 2, "+=");
    slices.close();
    expect(writer.get(X)).toBe(8);
  });

  it("reads the live value at close, not the value when it was queued", () => {
    // Statement 2 of the six: "X is set to one more than the value of X just before the
    // change". "Just before the change" is when the queue is applied, so a write to X in
    // between shifts the result.
    writer.set(X, 5);
    slices.defer(writer, X, 1, "+=");
    writer.set(X, 10);
    expect(writer.get(X)).toBe(10);
    slices.close();
    expect(writer.get(X)).toBe(11);
  });

  it("does not preserve, so it cannot overwrite the next slice's baseline", () => {
    // `endGleichzeitig` writes through `setVariableIntern`. A preserve here would replace
    // the beginning-of-slice values the *next* slice's `@` reads are measured against.
    slices.open();
    writer.set(X, 5); // shadow taken here: X was 0 at the start of the slice
    slices.defer(writer, X, 77, "=");
    slices.close();
    expect(writer.get(X)).toBe(77);
    // The shadow still says what the slice began with. If the deferred write had preserved,
    // this would be 77 and the next slice's `@` reads would be measured against it.
    expect(writer.getAlt(X)).toBe(0);
    slices.open();
    writer.set(X, 1);
    // The beginning of the new slice is 77 - the deferred write did land.
    expect(writer.getAlt(X)).toBe(77);
  });

  it("applies every operator, with divv and modd for the arithmetic ones", () => {
    const cases: [AssignOperator, number, number][] = [
      ["=", 7, 5],
      ["+=", 7, 12],
      ["-=", 7, 2],
      ["*=", 7, 35],
      // divv(7, 5) is 1 and modd(7, 5) is 2 - floor division, not truncation.
      ["/=", 7, 1],
      ["%=", 7, 2],
      [".+=", 0b1100, 0b1101], // 12 | 5
      [".-=", 0b1111, 0b1010], // 15 & ~5
    ];
    for (const [operator, initial, expected] of cases) {
      slices.open();
      writer.reset(13);
      writer.set(X, initial);
      slices.defer(writer, X, 5, operator);
      slices.close();
      expect(writer.get(X), `${initial} ${operator}= 5`).toBe(expected);
    }
  });

  it("divides and mods with divv and modd, not JS operators", () => {
    // JS `/` truncates toward zero and `%` takes the sign of the dividend; Cual floors both
    // and documents the difference. A queued `/=` and `%=` must not use the built-ins.
    slices.open();
    writer.reset(13);
    writer.set(X, -7);
    slices.defer(writer, X, 3, "/=");
    slices.close();
    expect(writer.get(X)).toBe(divv(-7, 3));
    expect(writer.get(X)).toBe(-3);
  });

  it("clears the queue when the next window opens, as gZZAnz = 0 does", () => {
    writer.set(X, 1);
    slices.defer(writer, X, 99, "=");
    expect(slices.pending).toBe(1);
    // The write is superseded: the queue is reset, not drained.
    slices.open();
    expect(slices.pending).toBe(0);
    slices.close();
    expect(writer.get(X)).toBe(1);
  });

  it("still counts pending entries after a close, which is upstream's gZZAnz", () => {
    // Faithful rather than tidy. Clearing on close would make `pending` mean "writes this
    // window" where upstream means "writes not yet superseded by the next open".
    slices.defer(writer, X, 1, "=");
    slices.close();
    expect(slices.pending).toBe(1);
  });

  it("abandons the queue on abort, so a failed window applies nothing", () => {
    // `abbruchGleichzeitig` is called from upstream's error constructor. Without it a failed
    // step would still apply whatever had been queued before the failure - which is worse
    // than not applying the queue at all.
    writer.set(X, 1);
    slices.defer(writer, X, 99, "=");
    slices.abort();
    expect(slices.pending).toBe(0);
    expect(() => slices.close()).toThrow();
    expect(writer.get(X)).toBe(1);
  });

  it("writes to whichever blob was queued, not to the last one touched", () => {
    // The queue holds the blob, not just the slot. Two blobs, two slots, one queue.
    writer.set(X, 1);
    other.set(Y, 2);
    slices.defer(other, Y, 20, "+=");
    slices.defer(writer, X, 10, "+=");
    slices.close();
    expect(writer.get(X)).toBe(11);
    expect(other.get(Y)).toBe(22);
  });

  it("gives each blob its own shadow across a cross-blob window", () => {
    // Two blobs, one window, each preserving on its own first write. The point of the whole
    // design: same kind, same compiled tree, same slot numbers, independent state.
    writer.set(X, 1);
    other.set(X, 100);
    slices.open(); // a new slice begins with writer.X = 1 and other.X = 100
    writer.set(X, 2);
    other.set(X, 200);
    slices.defer(writer, X, 42, "=");
    slices.close();
    // Each blob's shadow is its own, from its own first write in this slice.
    expect(writer.getAlt(X)).toBe(1);
    expect(other.getAlt(X)).toBe(100);
    expect(writer.get(X)).toBe(42);
    expect(other.get(X)).toBe(200);
  });
});

describe("cual.6's six examples, with the deferred writes in place", () => {
  const slices = new TimeSlices();
  const store = new BlobStore(20, 13, slices);
  const X = SPECIAL_VARIABLE_COUNT;

  beforeEach(() => {
    slices.open();
    store.reset(13);
  });

  it("2) X@(0, 0) += 1 sets X one more than the value just before the change", () => {
    store.set(X, 5);
    slices.open();
    // The right-hand side is the literal 1, so the queue holds 1 and the operation.
    slices.defer(store, X, 1, "+=");
    // Mid-step, X has moved on - which the documented result depends on.
    store.set(X, 9);
    expect(store.get(X)).toBe(9);
    slices.close();
    // "one more than the value of X just before the change" - not 6, and not 10.
    expect(store.get(X)).toBe(10);
  });

  it("5) X@(0, 0) = X + 1 sets X one more than the *current* value", () => {
    store.set(X, 5);
    slices.open();
    // The right-hand side is evaluated immediately, so the queue holds a literal 6.
    slices.defer(store, X, store.get(X) + 1, "=");
    store.set(X, 9);
    slices.close();
    expect(store.get(X)).toBe(6);
  });

  it("6) X@(0, 0) = X@(0, 0) + 1 sets X one more than the beginning-of-step value", () => {
    store.set(X, 5);
    slices.open();
    store.set(X, 9);
    // Both sides are evaluated immediately: the read is the shadow, the result a literal.
    slices.defer(store, X, store.getAlt(X) + 1, "=");
    slices.close();
    expect(store.get(X)).toBe(6);
  });

  it("2), 5) and 6) all agree, which is the difference from 1) and 3) they exist to show", () => {
    // The man page's point is that a deferred write ignores what happens in between. All
    // three produce 6 from X = 5 at the start of the step and X = 9 mid-step, while 1) and 3)
    // produce 10.
    store.set(X, 5);
    slices.open();
    store.set(X, 9);
    slices.defer(store, X, 1, "+=");
    slices.defer(store, X, store.getAlt(X) + 1, "=");
    slices.close();
    expect(store.get(X)).toBe(6);
  });

});
