// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Tests for the art manifest's contract.
 *
 * Two properties carry the weight here. Resolution must never touch the filesystem,
 * because the same code has to run in a browser bundle where there is none. And a
 * missing key must produce a diagnostic naming both the key and the kind, because
 * that is what turns "the game does not load" into a one-line fix.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ArtKeyError,
  artManifest,
  emptyManifest,
  hasArtKey,
  manifestKeys,
  resolveArtKey,
} from "./art.ts";
import type { ArtEntry } from "./art.ts";

function entry(key: string, over: Partial<ArtEntry> = {}): ArtEntry {
  return {
    key,
    source: { kind: "generated", hue: 120, saturation: 62, lightness: 52 },
    // One icon unless a test says otherwise: the smallest count that is still a picture, and
    // the one a single-icon sprite has. Zero would mean "not a picture", which is a different
    // claim and is exercised on its own.
    icons: 1,
    firstKind: key.replace(/\.xpm(\.gz)?$/, ""),
    ...over,
  };
}

describe("artManifest", () => {
  it("resolves a registered key to its entry", () => {
    const m = artManifest([entry("inGruen.xpm"), entry("inGelb.xpm")]);
    expect(
      resolveArtKey(m, "inGruen.xpm", "inGruen", "nasenkugeln.ld").key,
    ).toBe("inGruen.xpm");
    expect(hasArtKey(m, "inGruen.xpm")).toBe(true);
  });

  it("fails on an unregistered key, naming the key, the kind and the origin", () => {
    const m = artManifest([entry("inGruen.xpm")]);
    // All three are in the message. The key tells you what is missing, the kind tells
    // you where to look, the origin tells you which file to open.
    let thrown: unknown;
    try {
      resolveArtKey(m, "fehlt.xpm", "inBunt", "hormone.ld");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ArtKeyError);
    const message = (thrown as Error).message;
    expect(message).toContain("fehlt.xpm");
    expect(message).toContain("inBunt");
    expect(message).toContain("hormone.ld");
    // The structured fields carry the same thing, for a caller that wants to
    // reformat rather than print.
    expect((thrown as ArtKeyError).key).toBe("fehlt.xpm");
    expect((thrown as ArtKeyError).kind).toBe("inBunt");
    expect((thrown as ArtKeyError).origin).toBe("hormone.ld");
  });

  it("does not normalise the key, so a wrong extension is a miss", () => {
    // Upstream's sprites are all `.xpm.gz`. Rewriting `logo.png` to `logo.xpm.gz`
    // would let a level name a picture that does not exist and pass anyway - and the
    // artwork check would then have nothing to compare, because the key it recorded
    // was never the one the level asked for.
    const m = artManifest([entry("logo.xpm.gz")]);
    expect(hasArtKey(m, "logo.png")).toBe(false);
    expect(() => resolveArtKey(m, "logo.png", "logo", "x.ld")).toThrow(
      ArtKeyError,
    );
  });

  it("lets two kinds share a picture, keeping the first", () => {
    // Sharing a picture is normal: upstream's `pics` lists do it, and a picture's
    // role can legitimately differ between versions of one level. `ziehlen.ld` uses
    // `mziAlle.xpm` as an ordinary colour at [1, main] and as a goal blob at
    // [1, contrib, hard]. An earlier version of this file rejected that as a
    // conflict, which was wrong about the data.
    const m = artManifest([
      entry("shared.xpm", { firstKind: "a" }),
      entry("shared.xpm", { firstKind: "b" }),
    ]);
    expect(m.entries.size).toBe(1);
    expect(m.entries.get("shared.xpm")?.firstKind).toBe("a");
  });

  it("sorts its keys, so generated output is stable", () => {
    const m = artManifest([
      entry("zulu.xpm"),
      entry("alpha.xpm"),
      entry("mike.xpm"),
    ]);
    expect(manifestKeys(m)).toEqual(["alpha.xpm", "mike.xpm", "zulu.xpm"]);
  });

  it("resolves against an empty manifest by failing, not by returning nothing", () => {
    expect(() =>
      resolveArtKey(emptyManifest(), "any.xpm", "k", "f.ld"),
    ).toThrow(ArtKeyError);
  });

  it("imports nothing that could touch a filesystem", () => {
    // The property that justifies the whole design: resolution is a pure lookup, so
    // the same code serves the build-time validator, the tests and the browser bundle
    // - where there is no filesystem. If a resolver grew a read, it would keep
    // working here and break only in the browser, which is the worst possible moment
    // to discover it.
    //
    // Checked structurally on the module's own source rather than by spying on `fs`.
    // A spy has to patch a namespace object that Node may freeze, and when the patch
    // silently fails the test passes without having checked anything - a worse
    // failure than a missing test, because it looks like coverage.
    const source = readFileSync(resolve(import.meta.dirname, "art.ts"), "utf8");
    expect(source, "art.ts must not import a filesystem module").not.toMatch(
      /from\s+"node:/,
    );
    // And no dynamic import either, which is the other way in.
    expect(source, "art.ts must not import anything at runtime").not.toMatch(
      /\bimport\s*\(/,
    );
    // Resolution against a literal manifest needs no environment at all, which is the
    // same property from the other side.
    const m = artManifest([entry("inGruen.xpm")]);
    expect(resolveArtKey(m, "inGruen.xpm", "inGruen", "x.ld").key).toBe(
      "inGruen.xpm",
    );
  });
});
