/**
 * Perceptual colour distance.
 *
 * This exists because the palette question is not "are these hues far apart" but "can
 * a player tell these two blobs apart at cell size", and those are different questions.
 * Measuring hue alone said the 14-colour level was fine; measuring actual colour
 * difference says its tightest pair is ΔE 6.5, which is two colours a player cannot
 * tell apart. Both numbers were true and only one of them meant anything.
 *
 * CIE76 ΔE in CIELAB, which is the older and cruder of the ΔE formulas. Cruder is the
 * right choice here: it overestimates nothing, and the thresholds below were set by
 * measuring what the eye accepts rather than by copying a number from a spec. A ΔE of
 * about 2 is imperceptible, 10 is a clear difference side by side, and 20 is
 * unmistakable. The palette tests hold 20 where colour is expected to do the job.
 *
 * All of it is pure arithmetic, so it runs in plain Node and needs no canvas.
 */

/** A colour in CIELAB. L is roughly 0-100; a and b are signed and roughly -128..127. */
export type Lab = readonly [number, number, number];

/** One channel of sRGB, 0-255, to linear light. */
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB 0-255 to CIELAB, against a D65 white point. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // Linear sRGB to XYZ, then to the reference white.
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIE76 colour difference: the plain Euclidean distance in Lab.
 *
 * `a` and `b` count for more than `L` in this formula, which is a real simplification -
 * the more perceptually uniform 2000-series formulas weight the channels unequally.
 * That is acceptable and worth saying out loud: this over-penalises a difference in
 * lightness relative to a difference in hue, and since the palette deliberately uses
 * lightness as a separating dimension, the bias is against the thing being tested. It
 * makes the threshold harder to pass, not easier.
 */
export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * A colour from hue, saturation and lightness, as the palette thinks in them.
 *
 * Returns the Lab triple and the CSS string together, because the palette needs to
 * measure candidates and then *emit* the winner, and re-deriving one from the other
 * would be a chance for the two to disagree.
 */
export function hslCandidate(
  hue: number,
  saturation: number,
  lightness: number,
): { readonly lab: Lab; readonly css: string } {
  const s = saturation / 100;
  const l = lightness / 100;
  // The standard hue-to-rgb-by-sectors construction, kept here rather than pulled in
  // as a string so the measured value is the emitted value.
  const k = (n: number): number => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number =>
    l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
  return {
    lab: rgbToLab(f(0) * 255, f(8) * 255, f(4) * 255),
    css: `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`,
  };
}

/**
 * Parses an `hsl(H S% L%)` string back to Lab, for measuring what was emitted.
 *
 * A parser rather than a parallel code path on purpose: the palette tests should
 * measure the strings the renderer actually draws. The alternative - threading Lab
 * values alongside the CSS everywhere - is exactly the sort of thing that drifts.
 *
 * Returns null for anything it does not recognise, so a caller can tell "not a colour"
 * from "distance zero".
 */
export function labOfHsl(colour: string): Lab | null {
  const m =
    /^hsl\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\)$/.exec(
      colour.trim(),
    );
  if (m === null) return null;
  return hslCandidate(Number(m[1]), Number(m[2]), Number(m[3])).lab;
}
