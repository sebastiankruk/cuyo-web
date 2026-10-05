/**
 * Tests for the predefined names a `.ld` file may use.
 *
 * The table is transcribed from `src/knoten.cpp`'s `const_namen`/`const_werte`,
 * and the neighbour half of it is transcribed *again* in `game-core/constants.ts`
 * as the `NeighbourMode` enum. Asserting the two agree is worth more than either
 * transcription on its own: they come from the same `sorte.h` enum, read by
 * different people at different times, and a level that resolves
 * `<neighbours_hex4>` to 2 because one of the two slipped would mis-connect
 * every blob of that kind rather than fail to load.
 */

import { describe, expect, it } from "vitest";
import { CUAL_CONSTANTS, DIR, Q_ALL } from "./cual-constants.ts";
import { NeighbourMode } from "../game-core/constants.ts";
import { Version } from "./version.ts";
import { DefinitionScope, rootScope } from "./scope.ts";

describe("the predefined names", () => {
  it("resolve the ten neighbour modes to the same values as the game core", () => {
    const expected: readonly (readonly [string, NeighbourMode])[] = [
      ["neighbours_rect", NeighbourMode.Rect],
      ["neighbours_diagonal", NeighbourMode.Diagonal],
      ["neighbours_hex6", NeighbourMode.Hex6],
      ["neighbours_hex4", NeighbourMode.Hex4],
      ["neighbours_knight", NeighbourMode.Knight],
      ["neighbours_eight", NeighbourMode.Eight],
      ["neighbours_3D", NeighbourMode.ThreeD],
      ["neighbours_none", NeighbourMode.None],
      ["neighbours_horizontal", NeighbourMode.Horizontal],
      ["neighbours_vertical", NeighbourMode.Vertical],
    ];
    for (const [name, mode] of expected) {
      expect(CUAL_CONSTANTS.get(name), name).toBe(mode);
    }
  });

  it("names the ten neighbour modes in `sorte.h`'s enum order", () => {
    const names = [...CUAL_CONSTANTS.entries()]
      .filter(([n]) => n.startsWith("neighbours_"))
      .map(([n, v]) => ({ n, v }));
    expect(names.map((e) => e.v)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("gives the blob kinds their negative numbers", () => {
    // `blopart_keins`, `blopart_global`, `blopart_semiglobal`, `blopart_info`
    // and `blopart_ausserhalb` in `sorte.h`; all negative, so a real kind's
    // number can never be mistaken for one of them.
    expect(CUAL_CONSTANTS.get("nothing")).toBe(-1);
    expect(CUAL_CONSTANTS.get("global")).toBe(-2);
    expect(CUAL_CONSTANTS.get("semiglobal")).toBe(-3);
    expect(CUAL_CONSTANTS.get("info")).toBe(-4);
    expect(CUAL_CONSTANTS.get("outside")).toBe(-5);
  });

  it("gives the behaviour bits the values `blop.h` assigns them", () => {
    expect(CUAL_CONSTANTS.get("explodes_on_size")).toBe(1);
    expect(CUAL_CONSTANTS.get("explodes_on_explosion")).toBe(2);
    expect(CUAL_CONSTANTS.get("explodes_on_chain_reaction")).toBe(4);
    expect(CUAL_CONSTANTS.get("calculate_size")).toBe(8);
    expect(CUAL_CONSTANTS.get("goalblob")).toBe(16);
    expect(CUAL_CONSTANTS.get("floats")).toBe(32);
  });

  it("gives Q_ALL the value the whole picture is drawn with", () => {
    // `src/bilddatei.h:#define viertel_alle (-1)`, which is why it is -1 rather
    // than 0 like the other quarters.
    expect(Q_ALL).toBe(-1);
    expect(CUAL_CONSTANTS.get("Q_ALL")).toBe(-1);
    expect(CUAL_CONSTANTS.get("Q_TL")).toBe(0);
    expect(CUAL_CONSTANTS.get("Q_TR")).toBe(5);
    expect(CUAL_CONSTANTS.get("Q_BL")).toBe(10);
    expect(CUAL_CONSTANTS.get("Q_BR")).toBe(15);
  });

  it("gives the sixteen sub-quarters every value from 0 to 15 exactly once", () => {
    const sub = [...CUAL_CONSTANTS.entries()].filter(([n]) =>
      /^Q_(TL|TR|BL|BR)_(TL|TR|BL|BR)$/.test(n),
    );
    expect(sub).toHaveLength(16);
    expect(sub.map(([, v]) => v).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => i),
    );
  });

  it("gives the direction constants single bits, with a gap before the diagonals", () => {
    const values = Object.values(DIR);
    expect(values).toHaveLength(18);
    for (const v of values) {
      expect(v > 0 && (v & (v - 1)) === 0, `${v} is not a single bit`).toBe(true);
    }
    // The first nine are the 3x3 neighbourhood row-major; the second nine start
    // a factor of 256 later, which is how upstream writes them and is not a gap
    // to be tidied up.
    expect(DIR.U).toBe(0x1);
    expect(DIR.F).toBe(0x100);
    expect(DIR.D).toBe(0x10000);
    expect(DIR.B).toBe(0x1000000);
  });

  it("registers the direction constants under their prefixed names", () => {
    // **The name is `DIR_U`, not `U`.** Upstream's `knoten.cpp:99` lists all eighteen as
    // `"DIR_U", "DIR_UR", ... "DIR_B"`, and the port builds them by spreading `Object.entries(DIR)`
    // — whose keys are the bare suffixes. That registered `U`, `UR`, `R`, ... and left every
    // `DIR_*` name undefined in every scope, which is invisible here and visible only where a
    // level uses one: `kachelnR.ld:43` writes `inhibit_alle = <DIR_U+DIR_UR+DIR_DR+DIR_D+DIR_DL+
    // DIR_UL>`, and with `DIR_U` missing that expression does not resolve, so one kind in one level
    // read an unset variable where it meant a direction mask.
    //
    // The test that would not have caught it is the one above: it checks the *values* in `DIR` and
    // `DIR.U` is perfectly correct. What matters is the name the rest of the program looks up.
    for (const [suffix, value] of Object.entries(DIR)) {
      expect(CUAL_CONSTANTS.get(`DIR_${suffix}`), `DIR_${suffix}`).toBe(value);
    }
    // And nothing is registered under the bare suffix, which is what went wrong. `U` and `D` are
    // short enough that some future level could plausibly use them as an ordinary name, so a
    // stray entry is a real hazard rather than a cosmetic one.
    expect(CUAL_CONSTANTS.has("U")).toBe(false);
    expect(CUAL_CONSTANTS.has("D")).toBe(false);
    expect([...CUAL_CONSTANTS.keys()].filter((name) => name.startsWith("DIR_"))).toHaveLength(18);
  });

  it("is in scope for a level, unqualified and at every version", () => {
    // The property levels actually rely on: `aliens.ld` writes
    // `neighbours = <neighbours_none>` inside a kind's own section, where
    // nothing else is in scope, and it resolves through the root.
    const root = rootScope("test.ld", Version.of("1", "main"));
    const level = new DefinitionScope("Level", root, Version.of("1", "main"), "test.ld");
    level.defineNumber("neighbours", 2);
    expect(level.inherited("neighbours_none", { line: 1, col: 1 }).values).toEqual([
      { type: "number", value: 7 },
    ]);
  });

  it("can be shadowed by a level, as upstream allows", () => {
    // `fuegeEin` refuses a duplicate name and version, so a level that redefines
    // one of these at the root gets an error rather than a silent override. A
    // versioned redefinition is a different version and is allowed.
    const root = rootScope("test.ld", Version.of("1", "main"));
    expect(() => root.defineNumber("neighbours_none", 0)).toThrow(
      /"neighbours_none" already defined/,
    );
    const scoped = new DefinitionScope("Kind", root, Version.of("1", "main"), "test.ld");
    scoped.defineNumber("neighbours_none", 0);
    // A section's own definition shadows the root's, which is what makes a
    // per-kind override possible at all.
    expect(scoped.inherited("neighbours_none", { line: 1, col: 1 }).values).toEqual([
      { type: "number", value: 0 },
    ]);
  });

  it("lets a level add a name of its own", () => {
    // Custom specifiers and constants are ordinary definitions; the version
    // machinery in `version.ts` is what treats the specifier names specially.
    const root = rootScope("test.ld", Version.of("1", "main"));
    root.defineNumber("banane", 42);
    const level = new DefinitionScope("Level", root, Version.of("1", "main"), "test.ld");
    expect(level.nameResolver()("banane", { line: 1, col: 1 })).toBe(42);
  });

  it("does not resolve a name to a list of several values", () => {
    // `getEinzigesDatum` throws when the implicit length is not 1, so a
    // two-entry list cannot be used as a number in `<...>`.
    const root = new DefinitionScope("", undefined, Version.of("1", "main"), "test.ld");
    root.define("zwei", Version.empty, {
      type: "list",
      items: [
        { type: "datum", value: { type: "number", value: 1 }, pos: { line: 1, col: 1 } },
        { type: "datum", value: { type: "number", value: 2 }, pos: { line: 1, col: 1 } },
      ],
      pos: { line: 1, col: 1 },
    }, { line: 1, col: 1 });
    const resolver = root.nameResolver();
    expect(() => resolver("zwei", { line: 1, col: 1 })).toThrow(
      /is a list of 2 values and cannot be used as a number/,
    );
  });

  it("reports a name that nothing defines", () => {
    const root = rootScope("test.ld", Version.of("1", "main"));
    expect(() => root.nameResolver()("gibtsnicht", { line: 7, col: 3 })).toThrow(
      /gibtsnicht required but not defined/,
    );
  });
});
