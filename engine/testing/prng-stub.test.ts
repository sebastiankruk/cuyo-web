import { describe, expect, it } from "vitest";
import { createPrng } from "../prng.ts";
import {
  RecordingPrng,
  ScriptedPrng,
  scriptedIndices,
} from "./prng-stub.ts";

describe("ScriptedPrng", () => {
  it("returns the scripted values in order", () => {
    const p = new ScriptedPrng([0.1, 0.4, 0.9]);
    expect(p.next()).toBeCloseTo(0.1);
    expect(p.next()).toBeCloseTo(0.4);
    expect(p.next()).toBeCloseTo(0.9);
  });

  it("is reproducible for the same script", () => {
    const script = [0.25, 0.5, 0.75, 0.125];
    const a = new ScriptedPrng(script);
    const b = new ScriptedPrng(script);
    expect(Array.from({ length: 4 }, () => a.next())).toEqual(
      Array.from({ length: 4 }, () => b.next()),
    );
  });

  it("throws when exhausted rather than recycling", () => {
    const p = new ScriptedPrng([0.5]);
    p.next();
    expect(() => p.next()).toThrow(/exhausted/);
  });

  it("rejects an empty script", () => {
    expect(() => new ScriptedPrng([])).toThrow(/at least one value/);
  });

  it("records what it was asked for", () => {
    const p = new ScriptedPrng([0.5, 0.5]);
    p.next();
    p.next();
    expect(p.consumed).toBe(2);
    expect(p.drawn).toHaveLength(2);
  });

  it("pins exact indices via scriptedIndices", () => {
    const p = scriptedIndices([2, 0, 1]);
    expect(p.int(3)).toBe(2);
    expect(p.int(3)).toBe(0);
    expect(p.int(3)).toBe(1);
  });

  it("keeps int() in range like the real source", () => {
    const p = new ScriptedPrng([0.0, 0.34, 0.67, 0.99]);
    expect(p.int(5)).toBe(0);
    expect(p.int(5)).toBe(1);
    expect(p.int(5)).toBe(3);
    expect(p.int(5)).toBe(4);
  });

  it("returns undefined when picking from an empty list", () => {
    expect(new ScriptedPrng([0.5]).pick([])).toBeUndefined();
  });
});

describe("RecordingPrng", () => {
  it("records the calls made against the wrapped source", () => {
    const rec = new RecordingPrng(createPrng(11));
    rec.next();
    rec.int(10);
    rec.chance(1, 2);

    expect(rec.log.map((e) => e.method)).toEqual(["next", "int", "chance"]);
    expect(rec.callsTo("int")).toHaveLength(1);
    expect(rec.callsTo("int")[0]?.args).toEqual([10]);
  });

  it("passes results through unchanged", () => {
    const rec = new RecordingPrng(createPrng(11));
    const direct = createPrng(11);
    expect(rec.int(7)).toBe(direct.int(7));
  });

  it("keeps the wrapped source deterministic", () => {
    const a = new RecordingPrng(createPrng(5));
    const b = new RecordingPrng(createPrng(5));
    expect(Array.from({ length: 20 }, () => a.int(100))).toEqual(
      Array.from({ length: 20 }, () => b.int(100)),
    );
  });
});
