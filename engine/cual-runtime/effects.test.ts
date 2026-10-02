/**
 * The five effects, and which player each one reaches.
 *
 * Task 4.12. The claim under test is "reaches the correct player", which sounds like one rule
 * and is four: `bonus` and `message` follow the **asking blob's** side, `sound` follows the
 * asking blob's *position* into a sample set, `explode` does not reach a player at all, and
 * `lose` deliberately does not either — it ends the whole game.
 */

import { describe, expect, it } from "vitest";
import { applyEffect, EFFECTS, routeSample } from "./effects.ts";
import type { EffectContext, PlayedSample } from "./effects.ts";
import type { ResolvedOrt } from "./access.ts";
import { evaluate } from "./expr.ts";
import { parseCode } from "./code.ts";
import { allocateSlots } from "./slots.ts";
import { runCode } from "./execute.ts";
import { BlobStore, TimeSlices } from "./store.ts";
import { tokenize } from "../level-format/lexer.ts";

function lex(source: string) {
  return tokenize(source, "test").filter((t) => t.kind !== "beginCode" && t.kind !== "endCode");
}

const CELL_L: ResolvedOrt = { kind: "cell", x: 1, y: 1, right: false };
const CELL_R: ResolvedOrt = { kind: "cell", x: 1, y: 1, right: true };
const SEMI_R: ResolvedOrt = { kind: "semiglobal", x: 0, y: 0, right: true };
const GLOBAL: ResolvedOrt = { kind: "global", x: 0, y: 0, right: false };

/** A context that records everything it was asked to do. */
function context(overrides: Partial<EffectContext> = {}): EffectContext & {
  readonly calls: string[];
  readonly points: (readonly [boolean, number])[];
  readonly messages: (readonly [boolean, string])[];
  readonly samples: readonly PlayedSample[];
  readonly pops: number;
  readonly losses: number;
} {
  const calls: string[] = [];
  const points: [boolean, number][] = [];
  const messages: [boolean, string][] = [];
  const samples: PlayedSample[] = [];
  let pops = 0;
  let losses = 0;
  const base: EffectContext = {
    here: CELL_L,
    falling: false,
    gridWidth: 4,
    addPoints: (right, n) => {
      points.push([right, n]);
      calls.push(`bonus:${right ? "right" : "left"}:${n}`);
    },
    setMessage: (right, text) => {
      messages.push([right, text]);
      calls.push(`message:${right ? "right" : "left"}:${text}`);
    },
    pop: () => {
      pops += 1;
      calls.push("pop");
    },
    playSample: (played) => {
      samples.push(played);
      calls.push(`sound:${played.set}`);
    },
    playerLost: () => {
      losses += 1;
      calls.push("lose");
    },
    ...overrides,
  };
  return {
    ...base,
    calls,
    points,
    messages,
    samples,
    get pops() {
      return pops;
    },
    get losses() {
      return losses;
    },
  };
}

describe("which player each effect reaches", () => {
  it("scores bonus for the blob's own side", () => {
    // `Cuyo::neuePunkte(mOrt.rechts, pt)` — `mOrt` is the asking blob's position, not the
    // target of any address. So a left-hand blob scores for the left player even if the code
    // it just ran wrote to the other player's field.
    const left = context({ here: CELL_L });
    applyEffect("bonus", { value: 10 }, left);
    const right = context({ here: CELL_R });
    applyEffect("bonus", { value: 10 }, right);
    expect(left.points).toEqual([[false, 10]]);
    expect(right.points).toEqual([[true, 10]]);
  });

  it("shows a message on the blob's own side", () => {
    // `Cuyo::getSpielfeld(mOrt.rechts)->setMessage(mess)` — the same `mOrt.rechts` as `bonus`.
    const left = context({ here: CELL_L });
    const right = context({ here: CELL_R });
    applyEffect("message", { name: "gewonnen" }, left);
    applyEffect("message", { name: "gewonnen" }, right);
    expect(left.messages).toEqual([[false, "gewonnen"]]);
    expect(right.messages).toEqual([[true, "gewonnen"]]);
    // The text is the name as written and is never looked up, so two levels' message names do
    // not have to exist as files.
    expect(left.messages[0][1]).toBe("gewonnen");
  });

  it("ends the whole game on lose, not one player's", () => {
    // `Cuyo::spielerTot()` sets one `mGModus` for the program: `mGModus = gmodus_warte_verloren`.
    // There is no side argument, so there is no way for a level to end only one player's game,
    // and the calling blob's own side makes no difference.
    const fromLeft = context({ here: CELL_L });
    const fromRight = context({ here: CELL_R });
    const fromGlobal = context({ here: GLOBAL });
    for (const ctx of [fromLeft, fromRight, fromGlobal]) applyEffect("lose", null, ctx);
    expect([fromLeft.losses, fromRight.losses, fromGlobal.losses]).toEqual([1, 1, 1]);
    // And it is not routed through `addPoints` or `setMessage` on the way.
    expect(fromLeft.points).toEqual([]);
    expect(fromLeft.messages).toEqual([]);
    expect(fromLeft.calls).toEqual(["lose"]);
  });

  it("pops the blob that asked, which reaches no player at all", () => {
    const left = context({ here: CELL_L });
    const right = context({ here: CELL_R });
    applyEffect("explode", null, left);
    applyEffect("explode", null, right);
    expect([left.pops, right.pops]).toEqual([1, 1]);
    expect(left.points).toEqual([]);
    expect(right.points).toEqual([]);
  });
});

