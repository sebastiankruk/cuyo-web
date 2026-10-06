// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Reading a neighbour pattern out of a blob's array, against a live board.
 *
 * Task 4.16, and the last of the three constructs 4.13's compile gate found. 298 places across
 * 79 levels, and almost all of them are one line: `[qu = Q_TL] X*;` preceded by
 * `if 1???0??? ->`, so a level draws a different quarter of its icon depending on which sides
 * are connected. Getting the read wrong does not crash a level — it draws the wrong pixels.
 *
 * `cual.6`'s whole specification is:
 *
 * > `neighbour_pattern` is a sequence of six or eight characters `0`, `1` and `?`. It is true
 * > if the sequence fits to the neighbour sequence of the blob. […] Example: `1???0???` is true
 * > iff the blob above this blob is of the same kind and the blob below it is of different
 * > kind.
 * >
 * > For an empty blob the semantics is slightly different: If in some direction there is no
 * > neighbour, because the field ends there, the entry in the neighbour sequence is 1
 * > nevertheless. So for an empty blob `1???0???` is true, iff the blob above this blob does not
 * > exist or is empty as well, and the blob below this blob exists and is not empty.
 * >
 * > If some blob changes its kind during a step, the expression will still test the neighbours
 * > as they were at the beginning of the step.
 *
 * The pattern arithmetic and the connection rules are 3.10's and live in `neighbours.ts`,
 * tested there. What is here is the two things 4.16 added: `access.ts` reads a blob's
 * connections off a live board, and `expr.ts` turns the match into a number. Both are asserted
 * through the **real evaluator** on a **real board**, because a test that supplied its own
 * `neighbour` callback would be testing itself.
 */

import { describe, expect, it } from "vitest";
import { connectionsOf, neighbourReader } from "./access.ts";
import type { AccessField, Here } from "./access.ts";
import { connectionString, CONNECTION_SOLO } from "./neighbours.ts";
import { evaluate } from "./expr.ts";
import type { EvalContext, Expr } from "./expr.ts";
import { parseExpression } from "./parse.ts";
import { BlobStore, SPECIAL_VARIABLES, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";

const KIND = SPECIAL_VARIABLES.findIndex((v) => v.name === "kind");
const EMPTY = -1;

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/**
 * A 4x4 board, one blob per cell.
 *
 * `cells` is keyed `"x,y"` with a kind, so a test can lay out a neighbourhood and read the
 * pattern back. Absent cells get the *empty* kind rather than no cell at all, because upstream
 * every cell of a field holds a blob and `blopart_keins` is a real kind with a real sort — the
 * off-board rule and the empty rule are both about that one sort.
 *
 * **The slice is opened before it returns**, and that is not tidiness. `getAlt` reads the shadow
 * only when one was taken *in the current slice*, and `set` takes it — so a cell whose kind was
 * written before any slice existed reads back as whatever the store held before that write. The
 * level is laid down and then a step begins; this models that, and the alternative is a board
 * where every cell reports the same kind and every pattern trivially matches.
 */
function board(
  here: Here,
  cells: Record<string, number> = {},
  options: { hex?: boolean; mirrored?: boolean; hexShift?: (x: number) => boolean } = {},
): AccessField & { readonly stores: Map<string, BlobStore>; readonly slices: TimeSlices } {
  const slices = new TimeSlices();
  const stores = new Map<string, BlobStore>();
  const width = 4;
  const height = 4;
  const storeAt = (x: number, y: number): BlobStore => {
    const key = `${x},${y}`;
    let store = stores.get(key);
    if (!store) {
      store = new BlobStore(20, 13, slices);
      store.set(KIND, cells[key] ?? EMPTY);
      stores.set(key, store);
    }
    return store;
  };
  const global = new BlobStore(20, 13, slices);
  global.set(KIND, 99);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) storeAt(x, y);
  }
  slices.open();

  return {
    players: 1,
    width,
    height,
    hex: options.hex ?? false,
    mirrored: options.mirrored ?? false,
    hexShift: (_right, x) => options.hexShift?.(x) ?? false,
    global,
    fallCount: 0,
    here,
    semiglobal: () => null,
    at: (_right, x, y) => (x < 0 || x >= width || y < 0 || y >= height ? null : storeAt(x, y)),
    stores,
    slices,
  };
}

