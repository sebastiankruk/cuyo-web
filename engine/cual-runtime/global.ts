// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The global blob and the per-player semiglobal: what runs, when, and what cannot see what.
 *
 * Task 4.11. There is exactly one `animiere()` in the whole program that decides the order of a
 * step, and it is four lines long:
 *
 *     void animiere() {
 *       Blop::beginGleichzeitig();
 *       /* Alle Grafiken loeschen *\/
 *       Blop::lazyLeereStapel();
 *       /* Erst mal das globale Blop ausfuehren. *\/
 *       ld->spielSchritt();
 *       /* Die eigentliche Animation *\/
 *       for (int i = 0; i < mSpielerZahl; i++)
 *         mSpielfeld[i]->animiere();
 *       Blop::endGleichzeitig();
 *     }
 *
 * ## The whole step is *one* window
 *
 * That is the fact that matters, and it is easy to miss while looking at the ordering. One
 * `beginGleichzeitig()` at the top and one `endGleichzeitig()` at the bottom means every
 * `@`-read in the entire step sees the values from the start of the step — including the reads
 * in the semiglobal, which runs *last*. So the global blob running first does **not** let a
 * board blob observe what it wrote; both see the same beginning-of-step world. Ordering within
 * a step decides what *writes* land when, and nothing else.
 *
 * ## The global blob is created with an owner, on purpose
 *
 *     void LevelDaten::startLevel() const {
 *       Blop::gGlobalBlop = Blop(blopart_global);
 *       // Damit Code ausgefuehrt werden darf:
 *       Blop::gGlobalBlop.setBesitzer(0, ort_absolut(absort_global));
 *     }
 *
 * "So that code is allowed to run" — the comment is on the `setBesitzer` line, and it is the
 * reason a freshly constructed global blob is inert. `Spielfeld`'s constructor does the same
 * for its semiglobal, with the side as the argument: `mSemiglobal.setBesitzer(0,
 * ort_absolut(absort_semiglobal, re))`. So both are ownerless until level start, which is when
 * they become runnable.
 */

/** Something `Blop::animiere` can be called on. */
export interface Animatable {
  /** For the order log and for error messages. */
  readonly name: string;
  /**
   * `Blop::animiere`, which `CASSERT`s that it is called inside a window and with no event
   * pending. Implementations should not need to check either: `runStep` guarantees both.
   */
  animate(): void;
}

/** One player's field, in the order `Spielfeld::animiere` visits it. */
export interface Field {
  /** `mRechterSpieler`. Decides which cell `@(x,y)` addresses. */
  readonly right: boolean;
  /** `mDaten.animiere()` — `for x { for y { mDaten[x][y].animiere(); } }`, so x-major. */
  readonly board: readonly Animatable[];
  /** `mFall->animiere()`. */
  readonly falling: readonly Animatable[];
  /** `mNaechsterFall->animiere()` — the pieces not in play yet. */
  readonly nextFalling: readonly Animatable[];
  /** `mInfoBlops`, of which only the *active* ones animate. */
  readonly infoBlops: readonly { readonly blob: Animatable; readonly active: boolean }[];
  /** `mSemiglobal`: one per field, never shared. */
  readonly semiglobal: Animatable;
}

/** What a step did, in the order it did it. */
export interface StepOrder {
  /** Every `animiere()` call, by name. */
  readonly animated: readonly string[];
}

/** What `runStep` needs beyond the blobs themselves. */
export interface StepOptions {
  /** `Blop::lazyLeereStapel()`: clears *every* picture stack, before anything animates. */
  clearPictureStacks(): void;
  /**
   * `Blop::beginGleichzeitig()` / `endGleichzeitig()`, as a bracket around the whole step.
   *
   * Two functions rather than one flag, because the window is not a boolean: it owns the
   * deferred-write queue, and the order in which the queue is applied is the order in which
   * `@` reads stop seeing the beginning of the step.
   */
  openWindow(): void;
  closeWindow(): void;
}

/**
 * One step, in upstream's order.
 *
 * The order is the claim, so it is recorded rather than inferred: `global` first, then each
 * field's board, falling pieces, next falling pieces, *active* info blobs and semiglobal — with
 * the whole thing inside one window and the picture stacks cleared before any of it.
 */
export function runStep(
  global: Animatable,
  fields: readonly Field[],
  options: StepOptions,
): StepOrder {
  const animated: string[] = [];
  options.openWindow();
  try {
    options.clearPictureStacks();
    // "Erst mal das globale Blop ausfuehren." — one blob, shared by every player.
    global.animate();
    animated.push(global.name);
    for (const field of fields) {
      for (const blob of field.board) {
        blob.animate();
        animated.push(blob.name);
      }
      for (const blob of field.falling) {
        blob.animate();
        animated.push(blob.name);
      }
      for (const blob of field.nextFalling) {
        blob.animate();
        animated.push(blob.name);
      }
      // `for (int i = 0; i < infoblop_anz; i++) if (mInfoBlopActive[i]) mInfoBlops[i].animiere();`
      // — an inactive info blob exists and is skipped, which is not the same as not existing.
      for (const entry of field.infoBlops) {
        if (!entry.active) continue;
        entry.blob.animate();
        animated.push(entry.blob.name);
      }
      // `mSemiglobal.animiere();` — last in its own field.
      field.semiglobal.animate();
      animated.push(field.semiglobal.name);
    }
  } finally {
    // `endGleichzeitig()` in the same place whatever happened, so a throw mid-step still
    // applies or discards the queue the way upstream's would.
    options.closeWindow();
  }
  return { animated };
}

/** `Blop::gGlobalBlop`: one per program, created fresh at every level start. */
export function createGlobalBlob(make: (kind: number) => Animatable): Animatable {
  // `Blop::gGlobalBlop = Blop(blopart_global);` then `setBesitzer(0, absort_global)`. Both
  // halves matter: without the owner the blob cannot run code at all, which is why
  // `startLevel` and not the constructor is where it happens.
  return make(BLOPART_GLOBAL);
}

/** `blopart_global` (-2). */
export const BLOPART_GLOBAL = -2;
/** `blopart_semiglobal` (-3). */
export const BLOPART_SEMIGLOBAL = -3;

/**
 * `Spielfeld`'s semiglobal, one per field.
 *
 * Deliberately one per field and never a parameter: `@@` means "this player's semiglobal", and
 * two players' semiglobals holding the same variables would make a level's win condition
 * depend on turn order.
 */
export function createSemiglobal(
  right: boolean,
  make: (kind: number, right: boolean) => Animatable,
): Animatable {
  // The side is not decoration: `@@(x,y;>)` and `@@(x,y;<)` address a semiglobal by it, so a
  // blob that did not know its own side could not be found. It is passed to `make` rather than
  // dropped.
  return make(BLOPART_SEMIGLOBAL, right);
}