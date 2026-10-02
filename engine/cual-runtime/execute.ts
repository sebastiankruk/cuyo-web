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

import type { AssignOperator, Stmt } from "./code.ts";
import type { Expr } from "./expr.ts";
import type { BusySlots } from "./slots.ts";
import type { BlobStore, TimeSlices } from "./store.ts";
import { resolveOrt, writeAddressed } from "./access.ts";
import type { AccessField, ResolvedOrt } from "./access.ts";
import { canDrawAt, isPaintable, PictureStack } from "./draw.ts";
import type { DrawContext } from "./draw.ts";
import { divv, modd } from "./divmod.ts";

/** What the walker needs from the blob it is running. */
export interface ExecutionContext {
  /** `Blop::mDaten`, holding both the user variables and the busy flags. */
  readonly store: BlobStore;
  /** From `allocateSlots`, keyed by node identity. */
  readonly busySlots: ReadonlyMap<Stmt, BusySlots>;
  /** Evaluate an expression in this blob's context. */
  readonly evaluate: (expr: Expr) => number;
  /**
   * The slot of a user variable, or null if the level declared no such name.
   *
   * Optional, because most statements never need it and a context that only runs sequences
   * should not have to invent a namespace. An assignment without one throws by name rather
   * than writing to slot 0 — which would be a plausible-looking way to corrupt `file`.
   */
  readonly slotOf?: (name: string) => number | null;
  /** The board, for an assignment through an address. */
  readonly field?: AccessField;
  /** The window deferred writes queue onto. */
  readonly slices?: TimeSlices;
  /** The three draw statements need a board and a place to queue pictures. */
  readonly draw?: {
    /** `mMalenErlaubt` and the blob's own `file`/`pos`/`quarter`. */
    readonly context: DrawContext;
    /** The asking blob's own picture stack, for a plain `*`. */
    readonly ownStack: PictureStack;
    /** The picture stacks of the cells a foreign draw can land on. */
    stackAt(field: AccessField, resolved: ResolvedOrt): PictureStack | null;
  };
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

    case "assign":
      return runAssign(node, ctx);

    case "draw":
      return runDraw(node, ctx);

    case "busy":
      // `busy_code` is the one leaf that *is* busy: `case busy_code: busy = true;`. It is
      // how a level says "I am still working on this" without any machinery of its own, and
      // `cual.6` describes it as doing "nothing except being busy".
      //
      // It is here rather than in a later task because it is the only statement that can be
      // busy without containing a sequence, so every busyness rule needs it to be testable at
      // all. A walker where nothing is ever busy would satisfy every rule vacuously.
      return true;

    case "number":
      // `zahl_code`: `b.setVariable(spezvar_file, mZahl, set_code);` - a number in statement
      // position is a draw *index*, not a value. `9;` in aliens.ld is the ninth frame. Not
      // busy, per "Normal statements like assignments are never busy".
      ctx.store.setSystem("file", node.value);
      return false;

    case "letterDraw":
      // `buchstabe_code`: `b.setVariable(spezvar_pos, mZahl, set_code);` - a letter selects
      // the position *within* the frame that `file` chose.
      //
      // The drawing itself is `mal_code`, which is task 4.9 and reads `file`, `pos` and `qu`
      // together. This is the `buchstabe_code` half only, so a test can see `pos` move.
      ctx.store.setSystem("pos", node.letter);
      return false;