/** Evaluate a pattern through the real evaluator, on a real board. */
function pattern(field: AccessField, source: string): number {
  const ctx: EvalContext = {
    variable: () => {
      throw new Error("a neighbour pattern reads no variables");
    },
    random: () => 0,
    neighbour: neighbourReader(field),
  };
  return evaluate(parseExpression(lex(source)) as Expr, ctx);
}

describe("the man page's example", () => {
  it("1???0??? is true iff above is the same kind and below is not", () => {
    // Quoted at the top of this file. One blob of kind 1 at (1,1), kind 1 above it, kind 2
    // below: the two characters the pattern pins are '1' and '0', so it matches.
    const f = board({ kind: "cell", x: 1, y: 1, right: false }, { "1,1": 1, "1,0": 1, "1,2": 2 });
    expect(connectionString(connectionsOf(f))).toBe("10000000");
    expect(pattern(f, "1???0???")).toBe(1);

    // Swap the two and it does not: above differs, below matches — both characters wrong.
    const swapped = board({ kind: "cell", x: 1, y: 1, right: false }, { "1,1": 1, "1,0": 2, "1,2": 1 });
    expect(pattern(swapped, "1???0???")).toBe(0);
  });

  it("ignores every direction the pattern does not name", () => {
    // The `?`s. Only the two pinned characters can change the answer, so a board that differs in
    // all six other directions gives the same result as the board above.
    const f = board({ kind: "cell", x: 1, y: 1, right: false }, {
      "1,1": 1,
      "1,0": 1,
      "1,2": 2,
      "0,0": 3, "0,1": 3, "0,2": 3, "2,0": 3, "2,2": 3,
    });
    // Two connections only — and both of them are the pinned ones.
    expect(connectionString(connectionsOf(f))).toBe("10000000");
    expect(pattern(f, "1???0???")).toBe(1);
    expect(pattern(f, "1???????")).toBe(1);
    expect(pattern(f, "?????0??")).toBe(1);
  });

  it("a pattern of all `1`s is true only for a blob connected on every side", () => {
    // The eight-character form, and what distinguishes the neighbour *sequence* from "is there a
    // neighbour": a direction is a `1` when the two kinds **match**, not when a cell exists.
    const solid = board({ kind: "cell", x: 1, y: 1, right: false }, {
      "1,1": 1,
      "0,0": 1, "1,0": 1, "2,0": 1, "0,1": 1, "2,1": 1, "0,2": 1, "1,2": 1, "2,2": 1,
    });
    expect(connectionString(connectionsOf(solid))).toBe("11111111");
    expect(pattern(solid, "11111111")).toBe(1);
    // One cell off and the whole-character pattern fails, which is what makes it a useful test
    // for a level asking "am I completely surrounded".
    const hole = board({ kind: "cell", x: 1, y: 1, right: false }, {
      "1,1": 1,
      "0,0": 1, "1,0": 1, "2,0": 1, "0,1": 1, "2,1": 1, "0,2": 1, "1,2": 1, "2,2": 2,
    });
    // `ru` is the fourth character, so the hole at (2,2) — down-and-right — is the fourth.
    expect(connectionString(connectionsOf(hole))).toBe("11101111");
    expect(pattern(hole, "11111111")).toBe(0);
  });

  it("reads the six-character form in hex mode, where the horizontals do not exist", () => {
    // `newNachbarCode` inserts a *gap* in the bit numbering after characters 1 and 4 rather than
    // renumbering, so a six-character pattern leaves `rechts` and `links` untested.
    //
    // With `hexShift` false, `os` is 0 and `us` is 1, so the four diagonals are at `(±1, 0)` and
    // `(±1, 1)` — *not* `(±1, ±1)`, which is the first thing to get wrong in hex.
    //
    // All six hex neighbours are kind 1 here, so the sequence is all `1`s. The two *horizontal*
    // cells `(0,1)` and `(2,1)` are given a different kind on purpose: if the six-character
    // pattern renumbered rather than leaving a gap, it would test those two bits and this would
    // read `011110`.
    const f = board({ kind: "cell", x: 1, y: 1, right: false }, {
      "1,1": 1, "1,0": 1, "1,2": 1, "2,1": 1, "2,2": 1, "0,2": 1, "0,1": 1,
      "0,0": 2, "2,0": 2,
    }, { hex: true });
    expect(connectionString(connectionsOf(f), true)).toBe("111111");
    expect(pattern(f, "1?1?1?")).toBe(1);
    expect(pattern(f, "0?0?0?")).toBe(0);
    // An eight-character pattern on a hex board still has bits for `rechts` and `links`, which
    // the hex numbering never sets, so it cannot be satisfied. `1?1?1?11` pins bit 2, `rechts`.
    expect(pattern(f, "1?1?1?11")).toBe(0);
  });
});

