/**
 * Tests for the structured diagnostics.
 *
 * Task 2.12 names three cases - an unresolvable art key, a wrong row length, and an
 * undefined `numexplode` - and each has to produce a *specific* error rather than a
 * generic one. "Specific" is what these tests pin: the code, and the presence of the
 * facts someone needs to act on it.
 *
 * The fourth test is the one that cost the most to get right and is here because the
 * mistake is easy to repeat. An undefined `numexplode` is an error only for kinds
 * that detonate on size; for every other kind it is legal, and several real levels
 * rely on that.
 */

import { describe, expect, it } from "vitest";
import {
  DiagnosticBag,
  capture,
  formatDiagnostic,
  needsNumExplode,
  undefinedExplode,
  withDiagnostic,
} from "./diagnostics.ts";
import type { DiagnosticOrigin } from "./diagnostics.ts";
import { ArtKeyError, artManifest, resolveArtKey } from "./art.ts";
import { EXPLODES_ON_SIZE } from "../game-core/constants.ts";
import type { Kind } from "./level-data.ts";

const ORIGIN: DiagnosticOrigin = {
  file: "hormone.ld",
  definition: "Hormone",
  version: "[1,main]",
  twoPlayers: false,
};

function kind(over: Partial<Kind> = {}): Kind {
  return {
    id: 0,
    name: "inGruen",
    role: "colour",
    artKey: "inGruen.xpm",
    pictures: ["inGruen.xpm"],
    versions: 1,
    weight: 1,
    behaviour: EXPLODES_ON_SIZE,
    numexplode: 6,
    colourProb: 1,
    greyProb: 0,
    goalProb: 0,
    distKey: null,
    defaultCode: null,
    drawCode: null,
    ...over,
  };
}

