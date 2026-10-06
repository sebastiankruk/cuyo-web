// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Definition scopes: the versioned table of a `.ld` section, and the parent
 * chain it is looked up through.
 *
 * Upstream calls the table `DefKnoten::mKinder` and the current section the
 * "squirrel position" - `DatenDatei` reads settings out of whatever section it
 * has descended into, and `DatenDateiPush` descends. Two lookups exist and they
 * are not the same:
 *
 *  - `own`, which is `DatenDatei::getEintragKnoten` → `DefKnoten::getKind` and
 *    looks in the current section only. This is what reads `numexplode`, `pics`,
 *    `distkey` and the rest, and it is why a kind's own section does *not* see
 *    the level-wide `numexplode`: the caller seeds the level-wide value into the
 *    kind's defaults first, and the kind's section may then override it. That is
 *    the whole of the per-kind override rule.
 *  - `inherited`, which is `DefKnoten::getVerwandten` and walks up to the
 *    parent. This is what `<...>` arithmetic and Cual use, and it is why a kind
 *    can name a constant declared in `globals.ld` four levels up.
 *
 * The version is held on the scope rather than passed to every call. Upstream
 * passes `ld->mVersion` explicitly, but that is a single value for a whole load,
 * and threading it through would make every signature noisier for no gain.
 */

import { LdParseError } from "./parser.ts";
import type { LdDefinition, LdNode, LdPos } from "./parser.ts";
import { Version, VersionError, VersionSet } from "./version.ts";
import { definePredefined } from "./cual-constants.ts";
import { resolveList, resolveRuns } from "./values.ts";
import type { NameResolver, ResolvedRun, ResolvedValue } from "./values.ts";

/** A definition, with where it was written and which version wrote it. */
interface Defined {
  readonly value: LdNode;
  readonly pos: LdPos;
  readonly version: Version;
}

/** A definition resolved for the active version. */
export interface ResolvedDefinition {
  readonly values: readonly ResolvedValue[];
  /** Where the definition was written. */
  readonly pos: LdPos;
  /** The version it was found at; empty brackets for an unqualified one. */
  readonly version: Version;
}

/** A definition resolved with its repeat multipliers intact. */
export interface ResolvedRuns {
  readonly runs: readonly ResolvedRun[];
  readonly pos: LdPos;
  readonly version: Version;
}

/**
 * A colour, as `src/color.h` models it.
 *
 * Channels are 0-255 and upstream does not range-check them, so neither does
 * this: a level writing `bgcolor = 999, 0, 0` is passed through and the renderer
 * clamps. Refusing it here would be a rule the original does not have.
 */
export interface Colour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** A definition as it was written: which name, which version, where. */
export interface DefinitionHeader {
  readonly name: string;
  readonly version: Version;
  readonly pos: LdPos;
}

/**
 * The four names that declare kinds, and the kind each one declares.
 *
 * `src/knoten.cpp:gPicsetc` lists the first three; `emptypic` is handled one
 * line below them in `fuegeEin`. The order here is the order `ladSorten` builds
 * kinds in, which is *not* the order they appear in the file - the numbers
 * follow the file, the kind objects follow this list.
 */
export const KIND_LISTS = {
  pics: "colour",
  greypic: "grey",
  startpic: "grass",
  emptypic: "empty",
} as const;

/** One of the four kind-declaring names. */
export type KindList = keyof typeof KIND_LISTS;

/** The kind each declaration list creates. */
export type KindListRole = (typeof KIND_LISTS)[KindList];

/** Whether `name` is one of the four kind-declaring names. */
export function isKindList(name: string): name is KindList {
  return (
    name === "pics" || name === "greypic" || name === "startpic" || name === "emptypic"
  );
}

/**
 * The lists that create numbered kinds.
 *
 * `emptypic` is absent because its constant is `blopart_keins`, which is -1 and
 * is not a slot in the kind array - see `speicherKnotenConst` and the note in
 * `cual.6` that the empty kind's constant's relation to the others is
 * unspecified.
 */
export const NUMBERED_KIND_LISTS: readonly KindList[] = [
  "pics",
  "greypic",
  "startpic",
];

/** `picsEndungWeg`: everything from the first dot, which is a file extension. */
export function stripPicExtension(name: string): string {
  const dot = name.indexOf(".");
  return dot < 0 ? name : name.slice(0, dot);
}

/** A word or a string, which the level format treats alike. */
export type Word = { readonly type: "word" | "string"; readonly text: string };

/** Whether a resolved value is a word. */
export function isWord(value: ResolvedValue): value is Word {
  return value.type === "word" || value.type === "string";
}

