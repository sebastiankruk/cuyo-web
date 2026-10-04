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
import { divv, modd } from "./divmod.ts";
import type { AssignOperator, Stmt } from "./code.ts";
import { BLOPART_MIN_CUAL } from "./const-tables.ts";

/**
 * The simulation's time-slice counter: `Blop::gAktuelleZeitNummerDatenAlt`.
 *
 * A "slice" is one `beginGleichzeitig()` … `endGleichzeitig()` window. The step itself is
 * one slice, and so is each of the draw, key and land events - which is why a `@` read
 * during a draw does not see what a `@` read during the step saw, even though both are
 * "this frame".
 *
 * Not a module-level mutable global, though upstream's is a `static` on `Blop`. Injected
 * rather than imported because a global counter is untestable in the way that matters here:
 * every test would have to leave it in a known state, and one that forgot would produce a
 * passing suite and a wrong store.
 */
export class TimeSlices {
  #current = 0;

  /** `Blop::gZZ`: the deferred writes for this window. */
  #queue: DeferredWrite[] = [];

  /** `Blop::gGleichZeit`. */
  #open = false;

  /** `gAktuelleZeitNummerDatenAlt`. */
  get current(): number {
    return this.#current;
  }

  /**
   * `Blop::beginGleichzeitig`: open a new slice and return its number.
   *
   * Upstream increments here and clears the deferred-write queue in the same breath; the
   * queue is task 3.9 and `close` is where it gets applied.
   */
  open(): number {
    this.#current += 1;
    this.#queue.length = 0;
    this.#open = true;
    return this.#current;
  }

