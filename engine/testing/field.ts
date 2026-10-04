/**
 * The hand-built `AccessField` the runtime's addressed access is verified against.
 *
 * Task 15.4 moved this out of `access.test.ts` so the live-board adapter can be compared with
 * *the same* hand-built field rather than with a second transcription of it. The claim being
 * defended is "the answers a real board gives are the answers the hand-built field gives", and
 * a comparison against a hand-built field written separately for the comparison would be a
 * comparison against a third implementation of a rule 4.7 already pinned.
 *
 * **Why the kind is not set from `cells`.** `access.test.ts` uses the record's values as
 * presence markers only — every call site writes `1` — and the tests that care about a kind
 * write it afterwards through the store `at` hands back. Preserving that is why this helper
 * does not derive a kind from the value: changing it would alter a file whose job is to stay
 * as it was, for the benefit of a test that did not exist when it was written. A caller that
 * wants kinds writes them, which is also how a caller learns that the store it holds is the
 * one that matters.
 *
 * **The singletons' kinds are upstream's**, where this used to write 99 and 100 as sentinels.
 * Nothing in `access.test.ts` reads them, so no assertion there moved; it is 15.4's
 * differential comparison that needs them, and it needs them because `@()` and `@@()` are two
 * of the addresses it compares and a field whose global blob claims to be kind 99 cannot be
 * compared with a real one whose global blob is `blopart_global`.
 */

import type { AccessField, Here } from "../cual-runtime/access.ts";
import { BlobStore, SPECIAL_VARIABLES, TimeSlices } from "../cual-runtime/store.ts";
import { BLOPART_GLOBAL, BLOPART_SEMIGLOBAL } from "../cual-runtime/global.ts";

/** `spezvar_kind`, whose *shadow* is what `verbindetMit` compares. */
export const KIND_SLOT = SPECIAL_VARIABLES.findIndex((v) => v.name === "kind");

/** A hand-built field, plus the stores behind it so a test can write to them. */
export interface HandBuiltField extends AccessField {
  /** One store per addressable cell and per singleton, by the key used below. */
  readonly stores: Map<string, BlobStore>;
  /** The counter those stores share. */
  readonly slices: TimeSlices;
}

/** How a hand-built field differs from the 4x4 single-player default. */
export interface HandBuiltOptions {
  readonly players?: number;
  readonly hex?: boolean;
  readonly mirrored?: boolean;
  /** `getHexShift`, in the default single-player geometry where only `x` matters. */
  readonly hexShift?: (right: boolean, x: number) => boolean;
  readonly width?: number;
  readonly height?: number;
  readonly fallCount?: number;
}

/**
 * A field with one store per cell named in `cells`, the global blob, and one semiglobal per
 * player.
 *
 * `cells` is keyed `"right,x,y"`. A key that is absent is a cell that does not exist, which is
 * what `access.ts` treats as an unreachable target — so this models a board where not every
 * cell is filled, which is what the real one is between levels and after an explosion.
 */
export function handBuiltField(
  here: Here,
  cells: Record<string, number> = {},
  options: HandBuiltOptions = {},
): HandBuiltField {
  const slices = new TimeSlices();
  const stores = new Map<string, BlobStore>();
  const players = options.players ?? 1;
  const width = options.width ?? 4;
  const height = options.height ?? 4;
  const make = (key: string): BlobStore => {
    let store = stores.get(key);
    if (!store) {
      // 20 slots and 13 rows: enough for the special variables and a couple of user ones,
      // which is all `access.test.ts`'s questions need and this helper promises no more.
      store = new BlobStore(20, 13, slices);
      stores.set(key, store);
    }
    return store;
  };
  const global = make("global");
  const semiglobals = [make("semi:false"), make("semi:true")];
  for (let i = 0; i < players; i += 1) semiglobals[i].set(KIND_SLOT, BLOPART_SEMIGLOBAL);
  global.set(KIND_SLOT, BLOPART_GLOBAL);

  return {
    players,
    width,
    height,
    hex: options.hex ?? false,
    mirrored: options.mirrored ?? false,
    hexShift: options.hexShift ?? (() => false),
    global,
    fallCount: options.fallCount ?? 0,
    here,
    semiglobal: (right) => (right && players < 2 ? null : semiglobals[right ? 1 : 0]),
    at(right, x, y) {
      if (right && players < 2) return null;
      if (x < 0 || x >= width || y < 0 || y >= height) return null;
      const key = `${right},${x},${y}`;
      if (!(key in cells)) return null;
      return make(key);
    },
    stores,
    slices,
  };
}

/**
 * Open a step on a hand-built field's slice, so a store's shadow is refreshed.
 *
 * A method on the field rather than a free function over the stores map, because the map is
 * private to callers that do not care and the counter is the thing every caller needs.
 */
export function openSlice(field: HandBuiltField): void {
  field.slices.open();
}