// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * `cual.6`'s busy-switch example, transcribed and driven through the real evaluator.
 *
 * Task 12.1's sixth item. Five of the six manual examples were already encoded — the
 * division/modulo table in `divmod.test.ts`, the six `@`-assignments in
 * `six-examples.test.ts`, the apple/orange distkeys in `startdist.test.ts` — and this is
 * the one that was not. It is also the only one of the six whose claim is about
 * *differences between two pieces of syntax*, which is why it is worth having: nothing else
 * in the manual states something that a plausible implementation could get backwards.
 *
 * The example, verbatim from `docs/cual.6` under BUSIENESS:
 *
 * >   switch {
 * >     1:100 => {B*, C*, D*, E*};
 * >     -> A*;
 * >   };
 *
 * > This code fragment normally draws the icon at position A (0). But in each step, with a
 * > probability of 1/100, an animation sequence consisting of icons B, C, D and E is started.
 * > With a normal arrow ("->") after the "1:100", after the step in which B has been drawn,
 * > the probability would be 99/100 that A is drawn again. But with the double arrow, the
 * > switch statement won't switch back to A until the animation has terminated.
 *
 * And the parenthetical, which is a separate claim and the sharpest one here:
 *
 * > (Btw: It doesn't matter if there's a "->" or a "=>" before the "A*"; A* isn't busy
 * > anyway.)
 *
 * ## Why the arrow before `A*` cannot matter
 *
 * That follows from the busieness rules the same section gives: a draw is never busy, for
 * either spelling. So the default branch finishes immediately whichever arrow precedes it,
 * and whether that arrow latches decides nothing — there is nothing for the latch to hold.
 *
 * The consequence for an implementation is that **`otherwiseLatching` cannot be assumed equal
 * to `latching`.** They are separate arrows and upstream stores them separately (`mZahl & 2`),
 * and `pacman.ld` writes `=> R,R,R,R,R,R,R; ->`, where assuming they are equal gets the
 * default branch's behaviour wrong. This file checks the parse of both.
 *
 * ## The observable difference, and why it is a draw count
 *
 * "Won't switch back to A until the animation has terminated" is about *re-evaluating the
 * condition*, and `1:100` is `bool(random(100) < 1)` — **one draw per evaluation**. So a
 * latching case stops drawing and a non-latching one keeps drawing, every step, for as long
 * as the body runs. Counting draws measures the claim directly rather than inferring it from
 * which icon appeared, and it cannot be satisfied by a branch that draws the right pictures
 * for the wrong reason.
 */

import { describe, expect, it } from "vitest";
import { tokenize } from "../level-format/lexer.ts";
import { parseCode } from "./code.ts";
import { runCode } from "./execute.ts";
import type { ExecutionContext } from "./execute.ts";
import { allocateSlots } from "./slots.ts";
import { BlobStore, TimeSlices } from "./store.ts";
import { PictureStack } from "./draw.ts";
import type { PictureSource } from "./draw.ts";
import { evaluate } from "./expr.ts";
import type { EvalContext } from "./expr.ts";
import type { AccessField, Here } from "./access.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/** The blob asks from (1,1); the field is four wide and four tall. */
const HERE: Here = { kind: "cell", x: 1, y: 1, right: false };

/** Four icons per file, room for fifty pictures — the same shape `draw.test.ts` uses. */
const SOURCE: PictureSource = { pictureCount: () => 4, maxPictures: 50 };

/** A field with one cell, enough for a draw to land on a neighbour. */
function field(): AccessField & { stackAt(x: number, y: number): PictureStack } {
  const stacks = new Map<string, PictureStack>();
  const me = () => new BlobStore(20, 13, new TimeSlices());
  return {
    players: 1,
    width: 4,
    height: 4,
    hex: false,
    mirrored: false,
    hexShift: () => false,
    global: new BlobStore(20, 13, new TimeSlices()),
    fallCount: 0,
    here: HERE,
    semiglobal: () => me(),
    at: (right, x, y) => (right ? null : x === 2 && y === 2 ? me() : null),
    stacks,
    stackAt: (x, y) => {
      const key = `${x},${y}`;
      let stack = stacks.get(key);
      if (stack === undefined) {
        stack = new PictureStack();
        stacks.set(key, stack);
      }
      return stack;
    },
  } as AccessField & { stackAt(x: number, y: number): PictureStack };
}

