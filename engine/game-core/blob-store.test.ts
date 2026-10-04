/**
 * Each blob has a real variable array, and the step window is one object.
 *
 * Task 15.3. `Blob` used to carry an `Int32Array` named `vars`, allocated by `board.ts` and read
 * by nobody — a placeholder left since the storage was written, because nothing consumed it.
 * It is a `BlobStore` now, sized from the level's program, and every blob shares one
 * `TimeSlices`.
 *
 * Both halves matter and they pull in opposite directions. The **array** is per blob, because it
 * is `Blop::mDaten` and a blob's variables are its own. The **slice counter** is per simulation,
 * because it owns the deferred-write queue and the beginning-of-step snapshot for the whole
 * step — upstream opens one `beginGleichzeitig()` around everything, so a `@`-read in the last
 * cell of the board sees the same world as one in the global blob. Get the second wrong and
 * levels read each other's half-written state; get the first wrong and every blob shares one
 * score.
 */

import { describe, expect, it } from "vitest";
import { Simulation } from "./simulation.ts";
import { testBlob } from "../testing/blob.ts";
import { nasenkugeln } from "../level-format/fixtures.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LevelLoader } from "../level-format/loader.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";
import { createPrng } from "../prng.ts";
import { SPECIAL_VARIABLE_COUNT } from "../cual-runtime/store.ts";

/**
 * A slot that exists in a fixture blob's array.
 *
 * `SPECIAL_VARIABLE_COUNT` is the *first user* slot, and a fixture's array is exactly that long
 * — `EMPTY_PROGRAM` allocates over an empty tree, so there are no user variables and index 14 is
 * one past the end. Slot 0 is `file`, which every blob has. Worth stating because it is the
 * check on the array's length: a blob sized for a real program would take 14 and up, and this
 * test deliberately does not need one.
 */
const SLOT = 0;

const DATA_DIR = resolve(import.meta.dirname, "../../levels/upstream");
const GLOBALS = readFileSync(resolve(DATA_DIR, "globals.ld"), "latin1");

/** A real level, so the array is sized by a real program and not by a fixture's empty one. */
async function realLevel(id: string, filename: string) {
  return new LevelLoader({
    fetchLevel: async (name) => readFileSync(resolve(DATA_DIR, name), "latin1"),
    art: ART_MANIFEST,
    globalsSource: GLOBALS,
    random: createPrng(1),
  }).load(filename, id, "all", "normal");
}

describe("a blob's variable array", () => {
  it("is the level's program size, not a guess", async () => {
    // `DefKnoten::getDatenLaenge` is a per-configuration length. Sizing it per kind would
    // overflow the moment a kind called a procedure declared elsewhere, which is most of them —
    // `baggis.ld`'s kinds all call `geblitzt` and `schema16`, both declared at the level's top.
    const { level } = await realLevel("Baggis", "baggis.ld");
    const sim = new Simulation(level, { seed: 1 });
    const blob = sim.board.cells.find((cell) => cell !== null);
    expect(blob?.store.data.length).toBe(level.program.allocation.slotCount);
    // And that is bigger than the fixture's, which has no user variables at all.
    expect(blob?.store.data.length).toBeGreaterThan(SPECIAL_VARIABLE_COUNT);
  });

  it("holds a blob's kind, weight, behaviour and version, not just an empty array", async () => {
    const { level } = await realLevel("Baggis", "baggis.ld");
    const sim = new Simulation(level, { seed: 1 });
    const blob = sim.board.cells.find((cell) => cell !== null);
    expect(blob).toBeDefined();
    if (blob === undefined) return;
    // Read back by name, through the same slots Cual reads, so this is the array the runtime
    // will see rather than a restatement of the fields beside it.
    expect(blob.store.getSystem("kind")).toBe(blob.kind);
    expect(blob.store.getSystem("weight")).toBe(blob.weight);
    expect(blob.store.getSystem("behaviour")).toBe(blob.behaviour);
    expect(blob.store.getSystem("version")).toBe(blob.version);
  });

  it("is a blob's own, so one blob's variables are not another's", () => {
    // The other half of the sharing decision. Sharing the *array* would make every blob on the
    // board read and write the same numbers, which no test of `blob.kind` would catch.
    const a = testBlob();
    const b = testBlob();
    expect(a.store.data).not.toBe(b.store.data);
    a.store.setSystem("kind", 3);
    expect(b.store.getSystem("kind")).not.toBe(3);
  });

  it("and is freshly allocated on a reset, so a restart is a new board", () => {
    // `reset()` rewinds the random source as well as the board, so a restart replays — which
    // means the blobs cannot be the same objects with the same contents.
    const sim = new Simulation(nasenkugeln(), { seed: 1 });
    const before = sim.board.cells.find((cell) => cell !== null);
    sim.reset();
    const after = sim.board.cells.find((cell) => cell !== null);
    expect(after).toBeDefined();
    if (before === undefined || after === undefined) return;
    expect(after.store.data).not.toBe(before.store.data);
  });
});

