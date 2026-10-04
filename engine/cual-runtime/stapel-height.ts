/**
 * `Code::getStapelHoehe`: how many pictures one blob can draw at once.
 *
 * `src/code.cpp:220`, transcribed, because 15.5 needs it and nothing else does. Upstream works
 * the figure out while loading the level rather than counting draws as they happen, and that is
 * the whole point: `BildStapel` allocates `mMaxAnz = ld->mStapelHoehe` **layers** up front
 * (`src/bildstapel.cpp:42`), so the budget has to be a static property of the compiled program
 * — a level whose draw code could exceed it would have no way to notice until it drew one
 * picture too many.
 *
 * ## Two numbers, not one
 *
 * `getStapelHoehe(int & nsh)` takes a reference and increments it for every draw aimed at a
 * *neighbour's* stack. So it reports two different things:
 *
 * - **own** — the deepest a blob's own stack gets, which is `mal_code` counting 1 and
 *   `mal_code_fremd` counting 0. Only a plain `*` puts a picture on your own stack.
 * - **foreign** — how many draws aim at somebody else's, which is a *different* stack and needs
 *   depth there.
 *
 * `sorte.cpp:133` takes the running maximum of `own` over every kind, and
 * `leveldaten.cpp:545` then adds the accumulated `foreign` total once:
 *
 *     mStapelHoehe = max over kinds of own(k) + sum over kinds of foreign(k)
 *
 * ## One place where this port's tree is not upstream's, and the mapping accounts for it
 *
 * `A*@(x,y)` is upstream a **two-node** sequence — `stapel_code(buchstabe_code(A),
 * mal_code_fremd(ort))` (`src/parser.yy:604`) — so it is the `mal_code_fremd` half that
 * increments `nsh` and the letter half that counts 0. This port models it as **one**
 * `letterDraw` node carrying an optional position. So `letterDraw` contributes `foreign++` when
 * it has a position and 0 when it does not, which is the same answer reached by a different
 * route — and worth stating, because reading the port's node kinds against upstream's switch and
 * mapping `buchstabe_code => 0` for both shapes would silently halve the budget for every
 * addressed letter draw.
 */

import type { Stmt } from "./code.ts";

/** What one program's draw code needs: its own depth, and how many foreign draws it makes. */
export interface StapelHoehe {
  /** `getStapelHoehe`'s return value: pictures on the asking blob's own stack. */
  readonly own: number;
  /** `nsh`: pictures aimed at a neighbour's stack, which needs depth over there. */
  readonly foreign: number;
}

/**
 * The height of one `code` list, in pictures.
 *
 * Every case of upstream's switch, in upstream's order. `max` and not `+` for the two
 * alternatives is the point of `folge_code` and `bedingung_code`: only one branch runs, so the
 * stack reaches the deeper of the two and never their sum.
 */
export function stapelHoeheOf(statements: readonly Stmt[]): StapelHoehe {
  let own = 0;
  let foreign = 0;
  for (const statement of statements) {
    const height = stapelHoeheOfStatement(statement);
    // **A sum, and this was a maximum until 15.7.** A `code` list is `stapel_code`, upstream is
    // `mF1 + mF2`, and every part runs in the same step onto the same stack — so `a; b; c` with
    // three draws needs three layers, not one. The maximum was reached for because the two
    // *branch* nodes also sum to here and taking the max hid the difference: `pfeile.ld`'s kinds
    // hold 30 `draw` nodes between them and the budget came out 1, so the second real draw of the
    // first step threw "too many pictures drawn for one single blob".
    own += height.own;
    foreign += height.foreign;
  }
  return { own, foreign };
}

