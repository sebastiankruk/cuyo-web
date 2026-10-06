// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * `startdist` decoding: the level's initial board, written as characters.
 *
 * The format is the fiddliest part of the level description and it is
 * simultaneously the most precisely documented - `cual.6`'s STARTDIST section
 * gives worked examples for the version offsets, which is what makes it testable
 * rather than guessable.
 *
 * ### What a key is
 *
 * Every cell is described by a key of `distkeyLen` characters. A key is read by
 * `liesDistKey` as one of:
 *
 *  - the six single characters `.` `+` `-` `*` `%` `&`, which map to negative
 *    sentinels;
 *  - otherwise a base-62 number over `0-9A-Za-z`, with leading spaces allowed
 *    once so that a multi-character key can be padded. The all-space key is
 *    refused.
 *
 * A number names a kind and a version together: the kind is the one whose
 * `distkey` is the **largest not exceeding** the number, and the version is the
 * difference. That is why the digits are ordered `9 < A < Z < a` and why the
 * maximum `distkey` matters - it is a base-62 predecessor search, not a lookup.
 *
 * ### What the rows are
 *
 * Rows are bottom-aligned and listed top row first, so the first row written is
 * the highest. A row is 10 or 20 characters; at 20 the first half is the left
 * player and the second the right, so one row describes both. With more than one
 * key character per cell the lengths are multiplied accordingly.
 *
 * ### The informational last row
 *
 * The last row may instead be 4 or 8 keys, describing the informational blobs
 * beside the board rather than blobs on it. Four covers the left player; eight
 * covers both, and **the right player's four are in reversed order** - which is
 * easy to miss and is the kind of thing a test has to pin.
 */

import { LdParseError } from "./parser.ts";
import { GRX, GRY } from "../game-core/constants.ts";
import type { KindTable } from "./kinds.ts";
import {
  DIST_KEY_CHAINREACTION,
  DIST_KEY_FARBE,
  DIST_KEY_GRAU,
  DIST_KEY_GRAS,
  DIST_KEY_LEER,
  DIST_KEY_NEIGHBOURS,
  decodeDistKey,
} from "./kinds.ts";
import type { DefinitionScope } from "./scope.ts";

/** `src/spielfeld.h`'s `infoblop_*` enum, in order. */
export const INFO_GREY = 0;
export const INFO_GRASS = 1;
export const INFO_NEIGHBOURS = 2;
export const INFO_CHAINREACTION = 3;
export const INFO_COUNT = 4;

/** What a cell's key asks for. */
export type CellChoice =
  | { readonly kind: "empty" }
  /** A kind drawn at random from one of the three weighted pools. */
  | { readonly kind: "random"; readonly pool: "colour" | "grey" | "goal" }
  | { readonly kind: "info"; readonly what: "neighbours" | "chainreaction" }
  /** A named kind with a version, once the distkey search has resolved it. */
  | { readonly kind: "named"; readonly kindId: number; readonly version: number };

/**
 * The keys' characters per cell.
 *
 * Upstream derives this from the kinds' own `distkey`s - every kind that declares
 * one must declare the same length - and falls back to 1 when none does. That is
 * `LevelDaten::mDistKeyLen`, with the `if (mDistKeyLen==0) mDistKeyLen=1` from
 * `ladLevel` applied.
 */
export function distKeyLen(table: KindTable): number {
  let len = 0;
  for (const key of table.kinds) {
    if (key.distKey === null) continue;
    if (len === 0) len = key.distKey.length;
    // A mismatch is refused by `liesDistKey` itself, which throws "distkey ...
    // does not have length %d as others do". Reading it here too would mean
    // duplicating that message; `startDist` catches it.
  }
  return len === 0 ? 1 : len;
}

/** One decoded `startdist` row, before the rows are placed on the board. */
export interface StartRow {
  /** The cells, left to right, left player first. */
  readonly cells: readonly CellChoice[];
  /** False for the informational last row. */
  readonly isBoardRow: boolean;
}

/** The decoded informational row, one entry per info blob. */
export interface InfoRow {
  readonly grey: CellChoice;
  readonly grass: CellChoice;
  readonly neighbours: CellChoice;
  readonly chainReaction: CellChoice;
}

/**
 * The decoded `startdist`.
 *
 * Rows are stored top row first, as written. Placing them bottom-aligned is
 * {@link placeRows}'s job, because that depends on how many rows there are and
 * two players share one set.
 */
