// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * `cual.6`'s six `@`-assignment examples, verified end to end.
 *
 * Task 3.8 verified the shadow, 3.9 the queue, and both flagged that the *reads* were 4.7's.
 * With addressed access in, all six can be driven through the real evaluator and the real
 * walker against a two-blob board, which is the verification 3.8's task text asked for.
 *
 * The documented results, verbatim:
 *
 * - "Only 1) and 3) do the same; they simply increment X by 1."
 * - "Statement 4) sets X to one more than it was at the beginning of the step."
 * - "2) ... X is set to one more than the value of X just before the change (that is, X is
 *   incremented in the future)"
 * - "5) ... X is set to one more than the current value of X"
 * - "6) ... X is set to one more than the value of X at the beginning of the step."
 *
 * ## The examples are not literal Cual
 *
 * They are written with a variable called `X`, and Cual *refuses* single-letter variable
 * names — `var_def_wort: BUCHSTABE_TOK { throw Fehler("Variable names can't be single
 * letters."); }`. So every statement below spells it `XX`. That is not a liberty taken with
 * the documentation, it is the only way to type them, and it is worth knowing: a reader who
 * copies `X` from the man page gets a syntax error and reasonably suspects their own port.
 */

import { describe, expect, it } from "vitest";
import { evaluate } from "./expr.ts";
import type { EvalContext } from "./expr.ts";
import { parseCode } from "./code.ts";
import { parseExpression } from "./parse.ts";
import { readAddressed, resolveOrt } from "./access.ts";
import type { AccessField } from "./access.ts";
import { runCode } from "./execute.ts";
import { allocateSlots } from "./slots.ts";
import { BlobStore, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** The slot a user variable gets: after the fourteen special ones. */
const XX = 14;

interface Bench {
  readonly field: AccessField & { slices: TimeSlices };
  readonly me: BlobStore;
  readonly neighbour: BlobStore;
  /** Run one statement in `me`'s context, with addressed access live. */
  run(source: string): void;
  /** Evaluate one expression in the same context. */
  value(source: string): number;
}

/** Two blobs one cell apart, `me` at (1,1) and the neighbour at (2,1). */
function bench(x0: number): Bench {
  const slices = new TimeSlices();
  const me = new BlobStore(20, 13, slices);
  const neighbour = new BlobStore(20, 13, slices);
  const field: AccessField & { slices: TimeSlices } = {
    players: 1,
    width: 4,
    height: 4,
    hex: false,
    mirrored: false,
    hexShift: () => false,
    global: new BlobStore(20, 13, slices),
    fallCount: 0,
    here: { kind: "cell", x: 1, y: 1, right: false },
    semiglobal: () => null,
    at: (_right, x, y) => (x === 1 && y === 1 ? me : x === 2 && y === 1 ? neighbour : null),
    slices,
  };
  me.set(XX, x0);
  neighbour.set(XX, x0);

  const evalContext: EvalContext = {
    variable: (name) => {
      if (name === "XX") return me.get(XX);
      throw new Error(`no variable '${name}'`);
    },
    random: () => 0,
    addressed: (name, position, evaluateInner) =>
      readAddressed(
        field,
        resolveOrt(field, position, evaluateInner),
        // The default an unreachable address yields is the variable's own value, which is
        // what makes "you get the default value" observable rather than "you get zero".
        name === "XX" ? XX : 14,
        x0,
      ),
  };

  // The statements go through the real walker, not a hand-rolled equivalent: these examples
  // are about `set_zeile` and the address rules together, and a test that reimplemented the
  // assignment would be testing the test.
  const run = (source: string): void => {
    const statements = parseCode(lex(source));
    const allocation = allocateSlots(statements);
    runCode(statements, {
      store: me,
      busySlots: allocation.busySlots,
      evaluate: (expr) => evaluate(expr, evalContext),
      slotOf: (name) => (name === "XX" ? XX : null),
      field,
      slices,
    });
  };
  const value = (source: string): number =>
    evaluate(parseExpression(lex(source)), evalContext);
  return { field, me, neighbour, run, value };
}

describe("the six examples, end to end", () => {
  it("1) and 3) simply increment XX", () => {
    for (const source of ["XX += 1", "XX = XX + 1"]) {
      const b = bench(5);
      b.field.slices.open();
      b.run(source);
      b.run(source);
      b.run(source);
      expect(b.me.get(XX), source).toBe(8);
      // And the neighbour is untouched: a plain assignment is not an address.
      expect(b.neighbour.get(XX), source).toBe(5);
    }
  });

  it("4) sets XX one more than it was at the beginning of the step", () => {
    // `XX = XX@(0, 0) + 1` — an addressed read of *itself*, which is the shadow, because an
    // address makes it a foreign access even when it names the asking blob's own cell.
    const b = bench(5);
    b.field.slices.open();
    // Something writes during the step, so the live value and the beginning-of-step value
    // differ. Without that the example cannot tell the two apart.
    b.me.set(XX, 9);
    expect(b.value("XX"), "the live value has moved on").toBe(9);
    expect(b.value("XX@(0, 0)"), "but the addressed read is the step's start").toBe(5);
    b.run("XX = XX@(0, 0) + 1");
    expect(b.me.get(XX)).toBe(6);
    expect(b.me.get(XX)).not.toBe(10);
  });

  it("2) increments the neighbour in the future", () => {
    // `XX@(1, 0) += 1` — the right-hand side is the literal 1, so the queue holds 1 and the
    // operation, and the increment lands on the neighbour at the end of the step.
    const b = bench(5);
    b.field.slices.open();
    b.run("XX@(1, 0) += 1");
    // Nothing yet: invisible until the step ends.
    expect(b.neighbour.get(XX)).toBe(5);
    expect(b.me.get(XX)).toBe(5);
    b.field.slices.close();
    expect(b.neighbour.get(XX)).toBe(6);
  });

  it("2) reads the value just before the change, so a write in between shifts it", () => {
    // "X is set to one more than the value of X just before the change" — *just before* is
    // when the queue is applied, so a write in between counts.
    const b = bench(5);
    b.field.slices.open();
    b.run("XX@(1, 0) += 1");
    b.me.set(XX, 20);
    b.neighbour.set(XX, 30);
    b.field.slices.close();
    expect(b.neighbour.get(XX)).toBe(31);
  });

  it("5) sets the neighbour one more than the *current* value", () => {
    // `XX@(1, 0) = XX + 1` — the right-hand side is evaluated immediately, so the queue holds
    // the literal 6 even though XX changes afterwards.
    const b = bench(5);
    b.field.slices.open();
    b.run("XX@(1, 0) = XX + 1");
    b.me.set(XX, 100);
    b.field.slices.close();
    expect(b.neighbour.get(XX)).toBe(6);
    expect(b.neighbour.get(XX)).not.toBe(101);
  });

  it("6) sets the neighbour one more than the beginning-of-step value", () => {
    // `XX@(1, 0) = XX@(0, 0) + 1` — both sides immediate: the read is our own shadow, so the
    // queued value is the value at the start of the step however XX moves afterwards.
    const b = bench(5);
    b.field.slices.open();
    b.me.set(XX, 100);
    b.run("XX@(1, 0) = XX@(0, 0) + 1");
    b.field.slices.close();
    expect(b.neighbour.get(XX)).toBe(6);
  });

  it("all six agree when nothing moves during the step, which is the man page's scenario", () => {
    // "Only 1) and 3) do the same; they simply increment X by 1." — with nothing happening in
    // between, 2), 5) and 6) reach the same number by different routes, and that is the
    // comparison the man page is actually making.
    const neighbourOutcome = (source: string): number => {
      const b = bench(5);
      b.field.slices.open();
      b.run(source);
      b.field.slices.close();
      return b.neighbour.get(XX);
    };
    const ownOutcome = (source: string): number => {
      const b = bench(5);
      b.field.slices.open();
      b.run(source);
      b.field.slices.close();
      return b.me.get(XX);
    };
    expect([
      neighbourOutcome("XX@(1, 0) += 1"),
      neighbourOutcome("XX@(1, 0) = XX + 1"),
      neighbourOutcome("XX@(1, 0) = XX@(0, 0) + 1"),
    ]).toEqual([6, 6, 6]);
    expect([ownOutcome("XX += 1"), ownOutcome("XX = XX + 1")]).toEqual([6, 6]);
  });

  it("5) and 6) part company as soon as XX moves, and 2) does not care", () => {
    // The distinction the three deferred forms exist to make. It needs XX to move *before*
    // the statement runs but *after* the step opened:
    //
    // - 2) `+= 1` queues the operand 1 and applies it to the neighbour at close, so XX moving
    //   is irrelevant — "one more than the value of X just before the change".
    // - 5) `= XX + 1` evaluated its right-hand side immediately and read the *live* XX — "one
    //   more than the current value of X".
    // - 6) `= XX@(0, 0) + 1` evaluated its right-hand side immediately too, and read the
    //   *shadow* — "one more than the value of X at the beginning of the step".
    const outcome = (source: string): number => {
      const b = bench(5);
      b.field.slices.open();
      b.me.set(XX, 9);
      b.run(source);
      b.field.slices.close();
      return b.neighbour.get(XX);
    };
    expect([
      ["XX@(1, 0) += 1", outcome("XX@(1, 0) += 1")],
      ["XX@(1, 0) = XX + 1", outcome("XX@(1, 0) = XX + 1")],
      ["XX@(1, 0) = XX@(0, 0) + 1", outcome("XX@(1, 0) = XX@(0, 0) + 1")],
    ]).toEqual([
      ["XX@(1, 0) += 1", 6],
      ["XX@(1, 0) = XX + 1", 10],
      ["XX@(1, 0) = XX@(0, 0) + 1", 6],
    ]);
  });

  it("reads a default, not zero, when the address is off the board", () => {
    // "Whenever you try to access a variable at a location which doesn't exist, you will get
    // the default value." So `XX@(9, 9)` is the variable's declared value, not 0 — and not the
    // neighbour's.
    const b = bench(5);
    b.field.slices.open();
    expect(b.value("XX@(9, 9)")).toBe(5);
    expect(b.value("XX@(9, 9)")).not.toBe(0);
  });

  it("evaluates the coordinates in the same context, so a random address draws once each", () => {
    // Upstream evaluates the coordinates with `eval(fuer_code)`, the same blob. If a
    // coordinate drew from a different generator the level would desynchronise from upstream
    // in a way that only shows as "slightly off".
    const slices = new TimeSlices();
    const me = new BlobStore(20, 13, slices);
    me.set(XX, 42);
    // Then a step begins. Without this the read would find a shadow taken in *this* slice —
    // before the write — and return 0, which is the correct beginning-of-slice value and not
    // what this test is about.
    slices.open();
    let draws = 0;
    const field: AccessField = {
      players: 1,
      width: 4,
      height: 4,
      hex: false,
      mirrored: false,
      hexShift: () => false,
      global: new BlobStore(20, 13, slices),
      fallCount: 0,
      here: { kind: "cell", x: 1, y: 1, right: false },
      semiglobal: () => null,
      at: () => me,
    };
    const expr = parseExpression(lex("XC@(rnd(2), rnd(2))"));
    const ctx: EvalContext = {
      variable: () => 0,
      random: () => {
        draws += 1;
        return 1;
      },
      addressed: (_name, ort, evaluateInner) =>
        readAddressed(field, resolveOrt(field, ort, evaluateInner), XX, 7),
    };
    // What this test is about is that the *coordinates* were evaluated at all, and by the
    // same context as everything else. Both `rnd(2)` calls must therefore happen, exactly
    // once each: zero draws would mean the address was never resolved, and the value below
    // would be the default rather than a read.
    expect(evaluate(expr, ctx)).toBe(42);
    expect(draws, "each coordinate drew once, from the simulation's sequence").toBe(2);
    // And the coordinates resolved to the cell the two draws named: here (1,1) plus (1,1).
    const position = expr.kind === "positioned" ? expr.position : null;
    expect(position).not.toBeNull();
    if (position) {
      expect(resolveOrt(field, position, () => 1)).toMatchObject({ kind: "cell", x: 2, y: 2 });
    }
  });
});
