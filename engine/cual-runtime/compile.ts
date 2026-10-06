// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The compile pass: report every construct in a parsed tree that this runtime cannot run.
 *
 * Task 4.13. "All 339 Cual blocks parse" is true and not the useful claim — a level whose
 * `switch` parses but whose `neighbour` expression has no implementation is broken, and nothing
 * in the test suite would say so. This is the pass that says it, with **file, line and
 * construct** for each one, so a level author can go and look at the right place.
 *
 * ## Why a static pass and not running the levels
 *
 * Executing all 82 levels needs a simulation, a board and upstream's artwork, none of which
 * exist yet. A *compile* pass needs only the tree: it visits every statement and every
 * expression and asks "is there an implementation for this?". That question is answerable
 * without running anything, and it is the question that matters — the gap between "parses" and
 * "runs" is exactly the set of constructs this finds.
 *
 * ## The answer is a snapshot, not an assertion that the list is empty
 *
 * Group 4 is not finished, so the list is not empty and pretending otherwise would mean either
 * deleting the gate or lying about it. Instead the corpus test asserts the *exact* multiset of
 * refusals — construct, file and line — which fails when a new gap appears and fails when a gap
 * is closed without the snapshot being updated. Either way someone has to say what changed,
 * which is the point of putting it in the build gate.
 */

import type { Expr, Ort } from "./expr.ts";
import type { Stmt } from "./code.ts";
import { notYetTask } from "./execute.ts";

/** Where something is, for a message a level author can act on. */
export interface SourcePlace {
  readonly file: string;
  /** The line the enclosing `<< >>` block starts on. */
  readonly line: number;
}

/** One construct this runtime cannot run. */
export interface CompileError {
  readonly file: string;
  readonly line: number;
  /** The statement or expression kind, e.g. `neighbour` or `switch`. */
  readonly construct: string;
  /** The task that will close it, where one is assigned. */
  readonly task: string | null;
  /** Anything extra worth saying, e.g. the neighbour pattern. */
  readonly detail: string;
}

/**
 * The expressions this runtime can evaluate, and the ones it cannot.
 *
 * `notYetTask` covers statements; expressions have no such table yet because `Code::eval`
 * throws from inside a big switch rather than from a single dispatch. Rather than duplicate
 * that switch, this lists what `evaluate` handles and everything else is a gap by default — so
 * a newly parsed expression is a compile error until someone adds a case, which is the safe
 * direction for a gate to fail in.
 */
const IMPLEMENTED_EXPRESSIONS: ReadonlySet<Expr["kind"]> = new Set<Expr["kind"]>([
  "number",
  "variable",
  "positioned",
  "range",
  "unary",
  "binary",
  "call",
  // `neighbour` joined it in 4.16. Its *patterns* were 3.10's; what was missing was reading one
  // out of a blob's array, which is `access.ts`'s `neighbourReader` and the evaluator's one
  // line. It is listed here rather than special-cased below, because an expression is
  // implemented or it is not — whether the *context* it needs happens to be present is a
  // run-time question and throws by name.
  "neighbour",
]);

/**
 * Expressions that are known gaps, with the task that closes them and how to describe one.
 *
 * **Empty since 4.16**, which closed the last of them. Kept for the same reason `TASKS` is
 * kept in `execute.ts`: it is the place the next known gap goes, and being visibly empty is
 * what tells a `report(expr.kind, null, "")` — "a newly parsed expression nobody has looked at"
 * — apart from a missing entry.
 */
const EXPRESSION_GAPS: Partial<Record<Expr["kind"], { task: string; detail: (e: Expr) => string }>> =
  {};

/** Every statement in a tree, including nested ones, paired with how it was reached. */
export function* walkStatements(nodes: readonly Stmt[]): Generator<Stmt> {
  for (const node of nodes) {
    yield node;
    switch (node.kind) {
      case "sequence":
      case "block":
        yield* walkStatements(node.body);
        break;
      case "commaSequence":
        for (const part of node.parts) yield* walkStatements([part]);
        break;
      case "if":
        yield* walkStatements([node.then]);
        if (node.otherwise) yield* walkStatements([node.otherwise]);
        break;
      case "switch":
        yield* walkStatements([node.case]);
        break;
      case "switchCase":
        yield* walkStatements([node.body]);
        if (node.otherwise) yield* walkStatements([node.otherwise]);
        break;
      case "scoped":
      case "procedureDef":
        yield* walkStatements([node.body]);
        break;
      case "sharedCall":
        // `&name` holds a *body*, which is where the comma sequences and conditions live. It was
        // missing here when 4.14 added the node, and it went unnoticed because the gate runs on
        // parsed trees — where a call is still a `call` and no `sharedCall` exists yet. A caller
        // that links first, which is the order upstream does it in, would have had its shared
        // bodies skipped: the same class of bug as `if` sitting in the refusal table, and found
        // the same way, by asking what this walk does not reach rather than what it reports.
        for (const child of node.body) yield* walkStatements([child]);
        break;
      default:
        break;
    }
  }
}