export interface StartDist {
  /** The board rows, top row first. Empty when the last row was informational. */
  readonly rows: readonly StartRow[];
  /** The informational row, or null when the last row was a board row. */
  readonly info: InfoRow | null;
  /** Characters per cell. */
  readonly keyLen: number;
  /** True when the rows described both players, i.e. are 20 keys wide. */
  readonly twoPlayers: boolean;
}

/**
 * Reads a level's `startdist`.
 *
 * @param level the level section
 * @param table the level's kinds, for the distkey search
 * @param twoPlayer true when the game is two-player, which picks the half of a
 *   20-key row and the half of an 8-key informational row
 */
export function readStartDist(
  level: DefinitionScope,
  table: KindTable,
  twoPlayer = false,
): StartDist {
  const list = level.ownList("startdist");
  if (list === undefined || list.values.length === 0) {
    throw new LdParseError(
      `${level.where()}: startdist required but not defined`,
      level.positionOf("startdist").line,
      level.positionOf("startdist").col,
      level.filename,
    );
  }
  const raw = list.values.map((v) => {
    if (v.type === "number") {
      throw new LdParseError(
        `${level.where()}: startdist row ${v.value} is a number, not a row`,
        list.pos.line,
        list.pos.col,
        level.filename,
      );
    }
    return v.text;
  });
  return decodeStartDist(raw, table, twoPlayer, {
    line: list.pos.line,
    col: list.pos.col,
    filename: level.filename,
    where: level.where(),
  });
}

/** Where a `startdist` problem is, so the error can point at it. */
export interface StartDistOrigin {
  readonly line: number;
  readonly col: number;
  readonly filename: string;
  readonly where: string;
}

/**
 * Decodes `startdist` rows.
 *
 * Separated from {@link readStartDist} so it can be tested against the man page's
 * examples without building a whole level around them.
 */
export function decodeStartDist(
  rows: readonly string[],
  table: KindTable,
  twoPlayer: boolean,
  origin: StartDistOrigin,
): StartDist {
  const keyLen = distKeyLen(table);
  const last = rows[rows.length - 1] as string;
  const lastLen = last.length;

  const fail = (message: string): never => {
    throw new LdParseError(
      `${origin.where}: ${message}`,
      origin.line,
      origin.col,
      origin.filename,
    );
  };

  // `withinfos`: the last row is 4 or 8 keys rather than 10 or 20.
  //
  // Written as nested ternaries so `fail` is reached by returning rather than by
  // falling out of an `else`: a `const` arrow returning `never` is not a
  // never-returning call for the compiler's flow analysis, so the `let` plus
  // `else` version left `withInfos` "used before assigned" even though it never
  // was.
  const boardWidth = GRX * keyLen;
  const twoWidth = boardWidth * 2;
  const withInfos =
    lastLen === boardWidth || lastLen === twoWidth
      ? false
      : lastLen === INFO_COUNT * keyLen || lastLen === INFO_COUNT * 2 * keyLen
        ? true
        : fail(
            `Wrong length for last startdist line: ${lastLen} characters, but ` +
              `${boardWidth}, ${twoWidth}, ${INFO_COUNT * keyLen} or ` +
              `${INFO_COUNT * 2 * keyLen} expected, because all values for ` +
              `distkey have length ${keyLen}`,
          );

  const normalRows = withInfos ? rows.slice(0, -1) : [...rows];
  const decoded: StartRow[] = normalRows.map((row) => ({
    cells: decodeBoardRow(row, table, twoPlayer, keyLen, fail),
    isBoardRow: true,
  }));

  let info: InfoRow | null = null;
  if (withInfos) {
    // Eight keys means both players, and the right player's four run backwards.
    // The index is `mid(len*(2*infoblop_anz-1-i), len)` - which is 7-i, i.e. the
    // *second half* read backwards, not the first half reversed. Getting that
    // backwards twice gives the left player's answers again, which is why the
    // tests use four distinguishable versions rather than four identical keys.
    const reverse = last.length === INFO_COUNT * 2 * keyLen && twoPlayer;
    const at = (i: number): CellChoice =>
      decodeKey(last.slice(i * keyLen, i * keyLen + keyLen), table, fail);
    const e = [0, 1, 2, 3].map((i) => at(reverse ? INFO_COUNT * 2 - 1 - i : i));
    info = {
      grey: e[0] as CellChoice,
      grass: e[1] as CellChoice,
      neighbours: e[2] as CellChoice,
      chainReaction: e[3] as CellChoice,
    };
  }

  // Read the *raw* row lengths, not the decoded ones: a decoded row holds one
  // player's ten cells whichever half was read, so its length says nothing about
  // whether the row was twenty keys wide.
  const twoPlayers =
    normalRows.some((r) => r.length === twoWidth) ||
    (withInfos && last.length === INFO_COUNT * 2 * keyLen);

  return { rows: decoded, info, keyLen, twoPlayers };
}

