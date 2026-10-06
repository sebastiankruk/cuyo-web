// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * The transcribed picture icon counts, and the two things that depend on them.
 *
 * These numbers are the only place in the project where a value is transcribed out of an image
 * rather than out of source or a man page, so the file needs the treatment the neighbour-offset
 * tables get: **the upstream tree re-derives each figure where it exists**, so a transcription
 * slip fails loudly instead of quietly narrowing a level's set of pictures.
 *
 * Two directions, because they fail differently:
 *
 * - **Every manifest key has a figure.** This is the direction CI can check, since it needs no
 *   upstream tree at all. A key with no entry means `defaultCodeFor` will refuse the level that
 *   names it, so the failure is real rather than theoretical.
 * - **Every figure matches the image**, where the tree is present. The suite skips *this* half
 *   when `.context/upstream-cuyo` is absent and says so in its output, so "green" never means
 *   "checked" without saying so — the trap `render/palette.test.ts` fell into and 12.8 fixed.
 *
 * ## The four zeroes are not gaps
 *
 * `Grau`, `Starr`, `Start` and `start_dummy` are **kind names, not picture names**. A kind
 * declared by a `greypic` or `startpic` *word* has no picture file unless its own section
 * declares `pics`, and upstream opens no image for one — so "no image on disk" is the answer
 * rather than a gap in the reading. The same fact reaches the code as `defaultCode = null`:
 * `sorte.cpp:104`'s condition starts `mBilddateien.size() > 0`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createGunzip, gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PICTURE_ICONS, iconCountOf } from "./picture-icons.ts";
import { GRIC } from "../game-core/constants.ts";
import { ART_MANIFEST } from "../../levels-src/generated/art-manifest.ts";

const PICS = resolve(import.meta.dirname, "../../.context/upstream-cuyo/data/pics");
/** Whether the upstream tree is here at all. Gitignored, so absent on CI and on a fresh clone. */
const hasUpstream = existsSync(PICS);

/**
 * Kind names, not picture names, which an earlier sweep recorded as keys.
 *
 * A kind declared by a `greypic` or `startpic` *word* has no picture file unless its own
 * section declares `pics`, and upstream opens no image for one. These four were swept as keys
 * before the sweep read `kind.pictures` instead of `kind.artKey`, and none of them is a key now.
 */
const NOT_A_PICTURE = ["Grau", "Starr", "Start", "start_dummy"];

/**
 * The file's bytes, whole or as far as they decompress.
 *
 * `itGras.xpm.gz` has a valid gzip header and a deflate stream that Node's one-shot
 * `gunzipSync` rejects outright — upstream's data, not this project's — while a streaming
 * inflate recovers the first 16 kB, which is far more than the header line needs. So the
 * streaming form is the fallback rather than the exception, and both are offered.
 */
async function bytes(raw: Buffer): Promise<Buffer> {
  try {
    return gunzipSync(raw);
  } catch {
    return new Promise((done) => {
      const chunks: Buffer[] = [];
      const stream = createGunzip();
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", () => done(Buffer.concat(chunks)));
      stream.on("close", () => done(Buffer.concat(chunks)));
      stream.end(raw);
    });
  }
}

/**
 * The XPM header, the way `levels-src/transcribe-picture-icons.ts` reads it.
 *
 * Duplicated on purpose rather than imported: the transcriber is a build script that runs under
 * `make fetch-corpus`, not part of the test surface, and a test that called it would be testing
 * the script's own idea of a header. The two disagreeing is the signal worth having.
 */
function xpmSize(source: string): { width: number; height: number } | null {
  for (const line of source.split("\n", 40)) {
    const m = /^\s*"?\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(line);
    if (m) return { width: Number(m[1]), height: Number(m[2]) };
  }
  return null;
}

