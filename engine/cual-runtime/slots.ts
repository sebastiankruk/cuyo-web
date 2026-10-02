/**
 * Compile-time slot allocation: which `Int32Array` index each code node's busy flag lives
 * at, and how long that array has to be.
 *
 * This is a transcription of three upstream pieces, and the shape of the answer is entirely
 * determined by them:
 *
 * - `code.cpp`'s `STDINIT`, which reserves the busy slots *in the constructor*:
 *   `mBool1Nr` for `folge_code` and `bedingung_code`, `mBool2Nr` for `bedingung_code` only,
 *   and `-1` — meaning none — for everything else.
 * - `knoten.cpp`'s `neueBoolVariable`, which packs busy flags *bitwise* into the same array
 *   as the user variables: `bits_pro_int` flags share one `int`.
 * - `knoten.cpp`'s `neueVariable`, one slot per declared variable.
 *
 * Which of my nodes those are took some care, because the obvious reading is wrong:
 *
 * | Cual | upstream | slots | mine |
 * |---|---|---|---|
 * | `a, b` | `folge_code` | 1 | `commaSequence` |
 * | `a; b` | `stapel_code` | 0 | `sequence` |
 * | `if c -> a else b` | `bedingung_code` | 2 | `if` |
 * | one `switch` case | `bedingung_code` | 2 | `switch` -> `cases[i]` |
 * | `{ ... }` | *no node at all* | 0 | `block` |
 * | `switch { ... }` | *no node at all* | 0 | `switch` itself |
 * | `default x = 3` | `neuerDefault` on an existing slot | 0 | `defaultDecl` |
 *
 * So the comma sequence carries the flag, not the semicolon one. `code: code_1 ';' code`
 * is `stapel_code`, which threads busy through a local (`busy |= busy1`) and needs no
 * storage; `folge_code` is the one that has to *persist* "am I running my second member yet"
 * across separate executions of the same code, because the flag is how a comma sequence
 * resumes where it left off when a member was busy.
 *
 * `block` and `switch` reserve nothing because upstream's grammar makes them transparent —
 * `'{' code '}'` returns `$2` unchanged. Modelling them as nodes that cost a slot would put
 * a number in the array that upstream never allocates.
 */

import type { Stmt } from "./code.ts";
import { SPECIAL_VARIABLE_COUNT } from "./store.ts";

/**
 * `bits_pro_int` in `blop.h`: `(8*sizeof(int))`, and `sizeof(int)` is 4 wherever Cuyo runs.
 *
 * Thirty-two busy flags share one `int`. The alternative — a byte per flag, or a bool array
 * beside the variables — would be simpler and would not fit: the point is that the busy flag
 * is a *variable*, so a blob's deferred-write and snapshot machinery treats it like any
 * other, and so two blobs of the same kind get independent flags from having independent
 * arrays.
 */
export const BITS_PER_SLOT = 32;

/**
 * How many busy flags a node owns, and which array bits they are.
 *
 * Indexed by node identity in {@link Allocation.busySlots}, so a node that owns none is
 * simply absent rather than present with an empty list.
 */
export interface BusySlots {
  /** `mBool1Nr`: for a comma sequence, "my second member is next"; for a condition, the `then`. */
  readonly first: number;
  /** `mBool2Nr`: the `else` — `bedingung_code` only, so `-1` for a comma sequence. */
  readonly second: number;
}

/**
 * The result of allocating a block: where every busy flag lives, and how big the array is.
 *
 * `slotCount` is `DefKnoten::getDatenLaenge` — the length of every blob's `mDaten`. Task
 * 3.7 allocates the array; this is the number it has to be given.
 */
export interface Allocation {
  /** Bit numbers per node that owns a busy flag. Nodes that own none are absent. */
  readonly busySlots: ReadonlyMap<Stmt, BusySlots>;
  /** How many busy flags were allocated in total. */
  readonly boolCount: number;
  /** How many slots declared variables took. */
  readonly declaredCount: number;
  /** `getDatenLaenge`: the length of a blob's variable array. */
  readonly slotCount: number;
}