function decodeBoardRow(
  row: string,
  table: KindTable,
  twoPlayer: boolean,
  keyLen: number,
  fail: (message: string) => never,
): readonly CellChoice[] {
  const boardWidth = GRX * keyLen;
  const twoWidth = boardWidth * 2;
  if (row.length !== boardWidth && row.length !== twoWidth) {
    fail(
      `Wrong length for startdist line: ${row.length} characters, but ` +
        `${boardWidth} or ${twoWidth} expected, because all values for ` +
        `distkey have length ${keyLen}`,
    );
  }
  // A 20-key row describes both players; the right player reads the second half.
  const offset = row.length > boardWidth && twoPlayer ? boardWidth : 0;
  const out: CellChoice[] = [];
  for (let x = 0; x < GRX; x++) {
    const at = (offset + x) * keyLen;
    out.push(decodeKey(row.slice(at, at + keyLen), table, fail));
  }
  return out;
}

/** One key: `liesDistKey` then `startDistBlop`. */
function decodeKey(
  key: string,
  table: KindTable,
  fail: (message: string) => never,
): CellChoice {
  const value = decodeDistKeyStrict(key, fail);
  switch (value) {
    case DIST_KEY_LEER:
      return { kind: "empty" };
    case DIST_KEY_FARBE:
      return { kind: "random", pool: "colour" };
    case DIST_KEY_GRAU:
      return { kind: "random", pool: "grey" };
    case DIST_KEY_GRAS:
      return { kind: "random", pool: "goal" };
    case DIST_KEY_NEIGHBOURS:
      return { kind: "info", what: "neighbours" };
    case DIST_KEY_CHAINREACTION:
      return { kind: "info", what: "chainreaction" };
    default:
      break;
  }
  return namedByDistKey(key, value, table, fail);
}

/** `liesDistKey`, turning its two refusals into `startdist` diagnostics. */
function decodeDistKeyStrict(key: string, fail: (message: string) => never): number {
  const value = decodeDistKey(key);
  if (value === undefined) {
    fail(`"${key}" is not a legal distkey`);
  }
  return value;
}

/**
 * The base-62 predecessor search.
 *
 * "The maximal `distkey` which does not come after the character, specifies the
 * blob's kind. The difference between the character and the `distkey` then
 * specifies the blob's version."
 *
 * Kinds with no `distkey` are skipped - `distkey_undef` is excluded upstream by
 * the `distkey != distkey_undef` test rather than by the comparison, because
 * `distkey_undef` is -7 and would otherwise win every search.
 */
function namedByDistKey(
  key: string,
  value: number,
  table: KindTable,
  fail: (message: string) => never,
): CellChoice {
  let bestKey: number | undefined;
  let bestKind = -1;
  for (const kind of table.kinds) {
    if (kind.distKey === null) continue;
    const distKey = decodeDistKeyStrict(kind.distKey, fail);
    if (distKey <= value && (bestKey === undefined || distKey > bestKey)) {
      bestKey = distKey;
      bestKind = kind.id;
    }
  }
  if (bestKey === undefined) {
    fail(`"${key}" used as a distkey but no such distkey specified`);
  }
  return { kind: "named", kindId: bestKind, version: value - (bestKey as number) };
}

/**
 * The board a `startdist` describes: 20 rows of 10 cells, bottom-aligned.
 *
 * `y = gry - normallines + i`, so the first row written is the highest and the
 * last is the bottom row. Rows above the written ones stay empty, which is what a
 * level that starts with an empty sky means.
 */
export function placeRows(dist: StartDist): readonly (readonly CellChoice[])[] {
  const board: CellChoice[][] = Array.from({ length: GRY }, () =>
    Array.from({ length: GRX }, (): CellChoice => ({ kind: "empty" })),
  );
  const first = GRY - dist.rows.length;
  for (let i = 0; i < dist.rows.length; i++) {
    const row = dist.rows[i] as StartRow;
    for (let x = 0; x < GRX; x++) {
      const cell = row.cells[x];
      if (cell !== undefined) board[first + i]![x] = cell;
    }
  }
  return board;
}
