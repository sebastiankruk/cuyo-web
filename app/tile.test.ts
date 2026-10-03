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
   * All of them, because `styles.css` declares `.levelCard` three times — a duplication
   * that predates the tile and that a single-rule lookup hid. Reading only the first meant
   * asserting on a rule that a later one overrides, which is how this file's own height
   * assertion came to pass against the wrong declaration while the tile was still `grid`.
   */
  function rule(selector: string): string {
    const out: string[] = [];
    const source = css();
    const open = `${selector} {`;
    for (let at = source.indexOf(open); at >= 0; at = source.indexOf(open, at + 1)) {
      const from = at + open.length;
      out.push(source.slice(from, source.indexOf("}", from)));
    }
    return out.join("; ");
  }

  it("is given a fixed height, so no card is taller than its text", () => {
    // Height rather than width, because the crops vary: 3 rows to 14 across the corpus.
    // A fixed *width* made the tall ones 134 pixels tall — taller than the name and author
    // they sat beside — which is what a screenshot showed. Fixed height bounds it at
    // 2.4rem, and the width follows the viewBox's aspect ratio: 27 to 128 pixels.
    const tile = rule(".levelCard__tile .tile");
    expect(tile).toMatch(/height:\s*2\.4rem/);
    // `auto` is what lets the width come from the aspect ratio; a percentage here would
    // re-introduce the per-card size the fixed height exists to remove.
    expect(tile).toMatch(/width:\s*auto/);
    // A guard, and 40% rather than 100%: a float beside text on a narrow card must not be
    // able to take the text's whole width and leave a word per line.
    expect(tile).toMatch(/max-width:\s*40%/);
  });

  it("floats right, so the text beside it is only beside it", () => {
    // The second screenshot showed the two-column grid squeezing every line of text for
    // the card's whole height, so a description wrapped to three lines beside 128 pixels
    // of empty space. Grid says "beside" or "below"; a float says "beside for a while,
    // then full width", which is what a picture in a corner of a paragraph needs.
    //
    // Asserted as the *absence* of the mechanism that caused it, because the natural
    // regression is putting the column back: it looks tidier in the source and it is what
    // was wrong.
    const tile = rule(".levelCard__tile");
    expect(tile).toMatch(/float:\s*right/);
    // The gap goes on the left, where the text is. A right margin would indent the card's
    // own text at the card's edge instead of separating it from the tile.
    expect(tile).toMatch(/margin-left:\s*1rem/);
    expect(tile).not.toMatch(/margin-right/);
    expect(css()).not.toMatch(/\.levelCard\b[^{]*\{[^}]*grid-template-(columns|areas)/);
  });

  it("contains the float, so the card wraps it rather than the tile hanging out", () => {
    // `flow-root` is load-bearing twice over: it contains the float so the card's border
    // and background enclose it, and it is the block formatting context the body's own
    // grid needs. Losing it is the kind of change that only a screenshot would show.
    expect(rule(".levelCard")).toMatch(/display:\s*flow-root/);
    // And the actions clear it, so the difficulty buttons sit under the tile rather than
    // beside its bottom edge — which would otherwise depend on the description's length.
    expect(rule(".levelCard__actions")).toMatch(/clear:\s*both/);
  });

  it("is before the body in the source, because a float has to precede its text", () => {
    // The one thing about the new arrangement that is structural rather than stylistic: a
    // float placed after the text it is supposed to sit beside drops below it instead. So
    // this is the assertion that ties the JSX order to the CSS, and it is the reason the
    // tile moved up in the document. It is safe before the body because the tile is
    // `aria-hidden` and so is not read at all.
    const tileAt = code().indexOf('className="levelCard__tile"');
    const bodyAt = code().indexOf('className="levelCard__body"');
    expect(tileAt).toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(-1);
    expect(tileAt, "the tile must precede the body it floats beside").toBeLessThan(bodyAt);
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