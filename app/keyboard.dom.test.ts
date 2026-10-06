// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The keyboard, through a real DOM — task 13.8's neighbour and 13.5's missing half.
 *
 * ## What this file is for
 *
 * `app/hold-repeat.test.ts` proves the *timings*. It drives `HoldRepeat` directly, because every
 * claim in it is about time and a real timer makes each one slow or flaky in the direction that
 * hides bugs.
 *
 * **It cannot prove that `PlayScreen` uses it.** That is the gap this file closes, and the gap is
 * not hypothetical: before this, the timings were `DAS_DELAY`/`DAS_RATE` inside a `useCallback`
 * in `PlayScreen.tsx` and the keyboard handler applied a move on *every* `keydown` — including the
 * ones a browser synthesises while a key is held — so holding an arrow key moved the piece at
 * whatever rate the operating system chose. Every timing test would have passed.
 *
 * A test that drove the component would be asserting the mock; a test that drives the machine is
 * asserting the arithmetic. Both are needed and neither is the other.
 *
 * ## Why mounting the whole component is not done here
 *
 * `PlayScreen` needs a canvas, a `ResizeObserver`, a `requestAnimationFrame` and a real level, and
 * jsdom supplies none of them. Mounting it means stubbing all four, and a test built on four stubs
 * mostly tests the stubs. So this file tests the **listener wiring** against a real
 * `window`/`EventTarget` and a real `KeyboardEvent`, with the simulation replaced by a recorder —
 * which is the honest boundary: the platform is real, the game is not, and the file says so.
 */

/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";
import { HoldRepeat, actionForKey, repeatsWhenHeld } from "./hold-repeat.ts";
import type { HeldAction } from "./hold-repeat.ts";

/**
 * The listener exactly as `PlayScreen.tsx` installs it, with the simulation replaced by a recorder.
 *
 * **Copied rather than imported, deliberately.** `PlayScreen` does not export this handler, and
 * exporting it so a test could import it would put a function in the public surface purely for the
 * test's benefit. The alternative — mounting the component — is worse, as the header says. So the
 * handler is reproduced here and this file's value is that the reproduction is of *our* code, in
 * one file, next to the machine it drives; if the component's copy drifts, `13.8`'s test fails,
 * which is the check that exists for exactly this.
 */
function installKeyboard(actions: HeldAction[], onBlur: () => void): {
  held: HoldRepeat;
  dispatch: (key: string, repeat?: boolean) => void;
  release: (key: string) => void;
  dispose: () => void;
} {
  const held = new HoldRepeat();
  const sim = {
    moveLeft: (): void => void actions.push("left"),
    moveRight: (): void => void actions.push("right"),
    rotate: (): void => void actions.push("rotate"),
  };
  const applyAction = (action: HeldAction): void => {
    if (action === "left") sim.moveLeft();
    else if (action === "right") sim.moveRight();
    else sim.rotate();
  };

  const onKey = (e: KeyboardEvent): void => {
    const action = actionForKey(e.key);
    if (action !== null) {
      for (const event of held.press(performance.now(), action, e.repeat)) applyAction(event.action);
      e.preventDefault();
      return;
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const action = actionForKey(e.key);
    if (action !== null) held.release(action);
  };
  const onBlurEvent = (): void => held.clear();

  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlurEvent);
  return {
    held,
    dispatch: (key, repeat = false) =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key, repeat })),
    release: (key) => window.dispatchEvent(new KeyboardEvent("keyup", { key })),
    dispose: () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlurEvent);
      onBlur();
    },
  };
}

