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
 * | one `switch` case | `bedingung_code` | 2 | `switchCase` |
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

import type { Stmt, SwitchCase } from "./code.ts";
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
  /**
   * Where each declared variable landed, by name.
   *
   * Added for task 15.1 and the reason it is here rather than computed beside it: a user
   * variable reaches the evaluator as `{ kind: "variable", name }` and is resolved at *run*
   * time through `EvalContext.variable(name)`, so the runtime needs a name to hand back. The
   * allocator is the only thing that knows which index each declaration took, and a second
   * walk in the same order would be a second source of truth for the same numbering.
   *
   * One entry per name, which upstream agrees with: `neueVarDefinition` always takes a fresh
   * slot from `neueVariable`, and `speicherDefinition` throws `"x" already defined.` for a
   * second declaration of the same name, so a name cannot end up with two slots.
   */
  readonly declaredSlots: ReadonlyMap<string, number>;
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

  /** The last slot {@link allocateDeclaredVariable} took, for the name-to-slot table. */
  #lastVariableSlot = 0;

  /** `DefKnoten::neueVariable`: one `int`, appended to the blob's array. */
  allocateVariable(): number {
    return this.#nextSlot++;
  }

  /** One slot per declared variable, which is what `neueVarDefinition` does — exactly one. */
  allocateDeclaredVariable(): number {
    this.#declaredCount += 1;
    const slot = this.allocateVariable();
    this.#lastVariableSlot = slot;
    return slot;
  }

  /** The index the last {@link allocateDeclaredVariable} handed out. */
  get lastVariableSlot(): number {
    return this.#lastVariableSlot;
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
 * How {@link allocateSlots} should treat a `procedureDef` or `&name` body.
 *
 * **The default (`false`) is right for a tree that will run as parsed**, which is what every
 * test in this file and every hand-built fixture is. **The level loader does not use it**, because
 * it allocates over two trees and needs the reader to know which body is the live one.
 */
export interface AllocationOptions {
  /**
   * The caller has already allocated over the **linked** trees, where a call's body is a spliced
   * copy (`neueBusyNummern`) and `&name`'s is the shared original. A parsed body is then a
   * superseded tree: its busy flags would take up array space nothing ever reads.
   *
   * Its *declarations* are still counted, because upstream numbers a variable at parse time
   * (`neueVarDefinition` on the level's `DefKnoten`) and every copy of the body shares the one
   * variable. So the linked trees are handed over with their declarations removed —
   * {@link withoutDeclarations} — or a `var` inside a spliced procedure would be counted once
   * from the parsed body and again from every copy, giving `x` several slots under one name.
   *
   * Both numbers still come from **one** counter, because a blob's array holds both: a busy flag
   * is a bit in an `int`, and `neueBoolVariable` allocates a new `int` through the same
   * `neueVariable` a `var` uses.
   */
  readonly bodiesLinked?: boolean;
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
/**
 * Number every `var` and `default` line in a tree, and nothing else.
 *
 * Used for a procedure or `&name` body under {@link AllocationOptions.bodiesLinked}: the
 * declarations belong to the parsed body (upstream numbers a variable at parse time), while the
 * busy flags belong to each copy. Walking to *every* depth matters — `globals.ld` writes its
 * `var` lines at the top of a procedure, and a one-level-deep search would miss them and leave
 * every global variable sitting directly after the special variables.
 */
function numberDeclarations(
  nodes: readonly Stmt[],
  allocator: SlotAllocator,
  declaredSlots: Map<string, number>,
): void {
  for (const node of nodes) {
    if (node.kind === "varDecl" || node.kind === "defaultDecl") {
      for (const declaration of node.declarations) {
        allocator.allocateDeclaredVariable();
        // **The name has to be recorded too**, and until 15.7 it was not: a `var` inside a
        // procedure body or a `&held` body got a slot and no name, so `EvalContext.variable`
        // could not find it and every level that declared one there failed with "no variable
        // named 'x'" the moment its blobs ran. `Theater`'s `Leer`, `Aliens`'s `p_shoot` and
        // `Kolben`'s `blitzrate` are all of that shape.
        //
        // The empty name is a Spez-Var, which `visit`'s own `varDecl` case already declines to
        // record; same rule here, so the two paths cannot disagree about it.
        if (declaration.name !== "") {
          declaredSlots.set(declaration.name, allocator.lastVariableSlot);
        }
      }
      continue;
    }
    numberDeclarations(childrenOf(node), allocator, declaredSlots);
  }
}

/** Every immediate child statement of a node, for the recursive walks. */
function childrenOf(node: Stmt): readonly Stmt[] {
  switch (node.kind) {
    case "sequence":
    case "block":
    case "sharedCall":
      return node.body;
    case "scoped":
    case "procedureDef":
      return [node.body];
    case "commaSequence":
      return node.parts;
    case "if":
      return node.otherwise === null ? [node.then] : [node.then, node.otherwise];
    case "switch":
      return [node.case];
    case "switchCase":
      return node.otherwise === null ? [node.body] : [node.body, node.otherwise];
    case "call":
      return [];
    default:
      return [];
  }
}

/**
 * A copy of a tree with every `var` and `default` line taken out.
 *
 * For the *linked* trees only, and for the reason {@link AllocationOptions.bodiesLinked} gives:
 * `linkCalls` drops a block's top-level declarations because upstream keeps them as definitions
 * rather than code, but a declaration **inside a procedure body** survives into every spliced
 * copy — and upstream numbers that variable once, at parse time. Allocating over the copies as
 * well as the parsed body therefore counted `BoniMali2`'s 763 variables several times over, which
 * is how the corpus's largest blob array went from 112 slots to 764.
 *
 * Recursive, because a declaration can sit at any depth of a body, and it removes the node while
 * keeping the sequence it was in, so `{ var x; y; }` becomes `{ y; }` rather than `{ ; y; }`.
 */
export function withoutDeclarations(statements: readonly Stmt[]): readonly Stmt[] {
  const out: Stmt[] = [];
  let changed = false;
  for (const node of statements) {
    if (node.kind === "varDecl" || node.kind === "defaultDecl") {
      changed = true;
      continue;
    }
    const rebuilt = rebuildWithoutDeclarations(node);
    if (rebuilt !== node) changed = true;
    out.push(rebuilt);
  }
  // **The original array when nothing was removed.** Not a new array holding the original nodes:
  // `busySlots` is keyed by object identity, so a copy of the *list* is harmless but a copy of
  // any *node* is a node the walker will never visit and a flag the runner will never find.
  // 15.7 found this as "a 'switchCase' has no busy slots" on the first level whose draw code was a
  // bare condition chain — `switchCase`, `if`, `scoped` and `procedureDef` were all rebuilt
  // unconditionally, so every one of their flags was keyed to an object that no longer existed.
  return changed ? out : statements;
}

/**
 * One node with its declarations removed, or **the same node** when it had none.
 *
 * Split out from {@link withoutDeclarations} because the identity requirement is per node and not
 * merely per list: a rebuilt `if` whose `then` happened to be unchanged is still a different
 * object, and a flag keyed to it is unreachable.
 */
function rebuildWithoutDeclarations(node: Stmt): Stmt {
  switch (node.kind) {
    case "sequence":
    case "block": {
      const body = withoutDeclarations(node.body);
      return body === node.body ? node : { ...node, body };
    }
    case "sharedCall": {
      const body = withoutDeclarations(node.body);
      return body === node.body ? node : { ...node, body };
    }
    case "scoped":
    case "procedureDef": {
      const body = withoutDeclarations([node.body]);
      return body[0] === node.body ? node : { ...node, body: body[0] as Stmt };
    }
    case "commaSequence": {
      const first = withoutDeclarations([node.parts[0]]);
      const second = withoutDeclarations([node.parts[1]]);
      if (first[0] === node.parts[0] && second[0] === node.parts[1]) return node;
      return { ...node, parts: [first[0] as Stmt, second[0] as Stmt] };
    }
    case "if": {
      const then = withoutDeclarations([node.then]);
      const otherwise = node.otherwise === null ? null : withoutDeclarations([node.otherwise]);
      if (then[0] === node.then && (otherwise === null || otherwise[0] === node.otherwise)) {
        return node;
      }
      return {
        ...node,
        then: then[0] as Stmt,
        ...(otherwise === null ? {} : { otherwise: otherwise[0] as Stmt }),
      };
    }
    case "switch": {
      const entry = withoutDeclarations([node.case]);
      return entry[0] === node.case ? node : { ...node, case: entry[0] as SwitchCase };
    }
    case "switchCase": {
      const body = withoutDeclarations([node.body]);
      const otherwise = node.otherwise === null ? null : withoutDeclarations([node.otherwise]);
      if (body[0] === node.body && (otherwise === null || otherwise[0] === node.otherwise)) {
        return node;
      }
      return {
        ...node,
        body: body[0] as Stmt,
        ...(otherwise === null ? {} : { otherwise: otherwise[0] as Stmt }),
      };
    }
    default:
      return node;
  }
}

export function allocateSlots(
  statements: readonly Stmt[],
  options?: AllocationOptions,
): Allocation {
  const bodiesLinked = options?.bodiesLinked ?? false;
  const allocator = new SlotAllocator();
  const busySlots = new Map<Stmt, BusySlots>();
  const declaredSlots = new Map<string, number>();

  /**
   * A case is a `bedingung_code` with two flags, and the rest of the switch hangs off its
   * `otherwise` - so the whole list is walked as one chain.
   */
  const visitCase = (entry: SwitchCase): void => {
    visit(entry.body);
    if (entry.otherwise) visit(entry.otherwise);
    busySlots.set(entry, {
      first: allocator.allocateBool(),
      second: allocator.allocateBool(),
    });
  };

  const visit = (node: Stmt): void => {
    switch (node.kind) {
      case "varDecl":
        // One slot per declaration, which is all `neueVarDefinition` ever takes.
        for (let i = 0; i < node.declarations.length; i += 1) {
          const name = node.declarations[i]?.name ?? "";
          allocator.allocateDeclaredVariable();
          // The empty name is a Spez-Var: upstream still allocates it ("nur die Variable
          // erzeugen, aber keine Definition abspeichern") and nothing can read it by name.
          if (name !== "") declaredSlots.set(name, allocator.lastVariableSlot);
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
        visitCase(node.case);
        return;
      case "switchCase":
        // Reached through a previous case's `otherwise`, which is where the rest of the list
        // lives. `switch`'s own branch only sees the head.
        visitCase(node);
        return;
      case "sequence":
      case "block":
        for (const child of node.body) visit(child);
        return;
      case "sharedCall":
        // The held body is numbered exactly once no matter how many `&name` sites hold it,
        // because they all hold the *same* statements - that is the sharing. Visiting it per
        // site would give each one its own flag and silently turn `&` back into a plain call.
        //
        // Found by the man page's ampersand example failing: a shared animation's flags were
        // not allocated at all, so `&anim` advanced every step instead of one frame per step.
        //
        // Under `bodiesLinked` the held statements are the same objects the linked tree holds,
        // so their flags are numbered there; numbering them here as well would only renumber
        // them. **Their declarations still have to be counted from here**, because a `var`
        // inside a `&held` body is numbered once at parse time like any other — which is why
        // this is a declarations-only walk and not a skip.
        if (bodiesLinked) {
          numberDeclarations(node.body, allocator, declaredSlots);
          return;
        }
        for (const child of node.body) visit(child);
        return;
      case "scoped":
        // `[x=e] body` is not a copy — scoping runs in place — so it needs no special handling
        // and is *not* one of the two cases a linker replaces with another object.
        visit(node.body);
        return;
      case "procedureDef":
        // A procedure body's flags are counted against the level, not the procedure: a
        // `DefKnoten` for a sort walks up to the level knoten to ask for a variable, so a
        // procedure's busy flags share one array with the level that calls it.
        //
        // **Unless the caller says the body has already been linked**, which is what 15.5 found
        // and what `buildLevelProgram` says when it allocates over both trees. See
        // {@link AllocationOptions}: a linked copy is the body that will actually run, and the
        // parsed body is then a second, never-run tree whose flags would take another
        // `BITS_PER_SLOT`-th of the array for nothing.
        if (bodiesLinked) {
          // Declarations only, and **through every level of the body**. `neueVarDefinition` runs
          // at parse time on the level's `DefKnoten`, so a `var` anywhere in a procedure is
          // numbered once, from the parsed body; a linked copy would be a second variable under
          // the same name. Its busy flags are a different matter — each copy needs its own, and
          // they are numbered where the copy is (see `withoutDeclarations`).
          numberDeclarations([node.body], allocator, declaredSlots);
          return;
        }
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
    declaredSlots,
    slotCount: allocator.slotCount,
  };
}
