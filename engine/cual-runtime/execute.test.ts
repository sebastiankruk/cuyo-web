/**
 * The walker's busy threading, checked against the three rules `cual.6` states and against
 * the `1:100 => {B*, C*, D*, E*}` example it uses to illustrate them.
 *
 * The rules, verbatim:
 *
 * - "Normal statements like assignments are never busy."
 * - "A chain of commands separated by `,` is busy as long as not all of the commands have
 *   been executed."
 * - "`code1` ; `code2` is busy as long as at least one of `code1` and `code2` are busy."
 */

import { describe, expect, it } from "vitest";
import { parseCode } from "./code.ts";
import { allocateSlots } from "./slots.ts";
import { runCode, runStatement, notYet } from "./execute.ts";
import type { ExecutionContext } from "./execute.ts";
import { BlobStore, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/**
 * A context over a fresh store, with the tree's busy slots already allocated.
 *
 * `evaluate` is a stub because 4.1 has no expression to evaluate: the statements under test
 * are sequences of things that are never busy. Refusing an expression rather than returning
 * zero would mean the tests could not use a condition at all, and nothing here needs one.
 */
/**
 * Every busy flag in the tree, as "0"/"1" in the order `allocateSlots` reserved them.
 *
 * Indexed by position because the order is the walk order - post-order, so a nested comma
 * sequence's own flag comes before its parent's - and that order is what the assertions below
 * are actually claiming.
 */
function flags(ctx: ExecutionContext): string[] {
  return [...ctx.busySlots.values()].map((slot) => (ctx.store.busyGet(slot.first) ? "1" : "0"));
}

/** A context over a fresh store, with the tree's busy slots already allocated. */
function withSlots(source: string): {
  ctx: ExecutionContext;
  store: BlobStore;
  slices: TimeSlices;
  allocation: ReturnType<typeof allocateSlots>;
  statements: ReturnType<typeof parseCode>;
} {
  const statements = parseCode(lex(source));
  const slices = new TimeSlices();
  const allocation = allocateSlots(statements);
  const store = new BlobStore(allocation.slotCount, 13, slices);
  return {
    ctx: {
      store,
      busySlots: allocation.busySlots,
      evaluate: () => {
        throw new Error("Cual: 4.1 has no expression to evaluate");
      },
    },
    store,
    slices,
    allocation,
    statements,
  };
}

describe("ordinary statements", () => {
  it("are never busy", () => {
    // "Normal statements like assignments are never busy."
    // `nothing` is a *constant*, so as a statement it parses as a call named `nothing` -
    // which is a different task's error to fix. `{ }` is the empty case instead.
    for (const source of ["5", "{ }"]) {
      const { ctx, statements } = withSlots(source);
      expect(runCode(statements, ctx), source).toBe(false);
    }
    // `5` is `zahl_code`, which upstream runs as a real statement - it sets `file`, which
    // task 4.4 fills in. It is not busy, which is the part of it 4.1 owns.
  });

  it("reports busy for `busy`, the one leaf that is", () => {
    // `case busy_code: busy = true;` - and `cual.6` calls it doing "nothing except being
    // busy". Every rule below needs a statement that can be busy on its own.
    const { ctx, statements } = withSlots("busy");
    expect(runStatement(statements[0], ctx)).toBe(true);
  });
});

describe("a chain separated by ';' is busy while either side is", () => {
  it("is not busy when neither side is", () => {
    const { ctx, statements } = withSlots("{ 5; 5 }");
    expect(runCode(statements, ctx)).toBe(false);
  });

  it("runs both sides even when the first is busy", () => {
    // `stapel_code` evaluates both and ORs. Short-circuiting would skip the second
    // statement's side effects whenever the first was busy, and `a; b` running `b` one step
    // late is invisible until a level depends on it.
    //
    // Asserted through the flags rather than through busyness: two comma sequences either
    // side of the `;`, so a step that ran only the left one would leave the right flag alone.
    // `statements` from the helper, not a fresh `parseCode` of the same source: `busySlots`
    // is keyed by node *identity*, so re-parsing produces a tree whose comma sequences are
    // absent from the map and the walker refuses them. Which is the right behaviour, and is
    // worth having tripped over once.
    const { ctx, statements } = withSlots("{ 5, 5; 5, 5 }");
    expect(runCode(statements, ctx)).toBe(true);
    // Two comma sequences, so two flags. A step that ran only the left one would leave the
    // second at "0".
    expect(flags(ctx)).toEqual(["1", "1"]);
  });

  it("reports busy when only one side is", () => {
    // "code1 ; code2 is busy as long as at least one of code1 and code2 are busy."
    const { ctx, statements } = withSlots("{ busy; 5 }");
    expect(runCode(statements, ctx)).toBe(true);
    const { ctx: quiet, statements: other } = withSlots("{ 5; busy }");
    expect(runCode(other, quiet)).toBe(true);
  });
});

describe("a chain separated by ',' is busy until all members have run", () => {
  it("advances one member per step and reports busy until it is done", () => {
    // Five members, nested left, so four `folge_code` nodes and four busy flags. Each step
    // runs exactly one member and reports busy while more remain.
    const { ctx, statements } = withSlots("{ 5, 5, 5, 5, 5 }");
    expect(runCode(statements, ctx)).toBe(true);
    expect(runCode(statements, ctx)).toBe(true);
    expect(runCode(statements, ctx)).toBe(true);
    expect(runCode(statements, ctx)).toBe(true);
    // Five members: four steps of busy, and the fifth run reports not busy.
    expect(runCode(statements, ctx)).toBe(false);
    // And it starts again, because nothing resets the flags.
    expect(runCode(statements, ctx)).toBe(true);
  });

  it("runs the members in the order they were written", () => {
    // Left-nested, so the *left* member is the inner `folge_code` and runs first. Getting
    // this backwards would run every animation in reverse, which for `A, B, C` looks
    // plausible in a screenshot and is wrong.
    //
    // Three members nest as folge_code(folge_code(a, b), c), so after one step the *inner*
    // flag has moved and the outer has not - the inner is the left member's sequence. The
    // outer flag is what eventually moves once the inner has finished.
    const { ctx, statements } = withSlots("{ 5, 5, 5 }");
    // Post-order, so the inner (left) sequence's flag is first.
    expect(runCode(statements, ctx)).toBe(true);
    expect(flags(ctx)).toEqual(["1", "0"]);
    expect(runCode(statements, ctx)).toBe(true);
    expect(flags(ctx)).toEqual(["0", "1"]);
    // Third step: the outer finishes, so not busy.
    expect(runCode(statements, ctx)).toBe(false);
    expect(flags(ctx)).toEqual(["0", "0"]);
  });

  it("keeps two blobs' flags independent, so two animations do not share a position", () => {
    // The flag is per blob, and the same tree gives both the same bit numbers.
    const slices = new TimeSlices();
    const statements = parseCode(lex("{ 5, 5 }"));
    const allocation = allocateSlots(statements);
    const first = new BlobStore(allocation.slotCount, 13, slices);
    const second = new BlobStore(allocation.slotCount, 13, slices);
    const firstCtx: ExecutionContext = {
      store: first,
      busySlots: allocation.busySlots,
      evaluate: () => 0,
    };
    const secondCtx: ExecutionContext = {
      store: second,
      busySlots: allocation.busySlots,
      evaluate: () => 0,
    };
    expect(runCode(statements, firstCtx)).toBe(true);
    expect(first.busyGet([...allocation.busySlots.values()][0].first)).toBe(true);
    // The other blob has not run at all.
    expect(second.busyGet([...allocation.busySlots.values()][0].first)).toBe(false);
    expect(runCode(statements, secondCtx)).toBe(true);
    // Both are now at the same place, having each taken one step.
    expect(first.busyGet([...allocation.busySlots.values()][0].first)).toBe(true);
  });

  it("refuses to run a comma sequence whose slots were never allocated", () => {
    // A tree parsed but not compiled would read an unrelated bit and animate nonsense.
    const statements = parseCode(lex("{ 5, 5 }"));
    const slices = new TimeSlices();
    const ctx: ExecutionContext = {
      store: new BlobStore(20, 13, slices),
      busySlots: new Map(),
      evaluate: () => 0,
    };
    expect(() => runCode(statements, ctx)).toThrow(/no busy slot/);
  });
});

describe("what this task refuses", () => {
  it("names the task for every construct it does not implement", () => {
    // A walker that answers "not busy" for an unimplemented construct makes every rule above
    // untestable: "busy while either side is busy" passes just as well against a walker that
    // is never busy.
    expect(() => notYet("if")).toThrow(/task 4\.2/);
    expect(() => notYet("switch")).toThrow(/task 4\.2/);
    expect(() => notYet("assign")).toThrow(/task 4\.7/);
    expect(() => notYet("draw")).toThrow(/task 4\.9/);
    expect(() => notYet("effect")).toThrow(/task 4\.12/);
  });

  it("refuses them when they turn up in a tree, rather than skipping them", () => {
    const slices = new TimeSlices();
    for (const source of ["{ *; 5 }", "{ 5, 5; * }", "{ 5; if 1 -> *; }"]) {
      const statements = parseCode(lex(source));
      const allocation = allocateSlots(statements);
      const ctx: ExecutionContext = {
        store: new BlobStore(allocation.slotCount, 13, slices),
        busySlots: allocation.busySlots,
        evaluate: () => 0,
      };
      expect(() => runCode(statements, ctx), source).toThrow(/task/);
    }
  });

  it("skips definitions and declarations, which upstream never executes", () => {
    const slices = new TimeSlices();
    const statements = parseCode(lex("var counter; draw = { 5, 5; };"));
    const allocation = allocateSlots(statements);
    const ctx: ExecutionContext = {
      store: new BlobStore(allocation.slotCount, 13, slices),
      busySlots: allocation.busySlots,
      evaluate: () => 0,
    };
    // Not a refusal: upstream stores these as definitions and runs neither.
    expect(runCode(statements, ctx)).toBe(false);
  });
});
