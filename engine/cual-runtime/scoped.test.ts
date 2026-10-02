/**
 * `push_code`: `[x = e] body`, and the four lines upstream runs for it.
 *
 * Task 4.15, and 395 places in the corpus — `globals.ld` has 32 of them, `wuerfel.ld` and
 * `doors.ld` 47 each — so this is the largest gap 4.14 left. Almost all of them are the same
 * three characters, `[qu = Q_TL] *`, so almost all of them are about one thing: `qu` is the
 * quarter selector, `file` and `pos` choose the icon, and the block says "draw this quarter of
 * it" for exactly as long as the draw takes.
 *
 *     case push_code: {
 *       int merk = b.getVariable(*mVar1);
 *       b.setVariable(*mVar1, mF1->eval(b), set_code);
 *       mF2->eval(b, busy);
 *       b.setVariable(*mVar1, merk, set_code);
 *       return 0;
 *     }
 *
 * The man page says one sentence about it — "Sets the variable `varname` to `expr`, executes
 * `code` and then resets the variable to the old value" — and the three things that sentence
 * leaves open are the three that are asserted below, because each has a plausible wrong answer:
 * whether the value is evaluated once or every step, whether the reset waits for the body to
 * stop being busy, and whether the writes are immediate or deferred.
 */

import { describe, expect, it } from "vitest";
import { parseCode } from "./code.ts";
import { allocateSlots } from "./slots.ts";
import { runCode } from "./execute.ts";
import type { ExecutionContext } from "./execute.ts";
import { evaluate } from "./expr.ts";
import type { EvalContext } from "./expr.ts";
import { BlobStore, SPECIAL_VARIABLES, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** `spezvar_qu`, the quarter selector most of the corpus's blocks push. */
const QU = SPECIAL_VARIABLES.findIndex((v) => v.name === "qu");
/** The first two user slots, in declaration order — `knoten.cpp`'s `neueVariable`, one each. */
const XX = SPECIAL_VARIABLES.length;
const YY = XX + 1;

interface Bench {
  readonly store: BlobStore;
  readonly slices: TimeSlices;
  /** Run one step of `source`, returning whether it was busy. */
  step(source: string): boolean;
  /** Set a slot before running, so a value can be watched across steps. */
  give(slot: number, value: number): void;
  /** Read a slot after running. */
  read(slot: number): number;
}

/**
 * A blob with `xx` and `yy` declared, and a real evaluator over it.
 *
 * Two variables because a scoped block is only observable from *outside* it once it has restored
 * — the value it pushed is gone by then, so the assertion that it was ever there has to be
 * recorded somewhere else. `yy` is that somewhere.
 *
 * The evaluator matters more here than in most tasks: the difference between "evaluated once on
 * entry" and "evaluated every step" is only visible if the expression can *see* the block's own
 * effect, which needs the value read back out of the store rather than a stub returning a
 * constant.
 */
function bench(): Bench {
  const slices = new TimeSlices();
  const store = new BlobStore(20, 13, slices);
  const evalContext: EvalContext = {
    variable: (name) => {
      if (name === "xx") return store.get(XX);
      if (name === "yy") return store.get(YY);
      if (name === "qu") return store.get(QU);
      throw new Error(`no variable '${name}'`);
    },
    random: () => 0,
  };
  const step = (source: string): boolean => {
    const statements = parseCode(lex(`var xx; var yy; ${source}`));
    const allocation = allocateSlots(statements);
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: (expr) => evaluate(expr, evalContext),
      slotOf: (name) => (name === "xx" ? XX : name === "yy" ? YY : name === "qu" ? QU : null),
    };
    return runCode(statements, ctx);
  };
  return {
    store,
    slices,
    step,
    give: (slot, value) => store.set(slot, value),
    read: (slot) => store.get(slot),
  };
}

describe("the block sets the variable for the body and puts it back", () => {
  it("shows the body the value, not the old one", () => {
    // The `merk` line is taken *before* the write and given back *after* the body, so the body
    // sees `expr`. Asserted through `yy` rather than through `xx`, because `xx` afterwards is
    // the whole point of the restore — reading it can only ever show the restored value.
    const b = bench();
    b.give(XX, 5);
    b.step("[xx = 7] yy = xx");
    expect(b.read(YY)).toBe(7);
    expect(b.read(XX)).toBe(5);
  });

  it("puts the old value back, whatever it was", () => {
    // The corpus's shape: `[qu = Q_TL] *` — a quarter selector pushed around a draw, and `qu`
    // must be exactly as it was afterwards, because the *next* statement reads it for the next
    // quarter. `3d.ld` lines 84-91 are eight of these in a row, one per cube face, and each
    // sets `qu` itself rather than relying on the previous one being restored.
    const b = bench();
    b.give(QU, 0);
    b.step("[qu = 6] qu = qu + 1");
    expect(b.read(QU)).toBe(0);
    b.step("[qu = 6] qu = qu + 1");
    expect(b.read(QU)).toBe(0);
  });

  it("puts back the value it found rather than the block's own default", () => {
    // `merk` is read live, not from the beginning of the step, so a variable another statement
    // already changed in this same step is what gets restored. `{ xx = 1; [xx = 9] xx = 0; }`
    // ends on 1, not on the 5 the step began with — which is a claim about which read `merk`
    // uses, and the reason `[xx = xx]` restores 1 and not 5.
    const b = bench();
    b.give(XX, 5);
    b.step("{ xx = 1; [xx = 9] xx = 0; }");
    expect(b.read(XX)).toBe(1);
    b.give(XX, 5);
    b.step("{ xx = 1; [xx = xx] xx = 100; }");
    expect(b.read(XX)).toBe(1);
  });
});

