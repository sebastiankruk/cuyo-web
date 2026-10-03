/**
 * The catalogue tile's geometry and markup.
 *
 * Asserted as **positions**, not as counts, and that is the whole reason this file
 * exists rather than a smoke test. A tile is ~20 rectangles; a test that says "the SVG
 * has 21 rects" passes just as happily when all twenty are stacked on each other in the
 * corner, and that is precisely the failure mode the board tests in this project were
 * written after — a test that checked "26 fills happened, all inside the canvas" while
 * every blob was drawn in one place.
 *
 * So every case below names where something should be, in board units, and where it
 * should not be.
 */

import { describe, expect, it } from "vitest";
import { crop, tileCells, tileSvg } from "./tile.ts";
import type { LevelTile } from "../engine/level-format/index-data.ts";
import { GRX, GRY } from "../engine/game-core/constants.ts";

/** A tile with `at` and `kind` given, and everything else defaulted. */
function tile(at: number[], kind: number[], over: Partial<LevelTile> = {}): LevelTile {
  return { background: "rgb(255, 255, 255)", at, kind, palette: 0, ...over };
}

const WHITE = "rgb(255, 255, 255)";

/** How wide a blob is, in board units: the cell less the inset on each side. */
const BLOB = 0.92;

describe("tileCells", () => {
  it("puts a cell at the grid position its index names, not in a list order", () => {
    // Index 0 is the top-left and index 199 the bottom-right, row-major. Getting this
    // backwards mirrors the board vertically, which for a start layout — blobs sitting at
    // the bottom — puts them at the top, and a catalogue where every level's blobs float
    // is a catalogue that looks plausible and is wrong.
    const cells = tileCells(tile([0, 9, 190, 199], [1, 1, 1, 1]), "hsl(0 0% 0%)|hsl(0 0% 0%)");
    expect(cells.map((c) => [c.x, c.y])).toEqual([
      [0.04, 0.04], // top-left
      [9.04, 0.04], // top-right
      [0.04, 19.04], // bottom-left
      [9.04, 19.04], // bottom-right
    ]);
  });

  it("leaves every cell inside the board", () => {
    const at = Array.from({ length: GRY }, (_, y) =>
      Array.from({ length: GRX }, (_, x) => y * GRX + x),
    ).flat();
    const cells = tileCells(tile(at, at.map(() => 1)), "hsl(0 0% 0%)|hsl(0 0% 0%)");
    expect(cells).toHaveLength(GRX * GRY);
    for (const c of cells) {
      // The blob, not the cell: it is `1 - INSET` wide, so the last column ends at 9.96
      // and asserting `x + 1 <= GRX` would fail on a tile that is entirely correct.
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + BLOB).toBeLessThanOrEqual(GRX);
      expect(c.y + BLOB).toBeLessThanOrEqual(GRY);
    }
  });

  it("insets every blob, so neighbouring blobs stay separate", () => {
    const cells = tileCells(tile([0, 1, 2], [1, 1, 1]), "hsl(0 0% 0%)|hsl(0 0% 0%)");
    expect(cells.map((c) => c.x)).toEqual([0.04, 1.04, 2.04]);
    // Each is 0.92 wide, so cell 0 ends at 0.96 and cell 1 starts at 1.04: a 0.08 gap.
    expect(cells[0]!.x + 0.92).toBeLessThan(cells[1]!.x);
  });

  it("colours each blob from the palette by kind index, not by cell order", () => {
    // Two adjacent cells of different kinds. If the palette were indexed by position in
    // `at` rather than by `kind`, these would come out in the wrong colours — and since
    // the cells are adjacent the tile would still look like a plausible board.
    const cells = tileCells(
      tile([100, 101], [1, 2]),
      "hsl(0 0% 0%)|hsl(120 50% 50%)|hsl(240 50% 50%)",
    );
    expect(cells.map((c) => c.colour)).toEqual([
      "hsl(120 50% 50%)",
      "hsl(240 50% 50%)",
    ]);
  });

  it("draws a kind the palette does not have in the background, not in some third colour", () => {
    // An unknown kind index means the tile and the palette it names disagree. The
    // background is the only honest fill: a blob in another colour would be a claim about
    // the level that nothing supports, and an *invisible* one is at least visibly absent.
    const cells = tileCells(
      tile([50], [9], { background: "rgb(1, 2, 3)" }),
      "hsl(0 0% 0%)|hsl(0 0% 0%)",
    );
    expect(cells[0]!.colour).toBe("rgb(1, 2, 3)");
  });

  it("skips a cell with no kind beside it rather than inventing one", () => {
    // A malformed pair — `at` longer than `kind` — would otherwise read `undefined` as a
    // kind index, look that up, get nothing, and silently drop the cell. Better to be
    // explicit that it is dropped, and to have the count say so.
    const cells = tileCells(tile([50, 51, 52], [1]), "hsl(0 0% 0%)|hsl(0 0% 0%)");
    expect(cells).toHaveLength(1);
    // Row 5, from cell index 50 — asserted as a row rather than as `y`, because `y` also
    // carries the inset and would make this test about the inset instead.
    expect(Math.floor(cells[0]!.y)).toBe(5);
  });
});

