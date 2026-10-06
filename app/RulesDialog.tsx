// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The rules dialog.
 *
 * A `<dialog>` element rather than a div with `role="dialog"`, because it brings three
 * things that are easy to get wrong by hand and impossible to notice until a keyboard
 * user hits them: it is dismissed by Escape for free, it makes the rest of the page
 * inert to assistive technology, and `showModal()` moves focus inside.
 *
 * The parts the browser does *not* do — the focus trap, and putting focus back where it
 * was — are applied from `dialog.ts`, because those are decisions rather than mechanics
 * and decisions are what go wrong.
 */

import { useCallback, useEffect, useRef } from "react";
import {
  dialogLabel,
  focusOnOpen,
  isCloseKey,
  nextFocus,
  tabbables,
} from "./dialog.ts";

interface Props {
  readonly targetColour: string | null;
  readonly targetName: string | null;
  readonly targetNeedsChain: boolean;
  readonly lines: readonly string[];
  readonly onClose: () => void;
}

export function RulesDialog({
  targetColour,
  targetName,
  targetNeedsChain,
  lines,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement | null>(null);
  // Where focus was before the dialog opened, so closing puts it back on the button that
  // opened it rather than at the top of the document.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    el.showModal();
    const first = focusOnOpen(tabbables(el), el);
    first.focus();
    return () => {
      el.close();
      // Restore, rather than letting focus fall to the body: a keyboard user who closes a
      // dialog should be back where they were, not at the top of the page.
      opener.current?.focus();
    };
  }, []);

  /**
   * Tab and Escape.
   *
   * `cancel` is Escape, which a `<dialog>` already handles by closing itself; it is
   * cancelled here so that `onClose` runs and React unmounts the element, rather than the
   * browser closing a dialog that is still in the tree.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDialogElement>): void => {
      if (isCloseKey(e.key)) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = e.currentTarget;
      const items = tabbables(el);
      const next = nextFocus(
        items,
        document.activeElement as HTMLElement | null,
        e.shiftKey,
      );
      if (next === null) return;
      // Only preventDefault when focus would actually move inside, so the browser's own
      // handling still works for everything else.
      if (next !== document.activeElement) {
        e.preventDefault();
        next.focus();
      }
    },
    [onClose],
  );

  return (
    <dialog
      ref={ref}
      className="rules"
      aria-label={dialogLabel("How to play")}
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A backdrop click closes, and only a backdrop click: the dialog's own box is a
        // child, so a click that lands on the dialog element itself rather than on a
        // descendant is by definition outside it.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="rules__body">
        <h2 className="rules__title">How to play</h2>
        {/*
          A swatch rather than the kind's name. Upstream calls the goal kind `inGras` or
          `inBunt`, which is artwork naming; a colour is something the player can look
          for on the board.
        */}
        {targetColour !== null && (
          <p className="rules__swatch">
            <span
              className="play__swatch"
              style={{ background: targetColour }}
              aria-hidden="true"
            />
            <span title={targetName ?? undefined}>
              {targetNeedsChain
                ? "These are cleared by an explosion landing next to them."
                : "These are the blobs to clear."}
            </span>
          </p>
        )}
        <ul className="rules__list">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </dialog>
  );
}
