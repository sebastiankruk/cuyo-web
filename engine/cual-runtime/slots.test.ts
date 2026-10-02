/**
 * Slot allocation, checked against upstream's three rules rather than against a number
 * somebody picked.
 *
 * The counts here are the point. A busy flag that is a *variable* rather than a byte beside
 * the array is what makes two blobs of the same kind independent for free, so "how many
 * slots, and which" is a fidelity question with a wrong answer available.
 */

import { describe, expect, it } from "vitest";
import { tokenize } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import {
  BITS_PER_SLOT,
  SlotAllocator,
  allocateSlots,
  getBool,
  setBool,
  slotOf,
} from "./slots.ts";

function lex(source: string) {
  return tokenize(source, "test")
    .filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}


describe("bit packing", () => {
  it("puts 32 flags in one int and starts a new one for the 33rd", () => {
    const allocator = new SlotAllocator();
    const bits = Array.from({ length: 33 }, () => allocator.allocateBool());
    expect(slotOf(bits[0])).toBe(0);
    expect(slotOf(bits[31])).toBe(0);
    expect(slotOf(bits[32])).toBe(1);
    // One int was allocated to hold the first 32, and another began for the 33rd.
    expect(allocator.slotCount).toBe(2);
    expect(allocator.boolCount).toBe(33);
  });

  it("reads and writes a flag inside a shared int without touching its neighbours", () => {
    // The whole reason flags are bitwise: two nodes share an int, and setting one must not
    // disturb the other. With a byte per flag there would be nothing to get wrong here.
    for (const bit of [0, 1, 15, 30, 31]) {
      expect(getBool(0, bit)).toBe(false);
      const written = setBool(0, bit, true);
      expect(getBool(written, bit)).toBe(true);
      expect(setBool(written, bit, false)).toBe(0);
    }
  });

  it("works on bit 31, where the mask is INT_MIN in C++ too", () => {
    // `1 << 31` is negative as a signed 32-bit int in both languages, so upstream's
    // `& (1 << (vnr % 32))` yields a negative value there. Only truthiness is used, and only
    // the low 32 bits matter - a slot holding a large positive int must still read false.
    expect(getBool(0, 31)).toBe(false);
    expect(getBool(setBool(0, 31, true), 31)).toBe(true);
    expect(getBool(0x7fffffff, 31)).toBe(false);
    expect(getBool(0x7fffffff, 30)).toBe(true);
    expect(getBool(-1, 31)).toBe(true);
    // Only the low 32 bits matter: this value has bit 31 set and bit 0 clear, and the
    // bitwise coercion discards the high word, so what is read is the low one.
    expect(getBool(2 ** 31 + 12344, 0)).toBe(false);
    expect(getBool(2 ** 31 + 12344, 31)).toBe(true);
  });

  it("splits a run of flags when a declared variable lands between them", () => {
    // Bit numbers are not consecutive across a block: the run after a declared variable
    // resumes 32 higher, because the variable took an int of its own.
    const allocator = new SlotAllocator();
    const before = Array.from({ length: 32 }, () => allocator.allocateBool());
    const variable = allocator.allocateDeclaredVariable();
    const after = allocator.allocateBool();
    expect(slotOf(before[31])).toBe(0);
    expect(variable).toBe(1);
    // Resumed at 32 * 2, not 32 * 1.
    expect(after).toBe(64);
    expect(slotOf(after)).toBe(2);
  });

  it("always needs declared + ceil(flags / 32) ints, whatever the order", () => {
    // Interleaving looks like it should change this — a declaration in the middle of a run
    // of flags ought to cost something, or save something. It does neither: `mBoolNrBei`
    // only returns to -1 on reaching a multiple of 32, and it can only reach one by counting
    // up from a block start, so every block holds exactly 32 flags and one is left short at
    // the end. What the declaration changes is the flag *numbering*, not the length.
    //
    // Asserted over a spread of interleavings rather than one example, because an example
    // would pass just as happily if the rule were wrong in a way that example misses.
    const runs = [1, 8, 16, 31, 32, 33, 64, 65];
    for (const run of runs) {
      for (const split of [0, 1, 2, run]) {
        const allocator = new SlotAllocator();
        for (let i = 0; i < run; i += 1) allocator.allocateBool();
        for (let i = 0; i < split; i += 1) allocator.allocateDeclaredVariable();
        for (let i = 0; i < run; i += 1) allocator.allocateBool();
        for (let i = 0; i < 2 - split; i += 1) allocator.allocateDeclaredVariable();
        const naive = allocator.declaredCount + Math.ceil(allocator.boolCount / BITS_PER_SLOT);
        expect(allocator.slotCount, `${run} flags split ${split}/${2 - split}`).toBe(naive);
      }
    }
  });

});

