// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The once-a-run guard on recording a win — task 9.4.
 *
 * Every other test for this behaviour would have to mount `PlayScreen` and drive a real
 * `Simulation` to a win: 2500 steps, a hand-driven frame clock, and a level that has to
 * actually be winnable. This file asks the question directly instead, which is the only
 * reason it can be *asked* — the bug is about how many times something fires, and that
 * is not a question you can reach by driving the simulation once.
 *
 * The numbers are chosen to look like a real frame budget: 60 is a second of frames, so
 * a component left on the result screen for a second while reading its score is 59 missed
 * claims.
 */

import { describe, expect, it } from "vitest";
import { RECORDS_PROGRESS, WinRecorder } from "./record-once.ts";

describe("the win is claimed once per run", () => {
  it("claims the frame the phase becomes won", () => {
    const recorder = WinRecorder();
    expect(recorder.claim(RECORDS_PROGRESS, 4321)).toBe(true);
    expect(recorder.claimed).toBe(true);
    expect(recorder.score).toBe(4321);
  });

  it("refuses every frame after it, which is the bug", () => {
    // **The defect, as a number.** `phase` stays `won` for every frame until the player
    // leaves, so this is the shape of the result screen sitting open for a second. Without
    // the guard this is 60 identical `localStorage` writes, each one correct.
    const recorder = WinRecorder();
    expect(recorder.claim(RECORDS_PROGRESS, 4321)).toBe(true);
    let fired = 1;
    for (let frame = 0; frame < 60; frame += 1) {
      if (recorder.claim(RECORDS_PROGRESS, 4321)) fired += 1;
    }
    expect(fired).toBe(1);
    expect(recorder.claimed).toBe(true);
  });

  it("keeps the first score even when a later frame carries a different one", () => {
    // A score that changed after the win would be a second bug, but the guard's answer is
    // the same either way: the first `won` frame is the one that counts, and it is
    // asserted here so that "first wins" is a property rather than an accident of the
    // `claimed` flag happening to be set first.
    const recorder = WinRecorder();
    expect(recorder.claim(RECORDS_PROGRESS, 100)).toBe(true);
    expect(recorder.claim(RECORDS_PROGRESS, 9999)).toBe(false);
    expect(recorder.score).toBe(100);
  });
});

describe("nothing but a win is recorded", () => {
  it("ignores every phase before the level finishes", () => {
    // The transient phases, in the order the simulation passes through them. A guard that
    // fired on any of these would record a score for a level still in progress — which
    // would then be stored as a *best*, and `bestScore` is what the card prints.
    const recorder = WinRecorder();
    for (const phase of [
      "falling",
      "testing",
      "exploding",
      "settling",
      "spawningGreys",
      "timeBonus",
      "waiting",
    ]) {
      expect(recorder.claim(phase, 10), phase).toBe(false);
    }
    expect(recorder.claimed).toBe(false);
    expect(recorder.score).toBeNull();
  });

  it("does not record a loss, and does not spend the claim doing it", () => {
    // **The near-miss.** `lost` is a finished phase, so a guard written as "fire once on
    // any finished phase" would record it — and the catalogue would tick a card for a
    // level the player failed, and store the score they finished on as a best.
    //
    // The second assertion is the subtle half: a guard that *claimed* on a loss would
    // consume the one claim, so a level that lost and then somehow reached `won` in the
    // same run would record nothing at all. Not claiming is what makes that impossible.
    const recorder = WinRecorder();
    expect(recorder.claim("lost", 500)).toBe(false);
    expect(recorder.claimed, "a loss must not consume the claim").toBe(false);
    // So a later win still records.
    expect(recorder.claim(RECORDS_PROGRESS, 500)).toBe(true);
  });

  it("leaves the claim unspent, which is what makes the order irrelevant", () => {
    // Within one run the phase cannot go `lost` and then `won` — `Simulation.finish()` is
    // terminal — so this test is not claiming a scenario can happen. It pins the reason
    // the recorder does not need to know that: not claiming on a loss means the guard
    // cannot be defeated by a phase order it has no model of. The behaviour is inherited
    // from the simulation rather than defended here, and this is the assertion that says
    // so.
    const recorder = WinRecorder();
    expect(recorder.claim("lost", 1)).toBe(false);
    expect(recorder.claimed).toBe(false);
    expect(recorder.claim(RECORDS_PROGRESS, 2)).toBe(true);
  });
});

describe("a new run is a new claim", () => {
  it("a fresh recorder records again", () => {
    // **Why the ref is replaced on restart rather than cleared.** `PlayScreen` builds a
    // new `WinRecorder` when `runId` changes, so replaying a level and winning it twice
    // records twice — and the second is the one that matters, since a better score is
    // what `recordCompletion` keeps. A boolean that were merely reset would work too; the
    // point asserted here is the behaviour, not the mechanism.
    const first = WinRecorder();
    expect(first.claim(RECORDS_PROGRESS, 100)).toBe(true);
    const second = WinRecorder();
    expect(second.claimed, "a new run starts unclaimed").toBe(false);
    expect(second.claim(RECORDS_PROGRESS, 250)).toBe(true);
    expect(second.score).toBe(250);
  });

  it("does not share state between instances", () => {
    // Two recorders must be independent. A module-level singleton here would make the
    // *second* level of a session silently unrecordable — and it would pass a test that
    // only ever played one level.
    const a = WinRecorder();
    const b = WinRecorder();
    expect(a.claim(RECORDS_PROGRESS, 1)).toBe(true);
    expect(b.claimed).toBe(false);
    expect(b.claim(RECORDS_PROGRESS, 2)).toBe(true);
  });
});