  /**
   * `Blop::endGleichzeitig`: apply every queued write, in the order they were queued.
   *
   * Applied through {@link BlobStore.setInternal}, which does not preserve - by now the slice
   * is over, and a preserve would replace the beginning-of-slice values the *next* slice's
   * `@` reads are measured against.
   *
   * The queue is **not** emptied here. Upstream clears it in `beginGleichzeitig`
   * (`gZZAnz = 0`) and leaves `gZZAnz` alone in `endGleichzeitig`, so {@link pending} still
   * counts the entries after a close. Faithful rather than tidy: an emptied queue would make
   * `pending` mean "writes this slice" where upstream means "writes not yet superseded".
   */
  close(): void {
    if (!this.#open) throw new Error("Cual: endGleichzeitig without beginGleichzeitig");
    for (const write of this.#queue) applyOperation(write);
    this.#open = false;
  }

  /**
   * `Blop::abbruchGleichzeitig`: abandon the window.
   *
   * Called from the constructor of upstream's error type, so an exception mid-step discards
   * the queue rather than applying half of it. Without this a failed step would still apply
   * whatever had been queued before the failure, which is the one outcome worse than not
   * applying the queue at all.
   */
  abort(): void {
    this.#queue.length = 0;
    this.#open = false;
  }

  /**
   * `Blop::setVariableZukunft`: queue a write for the end of the window.
   *
   * `value` is the **right-hand side, already evaluated**. Cual computes it instantaneously
   * even when the write itself is deferred - `cual.6` says so in as many words - which is
   * what makes statements 5 and 6 of the six examples differ from each other.
   */
  defer(blob: BlobStore, slot: number, value: number, operation: AssignOperator): void {
    if (!this.#open) throw new Error("Cual: setVariableZukunft outside a Gleichzeitig window");
    this.#queue.push({ blob, slot, value, operation });
  }

  /** `gZZAnz`. Counts entries not yet superseded by the next `open`. */
  get pending(): number {
    return this.#queue.length;
  }

  /** Whether a window is open, i.e. `gGleichZeit`. */
  get isOpen(): boolean {
    return this.#open;
  }
}

/** One queued write: `Blop::tZZ`. */
interface DeferredWrite {
  readonly blob: BlobStore;
  readonly slot: number;
  readonly value: number;
  readonly operation: AssignOperator;
}

/**
 * `Blop::setVariableIntern`'s switch over the operation.
 *
 * `add` and friends read the **live** value, not the shadow. That is what makes statement 2
 * of the six examples come out as "one more than the value of X just before the change": the
 * `+=` is applied at the end of the step to whatever X is then.
 *
 * Not transcribed, and deliberately so: the range check on `spezvar_kind` and the
 * `setKindIntern` call that follows a change of kind. Both live in `setVariableIntern` too,
 * and implementing the check without the cache invalidation would leave a kind write that
 * validates and then does nothing.
 */
function applyOperation(write: DeferredWrite): void {
  const { blob, slot, value, operation } = write;
  const current = blob.get(slot);
  switch (operation) {
    case "=":
      blob.setInternal(slot, value);
      return;
    case "+=":
      blob.setInternal(slot, current + value);
      return;
    case "-=":
      blob.setInternal(slot, current - value);
      return;
    case "*=":
      blob.setInternal(slot, current * value);
      return;
    case "/=":
      blob.setInternal(slot, divv(current, value));
      return;
    case "%=":
      blob.setInternal(slot, modd(current, value));
      return;
    case ".+=":
      blob.setInternal(slot, current | value);
      return;
    case ".-=":
      // `& (-1 - wert)`, as upstream writes it: the complement of the mask.
      blob.setInternal(slot, current & ~value);
      return;
    default: {
      const impossible: never = operation;
      throw new Error(`Cual: unknown assignment operator '${String(impossible)}'`);
    }
  }
}

/** `blopart_ausserhalb` in `sorte.h`. "Off the board", so a piece nobody has placed yet. */
export const BLOBART_AUSSERHALB = -5;

/**
 * `blopart_keins`: the empty kind, and the only negative number a level may assign.
 *
 * `sorte.h:84`, and the whole block around it is the shape of upstream's numbering:
 * `blopart_keins (-1)`, `blopart_global (-2)`, `blopart_semiglobal (-3)`,
 * `blopart_info (-4)`, `blopart_min_sorte (-4)`, `blopart_ausserhalb (-5)`, and
 * `blopart_farbe/gras/grau (-6/-7/-8)` which are *role* markers rather than numbers. The comment
 * above them says "Die Nummern >= 0 sind die normalen Farbsorten" — numbers >= 0 are the normal
 * colour kinds — so everything at or below -1 is a sentinel and **none of them occupies a slot**.
 *
 * That is why registering the empty kind costs nothing: it is -1, not an appended number.
 *
 * `blopart_min_cual` is also -1, commented "Letzte Art, auf die man ein Blop von cual aus noch
 * setzen darf" — *the last kind a blob may be set to from Cual*. `baggis.ld`'s `kind = sbNix`
 * does exactly that, which is why an assignment rather than a comparison is the thing that needs
 * this to be a real number.
 */
export const BLOPART_LEER = -1;

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
 * The system variables, by name.
 *
 * A name-to-slot lookup rather than a switch, because the two unnamed slots have to stay
 * unnameable and a `findIndex` that skips them is the whole difficulty. `kind` and `version`
 * are here as well as the rest: they are `da_keinblob` so they are not *initialised* from
 * their defaults, but they are ordinary variables as far as Cual is concerned and levels read
 * `kind` constantly.
 */
export const SYSTEM_VARIABLE_SLOTS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    SPECIAL_VARIABLES.flatMap((variable, slot) => (variable.name === "" ? [] : [[variable.name, slot]])),
  ),
);

/** The five variables `initSchritt` resets, with the values it resets them to. */
export const PER_STEP_RESETS: readonly (readonly [number, number])[] = [
  // `mDaten[spezvar_file] = 0; mDaten[spezvar_pos] = 0; mDaten[spezvar_quarter] = viertel_alle;`
  [specialVariableSlot("file"), 0],
  [specialVariableSlot("pos"), 0],
  [specialVariableSlot("qu"), VIERTEL_ALLE],
  // `mDaten[spezvar_out1] = spezvar_out_nichts; mDaten[spezvar_out2] = ...;`
  [specialVariableSlot("out1"), SPEZVAR_OUT_NICHTS],
  [specialVariableSlot("out2"), SPEZVAR_OUT_NICHTS],
];

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
 * What a kind change needs to know, which the store cannot know on its own.
 *
 * The defaults are the new kind's *own* — a kind's variables are declared per kind, so this
 * is level data and belongs with the level.
 */
export interface KindChange {
  /** `ld->mAnzFarben`: the exclusive upper bound on a `kind`. */
  readonly colourCount: number;
  /**
   * The kind's `da_kind` slots — the ones `var x = 4 : reapply` declares.
   *
   * Not all of its defaults: `setKindIntern` re-applies `da_kind` and nothing else, so
   * `da_init` and `da_event` slots survive a kind change untouched.
   */
  kindDefaults(kind: number): readonly { readonly slot: number; readonly value: number }[];
  /** `getEventCode(event_draw)` for a kind, or null when it has none. */
  drawCodeOf(kind: number): readonly Stmt[] | null;
  /** `Code::busyReset` over a kind's draw code, used when a kind change interrupts it. */
  resetBusyOf(kind: number): void;
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

  /** The shared slice counter; see {@link TimeSlices}. */
  readonly #slices: TimeSlices;