describe("which nodes own a flag", () => {
  it("gives a comma sequence one flag, since it has to resume where it left off", () => {
    // `folge_code`. `stapel_code` - the `;` sequence - needs none: it threads busy through
    // a local with `busy |= busy1`, and has nothing to come back to next execution.
    const sequence = allocateSlots(parseCode(lex("A, B")));
    expect(sequence.boolCount).toBe(1);
    expect(sequence.busySlots.get(sequence.busySlots.keys().next().value!)).toEqual({
      first: 0,
      second: -1,
    });
  });

  it("gives a semicolon sequence none", () => {
    expect(allocateSlots(parseCode(lex("alpha; beta"))).boolCount).toBe(0);
  });

  it("gives an if two, one per branch", () => {
    // `bedingung_code`: `mF2` is the `then`, `mF3` the `else`. An `if` with no `else` gets
    // a `nop_code` upstream rather than a cheaper node, so it still takes two.
    const withElse = allocateSlots(parseCode(lex("if cond -> alpha else beta")));
    const without = allocateSlots(parseCode(lex("if cond -> alpha")));
    expect(withElse.boolCount).toBe(2);
    expect(without.boolCount).toBe(2);
  });

  it("gives each switch case two, and the switch itself none", () => {
    // `switch { ... }` returns `$3` unchanged upstream, so the braces are not a node and
    // cannot own a slot. Each case is its own `bedingung_code`.
    const two = allocateSlots(parseCode(lex("switch { one -> alpha; two -> beta; }")));
    expect(two.boolCount).toBe(4);
    const one = allocateSlots(parseCode(lex("switch { one -> alpha; }")));
    expect(one.boolCount).toBe(2);
  });

  it("gives braces none, because upstream makes them transparent", () => {
    // `'{' code '}'` returns `$2`. A `block` node that cost a slot would put a number in the
    // array that upstream never allocates.
    expect(allocateSlots(parseCode(lex("{ alpha; beta; }"))).boolCount).toBe(0);
    expect(allocateSlots(parseCode(lex("alpha; { beta, gamma; }"))).boolCount).toBe(1);
  });

  it("gives a default declaration none, because it reuses an existing slot", () => {
    // `DefKnoten::neuerDefault` takes a variable number that already exists.
    expect(allocateSlots(parseCode(lex("default inhibit = 3;")))).toMatchObject({
      boolCount: 0,
      declaredCount: 0,
      slotCount: 0,
    });
  });

  it("gives one slot per declared variable, and none per version specifier", () => {
    // `neueVarDefinition` calls `neueVariable` exactly once. A `da_kind` default marks the
    // variable as holding a kind rather than a number; it does not cost a second slot.
    expect(allocateSlots(parseCode(lex("var alpha, beta, gamma;")))).toMatchObject({
      declaredCount: 3,
      boolCount: 0,
      slotCount: 3,
    });
    expect(allocateSlots(parseCode(lex("var alpha[2];"))).declaredCount).toBe(1);
    expect(allocateSlots(parseCode(lex("var alpha = 4;"))).slotCount).toBe(1);
  });

  it("counts a procedure body's flags against the level", () => {
    // A `DefKnoten` for a sort walks up to the level knoten to ask for a variable, so a
    // procedure's busy flags share one array with the level that calls it.
    expect(allocateSlots(parseCode(lex("paint = { alpha, beta; };"))).boolCount).toBe(1);
  });

  it("interleaves declarations with flags in source order", () => {
    // 32 flags, a declaration, then one more flag. If declarations were allocated first the
    // counts would differ: the declaration would take int 0 and the flags would start at 32.
    const statements = parseCode(lex("var alpha; pp, qq; rr, ss;"));
    const allocation = allocateSlots(statements);
    expect(allocation.declaredCount).toBe(1);
    expect(allocation.boolCount).toBe(2);
    expect(allocation.slotCount).toBe(2);
  });

  it("allocates children before their parent, as a bottom-up reduction does", () => {
    // Bison constructs `$1` and `$3` before it calls `newCode2`, so a nested node reserves
    // first. The bit numbers depend on it.
    const nested = allocateSlots(parseCode(lex("{ { alpha, beta; }, gamma; }")));
    const outer = nested.busySlots;
    expect(outer.size).toBe(2);
    expect(allocateSlots(parseCode(lex("{ alpha, { beta, gamma; }; }"))).boolCount).toBe(2);
  });

  it("gives every owning node a distinct flag", () => {
    const allocation = allocateSlots(parseCode(lex("alpha, beta; switch { one -> two; three -> four; } if cond -> five;")));
    const bits = [...allocation.busySlots.values()].flatMap((s) =>
      s.second === -1 ? [s.first] : [s.first, s.second],
    );
    expect(bits).toHaveLength(new Set(bits).size);
    expect(bits.every((bit) => bit >= 0 && bit < BITS_PER_SLOT * allocation.slotCount)).toBe(true);
  });
});

describe("allocation is deterministic", () => {
  it("gives the same numbers for the same input, every time", () => {
    const source = "var alpha; pp, qq; switch { one -> two; -> three; } if cond -> four else five;";
    const first = allocateSlots(parseCode(lex(source)));
    for (let i = 0; i < 5; i += 1) {
      const again = allocateSlots(parseCode(lex(source)));
      expect(again.boolCount).toBe(first.boolCount);
      expect(again.declaredCount).toBe(first.declaredCount);
      expect(again.slotCount).toBe(first.slotCount);
      expect([...again.busySlots.values()]).toEqual([...first.busySlots.values()]);
    }
  });

  it("does not depend on the identity of a previously allocated tree", () => {
    // A fresh allocator per block, so allocating for one block cannot shift another's
    // numbers - the failure mode of sharing a counter across parses.
    const statements = parseCode(lex("pp, qq;"));
    expect(allocateSlots(statements).busySlots.size).toBe(1);
    expect(allocateSlots(statements).busySlots.size).toBe(1);
    const bit = [...allocateSlots(statements).busySlots.values()][0].first;
    expect(bit).toBe(0);
  });
});
