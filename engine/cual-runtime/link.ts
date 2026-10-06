// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Linking: turning procedure calls into code, at the point the level is compiled.
 *
 * Task 4.14, and the first thing to say is that **there is no runtime call**. Upstream's
 * grammar resolves a call while it parses:
 *
 *     | punktwort                  {
 *       /* Kopie erzeugen... *\/
 *       $$ = new Code(gAktDefKnoten, *(Code*)gAktDefKnoten->getDefinition(namespace_prozedur,
 *                                         *$1, ld->mVersion, false), true);
 *     }
 *     | '&' punktwort              {
 *       $$ = newCode1(weiterleit_code,
 *                     new Code(gAktDefKnoten, *(Code*)gAktDefKnoten->getDefinition(
 *                       namespace_prozedur, *$2, ld->mVersion, false), false));
 *     }
 *
 * So `tor_1;` splices a **copy** of the procedure's `Code` into the caller, and `&tor_1;`
 * splices a `weiterleit_code` that points at the definition's `Code`. Both happen once, when the
 * level is read. There is no call stack at eval time, no depth limit, and no return value —
 * `weiterleit_code`'s whole case is `mF1->eval(b, busy); return 0;`.
 *
 * ## The copy constructor's third argument is the whole difference
 *
 *     Code(DefKnoten * knoten, const Code & f, bool neueBusyNummern);
 *
 * `neueBusyNummern` — "new busy numbers" — is `true` for the plain form and `false` for the
 * `&` form. So a plain call gets **its own** comma-sequence flag and an `&` call keeps the
 * **definition's**, which is what makes `&` share an animation across call sites.
 *
 * `cual.6`'s own worked example says exactly this, and it is the only place the distinction is
 * documented:
 *
 * > The difference between these examples is what happens when myvar changes. In example 1,
 * > the animation "A, B, C, D" will restart at the beginning (because the two animations are
 * > different ones); in example 2, the "same" animation is used in both cases, so the animation
 * > will simply continue. (Removing the ampersands from example 2 will turn the behaviour to
 * > the one of example 1.)
 *
 * ## Cual has no functions and no recursion
 *
 * A procedure is called as a *statement* and `eval` returns 0, so there is nothing to assign:
 * `yy = f(xx)` does not parse, because `set_zeile`'s right-hand side is an `ausdruck` and the
 * grammar has no call in expression position.
 *
 * Recursion is impossible for a separate reason. `proc_def_wort version '=' code_1 ';'` runs
 * `speicherDefinition` in its *action*, which is after `code_1` has been fully reduced — so a
 * procedure that calls itself resolves to `undefiniert_code`, which throws:
 *
 *     case undefiniert_code:
 *       throw iFehler("%s","Internal error in Code::eval(): CodeArt undefined_code");
 *
 * That is the same outcome for a call to a procedure that was never defined, and it is an
 * *internal* error rather than a `Fehler` about the level: by the time it is thrown the level
 * has already parsed.
 */

import type { Stmt } from "./code.ts";

/** The procedures a level defines, by name. Last definition wins, as upstream's scope does. */
export type Procedures = ReadonlyMap<string, readonly Stmt[]>;

/** What linking produced, and what it could not resolve. */
export interface LinkResult {
  /** The tree with every call replaced and every declaration removed. */
  readonly statements: readonly Stmt[];
  /** Calls whose name is not a procedure, in the order they were found. */
  readonly unresolved: readonly { readonly name: string; readonly position: "copied" | "shared" }[];
}

/**
 * Replace calls, remove declarations.
 *
 * The declarations go because upstream keeps `var`, `default` and procedure definitions as
 * *definitions* rather than code — `speicherDefinition` and friends — so a `procedureDef` node
 * in a statement list is something the parser produced on the way past, never something
 * upstream would run. The walker already ignores them; here they are dropped, because a spliced
 * body must not drag the whole declaration list into every call site.
 *
 * ## `selfName`, and why the recursion guard has to be more than source order
 *
 * Registering a definition only *after* rewriting its body is enough to stop `tor_1 = { tor_1; }`
 * linking, and it is what the first version relied on. It is **not** enough once the tree is
 * built by splicing, because the callee's stored body is re-rewritten at every call site — and by
 * then `tor_1` *is* in scope. Found by task 15.1 driving a real level: `bolzer = {tor_1;}` where
 * `tor_1` calls itself spliced `tor_1`'s raw body, re-rewrote the self-call against a scope
 * containing `tor_1`, spliced again, and blew the stack.
 *
 * Upstream cannot have this problem because it never re-parses: the self-call was substituted
 * with `undefiniert_code` in the grammar, so the stored `Code` already holds a dead node and
 * splicing copies the dead node. Our tree keeps the live `call` instead, so the equivalent is to
 * carry the expansion stack: `selfName` is hidden while its own body is rewritten, and hiding it
 * extends to every nested splice of it. A call to a name on the stack is left unresolved, which
 * is precisely "this procedure did not exist when that body was read".
 *
 * Each call site still expands the callee's body *from source*, so a plain call keeps its own
 * busy numbers — `neueBusyNummern` — rather than sharing the definition's.
 */
export function linkCalls(
  statements: readonly Stmt[],
  procedures: Procedures,
  selfName?: string,
): LinkResult {
  const unresolved: { name: string; position: "copied" | "shared" }[] = [];
  // A local copy, so a caller's `ReadonlyMap` is not mutated and two links of the same level
  // cannot see each other's definitions.
  const known: Map<string, readonly Stmt[]> = new Map(procedures);
  // The procedures whose expansion is in progress, and so cannot be seen by the body being
  // rewritten. Seeded with `selfName`; a splice adds the callee for the nested rewrite only.
  const hidden: ReadonlySet<string> = new Set(selfName === undefined ? [] : [selfName]);

  /**
   * Rewrite `nodes` against `known`, registering any definition *as it is reached*.
   *
   * Source order, and that is the whole reason Cual cannot recurse. Upstream's
   * `proc_def_wort version '=' code_1 ';'` runs `speicherDefinition` in its grammar action,
   * which happens after `code_1` is fully reduced — so while a procedure's own body is being
   * parsed, that procedure does not exist yet, and a self-call resolves to
   * `undefiniert_code`, which throws. Collecting every definition before rewriting anything
   * would make `tor_1 = { tor_1; }` link cleanly and produce an infinitely recursive tree.
   *
   * So a body sees only what was defined before it, and a call after a definition sees it.
   */
  const rewrite = (
    nodes: readonly Stmt[],
    scope: Map<string, readonly Stmt[]>,
    hidden: ReadonlySet<string> = new Set(),
  ): Stmt[] => {
    const out: Stmt[] = [];
    for (const node of nodes) {
      switch (node.kind) {
        case "procedureDef": {
          // Its body is rewritten against the scope *so far*, then it joins the scope — and the
          // node itself is dropped, because upstream keeps a definition as a definition rather
          // than as code. The name is hidden while its own body is rewritten, which is what
          // stops a self-call; see the header.
          rewrite([node.body], scope, hiddenWith(hidden, node.name));
          scope.set(node.name, [node.body]);
          break;
        }
        case "call": {
          const body = hidden.has(node.name) ? undefined : scope.get(node.name);
          if (!body) {
            unresolved.push({
              name: node.name,
              position: node.sharesDefinition ? "shared" : "copied",
            });
            // Upstream substitutes `undefiniert_code`, which throws when it is evaluated. Left
            // as the call so the throw happens at run time and names the procedure, rather
            // than at link time where a level author cannot tell which of 845 calls it was.
            out.push(node);
            break;
          }
          if (node.sharesDefinition) {
            // `&name`: one node holding the *same* body, so `allocateSlots` numbers it against
            // the definition's flags and two `&anim;` in a level are one animation. This is
            // `weiterleit_code`, whose `neueBusyNummern` was false.
            out.push({ kind: "sharedCall", name: node.name, body });
          } else {
            // A plain `name` is a splice: the body becomes these statements, so `allocateSlots`
            // gives each call site its own busy numbers. `neueBusyNummern` was true.
            // The callee joins the hidden set for its own expansion only: a call *inside* it
            // may legitimately reach it again through a path upstream would also allow, and
            // only the cycle back to a procedure already on the stack is forbidden.
            for (const spliced of rewrite(body, scope, hiddenWith(hidden, node.name))) {
              out.push(spliced);
            }
          }
          break;
        }
        case "varDecl":
        case "defaultDecl":
          // Compile-time; not code. `procedureDef` has its own case above because it also
          // registers the definition. See the doc comment.
          break;
        default:
          out.push(rebuild(node, (nodes) => rewrite(nodes, scope, hidden)));
          break;
      }
    }
    return out;
  };

  return { statements: rewrite(statements, known, hidden), unresolved };
}

/** The hidden set with one more name on it. */
function hiddenWith(hidden: ReadonlySet<string>, name: string): ReadonlySet<string> {
  return new Set([...hidden, name]);
}

/** Rebuild `node` with its children rewritten, or `node` itself if it has none. */
function rebuild(node: Stmt, rewrite: (nodes: readonly Stmt[]) => Stmt[]): Stmt {
  switch (node.kind) {
    case "sequence":
    case "block":
      return { ...node, body: rewrite(node.body) };
    case "commaSequence":
      return { ...node, parts: rewrite(node.parts) as unknown as [Stmt, Stmt] };
    case "if":
      return {
        ...node,
        then: rewrite([node.then])[0],
        otherwise: node.otherwise ? rewrite([node.otherwise])[0] : null,
      };
    case "switch":
      return { ...node, case: rewrite([node.case])[0] as Extract<Stmt, { kind: "switchCase" }> };
    case "switchCase":
      return {
        ...node,
        body: rewrite([node.body])[0],
        otherwise: node.otherwise ? rewrite([node.otherwise])[0] : null,
      };
    case "scoped":
      return { ...node, body: rewrite([node.body])[0] };
    case "sharedCall":
      return node;
    default:
      return node;
  }
}