/** Every expression in a tree, including nested ones. */
export function* walkExpressions(nodes: readonly Stmt[]): Generator<Expr> {
  const fromExpr = function* (expr: Expr): Generator<Expr> {
    yield expr;
    switch (expr.kind) {
      case "unary":
        yield* fromExpr(expr.operand);
        break;
      case "binary":
        yield* fromExpr(expr.left);
        yield* fromExpr(expr.right);
        break;
      case "call":
        for (const arg of expr.args) yield* fromExpr(arg);
        break;
      case "range":
        yield* fromExpr(expr.value);
        if (expr.lower) yield* fromExpr(expr.lower);
        if (expr.upper) yield* fromExpr(expr.upper);
        break;
      case "positioned":
        yield* fromOrt(expr.position);
        break;
      default:
        break;
    }
  };
  const fromOrt = function* (ort: Ort): Generator<Expr> {
    switch (ort.kind) {
      case "feld":
        yield* fromExpr(ort.x);
        yield* fromExpr(ort.y);
        break;
      case "fall":
        yield* fromExpr(ort.which);
        break;
      default:
        break;
    }
  };
  for (const node of walkStatements(nodes)) {
    switch (node.kind) {
      case "assign":
        // **Both sides.** Only the value was walked, which hid every *addressed* assignment
        // target: `kind@@(xc@@+1,yc@@+1) = Red+next1@@` has three expressions in its target
        // (`xc@@+1`, `yc@@+1` and the address itself), and the corpus has 354 of those. No
        // neighbour pattern can appear in a coordinate, so the gap list was unaffected — but
        // "the corpus has no unimplemented construct" was being checked against a walk that had
        // never looked at a third of the level's arithmetic.
        yield* fromExpr(node.target);
        yield* fromExpr(node.value);
        break;
      case "if":
        yield* fromExpr(node.condition);
        break;
      case "switchCase":
        // The head case's condition. The rest of the list hangs off `otherwise` as more
        // `switchCase` nodes, and `walkStatements` reaches those, so their conditions come
        // round on their own.
        yield* fromExpr(node.condition);
        break;
      case "scoped":
        yield* fromExpr(node.value);
        break;
      case "draw":
      case "letterDraw":
        // Both were needed and only one was here. `letterDraw` is `Y@(1)*` — a letter with an
        // address — and the corpus has **3372** of those, so a third of every address in every
        // level was never walked. No neighbour pattern can hide in a coordinate, so the gap list
        // was unaffected and nothing failed; but a gate that claims to reach every expression
        // while skipping a third of them is a gate nobody can trust, and 4.16 makes that claim
        // load-bearing: with the list empty, the only thing standing between the runtime and a
        // false all-clear is that this walk is complete.
        if (node.position) yield* fromOrt(node.position);
        break;
      case "effect":
        if (node.argument) yield* fromExpr(node.argument);
        break;
      default:
        break;
    }
  }
}

/**
 * Compile a tree: every construct here cannot be run, with where it is.
 *
 * Returns rather than throws, because a level has usually *several* gaps and reporting the
 * first one means five rounds of "fix, re-run, find the next".
 */
export function compileStatements(
  nodes: readonly Stmt[],
  place: SourcePlace,
): CompileError[] {
  const errors: CompileError[] = [];
  const report = (construct: string, task: string | null, detail: string): void => {
    errors.push({ file: place.file, line: place.line, construct, task, detail });
  };

  for (const node of walkStatements(nodes)) {
    const task = notYetTask(node.kind);
    if (task !== null) {
      report(node.kind, task, "");
      // Descending would find the same statement again through a different path and flood the
      // report; the statement's own children are still walked for expressions below.
    }
  }

  for (const expr of walkExpressions(nodes)) {
    if (IMPLEMENTED_EXPRESSIONS.has(expr.kind)) continue;
    const gap = EXPRESSION_GAPS[expr.kind];
    if (gap) {
      report(expr.kind, gap.task, gap.detail(expr));
      continue;
    }
    // Not in either table: a newly parsed expression nobody has looked at. Reported with no
    // task because there is not one yet, which is the honest answer.
    report(expr.kind, null, "");
  }

  return errors;
}

/** `file:line: construct (task N) — detail`, one per line. */
export function formatCompileError(error: CompileError): string {
  const task = error.task === null ? "no task" : `task ${error.task}`;
  const detail = error.detail === "" ? "" : ` — ${error.detail}`;
  return `${error.file}:${error.line}: ${error.construct} (${task})${detail}`;
}
