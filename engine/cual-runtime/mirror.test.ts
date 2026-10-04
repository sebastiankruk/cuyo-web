/**
 * `mirror`: where a flipped level is handled, and which of those places are checked.
 *
 * Task 5.20. Upstream reads `ld->mSpiegeln` in **eight** places across four files, and they are
 * not all the same kind of work — which is the reason this file exists rather than four more
 * assertions in four other files. A behaviour spread over five modules and only half tested is
 * how a sixth site gets forgotten, and "I already handled mirror" is the exact sentence that
 * would be said afterwards.
 *
 * The eight, with what each is:
 *
 * | upstream                | what                                             | where        |
 * | ----------------------- | ------------------------------------------------ | ------------ |
 * | `blop.cpp:570,573`      | `loc_x` / `loc_y` report `grx-1-x`, `gry-1-y`    | `constants.ts` |
 * | `blopgitter.cpp:182`    | three `TAUSCH_BITS` over the connection bits     | `neighbours.ts` |
 * | `ort.cpp:268`           | `@(dx,dy)` negates `dy`, and inverts "odd" in hex | `access.ts`  |
 * | `fall.cpp:389`          | the rotation's blob swap is inverted             | `simulation.ts` |
 * | `bildstapel.cpp:165`    | the picture stack's `yy` is flipped              | group 7      |
 * | `spielfeld.cpp:301`     | the background image's `y`                       | group 7      |
 * | `spielfeld.cpp:383,429` | the chase border's rect, via `spiegelRect`       | group 7      |
 * | `fall.cpp:464,571`      | the unplaced preview, and a draw-cache key       | group 7      |
 * | `kiplayer.cpp:158`      | the AI player's key handling                    | not ported   |
 *
 * **Four are engine and four are drawing.** The boundary is not a matter of taste: the four
 * drawing ones change where a picture lands on screen and nothing about the simulation, and the
 * chase border is the clearest case — `mHetzrandYPix` grows from zero either way, and only
 * `spiegelRect` moves the rectangle, so a mirrored border *rises* on screen while its value
 * descends. Getting that wrong would make `borderRow()` and the loss condition disagree with
 * what the player sees, and this file says so rather than leaving it to be discovered.
 *
 * ## Two levels in the corpus use it
 *
 * `himmel.ld` (`mirror=1`) and `aliens.ld` (`mirror    = 1`), plus one mention in `summary.ld`
 * that is a comment. `himmel.ld`'s own description is "In which direction do balloons fall?",
 * which is the question the whole feature exists to ask — and it is asked with `@(0,-1)`, the
 * relative address whose `dy` is negated. So the rule below is not a formality: it is the
 * difference between a level that works and one that is upside down.
 */

