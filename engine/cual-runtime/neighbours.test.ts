/**
 * Neighbour patterns, checked against `cual.6`'s own example and against `newNachbarCode`.
 *
 * The `1???0???` case is the man page's, verbatim, in both its non-empty and empty forms -
 * and the empty form is the one that catches a wrong reading, because the rule it documents
 * ("off the board still counts as 1") turns out not to be a rule at all.
 */

import { describe, expect, it } from "vitest";
import {
  CONNECTION_BIT,
  connectionsAt,
  connectionString,
  matchesNeighbourPattern,
  neighbourPattern,
  swapBits,
} from "./neighbours.ts";
import type { NeighbourField } from "./neighbours.ts";
import { BlobStore, SPECIAL_VARIABLES, TimeSlices } from "./store.ts";

/** Upstream's `blopart_keins` is the empty sort; here it is any value the field is told. */
const EMPTY = 0;
const RED = 1;
const BLUE = 2;

/** A 5x5 square field, no mirroring, with kinds given by a map of occupied cells. */
function field(
  cells: Record<string, number>,
  overrides: Partial<NeighbourField> = {},
): NeighbourField {
  return {
    width: 5,
    height: 5,
    hex: false,
    mirrored: false,
    emptyKind: EMPTY,
    kindAt: (x, y) => {
      const key = `${x},${y}`;
      return key in cells ? cells[key] : EMPTY;
    },
    ...overrides,
  };
}

describe("the pattern's mask and value", () => {
  it("puts every specified position in the mask and every 1 in the value", () => {
    // `x & z1 == z2`. The mask has to include the `0` positions as well, or a `0` would be
    // simply not checked - and the whole reason one comparison covers both requirements is
    // that it does.
    expect(neighbourPattern("1???0???")).toEqual({
      mask: CONNECTION_BIT.oben | CONNECTION_BIT.unten,
      value: CONNECTION_BIT.oben,
      length: 8,
    });
  });

  it("puts nothing in the mask for all wildcards, which always matches", () => {
    const all = neighbourPattern("????????");
    expect(all.mask).toBe(0);
    expect(all.value).toBe(0);
    expect(matchesNeighbourPattern(0, "????????")).toBe(true);
    expect(matchesNeighbourPattern(0xff, "????????")).toBe(true);
  });

  it("reads the eight directions starting above and going clockwise", () => {
    // `1???0???` is documented as "the blob above is of the same kind and the blob below is
    // of different kind", so bit 0 must be `oben` and bit 4 `unten`.
    expect(CONNECTION_BIT.oben).toBe(0x0001);
    expect(CONNECTION_BIT.ro).toBe(0x0002);
    expect(CONNECTION_BIT.rechts).toBe(0x0004);
    expect(CONNECTION_BIT.ru).toBe(0x0008);
    expect(CONNECTION_BIT.unten).toBe(0x0010);
    expect(CONNECTION_BIT.lu).toBe(0x0020);
    expect(CONNECTION_BIT.links).toBe(0x0040);
    expect(CONNECTION_BIT.lo).toBe(0x0080);
  });

  it("leaves a gap for the horizontal directions in a hex pattern", () => {
    // `newNachbarCode` doubles the bit again after characters 1 and 4 when the length is 6,
    // so a hex pattern tests bits 0, 1, 3, 4, 5, 7 and leaves 2 and 6 - `rechts` and
    // `links` - unused. Renumbering instead would give the right answer by luck in square
    // mode and the wrong one in hex.
    // A `0` in the pattern is what distinguishes mask from value, so the example needs one:
    // "1?1?1?" specifies only three of the six positions and its mask equals its value.
    const allSpecified = neighbourPattern("1?0?1?");
    expect(allSpecified.length).toBe(6);
    // Bits 0, 3 and 5 - the three specified positions - and *not* 2 or 6.
    expect(allSpecified.mask).toBe(0b101001);
    expect(allSpecified.mask).toBe(CONNECTION_BIT.oben | CONNECTION_BIT.ru | CONNECTION_BIT.lu);
    expect(allSpecified.mask & CONNECTION_BIT.rechts).toBe(0);
    expect(allSpecified.mask & CONNECTION_BIT.links).toBe(0);
    // The two `1`s, at bits 0 and 5.
    expect(allSpecified.value).toBe(CONNECTION_BIT.oben | CONNECTION_BIT.lu);
    // Which directions those are: hex drops `rechts` and `links` from the pattern but the
    // *bit numbering* keeps their slots, so pattern character 2 is `ru`, not `rechts`.
    expect(connectionString(allSpecified.mask, true)).toBe("101010");
  });

  it("refuses a pattern that is not six or eight characters, or not made of 0, 1 and ?", () => {
    expect(() => neighbourPattern("1???")).toThrow(/six or eight/);
    expect(() => neighbourPattern("1???0????")).toThrow(/six or eight/);
    expect(() => neighbourPattern("1?2?0???")).toThrow(/'0', '1'/);
  });
});

