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
import type { Stmt } from "../cual-runtime/code.ts";
import { linkCalls } from "../cual-runtime/link.ts";
import type { Procedures } from "../cual-runtime/link.ts";
import { allocateSlots } from "../cual-runtime/slots.ts";
import type { Allocation } from "../cual-runtime/slots.ts";
import type { LdCodeBlock, LdDefinition, LdFile, LdNode } from "./parser.ts";
import type { Kind } from "./level-data.ts";

/** The name upstream gives the global blob's `Sorte`. */
const GLOBAL_NAME = "global";
/** And the per-player one. */
const SEMIGLOBAL_NAME = "semiglobal";

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
export function buildLevelProgram(
  level: LdFile,
  globals: LdFile,
  kinds: readonly Kind[],
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

  const allocation = allocateSlots(parsedBlocks.flat());

  return {
    procedures: scope,
    drawCode,
    globalCode: globalsByName.get(GLOBAL_NAME) ?? null,
    semiglobalCode: globalsByName.get(SEMIGLOBAL_NAME) ?? null,
    allocation,
    unresolved,
  };
}
