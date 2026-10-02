/**
 * The code-tree walker, and the busy state it threads.
 *
 * Task 4.1: the two sequence forms and nothing else. `->` re-testing versus `=>` latching is
 * task 4.2, effects are 4.12, addressed access is 4.7 - so each of those throws *by name*
 * rather than quietly returning "not busy". A walker that answers "not busy" for a construct
 * it does not implement is worse than one that refuses: it makes the busyness rules below
 * untestable, because a rule that says "busy while either side is busy" passes just as well
 * against a walker that is never busy.
 */

import type { Stmt } from "./code.ts";
import type { Expr } from "./expr.ts";
import type { BusySlots } from "./slots.ts";
import type { BlobStore } from "./store.ts";

/** What the walker needs from the blob it is running. */
export interface ExecutionContext {
  /** `Blop::mDaten`, holding both the user variables and the busy flags. */
  readonly store: BlobStore;
  /** From `allocateSlots`, keyed by node identity. */
  readonly busySlots: ReadonlyMap<Stmt, BusySlots>;
  /** Evaluate an expression in this blob's context. */
  readonly evaluate: (expr: Expr) => number;
}

/**
 * Run a `code` list and report whether it is busy.
 *
 * Definitions and declarations are skipped rather than refused: upstream stores them as
 * definitions and never executes them, so a procedure body sitting in the same list as its
 * call site is not an error. Which code a blob runs at all is a later task's decision.
 */
export function runCode(statements: readonly Stmt[], ctx: ExecutionContext): boolean {
  let busy = false;
  for (const statement of statements) {
    // A plain OR, not short-circuiting. Upstream's `stapel_code` runs *both* sides and then
    // ORs the results, so short-circuiting would skip the second statement's side effects
    // whenever the first was busy - and `a; b` running `b` one step late is invisible until
    // a level depends on it.
    if (runStatement(statement, ctx)) busy = true;
  }
  return busy;
}

/** Run one statement and report whether it is busy. */
export function runStatement(node: Stmt, ctx: ExecutionContext): boolean {
  switch (node.kind) {
    case "sequence":
      // `code: code_1 ';' code` is `stapel_code`: both sides run, busy is the OR. No flag,
      // and no way to be busy for itself.
      return runCode(node.body, ctx);

    case "block":
      // `'{' code '}'` returns `$2` unchanged upstream, so braces are not a node - a block
      // *is* the `;` sequence inside it. Modelled as a node here only because the parser
      // keeps it, and it has to behave identically to the sequence it stands for.
      return runCode(node.body, ctx);

    case "commaSequence":
      return runCommaSequence(node, ctx);

    case "busy":
      // `busy_code` is the one leaf that *is* busy: `case busy_code: busy = true;`. It is
      // how a level says "I am still working on this" without any machinery of its own, and
      // `cual.6` describes it as doing "nothing except being busy".
      //
      // It is here rather than in a later task because it is the only statement that can be
      // busy without containing a sequence, so every busyness rule needs it to be testable at
      // all. A walker where nothing is ever busy would satisfy every rule vacuously.
      return true;

    case "nothing":
    case "number":
      // "Normal statements like assignments are never busy." `zahl_code` sets `file` and
      // does nothing else, which task 4.4 will fill in.
      return false;

    case "procedureDef":
    case "varDecl":
    case "defaultDecl":
      // Compile-time. Upstream keeps these as definitions and never runs them.
      return false;

    default:
      return notYet(node.kind);
  }
}

/**
 * `folge_code`: a comma sequence, which is busy until all its members have run.
 *
 * The whole mechanism is one bit meaning "my second member is next":
 *
 *     kind2dran = getBoolVariable(mBool1Nr);
 *     if (kind2dran) mF2->eval(b, busy1); else mF1->eval(b, busy1);
 *     if (busy1) busy = true;
 *     else { kind2dran = !kind2dran; busy = kind2dran; setBoolVariable(mBool1Nr, kind2dran); }
 *
 * Read it as: run whichever member the bit points at. If it was busy, leave the bit alone
 * and stay busy - the member gets to finish. If it finished, flip the bit and report the
 * new value as our busyness, which is what makes a sequence of n members report busy for
 * n-1 steps and then not busy.
 *
 * Note what it does *not* do: it never resets. The bit is the sequence's memory of where it
 * is, and it is per blob, so the same sequence in two blobs of one kind advances separately
 * with nothing coordinating them.
 */
function runCommaSequence(node: Stmt, ctx: ExecutionContext): boolean {
  if (node.kind !== "commaSequence") return notYet(node.kind);
  const slots = ctx.busySlots.get(node);
  if (!slots) {
    throw new Error(
      "Cual: a comma sequence has no busy slot, so allocateSlots was not run on this tree",
    );
  }
  const secondIsNext = ctx.store.busyGet(slots.first);
  const [first, second] = node.parts;
  const memberBusy = runStatement(secondIsNext ? second : first, ctx);
  if (memberBusy) return true;
  ctx.store.busySet(slots.first, !secondIsNext);
  return !secondIsNext;
}

/**
 * Refuse a construct this task does not implement, by name.
 *
 * Returns `never` so the caller can `return notYet(node.kind)` and keep its exhaustiveness,
 * and so that adding a statement kind without deciding what it does is a type error rather
 * than a silent "not busy".
 */
export function notYet(kind: string): never {
  const task: Record<string, string> = {
    if: "4.2",
    switch: "4.2",
    switchCase: "4.2",
    assign: "4.7",
    scoped: "4.7",
    call: "4.6",
    draw: "4.9",
    letterDraw: "4.9",
    effect: "4.12",
  };
  throw new Error(
    `Cual: a '${kind}' statement is not implemented yet (task ${task[kind] ?? "?"})`,
  );
}
