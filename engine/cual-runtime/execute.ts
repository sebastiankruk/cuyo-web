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

    case "if":
      return runCondition(
        node,
        () => ctx.evaluate(node.condition) !== 0,
        node.then,
        node.otherwise ?? NOTHING,
        node.latching,
        node.elseLatching ?? false,
        ctx,
      );

    case "switch":
      // The braces are transparent upstream: `switch { ... }` returns `auswahl_liste`
      // unchanged, and the list is already a chain of `bedingung_code`s hanging off each
      // case's `otherwise`.
      return runStatement(node.case, ctx);

    case "switchCase":
      return runCondition(
        node,
        () => ctx.evaluate(node.condition) !== 0,
        node.body,
        node.otherwise ?? NOTHING,
        node.latching,
        // mZahl & 2: whether the *second* arrow latches. `pacman.ld` writes
        // `=> R,R,R,R,R,R,R; ->` - a latching animation with a default that does not latch -
        // so this cannot be either arrow's value or a constant.
        node.otherwiseLatching,
        ctx,
      );

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

/** The `nop_code` upstream puts in `mF3` for a condition with no else. */
const NOTHING: Stmt = { kind: "nothing" };

/**
 * `bedingung_code`: one `if`, or one `switch` case. The same code upstream, because
 * upstream's is the same code - `IF_TOK ausdruck PFEIL code_1` and every `auswahl_liste`
 * entry both build a `bedingung_code` whose `mF1` is the condition, `mF2` the first body and
 * `mF3` the second.
 *
 * Two flags, and this is the part that makes `->` and `=>` differ:
 *
 *     bool vast1 = b.getBoolVariable(mBool1Nr);
 *     bool vast2 = b.getBoolVariable(mBool2Nr);
 *     bool wahl1;
 *     if (vast1 && (mZahl & 1))        wahl1 = true;
 *     else if (vast2 && (mZahl & 2))   wahl1 = false;
 *     else                             wahl1 = mF1->eval(b);
 *
 *     if (vast1 && !wahl1) mF2->busyReset(b);
 *     if (vast2 && wahl1)  mF3->busyReset(b);
 *
 *     if (wahl1) { mF2->eval(b, busy); b.setBoolVariable(mBool1Nr, busy);
 *                  b.setBoolVariable(mBool2Nr, false); busy &= !!(mZahl & 1); }
 *     else      { mF3->eval(b, busy); b.setBoolVariable(mBool1Nr, false);
 *                  b.setBoolVariable(mBool2Nr, busy); busy &= !!(mZahl & 2); }
 *
 * Read `mZahl & 1` as "this branch latches". `vast1` is "last time this ran branch 1 *and*
 * branch 1 was busy", so a `=>` branch that is still busy keeps being chosen without the
 * condition being re-tested - which is the whole difference between `=>` and `->`. And
 * `busy &= latching` is why a `->` condition is never busy: it re-tests next step, so there
 * is nothing to wait for, and the busy flag never propagates outward.
 */
function runCondition(
  owner: Stmt,
  condition: () => boolean,
  then: Stmt,
  otherwise: Stmt,
  thenLatches: boolean,
  elseLatches: boolean,
  ctx: ExecutionContext,
): boolean {
  const slots = ctx.busySlots.get(owner);
  if (!slots) {
    throw new Error(
      `Cual: a '${owner.kind}' has no busy slots, so allocateSlots was not run on this tree`,
    );
  }
  const wasThen = ctx.store.busyGet(slots.first);
  const wasElse = ctx.store.busyGet(slots.second);

  let chooseThen: boolean;
  if (wasThen && thenLatches) chooseThen = true;
  else if (wasElse && elseLatches) chooseThen = false;
  else chooseThen = condition();

  // The branch we are leaving gets its busy state cleared, recursively: it may contain comma
  // sequences mid-animation, and their flags are per node.
  if (wasThen && !chooseThen) resetBusy(then, ctx);
  if (wasElse && chooseThen) resetBusy(otherwise, ctx);

  if (chooseThen) {
    const busy = runStatement(then, ctx);
    ctx.store.busySet(slots.first, busy);
    ctx.store.busySet(slots.second, false);
    return busy && thenLatches;
  }
  const busy = runStatement(otherwise, ctx);
  ctx.store.busySet(slots.first, false);
  ctx.store.busySet(slots.second, busy);
  return busy && elseLatches;
}

/**
 * `Code::busyReset`: clear this node's flags and every flag below it.
 *
 * "Resettet den Busy-Status von diesem Baum. Ist etwas ineffizient" - resets the busy status
 * of this tree, and is somewhat inefficient. It does not *run* anything; it only clears.
 */
export function resetBusy(node: Stmt, ctx: ExecutionContext): void {
  switch (node.kind) {
    case "commaSequence":
    case "if":
    case "switchCase": {
      const slots = ctx.busySlots.get(node);
      if (!slots) return;
      ctx.store.busySet(slots.first, false);
      ctx.store.busySet(slots.second, false);
      break;
    }
    default:
      break;
  }
  switch (node.kind) {
    case "sequence":
    case "block":
      for (const child of node.body) resetBusy(child, ctx);
      return;
    case "commaSequence":
      for (const child of node.parts) resetBusy(child, ctx);
      return;
    case "if":
      resetBusy(node.then, ctx);
      if (node.otherwise) resetBusy(node.otherwise, ctx);
      return;
    case "switch":
      resetBusy(node.case, ctx);
      return;
    case "switchCase":
      resetBusy(node.body, ctx);
      if (node.otherwise) resetBusy(node.otherwise, ctx);
      return;
    case "scoped":
    case "procedureDef":
      resetBusy(node.body, ctx);
      return;
    default:
      return;
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
