/**
 * Tests for the level explanation shown in the HUD.
 *
 * The wording is the product here: these are the only instructions a player gets
 * for `Hormones`, whose diagonal connection mode is not something you can guess from
 * looking at a grid. A change to these strings is a change to the game, so it should
 * have to be deliberate.
 */

import { describe, expect, it } from "vitest";
import { NeighbourMode } from "../engine/game-core/constants.ts";
import { FIXTURES } from "../engine/level-format/fixtures.ts";
import { connectionRule, goalSummary, goalSummaryLines } from "./goals.ts";

describe("connectionRule", () => {
  it("marks diagonal modes as including diagonals", () => {
    // The distinction that matters: on these, a row of blobs will not join, and a
    // player needs to be told so before they waste a level on it.
    for (const mode of [
      NeighbourMode.Diagonal,
      NeighbourMode.Eight,
      NeighbourMode.Hex6,
    ]) {
      expect(connectionRule(mode).includesDiagonal, `${mode}`).toBe(true);
    }
  });

  it("does not mark orthogonal modes as including diagonals", () => {
    for (const mode of [
      NeighbourMode.Rect,
      NeighbourMode.Knight,
      NeighbourMode.Horizontal,
      NeighbourMode.Vertical,
      NeighbourMode.Hex4,
    ]) {
      expect(connectionRule(mode).includesDiagonal, `${mode}`).toBe(false);
    }
  });

  it("gives every mode a label and a sentence", () => {
    for (const mode of [
      NeighbourMode.Rect,
      NeighbourMode.Diagonal,
      NeighbourMode.Hex6,
      NeighbourMode.Hex4,
      NeighbourMode.Knight,
      NeighbourMode.Eight,
      NeighbourMode.ThreeD,
      NeighbourMode.None,
      NeighbourMode.Horizontal,
      NeighbourMode.Vertical,
    ]) {
      const rule = connectionRule(mode);
      expect(rule.label.length, `${mode} label`).toBeGreaterThan(0);
      expect(rule.detail.length, `${mode} detail`).toBeGreaterThan(0);
      expect(rule.detail, `${mode} detail reads as a sentence`).toMatch(/\.$/);
    }
  });
});

describe("goalSummary", () => {
  for (const fixture of FIXTURES) {
    const level = fixture.make();

    it(`names the goal kind and threshold for ${level.id}`, () => {
      const s = goalSummary(level, { targetRemaining: 10, greys: 0 });
      expect(level.id).toBeTruthy();
      // Every level with a goal kind names it; the fixtures all have one.
      expect(s.targetName, "no goal kind found").not.toBeNull();
      expect(s.targetArtKey, "goal kind has no art key").not.toBe("");
      // The threshold is the largest among colour kinds, not the goal kind's own -
      // a goal kind does not detonate on its own size.
      expect(s.numExplode).toBeGreaterThan(1);
    });

    it(`produces a non-empty explanation for ${level.id}`, () => {
      const lines = goalSummaryLines(
        goalSummary(level, { targetRemaining: 10, greys: 0 }),
      );
      expect(lines.length, "nothing to tell the player").toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line, `not a sentence: ${line}`).toMatch(/\.$/);
      }
    });
  }

  it("says how the board connects before anything else", () => {
    // Ordering is load-bearing: a player who does not know blobs join diagonally
    // will not understand the rest, however true it is.
    const hormone = FIXTURES.find((f) => f.make().id === "Hormone")?.make();
    expect(hormone, "Hormone fixture missing").toBeDefined();
    const lines = goalSummaryLines(
      goalSummary(hormone!, { targetRemaining: 10, greys: 0 }),
    );
    expect(lines[0]?.toLowerCase()).toContain("corners");
  });

  it("states the join threshold as a number", () => {
    const level = FIXTURES[0].make();
    const s = goalSummary(level, { targetRemaining: 7, greys: 0 });
    const lines = goalSummaryLines(s);
    const thresholdLine = lines.find((l) => l.includes("Join"));
    expect(thresholdLine, "no threshold line").toBeDefined();
    expect(thresholdLine).toContain(String(s.numExplode));
    // And the count matches the level, so the two cannot drift.
    expect(s.numExplode).toBe(
      Math.max(
        ...level.kinds
          .filter((k) => k.role === "colour")
          .map((k) => k.numexplode),
      ),
    );
  });

  it("distinguishes a goal that needs a chain reaction from one that does not", () => {
    // `chainGrass` changes what the player has to do, so the wording must too.
    for (const fixture of FIXTURES) {
      const level = fixture.make();
      const lines = goalSummaryLines(
        goalSummary(level, { targetRemaining: 10, greys: 0 }),
      );
      const goalLine = lines.find((l) => l.includes("left."));
      expect(goalLine, `${level.id}: no goal line`).toBeDefined();
      if (level.chainGrass) {
        expect(goalLine, `${level.id}: should mention an explosion`).toContain(
          "explosion",
        );
      }
    }
  });

  it("mentions grey blobs only while there are some", () => {
    const level = FIXTURES[0].make();
    const withGreys = goalSummaryLines(
      goalSummary(level, { targetRemaining: 4, greys: 9 }),
    );
    expect(withGreys.some((l) => l.includes("Grey"))).toBe(true);
    const without = goalSummaryLines(
      goalSummary(level, { targetRemaining: 4, greys: 0 }),
    );
    expect(without.some((l) => l.includes("Grey"))).toBe(false);
  });

  it("reports the counts it was given rather than recomputing them", () => {
    // The simulation owns the counts; recomputing them here would be a second
    // source of truth that could disagree with the HUD's.
    const level = FIXTURES[0].make();
    const s = goalSummary(level, { targetRemaining: 3, greys: 5 });
    expect(s.targetRemaining).toBe(3);
    expect(s.greys).toBe(5);
    // `some` rather than `toContain` with an asymmetric matcher: it reads as what it
    // checks, and it needs no cast.
    expect(goalSummaryLines(s).some((l) => l.includes("3 left"))).toBe(true);
    expect(goalSummaryLines(s).some((l) => l.includes("5 left"))).toBe(true);
  });
});