/**
 * A random source that hands out `values` in order, and counts how many were taken.
 *
 * A **count** as well as a sequence, because the count is the claim: `1:100` draws once per
 * evaluation, so "the condition is re-tested every step" and "the condition stopped being
 * tested" are different numbers rather than different pictures.
 *
 * The last value repeats, because a test that runs one step longer than planned should see
 * the last decision continue rather than run off the end and quietly return `undefined`.
 */
function scripted(values: readonly number[]): { int(limit: number): number; taken: number } {
  let at = 0;
  return {
    taken: 0,
    int(limit: number): number {
      const value = values[Math.min(at, values.length - 1)] ?? 0;
      at++;
      this.taken++;
      // Inside the range the expression asks for, so a mis-wired limit cannot be the reason
      // a comparison came out the way it did.
      return Math.max(0, Math.min(limit - 1, value));
    },
  };
}

/** One step's outcome: the pictures drawn, and how many draws the condition cost. */
interface Step {
  readonly drawn: readonly number[];
  readonly drawsBefore: number;
  readonly drawsAfter: number;
}

/**
 * Runs `source` for `steps` steps, reporting what was drawn each step.
 *
 * Each step is a fresh `runCode` over the same statement tree and the same store, because
 * that is what the game does: `runCode` is the per-step entry point, and `resetBusy` is
 * called from inside `runCondition` when the chosen branch changes rather than once per step
 * globally. Driving it any other way would be testing a loop the game does not have.
 */
function run(source: string, steps: number, values: readonly number[]): Step[] {
  const statements = parseCode(lex(source));
  const allocation = allocateSlots(statements);
  const random = scripted(values);
  const evalCtx: EvalContext = { variable: () => 0, random: (l) => random.int(l) };
  // **One store for the whole run, not one per step.** Busy flags live in the blob's variable
  // array (design decision 3), so a fresh store each step resets every flag and latching
  // becomes unobservable — the first version of this file did exactly that, and its
  // "the => latches" assertion failed for the right reason and the wrong fix would have been
  // to weaken the assertion.
  const store = new BlobStore(allocation.slotCount, 13, new TimeSlices());
  const out: Step[] = [];
  for (let i = 0; i < steps; i++) {
    const target = field();
    const ownStack = new PictureStack();
    const ctx: ExecutionContext = {
      store,
      busySlots: allocation.busySlots,
      evaluate: (expr) => evaluate(expr, evalCtx),
      draw: {
        context: {
          drawingAllowed: true,
          picture: { file: 2, pos: 1, quarter: 0 },
          kind: 1,
          field: target,
          here: target.here,
          source: SOURCE,
        },
        ownStack,
        stackAt: (_f, resolved) =>
          resolved.kind === "cell" ? target.stackAt(resolved.x, resolved.y) : null,
      },
    };
    const drawsBefore = random.taken;
    runCode(statements, ctx);
    out.push({
      drawn: ownStack.entries.map((e) => e.pos),
      drawsBefore,
      drawsAfter: random.taken,
    });
  }
  return out;
}

/**
 * The manual's example, and the variant with the first arrow downgraded.
 *
 * **Every `X*` is written `*`.** The manual's letters are distkeys: `letterDraw` resolves one
 * to a *position within the frame the file chose*, and `code.cpp` splits it into a
 * `buchstabe_code` that sets `pos` and a `mal_code` that then draws. This harness supplies a
 * fixed `pos`, so a letter draw sets the position and the picture comes from somewhere this
 * test does not reach — the observable would be empty for every letter and the assertions
 * would be about nothing.
 *
 * So the letters are dropped and the example's *shape* — a four-command animation on the
 * chance branch, a one-command default, and the two arrows — is preserved exactly. Nothing
 * the manual claims depends on which position a letter resolves to; it depends on the arrows
 * and on busyness, and those are transcribed verbatim.
 */
const LATCHING = `switch {
  1:100 => {*, C*, D*, E*};
  -> *;
}`;
const RELATCHING = `switch {
  1:100 -> {*, C*, D*, E*};
  -> *;
}`;

