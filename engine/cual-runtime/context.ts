// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Connecting Cual's evaluator to the game's one random source.
 *
 * Task 3.3, and the reason it is a separate file rather than a detail inside
 * `expr.ts`: `rnd(n)` and `a : b` are only meaningful if they draw from the *same*
 * sequence the simulation does. Two generators would each be reproducible on their own and
 * produce a game that could not be replayed, because the level's own randomness would be
 * invisible to the seed.
 *
 * Nothing else is decided here. The variable half of an {@link EvalContext} is a getter the
 * caller supplies, because where variables actually live — one `Int32Array` holding user
 * variables and busy flags — is task 3.7's business and there is no reason to guess at it.
 */

import type { RandomSource } from "../prng.ts";
import type { EvalContext } from "./expr.ts";

/**
 * An evaluation context whose randomness is the simulation's.
 *
 * `random` delegates to {@link RandomSource.int}, which `engine/prng.ts` already documents
 * as Cual's `rnd(n)`. Delegating rather than reimplementing is the point: the evaluator
 * cannot then drift from the simulation's notion of a draw.
 *
 * `variable` is a getter rather than a record so that the caller can supply the real store
 * later without this signature changing. A name that is not bound is a `CualError` — zero is
 * a legal value in Cual, so returning it for "unknown" would turn a typo in a level into a
 * level that quietly misbehaves.
 */
export function evalContext(
  random: RandomSource,
  variable: (name: string) => number,
): EvalContext {
  return {
    variable,
    random: (limit) => random.int(limit),
  };
}

/**
 * The same, for a fixed set of variables.
 *
 * For tests and for the period before task 3.7, where a `Map` is the whole of the variable
 * store. Reads of an unbound name throw, matching {@link evalContext}.
 */
export function evalContextWith(
  random: RandomSource,
  variables: Readonly<Record<string, number>>,
): EvalContext {
  return evalContext(random, (name) => {
    const value = variables[name];
    if (value === undefined) {
      throw new Error(`Cual: no variable named ${name}`);
    }
    return value;
  });
}
