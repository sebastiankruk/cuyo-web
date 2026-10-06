// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Structured load diagnostics.
 *
 * Every failure in the level pipeline has the same shape - a file, a definition inside
 * it, and a reason - and every one of them has to survive being reported to someone
 * who is not looking at this code. So they are modelled as one type rather than as
 * whatever an `Error` subclass happened to be carrying, and formatted once.
 *
 * Two properties are deliberate:
 *
 * - A diagnostic is *data*. A validator that throws gives you the first failure and
 *   stops; this project needs the opposite, because a level set is only useful if all
 *   of it works and the question during development is always "which of these 237
 *   level sections is broken".
 * - The reason has a stable code. Messages get reworded; codes do not, so a test can
 *   assert on the code and a machine can act on it, and neither breaks when the prose
 *   improves.
 */

import { EXPLODES_ON_SIZE } from "../game-core/constants.ts";
import type { Kind } from "./level-data.ts";

/** Stable identifiers for the failures worth distinguishing. */
export type DiagnosticCode =
  /** The file would not tokenise. */
  | "lex"
  /** The tokens would not parse. */
  | "parse"
  /** A kind names a picture the manifest does not carry. */
  | "art-key"
  /** A `startdist` row is the wrong length for its distkey. */
  | "row-length"
  /** `numexplode` is needed and never set, at any level. */
  | "numexplode-undefined"
  /** A `distkey` is not a legal key, or its length disagrees with the others. */
  | "distkey"
  /** A name the level uses was never defined. */
  | "undefined-name"
  /** A declaration needs a list or a value and has the wrong kind of thing. */
  | "declaration-kind"
  /** The level's own settings are out of range or inconsistent. */
  | "settings"
  /** The kind table could not be built. */
  | "kinds"
  /** The `startdist` could not be decoded or laid out. */
  | "startdist"
  /** The neighbour mode is one this engine does not implement. */
  | "neighbours"
  /** A level declares no `startdist`. */
  | "no-startdist";

/** One thing wrong with one level, in a form that can be reported or asserted on. */
export interface LevelDiagnostic {
  readonly code: DiagnosticCode;
  /** The file the level came from, for a message a reader can act on. */
  readonly file: string;
  /** The definition inside it, e.g. `Ziehlen`. */
  readonly definition: string;
  /** The resolved version, as a display string. */
  readonly version: string;
  /** Single-player or two-player halves of a `startdist`. */
  readonly twoPlayers: boolean;
  /** The reason, in prose. */
  readonly message: string;
  /** Line in the source file, when known. */
  readonly line?: number;
  /** Column in the source file, when known. */
  readonly col?: number;
}

/**
 * Formats a diagnostic for a terminal or a log.
 *
 * The order is file, definition, version, then reason - the order in which someone
 * opens things. The two-player suffix is on the version rather than at the end
 * because `maze.ld` declares four `startdist`s and which of them failed is the whole
 * question.
 */
export function formatDiagnostic(d: LevelDiagnostic): string {
  const parts = [
    `${d.file}:${d.line ?? 0}:${d.col ?? 0}`,
    `error[${d.code}]`,
    `${d.definition}[${d.version}]${d.twoPlayers ? " (2P)" : ""}`,
    d.message,
  ];
  return parts.join(" ");
}

/** Collects diagnostics so a validator can report every failure, not just the first. */
export class DiagnosticBag {
  private readonly items: LevelDiagnostic[] = [];

  add(d: LevelDiagnostic): void {
    this.items.push(d);
  }

  get length(): number {
    return this.items.length;
  }

  all(): readonly LevelDiagnostic[] {
    return this.items;
  }

  /** True when nothing was reported. */
  get ok(): boolean {
    return this.items.length === 0;
  }

  /** Every diagnostic, formatted. */
  format(): string[] {
    return this.items.map(formatDiagnostic);
  }

  /**
   * Every diagnostic of one code, for a test or a caller that wants to be specific.
   */
  byCode(code: DiagnosticCode): readonly LevelDiagnostic[] {
    return this.items.filter((d) => d.code === code);
  }