/** 99 is `random(100) < 1` false — the other 99 outcomes, so the animation does not start. */
const MISSES = [99];

describe("the manual's switch parses as it is written", () => {
  it("latches on the => and does not latch on the -> before A*", () => {
    // The two arrows are stored separately, and `otherwiseLatching` is not `latching`.
    // Assuming they are equal gets `pacman.ld`'s `=> R,R,R,R,R,R,R; ->` wrong.
    const parsed = parseCode(lex(LATCHING));
    const kase = (parsed[0] as { case?: { latching: boolean; otherwiseLatching: boolean } }).case;
    expect(kase?.latching).toBe(true);
    expect(kase?.otherwiseLatching).toBe(false);
  });

  it("downgrades only the first arrow when -> replaces =>", () => {
    const kase = (
      parseCode(lex(RELATCHING))[0] as { case?: { latching: boolean; otherwiseLatching: boolean } }
    ).case;
    expect(kase?.latching).toBe(false);
    // The second arrow is untouched, which is the point of recording it separately.
    expect(kase?.otherwiseLatching).toBe(false);
  });
});

describe("1:100 is one draw per evaluation", () => {
  it("costs exactly one draw when the case is reached", () => {
    const [only] = run(LATCHING, 1, MISSES);
    expect(only?.drawsAfter - only?.drawsBefore).toBe(1);
  });

  it("and one draw when it misses too, because the draw precedes the comparison", () => {
    // `code.cpp` evaluates the limit, checks it is non-zero, *then* draws. So a miss costs a
    // draw as well, and a switch that stopped drawing on a miss would desynchronise every
    // replay from upstream.
    const [only] = run(LATCHING, 1, MISSES);
    expect(only?.drawsAfter - only?.drawsBefore).toBe(1);
  });
});

describe("the => latches: the condition stops being re-tested", () => {
  // Hit on step 1, and every outcome after that is a miss. The manual:
  // "with the double arrow, the switch statement won't switch back to A until the animation
  // has terminated."
  const MISSES_AFTER_HIT = [0, 99, 99, 99, 99, 99, 99];

  it("spends no draws at all while the animation is playing", () => {
    // The four-command animation is a comma sequence, so it runs over four steps: `*` on the
    // first and three letter draws after it. A letter draw sets `pos` and pushes no picture,
    // so those steps draw nothing observable — and they spend **no draw**, because a latched
    // case does not re-test its condition while its body is busy. The count is flat at 1.
    const steps = run(LATCHING, 4, MISSES_AFTER_HIT);
    expect(steps.map((s) => s.drawsAfter)).toEqual([1, 1, 1, 1]);
  });

  it("draws the animation's only visible command on the first step", () => {
    const steps = run(LATCHING, 4, MISSES_AFTER_HIT);
    expect(steps[0]?.drawn.length ?? 0).toBeGreaterThan(0);
    // And nothing on the three that follow, because the rest of the sequence is letters.
    expect(steps[1]?.drawn ?? []).toEqual([]);
    expect(steps[3]?.drawn ?? []).toEqual([]);
  });

  it("re-tests only once the animation has terminated, and then takes the default", () => {
    // Step 5 is the first step on which the animation is over, so step 5 is the first on
    // which the condition is evaluated again — it misses, and `-> *` runs. This is the manual's
    // claim as a step number: not before the animation ends, and on the very next step after.
    const steps = run(LATCHING, 6, MISSES_AFTER_HIT);
    expect(steps[4]?.drawsAfter).toBe(2);
    expect(steps[4]?.drawn.length ?? 0).toBeGreaterThan(0);
    // And from then on it asks every step, because the default does not latch either.
    expect(steps[5]?.drawsAfter).toBe(3);
  });
});

