/**
 * Procedure calls: the splice, the `&` share, and the absence of a call stack.
 *
 * Task 4.14. What is asserted here is the *link*, which is where all of task 4.14's behaviour
 * lives: a call is resolved when the level is read, a plain one splices a copy with new busy
 * numbers, and `&name` keeps the definition's. `cual.6`'s ampersand section is the only place
 * that distinction is written down, so its two examples are the tests.
 *
 * **What is not asserted here, and why** — see the last describe block. The man page's examples
 * are written as a `switch` whose branch is chosen by `myvar`, which exercises the animation's
 * advance inside a *spliced* body, and that does not advance frame by frame yet. It is recorded
 * as task 4.17 rather than asserted with numbers I could not justify.
 */

import { describe, expect, it } from "vitest";
import { linkCalls } from "./link.ts";
import type { LinkResult } from "./link.ts";
import { parseCode } from "./code.ts";
import type { Stmt } from "./code.ts";
import { allocateSlots } from "./slots.ts";
import type { Allocation } from "./slots.ts";
import { tokenize } from "../level-format/lexer.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

type Linked = LinkResult & { readonly allocated: Allocation };

/**
 * Parse, link and allocate — the order upstream does them in.
 *
 * `var xx;` is prepended because `allocateSlots` numbers user variables from their
 * *declarations*. Without it the store is one slot too small and every write lands outside the
 * allocation, which reads as "the call did nothing" rather than as a missing declaration.
 */
function link(source: string): Linked {
  const result = linkCalls(parseCode(lex(`var xx; ${source}`)), new Map());
  return { ...result, allocated: allocateSlots([...result.statements]) };
}

/** The linked statements, with a leading `;`-sequence unwrapped. */
function top(linked: { readonly statements: readonly Stmt[] }): readonly Stmt[] {
  const first = linked.statements[0];
  return first?.kind === "sequence" ? first.body : linked.statements;
}

describe("a call is resolved when the level is parsed", () => {
  it("leaves no call in the tree", () => {
    // Upstream splices a copy of the definition's `Code` into the caller, so after linking there
    // is nothing to call at run time — which is why there is no call stack, no depth limit and
    // no return value.
    const linked = link("tor_1 = { xx += 1 }; tor_1; tor_1;");
    expect(top(linked).some((s) => s.kind === "call")).toBe(false);
  });

  it("inlines the body at each call site", () => {
    // The spliced statement is the procedure's body *node*, which for `{ .. }` is the block —
    // so two calls give two blocks, not two bare assignments.
    const linked = link("tor_1 = { xx += 1 }; tor_1; tor_1;");
    expect(top(linked).map((s) => s.kind)).toEqual(["block", "block"]);
    expect(top(linked)).not.toBe(linked.statements[0]?.kind === "sequence" ? [] : []);
  });

  it("cannot recurse, because the definition is stored after its own body is parsed", () => {
    // `proc_def_wort version '=' code_1 ';'` runs `speicherDefinition` in its *action*, after
    // `code_1` is fully reduced — so a procedure's own body cannot see the procedure.
    //
    // Collecting every definition before rewriting anything would link `tor_1 = { tor_1; }`
    // cleanly and build an infinitely recursive tree, so `linkCalls` walks in source order and
    // registers each definition only after rewriting its body.
    const linked = link("tor_1 = { xx += 1; tor_1; };");
    expect(linked.unresolved).toEqual([{ name: "tor_1", position: "copied" }]);
  });



  it("takes the last definition of a name, as a scope does", () => {
    const linked = link("tor_1 = { xx += 1 }; tor_1 = { xx += 10 }; tor_1;");
    expect(linked.unresolved).toEqual([]);
    expect(top(linked).filter((s) => s.kind === "block")).toHaveLength(1);
  });

  it("throws on a call to a procedure that was never defined", () => {
    // `PEND_TRY($$ = newCode0(undefiniert_code))` — the grammar substitutes a node that throws
    // at eval time: "Internal error in Code::eval(): CodeArt undefined_code". Left unlinked
    // here, so the throw can name the procedure at run time.
    const linked = link("tor_1;");
    expect(linked.unresolved).toEqual([{ name: "tor_1", position: "copied" }]);
    expect(top(linked).map((s) => s.kind)).toEqual(["call"]);
  });

  it("records which form an unresolved call used", () => {
    // `&name` is the sharing form and a plain `name` is the copy, so a level with a typo in one
    // of them reports *which* — the two need different fixes.
    expect(link("&tor_1;").unresolved).toEqual([{ name: "tor_1", position: "shared" }]);
    expect(link("tor_1;").unresolved).toEqual([{ name: "tor_1", position: "copied" }]);
  });

  it("has no expression form, so there is no return value", () => {
    // `set_zeile: variable zuweisungs_operator ausdruck`, and the grammar has no call in
    // expression position — Cual has procedures, not functions. `yy = f(xx)` does not parse,
    // so there is nothing for a caller to receive.
    expect(() => parseCode(lex("f = { xx + 1 }; yy = f;"))).toThrow();
  });
});

