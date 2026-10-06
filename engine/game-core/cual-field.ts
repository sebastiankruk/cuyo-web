// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The live board, as Cual's addressed access sees it.
 *
 * Task 15.4, and the first thing the game has ever asked of `AccessField`. Groups 2 and 3
 * built the reader and the runtime and the two were never joined: every `AccessField` that
 * existed was a hand-built one in a test, describing a `Map` of stores with no board behind
 * it. So the six `.ld` spellings of `@` and `@@` were verified and nothing could use them.
 *
 * This is the adapter. It answers ten questions about one blob and hands the answers to
 * `access.ts`, which is unchanged — deliberately, because `access.ts` is already verified
 * against a hand-built field by 4.7 and 4.16, and the only thing that can still be wrong is
 * whether the answers are the right ones.
 *
 * ## The three decisions that are not mechanical
 *
 * **`height` is `GRY`, and in upstream it is sometimes `GRY + 1`.** `BlopGitter::getGrY()`
 * returns `gry + 1` when `mRueberReihe` is set, and `mRueberReihe` is the *Rüberreihe*: the
 * row a player hands to the other one. `Spielfeld::bekommVielleichtReihe` asks the other
 * player for one (`Cuyo::bitteUmReihe` is `mSpielfeld[!reSp]->bitteUmReihe(h)`, an index into
 * a second field), so the row can only exist with two players. Two-player is a non-goal, so
 * `getGrY() === gry` here and the answer is the constant rather than a flag.
 *
 * **There is no hex edge row either, and that is the same mechanism.** `getFeld(x, y)`
 * returns `mHexExtra[x]` for `y >= getGrY()`, and `koordMalOK` allows `y < getGrY() + 1`, so
 * upstream can address a row one past the board and get a real blob. This `Board` has no such
 * row, so `at` answers null at `y = GRY` where upstream would answer the edge blob. Nothing
 * in the corpus addresses a literal row 20, and a level's `hex` code addressing one is the
 * shape that would find it — which is recorded rather than asserted, because the port has no
 * way to *be* right here and inventing the row would be the larger change.
 *
 * **`at` applies `rechts_ok` itself, not only `isReachable`.** Upstream's `absort_feld`
 * validity is `rechts_ok(rechts) && koordOK(x, y)` and `finde()` is `getFeld(x, y)` — which
 * `CASSERT`s `koordMalOK`. So a right-hand address in a one-player game is refused before the
 * field is ever indexed, and answering the *left* field's blob for it would be a read
 * upstream cannot perform. `isReachable` checks `rechts_ok` too; doing it twice is not
 * redundant, because `at` is reachable directly.
 *
 * **`at` also range-checks the coordinates itself, and with the live board that check is
 * never the one that refuses.** `Board.at` is `inBounds(x, y) ? cells[…] : null`, so
 * dropping the bounds from this file leaves every answer unchanged — which is a real property
 * of the current code and is stated rather than presented as a guard that is doing work.
 * Upstream checks the same two things in two places (`korrekt` in the caller, `CASSERT` in
 * `finde`), so keeping both is the faithful arrangement; the test that reaches this one
 * deliberately supplies a host whose board does *not* bound-check, because otherwise the guard
 * would be unreachable and untested.
 */

import { GRX, GRY, columnShift, hexGeometry } from "./constants.ts";
import { Board } from "./board.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import type { AccessField, Here } from "../cual-runtime/access.ts";
import type { BlobStore } from "../cual-runtime/store.ts";

/**
 * What an `AccessField` is built from: the board, the level, and the two blobs that are not
 * on it.
 *
 * An interface rather than a `Simulation` so the adapter does not depend on the whole
 * simulation — `Simulation` holds the step machine, the mode transitions and the fall, and
 * none of those decide what `@(2,3)` means. What it does hold is what upstream splits across
 * `LevelDaten` (the level, the global blob) and `Spielfeld` (the board, the semiglobal, the
 * fall's blob count), which is why one interface here covers three C++ objects.
 */
export interface CualFieldHost {
  readonly level: LevelDef;
  readonly board: Board;
  /** `Blop::gGlobalBlop`, which every player's code shares. */
  readonly global: BlobStore;
  /** `Spielfeld::mSemiglobal` for a side, or null when that side has no field. */
  semiglobal(right: boolean): BlobStore | null;
  /** `Cuyo::getSpielerZahl()`. One, so the right-hand field does not exist. */
  readonly players: number;
  /** `Spielfeld::getFallAnz()`. 0, 1 or 2, and it changes within a step. */
  fallCount(): number;
}

/**
 * The field one asking blob sees.
 *
 * A function taking `here` rather than a class with a settable `here`, because "where the
 * asking blob is" is a per-question fact: the same store is `here` for one blob and a target
 * for the next, and a mutable field would let a deferred read see the wrong one.
 *
 * @param host the board and the two blobs that are not on it
 * @param here where the asking blob is, which decides what an address may resolve to
 */
export function accessFieldFor(host: CualFieldHost, here: Here): AccessField {
  // Resolved once per field rather than per question. `columnShift` is cheap but not free, and
  // a step asks `hexShift` twice per blob — once for the address, once for the neighbour read.
  const hex = hexGeometry(host.level.neighbours, host.level.hexFlip);
  const fieldIsThere = (right: boolean): boolean => !right || host.players > 1;

  return {
    players: host.players,
    width: GRX,
    height: GRY,
    // `ld->mSechseck`, which `LevelDaten::ladLevel` decides from the level-wide `neighbours`
    // alone — so a *kind* in a hex mode does not make the board hex. That is the separation
    // `HexGeometry` exists for and this is where it is used.
    hex: hex.enabled,
    // `ld->mSpiegeln`.
    mirrored: host.level.mirror,
    // `ld->getHexShift(rechts, x)`, on the *from* column: `x & 1` compared against bit 0 of
    // `hexflip` for the left field and bit 1 for the right. `columnShift` is that function,
    // transcribed in `constants.ts` and checked against `constants.test.ts`'s four `hexflip`
    // values; this only supplies the geometry it reads.
    hexShift: (right, x) => columnShift(hex, right, x),
    global: host.global,
    semiglobal: (right) => (fieldIsThere(right) ? host.semiglobal(right) : null),
    at(right, x, y) {
      if (!fieldIsThere(right)) return null;
      if (x < 0 || x >= GRX || y < 0 || y >= GRY) return null;
      // `getFeld(x, y)`'s `mDaten[x][y]`, and the **blob's own** store — the one the
      // simulation writes to, so `getAlt` reads the same beginning-of-step shadow every
      // other blob sees. A copy would be a second `mDaten`, which is the one thing a blob
      // never has.
      //
      // The bounds above duplicate `Board.at`'s own. See the header: upstream checks in two
      // places as well, and this is the one that keeps the answer right if the board behind
      // `at` ever stops being a fixed grid.
      const blob = host.board.at(x, y);
      return blob === null ? null : blob.store;
    },
    // Read at construction rather than stored, because the count is a property of *now*:
    // `storeAt` and `isReachable` each want the current answer, and a value captured when the
    // field was built would be the count from whenever that was.
    fallCount: host.fallCount(),
    here,
  };
}
