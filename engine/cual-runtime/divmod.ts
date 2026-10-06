// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Cual's `/` and `%`, which are not JavaScript's.
 *
 * The definition is in `docs/cual.6`, and it is a real difference: Cual divides by
 * *flooring* in both sign cases, where JavaScript and C both truncate toward zero. So
 * `-13 / 5` is `-3` here and `-2` in JavaScript, and any arithmetic ported from C without
 * this file will be quietly wrong for negative operands.
 *
 * ## Where the definition comes from, and why it is not just `Math.floor`
 *
 * `cual.6` states it twice, in prose and in a table, and the two agree:
 *
 *     if b > 0 then a/b is the largest n with n*b <= a
 *     if b < 0 then a/b is the largest n with n*b >= a
 *
 * Both of those come out as `floor(a/b)`. Worth being careful deriving the second one:
 * with `b < 0`, `n*b >= a` means `n <= a/b`, so the largest such `n` is `floor(a/b)` — not
 * `ceil`, which is the reading that looks right and gives `13 / -5 = -2`, contradicting the
 * table directly below it. The table settles it: `13/-5=-3`, and `-3` is the floor.
 *
 * ## Why integer arithmetic rather than `Math.floor(a / b)`
 *
 * It works out exact either way, which took a page of arithmetic to establish and is worth
 * writing down rather than asserting: a wrong floor needs the true quotient to sit `k/b`
 * below an integer `n` with that gap smaller than the double's rounding error, so
 * `k/b < (a/b)·2⁻⁵²`, or `k < a·2⁻⁵²`. With `|a| < 2³¹` the right-hand side is under
 * `4.8e-7` and `k ≥ 1`, so it cannot happen. An earlier draft of this file claimed the
 * floating-point form was inexact for 32-bit operands; it is not, and the claim is recorded
 * here so nobody re-derives it badly.
 *
 * The integer path is kept anyway, for two smaller reasons: `Math.floor(a / b)` makes a
 * reader stop and re-derive the paragraph above, and `(a / b) | 0` cannot silently pass a
 * non-integer where a `double` was meant to. Correctness here is not a close call; the
 * arithmetic is easy to get wrong and this way there is less of it to hold.
 *
 * ## Upstream disagrees, in one quadrant, and the man page wins
 *
 * `src/code.h`'s `divv` matches this file exactly — checked over every pair with `|a| <= 60`
 * and `1 <= |b| <= 15`, zero disagreements. `modd` does not: its fourth branch,
 * `a-(1+(a-1)/(-b))*b` for `a > 0, b < 0`, has the quotient's sign flipped relative to
 * `divv`, so `modd(13, -5)` is `28` there against `-2` here, and `modd(1, -15)` is `16`
 * against `-14`. That branch is wrong on upstream's own terms, not just against the man
 * page: `code.h`'s comment above both functions promises `b < modd(a,b) <= 0` when `b < 0`,
 * and `28` is not in `(-5, 0]`.
 *
 * So this implements the documentation, and `divmod.test.ts` pins the disputed quadrant
 * explicitly with upstream's value beside ours, so that a future reader who notices the
 * difference does not "fix" it back towards the bug.
 *
 * Observable or not in the corpus is a separate question, and the honest answer is that it
 * has not been shown either way: 226 lines across the 83 vendored levels use `%`, every
 * divisor observed is a positive literal or a loop counter, and no level divides by a
 * negative literal. A counter that could go negative is not excluded by reading the source.
 * The runtime does not exist yet, so nobody has watched it.
 */

/** Thrown for a zero divisor. Upstream throws `Fehler("Division by zero")` here. */
export class DivisionByZero extends Error {
  constructor() {
    super("Cual: division by zero");
    this.name = "DivisionByZero";
  }
}

/**
 * `a / b` as Cual defines it: the quotient that floors, for either sign of `b`.
 *
 * Throws on a zero divisor rather than returning `NaN`. Upstream throws too, and a `NaN`
 * here would propagate into every comparison and end as a board that silently misbehaves;
 * a thrown error names the level's arithmetic as the problem, which is where the answer is.
 */
export function divv(a: number, b: number): number {
  if (b === 0) throw new DivisionByZero();
  // `|0` truncates toward zero, which is JavaScript's and C's behaviour - the opposite of
  // what Cual wants. The two differ exactly when there is a remainder and the operands have
  // different signs, so that is the only case to correct.
  const truncated = (a / b) | 0;
  const hasRemainder = a % b !== 0;
  const signsDiffer = a < 0 !== b < 0;
  // The `| 0` is also what keeps a `-0` from escaping. `Math.floor(0 / -97)` is `-0`, and
  // ToInt32 maps `-0` to `+0`, so `truncated` cannot be negative zero; and `truncated - 1`
  // is never `-0` either, being `-1` at most. An earlier draft normalised `quotient === 0`
  // explicitly, on the assumption that `-0` could arrive. It cannot, and the line was
  // dead code in a file whose whole argument is about not trusting the arithmetic.
  return hasRemainder && signsDiffer ? truncated - 1 : truncated;
}

/**
 * `a % b` as Cual defines it: the remainder that makes the division exact.
 *
 * Derived from {@link divv} rather than written out, because `a = divv(a,b)*b + modd(a,b)`
 * is the property both the man page and `code.h` state, and deriving it makes that property
 * true by construction instead of by four branches agreeing with each other.
 */
export function modd(a: number, b: number): number {
  return a - divv(a, b) * b;
}