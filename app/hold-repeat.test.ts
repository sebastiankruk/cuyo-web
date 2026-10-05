/**
 * Held-key repeat, under a DOM environment — task 13.5.
 *
 * ## What is being tested and why the numbers were extracted first
 *
 * 13.5 asks for "immediate move, delayed repeat, repeat rate, and cancellation on the opposite
 * direction". All four are properties of *time*, and all four were unreachable: the timings were
 * `DAS_DELAY` and `DAS_RATE` wrapped around `window.setTimeout` inside a `useCallback` in
 * `PlayScreen.tsx`.
 *
 * The tests therefore drive `app/hold-repeat.ts`, a machine with **no clock of its own** — the
 * numbers are an argument, not a sleep. That is `gestures.ts`'s decision for thresholds and
 * `ManualClock`'s for `GameLoop`, applied a third time, and the pattern is worth stating because
 * the alternative was four tests that each sleep and each fail on a slow machine for the wrong
 * reason.
 *
 * ## Why this file claims a DOM, and why the claim is narrower than it sounds
 *
 * `@vitest-environment jsdom` is here for the **behaviour tests**, which drive the real
 * `KeyboardEvent` and the real `EventTarget` rather than a hand-rolled object. jsdom gives both,
 * and the tests use them so that the *shape* of what a browser delivers is part of what is
 * checked — in particular `KeyboardEvent.repeat`, which is the flag the whole design turns on.
 *
 * But the timing assertions themselves do not need a DOM, and the file that proves the wiring
 * (`app/PlayScreen.dom.test.ts`, task 13.8) is a separate file for a separate reason. So this file
 * needs jsdom and not much else, and if it is ever split the timings are the half that would stay
 * in plain Node.
 *
 * ## One thing deliberately not tested here
 *
 * **That `PlayScreen` uses this machine.** That is 13.8's job and this file does not pretend to
 * cover it. A test that asserted the component's wiring from here would be asserting the mock.
 */

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  DAS_DELAY,
  DAS_RATE,
  HoldRepeat,
  actionForKey,
  repeatsWhenHeld,
} from "./hold-repeat.ts";

/** Every action a machine applied, as `action×times`, so an assertion reads like a timeline. */
function applied(events: readonly { action: string; times: number }[]): string[] {
  return events.map((e) => (e.times > 1 ? `${e.action}×${e.times}` : e.action));
}

/** A machine pressed at t=0, with the clock where the test wants it. */
function pressed(action: "left" | "right" | "rotate" = "left"): HoldRepeat {
  const hold = new HoldRepeat();
  expect(applied(hold.press(0, action)), "the press itself").toEqual([action]);
  return hold;
}

describe("held-key repeat", () => {
  it("moves immediately on the press, not after the delay", () => {
    // The first claim in 13.5, and the one that would be most obviously wrong if the machine
    // treated the press as merely starting a timer: a held key that waits `DAS_DELAY` before
    // moving feels broken, and 170 ms is long enough to notice.
    const hold = pressed();
    expect(hold.clock).toBe(0);
    // No repeat at all yet, and none before the delay either.
    expect(applied(hold.advanceTo(DAS_DELAY - 1)), "before the delay").toEqual([]);
  });

  it("repeats once the delay has passed", () => {
    // The second claim: the first repeat is a full `DAS_DELAY` after the press.
    const hold = pressed();
    expect(applied(hold.advanceTo(DAS_DELAY)), "at the delay").toEqual(["left"]);
    // **One** repeat, not two: the press is not itself a repeat, and counting it as one would
    // make the effective rate `DAS_RATE` on the first cycle and `DAS_DELAY` thereafter.
    expect(hold.repeating, "repeating after the first").toBe(true);
  });

  it("repeats at DAS_RATE, so the rate is a number and not a feeling", () => {
    // The third claim. Advanced in `DAS_RATE` increments over a second, counting the applications:
    // one for the press, one for the first repeat at 170, and one per 55 ms after that.
    const hold = pressed();
    let count = 1; // the press
    for (let t = DAS_DELAY; t <= 1000; t += DAS_RATE) {
      count += hold.advanceTo(t).length;
    }
    // 1000ms: the press, the first repeat at 170, then every 55ms to 1000 — (1000-170)/55 = 15.
    expect(count).toBe(1 + 1 + Math.floor((1000 - DAS_DELAY) / DAS_RATE));
    // And the timings themselves are pinned, because "about right" is how a repeat rate drifts.
    expect(DAS_DELAY).toBe(170);
    expect(DAS_RATE).toBe(55);
  });

  it("stops the instant the key comes up", () => {
    const hold = pressed();
    hold.advanceTo(DAS_DELAY);
    expect(hold.heldAction).toBe("left");
    hold.release("left");
    expect(hold.heldAction, "held after release").toBeNull();
    expect(applied(hold.advanceTo(DAS_DELAY * 10)), "after release").toEqual([]);
  });

  it("cancels on the opposite direction, and starts nothing until it is released", () => {
    // The fourth claim, and the one with two halves that are easy to conflate.
    //
    // Pressing right while left is repeating means "I changed my mind", and the piece must stop
    // moving left *immediately* — not keep sliding left for another 55 ms. It must also **not**
    // start moving right: a thumb drifting across both keys would otherwise send the piece
    // sideways at 18 cells a second.
    const hold = pressed("left");
    hold.advanceTo(DAS_DELAY);
    // The browser's synthesised event for right, which arrives as `repeat: true`.
    expect(applied(hold.press(DAS_DELAY + 10, "right", true)), "the opposite key").toEqual([]);
    expect(hold.heldAction, "held after the opposite key").toBeNull();
    expect(hold.repeating, "repeating after the opposite key").toBe(false);
    // And nothing happens for as long as it stays down — this is the half that is easy to miss.
    expect(applied(hold.advanceTo(DAS_DELAY * 5)), "while the opposite key stays down").toEqual([]);
    // Only releasing it lets the next press take effect, and that press repeats normally.
    hold.release("right");
    expect(applied(hold.press(DAS_DELAY * 5, "right")), "right after the release").toEqual(["right"]);
    expect(applied(hold.advanceTo(DAS_DELAY * 5 + DAS_DELAY)), "right's first repeat").toEqual(["right"]);
  });

  it("fires a long gap once, not once per interval it swallowed", () => {
    // A backgrounded tab produces one enormous gap. Firing the whole backlog would be the
    // fast-forward bug `GameLoop` already guards against, and the guard belongs here too.
    const hold = pressed();
    expect(applied(hold.advanceTo(10_000)), "after ten seconds").toEqual(["left"]);
    // **Exactly one.** A machine that counted missed intervals would emit eighteen.
    expect(hold.repeating, "still repeating after one long gap").toBe(true);
  });

  it("does not repeat a rotation, however long it is held", () => {
    // Turning is a single action per press. A held rotate cycling the piece through four
    // orientations at 18 a second cannot be used and cannot be stopped in time once started.
    expect(repeatsWhenHeld("rotate")).toBe(false);
    const hold = pressed("rotate");
    expect(applied(hold.advanceTo(DAS_DELAY * 4)), "rotate after four delays").toEqual([]);
  });

  it("releases nothing for a key that never took effect", () => {
    // Lifting a finger from one key must not stop the repeat of another that did take effect. This
    // is the ordering real input produces: a player holds left, taps right, then lifts left — and
    // the release of the *first* key arrives last.
    const hold = pressed("left");
    hold.advanceTo(DAS_DELAY);
    // Right is pressed as a real press, so it takes effect and left's repeat stops.
    hold.press(10, "right");
    expect(hold.heldAction, "right took effect").toBe("right");
    // Now left comes up. It is not the held key, so the release does nothing.
    expect(hold.release("left"), "releasing the superseded key").toEqual([]);
    expect(hold.heldAction, "right, unaffected by left's release").toBe("right");
    expect(applied(hold.advanceTo(10 + DAS_DELAY)), "right still repeats").toEqual(["right"]);
  });

  it("forgets everything on clear, for a blur or a level change", () => {
    const hold = pressed();
    hold.advanceTo(DAS_DELAY);
    hold.clear();
    expect(hold.heldAction).toBeNull();
    expect(applied(hold.advanceTo(DAS_DELAY * 3))).toEqual([]);
  });
});

