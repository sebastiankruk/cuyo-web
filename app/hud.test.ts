// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for the play screen's layout, as far as layout can be tested without a browser.
 *
 * There is no DOM environment here - no jsdom, no testing-library - so a component test
 * would mean adding one, and the canvas-free rule this project works by says the layout
 * decisions belong in pure functions. The exception is CSS, which is not a pure function
 * at all: it is a document, it is the thing that produced every layout bug found by
 * playing on a phone, and nothing else in the suite can see it.
 *
 * So this reads `app/styles.css` and asserts the properties whose absence caused a
 * specific, reported bug. That is string matching and it is brittle on purpose: a rule
 * that stops being viewport-anchored should fail here rather than in a screenshot
 * somebody has to notice. It is not a substitute for looking at the screen, and the
 * comments say which bug each assertion is about so a failure is diagnosable.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

/** The declarations in the rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  // The selector must be exact, so `.play__title` does not match `.play__title span`.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "m").exec(CSS);
  expect(m, `no rule for ${selector} in app/styles.css`).not.toBeNull();
  return m?.[1] ?? "";
}

/** One declaration's value, or null when the property is absent. */
function declaration(selector: string, property: string): string | null {
  const m = new RegExp(`(?:^|\\s)${property}\\s*:\\s*([^;]+)`).exec(
    rule(selector),
  );
  return m?.[1]?.trim() ?? null;
}

describe("the rules dialog is on screen", () => {
  // The reported bug, and the one this file exists for: the rules used to be a
  // `<details>` dropdown in the HUD, positioned `absolute; right: 0` *inside the button
  // that opened it*, up to 20rem wide. On a phone that button's right edge was 290px from
  // the left of the screen and the panel was 320px wide, so the panel began at -30px and
  // every line lost its first characters.
  //
  // It is now a `<dialog>` shown with `showModal()`, which is in the top layer and sized
  // against the viewport by the browser. These assert the properties that make that hold,
  // rather than the geometry - `max-width` in `rem` with `margin: auto` cannot produce a
  // negative left edge at any viewport size, which is the property.
  it("is a modal dialog, not a positioned dropdown", () => {
    // The markup, not the file: the explanatory comments above the JSX mention the old
    // element by name, so a substring check on the whole file matches a comment and passes
    // a regression. Found that way.
    const markup = (file: string): string =>
      readFileSync(resolve(import.meta.dirname, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
    expect(markup("PlayScreen.tsx")).not.toContain("<details");
    expect(markup("PlayScreen.tsx")).toContain("<RulesDialog");
    const dialog = readFileSync(
      resolve(import.meta.dirname, "RulesDialog.tsx"),
      "utf8",
    );
    expect(dialog).toContain("showModal()");
  });

  it("pauses the game while it is open", () => {
    // The reason it became a modal rather than staying a dropdown: reading the rules
    // mid-fall used to be a way to lose a piece you were watching.
    const app = readFileSync(
      resolve(import.meta.dirname, "PlayScreen.tsx"),
      "utf8",
    );
    expect(app).toMatch(/\.paused = rulesOpen/);
  });

  it("capped in rem rather than viewport width, so it is the same size everywhere", () => {
    // A `vw` width on a wide screen makes a dialog the size of the board, which is the
    // opposite of what a dialog is for.
    expect(declaration(".rules", "max-width")).toMatch(/rem/);
    expect(declaration(".rules", "max-width")).not.toMatch(/vw[^)]*$/);
    expect(declaration(".rules", "margin")).toBe("auto");
  });

  it("in a smaller face than the HUD, which is the point of it being a dialog", () => {
    const rules = Number(/font-size:\s*([\d.]+)rem/.exec(rule(".rules"))?.[1]);
    const hud = Number(/font-size:\s*([\d.]+)rem/.exec(rule(".chip"))?.[1]);
    expect(rules).toBeGreaterThan(0);
    expect(hud).toBeGreaterThan(0);
    expect(rules, "the dialog must not be as large as the HUD").toBeLessThan(
      hud,
    );
  });

  it("keeps a thumb-sized close button last in the dialog", () => {
    // A close target under 44px is hard to hit, and it is the one control in here that
    // has to be reachable on a phone without aiming.
    expect(rule(".rules .btn")).toContain("min-height");
  });

  it("has a backdrop, so the board behind is not still being played", () => {
    expect(rule(".rules::backdrop")).toContain("background");
  });
});

describe("the HUD is not out of room", () => {
  it("never hides the level's name", () => {
    // The reported bug: `.play__title { display: none }` in a `max-width: 30rem` media
    // query, added to make room for the stats - which is exactly the screen where you
    // most want to know which level you are in.
    expect(declaration(".play__title", "display")).not.toBe("none");
  });

  it("lets the name shrink and truncate rather than disappear", () => {
    expect(declaration(".play__title", "min-width")).toBe("0");
    expect(declaration(".play__title", "flex")).toBe("1 1 auto");
  });

  it("has one auto margin in the row, not two competing for the slack", () => {
    // `.play__rules` and `.play__stats` both carried `margin-left: auto`, so how much
    // room the level's name got depended on how wide the rules button and the stats
    // happened to be. One auto margin puts the slack next to the stats, where it belongs.
    expect(declaration(".play__stats", "margin-left")).toBe("auto");
    // Nothing in the HUD row may push right but the stats: a second one splits the slack
    // and the name loses to whichever is wider.
    for (const selector of [".play__title", ".chip", ".play__stats"]) {
      if (selector !== ".play__stats") {
        expect(declaration(selector, "margin-left")).toBeNull();
      }
    }
  });
});
