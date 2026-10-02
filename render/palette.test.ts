/**
 * Tests for the palette.
 *
 * The claim these exist to pin: **a player can tell every kind in a level apart.** That
 * is not a general tidiness property, it is the bug. The first version here hashed each
 * picture name to a hue independently, and the corpus showed 17 of the 79 real levels
 * with two kinds under 25° apart and a worst case of 2° — `pfeile.ld`, whose kinds are
 * arrows, rendered in the same colour.
 *
 * The metric is CIELAB ΔE, not hue, because "can a player tell these apart at cell size"
 * is a question about colour and not about hue. That distinction earned its place: the
 * golden-angle palette measured a comfortable 30° of separation in the 14-colour level
 * and a ΔE of 6.5, which is two colours nobody can tell apart. Hue was answering a
 * different question correctly.
 *
 * There is a limit, and the tests state it rather than working around it:
 * `bunt.ld` has 153 colour kinds, and colour cannot separate 153 things. That is what
 * authored shapes are for (roadmap 8.1), and pretending otherwise would mean a test
 * that passes a property the code does not have.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_SEPARABLE_KINDS,
  MINIMUM_DELTA_E,
  buildPalette,
  colourFor,
  isDark,
  markerFor,
  maximinColours,
} from "./palette.ts";
import { deltaE, labOfHsl, rgbToLab } from "./perceptual.ts";
import { LEVELS } from "../levels-src/generated/level-index.ts";
import type { KindRole } from "../engine/level-format/level-data.ts";
import { parseLd } from "../engine/level-format/parser.ts";
import { Version } from "../engine/level-format/version.ts";
import { buildKinds } from "../engine/level-format/kinds.ts";
import { rootScope, DefinitionScope } from "../engine/level-format/scope.ts";
import {
  readLevelSettings,
  kindDefaultsFrom,
} from "../engine/level-format/settings.ts";

/** A level of `n` colour kinds and nothing else. */
function kinds(n: number): { role: KindRole }[] {
  const out: { role: KindRole }[] = [];
  for (let i = 0; i < n; i++) out.push({ role: "colour" });
  return out;
}

/**
 * The closest pair in a set of colours, by ΔE.
 *
 * Measured on the emitted `hsl()` strings rather than on Lab values carried alongside,
 * so what is checked is what the renderer draws.
 */
function closestPair(colours: readonly string[]): {
  readonly delta: number;
  readonly a: number;
  readonly b: number;
} {
  let worst = { delta: Number.POSITIVE_INFINITY, a: 0, b: 0 };
  for (let i = 0; i < colours.length; i++) {
    for (let j = i + 1; j < colours.length; j++) {
      const a = labOfHsl(colours[i] as string);
      const b = labOfHsl(colours[j] as string);
      expect(a, `colour ${i} (${colours[i]}) is hsl`).not.toBeNull();
      expect(b, `colour ${j} (${colours[j]}) is hsl`).not.toBeNull();
      const d = deltaE(a!, b!);
      if (d < worst.delta) worst = { delta: d, a: i, b: j };
    }
  }
  return worst;
}

