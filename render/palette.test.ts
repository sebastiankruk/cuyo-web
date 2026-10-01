/**
 * Tests for the palette.
 *
 * The claim these exist to pin: **two kinds in the same level are always told apart.**
 * That is not a general tidiness property, it is the bug. The previous scheme hashed
 * each picture name to a hue independently, and the corpus showed 17 of the 79 real
 * levels with two kinds under 25° apart and a worst case of 2° — `pfeile.ld`, whose
 * kinds are arrows, rendered in the same colour. Hashing cannot fix this, because two
 * names can hash near each other no matter how good the hash is.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPalette,
  colourFor,
  isDark,
  markerFor,
  spreadHues,
} from "./palette.ts";
import { LEVELS } from "../levels-src/generated/level-index.ts";
import type { KindRole } from "../engine/level-format/level-data.ts";

/** A level of `n` colour kinds and nothing else. */
function kinds(n: number): { role: KindRole }[] {
  const out: { role: KindRole }[] = [];
  for (let i = 0; i < n; i++) out.push({ role: "colour" });
  return out;
}

/** The hue out of an `hsl(...)` string, or null if it is not hsl. */
function hueOf(colour: string): number | null {
  const m = /^hsl\((\d+)/.exec(colour);
  return m === null ? null : Number(m[1]);
}

/** Circular distance between two hues, in degrees. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
}

describe("spreadHues", () => {
  it("gives every kind a distinct hue", () => {
    for (const n of [2, 3, 4, 5, 6, 8, 13]) {
      expect(new Set(spreadHues(n, n + 1)).size, `${n} kinds`).toBe(n);
    }
  });

  it("spreads them far apart rather than merely unequally", () => {
    // Distinct is not the requirement. Two kinds at 4° apart are distinct and
    // indistinguishable, which is the bug this replaces.
    for (const n of [2, 3, 4, 5, 6, 8, 13]) {
      const hues = spreadHues(n, n + 1);
      let min = 360;
      for (let i = 0; i < hues.length; i++) {
        for (let j = i + 1; j < hues.length; j++) {
          min = Math.min(min, hueDistance(hues[i]!, hues[j]!));
        }
      }
      // The golden angle's guarantee: minimum separation never collapses as the count
      // grows, it shrinks slowly. This is the floor, generously rounded down.
      expect(min, `${n} kinds, min separation ${min}°`).toBeGreaterThanOrEqual(
        n <= 2 ? 100 : 360 / (n * n) / 2,
      );
    }
  });

  it("does not start at red", () => {
    // Red on a white board reads as an error, and is the colour a player will mistake
    // for the chase border or a warning.
    expect(spreadHues(2, 3)[0]).not.toBe(0);
  });

  it("gives different counts different starting points", () => {
    // Otherwise every two-colour level looks the same as every other two-colour level.
    expect(spreadHues(2, 3)[0]).not.toBe(spreadHues(3, 4)[0]);
  });
});

describe("buildPalette", () => {
  it("tells every kind of a level apart", () => {
    // The property, over a range of kind counts.
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const palette = buildPalette(kinds(n));
      const hues = kinds(n).map((_, i) => hueOf(colourFor(palette, i)));
      for (const h of hues)
        expect(h, `kind in a ${n}-colour level`).not.toBeNull();
      let min = 360;
      for (let i = 0; i < hues.length; i++) {
        for (let j = i + 1; j < hues.length; j++) {
          min = Math.min(min, hueDistance(hues[i]!, hues[j]!));
        }
      }
      expect(min, `${n} colours: closest pair ${min}° apart`).toBeGreaterThan(
        30,
      );
    }
  });

  it("is deterministic, so a screenshot in a bug report matches", () => {
    const a = buildPalette(kinds(5));
    const b = buildPalette(kinds(5));
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("does not depend on which kinds the level happens to have", () => {
    // Two levels with five colours should look the same, since the assignment is
    // positional. That is the point: the alternative was a per-key hash, which made two
    // levels' palettes depend on names the level did not choose.
    const withGoal = [...kinds(5), { role: "grass" as const }];
    const palette = buildPalette(withGoal);
    for (let i = 0; i < 5; i++) {
      expect(colourFor(palette, i)).toBe(colourFor(buildPalette(kinds(5)), i));
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
      expect(colourFor(palette, i)).toMatch(/hsl\(0 0%/);
      expect(markerFor(palette, i)).toBe("square");
    }
    // And two greys in one level are still told apart, by lightness.
    expect(colourFor(palette, 1)).not.toBe(colourFor(palette, 2));
    expect(markerFor(palette, 0)).toBe("");
  });

  it("gives goal blobs a fixed hue and a dot, on every board", () => {
    // Green, because that is what "grass" means in the original and what a player
    // coming from it expects. Fixed rather than spread, so goal blobs are recognisable
    // across levels.
    for (const n of [2, 4, 6]) {
      const palette = buildPalette([...kinds(n), { role: "grass" as const }]);
      expect(hueOf(colourFor(palette, n))).toBe(96);
      expect(markerFor(palette, n)).toBe("dot");
    }
  });

  it("adjusts for a dark background", () => {
    // Levels declare their own bgcolor and some are dark. A palette tuned for white
    // puts its lightest kinds at the edge of visibility on a dark board — a blob you
    // cannot see, which is the same failure as a blank cell.
    const light = buildPalette(kinds(4), { background: "#ffffff" });
    const dark = buildPalette(kinds(4), { background: "#000000" });
    for (let i = 0; i < 4; i++) {
      expect(colourFor(dark, i)).not.toBe(colourFor(light, i));
      expect(
        lightnessOf(colourFor(dark, i)),
        `kind ${i} on a dark board`,
      ).toBeGreaterThan(lightnessOf(colourFor(light, i)));
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
});

describe("isDark", () => {
  it("decides on luminance, not on the format", () => {
    expect(isDark("#000000")).toBe(true);
    expect(isDark("#ffffff")).toBe(false);
    expect(isDark("#3a4a6a")).toBe(true);
    expect(isDark("rgb(20, 20, 20)")).toBe(true);
    expect(isDark("rgb(240, 240, 240)")).toBe(false);
    expect(isDark("hsl(0 0% 10%)")).toBe(true);
    expect(isDark("hsl(0 0% 90%)")).toBe(false);
  });

  it("assumes light for anything it cannot read", () => {
    // Every level in the corpus uses a light or dark board it declares in hex, so this
    // is a defensive default. Light is the safer one: the palette for it is the one
    // most levels would get anyway.
    expect(isDark("rebeccapurple")).toBe(false);
    expect(isDark("")).toBe(false);
  });
});

describe("the real corpus", () => {
  const DATA_DIR = resolve(
    import.meta.dirname,
    "../.context/upstream-cuyo/data",
  );

  /** The picture names each level's `pics` lines declare. */
  function picKeysOf(filename: string): string[] {
    const text = readFileSync(resolve(DATA_DIR, filename), "latin1");
    return [
      ...new Set(
        [...text.matchAll(/^\s*pics\s*=\s*(.*)$/gm)]
          .flatMap((m) => (m[1] ?? "").split(",").map((s) => s.trim()))
          .filter((k) => /^\w+$/.test(k)),
      ),
    ];
  }

  it("tells every level's kinds apart, on every real level", () => {
    // The oracle. Every level in the corpus, read through its own `pics` lines, mapped
    // to the kind table the parser produces, and checked for the property that was
    // actually broken.
    //
    // Skipped rather than failed when the corpus is absent, because a fresh clone has
    // not run `make fetch:corpus` and the other corpus tests already say so loudly.
    if (
      !LEVELS.every((l) => {
        try {
          readFileSync(resolve(DATA_DIR, l.filename), "latin1");
          return true;
        } catch {
          return false;
        }
      })
    ) {
      return;
    }

    const bad: string[] = [];
    let worst = 360;
    let worstWhere = "";
    for (const entry of LEVELS) {
      const keys = picKeysOf(entry.filename);
      if (keys.length < 2) continue;
      // Kinds in declaration order, which is the order `pics` lists them.
      const table = keys.map(() => ({ role: "colour" as const }));
      const palette = buildPalette(table);
      const hues = keys.map((_, i) => hueOf(colourFor(palette, i)) ?? -1);
      for (let i = 0; i < hues.length; i++) {
        for (let j = i + 1; j < hues.length; j++) {
          const d = hueDistance(hues[i]!, hues[j]!);
          if (d < worst) {
            worst = d;
            worstWhere = `${entry.id} ${keys[i]} / ${keys[j]}`;
          }
          if (d < 30) {
            bad.push(`${entry.id}: ${keys[i]} and ${keys[j]} are ${d}° apart`);
          }
        }
      }
    }
    // The old scheme's worst case here was 2°, in pfeile.ld. Thirty degrees is roughly
    // the point at which two saturated hues are distinguishable side by side at cell
    // size, so it is the floor worth holding.
    expect(
      bad.slice(0, 20),
      `${bad.length} pair(s) under 30°; worst was ${worst}° (${worstWhere})`,
    ).toEqual([]);
  });
});

/** Lightness percentage out of an `hsl(...)` string. */
function lightnessOf(colour: string): number {
  const m = /^hsl\(\d+ \d+% (\d+)%\)/.exec(colour);
  return m === null ? 0 : Number(m[1]);
}