describe("the two that throw in the global blob", () => {
  it("refuses bonus in the global blob, before it looks at the argument", () => {
    // `if (getArt() == blopart_global) throw Fehler("bonus() does not work in the global
    // blob.");` is the first line of `bekommPunkte`, so it fires whatever the argument is.
    expect(() => applyEffect("bonus", { value: 0 }, context({ here: GLOBAL }))).toThrow(
      /bonus\(\) does not work in the global blob/,
    );
  });

  it("refuses message in the global blob", () => {
    expect(() => applyEffect("message", { name: "x" }, context({ here: GLOBAL }))).toThrow(
      /message\(\) does not work in the global blob/,
    );
  });

  it("does not refuse explode, sound or lose there", () => {
    // The asymmetry: `bonus` and `message` are the only two that consult `getArt()`, because
    // they are the only two that need to know *whose* score and *whose* screen. `explode`
    // needs neither, `sound` has its own global sample set, and `lose` is global anyway.
    const global = context({ here: GLOBAL });
    expect(() => applyEffect("explode", null, global)).not.toThrow();
    expect(() => applyEffect("sound", { sample: 3 }, global)).not.toThrow();
    expect(() => applyEffect("lose", null, global)).not.toThrow();
    expect(global.pops).toBe(1);
    expect(global.samples).toEqual([{ sample: 3, set: "global", position: 0, width: 0 }]);
    expect(global.losses).toBe(1);
  });
});

describe("explode in a falling blob", () => {
  it("does nothing, and says that it did nothing", () => {
    // `if (b.getSpezConst(spezconst_falling)) { if (gDebug) print_to_stderr("Warning: Can't
    // use 'explode' in falling blob.\n"); } else b.lassPlatzen();`
    //
    // Refusing instead would break a level that calls `explode` from a `land` handler: the blob
    // is no longer falling by then, so the same call does work. Upstream's check is on the
    // *current* state, not on where the code lives.
    const falling = context({ falling: true });
    const result = applyEffect("explode", null, falling);
    expect(result.applied).toBe(false);
    expect(result.refused).toBe("falling");
    expect(falling.pops).toBe(0);
    expect(falling.calls).toEqual([]);
  });

  it("pops once the blob has landed", () => {
    const landed = context({ falling: false });
    expect(applyEffect("explode", null, landed).applied).toBe(true);
    expect(landed.pops).toBe(1);
  });
});

describe("where a sound comes from", () => {
  it("pans a field blob by its column", () => {
    // `Sound::playSample(nr, rechts ? so_rfeld : so_lfeld, 2*x+1, 2*grx)`. Column 0 of a
    // four-column field is hard left and column 3 hard right, with nothing dead centre.
    expect(routeSample({ kind: "cell", x: 0, y: 0, right: false }, 5, 4)).toEqual({
      sample: 5,
      set: "lfield",
      position: 1,
      width: 8,
    });
    expect(routeSample({ kind: "cell", x: 3, y: 0, right: false }, 5, 4)).toEqual({
      sample: 5,
      set: "lfield",
      position: 7,
      width: 8,
    });
    expect(routeSample({ kind: "cell", x: 2, y: 0, right: true }, 5, 4)).toEqual({
      sample: 5,
      set: "rfield",
      position: 5,
      width: 8,
    });
  });

  it("plays a semiglobal and a falling piece uncentred", () => {
    // `Sound::playSample(nr, rechts ? so_rsemi : so_lsemi)` — the semi sample set, and no
    // panning arguments at all.
    expect(routeSample(SEMI_R, 1, 4)).toEqual({ sample: 1, set: "rsemi", position: 0, width: 0 });
    expect(routeSample({ kind: "fall", x: 0, y: 0, right: false }, 1, 4)).toEqual({
      sample: 1,
      set: "lsemi",
      position: 0,
      width: 0,
    });
  });

  it("gives the global blob its own sample set", () => {
    // `case absort_global: Sound::playSample(nr, so_global);` — not an error, a third set.
    expect(routeSample(GLOBAL, 2, 4)).toEqual({
      sample: 2,
      set: "global",
      position: 0,
      width: 0,
    });
  });

  it("refuses a position with no screen at all", () => {
    // `case absort_nirgends: throw iFehler("illegal ort for ort_absolut::playSample")` — the
    // only one of the five effects where a wrong position is an *internal* error rather than a
    // `Fehler` the level caused, which is why it is worded the way it is.
    expect(() => routeSample({ kind: "nowhere", x: 0, y: 0, right: false }, 1, 4)).toThrow(
      /illegal position for a sound effect/,
    );
  });

  it("uses the sample number the level resolved, not a name", () => {
    // `Sound::ladSample` runs in the grammar action, so the number is fixed at parse time. A
    // sound effect therefore cannot depend on a variable, and the test says so by giving the
    // context a number and no name.
    const ctx = context({ here: CELL_L });
    const result = applyEffect("sound", { sample: 7 }, ctx);
    expect(result.played?.sample).toBe(7);
    expect(ctx.samples).toHaveLength(1);
  });
});