describe("the -> re-tests every step, so the condition keeps asking", () => {
  const MISSES_AFTER_HIT = [0, 99, 99, 99, 99, 99, 99];

  it("costs a draw on every step, hit or miss", () => {
    // The direct contrast with the latching case, and the whole point of the manual's "with a
    // normal arrow ... the probability would be 99/100 that A is drawn again".
    const steps = run(RELATCHING, 5, MISSES_AFTER_HIT);
    expect(steps.map((s) => s.drawsAfter)).toEqual([1, 2, 3, 4, 5]);
  });

  it("draws the default on the very next step, abandoning the animation", () => {
    // The manual's most specific claim. Step 1 draws the animation's `*`; step 2 re-tests,
    // misses, and — because choosing the otherwise branch resets the then branch's busy flags
    // — the animation is *abandoned half way* rather than played out. A `*` is drawn on step 2
    // where the latching form draws nothing.
    //
    // This is what "won't switch back to A until the animation has terminated" is contrasting
    // with: the `->` form does not wait.
    const steps = run(RELATCHING, 3, MISSES_AFTER_HIT);
    expect(steps[0]?.drawn.length ?? 0).toBeGreaterThan(0);
    expect(steps[1]?.drawn.length ?? 0).toBeGreaterThan(0);
    expect(steps[2]?.drawn.length ?? 0).toBeGreaterThan(0);
  });

  it("and the two forms disagree from step 2 onwards, which is the whole difference", () => {
    const latched = run(LATCHING, 4, MISSES_AFTER_HIT);
    const relatched = run(RELATCHING, 4, MISSES_AFTER_HIT);
    // Same code but for one character, opposite behaviour, and the divergence is visible in
    // the draw count at every step after the first.
    expect(latched[1]?.drawsAfter).toBe(1);
    expect(relatched[1]?.drawsAfter).toBe(2);
    // The latched form is still playing the animation on step 2; the other has moved on.
    expect(latched[1]?.drawn ?? ["x"]).toEqual([]);
    expect(relatched[1]?.drawn ?? []).not.toEqual([]);
  });
});

