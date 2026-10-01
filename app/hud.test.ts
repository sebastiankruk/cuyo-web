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

describe("the rules panel is on screen", () => {
  // The reported bug: opening "How to play" pushed the panel off the left edge, so
  // every bullet lost its first few characters. It was `position: absolute; right: 0`
  // inside a button that sits ~290px from the left of a phone screen, with a width of
  // up to 20rem - so the panel began at about -30px, and `.play { overflow: hidden }`
  // cropped it there rather than letting it escape.
  it("is positioned against the viewport, not against the button", () => {
    expect(declaration(".play__rulesBody", "position")).toBe("fixed");
  });

  it("is inset from both edges and centred, so it cannot overflow either", () => {
    // `right: 0` alone is what put it off screen. Both insets plus auto margins and a
    // max width is a combination that cannot produce a negative left edge at any
    // viewport width, which is the property rather than any one declaration.
    expect(declaration(".play__rulesBody", "left")).not.toBeNull();
    expect(declaration(".play__rulesBody", "right")).not.toBeNull();
    expect(declaration(".play__rulesBody", "margin-inline")).toBe("auto");
    expect(declaration(".play__rulesBody", "max-width")).not.toBeNull();
  });

  it("cannot be taller than the screen, and scrolls instead", () => {
    // The rules are longer than the gap under the HUD on a landscape phone, and a panel
    // that runs off the bottom cannot be read at all.
    expect(declaration(".play__rulesBody", "max-height")).toContain("dvh");
    expect(declaration(".play__rulesBody", "overflow-y")).toBe("auto");
  });

  it("clears the safe area, so it is not under a notch", () => {
    expect(declaration(".play__rulesBody", "top")).toContain(
      "env(safe-area-inset-top",
    );
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
    // room the name got depended on how wide the rules button and the stats happened to
    // be. One auto margin puts the slack next to the stats, where it belongs.
    expect(declaration(".play__rules", "margin-left")).toBeNull();
    expect(declaration(".play__stats", "margin-left")).toBe("auto");
  });
});
