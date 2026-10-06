// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * `Code::getStapelHoehe`: how many pictures a blob can have drawn at once.
 *
 * This file had **no test until 15.7**, and that is exactly why it shipped a maximum where
 * upstream has a sum. `stapelHoeheOf` took `Math.max` over a `code` list; a list is
 * `stapel_code: mF1 + mF2`, and every part runs in the same step onto the same stack. The
 * maximum was reached for because the two genuine *branch* nodes also sum into that function and
 * the bug was invisible in review — and `pfeile.ld`, whose kinds hold 30 `draw` nodes between
 * them, then drew two pictures into a stack budgeted for one and threw.
 *
 * So the assertions here are about **which operation each node uses**, not about a total. A test
 * that asserted "`*; *; *` gives 3" would have caught this one, and a test that asserted
 * "`a, b` gives the larger" would have caught the opposite mistake. Both are here, side by side,
 * because the whole content of this transcription is *which is which*.
 *
 * Trees are built by parsing Cual rather than by hand, so the shapes under test are the shapes
 * the parser actually produces — `busy-switch.test.ts` does the same, and for the same reason: a
 * hand-built `switchCase` is a guess about `parseCode`'s output.
 */

import { describe, expect, it } from "vitest";
import { tokenize } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import { maxPicturesOf, stapelHoeheOf } from "./stapel-height.ts";

/** The height of a whole `code` list — a `stapel_code` chain, so a sum. */
function height(source: string): { own: number; foreign: number } {
  return stapelHoeheOf(parseCode(tokenize(source)));
}

/** Just the own-stack depth, which is what `mal_code` costs and what overflows. */
function own(source: string): number {
  return height(source).own;
}

/** Just the neighbour count, which `leveldaten.cpp:545` adds on top. */
function foreign(source: string): number {
  return height(source).foreign;
}

describe("a code list is a sum, because stapel_code is mF1 + mF2", () => {
  it("counts every draw in the list", () => {
    // The assertion that was missing. `*; *; *` is three draws in one step onto one stack, so it
    // needs three layers — `pfeile.ld` is what this got wrong, by a factor of three.
    expect(own("*;")).toBe(1);
    expect(own("*; *;")).toBe(2);
    expect(own("*; *; *;")).toBe(3);
  });

  it("counts a draw inside braces, because braces are stapel_code too", () => {
    // `'{' code '}'` returns `$2` unchanged upstream — the braces are not a node — so a block
    // costs exactly its contents and adds to its siblings.
    expect(own("{*; *;}; *;")).toBe(3);
    expect(own("{{*;}; {*; *;}};")).toBe(3);
  });

  it("counts a draw under a local binding, because push_code costs its body", () => {
    // `push_code: return mF2->getStapelHoehe(nsh);` — `mF2` is the *body*, since
    // `newCode3(push_code, expr, body, variable)` puts the expression first, and upstream's own
    // header says an expression is assumed not to draw.
    expect(own("[counter=1] {*;}")).toBe(1);
    expect(own("[counter=1] {*; *}")).toBe(2);
  });

  it("sums a forwarded body, because weiterleit_code costs what it points at", () => {
    expect(own("&held;")).toBe(0);
    expect(own("&held; *;")).toBe(1);
  });
});

describe("a branch takes the larger, because only one arm runs", () => {
  it("takes the larger arm of a comma sequence", () => {
    // `folge_code: max(mF1, mF2)` — one member per step, so never both at once. This is the
    // assertion that pins the *other* half of the distinction, and it is here next to the sum
    // above on purpose: a change that made `,` add would break this, and one that made `;` take
    // a maximum would break that.
    expect(own("*, *")).toBe(1);
    expect(own("*; *, *;")).toBe(2);
    expect(own("*, *; *")).toBe(2);
  });

  it("takes the deeper arm of a switch", () => {
    // `switch { bed arrow code; bed arrow code; ... }`, one arm per line — the manual's layout and
    // the one `busy-switch.test.ts` uses. Both a one-line switch and a bare `->` continuation
    // failed to parse, so **every arm here carries its own condition**, which is what the parser
    // actually accepts.
    expect(own("switch {\n  1 => *;\n  1 => *;\n}")).toBe(1);
    expect(own("switch {\n  1 => *;\n  0 => {*; *;};\n}")).toBe(2);
    expect(own("switch {\n  1 => *;\n  0 => {*; *;};\n  0 => {*; *; *;};\n}")).toBe(3);
  });

  it("takes the deeper arm of an if/else", () => {
    // `if expr arrow code else [arrow] code;` — **no `;` before `else`** and no `then` keyword,
    // both of which an earlier attempt at this assertion got wrong. The one-armed form is
    // `if expr arrow code;`.
    expect(own("if 1 -> * else {*; *}")).toBe(2);
    expect(own("if 1 -> {*; *} else *")).toBe(2);
    expect(own("if 1 -> {*; *}")).toBe(2);
    expect(own("if 1 -> *")).toBe(1);
  });

  it("still adds the neighbour counts across both arms", () => {
    // **`foreign` sums where `own` maximises**, and that asymmetry is the whole of upstream's
    // `nsh`: it is incremented on the way *through* whichever branch the static walk visits, and
    // this walk visits all of them because it is a bound, not an execution. Taking the maximum
    // here would undercount every level with a foreign draw inside a conditional.
    expect(foreign("switch {\n  1 => @(0,1)*;\n  0 => @(0,-1)*;\n}")).toBe(2);
    expect(own("switch {\n  1 => @(0,1)*;\n  0 => @(0,-1)*;\n}")).toBe(0);
    expect(foreign("if 1 -> @(0,1)* else @(0,-1)*")).toBe(2);
  });
});