/**
 * A file's root scope, with the engine's predefined names in it.
 *
 * `DefKnoten::DefKnoten` calls `speicherGlobaleVordefinierte` before anything
 * else, so `Q_ALL`, `nothing`, the `DIR_*` directions, the behaviour bit names
 * and the ten `neighbours_*` modes are in scope for every section of every level.
 * A level's `<neighbours_hex6>` resolves through here and nowhere else.
 */
export function rootScope(filename: string, version: Version): DefinitionScope {
  const root = new DefinitionScope("", undefined, version, filename);
  definePredefined((name, value) => root.defineNumber(name, value));
  return root;
}

/**
 * One section's definitions, read for one version.
 *
 * Definitions are added in file order and may then be looked up. The
 * `VersionSet` refuses new versions of a name once it has been read, which is
 * upstream's behaviour and the man page's first constraint; see `version.ts`.
 */
export class DefinitionScope {
  private readonly defs = new VersionSet<Defined>();

  /** Where each name was first written, for diagnostics. */
  private readonly positions = new Map<string, LdPos>();

  /**
   * The definitions in the order they were written.
   *
   * Kind numbering depends on this: `fuegeEin` numbers kinds as the file is read,
   * so `pics` written after `greypic` gets the higher constants even though
   * `ladSorten` builds colour kinds first. A `Map` would not do - several names
   * may be defined more than once, at different versions, and all of them take
   * part in the numbering.
   */
  private readonly order: DefinitionHeader[] = [];

  /**
   * @param name the section name, or "" for the file's root node
   * @param parent the enclosing section, which `inherited` looks through
   * @param version the version being played
   * @param filename for diagnostics
   */
  constructor(
    readonly name: string,
    private readonly parent: DefinitionScope | undefined,
    readonly version: Version,
    readonly filename: string,
  ) {}

  /**
   * `DefKnoten::fuegeEin`: records one definition.
   *
   * Upstream also tells the level loader about a level section as it goes, which
   * is how `summary.ld` learns which levels exist. That belongs to the level
   * index in task 2.14 and is not needed here.
   */
  define(name: string, version: Version, value: LdNode, pos: LdPos): void {
    this.defs.add(name, version, { value, pos, version });
    if (!this.positions.has(name)) this.positions.set(name, pos);
    this.order.push({ name, version, pos });
  }

  /** Adds a parsed section body, in file order. */
  defineAll(definitions: readonly LdDefinition[]): void {
    for (const def of definitions) {
      this.define(def.name, Version.of(...def.versions), def.value, def.pos);
    }
  }

  /**
   * Defines a number directly, for the engine's own predefined names.
   *
   * The engine supplies those as ordinary unqualified definitions, so they are
   * ordinary definitions here too - which matters, because a level file is
   * allowed to shadow one, and upstream lets it.
   */
  defineNumber(name: string, value: number): void {
    this.define(
      name,
      Version.empty,
      { type: "list", items: [{ type: "datum", value: { type: "number", value }, pos: { line: 0, col: 0 } }], pos: { line: 0, col: 0 } },
      { line: 0, col: 0 },
    );
  }

  /** Every definition in this section, in the order it was written. */
  definitionsInOrder(): readonly DefinitionHeader[] {
    return this.order;
  }

  /** Whether this scope holds any definition of `name`, at any version. */
  hasOwn(name: string): boolean {
    return this.defs.has(name);
  }

  /** The versions `name` is defined at. */
  versionsOf(name: string): readonly Version[] {
    return this.defs.versionsOf(name);
  }

  /** Where `name` was first written, for a message about it. */
  positionOf(name: string): LdPos {
    return this.positions.get(name) ?? { line: 1, col: 1 };
  }

  /**
   * `getVerwandten`: `name` as resolved for the active version, looking through
   * the parent chain.
   *
   * A name this scope *has* is never answered by the parent, even when no
   * version of it applies - upstream returns the caller's default in that case,
   * and shadowing is exactly how a kind's section overrides a level-wide value.
   */
  inherited(name: string, pos: LdPos): ResolvedDefinition {
    if (!this.defs.has(name)) {
      if (this.parent !== undefined) return this.parent.inherited(name, pos);
      this.fail(`${name} required but not defined`, pos);
    }
    return this.required(name, pos);
  }

  /**
   * `getKind`: `name` as resolved for the active version, looking in this
   * section only.
   *
   * `defaultPresent` is upstream's `defaultVorhanden`, and it is not a detail: it
   * decides whether a name defined only for some versions may fall back to the
   * caller's default or is an error. A colour always has a default, a name never
   * does, and a name with no applicable version is a well-formedness failure
   * rather than a silently absent one.
   */
  own(name: string, defaultPresent: boolean): ResolvedDefinition | undefined {
    const found = this.defs.bestApproximating(name, this.version, defaultPresent);
    if (found === undefined) return undefined;
    return {
      values: this.values(found, name),
      pos: found.pos,
      version: found.version,
    };
  }