describe("the effect table", () => {
  it("lists exactly the five effects the grammar has a production for", () => {
    // `BONUS_TOK '(' ausdruck ')'`, `MESSAGE_TOK '(' punktwort ')'`, `SOUND_TOK '(' punktwort
    // ')'`, `VERLIER_TOK`, `EXPLODE_TOK`. No sixth.
    expect([...EFFECTS]).toEqual(["bonus", "message", "explode", "sound", "lose"]);
  });

  it("evaluates only bonus's argument, and takes names for the other two", () => {
    // `bonus(n)` evaluates an expression, so its number can come from a variable. `message(s)`
    // and `sound(s)` take a `punktwort` — a name, not an expression — and `explode` and `lose`
    // are bare keywords with nothing between the parens or after the word.
    //
    // The distinction is observable in what `applyEffect` reads: only `value` reaches a
    // number, and passing a name for `bonus` yields zero rather than a lookup failure, because
    // the grammar would never have produced that combination.
    const ctx = context({ here: CELL_L });
    applyEffect("bonus", { name: "nonsense" }, ctx);
    expect(ctx.points).toEqual([[false, 0]]);
    // And a `message` with no name shows an empty string rather than failing, for the same
    // reason — `code_modus` cannot produce one.
    applyEffect("message", null, ctx);
    expect(ctx.messages).toEqual([[false, ""]]);
  });

  it("is not busy, for any of the five", () => {
    // `getStapelHoehe` returns 0 for `bonus_code`, `message_code`, `explode_code`,
    // `sound_code` and `verlier_code` in one shared `case` list, and none of them sets the flag.
    const ctx = context({ here: CELL_L });
    for (const effect of EFFECTS) {
      const argument = effect === "bonus" ? { value: 1 } : effect === "explode" || effect === "lose" ? null : { name: "x", sample: 1 };
      expect(() => applyEffect(effect, argument, ctx)).not.toThrow();
    }
    expect(ctx.calls).toEqual(["bonus:left:1", "message:left:x", "pop", "sound:lfield", "lose"]);
  });
});
describe("through the walker", () => {
  it("runs a bonus whose argument is an expression", () => {
    // The three shapes from the grammar, driven through the real parser and the real walker,
    // so the AST and the effect cannot drift apart.
    const ctx = context({ here: CELL_R });
    for (const source of ["bonus(3);", 'message("gewonnen");', "explode;", "lose;"]) {
      const statements = parseCode(lex(source));
      const allocation = allocateSlots(statements);
      runCode(statements, {
        store: new BlobStore(allocation.slotCount, 13, new TimeSlices()),
        busySlots: allocation.busySlots,
        evaluate: (expr) => evaluate(expr, { variable: () => 2, random: () => 0 }),
        effects: ctx,
      });
    }
    expect(ctx.calls).toEqual(["bonus:right:3", "message:right:gewonnen", "pop", "lose"]);
  });

  it("refuses an effect when the context cannot act on it", () => {
    const statements = parseCode(lex("explode;"));
    const allocation = allocateSlots(statements);
    const ctx = {
      store: new BlobStore(allocation.slotCount, 13, new TimeSlices()),
      busySlots: allocation.busySlots,
      evaluate: () => 0,
    };
    expect(() => runCode(statements, ctx)).toThrow(/needs a context to act on/);
  });
});