describe("a draw costs one own layer or one neighbour, and nothing else does", () => {
  it("counts a plain * on the asking blob's own stack", () => {
    expect(own("*")).toBe(1);
    expect(foreign("*")).toBe(0);
  });

  it("counts a draw at an address on the neighbour's stack, not our own", () => {
    // `mal_code_fremd: nsh++; return 0;` — a different stack, needing depth over there.
    expect(own("@(0,1)*")).toBe(0);
    expect(foreign("@(0,1)*")).toBe(1);
    expect(foreign("@(0,1)*; @(1,0)*")).toBe(2);
    expect(own("@(0,1)*; @(1,0)*")).toBe(0);
  });

  it("counts a letter draw as nothing, because upstream sets pos and draws nothing", () => {
    // `buchstabe_code: b.setVariable(spezvar_pos, mZahl, set_code); return 0;` — a letter only
    // *selects* the icon; the picture comes from a later `*`. So `A; *` costs one layer and `A`
    // alone costs none, which is the whole reason `getStapelHoehe` lists `buchstabe_code`
    // among the `return 0;` cases.
    expect(own("A")).toBe(0);
    expect(own("A; *")).toBe(1);
    expect(foreign("A")).toBe(0);
  });

  it("counts an addressed letter draw as a neighbour draw", () => {
    // **The one place this port's tree is not upstream's.** `A*@(x,y)` is upstream a *two-node*
    // sequence — `stapel_code(buchstabe_code(A), mal_code_fremd(ort))` (`parser.yy:604`) — so it
    // is the `mal_code_fremd` half that increments `nsh` and the letter half that costs nothing.
    // This port models it as one `letterDraw` carrying an optional position, so the addressed
    // form has to contribute the neighbour count itself. Mapping `buchstabe_code => 0` for both
    // shapes would silently halve the budget for every addressed letter draw.
    expect(foreign("A*@(0,1)")).toBe(1);
    expect(own("A*@(0,1)")).toBe(0);
    // And unaddressed it costs nothing at all, which is the case above.
    expect(foreign("A*")).toBe(0);
  });

  it("costs nothing for everything that is not a draw", () => {
    // Upstream's run of `return 0;` cases: set/add/sub/mul/div/mod, nop, busy, buchstabe, zahl,
    // bonus, message, explode, sound, verlier, bitset, bitunset — plus this port's `call`, which
    // is spliced away before it runs.
    expect(own("pos=1")).toBe(0);
    expect(own("pos=1; qu=2; file=3")).toBe(0);
    expect(own("pos+=2; pos-=3; pos*=4; pos/=5; pos%=6")).toBe(0);
    expect(own("busy")).toBe(0);
    expect(own("bonus(1)")).toBe(0);
    expect(own('message("hi")')).toBe(0);
    // `explode` takes no argument in Cual (the size is `spezconst_size`), and `sound`
    // is not a call at all: upstream's `sound_code` reads `spezvar_file`, so the sound is
    // chosen by `file` like any other picture.
    expect(own("explode")).toBe(0);
    expect(own("file=3")).toBe(0);
    expect(own("verlier")).toBe(0);
    // `bitset`/`bitunset` are assignment *operators*, not calls: `pos bitset 1;`
    // (`set_zeile: variable zuweisungs_operator ausdruck`). An earlier version of this
    // assertion wrote them as `bitset(1)` and did not parse.
    expect(own("pos bitset 1; pos bitunset 1;")).toBe(0);
    expect(own("nothing")).toBe(0);
  });
});

describe("maxPicturesOf", () => {
  it("is the largest own depth plus every neighbour count", () => {
    // `sorte.cpp:133` takes a running maximum of the own depths over the kinds and
    // `leveldaten.cpp:545` then adds the accumulated neighbour total once. So it is a max and a
    // sum, from two different places — which is why the two halves are named here.
    expect(maxPicturesOf([parseCode(tokenize("*; *; *")), parseCode(tokenize("*"))])).toBe(3);
    expect(maxPicturesOf([parseCode(tokenize("@(0,1)*")), parseCode(tokenize("*; *"))])).toBe(3);
  });

  it("skips a kind with no draw code, because upstream only asks a kind that has one", () => {
    // `sorte.cpp:132`'s `if (mEventCode[event_draw])`. A null entry contributes nothing at all,
    // not a zero-height kind — so a level where every kind draws nothing still gets a stack.
    expect(maxPicturesOf([null, parseCode(tokenize("*; *; *"))])).toBe(3);
    expect(maxPicturesOf([null, null])).toBe(1);
  });

  it("is at least 1, because a stack of height 0 could hold nothing", () => {
    // `BildStapel` allocates `mMaxAnz` layers and `speichereBild` refuses the first picture a
    // level ever draws if it is 0 — so a level whose draw code is all conditionals and letters
    // still needs somewhere to put the picture when a condition does fire.
    // `parseCode` refuses an empty block, so the "all conditionals" kind is a list the caller
    // built rather than one the parser produced — which is also how the loader spells a
    // kind whose draw code turned out to be nothing.
    expect(maxPicturesOf([parseCode(tokenize("pos=1")), []])).toBe(1);
    expect(maxPicturesOf([])).toBe(1);
  });
});