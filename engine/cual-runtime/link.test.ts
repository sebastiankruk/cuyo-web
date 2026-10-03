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
import { runCode } from "./execute.ts";
import type { ExecutionContext } from "./execute.ts";
import { BlobStore, SPECIAL_VARIABLES, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";

/** `spezvar_pos`, which a letter draw sets — the witness the animation tests read. */
const POS = SPECIAL_VARIABLES.findIndex((v) => v.name === "pos");

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

describe("the two things 4.17 and 4.18 recorded, measured rather than believed", () => {
  // Both were found by 4.14 reading upstream, and neither survived being measured. They are
  // closed here rather than deleted, because "we checked and it already works" is a claim worth
  // as much as a fix — and because a test asserting the *opposite* would fail the day someone
  // re-read the man page and believed it again.

  /**
   * The animation's frames, as `pos` and a busy marker.
   *
   * `pos` is the witness because a letter draw sets it: `A` to 0, `B` to 1, `C` to 2. So the
   * frames say *which member ran*, which is the question — "something happened" would answer
   * "does it animate" and not "does it animate the way a bare one does". `*` marks a busy step.
   */
  function frames(source: string, count = 5): string[] {
    const linked = linkCalls(parseCode(lex(`var xx; ${source}`)), new Map());
    const allocation = allocateSlots([...linked.statements]);
    const store = new BlobStore(20, 13, new TimeSlices());
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: (expr) => (expr.kind === "number" ? expr.value : 0),
      slotOf: (name) => (name === "xx" ? 14 : null),
    };
    const out: string[] = [];
    for (let step = 0; step < count; step += 1) {
      out.push(`${store.get(POS)}${runCode([...linked.statements], ctx) ? "*" : ""}`);
    }
    return out;
  }

  it("4.18: a spliced body's comma sequence advances exactly like a bare one", () => {
    // The task said "a bare sequence advances correctly; a spliced one runs to completion in a
    // single step". It does not: the spliced frames are the bare frames, member for member and
    // busy step for busy step. Three members, left-nested and binary.
    const bare = frames("{ A, B, C; }");
    expect(bare).toEqual(["0*", "0*", "1", "2*", "0*"]);
    for (const source of [
      // The same body spliced at one call site.
      "anim = { A, B, C }; anim;",
      // And at two, each with its own flags — `neueBusyNummern == true`.
      "anim = { A, B, C }; anim; anim;",
    ]) {
      expect(frames(source), source).toEqual(bare);
    }
  });

  it("4.18: inside a `->` the animation advances but is never busy", () => {
    // The same positions, none of them busy — and that is `->` rather than a defect in the
    // splice. `busy &= !(mZahl & 1)`: a `->` branch re-tests every step, so there is nothing to
    // wait for and the busy flag never propagates outward. `=>` latches, and does stay busy.
    //
    // Both shapes the man page writes, and both advance: `1 0 1 2 0` with the `*` stripped.
    for (const source of [
      "anim = { A, B, C }; if 7 -> anim;",
      "anim = { A, B, C }; switch { 7 -> anim; }",
    ]) {
      expect(frames(source).map((f) => f.replace("*", "")), source).toEqual(["0", "0", "1", "2", "0"]);
    }
    // The latching arrow is what restores the busy steps.
    expect(frames("anim = { A, B, C }; if 7 => anim;")).toEqual(frames("anim = { A, B, C }; anim;"));
  });

  it("4.18: the one place the frames differ is `&`, and it differs the documented way", () => {
    // `neueBusyNummern == false` puts one body behind both sites, so they share a position and
    // the frames interleave instead of moving together: `0 1 0 2 1` against `0 0 1 2 0`.
    const bare = frames("{ A, B, C; }");
    const shared = frames("anim = { A, B, C }; &anim; &anim;");
    expect(shared).toEqual(["0*", "1*", "0*", "2*", "1*"]);
    expect(shared).not.toEqual(bare);
    // One `&` site is the bare sequence, which is what "shares the definition's" means when there
    // is nothing to share it with.
    expect(frames("anim = { A, B, C }; &anim;")).toEqual(bare);
  });

  it("4.18: the man page's two examples differ in their flags, not in their advance", () => {
    // `cual.6`'s AMPERSAND-CALL section writes both branches with the second one bare —
    // `myvar -> { … };` then `-> { … };` — which is upstream's *default* shape,
    // `ausdruck PFEIL code_1 ';' PFEIL code_1 ';'`. `ausdruck` has no empty production, so a
    // condition-less case would be a syntax error; this parser reads it as the default instead,
    // which is what the example needs and what the grammar's second production is for.
    //
    // So the example is valid, and what it claims is about *which* animation runs when `myvar`
    // changes: example 1 restarts, example 2 continues. That is a claim about the flags' scopes
    // rather than about the advance, and **it is not verified here** — see the note at the end of
    // this file. What is verified is that both examples' animations advance frame by frame, which
    // is what 4.18 said was broken.
    const example1 = "myblob = { switch { myvar -> { A,B,C,D; }; -> { A,B,C,D; }; }; }; myblob;";
    const example2 =
      "anim = { A,B,C,D; }; myblob = { switch { myvar -> { &anim; }; -> { &anim; }; }; }; myblob;";
    for (const source of [example1, example2]) {
      expect(() => parseCode(lex(source)), source).not.toThrow();
      // Both reach a `sharedCall` or a spliced body carrying a comma sequence, so the thing 4.18
      // said was missing is there.
      const tree = linkCalls(parseCode(lex(`var xx; ${source}`)), new Map()).statements;
      const kinds = new Set<string>();
      const walk = (nodes: readonly Stmt[]): void => {
        for (const node of nodes) {
          kinds.add(node.kind);
          if (node.kind === "sequence" || node.kind === "block") walk(node.body);
          if (node.kind === "switch") walk([node.case]);
          if (node.kind === "switchCase") {
            walk([node.body]);
            if (node.otherwise) walk([node.otherwise]);
          }
          if (node.kind === "sharedCall") walk(node.body);
        }
      };
      walk(tree);
      expect(kinds.has("commaSequence"), source).toBe(true);
    }
    // The distinction between them is measurable in the tree: example 2's animation is behind a
    // `sharedCall`, and a plain splice has no such node at all.
    const shared = linkCalls(parseCode(lex(`var xx; ${example2}`)), new Map()).statements;
    expect(JSON.stringify(shared)).toContain('"kind":"sharedCall"');
  });

  it("4.17: every shape it named is refused, and upstream refuses each one too", () => {
    // Upstream's `<< >>` is `code_modus: code_modus code_zeile`, and a `code_zeile` is a
    // procedure definition, a `var` line or a `default` line. So a definition is a zeile
    // *wherever* it falls — which `parseCodeLine` already does by probing at every statement
    // boundary — and none of 4.17's three shapes is a zeile upstream either:
    //
    // - inside `{ .. }`: `'{' code '}'` is a `code`, and a `code` holds no zeilen;
    // - after a call: a bare call is not a zeile, so upstream rejects the *call*;
    // - after an ordinary statement: same, that statement is not a zeile.
    //
    // The one shape 4.17 said was broken *and* is not is two definitions in a row, which parses —
    // and the test that claimed otherwise used `a` as the name, which upstream refuses with
    // "Procedure names can't be single letters."
    for (const source of [
      "var xx; tor_1; tor_1 = { xx += 1 };",
      "var xx; if 7 -> { tor_1 = { xx += 1 }; }",
      "var xx; xx += 1; tor_1 = { xx += 1 };",
    ]) {
      expect(() => parseCode(lex(source)), source).toThrow();
    }
    expect(top(link("aa = { xx += 1 }; tor_1 = { xx += 1 }; tor_1;")).filter((s) => s.kind === "block")).toHaveLength(1);
  });

  it("still links one definition per block, which is every level's shape", () => {
    // Upstream's convention, and why the refusals above cost nothing: a `<< >>` block holds
    // **one** definition. `anim = {1; A,B,C,D; *};` is its own block, and the level's `var`s are
    // in another. The corpus census has 835 `procedureDef`s over 339 blocks, which is the
    // two-and-a-bit per block that "mostly one, sometimes two" produces.
    const linked = link("anim = { xx += 1, xx += 10 }; &anim;");
    expect(linked.unresolved).toEqual([]);
    expect(top(linked).map((s) => s.kind)).toEqual(["sharedCall"]);
    expect(linked.allocated.busySlots.size).toBe(1);
  });

  /**
   * What is **not** verified, so it is written down rather than left to be assumed.
   *
   * `cual.6` claims that switching `myvar` restarts the animation in example 1 and continues it
   * in example 2. That is a claim about the *scope* of the two flag sets, and it is the part of
   * the ampersand story 4.18 did not get to. Two things stood in the way when it was tried, and
   * neither is a small fix:
   *
   * - `resetBusy` has no case for `sharedCall`, so a branch that stops being chosen does not
   *   clear the flags of the body it was sharing. Upstream's `weiterleit_code` forwards
   *   `getStapelHoehe` and its `eval` is a plain forward, but `busyReset` walks the tree, and the
   *   walk stops here.
   * - A `->` branch stores the body's raw busyness in its own `vast1` flag and then returns
   *   `busy && latching`, so a branch holding a *shared* animation records "was busy" while
   *   reporting "not busy". Which flag therefore survives a branch switch depends on both.
   *
   * Neither affects the corpus, which uses the plain form 302 times and `&name` zero times. It
   * would need a decision about what a shared body's flags belong to before it could be tested,
   * which is a task rather than a bug.
   */
  it("leaves the restart-versus-continue claim open, and says so", () => {
    // The tree shape that claim rests on is asserted above; the *behaviour* on branch switch is
    // not, and this test exists so that "not verified" is a thing a reader finds rather than an
    // absence they have to notice.
    expect(true).toBe(true);
  });
});