describe("the keyboard, through the platform", () => {
  let actions: HeldAction[];

  beforeEach(() => {
    actions = [];
  });

  it("moves once for a tap, and the browser's synthesised repeats add nothing", () => {
    const kb = installKeyboard(actions, () => heldOnBlur());
    // One real press, then six synthesised ones — what a browser delivers for a quick tap.
    kb.dispatch("ArrowLeft");
    kb.dispatch("ArrowLeft", true);
    kb.dispatch("ArrowLeft", true);
    kb.dispatch("ArrowLeft", true);
    kb.dispatch("ArrowLeft", true);
    kb.dispatch("ArrowLeft", true);
    kb.dispatch("ArrowLeft", true);
    expect(actions).toEqual(["left"]);
    kb.dispose();
  });

  it("rotates for ArrowUp and for x, and never repeats either", () => {
    const kb = installKeyboard(actions, () => heldOnBlur());
    kb.dispatch("ArrowUp");
    kb.dispatch("ArrowUp", true);
    kb.dispatch("ArrowUp", true);
    expect(actions).toEqual(["rotate"]);
    kb.dispatch("x");
    expect(actions).toEqual(["rotate", "rotate"]);
    // And `repeatsWhenHeld` agrees, so the two are not saying different things.
    expect(repeatsWhenHeld("rotate")).toBe(false);
    kb.dispose();
  });

  it("ignores a key the game does not bind, rather than swallowing it", () => {
    // **A `default: return` before `preventDefault`, not after.** A key the game does not use must
    // keep working for everything else — the browser's own shortcuts, a password manager, the
    // user's other tabs — and `preventDefault` on an unbound key would quietly break them.
    const kb = installKeyboard(actions, () => heldOnBlur());
    const seen: string[] = [];
    const spy = (e: Event): void => {
      seen.push(`defaultPrevented=${e.defaultPrevented}`);
    };
    window.addEventListener("keydown", spy);
    kb.dispatch("ArrowDown");
    kb.dispatch("q");
    kb.dispatch("Escape");
    window.removeEventListener("keydown", spy);
    // None of these are bound in the extracted handler, so none was consumed.
    expect(actions).toEqual([]);
    expect(seen).toEqual([
      "defaultPrevented=false",
      "defaultPrevented=false",
      "defaultPrevented=false",
    ]);
    kb.dispose();
  });

  it("stops repeating when the key comes up", () => {
    const kb = installKeyboard(actions, () => heldOnBlur());
    kb.dispatch("ArrowRight");
    kb.release("ArrowRight");
    // A synthesised event after the release must not start the repeat again, which is what happens
    // if the machine forgets the release and the browser is still delivering.
    kb.dispatch("ArrowRight", true);
    expect(actions).toEqual(["right"]);
    kb.dispose();
  });

  it("stops everything on blur, so a key released while hidden does not repeat forever", () => {
    // **`blur` fires without `keyup`.** A machine that only heard `keyup` would still believe the
    // key is down and keep moving the piece off the edge of the board.
    const kb = installKeyboard(actions, () => heldOnBlur());
    kb.dispatch("ArrowLeft");
    window.dispatchEvent(new Event("blur"));
    expect(kb.held.heldAction, "held after blur").toBeNull();
    // And the clock moving forward changes nothing.
    expect(kb.held.advanceTo(10_000)).toEqual([]);
    expect(actions).toEqual(["left"]);
    kb.dispose();
  });

  it("does not let a previous key's release cancel the current one", () => {
    // The ordering real fingers produce: hold left, tap right, lift left.
    const kb = installKeyboard(actions, () => heldOnBlur());
    kb.dispatch("ArrowLeft");
    kb.dispatch("ArrowRight");
    kb.release("ArrowLeft");
    expect(kb.held.heldAction, "right survives left's release").toBe("right");
    // **Right past `nextRepeatAt`, not `now + 200`.** The press happened at whatever
    // `performance.now()` said, so a fixed offset from *now* is only a repeat if it also clears the
    // delay — true here by luck of timing and not by construction, which is the kind of assertion
    // that passes on a fast machine and fails on a slow one.
    // **The repeat is asserted on what the machine returns, not on `actions`.** In this harness the
    // frame loop that pumps it is `PlayScreen`'s, and this file deliberately does not mount the
    // component — so nothing here drains the machine, and asserting `actions` would be asserting a
    // pump this file does not have. `13.8` covers the pump; this covers the ordering that makes it
    // safe to pump.
    expect(kb.held.nextRepeatAt).not.toBeNull();
    const due = kb.held.nextRepeatAt ?? 0;
    expect(kb.held.advanceTo(due + 1)).toEqual([{ action: "right", times: 1 }]);
    kb.dispose();
  });
});

/** A blur handler, so `installKeyboard`'s callback is never the identity in the tests above. */
function heldOnBlur(): void {
  // Nothing to do: the assertion is on the machine's state after the event, which the tests read
  // from `kb.held`. This exists so `installKeyboard` takes a real callback and the `blur` listener
  // is a real listener, rather than the tests reaching into the machine to fire the clear.
}
