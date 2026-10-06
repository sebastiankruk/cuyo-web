// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * Event dispatch: the twelve events of `sorte.h`'s enum, and the order they fire in.
 *
 * Task 4.10. An event is not a block in the level — it is an ordinary definition named
 * `"<kind>.<event>"`, which `Sorte`'s constructor looks up:
 *
 *     /* i erst bei 1 los; 0 ist event_draw, der eine Sonderbehandlung ist. *\/
 *     for (int i = 1; i < event_anz; i++)
 *       mEventCode[i] = ld->mLevelConf[ldteil_level]->getCode(mName + "." + cEventNamen[i],
 *                                                            version, true);
 *
 * So the level writes `gras.init = { ... }`, and the *only* thing that makes it an event is that
 * the name has a dot in it and the part after the dot is one of these eleven words. That is why
 * this module's job is a name table and an order, not a parser.
 *
 * ## `init` runs first, on its own, and only that
 *
 *     void Blop::sendeGeschedulteEvents() {
 *       /* Um moeglichst kurze gleichzeiten zu haben, koennte man jede Event-Sorte in einer
 *          eigenen Gleichzeit ausfuehren. Bisher weiss ich aber noch nicht, in welcher Reihenfolge
 *          ich das machen wollen wuerde. Das einzige, was wirklich logisch erscheint, ist, init-Events
 *          vor allen anderen auszufuehren. *\/
 *       beginGleichzeitig();
 *       for (int i = 0; i < (int) gSEListe.size(); i++)
 *         if (gSEListe[i] && gSEListe[i]->mScheduleEventNr == event_init) { ... }
 *       endGleichzeitig();
 *
 *       beginGleichzeitig();
 *       for (int i = 0; i < (int) gSEListe.size(); i++)
 *         if (gSEListe[i]) { ... }
 *       endGleichzeitig();
 *       gSEListe.clear();
 *     }
 *
 * Upstream is explicit that the per-event-type windows are *not* implemented and that it does
 * not know what order it would want — it only knows `init` must come first. So: two windows,
 * `init` alone in the first, everything else in the second, in scheduling order. Transcribed as
 * written rather than generalised into one window per event.
 *
 * ## `init` fires exactly once
 *
 * Two independent reasons, and either alone would do:
 *
 * - `scheduleEvent` opens with `CASSERT(mScheduleEventNr == event_keins)` and `Blop`'s constructor
 *   is the only caller for `init`, so there is one `init` per blob and it is scheduled at
 *   construction.
 * - The dispatch loop clears `mScheduleEventNr` *before* calling `execEvent`, so an `init` whose
 *   body schedules something else cannot be re-run.
 *
 * ## A key press is not conditional; the rotation it might cause is
 *
 *     void Fall::tasteDreh1(){
 *       mBlop[0].execEvent(event_keyturn);
 *       mBlop[1].execEvent(event_keyturn);
 *     }
 *
 * No `steuerbar()`, no `testBelegt`. `tasteDreh2` immediately afterwards has both, because
 * *that* is the function that moves the piece. So `keyturn` — and `keyleft` and `keyright` —
 * fire whether or not the press can do anything at all, which is the documented behaviour and
 * the reason a level can use `keyturn` to play a sound for a rejected press.
 */

/** `cEventNamen`, in `event_anz` order. Index 0 is `event_draw`. */
export const EVENTS = [
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
] as const;

/** An event's name. */
export type EventKind = (typeof EVENTS)[number];

/** `event_keins`, the value `mScheduleEventNr` holds when nothing is pending. */
export const EVENT_KEINS = -1;
/** `event_anz`: the number of events. */
export const EVENT_ANTZ = EVENTS.length;

/** An event's number, which is its index — `event_draw` must stay 0. */
export const EVENT_NUMBER: Readonly<Record<EventKind, number>> = Object.freeze(
  Object.fromEntries(EVENTS.map((name, index) => [name, index])) as Record<EventKind, number>,
);

/**
 * The name for a number, or `null` for anything that is not an event.
 *
 * `event_keins` (-1) is deliberately `null` rather than a name: it means "nothing pending",
 * and giving it a name would invite `execEvent` on a blob with no event.
 *
 * **The bounds check has no test that could fail, and that is worth knowing.** Deleting it and
 * returning `EVENTS[number] ?? null` behaves identically — `EVENTS[-1]` and `EVENTS[12]` are
 * both `undefined`, so the guard and its absence agree on every input. A mutation loop that
 * reports a pass here is reporting nothing. The guard stays because `execEvent` indexes
 * `cEventNamen` directly with no bounds check of its own, and the point of this function is to
 * be the place where a bad number is caught.
 */
