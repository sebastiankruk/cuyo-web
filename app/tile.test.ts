/**
 * The level tile, as far as it can be checked without a browser.
 *
 * The tile's geometry is `render/tile.test.ts` and its agreement with the level files is
 * `engine/level-format/tile-corpus.test.ts`. What is here is the third thing, and the one
 * that has bitten this project before: **the wiring.** Every explosion test once called
 * `finishExplosions()` by hand, so the fact that the step machine never called it went
 * unnoticed and the game froze on the first detonation. A tile can be rendered perfectly
 * by `tileSvg`, built correctly for all 79 levels, and never appear on a card at all.
 *
 * So this reads `app/App.tsx` and `app/styles.css` and asserts the card uses them. It is
 * string matching, in the way `hud.test.ts` and `difficulties.test.ts` are and for the same
 * reason: there is no DOM environment here and adding one is task 13.8. Comments are
 * stripped first, so an explanatory comment cannot satisfy an assertion — which matters
 * here more than usual, because this feature's code is mostly explanation.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP = readFileSync(resolve(import.meta.dirname, "App.tsx"), "utf8");
const CSS_RAW = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

/** The source with comments stripped, so an explanatory comment cannot satisfy an assertion. */
function code(): string {
  return APP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * The stylesheet with its comments stripped, for the same reason.
 *
 * Not decoration: `.levelCard__tile`'s comment quotes the `margin` shorthand it replaced,
 * so a test reading the raw file would match the *rejected* value and pass on the wrong
 * code. Stripping comments is what makes an assertion about this file mean what it says.
 */
function css(): string {
  return CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the card draws a tile", () => {
  it("renders the tile through tileSvg", () => {
    const source = code();
    expect(source).toContain('import { tileSvg } from "../render/tile.ts"');
    expect(source).toContain("tileSvg(");
  });

  it("shows the tile for the difficulty that is chosen, not always for normal", () => {
    // The card's difficulty control is right there, so a tile that always showed `normal`
    // would quietly contradict it — and the tile is the thing a player scans the catalogue
    // by. This is the assertion that says the tile follows the choice.
    const source = code();
    expect(source).toMatch(/shown\.tile/);
    // `shown` is the resolved entry for `chosen`, falling back to `normal` — asserted so
    // that "follows the choice" cannot quietly become "always normal" via the fallback
    // path alone.
    expect(source).toMatch(/entry\.difficulties\.get\(chosen\)\s*\?\?\s*entry\.difficulties\.get\("normal"\)/);
  });

  it("looks the palette up by the tile's index, and not by guessing", () => {
    // `tile.palette` is an *index* into the index's shared palette table. Indexing the
    // number as if it were the palette gives `undefined`, and `tileSvg` draws every blob in
    // the background — so the tile would be a flat rectangle of the level's colour and
    // every other test would still pass.
    const source = code();
    expect(source).toMatch(/palettes\[\s*shown\.tile\.palette\s*\]/);
    expect(source).not.toMatch(/shown\.tile\.palette\[/);
  });

  it("puts the tile in the element the stylesheet targets", () => {
    // Found by mutation: renaming the card's class from `levelCard__tile` to anything else
    // left all nine of these tests green, because the CSS assertions read the stylesheet
    // and the JSX assertions read the script, and nothing said the two must meet. The tile
    // would then have rendered unstyled — an SVG at its intrinsic size in a grid cell, with
    // no width, no border, on every card.
    const source = code();
    expect(source).toContain('className="levelCard__tile"');
    // And the other direction: the class must exist in the stylesheet, so a rename cannot
    // leave the CSS orphaned either. `tile` is the class `tileSvg` puts on the SVG itself.
    expect(css()).toContain(".levelCard__tile");
    expect(source).toContain("tileSvg(");
  });

  it("memoises the SVG on the chosen entry, so the tile cannot go stale", () => {
    // Two failure modes, and the second is much worse than the cost it saves. Without the
    // memo, choosing a difficulty rebuilds 79 SVG strings to produce markup React then
    // diffs as unchanged. With `useMemo(..., [])` the cost is gone and so is correctness:
    // the tile would be frozen at whatever the card first rendered, so choosing `hard`
    // would leave a `normal` board on the card — the exact contradiction of the previous
    // assertion, reached by making the tile cheaper.
    const source = code();
    expect(source).toMatch(/useMemo\(/);
    const deps = source.match(/useMemo\([\s\S]*?,\s*\[([^\]]*)\]/);
    expect(deps, "the tile's useMemo and its dependency list").not.toBeNull();
    expect((deps?.[1] ?? "").trim(), "the memo's dependencies").toBe("shown");
    expect(source).not.toMatch(/useMemo\([\s\S]*?,\s*\[\s*\]/);
  });

  it("omits the tile rather than drawing an empty one when there is no difficulty entry", () => {
    // A level that offers a difficulty resolving to nothing has no board to show. An empty
    // tile would be a coloured rectangle claiming to be a level's start.
    const source = code();
    expect(source).toMatch(/\{shown !== undefined && \(/);
  });
});

describe("the tile is styled as a tile", () => {
  /**
   * Every declaration made for a selector, across all of its rules.
   *
   * All rules, because `styles.css` declares `.levelCard` three times — a duplication that
   * predates the tile and that a single-rule lookup hid. Reading only the first meant
   * asserting on a rule that a later one overrides, which is how this file's own height
   * assertion came to pass against the wrong declaration while the tile was still `grid`.
   *
   * Grouped selectors too (`.levelCard__head,\n.levelCard__rest { … }`), because a
   * `${selector} {` lookup returns nothing for those and a rule that cannot be read is a
   * rule whose properties go unasserted — which is exactly how `pointer-events: none` was
   * about to stop being checked.
   */
  function rule(selector: string): string {
    const out: string[] = [];
    const source = css();
    const re = /([^{}]+)\{([^{}]*)\}/g;
    for (let m = re.exec(source); m !== null; m = re.exec(source)) {
      const selectors = (m[1] ?? "").split(",").map((s) => s.trim());
      if (selectors.includes(selector)) out.push(m[2] ?? "");
    }
    return out.join("; ");
  }

  it("is given a fixed height, so no card is taller than its name", () => {
    // Height rather than width, because the crops vary: 3 rows to 14 across the corpus.
    // A fixed *width* made the tall ones 134 pixels tall — taller than the name and author
    // they sat beside — which is what a screenshot showed. Fixed height bounds it at
    // 2.4rem, and the width follows the viewBox's aspect ratio: 27 to 128 pixels.
    const tile = rule(".levelCard__tile .tile");
    expect(tile).toMatch(/height:\s*2\.4rem/);
    // `auto` is what lets the width come from the aspect ratio; a percentage here would
    // re-introduce the per-card size the fixed height exists to remove.
    expect(tile).toMatch(/width:\s*auto/);
    // In `rem`, not a percentage: a percentage `max-width` inside an `auto` grid column
    // resolves against a size derived from that column's own content, which is circular and
    // which browsers resolve inconsistently.
    expect(tile).toMatch(/max-width:\s*9rem/);
    expect(tile).not.toMatch(/max-width:\s*\d+%/);
  });

  it("sits beside the name only, with the description spanning the card", () => {
    // The three attempts, and why this one. A `1fr auto` column reserved the tile's width
    // for the card's whole height, squeezing the description beside space it was nowhere
    // near. A `float` was supposed to say "beside for a while, then full width" but a
    // float does not intrude into a box establishing an independent formatting context —
    // and the text group is `display: grid` — so what it did was not something this
    // project could verify without a browser, and two screenshots disagreed.
    //
    // So the areas say it outright: `rest` appears twice on its row, which is what "the
    // full width of the card" means in CSS grid.
    const card = rule(".levelCard");
    expect(card).toMatch(/grid-template-areas:/);
    const areas = card.slice(card.indexOf("grid-template-areas:"));
    expect(areas).toMatch(/"head\s+tile"/);
    expect(areas).toMatch(/"rest\s+rest"/);
    expect(areas).toMatch(/"act\s+act"/);
    // And the three children are placed by those names, so the CSS and the JSX cannot
    // disagree about which box is which.
    expect(rule(".levelCard__head")).toMatch(/grid-area:\s*head/);
    expect(rule(".levelCard__tile")).toMatch(/grid-area:\s*tile/);
    expect(rule(".levelCard__rest")).toMatch(/grid-area:\s*rest/);
    expect(rule(".levelCard__actions")).toMatch(/grid-area:\s*act/);
  });

  it("has exactly one claimant per area, and an area per claimant", () => {
    // The property that makes the layout say what it means rather than approximately say
    // it. A name in `grid-template-areas` that nothing claims is a hole no content can
    // reach; a `grid-area` naming something not in the template is a typo that places
    // nothing, and neither is visible in a screenshot — the card just looks wrong.
    //
    // Cross-referenced rather than asserted twice, so the two lists cannot drift.
    const card = rule(".levelCard");
    const template = card.slice(card.indexOf("grid-template-areas:"));
    // Every cell of every row, not just the first: `tile` only ever appears as the second
    // column of the first row, so reading one column found three areas and called it four.
    const rows = [...template.matchAll(/"([^"]+)"/g)].map((m) =>
      (m[1] as string).trim().split(/\s+/),
    );
    const declared = new Set(rows.flat());
    expect(rows, "rows in the template").toHaveLength(3);
    const claimed = new Set(
      [".levelCard__head", ".levelCard__tile", ".levelCard__rest", ".levelCard__actions"]
        .map((selector) => /grid-area:\s*(\w+)/.exec(rule(selector))?.[1])
        .filter((name): name is string => name !== undefined),
    );
    expect([...claimed].sort(), "areas claimed by a rule").toEqual([...declared].sort());
    // And the JSX has an element for each, or an area is claimed for nothing.
    for (const selector of [
      ".levelCard__head",
      ".levelCard__tile",
      ".levelCard__rest",
      ".levelCard__actions",
    ]) {
      expect(APP, `no element for ${selector}`).toContain(selector.slice(1));
    }
  });

  it("uses no float, so nothing depends on how a float meets a grid", () => {
    // Asserted as an absence because a float is the natural thing to reach for when a
    // picture should sit in a corner of a paragraph, and it is what was tried and measured
    // to be unreliable here.
    expect(css()).not.toMatch(/float:\s*(right|left)/);
    expect(rule(".levelCard")).toMatch(/display:\s*grid/);
    expect(rule(".levelCard__actions")).not.toMatch(/clear:/);
  });

  it("keeps both text groups above the card's stretched hit target", () => {
    // `pointer-events: none` so a tap on the text reaches the button underneath, and
    // `z-index` so the text is visible above it. Both came from `.levelCard__body`, which
    // no longer exists — so a rename that dropped them would leave the card clickable only
    // on its Play button, which no test of the tile would notice.
    for (const group of [".levelCard__head", ".levelCard__rest"]) {
      const decls = rule(group);
      expect(decls, group).toMatch(/pointer-events:\s*none/);
      expect(decls, group).toMatch(/position:\s*relative/);
      expect(decls, group).toMatch(/z-index:\s*1/);
    }
    expect(APP).not.toContain("levelCard__body");
  });

  it("puts the tile before the text in the source, so order and reading agree", () => {
    const at = (c: string) => code().indexOf(`className="${c}"`);
    expect(at("levelCard__tile")).toBeGreaterThan(-1);
    expect(at("levelCard__head")).toBeGreaterThan(-1);
    expect(at("levelCard__tile")).toBeLessThan(at("levelCard__head"));
  });

  it("does not draw a marker, because at this size it cannot be seen", () => {
    // The real board marks a goal with a dot at 0.075 of a cell. A tile's cell is about
    // four pixels, so that is 0.3 pixels. A `circle` in the tile CSS would be a shape the
    // tile claims to distinguish and cannot render.
    expect(css()).not.toMatch(/levelCard__tile[^{]*\{[^}]*circle/i);
    expect(css()).not.toMatch(/\.tile\s+circle/);
  });
});

describe("the tile is decorative to a screen reader", () => {
  it("and the card says so in text, so the fact is not only in tile.ts", () => {
    // `aria-hidden` is set on the SVG. Asserted here because the *reason* is a product
    // decision — a tile is a way of recognising a level you have played, and describing
    // twenty coloured squares would be noise — and a decision with no statement anywhere
    // tends to be undone by someone tidying.
    expect(APP).toMatch(/aria-hidden/);
    expect(APP.length).toBeGreaterThan(0);
    // The card does not label the tile with the level name, which would make a screen
    // reader announce "Noseballs, image" before the name it already reads.
    expect(code()).not.toMatch(/levelCard__tile[^>]*aria-label/);
  });
});