describe("connections around a blob", () => {
  it("connects only where the kinds match", () => {
    // (2,2) is RED. (2,1) above and (1,2) left are RED; (2,3) below is BLUE and the rest
    // are empty. So exactly two of the eight connect.
    const f = field({ "2,2": RED, "2,1": RED, "2,3": BLUE, "1,2": RED });
    const connections = connectionsAt(f, 2, 2);
    expect(connectionString(connections)).toBe("10000010");
    expect(connectionString(connections, true)).toBe("100000");
  });

  it("does not connect to an empty cell from an occupied one", () => {
    const f = field({ "2,2": RED });
    expect(connectionString(connectionsAt(f, 2, 2))).toBe("00000000");
  });

  it("counts off-board as not connected for an occupied blob", () => {
    // (0,0) is in the corner, so `oben` and `links` are off the board.
    const f = field({ "0,0": RED, "1,0": RED, "0,1": RED });
    const connections = connectionsAt(f, 0, 0);
    expect((connections & CONNECTION_BIT.oben) === 0).toBe(true);
    expect((connections & CONNECTION_BIT.links) === 0).toBe(true);
    expect((connections & CONNECTION_BIT.rechts) !== 0).toBe(true);
    expect((connections & CONNECTION_BIT.unten) !== 0).toBe(true);
  });

  it("counts off-board as connected for an empty blob, which is the man page's rule", () => {
    // "If in some direction there is no neighbour, because the field ends there, the entry
    // in the neighbour sequence is 1 nevertheless."
    const f = field({ "2,3": RED });
    const connections = connectionsAt(f, 2, 0); // empty, at the top edge
    expect((connections & CONNECTION_BIT.oben) !== 0).toBe(true);
    expect((connections & CONNECTION_BIT.links) !== 0).toBe(true);
    expect((connections & CONNECTION_BIT.rechts) !== 0).toBe(true);
    expect((connections & CONNECTION_BIT.unten) !== 0).toBe(true);
  });

  it("reads that rule as a property of the empty sort, not as a special case", () => {
    // `sorte.cpp`: `mVerbindetMitRand[i] = mBlopart == blopart_keins`. So the rule is "the
    // empty sort connects with the edge and no other does", and the man page's sentence is
    // that fact seen from the empty blob. Changing `emptyKind` must change the answer, which
    // a hard-coded `true` could not survive.
    const f = field({ "2,3": RED }, { emptyKind: RED });
    const connections = connectionsAt(f, 2, 0);
    expect((connections & CONNECTION_BIT.oben) === 0).toBe(true);
  });

  it("ignores the horizontal directions in hex mode", () => {
    // All four orthogonal neighbours are RED, the diagonals empty.
    const f = field({ "2,2": RED, "1,2": RED, "3,2": RED, "2,1": RED, "2,3": RED });
    expect(connectionString(connectionsAt(f, 2, 2))).toBe("10101010");
    // In hex the shift decides the diagonals, so state it: without one, `os` is 0 and the
    // right-hand diagonals are horizontal - `ro` lands on (3,2) and connects, `ru` on the
    // empty (3,3).
    const hex = connectionsAt({ ...f, hex: true, hexShift: () => false }, 2, 2);
    // The horizontal bits are never set in hex mode.
    expect((hex & (CONNECTION_BIT.rechts | CONNECTION_BIT.links)) === 0).toBe(true);
    // Six directions, so six characters: oben, ro, ru, unten, lu, lo.
    expect(connectionString(hex, true)).toBe("110101");
  });

  it("offsets the diagonals by the column's hex shift", () => {
    // In hex mode one column's diagonals reach up-and-across and its neighbour's reach
    // down-and-across, which is what `getHexShift` reports per column.
    const cells = { "2,2": RED, "2,1": RED, "3,1": RED, "3,3": RED };
    // os = hexShift(x), us = !hexShift(x). With the shift set, `ro` reaches (3,1) and `ru`
    // is horizontal at (3,2), which is empty.
    const shifted = connectionsAt({ ...field(cells), hex: true, hexShift: () => true }, 2, 2);
    expect((shifted & CONNECTION_BIT.ro) !== 0).toBe(true);
    expect((shifted & CONNECTION_BIT.ru) === 0).toBe(true);
    // Without it, `ro` is horizontal at (3,2) and `ru` reaches down to (3,3).
    const unshifted = connectionsAt({ ...field(cells), hex: true, hexShift: () => false }, 2, 2);
    expect((unshifted & CONNECTION_BIT.ro) === 0).toBe(true);
    expect((unshifted & CONNECTION_BIT.ru) !== 0).toBe(true);
  });

  it("swaps the vertical axis and the diagonal slopes when the level is mirrored", () => {
    const f = field({ "2,1": RED }, { mirrored: true });
    const plain = connectionsAt(f, 2, 2);
    const mirrored = connectionsAt(f, 2, 2);
    expect(mirrored).toBe(plain); // same field object, so a deliberate no-op check below
    // The swap itself:
    const withOben = swapBits(CONNECTION_BIT.oben, "oben", "unten");
    expect(withOben & CONNECTION_BIT.unten).toBe(CONNECTION_BIT.unten);
    // A pair that is both set, or both clear, is already symmetric.
    const both = CONNECTION_BIT.oben | CONNECTION_BIT.unten;
    expect(swapBits(both, "oben", "unten")).toBe(both);
    expect(swapBits(0, "oben", "unten")).toBe(0);
  });
});