    case "nothing":
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
 * `speichereBild` and `speichereBildFremd`: the three draw statements.
 *
 * `*` needs the drawing flag and the asking blob's *own* place to be paintable; `* ort` and
 * `ort *` need the *target's* place to be paintable, and the target's place being paintable is
 * what makes the semiglobal and global blobs refuse a draw rather than quietly ignoring it.
 *
 * The picture always records the *asking* blob's `file`, `pos`, `quarter` and kind — a foreign
 * draw is "put my picture over there", not "put *their* picture over there".
 */
function runDraw(node: Extract<Stmt, { kind: "draw" }>, ctx: ExecutionContext): boolean {
  const draw = ctx.draw;
  if (!draw) {
    throw new Error("Cual: a draw needs a context with a board and picture stacks");
  }
  const { context } = draw;
  const { field, here, source, picture, kind, drawingAllowed } = context;
  // A draw never makes the code busy — `getStapelHoehe` returns 1 for `mal_code` and 0 for
  // `mal_code_fremd`, and neither sets it.
  const entry = {
    kind,
    file: picture.file,
    pos: picture.pos,
    quarter: picture.quarter,
    level: node.position === null ? 0 : node.ahead ? 1 : -1,
  };

  if (node.position === null) {
    if (!drawingAllowed || !isPaintable(here)) {
      throw new Error("Cual: drawing is not allowed at the moment");
    }
    draw.ownStack.add(entry, source);
    return false;
  }

  const resolved = resolveOrt(field, node.position, ctx.evaluate);
  // `korrekt(true)`, not `korrekt()`: drawing is allowed one row above the field, for the
  // hex edge blobs. An unreachable address is not an error — the branch is simply not taken.
  if (!canDrawAt(field, resolved)) return false;
  // The paintable check comes *before* the target is touched, because it is the target's own
  // `mOrt` that is being asked: `Blop & b = ziel.finde(); if ((!mMalenErlaubt) ||
  // (!b.mOrt.bemalbar())) throw`. Checking it afterwards would quietly skip the global and
  // semiglobal blobs instead of refusing them.
  if (!drawingAllowed || !isPaintable(resolved)) {
    throw new Error("Cual: drawing is not allowed at the moment");
  }
  const stack = draw.stackAt(field, resolved);
  if (!stack) return false;
  stack.add(entry, source);
  return false;
}

/**
 * `set_zeile`: an assignment, local or through an address.
 *
 * The operator travels with the *operand*, not with the result. `x += 1` evaluates to the
 * number 1 and queues `add`; `applyOperation` at end-of-step then does `x = x + 1` against
 * whatever `x` is by then. That is what makes `X@(1,0) += 1` land on the value "just before
 * the change" rather than on the value from when it was queued.
 *
 * A *local* target applies immediately instead, because upstream calls `setVariable` rather
 * than `setVariableZukunft` when `v.Ort_hier()`. So `x += 1` reads `x` as of this instant,
 * which is why `X = X@(0,0) + 1` and `X@(0,0) += 1` differ even with no address in sight on
 * the left-hand side.
 */
function runAssign(node: Extract<Stmt, { kind: "assign" }>, ctx: ExecutionContext): boolean {
  // "Normal statements like assignments are never busy."
  const operand = ctx.evaluate(node.value);
  const { slotOf } = ctx;
  if (!slotOf) {
    throw new Error(
      "Cual: an assignment needs a context with slotOf, so a name can be resolved to a slot",
    );
  }

  if (node.target.kind === "positioned") {
    const { field, slices } = ctx;
    if (!field || !slices) {
      throw new Error("Cual: an assignment through an address needs a field and a slice");
    }
    const slot = slotOf(node.target.name);
    if (slot === null) throw new Error(`Cual: no variable named '${node.target.name}'`);
    const resolved = resolveOrt(field, node.target.position, ctx.evaluate);
    writeAddressed(field, resolved, slot, operand, node.operator, slices);
    return false;
  }

  if (node.target.kind !== "variable") {
    throw new Error(`Cual: cannot assign to a '${node.target.kind}'`);
  }
  const slot = slotOf(node.target.name);
  if (slot === null) throw new Error(`Cual: no variable named '${node.target.name}'`);
  ctx.store.set(slot, applyLocally(node.operator, ctx.store.get(slot), operand));
  return false;
}

/** `setVariableIntern`'s switch, applied at once rather than at end-of-step. */
function applyLocally(operation: AssignOperator, current: number, operand: number): number {
  switch (operation) {
    case "=":
      return operand;
    case "+=":
      return current + operand;
    case "-=":
      return current - operand;
    case "*=":
      return current * operand;
    case "/=":
      return divv(current, operand);
    case "%=":
      return modd(current, operand);
    case ".+=":
      return current | operand;
    case ".-=":
      return current & ~operand;
    default: {
      const impossible: never = operation;
      throw new Error(`Cual: unknown assignment operator '${String(impossible)}'`);
    }
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
  // The draw statements left this list in 4.9 and the scoped assignment in 4.7; both were
  // "refused until then" tests that had to move rather than disappear. What is still refused
  // is a `switch` shape, a builtin call, and the effects (`bonus`, `message`, `explode`,
  // `lose`, `sound`).
  const task: Record<string, string> = {
    if: "4.2",
    switch: "4.2",
    switchCase: "4.2",
    scoped: "4.7",
    call: "4.6",
    effect: "4.12",
  };
  throw new Error(
    `Cual: a '${kind}' statement is not implemented yet (task ${task[kind] ?? "?"})`,
  );
}