describe("crop", () => {
  // The board is 88.3% empty at the start, so the tile shows the band the level occupies.
  // These are the properties that must hold whatever the crop decides.

  it("never lets a drawn cell fall outside it", () => {
    // The one that matters. A crop that clips a blob loses it silently: the tile still
    // renders, the cell count is still right, and a level's first or last row of blobs is
    // simply absent. Checked across shapes rather than one case, because the crop is
    // arithmetic on the row range and the failure is in the arithmetic.
    for (const at of [
      [190],
      [190, 199],
      [180, 199],
      [0],
      [0, 199],
      [190, 180, 170, 160],
      Array.from({ length: GRY }, (_, y) => y * GRX),
    ]) {
      const t = tile(at, at.map(() => 1));
      const { top, height } = crop(t);
      expect(height, `height for ${at.length} cells`).toBeGreaterThan(0);
      for (const cell of at) {
        const y = Math.floor(cell / GRX);
        expect(
          y >= top && y + 1 <= top + height,
          `cell ${cell} is row ${y}, outside [${top}, ${top + height}]`,
        ).toBe(true);
      }
    }
  });

  it("leaves at least three rows, so a one-row level is not a coloured line", () => {
    // Nasenkugeln occupies a single row. Uncropped it would be 1.5 rows of board, which at
    // a card's width is about eleven pixels — and two such levels would be
    // indistinguishable however differently they were coloured.
    expect(crop(tile([190], [1])).height).toBe(3);
  });

  it("keeps the blobs at the bottom, which is the one spatial fact the shape carries", () => {
    // Every level's start layout is bottom-aligned, so a tile that floated its band to the
    // middle would be showing a board no level starts as.
    const { top, height } = crop(tile([190], [1]));
    expect(top + height).toBe(GRY);
  });

  it("grows with the band, so how much a level fills is still visible", () => {
    const one = crop(tile([190], [1])).height;
    const six = crop(tile(Array.from({ length: 60 }, (_, i) => 140 + i), new Array(60).fill(1)))
      .height;
    expect(six).toBeGreaterThan(one);
    // And the full board is available to a level that fills it, which is 16 of 20 rows.
    expect(crop(tile(Array.from({ length: 160 }, (_, i) => 40 + i), new Array(160).fill(1)))
      .height).toBeGreaterThan(10);
  });

  it("shows the whole board when there is nothing to crop to", () => {
    // No corpus level has an empty start layout, so this shape is unreachable from the
    // index. Guessing at a band for a level with no blobs would be inventing a picture.
    expect(crop(tile([], []))).toEqual({ top: 0, height: GRY });
  });
});

