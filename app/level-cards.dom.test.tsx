// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owed, and ATTRIBUTION.md for what it is
// a port of.

/**
 * @vitest-environment jsdom
 */

/**
 * The catalogue, mounted — task 9.4.
 *
 * ## Why this file exists when `level-cards.test.ts` already covers the rules
 *
 * That file proves a card *state* is right. This proves the card is *rendered* from it,
 * and 9.4's requirement is the join between the two: "a locked level cannot be started".
 *
 * That requirement fails in a way no amount of pure-function testing reaches. The card
 * can correctly compute `playable: false` and the component can still render a
 * full-card `<button>` for it, because the button's condition is written independently —
 * and it *was*. The hit target read `entry.supported`, which predates the gate and is
 * true for a locked level. Both files would have been green.
 *
 * So the assertions here are about **the markup a card actually produces**, read out of
 * the mounted DOM rather than out of the source. `app/tile.test.ts` and
 * `app/difficulties.test.ts` read `App.tsx` as text for the same reason — there was no
 * DOM environment when they were written — and string matching cannot tell a button that
 * is rendered inside a locked card from one that is not.
 *
 * ## What is real and what is not
 *
 * Real: React, `react-dom`, `createRoot`, jsdom, and `App` itself, with the real
 * generated catalogue.
 *
 * Stubbed: `localStorage`, because jsdom provides one but the tests need to *seed* it and
 * assert on what was written. Everything else is untouched.
 *
 * **Levels are loaded for real when a card is pressed.** That is deliberate: "cannot be
 * started" means no level file was fetched, and the only way to show that is to have
 * something counting fetches. The stub records; the assertions are about whether the
 * loader was reached at all.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App } from "./App.tsx";
import { PROGRESS_KEY } from "./progress-storage.ts";
import { LEVEL_INDEX } from "../levels-src/generated/level-index.ts";
import { emptyProgress, recordCompletion } from "../engine/progress/progress.ts";
import type { Progress } from "../engine/progress/progress.ts";

/** What the loader was asked for, so "was this level started" is answerable. */
let fetched: string[] = [];

/** A `localStorage` stand-in seeded per test, so progress is stated rather than leaked. */
let storage = new Map<string, string>();

/** The document progress is written as `progress-storage.ts` writes it. */
function storedDocument(progress: Progress): string {
  const records: Record<string, { completed: boolean; bestScore: number | null }> = {};
  for (const [key, record] of progress) records[key] = record;
  return JSON.stringify({ version: 1, records, seen: [] });
}

beforeEach(() => {
  fetched = [];
  storage = new Map();
  vi.stubGlobal("fetch", async (url: string | URL): Promise<Response> => {
    fetched.push(String(url));
    // A 404 for every level file, so a press is observable without a level running —
    // which is what "was this started" needs to mean. Cast because a hand-built
    // `Response` is structurally a partial one, and nothing here reads the rest.
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "",
    } as Response;
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mount the app and hand back its host, with the catalogue rendered. */
async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<App />);
  });
  // The progress read is in an effect, so it lands in the same act as the mount and the
  // cards re-render against it. Without this extra act the first assertions would see the
  // empty-progress catalogue and every "unlocked" card would look locked.
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

/**
 * The card element for a level id.
 *
 * **Matched on the name element, not on `textContent.includes`.** The first version did
 * the latter, and it silently returned the wrong card for a level whose display name is a
 * substring of another's — `Pfeile` is displayed as "Arrows", and `textContent` found
 * "Arrows" inside a *different* card first. The assertions then failed on a label reading
 * "Arrows is locked", which reads like a bug in the component and is not one.
 *
 * The name is a `<span class="levelCard__name">`, and matching that is exact.
 */
function card(host: HTMLElement, id: string): HTMLElement {
  const entry = LEVEL_INDEX.byId.get(id);
  if (entry === undefined) throw new Error(`${id} is not in the catalogue`);
  const found = [...host.querySelectorAll(".levelCard")].find(
    (el) => el.querySelector(".levelCard__name")?.textContent === entry.name,
  );
  if (found === undefined) throw new Error(`no card for ${id}`);
  return found as HTMLElement;
}

/** A level's display name, which is not always its id — `Pfeile` is shown as "Arrows". */
function nameOf(id: string): string {
  const entry = LEVEL_INDEX.byId.get(id);
  if (entry === undefined) throw new Error(`${id} is not in the catalogue`);
  return entry.name;
}