/**
 * The counter pair from `DefKnoten`: `mVarNrBei` and `mBoolNrBei`.
 *
 * `mBoolNrBei` is the fiddly one. It is `-1` for "no bits left in the current int", and
 * otherwise the *next bit number*, where bit numbers are `bits_pro_int * slot` … so a flag
 * number identifies its own slot by division (`blop.h`'s `getBoolVariable` does exactly
 * `vnr / bits_pro_int`). When the next bit number lands on a multiple of 32 the int is full
 * and the counter goes back to `-1`, so the following flag allocates a new int.
 *
 * Two consequences, and the first is easy to get backwards.
 *
 * Bit numbers are *not* consecutive across the block. A declared variable between two runs
 * of flags takes an int of its own, and the flags after it resume 32 higher — 64 flags, one
 * declaration, and the last flag is bit 64, not bit 32. So a flag number identifies its slot
 * by division, which is what `blop.h` does, and the numbering cannot be predicted from the
 * flag count alone.
 *
 * The array's *length* is simpler than the numbering and does not depend on the order at
 * all: `slotCount === declaredCount + ceil(boolCount / BITS_PER_SLOT)`, always. `mBoolNrBei`
 * only returns to `-1` on reaching a multiple of 32, and it can only reach one by counting up
 * from a block start, so every flag block holds exactly 32 flags and there is one short block
 * at the end. A declaration interleaved between two runs costs the int it takes and does not
 * shorten or extend the blocks — which is the opposite of what interleaving seemed like it
 * should do, and is checked as an invariant rather than left to the arithmetic here.
 */
export class SlotAllocator {
  // Starts at `spezvar_anz`, not zero. `speicherGlobaleVordefinierte` defines the fourteen
  // special variables before anything else is parsed - `CASSERT(mVarNrBei == 0)` immediately
  // above the loop is there to say so - so `file` is slot 0 and the first `var` is slot 14.
  //
  // Task 3.6 got this wrong: it started at 0, so every slot number it produced was 14 too
  // low. The *relative* order and the bit packing were right, which is why the corpus
  // assertions and the interleaving invariant did not catch it - nothing in them looks at an
  // absolute slot. `out1` would have been `file`.
  #nextSlot = SPECIAL_VARIABLE_COUNT;
  #nextBool = -1;
  #boolCount = 0;
  #declaredCount = 0;

  /** `DefKnoten::neueVariable`: one `int`, appended to the blob's array. */
  allocateVariable(): number {
    return this.#nextSlot++;
  }

  /** One slot per declared variable, which is what `neueVarDefinition` does — exactly one. */
  allocateDeclaredVariable(): number {
    this.#declaredCount += 1;
    return this.allocateVariable();
  }