describe("the empty blob's different rule", () => {
  it("counts the end of the field as a connection, and only for the empty kind", () => {
    // `cual.6`: "If in some direction there is no neighbour, because the field ends there, the
    // entry in the neighbour sequence is 1 nevertheless." There is no code for that — `sorte.cpp`
    // has `mVerbindetMitRand[i] = mBlopart == blopart_keins`, so the *empty sort* connects with
    // every edge and every other sort connects with none.
    //
    // An empty blob on the **top** edge, with occupied cells left, right and below and empty
    // diagonals. `oben`, `ro` and `lo` run off the top and count as 1; the three occupied cells
    // are a different kind and count as 0; the two empty diagonals are the same kind and count
    // as 1. Only the occupied ones are 0.
    const layout = { "1,0": EMPTY, "0,0": 1, "2,0": 1, "1,1": 1 };
    const empty = board({ kind: "cell", x: 1, y: 0, right: false }, layout);
    expect(connectionString(connectionsOf(empty))).toBe("11010101");
    expect(pattern(empty, "1???0???")).toBe(1);

    // The man page's own sentence, restated as a test: for an empty blob `1???0???` is true iff
    // the blob above does not exist **or is empty**, and the blob below exists and is not empty.
    // Here above does not exist and below is occupied, so it is true.
    const occupied = board({ kind: "cell", x: 1, y: 0, right: false }, { ...layout, "1,0": 1 });
    // The same cell, the same neighbourhood, the same pattern — and now the top edge does *not*
    // count as a connection, because this blob is not the empty kind. The three occupied
    // neighbours do, and the empty diagonals and the two off-board corners do not.
    expect(connectionString(connectionsOf(occupied))).toBe("00101010");
    expect(pattern(occupied, "1???0???")).toBe(0);
  });

  it("treats an empty neighbour as no connection, from an occupied blob", () => {
    // The other half, and the reason the empty rule is a *special* case rather than the general
    // one: "same kind" means an empty cell does not connect to an occupied one. So the two boards
    // below are the same cell with the same two kinds above and below it — occupied over empty,
    // and empty over empty — and they differ only in whether the two match.
    const here: Here = { kind: "cell", x: 1, y: 0, right: false };
    // Occupied above an empty cell: nothing matches, and the top edge does not count either, so
    // the sequence is eight zeros.
    const occupied = board(here, { "1,0": 1, "1,1": EMPTY });
    expect(connectionString(connectionsOf(occupied))).toBe("00000000");
    expect(pattern(occupied, "1???1???")).toBe(0);
    // Empty above an empty cell: every direction is the same kind, so all eight connect.
    const empty = board(here, { "1,0": EMPTY, "1,1": EMPTY });
    expect(connectionString(connectionsOf(empty))).toBe("11111111");
    expect(pattern(empty, "1???1???")).toBe(1);
  });
});

describe("the snapshot", () => {
  it("tests the neighbours as they were at the beginning of the step", () => {
    // `Blop::verbindetMit` compares `getVariableVergangenheit(spezvar_kind)` on **both** sides,
    // so this is not "the neighbours are snapshotted" but "the pair is". `cual.6` says the same:
    // "If some blob changes its kind during a step, the expression will still test the neighbours
    // as they were at the beginning of the step."
    //
    // Both blobs change kind during the step, and neither change is visible: below becomes the
    // same kind (which would make `1???0???` false) and an empty cell to the right becomes
    // occupied (which would make `1??1??0?` true).
    const f = board({ kind: "cell", x: 1, y: 1, right: false }, { "1,1": 1, "1,0": 1, "1,2": 2, "2,1": EMPTY });
    f.slices.open();
    expect(pattern(f, "1???0???")).toBe(1);
    expect(pattern(f, "1??1??0?")).toBe(0);

    // Now change both kinds, mid-step, and re-read.
    f.stores.get("1,1")?.set(KIND, 2);
    f.stores.get("1,2")?.set(KIND, 2);
    f.stores.get("2,1")?.set(KIND, 2);
    expect(pattern(f, "1???0???")).toBe(1);
    expect(pattern(f, "1??1??0?")).toBe(0);

    // A new step, and the shadow is gone: the same reads now see the live kinds. The blob is
    // now kind 2, so it matches the cells to the right and below (`00101000`) and not the cell
    // above. Without this last pair the assertions above would pass against a runtime that
    // never took a snapshot at all.
    f.slices.open();
    expect(connectionString(connectionsOf(f))).toBe("00101000");
    expect(pattern(f, "1???0???")).toBe(0);
    expect(pattern(f, "00101000")).toBe(1);
    // And the cell that turned occupied during the step is now a real connection, which a `get`
    // instead of a `getAlt` would have read as `0` on its own.
    expect(pattern(f, "0?1?1??0")).toBe(1);
    expect(pattern(f, "1??1??1?")).toBe(0);
  });
});

