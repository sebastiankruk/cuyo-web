/**
 * The constant tables, checked name-by-name against the `#define`s they come from.
 *
 * Upstream holds these as two parallel arrays, so every value has a positional relationship
 * to a name. That is the failure mode worth guarding: a row inserted into `const_namen` and
 * not `const_werte` shifts every name after it onto the wrong value, and nothing complains —
 * the level loads and animates wrongly.
 */

import { describe, expect, it } from "vitest";
import {
  BLOPART_FARBE,
  BLOPART_MIN_CUAL,
  BLOPART_MIN_SORTE,
  CUAL_CONSTANTS,
  CUAL_CONSTANT_COUNT,
  lookupConstant,
  resolveConstant,
} from "./const-tables.ts";

/** The count arithmetic from knoten.cpp, spelled out so the 60 is not a magic number. */
const EXPECTED_COUNTS = { quarter: 21, kind: 5, direction: 18, behaviour: 6, neighbours: 10 };

describe("the tables", () => {
  it("hold const_anz names, in knoten.cpp's groups", () => {
    // `#define const_anz (21+5+2*9+6+nachbarschaft_letzte+1)` with `nachbarschaft_letzte` 9.
    expect(21 + 5 + 2 * 9 + 6 + 9 + 1).toBe(CUAL_CONSTANT_COUNT);
    expect(CUAL_CONSTANTS).toHaveLength(CUAL_CONSTANT_COUNT);
    for (const [group, count] of Object.entries(EXPECTED_COUNTS)) {
      expect(CUAL_CONSTANTS.filter((c) => c.group === group), group).toHaveLength(count);
    }
  });

  it("has no duplicate names, which a shifted parallel array would produce", () => {
    const names = CUAL_CONSTANTS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("starts with the quarters, in knoten.cpp's order", () => {
    expect(CUAL_CONSTANTS.slice(0, 5).map((c) => c.name)).toEqual([
      "Q_ALL",
      "Q_TL",
      "Q_TR",
      "Q_BL",
      "Q_BR",
    ]);
  });
});

describe("quarter selectors", () => {
  it("has Q_ALL as viertel_alle, which is -1", () => {
    // `#define viertel_alle (-1)` in bilddatei.h.
    expect(resolveConstant("Q_ALL")).toBe(-1);
  });

  it("puts the four corners at 0, 5, 10 and 15", () => {
    // The two-bit row-major index of a quarter: TL is row 0 col 0, TR is row 0 col 2.
    expect(resolveConstant("Q_TL")).toBe(0);
    expect(resolveConstant("Q_TR")).toBe(5);
    expect(resolveConstant("Q_BL")).toBe(10);
    expect(resolveConstant("Q_BR")).toBe(15);
  });

  it("gives the sixteen combined quarters the values 0 to 15", () => {
    // `Q_<outer>_<inner>`, where each half is one of TL, TR, BL, BR. The sixteen run 0..15 in
    // name order. What the numbers *select* is not asserted here - see the corner test below,
    // which is where the reasoning that failed is recorded.
    const sixteen = CUAL_CONSTANTS.filter((c) => /^Q_\w+_\w+$/.test(c.name));
    expect(sixteen).toHaveLength(16);
    expect(sixteen.map((c) => c.value)).toEqual([...sixteen].map((_, i) => i));
    expect(CUAL_CONSTANTS.filter((c) => c.group === "quarter")).toHaveLength(21);
  });

  it("does not guess at the geometry behind the four bare corners", () => {
    // The corners are 0, 5, 10 and 15 — not 0, 4, 8 and 12, which is what "the first, second,
    // third and fourth quadrant" would suggest, and not the 0b0000/0b0101/0b1010/0b1111 that
    // "a four-bit mask over the four sub-positions" would suggest either. Both models were
    // tried here and both are wrong: `Q_TR_TL` is 1, which the mask model puts at 5.
    //
    // So no model is asserted. What is asserted is the numbers, because that is what 4.6 is
    // for: a name must resolve to the value knoten.cpp gives it. What a quarter selector
    // *selects* is the renderer's question, and it belongs next to the renderer where it can
    // be checked against what is drawn rather than against a hypothesis.
    expect(["Q_TL", "Q_TR", "Q_BL", "Q_BR"].map(resolveConstant)).toEqual([0, 5, 10, 15]);
    // The combined quarters are 0..15 in name order, which is a fact about the table and not
    // an interpretation of it.
    const combined = CUAL_CONSTANTS.filter((c) => /^Q_\w+_\w+$/.test(c.name));
    expect(combined.map((c) => c.value)).toEqual(
      combined.map((_, index) => index),
    );
  });
});

describe("kind names", () => {
  it("resolve to the blopart_* values in sorte.h", () => {
    // `blopart_keins` -1, `blopart_global` -2, `blopart_semiglobal` -3, `blopart_info` -4,
    // `blopart_ausserhalb` -5.
    expect(resolveConstant("nothing")).toBe(-1);
    expect(resolveConstant("global")).toBe(-2);
    expect(resolveConstant("semiglobal")).toBe(-3);
    expect(resolveConstant("info")).toBe(-4);
    expect(resolveConstant("outside")).toBe(-5);
  });

  it("keeps blopart_min_cual, min_sorte and farbe as separate bounds", () => {
    // Not names, so not in the table: `blopart_min_cual` is -1 and is the last kind Cual may
    // *assign*, `blopart_min_sorte` is -4 and is the last with a real Sorte behind it, and
    // `blopart_farbe` is -6. `outside` being unassignable is what min_cual means.
    expect(BLOPART_MIN_CUAL).toBe(-1);
    expect(BLOPART_MIN_SORTE).toBe(-4);
    expect(BLOPART_FARBE).toBe(-6);
    expect(resolveConstant("blopart_min_cual")).toBeNull();
  });
});

describe("the DIR_* masks", () => {
  it("gives each one its single bit, in the order the names are written", () => {
    // The name order is *not* the value order: `DIR_U` is bit 0 and `DIR_B` is bit 7 of the
    // low group, then `DIR_D` restarts at 0x00010000. Getting this wrong yields a plausible
    // mask that inhibits the wrong side.
    expect(resolveConstant("DIR_U")).toBe(0x00000001);
    expect(resolveConstant("DIR_UR")).toBe(0x00000002);
    expect(resolveConstant("DIR_R")).toBe(0x00000004);
    expect(resolveConstant("DIR_DR")).toBe(0x00000008);
    expect(resolveConstant("DIR_UUL")).toBe(0x00000010);
    expect(resolveConstant("DIR_UUR")).toBe(0x00000020);
    expect(resolveConstant("DIR_RRU")).toBe(0x00000040);
    expect(resolveConstant("DIR_RRD")).toBe(0x00000080);
    expect(resolveConstant("DIR_F")).toBe(0x00000100);
    expect(resolveConstant("DIR_D")).toBe(0x00010000);
    expect(resolveConstant("DIR_DL")).toBe(0x00020000);
    expect(resolveConstant("DIR_L")).toBe(0x00040000);
    expect(resolveConstant("DIR_UL")).toBe(0x00080000);
    expect(resolveConstant("DIR_DDR")).toBe(0x00100000);
    expect(resolveConstant("DIR_DDL")).toBe(0x00200000);
    expect(resolveConstant("DIR_LLD")).toBe(0x00400000);
    expect(resolveConstant("DIR_LLU")).toBe(0x00800000);
    expect(resolveConstant("DIR_B")).toBe(0x01000000);
  });

  it("gives every one a distinct single bit, so `.+` combines them", () => {
    const dirs = CUAL_CONSTANTS.filter((c) => c.group === "direction");
    expect(dirs).toHaveLength(18);
    const bits = new Set(dirs.map((c) => c.value));
    expect(bits.size).toBe(18);
    for (const dir of dirs) {
      // A single bit: either it or its negation, with nothing else set.
      const others = dirs.filter((d) => d.value !== dir.value);
      const combined = others.reduce((mask, d) => mask | d.value, 0);
      expect((dir.value & combined) & (dir.value - 1)).toBe(0);
    }
  });
});

describe("behaviour bits", () => {
  it("are the six platzt_*, berechne_*, verhindert_ and schwebt bits from blop.h", () => {
    // `#define platzt_bei_gewicht 1` … `#define schwebt 32`.
    expect(resolveConstant("explodes_on_size")).toBe(1);
    expect(resolveConstant("explodes_on_explosion")).toBe(2);
    expect(resolveConstant("explodes_on_chain_reaction")).toBe(4);
    expect(resolveConstant("calculate_size")).toBe(8);
    expect(resolveConstant("goalblob")).toBe(16);
    expect(resolveConstant("floats")).toBe(32);
  });

  it("are all of spezvar_verhalten, with room for one more", () => {
    const behaviours = CUAL_CONSTANTS.filter((c) => c.group === "behaviour");
    // Six single bits, 1 through 32, so `behaviour` fits in seven bits of the slot.
    expect(behaviours.map((c) => c.value)).toEqual([1, 2, 4, 8, 16, 32]);
    expect(behaviours.reduce((all, b) => all | b.value, 0)).toBe(63);
  });
});

describe("neighbour modes", () => {
  it("resolve to the nachbarschaft_* values, 0 through 9", () => {
    expect(resolveConstant("neighbours_rect")).toBe(0);
    expect(resolveConstant("neighbours_diagonal")).toBe(1);
    expect(resolveConstant("neighbours_hex6")).toBe(2);
    expect(resolveConstant("neighbours_hex4")).toBe(3);
    expect(resolveConstant("neighbours_knight")).toBe(4);
    expect(resolveConstant("neighbours_eight")).toBe(5);
    expect(resolveConstant("neighbours_3D")).toBe(6);
    expect(resolveConstant("neighbours_none")).toBe(7);
    expect(resolveConstant("neighbours_horizontal")).toBe(8);
    expect(resolveConstant("neighbours_vertical")).toBe(9);
  });

  it("keeps Cual's two names that do not match their macro", () => {
    // Cual writes `neighbours_eight` where the macro is `nachbarschaft_dame` (5) and
    // `neighbours_none` where it is `nachbarschaft_garnichts` (7). Chess again: a queen
    // attacks eight squares, and "garnichts" is nothing.
    expect(resolveConstant("neighbours_dame")).toBeNull();
    expect(resolveConstant("neighbours_garnichts")).toBeNull();
    expect(resolveConstant("neighbours_eight")).toBe(5);
    expect(resolveConstant("neighbours_none")).toBe(7);
  });

  it("counts ten of them, because nachbarschaft_letzte is vertical's own value", () => {
    // `#define nachbarschaft_letzte 9` is the same 9 as `nachbarschaft_vertical`, and
    // `const_anz` adds one to it.
    expect(resolveConstant("neighbours_vertical")).toBe(9);
    expect(CUAL_CONSTANTS.filter((c) => c.group === "neighbours")).toHaveLength(9 + 1);
  });
});

describe("resolution", () => {
  it("returns null for a name that is not a constant, so user variables are not shadowed", () => {
    expect(resolveConstant("my_var")).toBeNull();
    expect(resolveConstant("")).toBeNull();
    expect(resolveConstant("Q_TL_TL_TL")).toBeNull();
  });

  it("hands back the group as well, for a caller that wants it", () => {
    expect(lookupConstant("DIR_U")).toMatchObject({ value: 1, group: "direction" });
    expect(lookupConstant("nothing")).toMatchObject({ group: "kind" });
    expect(lookupConstant("my_var")).toBeNull();
  });

  it("resolves a name the corpus actually uses", () => {
    // `angst.ld` sets `kind = nothing` and `behaviour`, and the corpus writes `Q_TL` in
    // aehnlich.ld's draw sequences. If these stop resolving, the failure is at load time.
    for (const name of ["nothing", "Q_ALL", "Q_TL", "DIR_U", "floats", "goalblob"]) {
      expect(resolveConstant(name), name).not.toBeNull();
    }
  });
});
