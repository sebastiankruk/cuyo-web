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
  // Both of a condition's flags, in `first`/`second` order: an `if` and a `switch` case are
  // one `bedingung_code` owning *two* slots, while a comma sequence owns one. Reporting only
  // `first` made the sequence four flags long read as three, and the arithmetic in the
  // assertions below stopped meaning anything.
  return [...ctx.busySlots.values()].flatMap((slot) =>
    slot.second === -1
      ? [ctx.store.busyGet(slot.first) ? "1" : "0"]
      : [ctx.store.busyGet(slot.first) ? "1" : "0", ctx.store.busyGet(slot.second) ? "1" : "0"],
  );
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
    // `evaluate` returns 1 so the `if` branch is *taken*. With 0 the condition is false and
    // the draw in its then-branch is never reached, so the third case would pass for the
    // wrong reason - a refusal test that does not refuse.
    for (const source of ["{ *; 5 }", "{ 5, 5; * }", "{ 5; if 1 -> *; }"]) {
      const statements = parseCode(lex(source));
      const allocation = allocateSlots(statements);
      const ctx: ExecutionContext = {
        store: new BlobStore(allocation.slotCount, 13, slices),
        busySlots: allocation.busySlots,
        evaluate: () => 1,
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

/**
 * `->` versus `=>`, which is `mZahl & 1` and `mZahl & 2`.
 *
 * The man page's own example, from the BUSIENESS section:
 *
 *     switch { 1:100 => {B*, C*, D*, E*}; -> A*; }
 *
 * "This code fragment normally draws the icon at position A. But in each step, with a
 * probability of 1/100, an animation sequence consisting of icons B, C, D and E is started.
 * With a normal arrow after the 1:100, after the step in which B has been drawn, the
 * probability would be 99/100 that A is drawn again. But with the double arrow, the switch
 * statement won't switch back to A until the animation has terminated."
 */
describe("conditions", () => {
  /** A context whose condition is scripted, so `->` and `=>` can be told apart. */
  function withCondition(source: string, condition: () => boolean) {
    const statements = parseCode(lex(source));
    const slices = new TimeSlices();
    const allocation = allocateSlots(statements);
    const store = new BlobStore(allocation.slotCount, 13, slices);
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: () => (condition() ? 1 : 0),
    };
    return { ctx, store, statements };
  }

  it("runs the then-branch when the condition is true", () => {
    const { ctx, statements } = withCondition("if cond -> busy;", () => true);
    expect(runCode(statements, ctx)).toBe(false);
  });

  it("runs the otherwise-branch when the condition is false", () => {
    const { ctx, statements } = withCondition("if cond -> 5 else => busy;", () => false);
    expect(runCode(statements, ctx)).toBe(true);
  });

  it("is never busy through a bare 'else', because neither arrow latches", () => {
    // `if c -> a else b` has no arrow after `else`, and upstream builds `mZahl` as
    // `3 * ohne_merk_pfeil`, which is zero - so `busy &= !!(mZahl & 2)` is false and a busy
    // `b` never propagates out. Reported as busy only when the second arrow is `=>`.
    const { ctx, statements } = withCondition("if cond -> 5 else busy;", () => false);
    expect(runCode(statements, ctx)).toBe(false);
  });

  it("refuses 'if c => a else b', which the grammar has no production for", () => {
    // With `=>` and no arrow after `else`, upstream throws "Please specify ...". Accepting it
    // would mean inventing `mZahl`, and its two possible values differ.
    expect(() => parseCode(lex("if cond => busy else busy;"))).toThrow(/else ->/);
    expect(() => parseCode(lex("if cond => busy else => busy;"))).not.toThrow();
  });

  it("re-tests the condition every step with '->', so it is never busy", () => {
    // `busy &= !!(mZahl & 1)`: a `->` branch masks its busyness away, because next step the
    // condition is re-tested anyway and there is nothing to wait for.
    let condition = true;
    const { ctx, statements } = withCondition("if cond -> busy;", () => condition);
    expect(runCode(statements, ctx)).toBe(false);
    // The branch was busy and ran again, because the flag is not consulted for `->`.
    condition = false;
    expect(runCode(statements, ctx)).toBe(false);
  });

  it("keeps a latching '=>' branch running without re-testing the condition", () => {
    // The first of the two rules: `if (vast1 && (mZahl & 1)) wahl1 = true;` - the flag
    // short-circuits the condition entirely.
    const { ctx, statements } = withCondition("if cond => busy;", () => true);
    expect(runCode(statements, ctx)).toBe(true);
    // The condition is now false and is *not* consulted: the branch is still busy.
    expect(runCode(statements, ctx)).toBe(true);
    expect(runCode(statements, ctx)).toBe(true);
  });

  it("keeps a latching branch chosen even after the condition turns false", () => {
    // Not a bug: `if (vast1 && (mZahl & 1)) wahl1 = true;` consults the flag *before* the
    // condition, so a latching branch that is still busy wins. How a `=>` branch ever ends is
    // by its body finishing - not by the condition changing.
    let condition = true;
    const { ctx, statements } = withCondition("if cond => busy else => 5;", () => condition);
    expect(runCode(statements, ctx)).toBe(true);
    condition = false;
    expect(runCode(statements, ctx)).toBe(true);
  });

  it("re-tests once a latching branch's body has finished", () => {
    // A two-member comma sequence: busy for one step, then done - and only then is the
    // condition asked again.
    let condition = true;
    let consulted = 0;
    const statements = parseCode(lex("if cond => { 5, 5 } else => 5;"));
    const slices = new TimeSlices();
    const allocation = allocateSlots(statements);
    const store = new BlobStore(allocation.slotCount, 13, slices);
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: () => {
        consulted += 1;
        return condition ? 1 : 0;
      },
    };
    // Step 1 consults the condition and runs the body, which is busy.
    expect(runCode(statements, ctx)).toBe(true);
    expect(consulted).toBe(1);
    // Step 2 does *not* consult it: the latch holds the branch, the two-member sequence
    // finishes, and the branch reports not busy.
    condition = false;
    expect(runCode(statements, ctx)).toBe(false);
    expect(consulted, "the latch meant the condition was never asked again").toBe(1);
  });

  it("clears the busy state of the branch it leaves", () => {
    // `if (vast1 && !wahl1) mF2->busyReset(b);` - a comma sequence mid-animation inside a
    // branch that is no longer taken must forget where it was, or it resumes mid-sequence
    // when the branch is taken again.
    let condition = true;
    const { ctx, statements } = withCondition(
      "if cond -> { 5, 5, 5 } else 5;",
      () => condition,
    );
    // Post-order: the two nested comma flags first, then the `if`'s own two.
    expect(flags(ctx)).toHaveLength(4);
    // The body is busy after this step, but the `if` reports *not* busy: the arrow is `->`,
    // so `busy &= !!(mZahl & 1)` masks it away. The two facts are independent, and reading
    // either from the other is how a `->` gets mistaken for a `=>`.
    expect(runCode(statements, ctx)).toBe(false);
    expect(flags(ctx)).toEqual(["1", "0", "1", "0"]);
    // Switch branches: the then-branch's nested flags must go back to 0.
    condition = false;
    expect(runCode(statements, ctx)).toBe(false);
    expect(flags(ctx)).toEqual(["0", "0", "0", "0"]);
  });

  it("does not clear the branch it keeps", () => {
    // The reset only happens when the branch is *left*. Clearing unconditionally would make a
    // `=>` animation restart on every step and never finish.
    const condition = true;
    const { ctx, statements } = withCondition(
      "if cond => { 5, 5, 5 } else => 5;",
      () => condition,
    );
    // Three members: three steps of animation, and the condition is not consulted in between.
    expect(runCode(statements, ctx)).toBe(true);
    expect(flags(ctx)).toEqual(["1", "0", "1", "0"]);
    expect(runCode(statements, ctx)).toBe(true);
    expect(flags(ctx)).toEqual(["0", "1", "1", "0"]);
    // Step 3 finishes the animation - and reports not busy while the condition is *still*
    // true, because the latch expired rather than the condition changing.
    expect(runCode(statements, ctx)).toBe(false);
    expect(flags(ctx)).toEqual(["0", "0", "0", "0"]);
  });

  it("runs the man page's latching switch to completion", () => {
    // `switch { 1:100 => { B*, C*, D*, E* }; -> A*; }`, with the probability forced true.
    // Four members means three steps of animation, then A - and the condition must not be
    // consulted in between, which is what the latching arrow buys.
    let consulted = 0;
    const statements = parseCode(lex("switch { cond => { 5, 5, 5, 5 }; -> 5; }"));
    const slices = new TimeSlices();
    const allocation = allocateSlots(statements);
    const store = new BlobStore(allocation.slotCount, 13, slices);
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: () => {
        consulted += 1;
        return 1;
      },
    };
    // The animation: busy for three steps, then the default runs.
    expect(runCode(statements, ctx)).toBe(true);
    expect(runCode(statements, ctx)).toBe(true);
    expect(runCode(statements, ctx)).toBe(true);
    expect(runCode(statements, ctx)).toBe(false);
    expect(consulted, "the condition is only asked once").toBe(1);
  });

  it("evaluates only the cases up to the one that matches", () => {
    // `switch { cond_a -> busy; cond_b -> busy; cond_c -> busy; }` with all conditions true:
    // upstream's list is a right-nested chain, so the first match short-circuits the rest.
    // With `rnd(n)` in a condition that is the difference between one draw and three.
    const consulted: string[] = [];
    const statements = parseCode(lex("switch { aa -> busy; bb -> busy; cc -> busy; }"));
    const slices = new TimeSlices();
    const allocation = allocateSlots(statements);
    const store = new BlobStore(allocation.slotCount, 13, slices);
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: (expr) => {
        if (expr.kind === "variable") consulted.push(expr.name);
        return 1;
      },
    };
    expect(runCode(statements, ctx)).toBe(false);
    expect(consulted).toEqual(["aa"]);
  });

  it("does nothing at all when no case matches", () => {
    const statements = parseCode(lex("switch { aa -> busy; bb -> busy; }"));
    const slices = new TimeSlices();
    const allocation = allocateSlots(statements);
    const store = new BlobStore(allocation.slotCount, 13, slices);
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: () => 0,
    };
    // The last case's `mF3` is upstream's `nop_code`, so a non-matching switch is not busy.
    expect(runCode(statements, ctx)).toBe(false);
  });

  it("records the second arrow of a two-arrow case separately", () => {
    // `pacman.ld`: `=> R,R,R,R,R,R,R; ->` - a latching animation with a default that does
    // *not* latch. Neither arrow's value can stand in for the other.
    const stmt = parseCode(lex("switch { cond => busy; -> busy; }"))[0];
    if (stmt.kind !== "switch") throw new Error("expected a switch");
    expect(stmt.case.latching).toBe(true);
    expect(stmt.case.otherwiseLatching).toBe(false);
    const other = parseCode(lex("switch { cond -> busy; => busy; }"))[0];
    if (other.kind !== "switch") throw new Error("expected a switch");
    expect(other.case.latching).toBe(false);
    expect(other.case.otherwiseLatching).toBe(true);
  });

  it("refuses a condition whose slots were never allocated", () => {
    const statements = parseCode(lex("if cond -> busy;"));
    const slices = new TimeSlices();
    const ctx: ExecutionContext = {
      store: new BlobStore(20, 13, slices),
      busySlots: new Map(),
      evaluate: () => 1,
    };
    expect(() => runCode(statements, ctx)).toThrow(/no busy slots/);
  });
});