import { describe, expect, it } from "vitest";
import { readConstant } from "./constants.ts";
import type { BlobPosition, ConstantSubject, ConstantWorld } from "./constants.ts";
import { resolveOrt } from "./access.ts";
import type { AccessField } from "./access.ts";
import { parseExpression } from "./parse.ts";
import { evaluate } from "./expr.ts";
import type { EvalContext, Expr } from "./expr.ts";
import { connectionsAt, connectionString } from "./neighbours.ts";
import { BLOBART_AUSSERHALB, BlobStore, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";
import { decodeLatin1 } from "../level-format/lexer.ts";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LEVELS = resolve(import.meta.dirname, "../../levels/upstream");

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

/**
 * Evaluates the numbers in an address.
 *
 * The real evaluator rather than a stub returning 0: an address's *coordinates* are the whole
 * content of these tests, and a stub would make every one of them answer "my own cell" and pass
 * for the wrong reason — which is exactly how `loc_p` survived being wrong about `right`.
 */
const NUMBERS: EvalContext = {
  variable: (name) => {
    throw new Error(`the test addresses must be constant, got '${name}'`);
  },
  random: () => 0,
};
const number = (expr: Expr): number => evaluate(expr, NUMBERS);

/** A 10x20 field — upstream's `grx`/`gry` — one player, one turn in. */
const WORLD: ConstantWorld = {
  width: 10,
  height: 20,
  players: 1,
  time: 0,
  mirrored: false,
  rowHeight: 8,
  verticalScroll: 0,
  hexShift: () => false,
};

function subject(
  position: BlobPosition = { kind: "cell", x: 3, y: 5, right: false },
  world: Partial<ConstantWorld> = {},
): ConstantSubject {
  return {
    position,
    world: { ...WORLD, ...world },
    chainSize: 0,
    baseKind: BLOBART_AUSSERHALB,
    fall: null,
    fallIndex: 0,
    exploding: 0,
  };
}

function read(name: string, from: ConstantSubject): number {
  const value = readConstant(name, from);
  if (value === null) throw new Error(`'${name}' is not a read-only constant`);
  return value;
}

/** A board, for the addressing and the connections. */
function field(
  here: AccessField["here"],
  mirrored: boolean,
  options: { hex?: boolean; hexShift?: boolean } = {},
): AccessField {
  const slices = new TimeSlices();
  return {
    players: 1,
    width: WORLD.width,
    height: WORLD.height,
    hex: options.hex ?? false,
    mirrored,
    hexShift: () => options.hexShift ?? false,
    global: new BlobStore(20, 13, slices),
    fallCount: 0,
    here,
    semiglobal: () => null,
    at: () => null,
  };
}

/**
 * `@(dx,dy)` resolved from `(x, y)`, on a board that is or is not mirrored.
 *
 * One `@` is the *relative* form and two are the absolute one — the same pair of spellings as
 * for a variable, and getting it backwards is silent, because both produce a cell. An `Ort` only
 * exists after a variable name, so the source carries a name the parser then discards.
 */
function relativeAt(x: number, y: number, dx: number, dy: number, mirrored: boolean): string {
  const board = field({ kind: "cell", x, y, right: false }, mirrored);
  const ort = parseExpression(lex(`XX@(${dx},${dy})`));
  if (ort.kind !== "positioned") throw new Error("expected an address");
  const resolved = resolveOrt(board, ort.position, number);
  return `${resolved.x},${resolved.y}`;
}

describe("loc_x and loc_y report the flipped coordinates", () => {
  it("is `grx-1-x` and `gry-1-y`, and nothing else", () => {
    // `return ld->mSpiegeln ? grx - 1 - mOrt.x : mOrt.x;` — the *field* size, not the canvas.
    // On a 10x20 field, x=3 becomes 6 and y=5 becomes 14.
    const plain = subject();
    const flipped = subject({ kind: "cell", x: 3, y: 5, right: false }, { mirrored: true });
    expect([read("loc_x", plain), read("loc_y", plain)]).toEqual([3, 5]);
    expect([read("loc_x", flipped), read("loc_y", flipped)]).toEqual([6, 14]);
    // The corners, because an off-by-one here would only show at an edge.
    expect(read("loc_x", subject({ kind: "cell", x: 0, y: 0, right: false }, { mirrored: true }))).toBe(9);
    expect(read("loc_y", subject({ kind: "cell", x: 0, y: 0, right: false }, { mirrored: true }))).toBe(19);
    expect(read("loc_x", subject({ kind: "cell", x: 9, y: 19, right: false }, { mirrored: true }))).toBe(0);
    expect(read("loc_y", subject({ kind: "cell", x: 9, y: 19, right: false }, { mirrored: true }))).toBe(0);
  });

  it("does not touch loc_p, which is a side and not a coordinate", () => {
    // `return mOrt.rechts ? 2 : 1;` — no mirror anywhere in it, and a mirrored level does not
    // swap the players' hands.
    for (const mirrored of [false, true]) {
      expect(read("loc_p", subject({ kind: "cell", x: 3, y: 5, right: true }, { mirrored })), `mirrored ${mirrored}`).toBe(2);
      expect(read("loc_p", subject({ kind: "cell", x: 3, y: 5, right: false }, { mirrored })), `mirrored ${mirrored}`).toBe(1);
    }
  });

  it("and only a blob on a cell has either", () => {
    // `case spezconst_loc_x: if (mOrt.art != absort_feld) break;` — a falling piece has no cell,
    // so it falls through to the owner and gets the default, and our version refuses rather than
    // approximating with a cell coordinate (constants.ts says why).
    const flipped = subject({ kind: "fall", x: 4, y: 2, right: false }, { mirrored: true });
    expect(() => read("loc_x", flipped)).toThrow(/pos_fall/);
    expect(() => read("loc_y", flipped)).toThrow(/pos_fall/);
  });
});

describe("@(dx,dy) is negated in y, which is the Himmel rule", () => {
  it("moves down when the level gives -1, and up when it gives 1", () => {
    // Upstream's comment: "Spiegeln für den Himmel-Level: (User will y nach unten eingeben;
    // intern ist y nach oben.)" — the user writes y downwards, internally it is upwards.
    //
    // `himmel.ld` is the level that rule exists for, and it asks `kind@(0,-1)`: "the cell
    // visually below me". Unmirrored that is the row above, which is why the level needs it.
    expect(relativeAt(4, 5, 0, -1, false)).toBe("4,4");
    expect(relativeAt(4, 5, 0, -1, true)).toBe("4,6");
    expect(relativeAt(4, 5, 0, 1, true)).toBe("4,4");
    // x is untouched, because a mirrored level flips vertically and nothing else.
    expect(relativeAt(4, 5, 2, -1, true)).toBe("6,6");
    expect(relativeAt(4, 5, -2, -1, true)).toBe("2,6");
  });

  it("inverts which hex columns count as odd", () => {
    // `if (ld->mSechseck && (dx & 1) && ld->getHexShift(...))` with the comment "Wenn dieses
    // Spiefeld ge-hexflipt ist, 'ungerade' durch 'gerade' ersetzen" — replace odd by even.
    //
    // So on a mirrored hex field the one-cell correction lands on the *even* columns, and the
    // address moves the other way. Only visible with `getHexShift` true, which is what the
    // shifted columns are.
    const shifted = (dx: number, mirrored: boolean): string => {
      const board = field({ kind: "cell", x: 4, y: 5, right: false }, mirrored, {
        hex: true,
        hexShift: true,
      });
      const ort = parseExpression(lex(`XX@(${dx},0)`));
      if (ort.kind !== "positioned") throw new Error("expected an address");
      const resolved = resolveOrt(board, ort.position, number);
      return `${resolved.x},${resolved.y}`;
    };
    // dy = 0 means "slightly diagonally up" on an odd column, so it needs the correction — and
    // on a mirrored field it is the *even* column that needs it, which is the whole of
    // "'ungerade' durch 'gerade' ersetzen". Same `dx`, opposite answer, one boolean.
    expect(shifted(1, false)).toBe("5,4");
    expect(shifted(1, true)).toBe("5,5");
    // And `dx = 2` is the mirror image of that: no correction unmirrored, one mirrored.
    expect(shifted(2, false)).toBe("6,5");
    expect(shifted(2, true)).toBe("6,4");
  });

  it("leaves an absolute address alone", () => {
    // `@@@(x,y)` is `absort_feld` and has no mirror term at all: it is the same cell whichever
    // way the level is drawn, which is the whole point of having two spellings.
    const board = field({ kind: "cell", x: 4, y: 5, right: false }, true);
    const ort = parseExpression(lex(`XX@@(2,3)`));
    if (ort.kind !== "positioned") throw new Error("expected an address");
    const resolved = resolveOrt(board, ort.position, number);
    expect([resolved.x, resolved.y]).toEqual([2, 3]);
  });
});

describe("the neighbour sequence is flipped, so 'above' means above on screen", () => {
  it("swaps the vertical axis and the diagonals' slope", () => {
    // `getBesitzVerbindungen` ends with three `TAUSCH_BITS`: oben/unten, lo/lu, ro/ru. `TAUSCH_BITS`
    // exchanges two bits only when exactly one is set, so a pair that is both set or both clear
    // is left alone.
    const kinds: Record<string, number> = { "4,4": 1, "4,3": 1, "4,5": 2, "4,6": 1 };
    const at = (mirrored: boolean): string => {
      const cells = new Map<string, number>(Object.entries(kinds));
      return connectionString(
        connectionsAt(
          {
            width: 10,
            height: 20,
            hex: false,
            mirrored,
            emptyKind: -1,
            kindAt: (x, y) => cells.get(`${x},${y}`) ?? -1,
          },
          4,
          4,
        ),
      );
    };
    // Unmirrored: above connects, below does not.
    expect(at(false)).toBe("10000000");
    // Mirrored: the cell that was above is reported as below, so the same board reads
    // "00001000" — and a level's `1???0???` therefore inverts with the picture.
    expect(at(true)).toBe("00001000");
  });
});

describe("the two levels that use it", () => {
  it("are himmel.ld and aliens.ld, and both set it", () => {
    // Measured rather than assumed, because a corpus claim that has never been read is the kind
    // that turns out to be one level or none.
    const mirrored: string[] = [];
    for (const file of ["aliens.ld", "himmel.ld", "summary.ld", "unmoeglich.ld"]) {
      const src = decodeLatin1(readFileSync(join(LEVELS, file)));
      const found = src.match(/^\s*mirror\s*=\s*1\s*$/m);
      if (found) mirrored.push(file);
    }
    // `summary.ld` mentions mirror in a comment and is not a level; the other two are.
    expect(mirrored).toEqual(["aliens.ld", "himmel.ld"]);
  });

  it("and himmel.ld is the one that needs the @ rule", () => {
    // Its description is "In which direction do balloons fall?" — which is the question mirror
    // exists to ask — and its Blitz code asks `kind@(0,-1)`, the relative address whose `dy` is
    // negated. So the rule above is not decoration: without it the lightning tests the cell on
    // the wrong side and the level plays wrong.
    const src = decodeLatin1(readFileSync(join(LEVELS, "himmel.ld")));
    expect(src).toMatch(/In which direction do balloons fall\?/);
    expect(src).toMatch(/kind@\(0,-1\)/);
  });

  it("and neither is hex, which is worth knowing", () => {
    // The corpus has one hex level that matters for mirror and it is not one of them: the hex
    // odd-column inversion above has no level to exercise it. Asserted as an absence, because an
    // absence nobody states reads like an oversight rather than a measurement.
    for (const file of ["aliens.ld", "himmel.ld"]) {
      const src = decodeLatin1(readFileSync(join(LEVELS, file)));
      expect(src, file).not.toMatch(/neighbours\s*=\s*neighbours_hex/);
    }
  });
});