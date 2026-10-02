/**
 * Neighbour patterns: `1???0???` and its five- and seven-character relatives.
 *
 * Task 3.10, and the whole mechanism is three short pieces of upstream:
 *
 * - `newNachbarCode` (`code.cpp`) turns the pattern string into two bit numbers: a *mask* of
 *   every specified position, and a *value* of the positions that are `1`. The test is then
 *   `(connections & mask) == value`, which is why one comparison covers both requirements.
 * - `getBesitzVerbindungen` (`blopgitter.cpp`) builds a blob's connection bitmask from the
 *   board.
 * - `verbindetMit` (`blop.cpp`) compares `getVariableVergangenheit(spezvar_kind)` — the kind
 *   **as of the beginning of the step**. That is where the start-of-step snapshot comes from;
 *   it is not a separate mechanism, it is the same shadow copy task 3.8 built.
 *
 * And one fact that looks like a special case and is not: `cual.6` says that for an empty
 * blob, a direction with no neighbour because the field ends there still counts as `1`. There
 * is no code for that. `sorte.cpp` has `mVerbindetMitRand[i] = mBlopart == blopart_keins`, so
 * the *empty sort* connects with all four edges and every other sort connects with none. The
 * rule is a property of level data, and reading it from the man page alone would have led to
 * a hard-coded `true`.
 */

/**
 * The eight directions, in pattern order.
 *
 * The order is the bit order of `verbindung_*` in `blopbesitzer.h`, which is "starting above
 * and going clockwise". It is *not* the order `getBesitzVerbindungen` tests them in - that
 * function sets links and rechts first, because it is writing bits rather than reading them.
 */
export const DIRECTIONS = [
  "oben",
  "ro",
  "rechts",
  "ru",
  "unten",
  "lu",
  "links",
  "lo",
] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** `verbindung_*` from `blopbesitzer.h`. The index in {@link DIRECTIONS} is the bit shift. */
export const CONNECTION_BIT: Readonly<Record<Direction, number>> = {
  oben: 0x0001,
  ro: 0x0002,
  rechts: 0x0004,
  ru: 0x0008,
  unten: 0x0010,
  lu: 0x0020,
  links: 0x0040,
  lo: 0x0080,
};

/** `verbindung_solo`: what a blob with no owner at all reports. */
export const CONNECTION_SOLO = 0x0100;

/** The two orthogonal directions, which hex mode does not have. */
const HORIZONTAL: readonly Direction[] = ["rechts", "links"];

/** One mask/value pair, which is what `nachbar_acode` stores in `mZahl`/`mZahl2`. */
export interface NeighbourPattern {
  /** Bits for every position that is not `?`. */
  readonly mask: number;
  /** Bits for every position that is `1`. */
  readonly value: number;
  /** 6 in hex mode, 8 otherwise. */
  readonly length: 6 | 8;
}

/**
 * `newNachbarCode`: a pattern string as a mask and a value.
 *
 * The subtle part is the hex case. A six-character pattern skips the two horizontal
 * directions, but upstream does not renumber - it inserts a *gap* in the bit numbering, by
 * doubling the bit once more after characters 1 and 4:
 *
 *     if (l == 6 && (i == 1 || i == 4)) bit *= 2;
 *
 * So `1?1?1?` in hex mode tests bits 0, 1, 3, 4, 5, 7 and leaves bits 2 and 6 - `rechts`
 * and `links` - unused. Renumbering instead would give a six-character pattern the wrong
 * meaning in hex and the right one only by accident.
 *
 * @throws if the pattern is not six or eight characters of `0`, `1` and `?`.
 */
export function neighbourPattern(pattern: string): NeighbourPattern {
  if (pattern.length !== 6 && pattern.length !== 8) {
    throw new Error(
      `Cual: a neighbour pattern is six or eight characters, got ${pattern.length} ('${pattern}')`,
    );
  }
  let mask = 0;
  let value = 0;
  let bit = 1;
  for (let i = 0; i < pattern.length; i += 1) {
    const character = pattern[i];
    if (character !== "0" && character !== "1" && character !== "?") {
      throw new Error(
        `Cual: a neighbour pattern is made of '0', '1' and '?', got '${character}' in '${pattern}'`,
      );
    }
    if (character !== "?") mask |= bit;
    if (character === "1") value |= bit;
    bit *= 2;
    if (pattern.length === 6 && (i === 1 || i === 4)) bit *= 2;
  }
  return { mask, value, length: pattern.length as 6 | 8 };
}

/** `nachbar_acode`'s eval: `(connections & mask) == value`. */
export function matchesNeighbourPattern(connections: number, pattern: string): boolean {
  const { mask, value } = neighbourPattern(pattern);
  return (connections & mask) === value;
}

/**
 * The board as a neighbour pattern needs to see it.
 *
 * `kindAt` is required rather than optional, and it must return the **beginning-of-step**
 * kind. That is the whole snapshot mechanism, and making it a required argument rather than
 * an option is the point: the live kind would compile and run and quietly answer a different
 * question, which is the failure `cual.6` warns about in the sentence right below the empty
 * blob rule.
 */