  /** Merges another bag's contents, so nested stages can accumulate. */
  absorb(other: DiagnosticBag): void {
    for (const d of other.all()) this.items.push(d);
  }
}

/** Where a diagnostic came from, for the stages that all need it. */
export interface DiagnosticOrigin {
  readonly file: string;
  readonly definition: string;
  readonly version: string;
  readonly twoPlayers: boolean;
}

/** The outcome of a stage that can fail. */
export type Captured<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostic: LevelDiagnostic };

/**
 * Runs `stage`, turning anything it throws into a diagnostic.
 *
 * Returns a union rather than throwing, and that is the whole design. A validator
 * that catches exceptions has to decide at every stage whether a throw is expected,
 * which is how a stage's *own* crash gets reported as a data error. Here there is
 * nothing to catch: a stage either produced a value or produced a diagnostic, and a
 * caller handles both without an exception path.
 *
 * Nothing gets to decide its own reporting either. A `startdist` decoder throwing a
 * bare `Error`, a kind table throwing a `TypeError`, and a lexer throwing
 * `LdLexError` all become the same shape, so the caller sees one list rather than
 * having to know which exceptions to expect.
 */
export function capture<T>(
  origin: DiagnosticOrigin,
  code: DiagnosticCode,
  stage: () => T,
): Captured<T> {
  try {
    return { ok: true, value: stage() };
  } catch (error) {
    const e = error as Error & {
      line?: number;
      col?: number;
      diagnostic?: LevelDiagnostic;
    };
    // A stage that already shaped its own diagnostic keeps it: it knows more than the
    // generic wrapper does, and second-guessing it would lose the detail.
    if (e.diagnostic !== undefined) {
      return { ok: false, diagnostic: e.diagnostic };
    }
    return {
      ok: false,
      diagnostic: {
        code,
        file: origin.file,
        definition: origin.definition,
        version: origin.version,
        twoPlayers: origin.twoPlayers,
        message: e.message,
        ...(typeof e.line === "number" ? { line: e.line } : {}),
        ...(typeof e.col === "number" ? { col: e.col } : {}),
      },
    };
  }
}

/** Attaches a shaped diagnostic to an error, for a stage that has better detail. */
export function withDiagnostic(
  error: Error,
  diagnostic: LevelDiagnostic,
): Error {
  Object.defineProperty(error, "diagnostic", {
    value: diagnostic,
    enumerable: false,
  });
  return error;
}

/**
 * `numexplode` unset on a kind that needs one.
 *
 * Upstream's condition, from `Sorte::Sorte`: the check is guarded by the kind having
 * the explodes-on-size behaviour. A kind *without* it may leave `numexplode` unset,
 * and several real levels rely on that - `Grau` (a grey blob), `inGras` (a goal
 * blob), `igGo`, `aCantorSet`. They never detonate on size, so they have no use for
 * the number.
 *
 * An earlier version of this file reported any unset `numexplode`, and it failed 48 of
 * 474 level sections on the real corpus. That was not 48 broken levels; it was one
 * wrong condition reported 48 times, found by checking what upstream actually does
 * rather than what seemed reasonable.
 */
export function undefinedExplode(
  kind: Kind,
  origin: DiagnosticOrigin,
): LevelDiagnostic {
  return {
    code: "numexplode-undefined",
    file: origin.file,
    definition: origin.definition,
    version: origin.version,
    twoPlayers: origin.twoPlayers,
    message:
      `Kind ${kind.name} detonates on size but has no numexplode, and the ` +
      `level-wide numexplode is unset too, so it can never detonate. Upstream ` +
      `throws "numexplode undefined for ${kind.name}" at load; set numexplode on ` +
      `the kind, or on the level to set it for every kind.`,
  };
}

/** True when a kind needs a `numexplode` it might not have. */
export function needsNumExplode(kind: Kind): boolean {
  return (kind.behaviour & EXPLODES_ON_SIZE) !== 0;
}
