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
const CSS = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

/** The source with comments stripped, so an explanatory comment cannot satisfy an assertion. */
function code(): string {
  return APP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
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
    expect(CSS).toContain(".levelCard__tile");
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
  it("is given a fixed height, so no card is taller than its text", () => {
    // Height rather than width, because the crops vary: 3 rows to 14 across the corpus.
    // A fixed *width* made the tall ones 134 pixels tall — taller than the name and author
    // they sat beside — which is what a screenshot showed. Fixed height bounds it at
    // 2.4rem, and the width follows the viewBox's aspect ratio: 27 to 128 pixels.
    const rule = CSS.slice(CSS.indexOf(".levelCard__tile .tile"));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/height:\s*2\.4rem/);
    // `auto` is what lets the width come from the aspect ratio; a percentage here would
    // re-introduce the per-card size the fixed height exists to remove.
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/width:\s*auto/);
    // Guard, not design: if `auto` ever failed to resolve against the intrinsic ratio, the
    // replaced-element default is far wider than the card.
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/max-width:\s*100%/);
  });

  it("sits on the right of the card's text, at every width", () => {
    // A screenshot showed the tile above the level's name, which is a row the card cannot
    // do without: the name and author are about 45 pixels tall, so a 38-pixel tile beside
    // them adds no height at all. There was a breakpoint that moved it above the text on a
    // narrow screen, and it is gone — a tile that changes sides with the viewport is a tile
    // whose position has to be checked twice.
    expect(CSS).not.toMatch(/@media[^{]*\{[^}]*levelCard__tile/);
    expect(CSS).toMatch(/\.levelCard\b[^{]*\{[^}]*grid-template-areas:/);
    expect(CSS).toMatch(/"body\s+tile"/);
    expect(CSS).toMatch(/"act\s+act"/);
    expect(CSS).toMatch(/\.levelCard__tile\b[^{]*\{[^}]*justify-self:\s*end/);
  });

  it("is placed by grid area, not by source order", () => {
    // The tile comes *after* the body in the JSX, because the body is what a screen reader
    // reads first and the tile is aria-hidden. So the placement has to come from the
    // stylesheet, and these two rules are the only thing tying the element to its area.
    expect(CSS).toMatch(/\.levelCard__body\b[^{]*\{[^}]*grid-area:\s*body/);
    expect(CSS).toMatch(/\.levelCard__tile\b[^{]*\{[^}]*grid-area:\s*tile/);
    expect(CSS).toMatch(/\.levelCard__actions\b[^{]*\{[^}]*grid-area:\s*act/);
  });

  it("does not draw a marker, because at this size it cannot be seen", () => {
    // The real board marks a goal with a dot at 0.075 of a cell. A tile's cell is about
    // four pixels, so that is 0.3 pixels. A `circle` in the tile CSS would be a shape the
    // tile claims to distinguish and cannot render.
    expect(CSS).not.toMatch(/levelCard__tile[^{]*\{[^}]*circle/i);
    expect(CSS).not.toMatch(/\.tile\s+circle/);
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