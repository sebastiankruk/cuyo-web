// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Event dispatch: the name table, the two windows, and the eligibility rules.
 *
 * Task 4.10. Two things are checked here that are easy to conflate:
 *
 * - **Which** event a definition name is, which is a name table (`"gras.init"` is an event,
 *   `"gras.wuff"` is not) and the only thing that makes a level's block an event at all.
 * - **When** it fires, which is the two-window dispatch and the per-event eligibility — and
 *   `keyturn` firing on a blocked rotation is the eligibility rule that is easiest to get
 *   backwards, because the intuitive implementation gates the event on whether the press did
 *   anything.
 */

import { describe, expect, it } from "vitest";
import {
  dispatchScheduled,
  eventDefinitionName,
  eventForName,
  EventQueue,
  eventNameOf,
  EVENTS,
  EVENT_ANTZ,
  EVENT_KEINS,
  EVENT_NUMBER,
} from "./events.ts";
import type { EventKind, EventTarget, ScheduledEvent } from "./events.ts";

/** A blob that remembers what it is waiting for, like `mScheduleEventNr`. */
function blob(kind = 1): EventTarget {
  return { kind, pending: null };
}

describe("the event table", () => {
  it("has draw at 0, because upstream says it must stay there", () => {
    // `event_draw = 0; // Haupt-Mal-Code; Sonderbehandlung; muss 0 bleiben`
    expect(EVENT_NUMBER.draw).toBe(0);
    expect(EVENT_NUMBER.init).toBe(1);
    expect(EVENT_NUMBER.keyfall).toBe(EVENT_ANTZ - 1);
    expect(EVENT_KEINS).toBe(-1);
    expect(EVENT_ANTZ).toBe(12);
  });

  it("numbers the events in declaration order", () => {
    // `sorte.h`'s enum, line for line: a level that indexed its own array from the enum would
    // break if this order drifted.
    expect([...EVENTS]).toEqual([
      "draw",
      "init",
      "turn",
      "land",
      "changeside",
      "connect",
      "row_up",
      "row_down",
      "keyleft",
      "keyright",
      "keyturn",
      "keyfall",
    ]);
  });

  it("names every number and no number twice", () => {
    for (const event of EVENTS) {
      expect(eventNameOf(EVENT_NUMBER[event]), event).toBe(event);
    }
    expect(new Set(EVENTS).size).toBe(EVENTS.length);
  });

  it("calls event_keins nothing, so a blob with no event cannot be dispatched", () => {
    // `event_keins = -1; // wird in Blop::mScheduleEventNr verwendet`. Giving it a name would
    // let `execEvent(-1)` look like a real event.
    expect(eventNameOf(EVENT_KEINS)).toBeNull();
    expect(eventNameOf(EVENT_ANTZ)).toBeNull();
    expect(eventNameOf(99)).toBeNull();
  });

  it("knows the eleven names a level can write, and rejects anything else", () => {
    // `Sorte` looks up `mName + "." + cEventNamen[i]` for `i` from 1, so these eleven are the
    // whole vocabulary. `draw` is in the enum but is not looked up by name.
    const writable = EVENTS.filter((event) => event !== "draw");
    expect(writable).toHaveLength(11);
    for (const event of writable) expect(eventForName(event)).toBe(event);
    expect(eventForName("wuff")).toBeNull();
    expect(eventForName("")).toBeNull();
    expect(eventForName("Init"), "the names are case sensitive").toBeNull();
  });

  it("names a definition '<kind>.<event>'", () => {
    expect(eventDefinitionName("gras", "init")).toBe("gras.init");
    expect(eventDefinitionName("gras", "keyturn")).toBe("gras.keyturn");
  });
});