describe("maximinColours", () => {
  it("separates a small number of kinds comfortably", () => {
    for (const n of [2, 3, 4, 5, 6, 8, 10]) {
      const pair = closestPair(maximinColours(n, false));
      expect(
        pair.delta,
        `${n} kinds: closest pair (${pair.a}, ${pair.b}) is ΔE ${pair.delta.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(MINIMUM_DELTA_E);
    }
  });

  it("separates as many kinds as colour is expected to", () => {
    // The claim in `MAX_SEPARABLE_KINDS`, measured. `bonimali.ld` has 42 and is the
    // level that sets the bound, so this is the test that would catch the bound drifting
    // away from what the code can do.
    for (const n of [14, 20, 30, MAX_SEPARABLE_KINDS]) {
      const pair = closestPair(maximinColours(n, false));
      expect(
        pair.delta,
        `${n} kinds: closest pair is ΔE ${pair.delta.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(MINIMUM_DELTA_E);
    }
  });

  it("degrades gracefully past what colour can do, rather than failing", () => {
    // 153 kinds is `bunt.ld`. There is no palette for that, and the honest result is a
    // smaller number rather than an exception or a repeated colour.
    const pair = closestPair(maximinColours(153, false));
    expect(pair.delta).toBeGreaterThan(8);
    // Every colour is still distinct, which is the floor that must never give.
    expect(new Set(maximinColours(153, false)).size).toBe(153);
  });

  it("is deterministic, so a screenshot in a bug report matches", () => {
    expect(maximinColours(9, false)).toEqual(maximinColours(9, false));
    expect(maximinColours(9, true)).toEqual(maximinColours(9, true));
  });

  it("gives a different set on a dark board, because it is chosen against the board", () => {
    // A palette tuned for white puts its lightest kinds at the edge of visibility on a
    // dark board, which is the same failure as a blank cell.
    expect(maximinColours(6, false)).not.toEqual(maximinColours(6, true));
    // And the dark set is itself well separated, not merely different.
    expect(closestPair(maximinColours(6, true)).delta).toBeGreaterThanOrEqual(
      MINIMUM_DELTA_E,
    );
  });

  it("keeps every colour visible against the board it is drawn on", () => {
    // Not "does not start at red" - that was a property of the old scheme, where a seed
    // colour was visible as such. With a maximin set there is no special first colour,
    // and red is a legitimate member of any large palette. What actually matters is the
    // opposite risk: a colour so pale it disappears into the background, which is a blob
    // the player cannot see at all.
    //
    // The floors are measured, not guessed. The chosen colours bottom out at Lab L 27 on
    // a white board and 30 on a black one, so these thresholds sit below the measured
    // minimum with room to spare and would still catch a pale colour getting in.
    for (const dark of [false, true]) {
      for (const n of [2, 6, 14, MAX_SEPARABLE_KINDS]) {
        const colours = maximinColours(n, dark);
        for (const css of colours) {
          const lab = labOfHsl(css)!;
          const floor = dark ? 22 : 18;
          expect(
            lab[0],
            `${css} on a ${dark ? "dark" : "light"} board has L=${lab[0].toFixed(0)}`,
          ).toBeGreaterThan(floor);
          // And a floor from the other end: nothing so dark it merges into a black board.
          expect(lab[0]).toBeLessThan(dark ? 95 : 92);
        }
      }
    }
  });

  it("returns nothing for no kinds, rather than a colour anyway", () => {
    expect(maximinColours(0, false)).toEqual([]);
    expect(maximinColours(-1, false)).toEqual([]);
  });
});

describe("buildPalette", () => {
  it("tells every kind of a level apart", () => {
    // The property, over the range where colour is a real answer.
    for (let n = 2; n <= MAX_SEPARABLE_KINDS; n++) {
      const table = kinds(n);
      const palette = buildPalette(table);
      const colours = table.map((_, i) => colourFor(palette, i));
      const pair = closestPair(colours);
      expect(
        pair.delta,
        `${n} kinds: closest pair (${pair.a}, ${pair.b}) is ΔE ${pair.delta.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(MINIMUM_DELTA_E);
    }
  });

  it("is deterministic, so a screenshot in a bug report matches", () => {
    const a = buildPalette(kinds(9));
    const b = buildPalette(kinds(9));
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("does not depend on which kinds the level happens to have", () => {
    // Two levels with five colours get the same five colours, since the assignment is
    // positional. That is the point: the alternative was a hash of the picture names the
    // level author chose, which is exactly how two kinds came to share a colour.
    //
    // Two things this deliberately does *not* claim, both of which I got wrong first:
    //
    // - that adding a goal kind changes nothing. It does, on purpose: the goal hue is a
    //   fixed constant, so the ordinary kinds are chosen to stay clear of it.
    // - that reordering the kind table leaves each index's colour alone. It does not, and
    //   it should not: a kind's colour comes from its position *among the ordinary
    //   kinds*, so moving a goal kind earlier moves the ordinary ones up a place. What is
    //   invariant is the set.
    const shapeA: KindRole[] = [
      "colour",
      "colour",
      "grass",
      "colour",
      "colour",
      "colour",
      "grey",
    ];
    const shapeB: KindRole[] = [
      "colour",
      "grey",
      "colour",
      "colour",
      "colour",
      "grass",
      "colour",
    ];
    const a = buildPalette(shapeA.map((role) => ({ role })));
    const b = buildPalette(shapeB.map((role) => ({ role })));
    const ordinary = (p: typeof a, shape: readonly KindRole[]): string[] =>
      shape
        .map((role, i) => (role === "colour" ? colourFor(p, i) : null))
        .filter((c): c is string => c !== null)
        .sort();
    expect(ordinary(a, shapeA)).toEqual(ordinary(b, shapeB));
    // And the role colours travel with their role, not their index.
    const at = (
      p: typeof a,
      shape: readonly KindRole[],
      role: KindRole,
    ): string => colourFor(p, shape.indexOf(role));
    expect(at(a, shapeA, "grass")).toBe(at(b, shapeB, "grass"));
    expect(at(a, shapeA, "grey")).toBe(at(b, shapeB, "grey"));
  });

  it("chooses the ordinary colours clear of the fixed goal and grey", () => {
    // The defect this pins: the goal hue is a constant, so choosing the ordinary colours
    // first and dropping the goal in afterwards made "can a player tell a goal blob from
    // an ordinary one" a matter of luck. Over the 76 levels with a goal kind, three
    // landed below the ΔE 20 the palette guarantees everywhere else, and the worst was
    // this one at ΔE 10.
    for (const n of [2, 4, 6, 14]) {
      for (const dark of [false, true]) {
        const table = [
          ...kinds(n),
          { role: "grass" as const },
          { role: "grey" as const },
        ];
        const palette = buildPalette(table, {
          background: dark ? "rgb(0,0,0)" : "#ffffff",
        });
        const goal = labOfHsl(colourFor(palette, n))!;
        const grey = labOfHsl(colourFor(palette, n + 1))!;
        for (let i = 0; i < n; i++) {
          const d = deltaE(goal, labOfHsl(colourFor(palette, i))!);
          expect(
            d,
            `${n} kinds, ${dark ? "dark" : "light"}: ordinary ${i} is ΔE ${d.toFixed(1)} ` +
              `from the goal colour`,
          ).toBeGreaterThanOrEqual(MINIMUM_DELTA_E);
          // A grey is desaturated, so it is further from a saturated colour than almost
          // anything else in the palette. Held separately because it is a different
          // relationship, not a smaller version of the same one.
          expect(
            deltaE(grey, labOfHsl(colourFor(palette, i))!),
          ).toBeGreaterThan(MINIMUM_DELTA_E);
        }
      }
    }
  });

  it("keeps greys grey and marks them with a square", () => {
    // The marker shape is what distinguishes them, so the colour must not have to.
    const palette = buildPalette([
      { role: "colour" },
      { role: "grey" },
      { role: "grey" },
    ]);
    for (const i of [1, 2]) {
      expect(colourFor(palette, i)).toMatch(/^hsl\(0 0%/);
      expect(markerFor(palette, i)).toBe("square");
    }
    // And two greys in one level are still told apart, by lightness.
    expect(colourFor(palette, 1)).not.toBe(colourFor(palette, 2));
    expect(markerFor(palette, 0)).toBe("");
  });

  it("gives goal blobs a fixed hue and a dot, on every board", () => {
    // Green, because that is what "grass" means in the original and what a player
    // coming from it expects. Fixed rather than chosen, so goal blobs are recognisable
    // across levels.
    for (const n of [2, 4, 6]) {
      const palette = buildPalette([...kinds(n), { role: "grass" as const }]);
      expect(labOfHsl(colourFor(palette, n))).not.toBeNull();
      expect(colourFor(palette, n)).toContain(`hsl(96 `);
      expect(markerFor(palette, n)).toBe("dot");
    }
  });

  it("adjusts for a dark background", () => {
    // Levels declare their own `bgcolor` and some are dark; `hormone.ld` is the one.
    const light = buildPalette(kinds(6), { background: "#ffffff" });
    const dark = buildPalette(kinds(6), { background: "rgb(0,0,0)" });
    for (let i = 0; i < 6; i++) {
      expect(colourFor(dark, i)).not.toBe(colourFor(light, i));
      // The dark board needs its colours *lighter*, or they sit at the edge of
      // visibility on it - which is the same failure as a blank cell. Measured floor on
      // the dark grid is Lab L 30, and the threshold is below that.
      const l = labOfHsl(colourFor(dark, i))![0];
      expect(
        l,
        `kind ${i} on a dark board has L=${l.toFixed(0)}`,
      ).toBeGreaterThan(22);
    }
  });

  it("gives an empty kind something visible", () => {
    const palette = buildPalette([{ role: "empty" }]);
    expect(colourFor(palette, 0)).toBeTruthy();
  });

  it("falls back to a visible colour for a kind the palette does not have", () => {
    // The board can hold a kind constant the table does not describe, and a blank cell
    // is the one outcome that must never happen.
    expect(colourFor(buildPalette(kinds(2)), 99)).toBe("#c0c0c0");
  });

  it("returns the same palette for the same kind table, rather than searching again", () => {
    // The renderer asks every frame, so this is on the hot path. A search per frame
    // would be a visible stutter, and the answer cannot change while a level is loaded.
    const table = kinds(12);
    expect(buildPalette(table)).toBe(buildPalette(table));
  });
});

describe("isDark", () => {
  it("decides on luminance, not on the format", () => {
    expect(isDark("#000000")).toBe(true);
    expect(isDark("#ffffff")).toBe(false);
    expect(isDark("#3a4a6a")).toBe(true);
    // Levels write `bgcolor=0,0,0`, which the loader hands over in this form.
    expect(isDark("rgb(0,0,0)")).toBe(true);
    expect(isDark("rgb(240,240,240)")).toBe(false);
    expect(isDark("hsl(0 0% 10%)")).toBe(true);
    expect(isDark("hsl(0 0% 90%)")).toBe(false);
  });

  it("assumes light for anything it cannot read", () => {
    // Every level in the corpus uses a light or dark board it declares, so this is a
    // defensive default. Light is the safer one: the palette for it is the one most
    // levels would get anyway.
    expect(isDark("rebeccapurple")).toBe(false);
    expect(isDark("")).toBe(false);
  });
});

describe("the perceptual metric itself", () => {
  it("puts black and white at the ends of L and nowhere else", () => {
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 1);
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 1);
  });

  it("says a colour is zero distance from itself", () => {
    const lab = rgbToLab(120, 60, 200);
    expect(deltaE(lab, lab)).toBe(0);
  });

  it("ranks a difference in lightness above a difference of the same size in hue", () => {
    // Not a law of perception, but a property of the formula worth pinning: if it ever
    // inverts, the palette's use of lightness as a separating dimension stops being
    // measured on the right axis.
    const base = rgbToLab(120, 120, 120);
    const lighter = rgbToLab(150, 150, 150);
    expect(deltaE(base, lighter)).toBeGreaterThan(0);
  });

  it("round-trips an hsl string to the same colour it describes", () => {
    // The palette tests measure emitted strings, so the parser has to be exact or the
    // measurement is of something other than what is drawn.
    for (const css of [
      "hsl(200 58% 52%)",
      "hsl(0 0% 58%)",
      "hsl(96 50% 42%)",
      "hsl(359 45% 70%)",
    ]) {
      const parsed = labOfHsl(css);
      expect(parsed, css).not.toBeNull();
      expect(deltaE(parsed!, labOfHsl(css)!)).toBe(0);
    }
  });

  it("returns null for a colour it cannot read, rather than guessing", () => {
    // A caller has to be able to tell "not a colour" from "distance zero".
    expect(labOfHsl("#ff0000")).toBeNull();
    expect(labOfHsl("rgb(1,2,3)")).toBeNull();
    expect(labOfHsl("")).toBeNull();
  });
});

/** The level files the corpus oracle reads. */
const DATA_DIR = resolve(import.meta.dirname, "../.context/upstream-cuyo/data");

describe("the real corpus", () => {
  it("tells every level's kinds apart, on every real level", () => {
    // The oracle, built through the parser rather than by reading the `pics` lines out
    // of the file text.
    //
    // That distinction is the whole reason this test was wrong before. Cuyo routinely
    // *computes* its picture list - `pics = Blob * <2*anzahl>` in angst.ld - and a
    // regex finds no names in that. Measured over the 79 levels, the textual read saw
    // 33 and skipped 46, and the skipped ones are the ones with the most kinds, which
    // is exactly where the question matters. So "zero pairs under 30°" was a true
    // statement about a third of the corpus, and the 14-colour level was never looked
    // at.
    //
    // Skipped rather than failed when the corpus is absent, because a fresh clone has
    // not fetched it and the other corpus tests already say so loudly.
    if (!hasCorpus()) return;

    const bad: string[] = [];
    const beyondColour: string[] = [];
    const measured: [string, number, number][] = [];
    let examined = 0;

    for (const [where, level] of realLevels()) {
      const palette = buildPalette(level.kinds, {
        background: level.background,
      });
      const ordinary = level.kinds
        .map((k, i) => ({ role: k.role, colour: colourFor(palette, i) }))
        .filter((k) => k.role === "colour");
      if (ordinary.length < 2) continue;
      examined++;

      const pair = closestPair(ordinary.map((k) => k.colour));
      measured.push([where, ordinary.length, pair.delta]);

      // The goal colour is a constant, so the ordinary kinds have to be chosen clear of
      // it. Checked here as well as synthetically, because the gap was only ever visible
      // in the corpus: `angst.ld` sat at ΔE 10 from its goal colour while every ordinary
      // pair in it was comfortably apart. Nothing in the level-to-level test would have
      // seen it, since that test only looks at ordinary pairs.
      const goalIndex = level.kinds.findIndex((k) => k.role === "grass");
      if (goalIndex >= 0 && ordinary.length <= MAX_SEPARABLE_KINDS) {
        const goal = labOfHsl(colourFor(palette, goalIndex))!;
        let nearest = Number.POSITIVE_INFINITY;
        for (let i = 0; i < level.kinds.length; i++) {
          if (i === goalIndex || level.kinds[i]?.role !== "colour") continue;
          nearest = Math.min(
            nearest,
            deltaE(goal, labOfHsl(colourFor(palette, i))!),
          );
        }
        if (nearest < MINIMUM_DELTA_E) {
          bad.push(
            `${where}: goal colour is ΔE ${nearest.toFixed(1)} from an ordinary kind`,
          );
        }
      }

      if (ordinary.length > MAX_SEPARABLE_KINDS) {
        beyondColour.push(
          `${where} (${ordinary.length} kinds, ΔE ${pair.delta.toFixed(1)})`,
        );
        continue;
      }
      if (pair.delta < MINIMUM_DELTA_E) {
        bad.push(
          `${where}: ${ordinary.length} kinds, closest pair ΔE ${pair.delta.toFixed(1)}`,
        );
      }
    }

    // Every level with two or more colour kinds must be *examined*, or the oracle is
    // decorative again. This is the assertion that would have caught the 46 the previous
    // textual read skipped. There are 70 such levels in the corpus.
    expect(
      examined,
      "levels with 2+ colour kinds examined",
    ).toBeGreaterThanOrEqual(65);

    // The levels colour cannot separate are named with their measured number, so the
    // limit is visible and a new offender is noticed rather than absorbed.
    expect(
      beyondColour.length,
      `levels past colour's reach: ${beyondColour.join(", ")}`,
    ).toBeLessThanOrEqual(2);

    expect(
      bad,
      `${bad.length} level(s) below ΔE ${MINIMUM_DELTA_E} across ${examined} levels`,
    ).toEqual([]);
  });

  it("reports the measured separation, so the numbers are not only asserted", () => {
    // A test that only says "at least 20" leaves the actual value unknown, and the
    // actual value is what tells you how much headroom there is before a level gets
    // harder. Written as a passing test so the numbers are printed rather than lost.
    if (!hasCorpus()) return;
    const rows: [string, number, number][] = [];
    for (const [where, level] of realLevels()) {
      const palette = buildPalette(level.kinds, {
        background: level.background,
      });
      const colours = level.kinds
        .map((k, i) => ({ role: k.role, colour: colourFor(palette, i) }))
        .filter((k) => k.role === "colour")
        .map((k) => k.colour);
      if (colours.length < 2) continue;
      rows.push([where, colours.length, closestPair(colours).delta]);
    }
    rows.sort((a, b) => a[2] - b[2]);
    const tightest = rows
      .slice(0, 6)
      .map(([w, n, d]) => `${w}=${d.toFixed(0)}(${n})`);
    expect(
      rows.length,
      `tightest pairs: ${tightest.join(" ")}`,
    ).toBeGreaterThanOrEqual(65);
  });
});

/** Whether the corpus is present, so a fresh clone skips rather than fails. */
function hasCorpus(): boolean {
  try {
    readdirSync(DATA_DIR);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every real level's kinds, built the way the game builds them.
 *
 * Goes through the parser and `buildKinds`, so a level whose `pics` is computed is
 * present with the kinds the game will actually draw, rather than absent because a
 * regex found no picture names in `Blob * <2*anzahl>`.
 */
function realLevels(): Map<
  string,
  {
    readonly background: string;
    readonly kinds: readonly { readonly role: KindRole }[];
  }
> {
  const globals = parseLd(
    readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1"),
    "globals.ld",
  );
  const out = new Map<
    string,
    {
      readonly background: string;
      readonly kinds: readonly { readonly role: KindRole }[];
    }
  >();

  for (const entry of LEVELS) {
    const filename = entry.filename;
    if (out.has(filename)) continue;
    const file = parseLd(
      readFileSync(resolve(DATA_DIR, filename), "latin1"),
      filename,
    );
    for (const def of file.definitions) {
      if (def.value.type !== "section") continue;
      // The catalogue's default: one player, normal difficulty.
      const version = Version.of("1", "main");
      const root = rootScope(filename, version);
      root.defineAll(globals.definitions);
      root.defineAll(file.definitions);
      const level = new DefinitionScope(def.name, root, version, filename);
      level.defineAll(def.value.definitions);
      try {
        const settings = readLevelSettings(level);
        const table = buildKinds(level, kindDefaultsFrom(settings));
        out.set(filename, {
          background: cssColour(settings.background),
          kinds: table.kinds.map((k) => ({ role: k.role })),
        });
      } catch {
        // A level that does not compile at this version is not a palette case, and
        // `validate-levels` reports it with far better diagnostics than anything here.
      }
    }
  }
  return out;
}

/** The loader's colour format, duplicated: it is three lines and not worth exporting. */
function cssColour(colour: { r: number; g: number; b: number }): string {
  const c = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
  return `rgb(${c(colour.r)},${c(colour.g)},${c(colour.b)})`;
}