/** `Code::getStapelHoehe` for one node. */
function stapelHoeheOfStatement(node: Stmt): StapelHoehe {
  switch (node.kind) {
    // `weiterleit_code: return mF1->getStapelHoehe(nsh);` — `&name` forwards to the shared
    // body, so the body is what costs. Upstream's forward can never be busy, which is 4.18's
    // subject and not this one's.
    case "sharedCall":
      return stapelHoeheOf(node.body);

    // `stapel_code: mF1 + mF2` — both sides run in the same step, so their pictures **add**, and
    // `stapelHoeheOf` is what sums. So both of these are just their own list:
    //
    // - `sequence` is `a; b; c`.
    // - `block` is `{ ... }`, which is `stapel_code` upstream too (`'{' code '}'` returns `$2`
    //   unchanged, so braces are not a node); kept as one here and it costs the same either way.
    //
    // The comment is above both labels rather than between them because a comment between two
    // labels reads as a fallthrough to `no-fallthrough`, and it is not one.
    case "sequence":
    case "block":
      return stapelHoeheOf(node.body);

    // `push_code: return mF2->getStapelHoehe(nsh);` — `mF2` is the *body*, because
    // `newCode3(push_code, expr, body, variable)` (`src/parser.yy:549`) puts the expression
    // first. Upstream's own header says expressions are assumed not to draw and `getStapelHoehe`
    // must not be called on them, so there is nothing to add.
    case "scoped":
      return stapelHoehe(node.body);

    // `folge_code: max(mF1, mF2)` — one member per step, so never both at once.
    case "commaSequence":
      return maxOf(stapelHoehe(node.parts[0]), stapelHoehe(node.parts[1]));

    // `bedingung_code: max(mF2, mF3)` — one arm runs.
    case "if":
      return node.otherwise === null
        ? stapelHoehe(node.then)
        : maxOf(stapelHoehe(node.then), stapelHoehe(node.otherwise));
    case "switchCase":
      return node.otherwise === null
        ? stapelHoehe(node.body)
        : maxOf(stapelHoehe(node.body), stapelHoehe(node.otherwise));
    // `auswahl_liste` chains, and the chain hangs off the *first* case's `otherwise`, so a
    // `switch` is its first case and nothing more.
    case "switch":
      return stapelHoehe(node.case);

    // `mal_code: return 1;` — the only node that puts a picture on your own stack.
    case "draw":
      return node.position === null ? { own: 1, foreign: 0 } : { own: 0, foreign: 1 };

    // `buchstabe_code` is 0 in both shapes, but `A*@(x,y)` is upstream a sequence of a letter
    // *and* a `mal_code_fremd`, so the addressed form still costs a neighbour stack. See the
    // header: this is the one mapping where the port's tree shape differs from upstream's.
    case "letterDraw":
      return node.position === null ? { own: 0, foreign: 0 } : { own: 0, foreign: 1 };

    // The zero cases, which upstream lists as one run of `return 0;`: set/add/sub/mul/div/mod,
    // nop, busy, buchstabe, zahl, bonus, message, explode, sound, verlier, bitset, bitunset.
    // `assign` is this port's `set_zeile`; `effect` covers the five effects; `busy` is
    // `busy_code`; `number` is `zahl_code`.
    case "assign":
    case "busy":
    case "effect":
    case "number":
      return { own: 0, foreign: 0 };

    // Not `Code` at all upstream — definitions and declarations are stored as definitions and
    // never executed, so they have no stack height. `call` is spliced before it runs (4.14), so
    // by the time a tree is walked the call sites are gone and an unresolved one never draws.
    case "call":
    case "varDecl":
    case "defaultDecl":
    case "procedureDef":
    case "include":
    case "nothing":
      return { own: 0, foreign: 0 };
  }
}

function stapelHoehe(statement: Stmt): StapelHoehe {
  return stapelHoeheOfStatement(statement);
}

function maxOf(a: StapelHoehe, b: StapelHoehe): StapelHoehe {
  return {
    own: Math.max(a.own, b.own),
    // **Both sides are added, not the larger.** Upstream increments `nsh` on the way *through*
    // whichever branch it walks, and this walk visits every branch because it is a static
    // bound — so `foreign` accumulates across both arms while `own` takes the maximum. Taking a
    // maximum here would undercount every level with a foreign draw in a conditional.
    foreign: a.foreign + b.foreign,
  };
}

/**
 * `ld->mStapelHoehe`: the per-blob picture budget for a whole level.
 *
 * The maximum of the own-depths plus the sum of the foreign counts, which is
 * `leveldaten.cpp:545`'s `mStapelHoehe += mNachbarStapelHoehe` over `sorte.cpp:133`'s running
 * maximum. Kinds with no draw code contribute nothing, because `sorte.cpp:132` only asks a kind
 * that has one.
 *
 * At least 1, because a `BildStapel` of height 0 could hold nothing and `speichereBild` would
 * refuse the first picture a level ever draws.
 */
export function maxPicturesOf(drawCode: readonly (readonly Stmt[] | null)[]): number {
  let own = 0;
  let foreign = 0;
  for (const code of drawCode) {
    if (code === null) continue;
    const height = stapelHoeheOf(code);
    own = Math.max(own, height.own);
    foreign += height.foreign;
  }
  return Math.max(1, own + foreign);
}