describe("the value is evaluated every step, not once on entry", () => {
  it("re-evaluates against the value it just restored", () => {
    // `mF1->eval(b)` is inside `eval`, and `eval` runs once per step per blob. So
    // `[xx = xx + 1] ...` sets `xx` to one more than its restored value however many steps the
    // body takes — here forever, because `busy` never finishes.
    //
    // An implementation that cached the value on entry would climb by one per step: 5, then 6,
    // then 7. Asserted as "still 5 after five steps", which fails loudly for the cached version
    // and is a number rather than a shape.
    const b = bench();
    b.give(XX, 5);
    for (let step = 0; step < 5; step += 1) {
      b.step("[xx = xx + 1] busy");
      expect(b.read(XX), `after ${step + 1} steps`).toBe(5);
    }
  });

  it("sees the variable as this step left it, not as the step began", () => {
    // The same fact from the other side: `{ xx = 1; [xx = xx] busy }` pushes 1, not the 5 the
    // variable held at the start of the step, so the restore gives 1 back and the step ends on
    // 1. `getVariable` on the int overload reads the live array, and a scoped block's `merk` is
    // an ordinary read of it.
    const b = bench();
    b.give(XX, 5);
    b.step("{ xx = 1; [xx = xx] busy }");
    expect(b.read(XX)).toBe(1);
    // And with a trace, so the pushed value is visible rather than merely implied:
    // `{ xx = 1; [xx = xx] yy = xx; }` records 1 while leaving the same 1 behind.
    b.give(XX, 5);
    b.give(YY, 0);
    b.step("{ xx = 1; [xx = xx] yy = xx; }");
    expect(b.read(YY)).toBe(1);
    expect(b.read(XX)).toBe(1);
  });
});

describe("the restore does not wait for the body to stop being busy", () => {
  it("restores on the first frame of a scoped animation, not the last", () => {
    // `mF2->eval(b, busy)` returns as soon as the body has run, busy or not, and the third line
    // runs regardless. So `[xx = 1] busy, busy, busy` holds `xx` at 1 for one statement per
    // step and gives it back immediately — it does not stay pushed across the animation.
    //
    // Observable through a statement *after* the animation in the same step: if the first
    // block's value were still pushed it would read 1 rather than 5. `stapel_code` runs both
    // sides in order, so the animation has already finished — and restored — by then.
    const b = bench();
    b.give(XX, 5);
    b.give(YY, 0);
    b.step("{ [xx = 1] busy, busy, busy; yy = xx; }");
    // 5 and not 1: the animation left nothing behind for the next statement to read.
    expect(b.read(YY)).toBe(5);
    expect(b.read(XX)).toBe(5);
  });

  it("is still busy while its body is, so the block passes busyness through", () => {
    // `mF2->eval(b, busy)` writes through the caller's reference, and the `return 0` after it
    // is the *stack height*, not the busyness — the same pass-through as `weiterleit_code`.
    const b = bench();
    expect(b.step("[xx = 1] busy")).toBe(true);
    // A body that is not busy is not busy, even though the block itself did work.
    expect(b.step("[xx = 1] xx = xx + 1")).toBe(false);
    // And a `;` beside it is busy because of it, which is `stapel_code` ORing the two sides.
    expect(b.step("{ [xx = 1] busy; xx = 1 }")).toBe(true);
  });

  it("advances a scoped animation one member per step, with the value in place each time", () => {
    // The comma sequence is the body's, so `[xx = 1] a, b, c` runs one member per step like any
    // other. This is the shape `wuerfel.ld` uses, and it is the reason the restore cannot be
    // deferred to end-of-step: the value has to be in place for whichever member is running.
    //
    // Three members nest left, so two `folge_code` nodes: three steps of busy and then not
    // busy. `busy` would not do here — "if one of the commands is busy, it will be executed
    // until it stops being busy", so a member that is always busy pins the sequence on the
    // first frame forever and nothing after it ever runs.
    const b = bench();
    b.give(XX, 5);
    b.give(YY, 0);
    expect(b.step("[xx = 1] yy = xx, yy = xx, yy = xx")).toBe(true);
    expect(b.read(YY)).toBe(1);
    expect(b.step("[xx = 1] yy = xx, yy = xx, yy = xx")).toBe(true);
    expect(b.read(YY)).toBe(1);
    expect(b.step("[xx = 1] yy = xx, yy = xx, yy = xx")).toBe(false);
    expect(b.read(YY)).toBe(1);
    // The pushed value is gone every step, including after the last member.
    expect(b.read(XX)).toBe(5);
  });
});

