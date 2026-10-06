// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * A level's Cual program: the procedures in scope, and the code each blob runs.
 *
 * Task 15.1, and the first piece of the wiring task 12.3's survey made measurable. Groups 2 and
 * 3 built the reader and the runtime and never joined them, so nothing anywhere ran a level's
 * code. This module is the join's read half: it turns two parsed files into the value the game
 * will execute. It is a pure function of its arguments — no game state, no board, no clock — so
 * it can be verified across the whole corpus without a simulation.
 *
 * ## Which code a blob runs
 *
 * Upstream answers this in `src/sorte.cpp:98-131`, and the answer is not "the level's code":
 *
 *     mEventCode[event_draw] = ld->mLevelConf[ldteil_level]->getCode(mName, version, true);
 *
 * — **the procedure named after the kind**, looked up in one namespace. A kind with no such
 * procedure falls back to a default chosen by its pictures: `default3` for more than one file,
 * `default2` (or `default2g` for grass) for one multi-icon file, `default1` for one single-icon
 * file, and nothing at all when the kind has no pictures. The global and semiglobal blobs are
 * excluded from the default, which is why they are looked up separately here by their own names
 * — `Sorte("global")` and `Sorte("semiglobal")`, from `leveldaten.cpp:520-521`.
 *
 * **The defaults turned out to matter far less than expected, and I had it backwards.** Measured
 * across the corpus: of 556 kinds, **502 define a procedure of their own, 5 fall back to
 * `default1`, none to `default3`, and 49 have no code at all** (no pictures, so nothing to draw
 * and — upstream's condition being `mBilddateien.size() > 0` — no default either). I had written
 * down the opposite, from a probe whose classification was wrong: it counted a kind as "using a
 * default" whenever its `defaultCode` was non-null, which is true of nearly every kind whether
 * or not its own procedure won. The fallback is still implemented, because five corpus kinds
 * need it and `default2`/`default2g` are reachable in principle, but it is a tail rather than
 * the main path.
 *
 * ## One namespace, globals first
 *
 * `src/leveldaten.cpp:220-227` loads every file named in `globals=` into the *same* config as
 * the level: `mLevelConf[ldteil_level]->laden(datei)`. So `schema16`, `default1` and a level's
 * own procedures are all in one lookup, and a level that defines `schema16` itself shadows the
 * global. Globals therefore go in first and the level's definitions overwrite them.
 *
 * ## Why one ordered pass, and not a map built up front
 *
 * Because Cual cannot recurse, and the reason is the order. `proc_def_wort … '=' code_1 ';'`
 * runs `speicherDefinition` in its grammar action, which happens after `code_1` is fully
 * reduced — so while a procedure's own body is being parsed, that procedure does not exist yet,
 * and a self-call resolves to `undefiniert_code` and throws. `link.ts` reproduces this by
 * rewriting a body against the scope *so far*.
 *
 * So each procedure is linked against the scope as it stood immediately before it was added,
 * and never against the finished map. Collecting every definition first and then linking would
 * make `tor_1 = { tor_1; }` resolve and produce an infinitely recursive tree — the failure
 * `link.ts`'s own comment warns about, reintroduced here.
 *
 * ## Slot allocation runs over the *unlinked* trees
 *
 * A blob's variable array is `DefKnoten::getDatenLaenge()` long: it has to hold every node in
 * the configuration, because a blob can reach any procedure by calling it. But `linkCalls`
 * **drops** `var` and `default` nodes, on the grounds that upstream keeps them as definitions
 * rather than code. Allocating over the linked trees would therefore find no declarations at
 * all and hand back an array too short for every user variable in the level. So the allocation
 * runs over the trees as parsed, in the same order, which is also the order upstream numbers
 * them in.
 */

import { parseCode, CualSyntaxError } from "../cual-runtime/code.ts";
import type {
  DefaultDeclaration,
  Stmt,
  VarDeclaration,
} from "../cual-runtime/code.ts";
import { resolveConstant } from "../cual-runtime/const-tables.ts";
import { evaluate } from "../cual-runtime/expr.ts";
import { specialVariableSlot } from "../cual-runtime/store.ts";
import { linkCalls } from "../cual-runtime/link.ts";
import type { Procedures } from "../cual-runtime/link.ts";
import { allocateSlots, withoutDeclarations } from "../cual-runtime/slots.ts";
import type { Allocation } from "../cual-runtime/slots.ts";
import type { LdCodeBlock, LdDefinition, LdFile, LdNode } from "./parser.ts";
import type { Kind } from "./level-data.ts";

/** The name upstream gives the global blob's `Sorte`. */
const GLOBAL_NAME = "global";
/** And the per-player one. */
const SEMIGLOBAL_NAME = "semiglobal";

/** One `da_kind` slot: which variable, and what it is set to when a kind changes. */
export interface ReappliedDefault {
  readonly slot: number;
  readonly value: number;
}

/** A level's program, ready to execute. */
export interface LevelProgram {
  /**
   * Every procedure in scope, by name, with bodies as written.
   *
   * Unlinked on purpose: a call site links the body itself, so each call gets its own busy
   * numbers, which is upstream's `neueBusyNummern` and the difference between a plain call and
   * `&name`.
   */
  readonly procedures: Procedures;
  /** Per kind index, the code it runs on `event_draw`; `null` when it has none. */
  readonly drawCode: readonly (readonly Stmt[] | null)[];
  /** The `global` blob's code, or `null`. Upstream gives these two no default. */
  readonly globalCode: readonly Stmt[] | null;
  /** The `semiglobal` blob's code, or `null`. */
  readonly semiglobalCode: readonly Stmt[] | null;
  /** Where declared variables and busy flags live, and how long a blob's array is. */
  readonly allocation: Allocation;
  /**
   * The configuration's `da_kind` slots: every `var x = v : reapply` and
   * `default x = v : reapply`, as `{ slot, value }`.
   *
   * What `setKindIntern` re-applies when a blob's kind changes (`src/blop.cpp`), and the one
   * part of `KindChange` the compiled trees cannot answer: `linkCalls` **drops** `var` and
   * `default` nodes, on the grounds that upstream keeps them as definitions rather than code,
   * so `program.drawCode` contains no declaration at all. Collecting them here — from the
   * blocks as parsed, which is the only place they exist — is the same argument that put the
   * slot *allocation* here.
   *
   * **`value` is resolved at build time, so a default that is not a constant is refused**
   * rather than silently becoming 0. `jump.ld` writes `var farbe = farben : reapply` where
   * `farben` is a compile-time constant from `globals.ld`, so the corpus is fine; an expression
   * would have no value to re-apply at kind-change time anyway, since `getDefault(i)` is read
   * rather than evaluated.
   *
   * **One list for every kind, not one per kind.** Upstream's `Sorte` copies its defaults from
   * the configuration (`quelle->getDefaultArt(i)`), and every `reapply` in the corpus is
   * declared at level level — `jump.ld`, `flechtwerk.ld`, `dungeon.ld`, `jahreszeiten.ld` all put
   * theirs in the section's own top-level `<< >>`. `cual.6` also describes giving *one kind* a
   * different default, which would need a per-kind list; that is recorded rather than claimed,
   * because nothing in the 79 levels uses the form.
   */
  readonly kindDefaults: readonly ReappliedDefault[];
  /**
   * Calls nothing in scope answered.
   *
   * Collected rather than thrown, because a level has usually several and reporting the first
   * means five rounds of fix, re-run, find the next. `execute.ts` still throws when it reaches
   * one of these at run time, naming the procedure.
   */
  readonly unresolved: readonly { readonly owner: string; readonly name: string }[];
}

/**
 * A program with nothing in it: no procedures, no kind with code, no global or semiglobal.
 *
 * For the hand-written fixtures in `fixtures.ts`, which transcribe a level's *data* and never
 * had its Cual — they predate the `.ld` parser and exist so the engine and renderer are
 * playable. Exported rather than cast at the use site, so that "this level has no code" is a
 * value with a name and a fixture that later grows real code has somewhere to put it.
 *
 * The allocation is over an empty tree, which yields the special variables and nothing else:
 * the smallest array `getDatenLaenge` can be, since `speicherGlobaleVordefinierte` reserves
 * those before anything else is parsed. A fixture blob therefore gets a valid array with no
 * user variables in it, which is the truth about a fixture.
 */
export const EMPTY_PROGRAM: LevelProgram = {
  procedures: new Map(),
  drawCode: [],
  globalCode: null,
  semiglobalCode: null,
  allocation: allocateSlots([]),
  // No declarations, so no `da_kind` defaults: a fixture has no `var` lines at all, which is
  // what "its allocation is over an empty tree" already said about its slot count.
  kindDefaults: [],
  unresolved: [],
};
/**
 * The `<< >>` blocks of a file, in the order upstream would read them.
 *
 * Recursive, because a kind's code is not at the top level: `Baggis={ … << level code >>
 * sbKaese={ … << sbKaese = {…} >> } … }`, so a kind's block sits inside the *level's* section
 * and one level of walking finds the level's own code and none of the kinds'. That was the first
 * version's bug and it failed quietly rather than loudly — `Baggis` reported 0 of 7 kinds with
 * their own code when all 7 have.
 *
 * **A section's own code is emitted before its nested definitions.** That is not source order
 * and cannot be: `LdSection` keeps `code` and `definitions` as two separate lists with nothing
 * relating their positions. It is the order the corpus needs, though, since a level declares
 * its procedures in its own top-level block and its kinds call them. Getting it the other way
 * round would refuse every one of those calls, which is a loud failure rather than a silent
 * one, so the residual risk is in the acceptable direction.
 */
function codeBlocksOf(file: LdFile): LdCodeBlock[] {
  const blocks: LdCodeBlock[] = [...file.code];
  const descend = (definitions: readonly LdDefinition[]): void => {
    for (const definition of definitions) {
      const value: LdNode = definition.value;
      // A definition's value is a section for anything with braces; a bare word has none, and a
      // bare word cannot hold code, so there is nothing to take.
      if (value.type !== "section") continue;
      blocks.push(...value.code);
      descend(value.definitions);
    }
  };
  descend(file.definitions);
  return blocks;
}

/**
 * One `<< >>` block as statements.
 *
 * The block's tokens are already lexed by the `.ld` parser, so this is only the Cual parser and
 * the frame markers a hand-lexed block would carry. A syntax error is re-thrown with the file
 * and line, because there are 79 levels here and "Cual: expected an expression" with no
 * position is not something anyone can act on.
 */
function parseBlock(block: LdCodeBlock, file: string): Stmt[] {
  const tokens = block.tokens.filter(
    (token) => token.kind !== "beginCode" && token.kind !== "endCode",
  );
  if (tokens.length === 0) return [];
  try {
    return parseCode(tokens);
  } catch (error) {
    if (error instanceof CualSyntaxError) {
      throw new Error(`${file}:${block.pos.line}: Cual: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

/**
 * The program for one level: globals first, then this level's own definitions.
 *
 * `kinds` is only read for the *names* to look up, because that is the whole of the lookup
 * rule — the code a kind runs is a procedure with the kind's name, and a kind's picture count
 * has already been turned into `defaultCode` by `kinds.ts` while the picture list was still in
 * hand.
 */
/**
 * The `da_kind` defaults, collected from the blocks as parsed.
 *
 * Walked alongside the definitions rather than inside the per-procedure loop, because a `var`
 * line is a `code_zeile` in its own right and belongs to the block rather than to a procedure —
 * `jump.ld` writes nine `var` lines and then its procedures, and the allocation pass treats them
 * the same way.
 *
 * `defaultDecl` overwrites an earlier `varDecl` for the same name, which is the whole point of
 * `default`: "Changes the default for already defined variables". Upstream's `neuerDefault`
 * keeps the slot and replaces the value, so this replaces rather than appends too.
 */
function collectKindDefaults(
  blocks: readonly Stmt[][],
  SLOTS_BY_NAME: ReadonlyMap<string, number>,
  levelConstant: ((name: string) => number) | undefined,
): ReappliedDefault[] {
  const bySlot = new Map<number, ReappliedDefault>();
  const take = (
    declarations: readonly (VarDeclaration | DefaultDeclaration)[],
  ): void => {
    for (const declaration of declarations) {
      if (!declaration.reapply) continue;
      // **A system variable counts as declared.** `cual.6` on `default`: "Also, the default of a
      // system variable can be changed this way." — and `silbergold.ld` does exactly that,
      // `default inhibit = 1 : reapply`, with no `var` anywhere near it. Refusing it named the
      // file and the level and was otherwise a plausible-looking rule: `inhibit` is slot 8 and
      // `specialVariableSlot` knows it, so the lookup order is declared names first (a level may
      // shadow a system name) and system names second.
      const slot = SLOTS_BY_NAME.get(declaration.name) ?? specialVariableSlot(declaration.name);
      if (slot < 0) {
        // Neither a `var` nor a system variable. Upstream's `neuerDefault` throws, and a level
        // relying on the order being different would be relying on a throw, so the name is
        // reported rather than the declaration skipped.
        throw new Error(
          `Cual: '${declaration.name}' is re-applied but no \`var\` declares it and it is not a ` +
            `system variable either. Upstream refuses a default for a name that is neither.`,
        );
      }
      bySlot.set(slot, { slot, value: constantValue(declaration, declaration.name, levelConstant) });
    }
  };
  for (const statements of blocks) {
    for (const node of statements) {
      if (node.kind === "varDecl") take(node.declarations);
      else if (node.kind === "defaultDecl") take(node.declarations);
    }
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/**
 * A default's value, folded at build time because upstream folds it while parsing.
 *
 * `src/parser.yy`'s `echter_default: konstante`, and `konstante` is not just a number or a
 * name — it is `zahl | wort | '(' konstante ')' | '-' konstante | konstante '+' konstante` and
 * the other three arithmetic operators, each action computing the value. So
 * `silbergold.ld`'s `default inhibit = DIR_LLU+DIR_LLD+DIR_RRD+DIR_RRU : reapply` is valid Cual
 * and upstream has the number 0x20080010 long before any blob exists.
 *
 * Which is what this does, and it **reuses the evaluator** rather than writing a second folder:
 * the operators, their precedence and `divv`/`modd`'s rounding are 3.2's and `divmod.ts`'s, and a
 * hand-rolled folder would be a second answer to the same question. What makes it a *constant*
 * folder is the context — a name resolves through `resolveConstant` or nothing — so anything
 * needing a value (`x + 1`), a draw (`rnd`) or a board (a neighbour pattern, an address) fails
 * rather than inventing one. `konstante` has none of those either.
 */
function constantValue(
  declaration: VarDeclaration | DefaultDeclaration,
  name: string,
  levelConstant: ((name: string) => number) | undefined,
): number {
  // A `var x : reapply` with no `= value` declares zero, and `cual.6` says so: "If no default is
  // specified, zero is used." So the two declaration kinds differ in *where* the value is, not in
  // what a missing one is — `unechter_default` is the empty production giving 0.
  const expr =
    "initial" in declaration
      ? declaration.initial
      : ("value" in declaration ? declaration.value : null);
  if (expr === null) return 0;
  try {
    return evaluate(expr, {
      variable: (variable) => {
        // `konstante: wort` looks the name up in the level data, and Cual's own names are not
        // reachable from here — `konstante` has no `variable_acode`. So the level's namespace is
        // tried first and `resolveConstant` second, and the two do not overlap: `farben` is a
        // `.ld` number and `DIR_LLU` is Cual's.
        if (levelConstant !== undefined) {
          try {
            return levelConstant(variable);
          } catch {
            // Not a level constant; fall through to Cual's table.
          }
        }
        const resolved = resolveConstant(variable);
        if (resolved === null) {
          throw new Error(`'${variable}' is not a compile-time constant`);
        }
        return resolved;
      },
      // `konstante` has no `rnd`, so reaching one means the expression is not a constant.
      random: () => {
        throw new Error("rnd is not allowed in a default value");
      },
    });
  } catch (error) {
    throw new Error(
      `Cual: the re-applied default for '${name}' is not a constant ` +
        `(${error instanceof Error ? error.message : String(error)}). A kind change re-applies ` +
        `the declared default rather than evaluating it, so it has to fold to a number.`,
      { cause: error },
    );
  }
}

export function buildLevelProgram(
  level: LdFile,
  globals: LdFile,
  kinds: readonly Kind[],
  /**
   * `konstante`'s name lookup, for folding a `reapply` default.
   *
   * `parser.yy:konstante` resolves a bare word with `getVerwandten(name, mVersion, false)` —
   * the *level data* namespace, not Cual's. `jump.ld` writes `var farbe = farben : reapply`,
   * and `farben` is a number the `.ld` file defines, so without this the corpus does not load.
   *
   * `scope.nameResolver()` is that lookup. Optional because a program with no `reapply` default
   * never calls it, and the synthetic levels in the tests have none — but a default that *does*
   * name a level constant without a resolver is an error rather than a silent 0.
   */
  levelConstant?: (name: string) => number,
): LevelProgram {
  const wanted = new Set(kinds.map((kind) => kind.name));
  const scope = new Map<string, readonly Stmt[]>();
  const drawByName = new Map<string, readonly Stmt[]>();
  const globalsByName = new Map<string, readonly Stmt[]>();
  const unresolved: { owner: string; name: string }[] = [];
  /** As parsed and in order, because the allocation is numbered from them. */
  const parsedBlocks: Stmt[][] = [];

  // Every definition, in the order the two files are read. Globals first, so a level that
  // defines `schema16` or `default2` itself shadows the global — which is what loading both
  // into one config does upstream.
  const files: readonly [LdFile, string][] = [
    [globals, "globals.ld"],
    [level, level.filename],
  ];

  for (const [file, name] of files) {
    for (const block of codeBlocksOf(file)) {
      const statements = parseBlock(block, name);
      parsedBlocks.push(statements);

      // Source order within the block, and each body is linked against the scope *before* it
      // joins. That is the whole of Cual's lack of recursion; see the header.
      for (const node of statements) {
        if (node.kind !== "procedureDef") continue;
        const linked = linkCalls([node.body], scope);
        for (const miss of linked.unresolved) unresolved.push({ owner: node.name, name: miss.name });

        if (wanted.has(node.name)) drawByName.set(node.name, linked.statements);
        else if (node.name === GLOBAL_NAME) globalsByName.set(GLOBAL_NAME, linked.statements);
        else if (node.name === SEMIGLOBAL_NAME) {
          globalsByName.set(SEMIGLOBAL_NAME, linked.statements);
        }
        // The *unlinked* body, so every call site links it again and gets its own flags.
        scope.set(node.name, [node.body]);
      }
    }
  }

  const drawCode = kinds.map((kind) => {
    const own = drawByName.get(kind.name);
    if (own !== undefined) return own;
    // `sorte.cpp:104`: no code of its own, so a default — and only if it has pictures at all.
    if (kind.defaultCode === null) return null;
    const fallback = scope.get(kind.defaultCode);
    if (fallback === undefined) {
      unresolved.push({ owner: kind.name, name: kind.defaultCode });
      return null;
    }
    const linked = linkCalls(fallback, scope);
    for (const miss of linked.unresolved) unresolved.push({ owner: kind.name, name: miss.name });
    return linked.statements;
  });

  // ## One allocator over *both* trees, and why that is not optional
  //
  // The slot pass needs the blocks **as parsed** for its declarations and the **linked** trees for
  // its busy flags, and the two halves cannot be had separately:
  //
  // - `linkCalls` drops `var` and `default` nodes, because upstream keeps them as definitions
  //   rather than code. Allocating over the linked trees would therefore find no declarations at
  //   all and hand back an array too short for every user variable in the level.
  // - A plain call **splices a copy** of the procedure's body into the caller, with fresh busy
  //   numbers (`neueBusyNummern`), so the copy's comma sequences are *different objects* from the
  //   parsed ones and appear in no allocation made over the parsed blocks.
  //
  // The second half is what 15.5 found, and it is not a small gap: **every kind's draw code in
  // the corpus is a spliced procedure**, so before this the first `,` in any level's animation
  // threw "a comma sequence has no busy slot, so allocateSlots was not run on this tree". Nothing
  // in the project had run a level's code, so nothing had noticed.
  //
  // Both in one call, so the two sets of flag numbers come from one counter and cannot collide. A
  // node the two trees share — a kind's own `switch`, say, which is not inside any procedure — is
  // visited twice and renumbered on the second visit, which is harmless: the map is keyed by node
  // and nothing anywhere holds a bit number but this map.
  const allocation = allocateSlots(
    [...parsedBlocks.flat(), ...drawCode.flatMap((code) => withoutDeclarations(code ?? []))],
    { bodiesLinked: true },
  );
  // After the allocation, because a default's *slot* is what it is keyed by and the allocator is
  // the only thing that knows the numbering.
  const kindDefaults = collectKindDefaults(
    parsedBlocks,
    allocation.declaredSlots,
    levelConstant,
  );

  return {
    procedures: scope,
    drawCode,
    globalCode: globalsByName.get(GLOBAL_NAME) ?? null,
    semiglobalCode: globalsByName.get(SEMIGLOBAL_NAME) ?? null,
    allocation,
    kindDefaults,
    unresolved,
  };
}
