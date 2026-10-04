/**
 * One blob, as `Blop::animiere` sees it.
 *
 * Task 15.5, and the first object in the project that both *holds* a variable array and *runs*
 * code in it. 15.3 gave every blob a real `BlobStore` and 15.4 made a live board answerable by
 * address; this joins them, so a blob's kind, its draw code and its own variables are one thing
 * that can be stepped.
 *
 * ## The order is upstream's and it is the whole of this file
 *
 * `src/blop.cpp:281`:
 *
 *     void Blop::animiere() {
 *       CASSERT(gGleichZeit);
 *       braucheLeereStapel();
 *       try {
 *         initSchritt();
 *         if (kind changed) alt_co->busyReset(*this);
 *         kind_beim_letzten_draw_aufruf = kind;
 *         Code * mc = getSorte()->getEventCode(event_draw);
 *         if (mc) { mMalenErlaubt = true; mc->eval(*this); }
 *         mBild.setDebugOut(out1, out2);
 *         ... the explosion animation ...
 *
 * Four steps, and **three of them are already elsewhere**, which is why this file is short:
 *
 * - `braucheLeereStapel` clears the blob's own picture stack: `PictureStack.clear`.
 * - `initSchritt` is `BlobStore.beginStep` — the per-step resets plus the shadow copy, tasks 3.8's
 *   and 4.4's.
 * - The busy reset on a kind change is `BlobStore.beginDraw`, task 4.8's.
 * - The code is `runCode`.
 *
 * ## Two things that are *not* here, and why
 *
 * **The explosion animation.** Upstream's last four lines advance `am_platzen` and turn the blob
 * into the empty kind when the picture count runs out. This port does that in the rules phase —
 * `Simulation.finishExplosions` — because `render/` reads `blob.exploding`, and design.md records
 * the divergence under *Mode transitions are collapsed into a single step*. Doing it here as well
 * would advance the animation twice per step.
 *
 * **The window.** Upstream `CASSERT`s `gGleichZeit` twice in `animiere`, and `runStep` (task
 * 4.11's) opens one around the whole step. So nothing here checks it, and `deps` does not carry
 * a flag for it — which is what `Animatable`'s own documentation asks of an implementation.
 *
 * ## Why the surroundings are asked for and not held
 *
 * `deps` supplies `here()`, `field()`, the random source, the effects, the cell stacks and the
 * window, and every one of them is asked **inside** `animate()` rather than read once at
 * construction. That is 15.4's constraint becoming structural: `here` moves when the blob does,
 * and `AccessField.fallCount` is a snapshot of a count the fall simulation owns. A field built
 * once and reused across steps would answer with the fall count from whenever it was built, and a
 * test could not have found that by reading this class.
 */

import type { Stmt } from "../cual-runtime/code.ts";
import { resetBusy, runCode } from "../cual-runtime/execute.ts";
import type { ExecutionContext } from "../cual-runtime/execute.ts";
import { PictureStack } from "../cual-runtime/draw.ts";
import type { PictureSource } from "../cual-runtime/draw.ts";
import type { Animatable } from "../cual-runtime/global.ts";
import type { AccessField, Here } from "../cual-runtime/access.ts";
import { resolveConstant } from "../cual-runtime/const-tables.ts";
import { readConstant } from "../cual-runtime/constants.ts";
import type { ConstantSubject } from "../cual-runtime/constants.ts";
import { neighbourReader, readAddressed, resolveOrt, storeAt } from "../cual-runtime/access.ts";
import { evaluate } from "../cual-runtime/expr.ts";
import type { EvalContext, Ort } from "../cual-runtime/expr.ts";
import type { BlobStore, KindChange, TimeSlices } from "../cual-runtime/store.ts";
import type { EffectContext } from "../cual-runtime/effects.ts";
import type { LevelProgram } from "../level-format/cual-program.ts";
import type { LevelDef } from "../level-format/level-data.ts";
import { maxPicturesOf } from "../cual-runtime/stapel-height.ts";
import { SPECIAL_VARIABLE_COUNT, specialVariableSlot } from "../cual-runtime/store.ts";

