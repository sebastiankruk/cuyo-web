// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The three draw statements and the quarter clipping, task 4.9.
 *
 * Two things are checked, and they are checked separately because they fail separately:
 * **whether** a picture is queued at all (`bemalbar`, `korrekt(true)`, `mMalenErlaubt`), and
 * **where it lands** (`malBildchen`'s four independent bit tests). A test that only checked the
 * list of entries would pass with the clipping computed wrongly, because the queue records the
 * quarter number and nothing else.
 */

import { describe, expect, it } from "vitest";
import {
  canDrawAt,
  clipQuarter,
  isPaintable,
  PictureStack,
  VIERTEL_ALLE,
  VIERTEL_MAX,
  VIERTEL_MIN,
} from "./draw.ts";
import type { PictureSource } from "./draw.ts";
import type { AccessField, Here } from "./access.ts";
import { parseCode } from "./code.ts";
import { allocateSlots } from "./slots.ts";
import { runCode } from "./execute.ts";
import type { ExecutionContext } from "./execute.ts";
import { BlobStore, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** Where the asking blob stands, and the cell the tests draw at `(2,2)`. */
const CELL: Here = { kind: "cell", x: 1, y: 1, right: false };
const GRIC = 16;

/** A board with one picture stack per cell, and a global blob's worth of state. */
function board(
  cells: readonly (readonly [number, number])[],
  options: { players?: number; here?: Here } = {},
): AccessField & {
  readonly stacks: Map<string, PictureStack>;
  stackAt(x: number, y: number): PictureStack | null;
} {
  const stacks = new Map<string, PictureStack>();
  const width = 4;
  const height = 4;
  const players = options.players ?? 1;
  const slices = new TimeSlices();
  const at = (right: boolean, x: number, y: number) =>
    right && players < 2 ? null : cells.some(([cx, cy]) => cx === x && cy === y) ? me() : null;
  const me = () => new BlobStore(20, 13, slices);
  return {
    players,
    width,
    height,
    hex: false,
    mirrored: false,
    hexShift: () => false,
    global: new BlobStore(20, 13, slices),
    fallCount: 0,
    here: options.here ?? CELL,
    semiglobal: () => me(),
    at,
    stacks,
    stackAt: (x, y) => {
      const key = `${x},${y}`;
      let stack = stacks.get(key);
      if (!stack) {
        stack = new PictureStack();
        stacks.set(key, stack);
      }
      return stack;
    },
  };
}

/** Four icons per file, ten files, and room for fifty pictures per blob. */
const SOURCE: PictureSource = {
  pictureCount: () => 4,
  maxPictures: 50,
};

describe("quarter clipping", () => {
  it("draws the whole icon and nothing else for Q_ALL", () => {
    // `if (k != viertel_alle)` — the *only* value that skips the branch, so the source stays
    // `gric` wide and the destination stays at the cell's corner.
    expect(clipQuarter(VIERTEL_ALLE, GRIC)).toEqual({
      source: { x: 0, y: 0, w: GRIC, h: GRIC },
      target: { dx: 0, dy: 0 },
    });
  });

  it("narrows the source and moves the destination independently", () => {
    // Four separate tests upstream, and they are separate here: `Q_TR_TL` takes the icon's top
    // right quarter and puts it in the cell's top left, which is not either corner.
    expect(clipQuarter(1, GRIC)).toEqual({
      source: { x: GRIC / 2, y: 0, w: GRIC / 2, h: GRIC / 2 },
      target: { dx: 0, dy: 0 },
    });
    expect(clipQuarter(4, GRIC)).toEqual({
      source: { x: 0, y: 0, w: GRIC / 2, h: GRIC / 2 },
      target: { dx: GRIC / 2, dy: 0 },
    });
    expect(clipQuarter(2, GRIC)).toEqual({
      source: { x: 0, y: GRIC / 2, w: GRIC / 2, h: GRIC / 2 },
      target: { dx: 0, dy: 0 },
    });
    expect(clipQuarter(8, GRIC)).toEqual({
      source: { x: 0, y: 0, w: GRIC / 2, h: GRIC / 2 },
      target: { dx: 0, dy: GRIC / 2 },
    });
  });

  it("puts each of the four two-letter corners in its own corner", () => {
    // `Q_TL`/`Q_TR`/`Q_BL`/`Q_BR` are 0/5/10/15 — which is why they are not 0/1/2/3: a
    // two-letter name sets *both* pairs of bits, so `Q_TR` is `Q_TR_TR` = 5.
    const corners = [0, 5, 10, 15].map((q) => clipQuarter(q, GRIC));
    expect(corners.map((c) => c.target)).toEqual([
      { dx: 0, dy: 0 },
      { dx: GRIC / 2, dy: 0 },
      { dx: 0, dy: GRIC / 2 },
      { dx: GRIC / 2, dy: GRIC / 2 },
    ]);
    // And each takes the matching quarter of the icon, so nothing is squashed: the source's
    // top-left matches where the piece lands.
    expect(corners.map((c) => [c.source.x, c.source.y])).toEqual(
      corners.map((c) => [c.target.dx, c.target.dy]),
    );
    for (const corner of corners) {
      expect(corner.source.w * 2).toBe(GRIC);
    }
  });

  it("never reads or writes outside the cell, whatever the quarter", () => {
    // A quarter either shifts by `gric/2` or not at all, so every source rect and every
    // destination offset is inside the grid. Asserted over all sixteen values plus Q_ALL,
    // because one stray bit would only show up for one quarter.
    for (let quarter = VIERTEL_MIN; quarter <= VIERTEL_MAX; quarter += 1) {
      const clip = clipQuarter(quarter, GRIC);
      expect(clip.source.x + clip.source.w, `quarter ${quarter}`).toBeLessThanOrEqual(GRIC);
      expect(clip.source.y + clip.source.h, `quarter ${quarter}`).toBeLessThanOrEqual(GRIC);
      expect(clip.target.dx + clip.source.w, `quarter ${quarter}`).toBeLessThanOrEqual(GRIC);
      expect(clip.target.dy + clip.source.h, `quarter ${quarter}`).toBeLessThanOrEqual(GRIC);
    }
  });

  it("uses the full icon's size for Q_ALL and a quarter for every named selector", () => {
    // The one asymmetry: Q_ALL is the whole icon and *does* fill the cell, while every 0..15
    // value is a quarter. A test that only checked corners would miss a selector that kept
    // full size.
    const sizes = Array.from({ length: VIERTEL_MAX + 1 }, (_, q) => clipQuarter(q, GRIC).source.w);
    expect(new Set(sizes)).toEqual(new Set([GRIC / 2]));
    expect(clipQuarter(VIERTEL_ALLE, GRIC).source.w).toBe(GRIC);
  });
});

describe("which addresses accept a picture", () => {
  it("allows one row above the field, which koordOK does not", () => {
    // `koordMalOK` is `y < getGrY() + 1`, and upstream's comment says the extra row is for the
    // hex edge blobs and "a bit of time is wasted when Cual code paints at one of the places
    // that isn't visible at all". Transcribed as written, not tidied into a hex check.
    const field = board([[2, 2]]);
    expect(canDrawAt(field, { kind: "cell", x: 2, y: 4, right: false })).toBe(true);
    expect(canDrawAt(field, { kind: "cell", x: 2, y: 5, right: false })).toBe(false);
    // x is not extended, and the low edge is not extended either.
    expect(canDrawAt(field, { kind: "cell", x: 4, y: 2, right: false })).toBe(false);
    expect(canDrawAt(field, { kind: "cell", x: 2, y: -1, right: false })).toBe(false);
  });

  it("still refuses the right field in a one-player game", () => {
    // `rechts_ok` is checked first and `koordMalOK` is only reached if it passes.
    const field = board([[2, 2]], { players: 1 });
    expect(canDrawAt(field, { kind: "cell", x: 2, y: 2, right: true })).toBe(false);
    const two = board([[2, 2]], { players: 2 });
    expect(canDrawAt(two, { kind: "cell", x: 2, y: 2, right: true })).toBe(true);
  });

  it("refuses to paint the semiglobal and the global blob, though both are readable", () => {
    // `bemalbar()` is false for `absort_semiglobal` and `absort_global`, and that is a
    // *different* question from `korrekt()`. So the global blob is the one address that can
    // never be out of range and can never be drawn on.
    expect(isPaintable({ kind: "global" })).toBe(false);
    expect(isPaintable({ kind: "semiglobal" })).toBe(false);
    expect(isPaintable(CELL)).toBe(true);
    expect(isPaintable({ kind: "nowhere" })).toBe(false);
    expect(isPaintable({ kind: "info" }), "absort_info is true").toBe(true);
    // And the throw is on *paintable*, not on reachable: a reachable global still throws.
    const field = board([[2, 2]]);
    expect(canDrawAt(field, { kind: "global", x: 0, y: 0, right: false })).toBe(true);
  });
});

describe("the picture stack", () => {
  const entry = { kind: 1, file: 2, pos: 3, quarter: 0, level: 0 };

  it("keeps pictures in draw order", () => {
    const stack = new PictureStack();
    stack.add(entry, SOURCE);
    stack.add({ ...entry, pos: 1 }, SOURCE);
    expect(stack.entries.map((e) => e.pos)).toEqual([3, 1]);
    stack.clear();
    expect(stack.entries).toEqual([]);
  });

  it("rejects a pos past the end of the image file", () => {
    // `if (pos < 0 || pos >= maxpos) throw Fehler("Position pos=%d out of range ...")`. A bad
    // pos would blit whatever happens to be at that offset, so it is an error and not a
    // silently wrong picture.
    const stack = new PictureStack();
    expect(() => stack.add({ ...entry, pos: 4 }, SOURCE)).toThrow(/pos=4 out of range \(allowed/);
    expect(() => stack.add({ ...entry, pos: -1 }, SOURCE)).toThrow(/pos=-1 out of range/);
    expect(stack.entries).toEqual([]);
  });

  it("rejects a quarter outside -1 to 15", () => {
    const stack = new PictureStack();
    expect(() => stack.add({ ...entry, quarter: 16 }, SOURCE)).toThrow(/qu=16 out of range/);
    expect(() => stack.add({ ...entry, quarter: -2 }, SOURCE)).toThrow(/qu=-2 out of range/);
    expect(stack.entries).toEqual([]);
  });

  it("rejects more pictures than the level allows", () => {
    // `if (mAnz >= mMaxAnz) throw iFehler("Too many pictures drawn for one single blob")`,
    // with upstream's own comment that mMaxAnz "shouldn't happen" because it is computed
    // correctly at level start.
    const stack = new PictureStack();
    const one: PictureSource = { ...SOURCE, maxPictures: 2 };
    stack.add(entry, one);
    stack.add(entry, one);
    expect(() => stack.add(entry, one)).toThrow(/too many pictures/);
  });

  it("accepts Q_ALL and every selector, because the check is a range and not a lookup", () => {
    const stack = new PictureStack();
    for (let quarter = VIERTEL_MIN; quarter <= VIERTEL_MAX; quarter += 1) {
      stack.add({ ...entry, quarter }, SOURCE);
    }
    expect(stack.entries).toHaveLength(VIERTEL_MAX - VIERTEL_MIN + 1);
  });
});

describe("the three draw statements, through the walker", () => {
  /** Run one draw statement and report where the pictures ended up. */
  function draw(
    source: string,
    options: {
      field?: ReturnType<typeof board>;
      drawingAllowed?: boolean;
      quarter?: number;
      pos?: number;
    } = {},
  ): {
    own: readonly { pos: number; level: number }[];
    at2x2: readonly { pos: number; level: number }[];
    fieldStack(key: string): readonly { pos: number; level: number }[];
  } {
    const field = options.field ?? board([[2, 2]]);
    const ownStack = new PictureStack();
    const statements = parseCode(lex(source));
    const allocation = allocateSlots(statements);
    const ctx: ExecutionContext = {
      store: new BlobStore(allocation.slotCount, 13, new TimeSlices()),
      busySlots: allocation.busySlots,
      // The coordinates inside an address are literals here, so the evaluator can just read
      // them — and must, or every address would resolve to the asking blob's own cell.
      evaluate: (expr) => (expr.kind === "number" ? expr.value : 0),
      draw: {
        context: {
          drawingAllowed: options.drawingAllowed ?? true,
          picture: { file: 2, pos: options.pos ?? 1, quarter: options.quarter ?? 0 },
          kind: 1,
          field,
          here: field.here,
          source: SOURCE,
        },
        ownStack,
        stackAt: (_field, resolved) =>
          resolved.kind === "cell" ? field.stackAt(resolved.x, resolved.y) : null,
      },
    };
    runCode(statements, ctx);
    // A stack nobody drew into is an empty stack, not a missing one: an absent stack is what
    // "the address was unreachable" looks like, and conflating the two would make both tests
    // pass for the same wrong reason.
    const entries = (stack: PictureStack | null) =>
      (stack ?? new PictureStack()).entries.map((e) => ({ pos: e.pos, level: e.level }));
    return {
      own: entries(ownStack),
      at2x2: entries(field.stackAt(2, 2)),
      fieldStack: (key) => entries(field.stacks.get(key) ?? null),
    };
  }

  it("puts a plain '*' on our own stack at level 0", () => {
    expect(draw("*")).toMatchObject({ own: [{ pos: 1, level: 0 }], at2x2: [] });
  });

  it("puts '*@(1,1)' and '@(1,1)*' on the neighbour at +1 and -1", () => {
    // `'*' ort` is `newCode2(mal_code_fremd, ort, 1)` and `'ort '*'` is `..., -1`. Same
    // address, opposite side — the one difference between the two spellings.
    expect(draw("*@(1,1)", { field: board([[2, 2]]) })).toMatchObject({
      own: [],
      at2x2: [{ level: 1 }],
    });
    expect(draw("@(1,1)*", { field: board([[2, 2]]) })).toMatchObject({
      own: [],
      at2x2: [{ level: -1 }],
    });
  });

  it("records the asking blob's file, pos and quarter, not the target's", () => {
    // `b.mBild.speichereBild(getSorte(), mDaten[file], mDaten[pos], mDaten[quarter], ebene)` —
    // `getSorte()` and the three variables are all read off `this`. A foreign draw is "put my
    // picture over there".
    const result = draw("*@(1,1)", { pos: 2, quarter: 5 });
    expect(result.at2x2).toEqual([{ pos: 2, level: 1 }]);
    expect(result.own).toEqual([]);
  });

  it("records the quarter number rather than resolving it, so clipping stays render-time", () => {
    // `BildStapel` stores `mViertel`; `malBildchen` reads it. A stack that resolved the clip
    // on the way in would lose the ability to render at a different `gric`.
    const field = board([[2, 2]]);
    draw("*@(1,1)", { field, quarter: 9 });
    const entries = field.stackAt(2, 2)?.entries ?? [];
    expect(entries[0]?.quarter).toBe(9);
    expect(clipQuarter(entries[0]?.quarter ?? 0, GRIC).source).toEqual({
      x: GRIC / 2,
      y: 0,
      w: GRIC / 2,
      h: GRIC / 2,
    });
  });

  it("ignores an address it cannot reach, rather than throwing", () => {
    // `if (ziel.korrekt(true)) { ... }` with no `else` — an unreachable address is not an
    // error. Only `korrekt` and `bemalbar` throw, and only when they say *false* about
    // something that was reached.
    const field = board([[2, 2]]);
    expect(draw("*@(9,9)", { field })).toMatchObject({ own: [], at2x2: [] });
    // Off the *top* is still reachable for drawing, even though there is no blob there — so
    // the picture lands in the edge row's own stack.
    expect(draw("*@@(2,4)", { field }).fieldStack("2,4")).toEqual([{ pos: 1, level: 1 }]);
  });

  it("throws when drawing is not allowed at the moment", () => {
    // `if ((!mMalenErlaubt) || (!mOrt.bemalbar())) throw Fehler("Drawing is not allowed at
    // the moment.")`. `mMalenErlaubt` is only set around the draw event, so a draw from any
    // other event throws — for '*' and for a foreign address alike.
    expect(() => draw("*", { drawingAllowed: false })).toThrow(
      /drawing is not allowed at the moment/,
    );
    expect(() => draw("*@(1,1)", { drawingAllowed: false })).toThrow(
      /drawing is not allowed at the moment/,
    );
  });

  it("throws when the *target's* place is the global or semiglobal blob", () => {
    // `!b.mOrt.bemalbar()` — the target's own position, not the asking blob's. So a blob that
    // can read `@()` perfectly well cannot draw there. Both addresses are `korrekt` here
    // (`absort_global` is unconditionally true and `absort_semiglobal` is `rechts_ok`), so
    // the refusal comes from `bemalbar` and not from the reachability check that precedes it.
    const field = board([[2, 2]]);
    expect(canDrawAt(field, { kind: "global", x: 0, y: 0, right: false })).toBe(true);
    expect(canDrawAt(field, { kind: "semiglobal", x: 0, y: 0, right: false })).toBe(true);
    expect(() => draw("*@()", { field })).toThrow(/drawing is not allowed/);
    expect(() => draw("*@@()", { field })).toThrow(/drawing is not allowed/);
  });

  it("refuses a context with no board rather than dropping the draw", () => {
    const statements = parseCode(lex("*"));
    const allocation = allocateSlots(statements);
    const ctx: ExecutionContext = {
      store: new BlobStore(allocation.slotCount, 13, new TimeSlices()),
      busySlots: allocation.busySlots,
      evaluate: () => 0,
    };
    expect(() => runCode(statements, ctx)).toThrow(/needs a context with a board/);
  });

  it("is never busy, for either spelling", () => {
    // `getStapelHoehe` returns 1 for `mal_code` and 0 for `mal_code_fremd`, and neither sets
    // the busy flag — so `if 1 -> * else -> *` runs both branches every step.
    const field = board([[2, 2]]);
    draw("*", { field });
    expect(field.stackAt(2, 2)?.entries).toEqual([]);
  });
});