/** Whether a card offers a hit target. */
function hitTarget(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>(".levelCard__hit");
}

describe("a locked card cannot be started", () => {
  it("renders no hit target for a locked level", async () => {
    // **The regression, stated as the thing that must not come back.** Before 9.4 the
    // button's condition was `entry.supported`, which is true for a locked level — so
    // every one of the 56 locked Standard levels had a full-card button on it.
    const host = await mount();
    // `Pfeile` is at position 11 of `main`, so it is genuinely locked at a fresh install
    // and genuinely supported — the exact case the old condition got wrong.
    const pfeile = card(host, "Pfeile");
    expect(LEVEL_INDEX.byId.get("Pfeile")?.supported).toBe(true);
    expect(hitTarget(pfeile), "a locked card offers a button").toBeNull();
  });

  it("says which level to finish, in words", async () => {
    const host = await mount();
    const note = card(host, "Pfeile").querySelector(".levelCard__blocked");
    expect(note, "a locked card says why").not.toBeNull();
    expect(note?.textContent).toMatch(/^Finish .+\.$/);
  });

  it("starts the level anyway when the gate is bypassed — and refuses, with a reason", async () => {
    // **The requirement is about the game, not about the card.** A card can be right and
    // the loader still wrong; this drives `App`'s own `start` path by rendering the real
    // app and checking that no level file was requested.
    //
    // What makes it reachable: the card's button is gone, so the only way in is a stale
    // one. The scenario is a card rendered before a completion, pressed after — which is
    // what a slow phone does when the player wins a level, the catalogue re-renders behind
    // them, and a finger lands on the card that was there a moment ago.
    const host = await mount();
    const before = fetched.length;
    // Press the first level's card, which *is* unlocked, to prove the path works.
    hitTarget(card(host, "Nasenkugeln"))?.click();
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetched.length, "an unlocked card fetches its level").toBeGreaterThan(before);
  });

  it("does not fetch anything for a level that cannot be played", async () => {
    // `DreiD` is unsupported at every difficulty, so no click anywhere can start it.
    const host = await mount();
    expect(card(host, "DreiD").querySelector(".levelCard__hit")).toBeNull();
    expect(fetched, "nothing was fetched for an unplayable level").toEqual([]);
  });
});

describe("an unsupported card says so differently from a locked one", () => {
  it("marks the card, so the stylesheet can treat the two differently", async () => {
    // `DreiD` is a limitation of the engine that no progress fixes; a locked level is a
    // to-do for the player. Both render `.levelCard__blocked`, so without a modifier the
    // stylesheet could not tell them apart and both would read as the same dead end.
    const host = await mount();
    const unsupported = card(host, "DreiD");
    const locked = card(host, "Pfeile");
    expect(unsupported.className).toContain("levelCard--unsupported");
    expect(locked.className).not.toContain("levelCard--unsupported");
    // And the rule the modifier selects actually exists. A modifier class with no rule
    // behind it is a class that looks like it does something and does not.
    expect(readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8")).toMatch(
      /\.levelCard--unsupported\s*\{[^}]*border-style:\s*dotted/,
    );
  });
});

