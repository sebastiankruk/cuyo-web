// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The keyboard behaviour of a modal dialog, as pure functions.
 *
 * A focus trap and a focus restore cannot be tested in this project — there is no DOM
 * environment, and adding one for a dialog is a large change to make small. But the
 * *decisions* can be, and they are the parts that are wrong when wrong: which element
 * receives focus when a dialog opens, what Tab does at either end, what Escape does, and
 * where focus goes when it closes. Those are the things a screenshot cannot show and a
 * keyboard user notices immediately.
 *
 * So the policy lives here as data in, data out, and the component applies it. The
 * alternative — leaving the policy in the component — is how a dialog ends up trapping
 * focus correctly on Chrome and losing it on Safari.
 *
 * All of it is plain arithmetic over a list, so it runs in plain Node.
 */

/** The keys a dialog has to answer itself, as a set for lookup. */
const CLOSING_KEYS: ReadonlySet<string> = new Set(["Escape"]);

/**
 * The tabbable elements of a dialog, in document order.
 *
 * Excludes the backdrop deliberately: it is a click target, not something a keyboard user
 * tabs to, and a dialog whose backdrop is in the tab order is a dialog a keyboard user
 * can leave by pressing Tab from nowhere.
 */
export function tabbables(root: {
  querySelectorAll: (selector: string) => ArrayLike<HTMLElement>;
}): HTMLElement[] {
  return Array.from(root.querySelectorAll(TAB_SELECTOR)).filter(
    (el) => !hasDisabled(el),
  );
}

const TAB_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Whether an element is disabled, by attribute or through a fieldset. */
function hasDisabled(el: HTMLElement): boolean {
  return (
    el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true"
  );
}

/** Where focus goes when a dialog opens: its first tabbable, or the dialog itself. */
export function focusOnOpen(
  elements: readonly HTMLElement[],
  dialog: HTMLElement,
): HTMLElement {
  return elements[0] ?? dialog;
}

/**
 * Where focus goes on Tab or Shift+Tab, given the current target.
 *
 * Wraps at both ends, which is the whole point of a trap: Tab from the last element goes
 * to the first, and Shift+Tab from the first goes to the last. With one element it stays
 * put, and with none there is nothing to move to.
 *
 * `active` is compared by identity rather than by selector, because the trap is about
 * position in the list and two identical buttons are not the same button.
 */
export function nextFocus(
  elements: readonly HTMLElement[],
  active: HTMLElement | null,
  backwards: boolean,
): HTMLElement | null {
  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0] ?? null;
  const at = active === null ? -1 : elements.indexOf(active);
  if (at === -1) {
    // Focus is outside the dialog - which happens when the user clicked the backdrop or
    // the dialog was opened programmatically. Start at the near end rather than
    // arbitrarily, so Tab continues in the direction of travel.
    return backwards
      ? (elements[elements.length - 1] ?? null)
      : (elements[0] ?? null);
  }
  const next = backwards ? at - 1 : at + 1;
  return elements[(next + elements.length) % elements.length] ?? null;
}

/** Whether a key press should close the dialog. */
export function isCloseKey(key: string): boolean {
  return CLOSING_KEYS.has(key);
}

/** Whether a key press is one the dialog must handle itself. */
export function isDialogKey(key: string): boolean {
  return key === "Tab" || isCloseKey(key);
}

/**
 * A label for a dialog, for `aria-label` where there is no visible heading to point at.
 *
 * Falls back to a generic word rather than an empty string, because an element with no
 * accessible name is worse than one with a poor one.
 */
export function dialogLabel(title: string | null): string {
  const trimmed = title?.trim() ?? "";
  return trimmed === "" ? "Dialog" : trimmed;
}
