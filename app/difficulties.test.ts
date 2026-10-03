/**
 * The catalogue's difficulty control, as far as it can be checked without a browser.
 *
 * Task 6.3's second half. The described difficulties are engine data and
 * `engine/level-format/difficulties.test.ts` covers them; what is here is that the **catalogue
 * reads that data** rather than printing the raw version token.
 *
 * Before 6.3 the button said `easy` and the play suffix said `hard` — the identifiers from the
 * version string, in a slot where a player sees them. That is not a rendering bug and no
 * screenshot would have caught it, because `easy` and `Easy` look the same in a picture.
 *
 * So this reads `app/App.tsx` and asserts the wiring. It is string matching, in the way
 * `hud.test.ts` is and for the same reason: there is no DOM environment here, and adding one is
 * task 13.8. What it *can* catch is the regression that matters — the control going back to the
 * identifier — and it catches that without a browser.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DESCRIBED_DIFFICULTIES, DIFFICULTIES } from "../engine/level-format/index-data.ts";

const APP = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
const CSS = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

/** The source with comments stripped, so an explanatory comment cannot satisfy an assertion. */
function code(): string {
  return APP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("the difficulty control reads the described names", () => {
  it("labels its buttons with describeDifficulty, not with the identifier", () => {
    const source = code();
    expect(source).toContain("describeDifficulty(difficulty).name");
    // And the identifier survives in exactly one place: `key={difficulty}`, which React needs
    // and no player ever sees. Before 6.3 the *label* was `{difficulty}` too, which is the
    // regression this exists to catch — so the count is one, and that one is the key.
    const uses = source.match(/\{difficulty\}/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(source).toContain("key={difficulty}");
  });

  it("names the chosen difficulty in the play affordance too", () => {
    // The suffix sits under the finger that is about to press, so it is the last place a player
    // reads — and "hard" there was the identifier.
    const source = code();
    expect(source).toContain("describeDifficulty(chosen).name");
    expect(source).not.toMatch(/levelCard__playSuffix[^]*?\bs*\{\s*chosen\s*\}/);
  });

  it("shows the chosen difficulty's sentence in the card", () => {
    const source = code();
    expect(source).toContain("described.description");
    expect(source).toContain("levelCard__difficultyNote");
    // In the body rather than a `title`: a tooltip is not reachable by touch, and this project's
    // first platform is a phone.
    expect(source).not.toMatch(/title=\{[^}]*describ/i);
  });

  it("still offers only what the level has", () => {
    // The descriptions must not make every level look adjustable. 13 of the 79 levels have no
    // difficulty variant, and a control with one button on it is worse than none.
    const source = code();
    expect(source).toContain("offered.length > 1");
    expect(source).toContain("DIFFICULTIES.filter((d) => entry.difficulties.has(d))");
  });
});

describe("the difficulty sentence is styled as prose, not as a tag", () => {
  it("is not one of the pill rules, because a pill would clip it", () => {
    // The tags row has `border-radius: 999px` and no line-height, which is right for a label and
    // wrong for a sentence: it would be one clipped line. Asserted by absence so the rule cannot
    // be quietly given the pill's properties.
    const m = /(?:^|\n)\.levelCard__difficultyNote\s*\{([^}]*)\}/m.exec(CSS);
    expect(m, "no rule for .levelCard__difficultyNote in app/styles.css").not.toBeNull();
    const body = m?.[1] ?? "";
    expect(body).toMatch(/line-height/);
    expect(body).not.toMatch(/border-radius:\s*999px/);
    expect(body).not.toMatch(/text-overflow|white-space:\s*nowrap/);
  });

  it("is visually an aside rather than a fourth pill", () => {
    const m = /(?:^|\n)\.levelCard__difficultyNote\s*\{([^}]*)\}/m.exec(CSS);
    const body = m?.[1] ?? "";
    expect(body).toMatch(/border-left/);
    expect(body).toMatch(/var\(--muted\)/);
  });
});

describe("the descriptions themselves", () => {
  it("reach the catalogue from one place", () => {
    // One source of truth, so a difficulty's label cannot be one word on the button and another
    // in the sentence. Asserted through the data rather than the markup.
    for (const difficulty of DIFFICULTIES) {
      expect(DESCRIBED_DIFFICULTIES[difficulty].name, difficulty).not.toBe("");
    }
    expect(DIFFICULTIES).toHaveLength(3);
  });
});