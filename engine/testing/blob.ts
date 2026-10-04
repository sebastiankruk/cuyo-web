/**
 * A blob for a test that wants one without going through a `Simulation`.
 *
 * Task 15.3 gave `Blob` a real `BlobStore` instead of the `Int32Array` placeholder `board.ts`
 * used to allocate and nobody read, so a test cannot say `new Blob()` any more — it needs an
 * array to hand over. Six tests did exactly that, and the point of this file is that none of
 * them has to know how.
 *
 * `64` slots is the default because it is comfortably above
 * `EMPTY_PROGRAM.allocation.slotCount` (the fourteen special variables) and below the largest
 * real one (112, in BoniMali2), so a test that cares about the size passes it explicitly rather
 * than inheriting a number chosen for convenience. A test using a fixture level should use that
 * level's own `program.allocation.slotCount`, which is what the game does.
 */

import { Blob } from "../game-core/board.ts";
import { BlobStore, TimeSlices } from "../cual-runtime/store.ts";
import { GRY } from "../game-core/constants.ts";

export function testBlob(slotCount = 64): Blob {
  // Each blob gets its own slices. A test with two blobs that must not share a step window
  // should say so by passing one in; none does yet, and a shared counter would make their
  // beginning-of-step reads interfere for reasons no test is currently asserting.
  return new Blob(new BlobStore(slotCount, GRY, new TimeSlices()));
}