export function eventNameOf(number: number): EventKind | null {
  return number >= 0 && number < EVENT_ANTZ ? EVENTS[number] : null;
}

/** The event name for a definition suffix, or `null` if it is not one. */
export function eventForName(name: string): EventKind | null {
  return (EVENTS as readonly string[]).includes(name) ? (name as EventKind) : null;
}

/**
 * The definition a level writes an event in: `"<kind>.<event>"`.
 *
 * `draw` is included for completeness but upstream never looks up a name for it — `getCode` is
 * called for `i` from 1, with the comment "i erst bei 1 los; 0 ist event_draw, der eine
 * Sonderbehandlung ist". The draw code is the kind's own unnamed block.
 */
export function eventDefinitionName(kindName: string, event: EventKind): string {
  return `${kindName}.${event}`;
}

/**
 * Something that can be sent an event — a blob, the global blob, or a falling piece's half.
 *
 * `pending` is mutable because it is the blob's own field upstream (`mScheduleEventNr`), and the
 * queue's correctness depends on being able to clear it.
 */
export interface EventTarget {
  readonly kind: number;
  /** `mScheduleEventNr`: what this blob is waiting for, or `null` for `event_keins`. */
  pending: EventKind | null;
}

/** One event, ready to run. */
export interface ScheduledEvent {
  readonly target: EventTarget;
  readonly event: EventKind;
}

/**
 * `Blop::gSEListe`: blobs waiting for an event.
 *
 * A blob holds at most one pending event, and the assert is upstream's rather than a design
 * choice here — it reads "It is not yet possible to schedule several events for one Blop". So
 * scheduling twice for the same blob is an error, not a queue.
 */
export class EventQueue {
  #list: ScheduledEvent[] = [];

  /** The blobs waiting, in scheduling order. `gSEListe`. */
  get pending(): readonly ScheduledEvent[] {
    return this.#list;
  }

  /** `Blop::scheduleEvent`. */
  schedule(target: EventTarget, event: EventKind): void {
    if (target.pending !== null) {
      throw new Error(
        `Cual: cannot schedule '${event}' on a blob that is already waiting for '${target.pending}' — a blob holds one pending event at a time`,
      );
    }
    if (event === "draw") {
      throw new Error("Cual: 'draw' is not scheduled; the draw code runs every step");
    }
    target.pending = event;
    this.#list = [...this.#list, { target, event }];
  }

  /** Clear a blob's pending event and forget it, as the dispatch loop does. */
  private take(predicate: (entry: ScheduledEvent) => boolean): ScheduledEvent[] {
    const taken = this.#list.filter(predicate);
    for (const entry of taken) entry.target.pending = null;
    this.#list = this.#list.filter((entry) => !predicate(entry));
    return taken;
  }

  /**
   * Take everything and split it into the windows `sendeGeschedulteEvents` would use.
   *
   * The first window holds only `init`; the second holds the rest. Each is returned in
   * scheduling order, and an empty window is left out entirely — a `beginGleichzeitig()` with
   * nothing in it still bumps the time-slice counter, and taking a round for it would make the
   * number of rounds an accident of which events happened to fire.
   */
  planDispatch(): readonly DispatchRound[] {
    const init = this.take((entry) => entry.event === "init");
    const rest = this.take(() => true);
    const rounds: DispatchRound[] = [];
    if (init.length > 0) rounds.push({ ownWindow: true, events: init });
    if (rest.length > 0) rounds.push({ ownWindow: false, events: rest });
    return rounds;
  }
}

/** One `beginGleichzeitig()` / `endGleichzeitig()` window's worth of events. */
export interface DispatchRound {
  /**
   * Whether this round gets its own window, as `init` does.
   *
   * Every round gets a window — that is what "own" means here is only that `init` is *alone* in
   * its. The flag is kept because it is the distinction upstream's comment is actually making:
   * one window per event *type* is unimplemented, and `init` merely is not sharing.
   */
  readonly ownWindow: boolean;
  readonly events: readonly ScheduledEvent[];
}

/**
 * Run the queue: plan the rounds, hand each to `run`, and clear the list afterwards.
 *
 * `gSEListe.clear()` is at the end of `sendeGeschedulteEvents`, so anything `run` schedules
 * while a round is going is *not* dispatched by this call — it waits for the next one. That is
 * why `run` is handed a round it can inspect rather than the queue itself.
 */
export function dispatchScheduled(queue: EventQueue, run: (round: DispatchRound) => void): void {
  for (const round of queue.planDispatch()) run(round);
}
