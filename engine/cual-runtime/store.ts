/**
 * The per-blob variable store: one `Int32Array` holding user variables *and* busy flags.
 *
 * Task 3.7, and the reason the two live in one array rather than beside each other. A busy
 * flag is a *variable* upstream — `mBool1Nr` is a slot number, and `Blop::getBoolVariable`
 * reads it out of `mDaten` like any other — so it inherits the array's copy-on-write
 * snapshotting, its deferred-write queue, and its per-blob ownership for free. Two blobs of
 * the same kind get independent busy state because they have independent arrays, with no
 * per-blob node map anywhere.
 *
 * The other half of the file is the fourteen variables that precede every user variable.
 */

import { BITS_PER_SLOT, getBool, setBool } from "./slots.ts";

/** `blopart_ausserhalb` in `sorte.h`. "Off the board", so a piece nobody has placed yet. */
export const BLOBART_AUSSERHALB = -5;

/** `viertel_alle` in `bilddatei.h`. "All four quarters", i.e. unrotated. */
export const VIERTEL_ALLE = -1;

/** `spezvar_out_nichts` in `bildstapel.h`: a draw target that was never set. */
export const SPEZVAR_OUT_NICHTS = 0x7fff;

/**
 * How a slot's initial value is decided, from `DefaultArt` in `knoten.h`.
 *
 * The distinction matters, and it is not cosmetic. `Blop`'s constructor only copies a slot's
 * declared default when the kind is one of the three that carry a value:
 *
 *     switch (ld->mSorten[s]->getDefaultArt(i)) {
 *       case da_nie:
 *       case da_keinblob:   break;                     // stays 0
 *       case da_init:
 *       case da_kind:
 *       case da_event:      mDaten[i] = ...getDefault(i);
 *     }
 *
 * So `kind` and `version`, whose declared defaults are meaningful, are *not* initialised
 * from them — `Blop` sets both explicitly a few lines later, and reading the default instead
 * would make every fresh blob claim to be `blopart_ausserhalb` for one instruction too long.
 */
export type DefaultKind =
  /** A plain initial value. */
  | "init"
  /** A kind index rather than a number. */
  | "kind"
  /** Set by an event (draw, key, land) rather than by initialisation. */
  | "event"
  /** Never initialised: stays zero until written. */
  | "never"
  /** Not a blob's value at all; the slot exists so numbering lines up. */
  | "noBlob";

/**
 * `spezvar_namen`, `spezvar_default` and `spezvar_defaultart` from `knoten.cpp`, in slot
 * order. The index *is* the slot number, which is why the `#define`s in `blop.h` are
 * redundant with the order here — and why getting the order wrong silently mis-assigns
 * `file`, `pos`, `kind` and every `out`.
 *
 * Two entries have empty names and are not for Cual code: `kind_beim_letzten_draw_aufruf`
 * at slot 7 and `am_platzen` at slot 13. The second is exposed to Cual as the read-only
 * constant `exploding`.
 *
 * `falling_fast_speed`'s default is `gric`, the level's row count, which comes from
 * configuration rather than from a constant — so it is a parameter of
 * {@link BlobStore}, not a number in this table. Leaving it out would hard-code one
 * configured level's geometry into the runtime.
 */
export const SPECIAL_VARIABLES: readonly {
  readonly name: string;
  readonly defaultValue: number | ((rows: number) => number);
  readonly defaultKind: DefaultKind;
}[] = [
  { name: "file", defaultValue: 0, defaultKind: "event" },
  { name: "pos", defaultValue: 0, defaultKind: "event" },
  { name: "kind", defaultValue: BLOBART_AUSSERHALB, defaultKind: "noBlob" },
  { name: "version", defaultValue: 0, defaultKind: "noBlob" },
  { name: "qu", defaultValue: VIERTEL_ALLE, defaultKind: "event" },
  { name: "out1", defaultValue: SPEZVAR_OUT_NICHTS, defaultKind: "event" },
  { name: "out2", defaultValue: SPEZVAR_OUT_NICHTS, defaultKind: "event" },
  // `kind_beim_letzten_draw_aufruf`: not for the user.
  { name: "", defaultValue: BLOBART_AUSSERHALB, defaultKind: "init" },
  { name: "inhibit", defaultValue: 0, defaultKind: "init" },
  { name: "weight", defaultValue: 1, defaultKind: "init" },
  { name: "behaviour", defaultValue: 0, defaultKind: "never" },
  { name: "falling_speed", defaultValue: 6, defaultKind: "init" },
  { name: "falling_fast_speed", defaultValue: (rows) => rows, defaultKind: "init" },
  // `am_platzen`: Cual sees it only as the constant `exploding`.
  { name: "", defaultValue: 0, defaultKind: "init" },
];