describe("capture", () => {
  it("returns the value when a stage succeeds", () => {
    const result = capture(ORIGIN, "kinds", () => 42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it("turns any throw into a diagnostic, whatever its type", () => {
    // The point of the wrapper: the caller has one shape to handle, so it never needs
    // to know whether a stage throws an `Error`, a `TypeError` or something from a
    // library.
    for (const thrown of [
      new Error("plain"),
      new TypeError("wrong type"),
      { message: "not even an Error" },
    ]) {
      const result = capture(ORIGIN, "kinds", () => {
        throw thrown;
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.code).toBe("kinds");
        expect(result.diagnostic.file).toBe("hormone.ld");
        expect(result.diagnostic.definition).toBe("Hormone");
      }
    }
  });

  it("keeps a diagnostic the stage built for itself", () => {
    // A stage that knows more than the wrapper does should not have its detail
    // replaced by the wrapper's generic message.
    const specific = undefinedExplode(kind({ numexplode: -1 }), ORIGIN);
    const result = capture(ORIGIN, "kinds", () => {
      throw withDiagnostic(new Error("generic"), specific);
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic).toBe(specific);
  });

  it("carries a source position through when the error has one", () => {
    const result = capture(ORIGIN, "parse", () => {
      const e = new Error("bad token") as Error & { line: number; col: number };
      e.line = 12;
      e.col = 4;
      throw e;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.line).toBe(12);
      expect(result.diagnostic.col).toBe(4);
    }
  });

  it("omits the position when there is none", () => {
    // Reporting `:0:0` as though it were a real position is worse than reporting
    // none: it sends someone to the top of the file.
    const result = capture(ORIGIN, "parse", () => {
      throw new Error("no position");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostic.line).toBeUndefined();
  });
});

describe("the three diagnostics task 2.12 names", () => {
  it("an unresolvable art key names the key, the kind and the origin", () => {
    const m = artManifest([]);
    const result = capture(ORIGIN, "art-key", () =>
      resolveArtKey(m, "fehlt.xpm", "inBunt", "hormone.ld"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("art-key");
    expect(result.diagnostic.message).toContain("fehlt.xpm");
    expect(result.diagnostic.message).toContain("inBunt");
    expect(result.diagnostic.file).toBe("hormone.ld");
  });

  it("a wrong row length says what was expected", () => {
    // The diagnostic has to carry the numbers, not just "wrong length", or the
    // reader has to go and count characters themselves.
    const result = capture(ORIGIN, "row-length", () => {
      throw new Error(
        "Wrong length for startdist line: 9 characters, but 10 or 20 expected, " +
          "because all values for distkey have length 1",
      );
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("row-length");
    expect(result.diagnostic.message).toContain("9 characters");
    expect(result.diagnostic.message).toContain("10 or 20 expected");
  });

  it("an undefined numexplode names the kind and both places to fix it", () => {
    const d = undefinedExplode(kind({ name: "igGo", numexplode: -1 }), ORIGIN);
    expect(d.code).toBe("numexplode-undefined");
    expect(d.message).toContain("igGo");
    expect(d.message).toContain("on the kind");
    expect(d.message).toContain("on the level");
  });
});

describe("needsNumExplode", () => {
  it("is true only for kinds that detonate on size", () => {
    // Upstream's guard, from `Sorte::Sorte`: "if ((behaviour & platzt_bei_gewicht)
    // != 0)". Everything else may leave numexplode unset.
    expect(needsNumExplode(kind({ behaviour: EXPLODES_ON_SIZE }))).toBe(true);
    expect(needsNumExplode(kind({ behaviour: 0 }))).toBe(false);
    expect(needsNumExplode(kind({ behaviour: 8 }))).toBe(false); // CALCULATE_SIZE only
    expect(needsNumExplode(kind({ behaviour: EXPLODES_ON_SIZE | 8 }))).toBe(
      true,
    );
  });

  it("does not report a kind that never detonates on size", () => {
    // The mistake this replaced: reporting any unset `numexplode` failed 48 of 474
    // real level sections, because grey and goal blobs generally never detonate on
    // size and legitimately leave it unset.
    for (const role of ["grey", "grass"] as const) {
      const k = kind({ role, behaviour: 0, numexplode: -1 });
      expect(needsNumExplode(k), `${role} kind`).toBe(false);
    }
  });
});

describe("DiagnosticBag", () => {
  it("collects every failure rather than stopping at the first", () => {
    // A level set is only useful in full, so "which of these are broken" is always
    // the question - not "what went wrong first".
    const bag = new DiagnosticBag();
    bag.add(undefinedExplode(kind({ name: "a", numexplode: -1 }), ORIGIN));
    bag.add(undefinedExplode(kind({ name: "b", numexplode: -1 }), ORIGIN));
    expect(bag.ok).toBe(false);
    expect(bag.length).toBe(2);
    expect(bag.byCode("numexplode-undefined")).toHaveLength(2);
    expect(bag.byCode("art-key")).toHaveLength(0);
  });

  it("is ok when nothing was reported", () => {
    const bag = new DiagnosticBag();
    expect(bag.ok).toBe(true);
    expect(bag.format()).toEqual([]);
  });

  it("formats file, code, definition, version and reason in that order", () => {
    // The order someone opens things in.
    const line = formatDiagnostic({
      code: "art-key",
      file: "hormone.ld",
      definition: "Hormone",
      version: "[2,main]",
      twoPlayers: true,
      message: "Kind inBunt names picture x.xpm.",
      line: 7,
      col: 3,
    });
    expect(line).toBe(
      "hormone.ld:7:3 error[art-key] Hormone[[2,main]] (2P) Kind inBunt names picture x.xpm.",
    );
  });

  it("marks the two-player half, because which half failed is the question", () => {
    // `maze.ld` declares four `startdist`s and gets a different board from each, so
    // "which one" is most of the diagnostic.
    const single = formatDiagnostic({
      code: "row-length",
      file: "maze.ld",
      definition: "Maze",
      version: "[1,main]",
      twoPlayers: false,
      message: "bad row",
    });
    const twin = formatDiagnostic({
      code: "row-length",
      file: "maze.ld",
      definition: "Maze",
      version: "[1,main]",
      twoPlayers: true,
      message: "bad row",
    });
    expect(single).not.toContain("2P");
    expect(twin).toContain("(2P)");
  });

  it("absorbs another bag", () => {
    const a = new DiagnosticBag();
    a.add(undefinedExplode(kind({ name: "x", numexplode: -1 }), ORIGIN));
    const b = new DiagnosticBag();
    b.add(undefinedExplode(kind({ name: "y", numexplode: -1 }), ORIGIN));
    a.absorb(b);
    expect(a.length).toBe(2);
  });
});

describe("ArtKeyError", () => {
  it("carries its fields as data, not just in the message", () => {
    const e = new ArtKeyError("k.xpm", "K", "f.ld");
    expect(e.key).toBe("k.xpm");
    expect(e.kind).toBe("K");
    expect(e.origin).toBe("f.ld");
    expect(e.name).toBe("ArtKeyError");
  });
});