/**
 * What one blob needs from the game around it.
 *
 * Deliberately not `Simulation`: the step machine, the fall and the mode transitions decide
 * nothing about what a blob's code means, and depending on them would make this untestable
 * without playing a level. What it does need is a board, a random source, somewhere for the five
 * effects to land and a place to put a picture aimed at another cell — which is what upstream
 * splits across `BlopGitter`, `Cuyo` and `Spielfeld`.
 */
export interface BlobAnimationDeps {
  /** The level, for the kinds and their pictures. */
  readonly level: LevelDef;
  /** The level's compiled program: the busy slots, the declared slots, each kind's draw code. */
  readonly program: LevelProgram;
  /**
   * `levelPictureSource(level, program)`, built once.
   *
   * A field rather than a call inside `context()` because `context()` runs once per blob per
   * step and the answer cannot change while a level is playing — a fresh object per call would
   * be 200 allocations a step for a constant.
   */
  readonly pictureSource: PictureSource;
  /** Where the asking blob stands. Asked per step, because a blob moves. */
  here(): Here;
  /** The board as addressed access sees it. Asked per step, for the same reason. */
  field(): AccessField;
  /** The simulation's one random source, so `rnd` and the game agree on the sequence. */
  random(limit: number): number;
  /**
   * What the asking blob is, for the fifteen read-only constants.
   *
   * `getSpezConst(spezconst_falling)` is not a variable and not a compile-time constant: it
   * reads the *game* — whether a piece is falling, how fast, how far the field has scrolled,
   * which column this blob is in — so it needs the world and not the store. Asked per read
   * rather than held, because `falling` is true of a step's middle and false of its end.
   *
   * **This is a fourth namespace, and 15.5 wired only three.** The corpus reads `falling` in
   * `3d.ld` and `players` and `time` in several levels, so the first real run threw "no variable
   * named 'falling'" — which is 15.5's error message working, on a name its `valueOf` did not
   * know about.
   */
  constantSubject(): ConstantSubject;
  /** `bonus`, `message`, `explode`, `sound` and `lose`, already bound to this blob. */
  effects(here: Here): EffectContext;
  /**
   * `Blop::gZZ`: the window deferred writes queue onto, and the slice counter behind them.
   *
   * **The simulation's, never one of the blob's own.** An `@`-assignment (`x@(0,1) += 1`) is
   * *deferred* — applied at `endGleichzeitig`, not when it is written — so that a blob reading
   * its neighbour mid-step sees the beginning-of-step value. A per-blob queue would make each
   * blob's `@`-write invisible to the next blob in the step, which is the whole mechanism.
   *
   * `runStep` opens and closes it around the whole step, so this one object serves the global
   * blob, every cell and the semiglobal alike.
   */
  readonly slices: TimeSlices;
  /**
   * The picture stack of a cell, for a draw aimed at somebody else.
   *
   * `BildStapel::speichereBild` puts a foreign draw on the *target's* stack, so this cannot be
   * the asking blob's own. It returns null for a cell that is not paintable, which is
   * `koordMalOK` and the hex edge row in one answer.
   */
  stackAt(field: AccessField, x: number, y: number, right: boolean): PictureStack | null;
}

/**
 * `PictureSource` over a level: how many icons a picture holds, and how deep a stack may get.
 *
 * `maxPictures` is `ld->mStapelHoehe`, a property of the **compiled program** rather than of any
 * one blob — upstream computes it once while loading the level and every `BildStapel` allocates
 * that many layers. So it is asked of the program and not of the blob, and two blobs of different
 * kinds in one level share it. `stapel-height.ts` is task 15.5's other half.
 */
export function levelPictureSource(level: LevelDef, program: LevelProgram): PictureSource {
  return {
    pictureCount: (kind, file) => level.kinds[kind]?.pictureCounts[file] ?? 0,
    maxPictures: maxPicturesOf(program.drawCode),
  };
}