/** `spezvar_anz`. The index of the first user variable. */
export const SPECIAL_VARIABLE_COUNT = SPECIAL_VARIABLES.length;

/**
 * The slot of a named special variable, or -1.
 *
 * Deliberately linear over a fourteen-entry table. A map would be tidier and would also
 * hide the fact that two of the entries have no name, which is the fact most worth seeing
 * when a slot's name comes back empty.
 */
export function specialVariableSlot(name: string): number {
  const found = SPECIAL_VARIABLES.findIndex((v) => v.name === name && name !== "");
  return found;
}

/**
 * One blob's variables: a single `Int32Array`, plus nothing.
 *
 * The class exists to give the array a name, the fourteen special slots their names, and the
 * bit-packing of busy flags a spelling — not to add behaviour. `Int32Array` already does the
 * wrapping, so `set` is a plain assignment where upstream's is an `int` too.
 *
 * Two stores for the same kind share no state at all. That is the point of the design and
 * the thing 3.7 asks to verify: `busySet(bit, true)` on one must not be visible from the
 * other, even though both run the same compiled tree and therefore use the same bit numbers.
 */
export class BlobStore {
  /** `Blop::mDaten`. */
  readonly data: Int32Array;

  /**
   * @param slotCount `DefKnoten::getDatenLaenge` — the length of `mDaten`.
   * @param rows the level's row count, for `falling_fast_speed`'s `gric` default.
   * @param defaults the declared defaults of the kind's *user* variables, by slot.
   */
  constructor(
    slotCount: number,
    rows: number,
    defaults?: readonly { readonly slot: number; readonly value: number }[],
  ) {
    this.data = new Int32Array(slotCount);
    this.reset(rows, defaults);
  }

  /**
   * `Blop`'s constructor: fill in the declared defaults.
   *
   * Called from the constructor rather than only there, because a blob that explodes and
   * respawns is re-initialised without being reallocated, and a fresh `Int32Array` per
   * respawn would defeat the point of reusing one.
   */
  reset(
    rows: number,
    defaults?: readonly { readonly slot: number; readonly value: number }[],
  ): void {
    this.data.fill(0);
    SPECIAL_VARIABLES.forEach((variable, slot) => {
      // `da_nie` and `da_keinblob` are the two that stay zero. See `DefaultKind`.
      if (variable.defaultKind === "never" || variable.defaultKind === "noBlob") return;
      this.data[slot] =
        typeof variable.defaultValue === "function"
          ? variable.defaultValue(rows)
          : variable.defaultValue;
    });
    for (const entry of defaults ?? []) {
      if (entry.slot < SPECIAL_VARIABLE_COUNT) {
        throw new Error(
          `Cual: default for slot ${entry.slot} collides with a special variable`,
        );
      }
      this.data[entry.slot] = entry.value;
    }
  }

  /** `Blop::getVariable`. */
  get(slot: number): number {
    return this.data[slot];
  }

  /** `Blop::setVariable`. */
  set(slot: number, value: number): void {
    this.data[slot] = value;
  }

  /** `Blop::getBoolVariable`, over a bit number from {@link allocateSlots}. */
  busyGet(bit: number): boolean {
    return getBool(this.data[Math.floor(bit / BITS_PER_SLOT)], bit);
  }

  /** `Blop::setBoolVariable`. */
  busySet(bit: number, on: boolean): void {
    const slot = Math.floor(bit / BITS_PER_SLOT);
    this.data[slot] = setBool(this.data[slot], bit, on);
  }

  /** Read a named special variable. Throws for a name that is not one. */
  getSpecial(name: string): number {
    const slot = specialVariableSlot(name);
    if (slot < 0) throw new Error(`Cual: no special variable named '${name}'`);
    return this.data[slot];
  }

  /** Write a named special variable, which `Blop` does for `kind` and `version`. */
  setSpecial(name: string, value: number): void {
    const slot = specialVariableSlot(name);
    if (slot < 0) throw new Error(`Cual: no special variable named '${name}'`);
    this.data[slot] = value;
  }

  /**
   * The shadow copy `Blop` keeps in `mDatenAlt`.
   *
   * Returned rather than stored: 3.8 owns when the copy is made and refreshed, and a store
   * that owned the timing would have it wrong before 3.8 exists. See `docs/cual.6` for the
   * six `@`-assignment examples this has to reproduce.
   */
  snapshot(): Int32Array {
    return this.data.slice();
  }

  /** Whether `bit` names a bit inside this array at all. */
  static hasBit(bit: number, slotCount: number): boolean {
    return bit >= 0 && bit < slotCount * BITS_PER_SLOT;
  }
}