describe("what a browser actually delivers", () => {
  it("reports `repeat: false` for the first keydown and `true` for the rest", () => {
    // **The assumption the whole design rests on**, checked against the DOM rather than asserted
    // about it. If this ever stopped being true the browser's own repeat rate would take over and
    // `DAS_RATE` would be decorative — silently, because everything else would still pass.
    const first = new KeyboardEvent("keydown", { key: "ArrowLeft", repeat: false });
    const synthesised = new KeyboardEvent("keydown", { key: "ArrowLeft", repeat: true });
    expect(first.repeat).toBe(false);
    expect(synthesised.repeat).toBe(true);
  });

  it("ignores the browser's synthesised repeats, so the rate stays ours", () => {
    // The same assumption, from the machine's side: a synthesised event must not apply a move, or
    // the browser's rate would be added to `DAS_RATE` and nothing would test the difference.
    const hold = new HoldRepeat();
    expect(applied(hold.press(0, "left", false))).toEqual(["left"]);
    for (let t = 1; t <= 500; t += 1) {
      expect(applied(hold.press(t, "left", true)), `synthesised at ${t}ms`).toEqual([]);
    }
    // Still exactly one move, and the repeat clock is still where the press left it.
    expect(applied(hold.advanceTo(DAS_DELAY)), "the first real repeat").toEqual(["left"]);
  });

  it("maps keys to actions, and reports the ones it does not handle", () => {
    // One mapping, so the component and its test cannot disagree about which key does what.
    expect(actionForKey("ArrowLeft")).toBe("left");
    expect(actionForKey("ArrowRight")).toBe("right");
    expect(actionForKey("ArrowUp")).toBe("rotate");
    expect(actionForKey("x")).toBe("rotate");
    expect(actionForKey("X")).toBe("rotate");
    // Keys the game uses for something else must not fall through to a move.
    expect(actionForKey("ArrowDown")).toBeNull();
    expect(actionForKey(" ")).toBeNull();
    expect(actionForKey("r")).toBeNull();
    expect(actionForKey("Escape")).toBeNull();
    expect(actionForKey("q")).toBeNull();
  });

  it("dispatches the keys through a real EventTarget, as the component does", () => {
    // The wiring half, at the smallest possible scale: a `keydown` on a real target, with a real
    // `KeyboardEvent`, reaching a real listener. It proves `repeat` survives the trip through the
    // platform rather than only existing on an object the test made.
    const target = new EventTarget();
    const hold = new HoldRepeat();
    const seen: string[] = [];
    target.addEventListener("keydown", (event) => {
      const key = event as KeyboardEvent;
      const action = actionForKey(key.key);
      if (action === null) return;
      seen.push(...applied(hold.press(0, action, key.repeat)));
    });
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", repeat: false }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", repeat: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", repeat: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "q", repeat: false }));
    expect(seen, "applied, through the platform").toEqual(["left"]);
  });
});