describe("a blob with no owner has no neighbours", () => {
  it("answers every pattern as all zeros, for a falling piece", () => {
    // `Blop::getVerbindungen`: `if (mBesitzer) … else return verbindung_solo;` — and a falling
    // piece has no `BlopGitter`. `verbindung_solo` is the ninth bit, above all eight directions,
    // so every pattern's mask (bits 0 to 7) matches `0` and every pinned `1` fails.
    //
    // `kacheln4.ld` and `kacheln6.ld` ask a falling piece about its neighbours, so the honest
    // answer matters: not "the board around it", and not a crash.
    const f = board({ kind: "fall", x: 4, y: 2, right: false }, { "1,1": 1, "1,2": 1, "1,3": 1 });
    expect(connectionsOf(f)).toBe(CONNECTION_SOLO);
    expect(pattern(f, "1???0???")).toBe(0);
    expect(pattern(f, "00000000")).toBe(1);
    expect(pattern(f, "11111111")).toBe(0);
  });

  it("answers the same for the global and the semiglobal blob", () => {
    for (const here of [{ kind: "global" }, { kind: "semiglobal", right: false }] as const) {
      const f = board(here, { "1,1": 1 });
      expect(connectionsOf(f), here.kind).toBe(CONNECTION_SOLO);
      expect(pattern(f, "00000000"), here.kind).toBe(1);
    }
  });
});

describe("mirroring", () => {
  it("swaps the vertical axis and the diagonals' slope, so 'above' means above on screen", () => {
    // `getBesitzVerbindungen` ends with three `TAUSCH_BITS`: oben/unten, lo/lu, ro/ru. A
    // mirrored level is drawn upside down, so the *reported* direction has to be flipped with it
    // or every pattern in `unmoeglich.ld` would be reading the wrong pair.
    const kinds = { "1,1": 1, "1,0": 1, "1,2": 2 };
    const plain = board({ kind: "cell", x: 1, y: 1, right: false }, kinds);
    const mirrored = board({ kind: "cell", x: 1, y: 1, right: false }, kinds, { mirrored: true });
    expect(pattern(plain, "1???0???")).toBe(1);
    // Same board, mirrored: the cell that was above is now reported as below, so the same
    // characters no longer fit.
    expect(pattern(mirrored, "1???0???")).toBe(0);
    expect(pattern(mirrored, "0???1???")).toBe(1);
    // And the connection string is flipped, which is the swap stated as a number.
    expect(connectionString(connectionsOf(mirrored))).toBe("00001000");
  });
});

describe("what it refuses", () => {
  it("a pattern that is not six or eight characters, by name", () => {
    // `newNachbarCode` is `CASSERT(l == 6 || l == 8)`, so upstream is a debug assertion that
    // fires while the level is read. The scanner cannot produce one, so this is reachable only
    // from a hand-built tree — and the message is the pattern, because that is what a level
    // author would have to look at.
    const f = board({ kind: "cell", x: 1, y: 1, right: false }, { "1,1": 1 });
    const ctx: EvalContext = {
      variable: () => 0,
      random: () => 0,
      neighbour: neighbourReader(f),
    };
    expect(() => evaluate({ kind: "neighbour", pattern: "1010" }, ctx)).toThrow(
      /six or eight characters.*'1010'/,
    );
    expect(() => evaluate({ kind: "neighbour", pattern: "1x1x0x" }, ctx)).toThrow(
      /'0', '1' and '\?'.*'1x1x0x'/,
    );
  });

  it("a context with no board, rather than answering zero", () => {
    // Zero is a legal answer and would be indistinguishable from "the neighbours really are all
    // zeros" — so every pattern would silently compile into a rule that never fires.
    const ctx: EvalContext = { variable: () => 0, random: () => 0 };
    expect(() => evaluate({ kind: "neighbour", pattern: "1???0???" }, ctx)).toThrow(
      /needs a context with a board/,
    );
  });
});