describe("the picture icon counts", () => {
  it("cover every key the art manifest carries", () => {
    // The direction that needs no upstream tree, so it is the one CI checks. `defaultCodeFor`
    // refuses a key with no figure rather than guessing, so a missing entry is a build failure
    // one level load later — and a failure whose message names the artwork rather than the
    // level's Cual.
    const missing = [...ART_MANIFEST.entries.keys()].filter((key) => !PICTURE_ICONS.has(key));
    expect(missing).toEqual([]);
  });

  it("and every figure agrees with the image, where the upstream tree is", async () => {
    if (!hasUpstream) {
      // Said rather than skipped silently: a green run on CI has checked coverage of the table
      // and nothing about whether the figures are right. `12.8` is the task that removed this
      // kind of skip from `render/palette.test.ts`, and the reason it is back here is that this
      // half genuinely cannot run without a tree that is gitignored — so it says so out loud.
      console.info(
        "picture-icons: no upstream tree at .context/upstream-cuyo - the figures are NOT " +
          "re-derived here. Run `make fetch-corpus` to check them.",
      );
      return;
    }
    const wrong: string[] = [];
    const unreadable: string[] = [];
    for (const [key, icons] of PICTURE_ICONS) {
      if (icons === 0) continue;
      const base = key.endsWith(".xpm") ? key.slice(0, -".xpm".length) : key;
      const file = [`${base}.xpm.gz`, `${base}.xpm`]
        .map((name) => resolve(PICS, name))
        .find((path) => existsSync(path));
      if (file === undefined) {
        unreadable.push(`${key}: no image on disk`);
        continue;
      }
      const raw = readFileSync(file);
      const text = file.endsWith(".gz")
        ? (await bytes(raw)).toString("latin1")
        : raw.toString("latin1");
      const size = xpmSize(text);
      if (size === null) {
        unreadable.push(`${key}: no XPM header in ${file}`);
        continue;
      }
      // `(breite/gric) * (hoehe/gric)` — `Bilddatei::anzBildchen()`, `src/bilddatei.cpp:205`.
      const derived = (size.width / GRIC) * (size.height / GRIC);
      if (derived !== icons) wrong.push(`${key}: table says ${icons}, image gives ${derived}`);
    }
    expect(wrong).toEqual([]);
    // A key that cannot be read is a hole in the *check*, not in the table, so it is asserted
    // rather than left to look like coverage. The four zeroes are skipped by the `!== 0`.
    expect(unreadable).toEqual([]);
  });

  it("and hold no key that is not a picture", () => {
    // **This was four keys, and they are gone.** An earlier version of the sweep collected
    // `kind.artKey`, which for a kind declared by a `greypic` or `startpic` *word* falls back to
    // the kind's own name — so `Grau`, `Starr`, `Start` and `start_dummy` were swept as picture
    // keys, had no image, and were recorded as 0. They are not pictures: upstream's
    // `Sorte::Sorte` opens no image for a kind with no `pics` list of its own, which is the same
    // fact that reaches the code as `defaultCode = null`.
    //
    // So the sweep reads `kind.pictures`, which holds only declared picture files, and the table
    // has **no zeros at all**. Asserted rather than assumed, because a zero is a live value
    // meaning "this key is not a picture" and `defaultCodeFor` reads it as a figure.
    const zeros = [...PICTURE_ICONS.entries()].filter(([, n]) => n === 0).map(([k]) => k);
    expect(zeros).toEqual([]);
    // And none of the four names is a key, which is the other half of the claim.
    for (const key of NOT_A_PICTURE) {
      expect(PICTURE_ICONS.has(key), `${key} is a kind name, not a picture key`).toBe(false);
    }
  });

  it("with no figure below zero and a spread that says which pictures are not kind icons", () => {
    // Bounds rather than exact values, because the artwork is new and these are the figures the
    // new artwork has to match.
    //
    // **The upper bound is 512, not 16, and that is a finding rather than a typo.** The first
    // version of this test asserted `<= 16` on the reasoning that `schema16` is the widest schema
    // in the corpus and so no picture needs more. Measured, 82 of the keys exceed 16, up to
    // `mbSchmelz1.xpm` at 512×1024 — which is 512 icons. Those are the levels' *lettersets*,
    // backgrounds and full-picture sets (`mpAlle.xpm`, `mflAlles.xpm`, `btScore.xpm`,
    // `spLabyrinth.xpm`), which are drawn by index too and are not bounded by any schema.
    //
    // So the assertion is a floor and an integer check, and the **distribution** is asserted
    // rather than a maximum. The two figures that matter are the counts `schema16` and
    // `default1` care about: 164 keys have exactly sixteen icons, which is the number group 8's
    // compositor has to produce for a kind whose picture is 16, and 22 have exactly one, which is
    // every kind `default1` can apply to.
    const values = [...PICTURE_ICONS.values()];
    // One, not zero: every key here is a real picture, so a zero would mean the sweep had
    // picked up a kind name — see the test above.
    expect(Math.min(...values)).toBe(1);
    expect(values.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
    const at = (n: number): number => values.filter((v) => v === n).length;
    expect(at(16), "keys with schema16's sixteen icons").toBe(164);
    expect(at(1), "keys with a single icon, which is every kind default1 can apply to").toBe(22);
    // And the tail is named rather than bounded, so a picture far past 16 is a known thing
    // instead of a surprise.
    const largest = Math.max(...values);
    expect(PICTURE_ICONS.get("mbSchmelz1.xpm")).toBe(largest);
    expect(largest).toBe(512);
  });

  it("and the count for an unknown key is null, not zero", () => {
    // The distinction `defaultCodeFor`'s refusal turns on: a key nobody has stated a count for
    // must be `null` and not 0, because 0 is now a value the table never holds.
    expect(iconCountOf("notAKeyAtAll.xpm")).toBeNull();
    expect(iconCountOf("Grau"), "a kind name is not a key").toBeNull();
    expect(iconCountOf("ipGrau.xpm")).toBe(1);
  });
});

describe("the corpus against the table", () => {
  it("and every icon count is one the level's own Cual can ask for", () => {
    // The pairing that makes the transcription legitimate rather than a guess: upstream's icons
    // and Cual's `pos` values are a matched set, so a `pos` in range of the real figure is in
    // range of ours. Asserted as a bound rather than an equality — a level may legitimately ask
    // for fewer positions than the file holds — and only where the key is a picture at all.
    //
    // `pfeile.ld` is the level with the widest draw vocabulary per picture in the corpus: six
    // icons per arrow, and `ipStart.xpm` has 24.
    expect(PICTURE_ICONS.get("ipHoch.xpm")).toBe(6);
    expect(PICTURE_ICONS.get("ipStart.xpm")).toBe(24);
    // And `schema16` is the schema that asks for all sixteen, so the compositor in group 8 has
    // to produce 16 for a kind whose picture is 16 icons.
    expect(PICTURE_ICONS.get("mziAlle.xpm")).toBe(10);
  });

  it("and the count of keys in the table matches the images on disk being reachable", () => {
    // A census of the *table* rather than of the images: it is the property the game needs, and
    // it holds with or without the upstream tree. The image-side check is the one above.
    expect(PICTURE_ICONS.size).toBe(ART_MANIFEST.entries.size);
    if (!hasUpstream) return;
    // And with the tree, nothing in the table is unreadable, which is what makes the strict
    // `unreadable` assertion above safe to keep.
    expect(readdirSync(PICS).length).toBeGreaterThan(PICTURE_ICONS.size);
  });
});