  /**
   * `DefKnoten::neueBoolVariable`: the next free bit, allocating a fresh `int` when the
   * current one is full.
   *
   * A `da_kind` default marks a variable as holding a *kind* rather than a number (blop.cpp
   * reads it as either), not an extra slot: `neueVarDefinition` calls `neueVariable` once
   * whatever `defart` says. So there is no second kind of declaration here.
   */
  allocateBool(): number {
    if (this.#nextBool === -1) {
      this.#nextBool = BITS_PER_SLOT * this.allocateVariable();
    }
    const bit = this.#nextBool;
    this.#nextBool += 1;
    this.#boolCount += 1;
    if (this.#nextBool % BITS_PER_SLOT === 0) this.#nextBool = -1;
    return bit;
  }

  /**
   * `getDatenLaenge`: the length of `mDaten`, special variables included.
   *
   * They are counted because they are real slots — `Blop` writes `mDaten[spezvar_kind]` and
   * a kind's defaults are read back out of the same array — not because they are free.
   */
  get slotCount(): number {
    return this.#nextSlot;
  }
  get boolCount(): number {
    return this.#boolCount;
  }
  get declaredCount(): number {
    return this.#declaredCount;
  }
}

/**
 * `Blop::getBoolVariable`: `mDaten[bit / bits_pro_int] & (1 << (bit % bits_pro_int))`.
 *
 * Returns a boolean rather than the masked value. The mask for bit 31 is `1 << 31`, which is
 * `INT_MIN` in both C++ and JavaScript, so the upstream expression yields a negative int
 * there; only its truthiness matters, and only the low 32 bits of the slot do, which is why
 * this is a mask rather than an equality.
 */
export function getBool(slot: number, bit: number): boolean {
  return (slot & (1 << (bit % BITS_PER_SLOT))) !== 0;
}

/** `Blop::setBoolVariable`, with the same 32-bit mask caveat as {@link getBool}. */
export function setBool(slot: number, bit: number, on: boolean): number {
  const mask = 1 << (bit % BITS_PER_SLOT);
  return on ? slot | mask : slot & ~mask;
}

/** Which `int` a bit number lives in. */
export function slotOf(bit: number): number {
  return Math.floor(bit / BITS_PER_SLOT);
}

/**
 * Allocate busy slots for a parsed block.
 *
 * **Order.** Upstream reserves each node's slots in its constructor, and Bison reduces
 * bottom-up, so children are built — and reserve — before their parent. This walks
 * post-order for the same reason. It matters: the bit *numbers* depend on it, and so does
 * `slotCount`, because a declared variable landing between two runs of flags splits an int
 * that would otherwise have held 32 of them.
 *
 * Declarations are allocated where they appear in the statement list rather than first,
 * for the same reason. `var_def` is only reachable from `code_zeile`, so a `varDecl` is
 * always a top-level statement and never appears inside a tree that would need it hoisted.
 */
export function allocateSlots(statements: readonly Stmt[]): Allocation {
  const allocator = new SlotAllocator();
  const busySlots = new Map<Stmt, BusySlots>();

  const visit = (node: Stmt): void => {
    switch (node.kind) {
      case "varDecl":
        // One slot per declaration, which is all `neueVarDefinition` ever takes.
        for (let i = 0; i < node.declarations.length; i += 1) {
          allocator.allocateDeclaredVariable();
        }
        return;
      case "commaSequence":
        for (const part of node.parts) visit(part);
        // `folge_code`: one flag, recording which member runs next.
        busySlots.set(node, { first: allocator.allocateBool(), second: -1 });
        return;
      case "if":
        // `bedingung_code`: `mF2` is the `then`, `mF3` the `else`, each with its own flag.
        // An `if` with no `else` gets a `nop_code` for `mF3` upstream, not a smaller node.
        visit(node.then);
        if (node.otherwise) visit(node.otherwise);
        busySlots.set(node, {
          first: allocator.allocateBool(),
          second: allocator.allocateBool(),
        });
        return;
      case "switch":
        // The braces are transparent upstream, so the `switch` node itself owns nothing and
        // each case is a `bedingung_code` with two flags of its own.
        for (const entry of node.cases) {
          visit(entry.body);
          if (entry.otherwise) visit(entry.otherwise);
          busySlots.set(entry, {
            first: allocator.allocateBool(),
            second: allocator.allocateBool(),
          });
        }
        return;
      case "sequence":
      case "block":
        for (const child of node.body) visit(child);
        return;
      case "scoped":
      case "procedureDef":
        // A procedure body's flags are counted against the level, not the procedure: a
        // `DefKnoten` for a sort walks up to the level knoten to ask for a variable, so a
        // procedure's busy flags share one array with the level that calls it.
        visit(node.body);
        return;
      default:
        return;
    }
  };

  for (const statement of statements) visit(statement);

  return {
    busySlots,
    boolCount: allocator.boolCount,
    declaredCount: allocator.declaredCount,
    slotCount: allocator.slotCount,
  };
}