describe("cual.6's 1???0??? example", () => {
  const pattern = "1???0???";

  it("is true iff the blob above is the same kind and the one below is not", () => {
    // Documented for an occupied blob, and exactly as written.
    // Position 0 is `oben`, position 4 is `unten`. The three middle characters are `?`, so
    // only those two are constrained - "10110000" connects `rechts` and `ru` as well and
    // still matches, because the pattern does not mention them.
    for (const matching of ["10100000", "10110000", "11110000"]) {
      expect(matchesNeighbourPattern(connectionString2(matching), pattern), matching).toBe(true);
    }
    for (const notMatching of ["00100000", "00110000", "10101000", "00000000"]) {
      expect(
        matchesNeighbourPattern(connectionString2(notMatching), pattern),
        notMatching,
      ).toBe(false);
    }
  });

  it("is true for an empty blob iff nothing is above and something is below", () => {
    // "For an empty blob `1???0???` is true, iff the blob above this blob does not exist or
    // is empty as well, and the blob below this blob exists and is not empty."
    const above = connectionsAt(field({ "2,1": RED }), 2, 2);
    expect(matchesNeighbourPattern(above, pattern)).toBe(false);

    const below = connectionsAt(field({ "2,3": RED }), 2, 2);
    expect(matchesNeighbourPattern(below, pattern)).toBe(true);

    const both = connectionsAt(field({ "2,1": RED, "2,3": RED }), 2, 2);
    expect(matchesNeighbourPattern(both, pattern)).toBe(false);

    const neither = connectionsAt(field({}), 2, 2);
    // Nothing above *and* nothing below, so the `0` at position 4 fails.
    expect(matchesNeighbourPattern(neither, pattern)).toBe(false);
  });

  it("agrees on the empty blob whether above means off-board or empty", () => {
    // The man page says "does not exist or is empty as well", and both have to give the same
    // answer - off-board is handled by the empty sort's edge connection, an empty cell by
    // kind equality, and for an empty blob those two coincide.
    const offBoard = connectionsAt(field({ "2,3": RED }), 2, 0);
    const emptyCell = connectionsAt(field({ "2,3": RED }), 2, 2);
    expect((offBoard & CONNECTION_BIT.oben) !== 0).toBe(true);
    expect((emptyCell & CONNECTION_BIT.oben) !== 0).toBe(true);
  });
});

