// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The five effects — `bonus`, `message`, `explode`, `lose`, `sound` — and who each one reaches.
 *
 * Task 4.12. All five are one-liners in `Code::eval`, and the interesting part is that they do
 * **not** agree with each other about who they act on:
 *
 *     case bonus_code:    b.bekommPunkte(mF1->eval(b)); break;
 *     case message_code:  b.zeigMessage(mString);       break;
 *     case explode_code:  if (b.getSpezConst(spezconst_falling)) { /* debug warning *\/ }
 *                         else b.lassPlatzen();        break;
 *     case sound_code:    b.playSample(mZahl);          break;
 *     case verlier_code:  Cuyo::spielerTot();           break;
 *
 * ## "Reaches the correct player" means four different things
 *
 * | effect | acts on | in the global blob | in a falling blob |
 * |---|---|---|---|
 * | `bonus(n)` | `mOrt.rechts` — the **asking blob's** side | **throws** | normal |
 * | `message(s)` | `mOrt.rechts` — the asking blob's side | **throws** | normal |
 * | `explode` | the blob itself | normal | **does nothing**, with a debug warning |
 * | `sound(s)` | `mOrt` — a sample set chosen by position, panned by column | its own `so_global` | `so_lsemi`/`so_rsemi`, unpanned |
 * | `lose` | the **whole game**, not a player | normal | normal |
 *
 * Three consequences a level depends on, and each is easy to get wrong by symmetry:
 *
 * - **`bonus` scores for the blob's own side, whatever the address says.** `mOrt.rechts` is the
 *   asking blob's position, not the target of any `@`. So a blob that writes to the other
 *   player's field and then calls `bonus` still scores for itself.
 * - **`lose` is not per-player.** `Cuyo::spielerTot()` sets one `mGModus` for the program; there
 *   is no `rechts` argument and no way for a level to end only one player's game.
 * - **`explode` in a falling blob is silently a no-op.** Upstream prints a warning under `gDebug`
 *   and does nothing. Refusing it instead would break a level that calls `explode` from a
 *   `land` handler, which is a real shape: the blob is no longer falling by then, so the same
 *   call does work — but a blob that is *still* falling when it runs does nothing.
 *
 * ## `sound`'s argument is resolved when the level is parsed
 *
 *     | SOUND_TOK '(' punktwort ')' { $$ = newCode1(sound_code, Sound::ladSample(*$3)); }
 *
 * `Sound::ladSample` runs **in the grammar action**, so an unknown sample name is a load-time
 * error and never becomes a runtime one. `message` takes the name as a string for the same
 * reason — it is not looked up at all. Neither takes an expression: `bonus(n)` is the only one
 * of the three that does.
 */

import type { ResolvedOrt } from "./access.ts";

/** The effects, in the order `Code::eval`'s switch lists them. */
export const EFFECTS = ["bonus", "message", "explode", "sound", "lose"] as const;

/** An effect's name. */
export type EffectKind = (typeof EFFECTS)[number];

/** `Sound::so_*`: the sample set a position plays from. */
export type SampleSet = "lfield" | "rfield" | "lsemi" | "rsemi" | "global";

/** What a `sound` play turned into. */
export interface PlayedSample {
  readonly sample: number;
  readonly set: SampleSet;
  /** `Sound::playSample(nr, set, pos, breite)` — stereo panning. */
  readonly position: number;
  readonly width: number;
}

/** What an effect did, or refused to do. */
export interface EffectResult {
  readonly effect: EffectKind;
  /** `false` when the effect was a no-op, which upstream allows for exactly one case. */
  readonly applied: boolean;
  /**
   * Why it was not applied, when it was not.
   *
   * `'falling'` is upstream's silent no-op; the others are the two throws.
   */
  readonly refused?: "falling" | "global";
  /** Points, for `bonus`. */
  readonly points?: number;
  /** The message text, for `message`. */
  readonly text?: string;
  /** What was played, for `sound`. */
  readonly played?: PlayedSample;
}

/** What an effect needs in order to act. */
export interface EffectContext {
  /** The asking blob's own position — never the target of an address. */
  readonly here: ResolvedOrt;
  /** `getSpezConst(spezconst_falling)`. */
  readonly falling: boolean;
  /** The grid's width, for `sound`'s panning: `2*x+1` out of `2*grx`. */
  readonly gridWidth: number;
  /** `Cuyo::neuePunkte(rechts, pt)`. */
  addPoints(right: boolean, points: number): void;
  /** `getSpielfeld(rechts)->setMessage(mess)`. */
  setMessage(right: boolean, text: string): void;
  /** `Blop::lassPlatzen()`. */
  pop(): void;
  /** `Sound::playSample`. */
  playSample(sample: PlayedSample): void;
  /** `Cuyo::spielerTot()`. */
  playerLost(): void;
}

/**
 * `ort_absolut::playSample`'s routing.
 *
 * The panning column is the asymmetry: a field blob is placed at `2*x+1` in a field `2*grx`
 * wide, so the leftmost column is hard left and the rightmost hard right, while an info blob is
 * hard left or hard right and everything else is centred. `absort_nirgends` throws upstream —
 * *"illegal ort for ort_absolut::playSample"* — which is the only place in these five effects
 * where a wrong position is an internal error rather than a `Fehler` the level caused.
 */
export function routeSample(here: ResolvedOrt, sample: number, gridWidth: number): PlayedSample {
  const field = (right: boolean, position: number, width: number): PlayedSample => ({
    sample,
    set: right ? "rfield" : "lfield",
    position,
    width,
  });
  switch (here.kind) {
    case "cell":
      return field(here.right, 2 * here.x + 1, 2 * gridWidth);
    case "semiglobal":
      return { sample, set: here.right ? "rsemi" : "lsemi", position: 0, width: 0 };
    case "global":
      return { sample, set: "global", position: 0, width: 0 };
    case "fall":
      return { sample, set: here.right ? "rsemi" : "lsemi", position: 0, width: 0 };
    default:
      throw new Error("Cual: illegal position for a sound effect");
  }
}

/**
 * Run one effect.
 *
 * The order of the checks is upstream's order and it matters in one place: `bonus` and `message`
 * test `getArt() == blopart_global` **before** they look at anything else, so a `bonus` in the
 * global blob is an error even if the argument would have been harmless.
 */
export function applyEffect(
  effect: EffectKind,
  argument: { readonly value?: number; readonly name?: string; readonly sample?: number } | null,
  ctx: EffectContext,
): EffectResult {
  switch (effect) {
    case "bonus": {
      if (ctx.here.kind === "global") {
        throw new Error("Cual: bonus() does not work in the global blob");
      }
      if (ctx.here.kind !== "cell" && ctx.here.kind !== "fall" && ctx.here.kind !== "semiglobal") {
        throw new Error("Cual: bonus() has no player to score for");
      }
      const points = argument?.value ?? 0;
      ctx.addPoints(ctx.here.right, points);
      return { effect, applied: true, points };
    }
    case "message": {
      if (ctx.here.kind === "global") {
        throw new Error("Cual: message() does not work in the global blob");
      }
      if (ctx.here.kind !== "cell" && ctx.here.kind !== "fall" && ctx.here.kind !== "semiglobal") {
        throw new Error("Cual: message() has no player to show it to");
      }
      const text = argument?.name ?? "";
      ctx.setMessage(ctx.here.right, text);
      return { effect, applied: true, text };
    }
    case "explode": {
      // `if (b.getSpezConst(spezconst_falling)) { if (gDebug) print_to_stderr("Warning: Can't
      // use 'explode' in falling blob.\n"); } else b.lassPlatzen();`
      if (ctx.falling) return { effect, applied: false, refused: "falling" };
      ctx.pop();
      return { effect, applied: true };
    }
    case "sound": {
      const played = routeSample(ctx.here, argument?.sample ?? 0, ctx.gridWidth);
      ctx.playSample(played);
      return { effect, applied: true, played };
    }
    case "lose": {
      // `Cuyo::spielerTot()` — one `mGModus` for the program, no side argument.
      ctx.playerLost();
      return { effect, applied: true };
    }
    default: {
      const impossible: never = effect;
      throw new Error(`Cual: unknown effect '${String(impossible)}'`);
    }
  }
}