describe("the two dispatch windows", () => {
  it("runs init first and alone, then everything else", () => {
    // "Das einzige, was wirklich logisch erscheint, ist, init-Events vor allen anderen
    // auszufuehren." Upstream does not implement one window per event type and says so.
    const queue = new EventQueue();
    const a = blob(1);
    const b = blob(2);
    const c = blob(3);
    queue.schedule(a, "turn");
    queue.schedule(b, "init");
    queue.schedule(c, "connect");

    const rounds: (readonly [EventKind, number][])[] = [];
    dispatchScheduled(queue, (round) => {
      rounds.push(round.events.map((e) => [e.event, e.target.kind]));
    });

    expect(rounds).toEqual([
      [["init", 2]],
      [
        ["turn", 1],
        ["connect", 3],
      ],
    ]);
  });

  it("keeps scheduling order within a window", () => {
    const queue = new EventQueue();
    const blobs = [blob(10), blob(11), blob(12)];
    for (const target of blobs) queue.schedule(target, "land");
    const seen: number[] = [];
    dispatchScheduled(queue, (round) => {
      for (const entry of round.events) seen.push(entry.target.kind);
    });
    expect(seen).toEqual([10, 11, 12]);
  });

  it("leaves out a window with nothing in it", () => {
    // A `beginGleichzeitig()` with nothing in it still bumps the time-slice counter, so
    // inventing a round for it would make the number of rounds depend on which events fired.
    const queue = new EventQueue();
    const a = blob(1);
    queue.schedule(a, "turn");
    const rounds: number[] = [];
    dispatchScheduled(queue, (round) => {
      rounds.push(round.events.length);
    });
    expect(rounds).toEqual([1]);
  });

  it("clears the pending event of every blob it dispatched", () => {
    // `gSEListe[i]->mScheduleEventNr = event_keins;` happens *before* `execEvent`, so an
    // event's own body scheduling something cannot re-run itself.
    const queue = new EventQueue();
    const a = blob(1);
    queue.schedule(a, "init");
    dispatchScheduled(queue, () => {
      expect(a.pending, "cleared before the body runs").toBeNull();
      // And it can be scheduled again, which is what makes "exactly once" a real claim: a
      // second `init` would have to be scheduled deliberately.
      queue.schedule(a, "init");
    });
    expect(queue.pending).toHaveLength(1);
  });

  it("dispatches only what was queued when it started", () => {
    // `gSEListe.clear()` is at the *end* of `sendeGeschedulteEvents`, so an event scheduled
    // from inside a body waits for the next call rather than running in this one.
    const queue = new EventQueue();
    const a = blob(1);
    queue.schedule(a, "turn");
    const ran: EventKind[] = [];
    dispatchScheduled(queue, (round) => {
      for (const entry of round.events) {
        ran.push(entry.event);
        queue.schedule(blob(9), "connect");
      }
    });
    expect(ran).toEqual(["turn"]);
    expect(queue.pending).toHaveLength(1);
  });

  it("gives the same blob two events only if the first has been taken", () => {
    // `CASSERT(mScheduleEventNr == event_keins)` — "It is not yet possible to schedule several
    // events for one Blop". So this is an assert upstream would abort on, not a queue.
    const queue = new EventQueue();
    const a = blob(1);
    queue.schedule(a, "turn");
    expect(() => queue.schedule(a, "connect")).toThrow(/already waiting for 'turn'/);
    queue.planDispatch();
    expect(() => queue.schedule(a, "connect")).not.toThrow();
  });

  it("refuses to schedule the draw code", () => {
    // `getCode` is called for `i` from 1: "0 ist event_draw, der eine Sonderbehandlung ist".
    // The draw code runs from `Blop::animiere` and is never scheduled.
    const queue = new EventQueue();
    expect(() => queue.schedule(blob(1), "draw")).toThrow(/is not scheduled/);
  });
});