describe("a call splices, so it gets its own busy numbers", () => {
  it("numbers two copies separately", () => {
    // `Code(DefKnoten * knoten, const Code & f, bool neueBusyNummern)` with
    // `neueBusyNummern == true` for the plain form. A three-member comma sequence is
    // left-nested and binary (`folge(folge(a,b),c)`), so it is two flagged nodes, and two
    // copies are four.
    const linked = link("anim = { xx += 1, xx += 10, xx += 100 }; anim; anim;");
    expect(linked.allocated.busySlots.size).toBe(4);
    const keys = [...linked.allocated.busySlots.values()].map((f) => `${f.first}/${f.second}`);
    expect(new Set(keys).size).toBe(4);
  });

  it("does not keep the definition's own flags, because the definition is dropped", () => {
    const linked = link("anim = { xx += 1, xx += 10, xx += 100 }; anim;");
    expect(linked.allocated.busySlots.size).toBe(2);
  });
});

describe("& shares the definition's busy numbers", () => {
  it("holds one body, so two & sites are one animation", () => {
    // `cual.6`, example 2: `&anim;` twice. `neueBusyNummern` is false, so the body is not
    // copied and both sites number against the *same* nodes.
    const linked = link("anim = { xx += 1, xx += 10 }; &anim; &anim;");
    const survivors = top(linked);
    expect(survivors.map((s) => s.kind)).toEqual(["sharedCall", "sharedCall"]);
    const [a, b] = survivors as readonly { body: readonly Stmt[] }[];
    // The same array, which is what "the same animation" means.
    expect(a.body).toBe(b.body);
    // And one flag between them, against the definition's.
    expect(linked.allocated.busySlots.size).toBe(1);
  });

  it("is what makes an animation continue rather than restart", () => {
    // > in example 2, the "same" animation is used in both cases, so the animation will simply
    // > continue.
    //
    // One flag for one body, so the frame count is the body's rather than each site's.
    // A three-member comma sequence is left-nested and binary, so it is *two* flagged nodes.
    const shared = link("anim = { xx += 1, xx += 10, xx += 100 }; &anim; &anim;");
    // > (Removing the ampersands from example 2 will turn the behaviour to the one of
    // > example 1.)
    const copied = link("anim = { xx += 1, xx += 10, xx += 100 }; anim; anim;");
    // Two flags for one shared body, four for two copies of it — the structural difference the
    // man page describes, measured rather than restated.
    expect([shared.allocated.busySlots.size, copied.allocated.busySlots.size]).toEqual([2, 4]);
  });

  it("contributes nothing to the enclosing sequence's own flag", () => {
    // `getStapelHoehe` forwards for `weiterleit_code`, and `eval` is
    // `mF1->eval(b, busy); return 0;` — a forward. So the shared call is transparent to the
    // stack and to the surrounding comma sequence.
    const linked = link("anim = { xx += 1, xx += 10 }; xx += 100, &anim;");
    // One flag for the enclosing `xx += 100, &anim`, one for the animation inside it.
    expect(linked.allocated.busySlots.size).toBe(2);
  });
});

describe("the declarations go", () => {
  it("drops var, default and procedure definitions from the statement list", () => {
    // Upstream keeps these as definitions — `speicherDefinition`, `neueVarDefinition` — and
    // never runs them. Left in, a spliced body would drag the whole declaration list into every
    // call site.
    // `var xx;` is prepended by `link`, so this source adds `default xx = 3;` on top.
    const linked = link("default xx = 3; tor_1 = { xx += 1 }; xx += 1;");
    expect(top(linked).map((s) => s.kind)).toEqual(["assign"]);
  });


});

describe("the known gap this task leaves behind", () => {
  it("only recognises a definition as the first statement of a zeile", () => {
    // **One gap, three shapes**, and all of them are the same thing: upstream's grammar is
    // `code_modus: code_modus code_zeile`, so `name = body;` is a zeile *wherever* it appears
    // in a `<< >>`. This parser only probes for one at a zeile boundary, so a definition after
    // any other statement — or inside a block — is read as a call followed by garbage.
    //
    // A `var` or `default` line *does* leave a boundary, so `var xx; var yy; tor_1 = { .. };`
    // parses — which is why the corpus never hit this. What has no boundary is a statement that
    // consumed its own `;` inside a sequence: another call, another definition, or anything
    // inside a `{ .. }`.
    //
    // Every level in the corpus puts each definition in its own `<< >>`, so 3.5's 339/339 never
    // saw it, and it was not worth risking that to change while the linker's own behaviour was
    // still being established. It is task 4.17.
    //
    // Asserted so it stays visible: a test that *expects* the failure fails loudly the day the
    // gap closes, and a test that skipped it would let the parser drift either way.
    for (const source of [
      // A call before it: the call's statement ate the boundary.
      "var xx; tor_1; tor_1 = { xx += 1 };",
      // Two definitions in a row: the first one's body ate the boundary.
      "var xx; a = { xx += 1 }; tor_1 = { xx += 1 };",
      // Inside a block: a `{` opens a `code`, and nothing probes inside one.
      "var xx; if 1 -> { tor_1 = { xx += 1 }; }",
    ]) {
      expect(() => parseCode(lex(source)), source).toThrow();
    }
  });

  it("still links one definition per block, which is every level's shape", () => {
    // Upstream's convention, and the reason the gap above costs nothing today: a `<< >>` block
    // holds **one** definition. `anim = {1; A,B,C,D; *};` is its own block, and the level's
    // `var`s are in another. So "one definition per block" is what every corpus level does, and
    // it is the shape this links.
    const linked = link("anim = { xx += 1, xx += 10 }; &anim;");
    expect(linked.unresolved).toEqual([]);
    expect(top(linked).map((s) => s.kind)).toEqual(["sharedCall"]);
    expect(linked.allocated.busySlots.size).toBe(1);
  });
});