export interface NeighbourField {
  readonly width: number;
  readonly height: number;
  readonly hex: boolean;
  /** Mirrors the level, swapping the vertical axis and the diagonals' slope. */
  readonly mirrored: boolean;
  /** `getHexShift(x)`: which way column `x`'s diagonal neighbours are offset. Square mode ignores it. */
  readonly hexShift?: (x: number) => boolean;
  /**
   * The kind at a cell, or `emptyKind` if there is none there.
   *
   * Must read the start-of-step kind: `BlobStore.getAlt(SPEZVAR_KIND)`.
   */
  kindAt(x: number, y: number): number;
  /**
   * Which kind counts as "nothing there".
   *
   * The empty sort is the only one that connects with a board edge
   * (`mVerbindetMitRand[i] = mBlopart == blopart_keins`), so this one value decides both the
   * off-board rule and what "of the same kind" means for an empty cell.
   */
  readonly emptyKind: number;
}

/**
 * `getBesitzVerbindungen`: the connection bitmask for the blob at `x, y`.
 *
 * Two rules, and they are not the same rule:
 *
 * - **On board**, a direction connects iff the two kinds are equal — compared as of the
 *   beginning of the step. So for an empty blob an occupied neighbour does *not* connect,
 *   which is what makes `1???0???` mean "nothing above me, something below me".
 * - **Off board**, a direction connects iff *this* blob is empty. Not "if this blob's kind
 *   says so" as a general rule: `cual.6` states it for empty blobs because the empty sort is
 *   the only sort with the edge special, so the general rule and the special case coincide.
 */
export function connectionsAt(field: NeighbourField, x: number, y: number): number {
  const here = field.kindAt(x, y);
  let connections = 0;

  for (const direction of DIRECTIONS) {
    if (field.hex && HORIZONTAL.includes(direction)) continue;

    const [dx, dy] = offsetFor(field, direction, x);
    const nx = x + dx;
    const ny = y + dy;

    let connects: boolean;
    if (nx < 0 || nx >= field.width || ny < 0 || ny >= field.height) {
      // Off the board: the empty sort connects with the edge, every other does not.
      connects = here === field.emptyKind;
    } else {
      connects = here === field.kindAt(nx, ny);
    }
    if (connects) connections |= CONNECTION_BIT[direction];
  }

  if (!field.mirrored) return connections;
  return swapBits(swapBits(swapBits(connections, "oben", "unten"), "lo", "lu"), "ro", "ru");
}

/**
 * Where a direction's neighbour sits, as `(dx, dy)`.
 *
 * `getBesitzVerbindungen` computes two shifts rather than eight offsets: `os` is how far up
 * the left-hand diagonals reach and `us` how far down, and in square mode both are 1. In hex
 * mode one column's diagonals go up-and-across and its neighbour's go down-and-across, which
 * is what `getHexShift` reports per column.
 */
function offsetFor(field: NeighbourField, direction: Direction, x: number): [number, number] {
  const shift = field.hexShift?.(x) ?? false;
  const os = field.hex ? Number(shift) : 1;
  const us = field.hex ? Number(!shift) : 1;
  switch (direction) {
    case "oben":
      return [0, -1];
    case "unten":
      return [0, 1];
    case "rechts":
      return [1, 0];
    case "links":
      return [-1, 0];
    case "ro":
      return [1, -os];
    case "ru":
      return [1, us];
    case "lo":
      return [-1, -os];
    case "lu":
      return [-1, us];
  }
}

/**
 * `TAUSCH_BITS` from `getBesitzVerbindungen`: exchange two bits if exactly one is set.
 *
 * Only when exactly one is set - a pair that is both set or both clear is already symmetric,
 * and swapping it would be a no-op at best.
 */
export function swapBits(value: number, a: Direction, b: Direction): number {
  const bitA = CONNECTION_BIT[a];
  const bitB = CONNECTION_BIT[b];
  const both = bitA + bitB;
  const present = value & both;
  if (present !== 0 && present !== both) return value ^ both;
  return value;
}

/**
 * The connection bitmask as the pattern string it would match, `'?'` where unspecified.
 *
 * Not something upstream needs - it works in bitmasks - but the whole specification of a
 * pattern is its characters, so a test that reads one back is easier to check against
 * `cual.6` than a hexadecimal number is.
 */
export function connectionString(connections: number, hex = false): string {
  // Filtering `DIRECTIONS` rather than taking a slice, because the hex bit numbering has gaps:
  // the six hex directions are not six consecutive bits.
  const ordered = DIRECTIONS.filter((d) => !hex || !HORIZONTAL.includes(d));
  return ordered
    .map((direction) => ((connections & CONNECTION_BIT[direction]) === 0 ? "0" : "1"))
    .join("");
}