  /** As {@link own}, but a name that is absent is an error. */
  requireOwn(name: string, pos: LdPos): ResolvedDefinition {
    const found = this.own(name, false);
    if (found === undefined) this.fail(`${name} required but not defined`, pos);
    return found;
  }

  /**
   * The first entry of a definition, as a word.
   *
   * `DatenDatei::getWortEintragMitDefault` takes `getDatum(0)`, so a longer list
   * yields its first entry rather than an error. A quoted string counts as a
   * word: upstream's scanner returns the same token for both, so `name = "Holes"`
   * and a bare word are indistinguishable here.
   */
  ownWord(name: string, fallback?: string): string | undefined {
    const found = this.own(name, fallback !== undefined);
    if (found === undefined) return fallback;
    const first = found.values[0];
    if (first === undefined) {
      this.fail(`${name} is an empty list, which is not a word`, found.pos);
    }
    if (!isWord(first)) {
      this.fail(`${name} is the number ${first.value} but a word was expected`, found.pos);
    }
    return first.text;
  }

  /** The first entry of a definition, as a number. */
  ownNumber(name: string, fallback: number): number {
    const found = this.own(name, true);
    if (found === undefined) return fallback;
    const first = found.values[0];
    if (first === undefined) {
      this.fail(`${name} is an empty list, which is not a number`, found.pos);
    }
    if (first.type !== "number") {
      this.fail(`${name} is the word '${first.text}' but a number was expected`, found.pos);
    }
    return first.value;
  }

  /**
   * A 0/1 setting.
   *
   * `DatenDatei::getBoolEintragMitDefault` reads a number and then `intZuBool`,
   * which refuses anything but 0 and 1. Every such setting in the corpus is 0 or
   * 1, so the check costs nothing; a level writing 2 gets an error rather than a
   * shrug, as upstream does.
   */
  ownFlag(name: string, fallback: boolean): boolean {
    const value = this.ownNumber(name, fallback ? 1 : 0);
    if (value !== 0 && value !== 1) {
      this.fail(
        `${name} must be 0 or 1, got ${value}`,
        this.positionOf(name),
      );
    }
    return value === 1;
  }

  /** A whole definition, repeats expanded - `DatenDatei::getListenEintrag`. */
  ownList(name: string): ResolvedDefinition | undefined {
    return this.own(name, true);
  }

  /**
   * As {@link ownWord}, but a name that is absent is an error.
   *
   * `getWortEintragOhneDefault`, which is how `name` and `author` are read - a
   * level without a name is not a level.
   */
  requireWord(name: string): string {
    const found = this.own(name, false);
    if (found === undefined) this.fail(`${name} required but not defined`, this.positionOf(name));
    const first = found.values[0];
    if (first === undefined) {
      this.fail(`${name} is an empty list, which is not a word`, found.pos);
    }
    if (!isWord(first)) {
      this.fail(`${name} is the number ${first.value} but a word was expected`, found.pos);
    }
    return first.text;
  }

  /**
   * A colour, which is three numbers.
   *
   * `DatenDatei::getFarbEintragMitDefault` requires a list of exactly three and
   * says "Color (r,g,b) expected" otherwise. Upstream reads the *list* rather
   * than the first entry, so `bgcolor = 255, 255, 255` is a colour and
   * `bgcolor = 255` is an error - the opposite of how `ownNumber` treats a
   * single entry, which is the kind of asymmetry that is easy to get wrong.
   */
  ownColour(name: string, fallback: Colour): Colour {
    const found = this.own(name, true);
    if (found === undefined) return fallback;
    const { values, pos } = found;
    if (values.length !== 3) {
      this.fail(
        `${name} needs three numbers (r,g,b) but has ${values.length}`,
        pos,
      );
    }
    const channel = (i: number): number => {
      const value = values[i];
      if (value === undefined || value.type !== "number") {
        this.fail(`${name} needs three numbers (r,g,b)`, pos);
      }
      return value.value;
    };
    return { r: channel(0), g: channel(1), b: channel(2) };
  }

  /**
   * A whole definition with its repeat multipliers intact.
   *
   * The kind numbering needs this rather than {@link ownList}: a repeated entry
   * occupies several slots, and a name that repeats takes only the first of
   * them, so flattening the list first would lose exactly the information the
   * arithmetic depends on.
   */
  ownRuns(name: string, defaultPresent = false): ResolvedRuns | undefined {
    const found = this.defs.bestApproximating(name, this.version, defaultPresent);
    if (found === undefined) return undefined;
    return { runs: this.runs(found, name), pos: found.pos, version: found.version };
  }