describe("the second arrow matters when the default is busy", () => {
  // The manual's own example cannot pin `otherwiseLatching`, and it says why: its default is
  // `A*`, and a draw is never busy, so there is nothing for the arrow to hold. Two mutations
  // found that hole - assuming the two arrows are equal, and skipping the busy reset - both
  // left every test above green.
  //
  // `pacman.ld`'s shape is what does pin it: `=> R,R,R,R,R,R,R; ->`, where the *default* is a
  // seven-command comma sequence and therefore busy for six steps. That is transcribed here,
  // with the letters dropped for the reason in the header.
  const BUSY_PLAIN = `switch {
  1:100 -> {*, C*, D*, E*};
  -> {*, C*, D*, E*};
}`;
  const BUSY_DOUBLE = `switch {
  1:100 -> {*, C*, D*, E*};
  => {*, C*, D*, E*};
}`;

  it("keeps asking every step with ->, and stops asking with =>", () => {
    // **Every outcome misses**, so the *default* is the branch that runs — and `elseLatching`
    // only has anything to say when the otherwise branch was busy last step, which is true
    // from step 2 onwards because the default is a four-command comma sequence.
    //
    // This is the same draw-count observable as the `=>` on the chance branch, applied to the
    // other arrow: a plain default re-tests the condition every step and a latching one does
    // not. Getting here took two mutations that left the earlier version green — assuming the
    // two arrows are equal, and skipping the busy reset — because every default branch above
    // is a single `*`, and a draw is never busy.
    const misses = [99, 99, 99, 99, 99, 99];
    expect(run(BUSY_PLAIN, 4, misses).map((s) => s.drawsAfter)).toEqual([1, 2, 3, 4]);
    expect(run(BUSY_DOUBLE, 4, misses).map((s) => s.drawsAfter)).toEqual([1, 1, 1, 1]);
  });

  it("and the default's first command is drawn either way, because the difference is not about pictures", () => {
    // Asserted so the test above cannot be satisfied by a branch that simply stops running:
    // both forms draw, they differ in whether they *ask*.
    const misses = [99, 99, 99, 99];
    for (const src of [BUSY_PLAIN, BUSY_DOUBLE]) {
      const steps = run(src, 4, misses);
      expect(steps[0]?.drawn.length ?? 0, "the default never ran").toBeGreaterThan(0);
    }
  });

  it("so the parse's two arrows are not interchangeable after all", () => {
    // Stated separately because the test above only proves *some* difference exists; this
    // names where it lives, so a parser that dropped the distinction would fail here.
    const plain = (parseCode(lex(BUSY_PLAIN))[0] as { case?: { otherwiseLatching: boolean } }).case;
    const doub = (parseCode(lex(BUSY_DOUBLE))[0] as { case?: { otherwiseLatching: boolean } }).case;
    expect(plain?.otherwiseLatching).toBe(false);
    expect(doub?.otherwiseLatching).toBe(true);
  });

  it("and returning to a branch that was abandoned starts it cleanly", () => {
    // Hit, miss, hit. Choosing the otherwise branch resets the then branch's busy flags, so
    // when the condition matches again the animation starts from its first command rather
    // than resuming part-way through. Without the reset the stale flag is still set, the
    // case is treated as busy, and the animation never begins — which is the same class of
    // fault as the explosion that never finished.
    const hitMissHit = [0, 99, 0, 0, 0];
    const steps = run(RELATCHING, 3, hitMissHit);
    // Step 1 the animation starts and draws its one visible command; step 2 the condition
    // misses and the default draws instead; step 3 it matches again.
    expect(steps[0]?.drawn.length ?? 0).toBeGreaterThan(0);
    expect(steps[1]?.drawn.length ?? 0).toBeGreaterThan(0);
    // The condition is evaluated on all three steps, so the third really is a fresh match.
    expect(steps[2]?.drawsAfter).toBe(3);
    expect(steps[2]?.drawn.length ?? 0).toBeGreaterThan(0);
  });

  it("and the same in the other direction, leaving the default and coming back", () => {
    // The mirror of the above, and it exists because the first version of this file only
    // tested the one direction: skipping the reset on the *otherwise* branch left every
    // assertion green. `runCondition` has two such lines and they are separate facts.
    //
    // Miss, hit, miss: step 1 runs the default's comma sequence, step 2 matches and runs the
    // chance branch's, step 3 misses again and must restart the default rather than resume
    // it three-quarters of the way through — which would draw nothing at all.
    const missHitMiss = [99, 0, 99, 0];
    const steps = run(RELATCHING, 3, missHitMiss);
    expect(steps[0]?.drawn.length ?? 0).toBeGreaterThan(0);
    expect(steps[1]?.drawn.length ?? 0).toBeGreaterThan(0);
    expect(steps[2]?.drawn.length ?? 0, "the default resumed instead of restarting").toBeGreaterThan(
      0,
    );
    // And all three steps evaluated the condition, so none of them was a latch.
    expect(steps.map((s) => s.drawsAfter)).toEqual([1, 2, 3]);
  });
});

describe("the arrow before A* makes no difference", () => {
  // The manual's parenthetical, and the claim most likely to be got wrong: it is tempting to
  // read `-> A*` as "the default does not latch" and to make that mean something. It cannot,
  // because a draw is never busy.
  const WITH_PLAIN = `switch {
  1:100 -> {*, C*, D*, E*};
  -> A*;
}`;
  const WITH_DOUBLE = `switch {
  1:100 -> {*, C*, D*, E*};
  => A*;
}`;

  it("draws the same pictures either way when the case misses", () => {
    const plain = run(WITH_PLAIN, 3, MISSES);
    const doub = run(WITH_DOUBLE, 3, MISSES);
    expect(plain.map((s) => s.drawn)).toEqual(doub.map((s) => s.drawn));
    expect(plain.map((s) => s.drawsAfter)).toEqual(doub.map((s) => s.drawsAfter));
  });

  it("and records the arrow as written, so the parse is not silently normalised", () => {
    // The two forms must still differ *in the tree* even though they behave alike. If a
    // parser dropped the distinction this would pass; if it invented one, the behaviour test
    // above would fail.
    const plain = (
      parseCode(lex(WITH_PLAIN))[0] as { case?: { otherwiseLatching: boolean } }
    ).case;
    const doub = (
      parseCode(lex(WITH_DOUBLE))[0] as { case?: { otherwiseLatching: boolean } }
    ).case;
    expect(plain?.otherwiseLatching).toBe(false);
    expect(doub?.otherwiseLatching).toBe(true);
  });
});
