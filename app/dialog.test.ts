// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for the dialog's keyboard policy.
 *
 * These exist because a focus trap cannot be seen in a screenshot, and the dialog is
 * unusable without one for a keyboard user — so it is the part most worth testing and
 * the part a phone screenshot will never show.
 *
 * The tests are written against the *policy*, not the DOM. What is being checked is the
 * decision — where does focus go, what does Tab do at the end, what closes the dialog —
 * because those are what are wrong when wrong. The component applies the policy; if it
 * stops applying it, that is a different failure and these tests would not catch it,
 * which is stated here rather than left implied.
 */

import { describe, expect, it } from "vitest";
import {
  dialogLabel,
  focusOnOpen,
  isCloseKey,
  isDialogKey,
  nextFocus,
} from "./dialog.ts";

/** The smallest thing that behaves like an element for this module's purposes. */
function el(name: string): HTMLElement {
  return {
    name,
    hasAttribute: () => false,
    getAttribute: () => null,
  } as unknown as HTMLElement;
}

describe("nextFocus", () => {
  const [a, b, c] = [el("a"), el("b"), el("c")];

  it("moves through the elements in order", () => {
    expect(nextFocus([a, b, c], a, false)).toBe(b);
    expect(nextFocus([a, b, c], b, false)).toBe(c);
  });

  it("wraps from the last to the first", () => {
    // The wrap is the trap. Without it, Tab from the last element leaves the dialog,
    // which is the failure a keyboard user hits first and a screenshot never shows.
    expect(nextFocus([a, b, c], c, false)).toBe(a);
  });

  it("wraps backwards from the first to the last", () => {
    expect(nextFocus([a, b, c], a, true)).toBe(c);
    expect(nextFocus([a, b, c], b, true)).toBe(a);
  });

  it("stays put with one element, which is still a trap", () => {
    expect(nextFocus([a], a, false)).toBe(a);
    expect(nextFocus([a], a, true)).toBe(a);
  });

  it("goes nowhere with no tabbable elements", () => {
    // A dialog with nothing to focus is a dialog a keyboard user is stuck in, so the
    // answer is null and the component can fall back to the dialog itself.
    expect(nextFocus([], a, false)).toBeNull();
    expect(nextFocus([], a, true)).toBeNull();
  });

  it("starts at the near end when focus is outside, in the direction of travel", () => {
    // Focus escapes when the user clicks the backdrop, or the dialog opens
    // programmatically. Coming back in at the far end would mean Tab appears to do
    // nothing, so the first Tab after that lands where the user expects.
    expect(nextFocus([a, b, c], null, false)).toBe(a);
    expect(nextFocus([a, b, c], null, true)).toBe(c);
    // An element that is not in the list is the same situation, and must not be used as
    // an index.
    const outside = el("outside");
    expect(nextFocus([a, b, c], outside, false)).toBe(a);
    expect(nextFocus([a, b, c], outside, true)).toBe(c);
  });

  it("compares by identity, so two identical buttons are not the same button", () => {
    // Levels with several same-shaped controls are the case where selector-based
    // comparison picks the wrong one.
    const first = el("Play again");
    const second = el("Play again");
    expect(nextFocus([first, second], first, false)).toBe(second);
    expect(nextFocus([first, second], second, false)).toBe(first);
  });
});

describe("focusOnOpen", () => {
  it("puts focus on the first tabbable element", () => {
    const a = el("a");
    const dialog = el("dialog");
    expect(focusOnOpen([a, el("b")], dialog)).toBe(a);
  });

  it("falls back to the dialog itself when there is nothing to tab to", () => {
    // Better than focus staying on the trigger behind the dialog, which is where the
    // keyboard is when the dialog opens.
    const dialog = el("dialog");
    expect(focusOnOpen([], dialog)).toBe(dialog);
  });
});

describe("keys", () => {
  it("closes on Escape", () => {
    expect(isCloseKey("Escape")).toBe(true);
    expect(isCloseKey("Esc")).toBe(false);
  });

  it("claims Tab and Escape, and nothing else", () => {
    // Claiming every key would stop the dialog working at all; claiming too few would
    // let Escape scroll the page behind it.
    expect(isDialogKey("Tab")).toBe(true);
    expect(isDialogKey("Escape")).toBe(true);
    expect(isDialogKey("a")).toBe(false);
    expect(isDialogKey("Enter")).toBe(false);
    expect(isDialogKey("ArrowDown")).toBe(false);
  });
});

describe("dialogLabel", () => {
  it("uses the dialog's own title", () => {
    expect(dialogLabel("How to play")).toBe("How to play");
  });

  it("falls back rather than leaving the dialog unnamed", () => {
    // An element with no accessible name is announced as nothing at all, which is worse
    // than a generic name.
    expect(dialogLabel(null)).toBe("Dialog");
    expect(dialogLabel("")).toBe("Dialog");
    expect(dialogLabel("   ")).toBe("Dialog");
  });
});