describe("tileSvg", () => {
  const svg = tileSvg(tile([190], [1]), "hsl(0 0% 0%)|hsl(120 50% 50%)");

  it("is one svg whose viewBox is the crop", () => {
    // The viewBox does the cropping, so a blob's own coordinates never move: they stay in
    // board units and the viewBox decides which of them are on screen. The alternative —
    // shifting every rect to make the crop the origin — is arithmetic that has to be right
    // 187 times, and a mistake in it moves a blob rather than clipping it.
    const { top, height } = crop(tile([190], [1]));
    expect(svg.startsWith(`<svg class="tile" viewBox="0 ${top} ${GRX} ${height}"`)).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.match(/<svg/g)).toHaveLength(1);
  });

  it("covers the whole board with the background, so a cropped tile is coloured to its edge", () => {
    // The rect is the full board rather than the viewBox, so clipping is the viewBox's job
    // alone and the generator never has to know the crop.
    expect(svg).toContain(`<rect width="${GRX}" height="${GRY}"`);
    expect(svg.indexOf(`<rect width="${GRX}"`)).toBeLessThan(svg.indexOf('<rect x='));
  });

  it("paints the level's own background first, so an empty board is still the level's colour", () => {
    // The corpus has 32 distinct `bgcolor` values across 187 difficulty rows, which is
    // most of what makes two tiles tellable apart. If the background were white rather
    // than the level's, a dark level's tile would be a white rectangle with a few blobs.
    const dark = tileSvg(tile([], [], { background: "rgb(0, 0, 0)" }), "");
    expect(dark).toContain(`<rect width="${GRX}" height="${GRY}" fill="rgb(0, 0, 0)"/>`);
  });

  it("hides itself from a screen reader, because a description would be colour names", () => {
    expect(svg).toContain('aria-hidden="true"');
    // Not `role="img"` with a label: a label would have to describe twenty squares, and
    // the facts the tile shows are already in the card as words.
    expect(svg).not.toContain("role=");
  });

  it("asks for crisp edges, because a blob is most of a board unit", () => {
    // Without this a browser smooths the 0.92-unit rectangles and the gaps between them
    // — 0.08 units, which is under a pixel at any plausible tile size — blur away.
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it("draws one blob per filled cell, plus the background", () => {
    const rects = svg.match(/<rect/g) ?? [];
    expect(rects).toHaveLength(2);
  });

  it("puts the blob at the position its index names", () => {
    // Cell 190 is row 19, column 0 — the bottom-left corner. Unmoved by the crop.
    expect(svg).toContain('<rect x="0.04" y="19.04" width="0.92" height="0.92"');
  });
});

describe("colours that would break the document", () => {
  // `background` and the palette are machine-generated, so this cannot happen today. It
  // is here because the consequence is quiet: a colour containing a quote produces
  // markup that parses as something other than what was written, and the tile loses a
  // blob rather than raising. "Cannot happen" is not the same claim as "cannot render",
  // and only the second one is checkable.
  it("refuses a colour that would close the attribute early", () => {
    // Kind 0, so it is the *first* palette entry that carries the quote. Kind 1 would be
    // the innocent second entry and the tile would come out perfectly well formed, which
    // is the trap: a test that picked the wrong index would pass without testing anything.
    const evil = tileSvg(tile([190], [0]), 'hsl(0 0% 0%)"><script>x</script|hsl(0 0% 0%)');
    expect(evil).not.toContain("<script");
    expect(evil).toContain("#ff00ff");
  });

  it("refuses one in the background too", () => {
    const evil = tileSvg(tile([], [], { background: 'rgb(0,0,0)"/><rect fill="red' }), "");
    expect(evil).not.toContain('fill="red"');
  });

  it("still draws a well-formed document when every colour is refused", () => {
    const evil = tileSvg(
      tile([190, 191], [1, 1], { background: "javascript:alert(1)" }),
      "<not a colour>",
    );
    expect(evil.match(/<svg/g)).toHaveLength(1);
    expect(evil.match(/<rect/g)).toHaveLength(3);
    expect(evil.endsWith("</svg>")).toBe(true);
  });

  it("accepts the forms the generator actually produces", () => {
    // Asserted through `tileSvg` rather than against a copy of the pattern. A copy is a
    // transcription: it can be tightened in `tile.ts` while the test's own regex keeps
    // accepting, and every tile in the catalogue would be magenta with all seventeen
    // tests green. Going through the renderer asks the question that matters — does the
    // real colour survive — and cannot drift from the implementation.
    //
    // These are the two real shapes: `rgb(r, g, b)` from a level's `bgcolor`, and
    // `hsl(H S% L%)` from `buildPalette`.
    for (const colour of [
      "rgb(255, 255, 255)",
      "rgb(0, 0, 0)",
      "hsl(240 70% 52%)",
      "hsl(0 0% 100%)",
    ]) {
      const svg = tileSvg(tile([190], [0], { background: colour }), colour);
      expect(svg, colour).toContain(`fill="${colour}"`);
      expect(svg, colour).not.toContain("#ff00ff");
    }
  });
});

describe("an empty level", () => {
  it("still produces a board of the level's colour, not a broken tile", () => {
    // No corpus level has an empty start layout — measured, all 187 have at least six
    // filled cells — so this case cannot be reached from the index. It is here because a
    // level that gains one should produce a plain coloured board rather than an exception
    // thrown from a React render.
    const svg = tileSvg(tile([], [], { background: WHITE }), "");
    expect(svg.match(/<rect/g)).toHaveLength(1);
    expect(svg).toContain(`fill="${WHITE}"`);
  });
});