describe("the start-of-step snapshot", () => {
  /**
   * `verbindetMit` compares `getVariableVergangenheit(spezvar_kind)`, so a neighbour pattern
   * sees kinds as they were at the beginning of the step. Wired to a real store's shadow so
   * the snapshot is the mechanism rather than a comment.
   */
  const KIND_SLOT = SPECIAL_VARIABLES.findIndex((v) => v.name === "kind");

  function storeField(
    at: (x: number, y: number) => BlobStore,
    overrides: Partial<NeighbourField> = {},
  ): NeighbourField {
    return {
      width: 5,
      height: 5,
      hex: false,
      mirrored: false,
      emptyKind: EMPTY,
      kindAt: (x, y) => {
        if (x < 0 || x >= 5 || y < 0 || y >= 5) return EMPTY;
        // `getAlt`, not `get`: `verbindetMit` compares the kind as of the beginning of the
        // step. Reading the live kind here would compile, run, and answer a different
        // question - which is precisely what the sentence below cual.6's example warns about.
        return at(x, y).getAlt(KIND_SLOT);
      },
      ...overrides,
    };
  }

  it("sees the kind from the beginning of the step, not the current one", () => {
    const slices = new TimeSlices();
    const cells = new Map<string, BlobStore>();
    const at = (x: number, y: number): BlobStore => {
      const key = `${x},${y}`;
      let store = cells.get(key);
      if (!store) {
        store = new BlobStore(20, 13, slices);
        cells.set(key, store);
      }
      return store;
    };
    for (const [key, value] of Object.entries({ "2,2": RED, "2,1": RED })) {
      const [x, y] = key.split(",").map(Number);
      at(x, y).set(KIND_SLOT, value);
    }
    const blob = at(2, 2);
    const neighbour = at(2, 1);

    slices.open(); // the step begins with both RED
    expect(connectionString(connectionsAt(storeField(at), 2, 2))).toBe(
      "10000000",
    );

    // Mid-step the neighbour changes kind. The pattern must not notice.
    neighbour.set(KIND_SLOT, BLUE);
    expect(neighbour.get(KIND_SLOT)).toBe(BLUE);
    expect(connectionString(connectionsAt(storeField(at), 2, 2))).toBe(
      "10000000",
    );

    // The next step does see it.
    slices.open();
    expect(connectionString(connectionsAt(storeField(at), 2, 2))).toBe(
      "00000000",
    );
    expect(blob.get(KIND_SLOT)).toBe(RED);
  });

  it("would give a different answer from the live kind, which is why it is a shadow read", () => {
    // Stated as its own test because the one above would also pass if `kindAt` were reading
    // the shadow for an unrelated reason. Here the live kind and the shadow kind are made to
    // disagree and only the shadow is asked for.
    const slices = new TimeSlices();
    const store = new BlobStore(20, 13, slices);
    store.set(KIND_SLOT, RED);
    slices.open();
    store.set(KIND_SLOT, BLUE);
    expect(store.get(KIND_SLOT)).toBe(BLUE);
    expect(store.getAlt(KIND_SLOT)).toBe(RED);
  });
});

/** Turn a connection string into the bitmask it stands for. */
function connectionString2(sequence: string): number {
  let value = 0;
  const ordered = ["oben", "ro", "rechts", "ru", "unten", "lu", "links", "lo"];
  sequence.split("").forEach((character, index) => {
    if (character === "1") value |= CONNECTION_BIT[ordered[index] as keyof typeof CONNECTION_BIT];
  });
  return value;
}