/**
 * `KindChange` for one blob over a program.
 *
 * **Per blob, not per level**, because `resetBusyOf` clears busy flags and a busy flag belongs to
 * the store that holds it: a reset given the wrong store would clear a different blob's animation,
 * which is the failure 4.18 is entirely about. Upstream's `alt_co->busyReset(*this)` takes the
 * blob for the same reason.
 */
export function kindChangeOf(
  program: LevelProgram,
  store: BlobStore,
  colourCount: number,
): KindChange {
  return {
    colourCount,
    // One list for the whole configuration. `cual-program.ts`'s `kindDefaults` says why, and why
    // that is right for all 79 levels: every `reapply` in the corpus is declared at level level.
    kindDefaults: () => program.kindDefaults,
    drawCodeOf: (kind) => program.drawCode[kind] ?? null,
    resetBusyOf: (kind) => {
      const code = program.drawCode[kind];
      if (code === null || code === undefined) return;
      // Only the statements, and `busyReset` needs a context to write through: the store is the
      // blob's own, so the flags cleared are this blob's.
      const context: ExecutionContext = {
        store,
        busySlots: program.allocation.busySlots,
        evaluate: () => {
          throw new Error("Cual: a busy reset evaluates nothing");
        },
      };
      for (const statement of code) resetBusy(statement, context);
    },
  };
}

/**
 * One blob that can be stepped.
 *
 * Holds its own store — 15.3's — and its kind's draw code, plus the stack its own draws land on.
 * A blob that is `null` draw code is not an error: 49 of the corpus's kinds have no pictures and
 * upstream therefore gives them no draw event at all.
 */
export class BlobAnimation implements Animatable {
  /** `Blop::toString()`, for the order log and for upstream's "during animation" wrapper. */
  readonly name: string;

  /** This blob's own `mDaten`. */
  readonly store: BlobStore;

  /** This blob's own `mBild`: where a plain `*` puts its picture. */
  readonly stack = new PictureStack();

  /** `getSorte()->getEventCode(event_draw)`, or null for a kind that draws nothing. */
  readonly drawCode: readonly Stmt[] | null;

  constructor(
    readonly deps: BlobAnimationDeps,
    name: string,
    store: BlobStore,
    drawCode: readonly Stmt[] | null,
  ) {
    this.name = name;
    this.store = store;
    this.drawCode = drawCode;
  }

  /** `ld->mAnzFarben`: the exclusive upper bound on a `kind` assignment. */
  get colourCount(): number {
    return this.deps.level.kinds.length;
  }

  /** `KindChange` for this blob, rebuilt per call so `resetBusyOf` cannot reach another's flags. */
  kindChange(): KindChange {
    return kindChangeOf(this.deps.program, this.store, this.colourCount);
  }

  /**
   * `Blop::animiere`.
   *
   * Four steps in upstream's order: clear the picture stack, `initSchritt`, reset the *old* kind's
   * animation if the kind changed, then evaluate the kind's draw code.
   */
  animate(): void {
    // `braucheLeereStapel`: the blob's own stack, lazily created upstream and always needed here,
    // because a draw may have queued onto it since the last step.
    this.stack.clear();

    // `initSchritt`. Unconditional, and that is upstream's instruction rather than tidiness: the
    // resets happen before anything can decide there is no code, because — as the comment says —
    // a neighbour may want to do something with this blob.
    this.store.beginStep();

    // The kind-change bookkeeping, `BlobStore.beginDraw`, task 4.8's. It reads slot 7, so it runs
    // after `beginStep` and before the code.
    this.store.beginDraw(this.kindChange());

    // `mMalenErlaubt = true; mc->eval(*this)`, and only where there is code. A kind with no
    // pictures has none, which is `sorte.cpp:104`'s `mBilddateien.size() > 0`.
    if (this.drawCode === null) return;
    runCode(this.drawCode, this.context());
  }