  /** `Blop::mDatenAlt`, allocated on first use rather than up front. */
  #alt: Int32Array | null = null;

  /** `Blop::mZeitNummerDatenAlt`: the slice `#alt` was taken in, or -1 if never. */
  #altSlice = -1;

  /**
   * @param slotCount `DefKnoten::getDatenLaenge` — the length of `mDaten`.
   * @param rows the level's row count, for `falling_fast_speed`'s `gric` default.
   * @param defaults the declared defaults of the kind's *user* variables, by slot.
   */
  constructor(
    slotCount: number,
    rows: number,
    slices: TimeSlices,
    defaults?: readonly { readonly slot: number; readonly value: number }[],
  ) {
    this.data = new Int32Array(slotCount);
    this.#slices = slices;
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
    // A respawned blob has no history, so any shadow left from before the respawn would
    // report the dead blob's values as this slice's past.
    this.#alt = null;
    this.#altSlice = -1;
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

  /**
   * `Blop::initSchritt`: the per-step resets, before any of the blob's own code runs.
   *
   * `merkeAlteVarWerte()` first, then five assignments written *directly* into `mDaten`.
   * Upstream's comment says why it does not go through `setVariable`: that would call
   * `merkeAlteVarWerte()` a second time. The order is the point - taking the shadow first is
   * what makes the resets themselves visible to a `@` read in this step, so a blob can see that
   * `file` is now 0 rather than reading last step's file number.
   *
   * Only these five. `kind`, `version`, `weight`, `inhibit`, `behaviour` and the two falling
   * speeds keep their values across steps; a level writing them means it.
   */
  beginStep(): void {
    this.preserve();
    for (const [slot, value] of PER_STEP_RESETS) this.data[slot] = value;
  }

  /** Read a system variable by name. Throws for a name that is not one. */
  getSystem(name: string): number {
    const slot = SYSTEM_VARIABLE_SLOTS[name];
    if (slot === undefined) throw new Error(`Cual: no system variable named '${name}'`);
    return this.data[slot];
  }

  /**
   * Write a system variable by name.
   *
   * Goes through `preserve` like any other write, so a system variable a `@` read can see is
   * shadowed like any other. Upstream's `setVariable` special-cases `kind` - it range-checks
   * it and calls `setKindIntern` - and that is task 4.8, not here.
   */
  setSystem(name: string, value: number): void {
    const slot = SYSTEM_VARIABLE_SLOTS[name];
    if (slot === undefined) throw new Error(`Cual: no system variable named '${name}'`);
    this.set(slot, value);
  }

  /**
   * `setVariableIntern`'s `spezvar_kind` case: range-check, then `setKindIntern` on a change.
   *
   * `setKindIntern` is `mDaten[spezvar_kind] = wert;` and then a walk over *every* slot
   * re-applying the ones whose default kind is `da_kind`. That is the whole of "reapply": the
   * variable's value follows the kind it belongs to, so a blob that becomes a different kind
   * starts that kind's default rather than keeping the old kind's.
   *
   * The range check is upstream's: `if (mDaten[vnr] < blopart_min_cual || mDaten[vnr] >=
   * ld->mAnzFarben) throw Fehler("Value %d for kind out of range (allowed: %d - %d)")`. So
   * `blopart_min_cual` (-1) is assignable and `blopart_ausserhalb` (-5) is not — which is what
   * "the last kind Cual may name" means.
   *
   * @returns whether the kind actually changed, which is what the draw bookkeeping keys on.
   */
  setKind(value: number, change: KindChange): boolean {
    if (value < BLOPART_MIN_CUAL || value >= change.colourCount) {
      throw new Error(
        `Cual: value ${value} for kind is out of range (allowed: ${BLOPART_MIN_CUAL} to ${change.colourCount - 1})`,
      );
    }
    const previous = this.data[2];
    if (previous === value) return false;
    // Direct, not through `set`, so no shadow is taken: `setVariableIntern` is the low-level
    // entry, and upstream's comment on it says it deliberately skips `merkeAlteVarWerte`.
    this.data[2] = value;
    for (const entry of change.kindDefaults(value)) {
      this.data[entry.slot] = entry.value;
    }
    return true;
  }

  /**
   * The draw bookkeeping at the top of a step, before the new kind's draw code runs.
   *
   *     if (mDaten[spezvar_kind] != mDaten[spezvar_kind_beim_letzten_draw_aufruf]
   *         && mDaten[spezvar_kind_beim_letzten_draw_aufruf] != -1) {
   *       Code * alt_co = (that == blopart_ausserhalb ? 0
   *         : ld->mSorten[that]->getEventCode(event_draw));
   *       if (alt_co) alt_co->busyReset(*this);
   *     }
   *     mDaten[spezvar_kind_beim_letzten_draw_aufruf] = mDaten[spezvar_kind];
   *
   * So a kind change interrupts the *old* kind's animation: its draw code is busy-reset, or a
   * blob that changed kind mid-sequence would resume the old animation where it left off. The
   * `-1` guard means a blob that has never been drawn has nothing to interrupt, and
   * `blopart_ausserhalb` has no draw code at all.
   *
   * Slot 7 is then set to the current kind, so this runs at most once per actual change.
   */
  beginDraw(change: KindChange): void {
    const lastDrawn = this.data[7];
    const current = this.data[2];
    if (current !== lastDrawn && lastDrawn !== -1) {
      if (change.drawCodeOf(lastDrawn) !== null) change.resetBusyOf(lastDrawn);
    }
    this.data[7] = current;
  }

  /** `Blop::getVariable`. */
  get(slot: number): number {
    return this.data[slot];
  }

  /**
   * `Blop::merkeAlteVarWerte`: take the shadow copy, if this slice has not already done so.
   *
   * Called by every write, before the write. **Lazy on purpose** - upstream does not copy
   * when a slice opens, it copies on a blob's first write in that slice. The difference is
   * invisible in the documented examples and free of consequence everywhere else, but it is
   * what upstream does, and copying eagerly would mean allocating a second `Int32Array` for
   * every blob on the board on every slice whether or not anything ever reads it.
   */
  preserve(): void {
    const slice = this.#slices.current;
    if (this.#altSlice >= slice) return;
    if (this.#alt === null) this.#alt = new Int32Array(this.data.length);
    this.#alt.set(this.data);
    this.#altSlice = slice;
  }

  /**
   * `Blop::getVariableAlt`: the value as of the beginning of this slice.
   *
   * Reads the shadow only when it was taken in *this* slice. A stale shadow is a blob's
   * history, not this slice's past, and `getVariableAlt` says the same thing by falling
   * through to the live array - which is correct, because nothing has written since.
   */
  getAlt(slot: number): number {
    const slice = this.#slices.current;
    return this.#alt !== null && this.#altSlice === slice ? this.#alt[slot] : this.data[slot];
  }

  /** `Blop::getBoolVariableAlt`, over a bit number rather than a slot. */
  busyGetAlt(bit: number): boolean {
    const slot = Math.floor(bit / BITS_PER_SLOT);
    const slice = this.#slices.current;
    return this.#alt !== null && this.#altSlice === slice
      ? getBool(this.#alt[slot], bit)
      : getBool(this.data[slot], bit);
  }

  /** Whether this blob's shadow has been taken in the current slice. */
  get hasShadow(): boolean {
    return this.#alt !== null && this.#altSlice === this.#slices.current;
  }

  /** `Blop::setVariable`, which preserves the old value first. */
  set(slot: number, value: number): void {
    this.preserve();
    this.data[slot] = value;
  }

  /**
   * `Blop::setVariableIntern`: a write that must *not* preserve.
   *
   * Upstream's deferred writes are applied by `endGleichzeitig` through this, and they have
   * to skip the preserve: by then the slice is over and the shadow is nobody's past. A
   * write that preserved here would overwrite the beginning-of-step values that the next
   * slice's `@` reads are supposed to be relative to.
   *
   * Task 3.9 uses this. Nothing else should.
   */
  setInternal(slot: number, value: number): void {
    this.data[slot] = value;
  }

  /** `Blop::getBoolVariable`, over a bit number from {@link allocateSlots}. */
  busyGet(bit: number): boolean {
    return getBool(this.data[Math.floor(bit / BITS_PER_SLOT)], bit);
  }

  /**
   * `Blop::setBoolVariable`, which preserves the old value first.
   *
   * Upstream preserves for the flag too: `set[Bool]Variable` calls `merkeAlteVarWerte`
   * before changing anything, and the flag is a variable like any other.
   */
  busySet(bit: number, on: boolean): void {
    this.preserve();
    const slot = Math.floor(bit / BITS_PER_SLOT);
    this.data[slot] = setBool(this.data[slot], bit, on);
  }

  /** `setBoolVariableIntern`, for the same reason as {@link setInternal}. */
  busySetInternal(bit: number, on: boolean): void {
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

  /** Whether `bit` names a bit inside this array at all. */
  static hasBit(bit: number, slotCount: number): boolean {
    return bit >= 0 && bit < slotCount * BITS_PER_SLOT;
  }
}