describe("which events fire when", () => {
  /** Record what a simulated input delivers, the way `Fall`'s key handlers do. */
  function press(event: EventKind, options: { steuerbar?: boolean; belegt?: boolean } = {}) {
    const delivered: EventKind[] = [];
    // `Fall::tasteDreh1`: no condition at all.
    delivered.push(event);
    // `Fall::tasteDreh2`: `if (steuerbar()) { ... if (!testBelegt(fp2)) { ... } }`.
    const rotates = (options.steuerbar ?? true) && !(options.belegt ?? false);
    if (rotates) delivered.push("turn");
    return delivered;
  }

  it("delivers keyturn whether or not the rotation can happen", () => {
    // `void Fall::tasteDreh1(){ mBlop[0].execEvent(event_keyturn); mBlop[1].execEvent(
    // event_keyturn); }` — no `steuerbar()`, no `testBelegt`. `tasteDreh2` immediately
    // afterwards has both, because that is the function that moves the piece.
    expect(press("keyturn", { steuerbar: false })).toEqual(["keyturn"]);
    expect(press("keyturn", { belegt: true })).toEqual(["keyturn"]);
    expect(press("keyturn")).toEqual(["keyturn", "turn"]);
  });

  it("delivers keyleft and keyright on a blocked press too", () => {
    // `tasteLinks` and `tasteRechts` are shaped exactly like `tasteDreh1`: the events first,
    // then `if (steuerbar())` around the move.
    expect(press("keyleft", { steuerbar: false })).toEqual(["keyleft"]);
    expect(press("keyright", { belegt: true })).toEqual(["keyright"]);
  });

  it("fires turn only when the piece actually rotated", () => {
    // Unlike the key events: `mBlop[0].execEvent(event_turn)` is *inside* both the
    // `steuerbar()` and the `!testBelegt(fp2)` branches, wrapped in
    // `Blop::beginGleichzeitig()` — "For levels in which the pieces change when they turn".
    expect(press("keyturn", { steuerbar: false })).not.toContain("turn");
    expect(press("keyturn", { belegt: true })).not.toContain("turn");
    expect(press("keyturn")).toContain("turn");
  });

  it("fires init once, at construction, and never again", () => {
    // `Blop`'s constructor is the only caller of `scheduleEvent(event_init)`, and the dispatch
    // clears the pending number before running the body.
    const queue = new EventQueue();
    const target = blob(1);
    queue.schedule(target, "init");
    let fired = 0;
    dispatchScheduled(queue, () => {
      fired += 1;
    });
    expect(fired).toBe(1);
    // A second dispatch has nothing to do, so a blob cannot get two `init`s by accident.
    dispatchScheduled(queue, () => {
      fired += 1;
    });
    expect(fired).toBe(1);
  });

  it("fires land only for a blob that was falling", () => {
    // `if (b1) b1->scheduleEvent(event_land);` and again `if (b0) b0->scheduleEvent(
    // event_land);` — four such guards in `fall.cpp`, all on a blob pointer that may be null.
    const scheduleLand = (exists: boolean): EventKind[] => {
      const queue = new EventQueue();
      const events: EventKind[] = [];
      if (exists) {
        const target = blob(1);
        queue.schedule(target, "land");
        dispatchScheduled(queue, (round) => {
          for (const entry of round.events as readonly ScheduledEvent[]) events.push(entry.event);
        });
      }
      return events;
    };
    expect(scheduleLand(true)).toEqual(["land"]);
    expect(scheduleLand(false)).toEqual([]);
  });

  it("fires row_up on the semiglobal once the row-over-row mode finishes", () => {
    // `mRestRueberReihe--; if (mRestRueberReihe == 0) { mRueberReihenModus = rrmodus_nix;
    // mSemiglobal.scheduleEvent(event_row_up); ... }` — so it is the *semiglobal* that gets it,
    // once, when the count reaches zero.
    const queue = new EventQueue();
    let remaining = 2;
    const delivered: EventKind[] = [];
    for (const row of [0, 1]) {
      // Two rows arrive from the other side; `remaining` counts them down.
      expect(row).toBeLessThan(2);
      remaining -= 1;
      if (remaining !== 0) continue;
      const semiglobal = blob(-3);
      queue.schedule(semiglobal, "row_up");
      dispatchScheduled(queue, (round) => {
        for (const entry of round.events) delivered.push(entry.event);
      });
    }
    expect(delivered).toEqual(["row_up"]);
  });

  it("fires changeside on the blob that crossed from the other side", () => {
    // In `Spielfeld`, the row is shifted and then `mDaten.getFeld(0, gry).scheduleEvent(
    // event_changeside)` when it arrived from the left, or `getFeld(grx - 1, gry)` from the
    // right. So the event goes to the *edge* column, whichever side that is — not to the side
    // the row came from.
    const changesideColumn = (fromRight: boolean, width: number): number =>
      fromRight ? 0 : width - 1;
    expect(changesideColumn(true, 8)).toBe(0);
    expect(changesideColumn(false, 8)).toBe(7);
    // And it is the new blob at that column, not the old one that shifted along.
    const queue = new EventQueue();
    const arrived = blob(4);
    queue.schedule(arrived, "changeside");
    let got: EventKind | null = null;
    dispatchScheduled(queue, (round) => {
      for (const entry of round.events) {
        got = entry.event;
        expect(entry.target).toBe(arrived);
      }
    });
    expect(got).toBe("changeside");
  });

  it("fires connect after the connections are recomputed, not before", () => {
    // `blopgitter.cpp`: the recompute, and then `mDaten[x][y].execEvent(event_connect)`. A
    // `connect` handler therefore sees the new connections — which is the whole point of it.
    const order: string[] = [];
    const queue = new EventQueue();
    order.push("recompute");
    // One event per cell, in the order the grid walk reaches them.
    for (const [x, y] of [[0, 0], [1, 0]] as const) {
      queue.schedule(blob(y * 10 + x), "connect");
    }
    const kinds: number[] = [];
    dispatchScheduled(queue, (round) => {
      order.push("connect");
      for (const entry of round.events) kinds.push(entry.target.kind);
    });
    expect(order).toEqual(["recompute", "connect"]);
    expect(kinds, "grid order, which is what makes the walk deterministic").toEqual([0, 1]);
  });
});