  /**
   * A definition at one *exact* version, ignoring version resolution.
   *
   * `speicherPicsConst` is called once per written definition, each with that
   * definition's own version, and the constants it writes are stored under that
   * version rather than a resolved one. Reading them back has to be exact, or
   * `pics[1]` and `pics[2]` would collide.
   */
  ownRunsAt(name: string, version: Version): ResolvedRuns | undefined {
    if (!this.defs.hasEntry(name, version)) return undefined;
    const found = this.defs.bestApproximating(name, version, false);
    if (found === undefined) return undefined;
    return { runs: this.runs(found, name), pos: found.pos, version: found.version };
  }

  /**
   * A kind's own section as a scope, with this section as its parent.
   *
   * `DatenDateiPush` with `verlange = false`, so a kind whose name has no
   * section of its own gives `undefined` rather than an error - upstream then
   * falls back to using the kind's name as its picture.
   */
  childSection(name: string): DefinitionScope | undefined {
    const found = this.defs.bestApproximating(name, this.version, true);
    if (found === undefined) return undefined;
    if (found.value.type !== "section") {
      this.fail(`${name} is not a section, so it cannot be entered`, found.pos);
    }
    const scope = new DefinitionScope(name, this, this.version, this.filename);
    scope.defineAll(found.value.definitions);
    return scope;
  }

  /**
   * A {@link NameResolver} for `<...>` arithmetic in this scope.
   *
   * `parser.yy:konstante` looks the name up with `getVerwandten` for the active
   * version and `defaultVorhanden = false`, so an undefined name is an error
   * rather than 0. It also demands a single value: `getEinzigesDatum` throws when
   * a definition's implicit length is not 1, so a name resolving to a two-entry
   * list cannot be used as a number.
   */
  nameResolver(): NameResolver {
    return (name, pos) => {
      const found = this.inherited(name, pos);
      if (found.values.length !== 1) {
        this.fail(
          `${name} is a list of ${found.values.length} values and cannot be used as a number`,
          pos,
        );
      }
      const only = found.values[0] as ResolvedValue;
      if (only.type !== "number") {
        this.fail(`${name} is a ${only.type} and not a number`, pos);
      }
      return only.value;
    };
  }

  /** A readable path to this scope, for diagnostics. */
  where(): string {
    return this.name === "" ? "at the top level" : `in section ${this.name}`;
  }

  /** The one version-resolved definition of `name`, or an error. */
  private required(name: string, pos: LdPos): ResolvedDefinition {
    const found = this.defs.bestApproximating(name, this.version, false);
    if (found === undefined) {
      // Unreachable for a name that exists: `defaultPresent` is false, so the
      // well-formedness check has already thrown. Written out because the two
      // failure paths are different errors, and a silent undefined here would
      // surface much later as a confusing crash.
      this.fail(`${name} is not defined for ${this.version}`, pos);
    }
    return {
      values: this.values(found, name),
      pos: found.pos,
      version: found.version,
    };
  }

  /** Resolves a definition's node to plain values. */
  private values(found: Defined, name: string): readonly ResolvedValue[] {
    try {
      return resolveList(found.value, this.nameResolver(), this.filename).values;
    } catch (error) {
      throw this.withContext(error, name, found.pos);
    }
  }

  /** Resolves a definition's node to runs, keeping the repeat multipliers. */
  private runs(found: Defined, name: string): readonly ResolvedRun[] {
    try {
      return resolveRuns(found.value, this.nameResolver(), this.filename);
    } catch (error) {
      throw this.withContext(error, name, found.pos);
    }
  }

  /**
   * Adds `name =` to a failure that came from resolving it.
   *
   * Task 2.12 collects these into structured load diagnostics; until then this
   * is the only context a `<...>` or repeat failure carries, and a bare "division
   * by zero" in a 2000-line level file is not a diagnostic.
   */
  private withContext(error: unknown, name: string, pos: LdPos): unknown {
    const detail =
      error instanceof LdParseError ? error.message : String((error as Error)?.message ?? error);
    return new LdParseError(
      `${this.where()} ${name}: ${detail}`,
      error instanceof LdParseError ? error.line : pos.line,
      error instanceof LdParseError ? error.col : pos.col,
      this.filename,
    );
  }

  private fail(message: string, pos: LdPos): never {
    throw new LdParseError(
      `${this.where()}: ${message}`,
      pos.line,
      pos.col,
      this.filename,
    );
  }
}

/** Re-exported so callers need only one import for the common path. */
export { VersionError };
