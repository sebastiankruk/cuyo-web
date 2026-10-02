/**
 * The event vocabulary against the real levels.
 *
 * An event is not a block in a level — it is an ordinary definition named `"<kind>.<event>"`,
 * and the only thing that makes it an event is that the part after the dot is one of eleven
 * words. So the whole of task 4.10's name table is checkable against the corpus, and a
 * transcription slip in either direction shows up here rather than as a level that quietly
 * never runs its `init`.
 *
 * The counts are the real ones from `public/levels/*.ld`, so if a level stops using an event
 * this fails — which is the point: an event the table lists but no level uses is a rule nobody
 * has checked, and one the table omits is a level that silently does nothing.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTS, eventForName } from "./events.ts";

const LEVELS = resolve(import.meta.dirname, "../../public/levels");

/** Every `<name>.<suffix> =` in every level, with the file it came from. */
function eventDefinitions(): { file: string; name: string; suffix: string }[] {
  const found: { file: string; name: string; suffix: string }[] = [];
  for (const file of readdirSync(LEVELS).filter((f) => f.endsWith(".ld"))) {
    const src = readFileSync(join(LEVELS, file), "latin1");
    // A dotted name followed by `=`. The name is a kind, so it is a word; the suffix is one of
    // the event words or it is not an event, and both cases are worth seeing.
    for (const match of src.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) {
      found.push({ file, name: match[1], suffix: match[2] });
    }
  }
  return found;
}

describe("the event names the levels actually use", () => {
  it("finds the events in the corpus at all", () => {
    // A guard on the guard: if the pattern stopped matching, the assertions below would pass
    // on an empty list and prove nothing.
    expect(eventDefinitions().length).toBeGreaterThan(100);
  });

  it("recognises every suffix the levels use, and says which are unknown", () => {
    const unknown = new Map<string, string[]>();
    for (const { file, name, suffix } of eventDefinitions()) {
      if (eventForName(suffix) === null) {
        const list = unknown.get(suffix) ?? [];
        list.push(`${file}: ${name}.${suffix}`);
        unknown.set(suffix, list);
      }
    }
    // Dotted names that are not events are legitimate — `pics`, `defaults`, version names —
    // so this is not "every dotted name is an event". It is that every *event-looking* name
    // is one the table knows, and the report names the exceptions rather than hiding them.
    expect([...unknown.keys()].sort()).toEqual([]);
  });

  it("uses all eleven writable events somewhere", () => {
    const used = new Set(eventDefinitions().map((d) => d.suffix));
    const writable = EVENTS.filter((event) => event !== "draw");
    const missing = writable.filter((event) => !used.has(event));
    expect(missing).toEqual([]);
  });

  it("finds exactly one .draw, and it is a procedure rather than the draw event", () => {
    // The one `.draw` in the corpus is `Paratrooper.draw` in paratroopers.ld, and upstream
    // never reads it as the draw event:
    //
    //     /* Mal-cual-Code laden. (Sonderbehandlung; nicht so wie die anderen Events.) *\/
    //     mEventCode[event_draw] = getCode(mName, version, true);
    //
    // — the bare kind name, and `cEventNamen[0]` is `""` with the comment "Der Mal-Code heisst
    // einfach \"wuff\" und nicht \"wuff.draw\" oder so.". So the draw event code is `Paratrooper`,
    // which the same file does define. The level calls `Paratrooper.draw;` explicitly from
    // another block, so it is an ordinary procedure whose name happens to look like an event.
    //
    // Asserted rather than tidied: a reader who assumed `.draw` was the event would make this
    // kind draw nothing at all.
    const draws = eventDefinitions().filter((d) => d.suffix === "draw");
    expect(draws.map((d) => `${d.file}: ${d.name}`)).toEqual([
      "paratroopers.ld: Paratrooper",
    ]);
  });

  it("uses init most and keyfall least, which is what the counts say", () => {
    // The real distribution, kept as a claim: `init` 89, `connect` 17, `turn` 17, `land` 17,
    // `row_up`/`row_down` 11, `keyfall` 4, `keyturn` 3, `keyleft`/`keyright` 2,
    // `changeside` 1. If these move, either a level changed or the pattern stopped matching —
    // and both are worth being told about.
    const counts = new Map<string, number>();
    for (const { suffix } of eventDefinitions()) {
      counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
    }
    expect(counts.get("init")).toBe(89);
    expect(counts.get("changeside")).toBe(1);
    expect(counts.get("keyfall")).toBe(4);
  });
});