describe("nesting", () => {
  it("gives the inner block's value back to the outer one, not to the variable's history", () => {
    // `merk` is a local in `eval`, so an inner block saves whatever the outer one put there.
    // The observable is the inner body: `[xx = 1] [xx = 2] yy = xx` records 2, and the outer
    // restore then undoes the outer set — so both halves are numbers rather than one of them
    // being the only thing that could have happened.
    const b = bench();
    b.give(XX, 5);
    b.give(YY, 0);
    b.step("[xx = 1] [xx = 2] yy = xx");
    expect(b.read(YY)).toBe(2);
    expect(b.read(XX)).toBe(5);
  });

  it("keeps two nested blocks on different variables apart", () => {
    // Two locals, so neither sees the other's value — which is the ordinary expectation and is
    // here because "the scope is the variable, not the block" is the thing being claimed.
    const b = bench();
    b.give(XX, 5);
    b.give(QU, 0);
    b.give(YY, 0);
    b.step("[qu = 3] [xx = 1] { yy = qu * 10 + xx; }");
    expect(b.read(YY)).toBe(31);
    expect(b.read(XX)).toBe(5);
    expect(b.read(QU)).toBe(0);
  });

  it("nests three deep and unwinds in order", () => {
    // `[xx=1] [xx=2] [xx=3] body` with `xx` standing in for all three, each writing `yy` on
    // the way in. If the restore were one save-and-restore-at-the-end rather than a stack, the
    // innermost write would win and the outermost would be lost — so the value after the step
    // is the outermost's old one, and the body saw the innermost's.
    const b = bench();
    b.give(XX, 5);
    b.give(YY, 0);
    b.step("[xx = 1] [xx = 2] [xx = 3] yy = xx");
    expect(b.read(YY)).toBe(3);
    expect(b.read(XX)).toBe(5);
  });

  it("nests inside a block, where the braces are transparent", () => {
    // `globals.ld`'s shape, 32 times: `[qu = Q_TL] {switch { … }}`. `'{' code '}'` returns `$2`
    // unchanged upstream, so the braces are not a node and the block is the switch's — nothing
    // in the nesting depends on where the statement ended.
    const b = bench();
    b.give(QU, 0);
    b.give(YY, 0);
    b.step("[qu = 6] { yy = qu; }");
    expect(b.read(YY)).toBe(6);
    expect(b.read(QU)).toBe(0);
  });
});

describe("the writes are immediate, and they are `setVariable`", () => {
  it("puts the value in place before the next statement reads it", () => {
    // `setVariable`, not `setVariableZukunft` — so this is a plain local assignment's timing and
    // an `@`-addressed one's is not. `xx = 1; [xx = 9] yy = xx` records 9.
    const b = bench();
    b.give(XX, 5);
    b.give(YY, 0);
    b.step("{ xx = 1; [xx = 9] yy = xx; }");
    expect(b.read(YY)).toBe(9);
    expect(b.read(XX)).toBe(1);
  });

  it("preserves the beginning-of-step value, so the write is visible as a change", () => {
    // `setVariable` calls `merkeAlteVarWerte` before it writes, and the restore calls it too.
    // Taking it through the low-level `setVariableIntern` instead would write without
    // preserving, and the shadow would never exist for this step — so an `@(0,0)` read inside
    // the block would read the pushed value instead of the step's opening one.
    //
    // Asserted through `hasShadow`, which is the only way to see it: by the time the test looks
    // at the value, the restore has put it back and there is nothing left to observe.
    const b = bench();
    b.give(XX, 5);
    b.slices.open();
    expect(b.store.hasShadow).toBe(false);
    b.step("[xx = 9] busy");
    expect(b.store.hasShadow).toBe(true);
    // And the pushed value is gone: what a later `@` read is measured against is 5.
    expect(b.read(XX)).toBe(5);
  });
});

describe("what it refuses", () => {
  it("a name the level never declared, rather than writing to slot zero", () => {
    // Slot 0 is `kind`, so a scoped block that resolved an unknown name to "the first slot"
    // would quietly change a blob's kind and every default that follows from it. Upstream
    // refuses at load time — `if ($2->istKonstante()) throw Fehler(...)` for a constant, and a
    // constant has no slot either, so both land in the same refusal here.
    const b = bench();
    expect(() => b.step("[nosuch = 1] busy")).toThrow(/no variable named 'nosuch'/);
    // And a read-only constant, which is the case upstream names explicitly.
    expect(() => b.step("[time = 1] busy")).toThrow(/no variable named 'time'/);
  });

  it("a context with no slots to resolve the name against", () => {
    // The same reasoning as `runAssign`: a context that cannot name the variable must not
    // invent one.
    const statements = parseCode(lex("[xx = 1] busy"));
    const allocation = allocateSlots(statements);
    const ctx: ExecutionContext = {
      store: new BlobStore(allocation.slotCount, 13, new TimeSlices()),
      busySlots: allocation.busySlots,
      evaluate: () => 0,
    };
    expect(() => runCode(statements, ctx)).toThrow(/needs a context with slotOf/);
  });
});