describe("the step window is one object for the whole simulation", () => {
  it("so a second window invalidates a blob's snapshot", () => {
    // The proof, and it is behavioural rather than structural. `BlobStore` keeps its
    // `TimeSlices` private, so the question "do two blobs share one counter?" cannot be answered
    // by looking. But `hasShadow` is `#altSlice === #slices.current` — a blob's snapshot counts
    // only if it was taken in the *current* slice — so opening a second window on the
    // simulation must drop it.
    //
    // With a per-blob counter that open would be invisible here and `hasShadow` would stay
    // true, which is exactly the bug this asserts against: a blob reading a shadow from an
    // earlier step instead of this one.
    const sim = new Simulation(nasenkugeln(), { seed: 1 });
    // **A blob the simulation made, not `testBlob()`.** The helper gives each blob its own
    // `TimeSlices` — right for a test that wants a blob in isolation, useless here, because the
    // whole claim is that the simulation's blobs share *its* counter.
    const a = sim.board.cells.find((cell) => cell !== null);
    expect(a).toBeDefined();
    if (a === undefined) return;

    sim.slices.open();
    a.store.preserve();
    expect(sim.slices.current).toBe(1);
    expect(a.store.hasShadow, "the snapshot was not taken in the open window").toBe(true);

    sim.slices.open();
    expect(sim.slices.current).toBe(2);
    expect(
      a.store.hasShadow,
      "a second window did not reach the blob, so its slices are not the simulation's",
    ).toBe(false);

    // And a write in this slice leaves the shadow showing what was there *before* it — which is
    // the whole point of the window, and not what I first asserted. `set` snapshots before it
    // writes, so `getAlt` is the beginning-of-slice value; a test expecting the new one would be
    // asserting that `@`-reads see writes made earlier in the same step, which is the bug this
    // machinery exists to prevent.
    const before = a.store.get(SLOT);
    a.store.set(SLOT, 7);
    a.store.preserve();
    expect(a.store.hasShadow).toBe(true);
    expect(a.store.get(SLOT), "the live value").toBe(7);
    expect(a.store.getAlt(SLOT), "the beginning-of-slice value").toBe(before);
  });

  it("and a deferred write lands at the end of the window, not when it is made", () => {
    // `Blop::setVariableZukunft`, which is how `@` and `@@` work: the write is queued on the
    // shared counter and applied by `endGleichzeitig`, so a read later in the same step sees the
    // value from the beginning of the step.
    const sim = new Simulation(nasenkugeln(), { seed: 1 });
    const b = sim.board.cells.find((cell) => cell !== null);
    expect(b).toBeDefined();
    if (b === undefined) return;
    const before = b.store.get(SLOT);

    sim.slices.open();
    sim.slices.defer(b.store, SLOT, 42, "=");
    expect(sim.slices.pending).toBe(1);
    // Not applied yet — that is the entire point of deferring it.
    expect(b.store.get(SLOT)).toBe(before);

    sim.slices.close();
    expect(b.store.get(SLOT)).toBe(42);

    // `close()` applies the queue and `open()` clears it, which is upstream's division of
    // labour: `endGleichzeitig` runs the writes, `beginGleichzeitig` empties `gZZ`. So `pending`
    // is still 1 here and is cleared by the next window — asserted because reading it as
    // "drained at close" would be a misreading of the queue's lifetime, and I made that
    // misreading while writing this.
    expect(sim.slices.pending).toBe(1);
    sim.slices.open();
    expect(sim.slices.pending).toBe(0);
  });

  it("while one blob's shadow is its own, because the array is", () => {
    // The two halves again, and they are genuinely different: the *snapshot* is per blob
    // (`Blop::mDatenAlt`), while the *window* is shared. So one blob's write does not give the
    // other a shadow, even though both are in the same step.
    const a = testBlob();
    const b = testBlob();
    // Independent counters here, which is what makes the independence below meaningful: two
    // slices are open at once, one per blob, and neither sees the other's.
    expect(a.store.hasShadow).toBe(false);
    a.store.set(SLOT, 7);
    a.store.preserve();
    expect(a.store.hasShadow).toBe(true);
    expect(b.store.hasShadow).toBe(false);
  });
});