  /** The walker's context for this blob, this step. */
  context(): ExecutionContext {
    const here = this.deps.here();
    const field = this.deps.field();
    const allocation = this.deps.program.allocation;
    // A local rather than `this`, because the getters below are method-shorthand and their `this`
    // is the object literal rather than the blob.
    const store = this.store;
    return {
      store: this.store,
      busySlots: allocation.busySlots,
      evaluate: (expr) => evaluate(expr, this.evalContext(field)),
      slotOf: (name) => this.slotFor(name),
      field,
      slices: this.deps.slices,
      effects: this.deps.effects(here),
      draw: {
        // `mMalenErlaubt` is true for exactly this call: `execEvent` sets it false, so a draw
        // outside the draw event throws upstream. Here every call *is* the draw event.
        context: {
          drawingAllowed: true,
          // **Getters, not values.** `mal_code` reads `mDaten[spezvar_file]`,
          // `mDaten[spezvar_pos]` and `mDaten[spezvar_quarter]` at the moment it draws, and
          // `getSorte()` is read then too — so a level's own `file=…; pos=…; *` must be visible
          // to its own draw. Capturing them when the context was built (once per step) meant
          // every such draw used the *previous* step's picture, which is precisely the animation
          // a level writes to avoid: `drawer`'s `pos=3` drew icon 0.
          //
          // Getters rather than a change to `DrawContext`, because that interface is 4.9's and
          // is verified against `draw.test.ts`; a read-only property is satisfied by an accessor.
          picture: {
            get file(): number {
              return store.getSpecial("file");
            },
            get pos(): number {
              return store.getSpecial("pos");
            },
            get quarter(): number {
              return store.getSpecial("qu");
            },
          },
          get kind(): number {
            return store.getSpecial("kind");
          },
          field,
          here,
          source: this.deps.pictureSource,
        },
        ownStack: this.stack,
        stackAt: (f, resolved) =>
          resolved.kind === "cell"
            ? this.deps.stackAt(f, resolved.x, resolved.y, resolved.right)
            : null,
      },
    };
  }

  /**
   * The evaluator's context: three different answers to "what does this name mean", and they are
   * not interchangeable.
   *
   * - `variable` reads the **live** array. A name the level never declared is an error, because
   *   zero is a legal value in Cual and returning it would turn a typo into a level that quietly
   *   misbehaves.
   * - `addressed` reads the **target's beginning-of-step shadow**, through the same
   *   `readAddressed` 4.7 verified — `getVariableVergangenheit`, not `getVariable`. Its default
   *   for an unreachable address is `da_keinblob`'s 0, which is what a fresh blob's undeclared
   *   user slots read as.
   * - `neighbour` is `neighbourReader`, task 4.16's, which reads the board and compares *shadow*
   *   kinds on both sides.
   */
  private evalContext(field: AccessField): EvalContext {
    return {
      variable: (name) => {
        const value = this.valueOf(name);
        if (value === null) throw new Error(`Cual: no variable named '${name}' in this level`);
        return value;
      },
      random: (limit) => this.deps.random(limit),
      addressed: (name, position, evaluateExpression) => {
        const slot = this.slotFor(name);
        if (slot === null) throw new Error(`Cual: no variable named '${name}' in this level`);
        const resolved = resolveOrt(field, position, evaluateExpression);
        return readAddressed(field, resolved, slot, 0);
      },
      neighbour: neighbourReader(field),
    };
  }

  /** The store an address names, for a caller that wants the object rather than a number. */
  storeAt(address: Ort, evaluateExpression: (expr: never) => number): BlobStore | null {
    const field = this.deps.field();
    return storeAt(field, resolveOrt(field, address, evaluateExpression as never));
  }