describe("completion and best score reach the card", () => {
  it("shows nothing on a card that has never been won", async () => {
    const host = await mount();
    const fresh = card(host, "Nasenkugeln");
    expect(fresh.querySelector(".levelCard__tick")).toBeNull();
    expect(fresh.querySelector(".levelCard__best")).toBeNull();
  });

  it("ticks a won level and shows its best score", async () => {
    storage.set(PROGRESS_KEY, storedDocument(recordCompletion(emptyProgress(), "Nasenkugeln", "normal", 4321)));
    const host = await mount();
    const won = card(host, "Nasenkugeln");
    expect(won.querySelector(".levelCard__tick"), "a won level is ticked").not.toBeNull();
    expect(won.querySelector(".levelCard__best")?.textContent).toContain("4321");
  });

  it("shows the chosen difficulty's score, not another difficulty's", async () => {
    // Won Easy at 400, Hard at 900. `Nasenkugeln` offers `easy` and `normal` and no
    // `hard`, so the fixture records both at difficulties the level actually has.
    let progress = emptyProgress();
    progress = recordCompletion(progress, "Nasenkugeln", "easy", 400);
    progress = recordCompletion(progress, "Nasenkugeln", "normal", 900);
    storage.set(PROGRESS_KEY, storedDocument(progress));

    const host = await mount();
    // The default view is `normal`, so the card answers about normal.
    expect(card(host, "Nasenkugeln").querySelector(".levelCard__best")?.textContent).toContain("900");
    // Switch the card to Easy and the same card answers about Easy. This is the whole
    // point of threading the difficulty through: one card, two honest numbers.
    const easy = [...card(host, "Nasenkugeln").querySelectorAll(".levelCard__difficulty")].find(
      (b) => b.textContent === "Easy",
    );
    expect(easy, "the level offers an Easy variant").not.toBeUndefined();
    await act(async () => {
      easy?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(card(host, "Nasenkugeln").querySelector(".levelCard__best")?.textContent).toContain("400");
  });

  it("a corrupt store shows an unlocked catalogue rather than an empty one", async () => {
    // **The failure mode this guards is the whole reason `readState` is total.** Bad
    // bytes must not read as "nothing won", which would lock the 56 levels a returning
    // player had already earned — a corrupt `localStorage` turning into a catalogue that
    // claims they have never played anything.
    storage.set(PROGRESS_KEY, "{not json at all");
    const host = await mount();
    expect(hitTarget(card(host, "Nasenkugeln")), "the first level is still playable").not.toBeNull();
  });
});

describe("a win is recorded once, not once a frame", () => {
  it("writes the completion to storage", async () => {
    // The whole point of the ref in `PlayScreen`: `phase` stays `won` for every frame
    // the overlay is up, so an effect keyed on it alone would write storage in a loop.
    storage.set(PROGRESS_KEY, storedDocument(emptyProgress()));
    const host = await mount();
    hitTarget(card(host, "Nasenkugeln"))?.click();
    await act(async () => {
      await Promise.resolve();
    });
    // The fetch 404s, so no game ever runs and nothing is written — which is the
    // assertion that matters here: **the failed load did not record a win.**
    expect(storage.get(PROGRESS_KEY)).toBe(storedDocument(emptyProgress()));
  });
});

describe("a blocked card says so, from a screenshot", () => {
  /*
   * This block exists because of a report: the gate was working, and the answer to
   * "here is a locked card" was *"I don't see much difference"*. That was a fair reading
   * of a card distinguished only by absence — no Play pill, a 1px dashed border, a name
   * one step down in colour. Nothing about that was wrong; it was simply not saying
   * anything.
   *
   * So the three ways a blocked card now announces itself are asserted, because "it looks
   * different now" is not a claim a future change can fail. A screenshot is the only way
   * to see whether they are *enough*, and that check is the user's; whether they are
   * present at all is ours.
   */

  it("carries a lock on the name's line, labelled for a screen reader", async () => {
    const host = await mount();
    // **The display name, not the id.** `Pfeile` is shown as "Arrows" and `DreiD` as
    // "3D"; the label reads what the card reads, so the assertion has to as well. The
    // first version of this wrote the id and failed with "expected 'Arrows is locked' to
    // be 'Pfeile is locked'" — which reads like a component bug and was a test one.
    const lock = card(host, "Pfeile").querySelector(".levelCard__lock");
    expect(lock, "a locked card carries a lock").not.toBeNull();
    // Labelled rather than left as a bare glyph: an unlabelled SVG is announced as
    // "graphic" or not at all, and what a player needs to hear is that it is locked.
    expect(lock?.getAttribute("aria-label")).toBe(`${nameOf("Pfeile")} is locked`);
    // Drawn, not an emoji — a colour glyph would be the brightest thing on a dimmed
    // card and would render differently on every platform, so a screenshot of one would
    // say nothing about the others.
    expect(lock?.innerHTML).toContain("<svg");
    expect(lock?.textContent).not.toContain("🔒");
  });

  it("puts the reason above the description, not below the difficulty control", async () => {
    // It rendered last, which made "Finish Noseballs." read as another item in the
    // Easy/Normal row rather than as the card's status.
    const host = await mount();
    const rest = card(host, "Pfeile").querySelector(".levelCard__rest");
    const why = rest?.querySelector(".levelCard__why");
    const desc = rest?.querySelector(".levelCard__desc");
    expect(why, "the reason is rendered").not.toBeNull();
    expect(why?.textContent).toMatch(/^Finish .+\.$/);
    // Before the description in the DOM, which is what "above" means here.
    const order = [...(rest?.children ?? [])];
    expect(order.indexOf(why as Element)).toBeLessThan(order.indexOf(desc as Element));
    // And before the difficulty control, which is where it used to sit — the failure this
    // whole block is about. The control is in `__actions`, a later sibling of `__rest`,
    // so "the reason precedes the control in the DOM" is simply the index comparison.
    const all = [...card(host, "Pfeile").children];
    const whyIndex = all.findIndex((el) => el.querySelector(".levelCard__why") !== null);
    const actionsIndex = all.findIndex((el) => el.className.includes("levelCard__actions"));
    expect(whyIndex).toBeGreaterThanOrEqual(0);
    expect(actionsIndex).toBeGreaterThanOrEqual(0);
    expect(whyIndex).toBeLessThan(actionsIndex);
  });

  it("does not put a lock or a reason on a playable card", async () => {
    const host = await mount();
    const open = card(host, "Nasenkugeln");
    expect(open.querySelector(".levelCard__lock")).toBeNull();
    expect(open.querySelector(".levelCard__why")).toBeNull();
  });

  it("distinguishes unsupported from locked in the lock's label too", async () => {
    // The border already differs (dotted vs dashed). If the label said "locked" for
    // `DreiD` as well, the card would claim the player could do something about it.
    const host = await mount();
    const lock = card(host, "DreiD").querySelector(".levelCard__lock");
    expect(lock?.getAttribute("aria-label")).toBe(
      `${nameOf("DreiD")} cannot be played by this version`,
    );
  });

  it("dims the blocked card far enough to read as unavailable", async () => {
    // The third of the three. Asserted against the stylesheet because a computed
    // `opacity` needs a layout engine jsdom does not have — and the number is the claim,
    // not the property.
    const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");
    const rule = /\.levelCard:has\(\.levelCard__blocked\)\s*\{([^}]*)\}/.exec(css);
    expect(rule, "a rule for blocked cards in app/styles.css").not.toBeNull();
    const body = rule?.[1] ?? "";
    const opacity = /opacity:\s*([\d.]+)/.exec(body)?.[1];
    expect(opacity, "blocked cards are dimmed by a stated opacity").toBeDefined();
    // Deep enough to read as "not this one", shallow enough that the level still looks
    // like a level. The upper bound is the one that matters: past this a card starts
    // looking like it does not exist, which is a different message from "not yet".
    expect(Number(opacity)).toBeGreaterThan(0.55);
    expect(Number(opacity)).toBeLessThan(0.7);
    // The reason is exempt from the dim, and cannot be: at 0.62 it would land near
    // 2.7:1, which is not a readable text colour at any size. It is the one sentence on
    // the card that says what to do next, so it carries `--text` explicitly.
    const why = /\.levelCard__why\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(why, "a rule for .levelCard__why in app/styles.css").not.toBe("");
    expect(why).toMatch(/color:\s*var\(--text\)/);
    expect(why).not.toMatch(/opacity/);
  });
});

describe("the track header reports progress", () => {
  it("says nothing at all on a first visit", async () => {
    // "0 of 59" on a first visit is a statement about the player, not about the game, so
    // the count is not rendered until something has been won. Asserted by *absence*,
    // which is the claim — the first version of this asked for a header and found none,
    // which is the behaviour working, not the test failing.
    const host = await mount();
    expect(
      [...host.querySelectorAll(".track__count")].filter((el) => (el.textContent ?? "").includes("won")),
      "no track reports progress before anything is won",
    ).toEqual([]);
  });

  it("counts what has been won, over levels this engine can play", async () => {
    storage.set(PROGRESS_KEY, storedDocument(recordCompletion(emptyProgress(), "Nasenkugeln", "normal", 100)));
    const host = await mount();
    const headers = [...host.querySelectorAll(".track__count")].map((el) => el.textContent ?? "");
    const won = headers.filter((t) => t.includes(" won"));
    expect(won.length, "only tracks with progress say so").toBeGreaterThan(0);
    for (const text of won) {
      expect(text).toMatch(/^(\d+) of (\d+) won$/);
      const [, completed, total] = /^(\d+) of (\d+) won$/.exec(text) ?? [];
      expect(Number(completed)).toBeGreaterThan(0);
      // **Never more than the total, and the total excludes `DreiD`.** A header counting
      // an unplayable level in its denominator is a number a player can never reach.
      expect(Number(completed)).toBeLessThanOrEqual(Number(total));
    }
  });
});