  /**
   * The slot a name occupies: a declared variable, or a **system variable**.
   *
   * **One namespace, and that is upstream's.** `speicherGlobaleVordefinierte` reserves the
   * fourteen special slots first and `neueVarDefinition` refuses to redeclare one, so a name is
   * either system or user and never both — `changer={ kind = 1; * }` assigns `kind` and there is
   * no `var kind` anywhere in the corpus to collide with. Looking only in `declaredSlots` made
   * every `kind = …` in every level fail with "no variable named 'kind'", which is 4.8's own
   * subject arriving from the wrong direction.
   *
   * `null` for a name that is neither, and callers throw by name: zero is a legal value in Cual,
   * so answering 0 for an unknown name would turn a level's typo into a level that quietly
   * misbehaves.
   */
  slotFor(name: string): number | null {
    // A constant first, and this is upstream's own order rather than a preference.
    // `speicherPicsConst` ends with "Wenn es eine Konstante ist, wird auch noch eine Variable
    // draus gemacht" — *if it is a constant, a variable is made of it too* — so `Q_ALL` and
    // `nothing` are readable as variables and a level's `qu = Q_ALL` is a variable read at run
    // time, not a constant the parser folded. `resolveConstant` before the slot lookup is what
    // makes that work, and reading only `declaredSlots` made every `qu = Q_*` in the corpus fail
    // with "no variable named 'Q_ALL'".
    if (resolveConstant(name) !== null) return null;
    const declared = this.deps.program.allocation.declaredSlots.get(name);
    if (declared !== undefined) return declared;
    const special = specialVariableSlot(name);
    return special < 0 ? null : special;
  }

  /**
   * A name's value, and the order the four namespaces are tried in.
   *
   * 1. **`spezconst_*`** — `readConstant`, which needs the game and answers per blob.
   * 2. **Cual's own constants** — `resolveConstant`, the `#define`s of `cual.h` and friends,
   *    which upstream's parser folds at parse time and this port resolves at run time. So
   *    `Q_ALL`, `DIR_*` and `nothing` are values, not variables.
   * 3. **A declared variable** — one of the level's own `var` lines.
   * 4. **A system variable** — one of the fourteen `spezvar_*` slots, disjoint from 3 because
   *    `neueVarDefinition` refuses to redeclare one.
   *
   * `spezconst_*` first because it is the only one that can differ between two blobs in the same
   * step, and a namespace that answers differently for the *same* store is the one that has to
   * be asked first when two of them would both have an answer.
   *
   * 5. **A kind name** — `Blob`, `Kugel`, `Gras`. `angst.ld` writes
   * `if basekind@(tauschrichtung,0)!=Blob`, so a kind's name is a value and not just a label.
   * Upstream has one namespace for all of this: every one is a `DatenKnoten` in the
   * configuration, which is why `parser.yy`'s `konstante: wort` and `variable_acode` both reach
   * `getVerwandten` and get the same answer. This port has four tables where upstream has one,
   * so the order above *is* the namespace.
   *
   *   **Last, which is the one order that could be wrong.** Upstream forbids the collision: a
   *   `var` and a kind of the same name would be two `DatenKnoten`s under one name, and
   *   `neueVarDefinition` refuses that. Here nothing refuses it, so a level that did it would
   *   silently read the variable rather than the kind. Measured: no level in the corpus declares
   *   a `var` after a kind's name, so the order is unobservable for all 79 — and a variable
   *   winning is the answer that makes such a collision a visible bug rather than a silent one.
   */
  private valueOf(name: string): number | null {
    const readOnly = readConstant(name, this.deps.constantSubject());
    if (readOnly !== null) return readOnly;
    const constant = resolveConstant(name);
    if (constant !== null) return constant;
    const slot = this.slotFor(name);
    if (slot !== null) return this.store.get(slot);
    return this.kindNumberOf(name);
  }

  /** A kind's number by name, which is what `DatenKnoten` holding a kind number reads as. */
  private kindNumberOf(name: string): number | null {
    const kinds = this.deps.level.kinds;
    for (let i = 0; i < kinds.length; i += 1) {
      if (kinds[i]?.name === name) return kinds[i]?.id ?? null;
    }
    return null;
  }

  /** The slot a named variable occupies, which is what a caller needs to write one by address. */
  slotOf(name: string): number | null {
    return this.slotFor(name);
  }
}

/** Re-exported so a caller building one blob needs only this module. */
export { SPECIAL_VARIABLE_COUNT };