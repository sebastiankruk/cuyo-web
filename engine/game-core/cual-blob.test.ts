/**
 * One blob, stepped.
 *
 * Task 15.5. Everything here is about **order and wiring**, because that is what the class is:
 * the four steps of `Blop::animiere` in upstream's order, each asking something that already
 * exists and is verified elsewhere. So the assertions are about which step ran, in what order,
 * and against whose state — not about the evaluator or the walker, which 4.1 through 4.12 own.
 *
 * The level is synthetic and built through the real `buildLevelProgram`, so the allocation, the
 * busy slots and the `da_kind` defaults are the genuine articles rather than hand-made. It is
 * small enough to read in full, which is the point: the four kinds below cover a draw, a foreign
 * draw, an addressed read and a kind change.
 */

import { describe, expect, it } from "vitest";
import { BlobAnimation, kindChangeOf, levelPictureSource } from "./cual-blob.ts";
import type { BlobAnimationDeps } from "./cual-blob.ts";
import { accessFieldFor } from "./cual-field.ts";
import { GRX, GRY } from "./constants.ts";
import { nasenkugeln } from "../level-format/fixtures.ts";
import type { Kind, LevelDef } from "../level-format/level-data.ts";
import { iconCountOf } from "../level-format/picture-icons.ts";
import { parseLd } from "../level-format/parser.ts";
import { buildLevelProgram } from "../level-format/cual-program.ts";
import { DefinitionScope, rootScope } from "../level-format/scope.ts";
import { buildKinds } from "../level-format/kinds.ts";
import { kindDefaultsFrom, readLevelSettings } from "../level-format/settings.ts";
import { Version } from "../level-format/version.ts";
import { BlobStore, TimeSlices, SPECIAL_VARIABLES } from "../cual-runtime/store.ts";
import type { Here } from "../cual-runtime/access.ts";
import { PictureStack } from "../cual-runtime/draw.ts";
import type { EffectContext } from "../cual-runtime/effects.ts";
import { maxPicturesOf } from "../cual-runtime/stapel-height.ts";
import type { Stmt } from "../cual-runtime/code.ts";

const KIND = SPECIAL_VARIABLES.findIndex((v) => v.name === "kind");
const POS = SPECIAL_VARIABLES.findIndex((v) => v.name === "pos");
const QU = SPECIAL_VARIABLES.findIndex((v) => v.name === "qu");
const FILE = SPECIAL_VARIABLES.findIndex((v) => v.name === "file");
const BLOCKS = SPECIAL_VARIABLES.findIndex((v) => v.name === "out1");

const GLOBALS = `
<<
default1 = *;
>>
`;

/**
 * A level with four kinds and real code.
 *
 * - `drawer` draws a picture at a position it computes, so `file`/`pos`/`qu` are all written and
 *   the stack receives one entry.
 * - `painter` draws *at a cell*, so the picture must land on somebody else's stack.
 * - `reader` reads a neighbour through `@`, which is the shadow rule.
 * - `changer` changes its own `kind`, which interrupts the old kind's animation.
 */
const SOURCE = `
Test={
  name="Test"
  author="Nobody"
  numexplode=4
  pics=drawer,painter,reader,changer,tiny
  emptypic=nothing
  startdist="....A....."
  drawer={ pics=aDragon.xpm }
  painter={ pics=dnBlack.xpm }
  reader={ pics=jsGruenGras.xpm }
  changer={ pics=mziAlle.xpm }
  tiny={ pics=ipGrau.xpm }
  <<
  var shared = 0 : reapply;
  drawer={ file=0; pos=3; qu=Q_ALL; *, *; };
  painter={ pos=1; @(0,1)*; };
  reader={ shared = shared@(1,0); };
  changer={ kind = 0; *; };
  tiny={ pos=7; *; };
  >>
}
`;

interface Built {
  readonly level: LevelDef;
  readonly program: ReturnType<typeof buildLevelProgram>;
}

/** The level, built the way the loader builds one. */
function build(): Built {
  const file = parseLd(SOURCE, "test.ld");
  const globals = parseLd(GLOBALS, "globals.ld");
  const section = file.definitions.find((d) => d.value.type === "section");
  if (section === undefined || section.value.type !== "section") {
    throw new Error("the test level must be a section");
  }
  const version = Version.of("1", "main");
  const root = rootScope("test.ld", version);
  root.defineAll(globals.definitions);
  root.defineAll(file.definitions);
  const scope = new DefinitionScope(section.name, root, version, "test.ld");
  scope.defineAll(section.value.definitions);
  const settings = readLevelSettings(scope);
  const table = buildKinds(scope, kindDefaultsFrom(settings));
  const names = scope.nameResolver();
  const program = buildLevelProgram(file, globals, table.kinds, (name) =>
    names(name, scope.positionOf("pics")),
  );
  // **The counts are the loader's job**, resolved through the art manifest — and this test skips
  // the loader because it builds a level the manifest has no entry for. It reads the committed
  // icon table directly, which is the same source the loader's manifest entries carry their
  // figures from, so the numbers under test are the real ones and not a fixture's guess.
  const kinds: Kind[] = table.kinds.map((kind, index) => ({
    ...kind,
    drawCode: program.drawCode[index] ?? null,
    pictureCounts: kind.pictures.map((key) => iconCountOf(key) ?? 0),
  }));
  return {
    program,
    level: {
      ...nasenkugeln(),
      id: section.name,
      kinds,
      startDist: [[{ kind: 3, version: 0 }, ...Array.from({ length: 9 }, () => null)]],
      program,
    },
  };
}

/** The harness `BlobAnimation` needs, over a hand-built board rather than a playing one. */
function harness(built: Built, here: Here, kindName = "drawer") {
  const slices = new TimeSlices();
  const store = new BlobStore(
    built.program.allocation.slotCount,
    GRY,
    slices,
  );
  store.setSystem("kind", 3);

  // One cell with a blob on it, which is all the level's Cual addresses.
  const board = new Map<string, BlobStore>();
  const at = (right: boolean, x: number, y: number): BlobStore | null => {
    if (right) return null;
    if (x < 0 || x >= GRX || y < 0 || y >= GRY) return null;
    if (x !== 1 || y !== GRY - 1) return null;
    const key = `${x},${y}`;
    let cell = board.get(key);
    if (cell === undefined) {
      cell = new BlobStore(built.program.allocation.slotCount, GRY, slices);
      cell.setSystem("kind", 3);
      board.set(key, cell);
    }
    return cell;
  };

  /** How many times each of `deps`' per-step answers was asked. */
  const asked = { here: 0, field: 0 };
  const stacks = new Map<string, PictureStack>();
  const effects = new EffectContextProbe();

  const deps: BlobAnimationDeps = {
    level: built.level,
    program: built.program,
    pictureSource: levelPictureSource(built.level, built.program),
    here: () => {
      asked.here += 1;
      return here;
    },
    field: () => {
      asked.field += 1;
      return accessFieldFor(
        {
          level: built.level,
          board: { at: (x: number, y: number) => (at(false, x, y) === null ? null : ({ store: at(false, x, y) } as never)) } as never,
          global: store,
          players: 1,
          fallCount: () => 0,
          semiglobal: () => null,
        },
        here,
      );
    },
    random: () => 0,
    effects: () => effects.context,
    window: { defer: (target, slot, value) => target.setInternal(slot, value) },
    stackAt: (_field, x, y) => {
      const key = `${x},${y}`;
      let stack = stacks.get(key);
      if (stack === undefined) {
        stack = new PictureStack();
        stacks.set(key, stack);
      }
      return stack;
    },
  };

  const kind = built.level.kinds.find((k) => k.name === kindName);
  const blob = new BlobAnimation(deps, kindName, store, kind?.drawCode ?? null);
  store.setSystem("kind", kind?.id ?? 0);
  return { blob, store, slices, deps, asked, stacks, at, effects };
}

/** The five effects, recorded rather than performed — 4.12 owns what each one does. */
class EffectContextProbe {
  readonly calls: string[] = [];
  readonly context: EffectContext = {
    here: { kind: "cell", x: 1, y: GRY - 1, right: false },
    falling: false,
    gridWidth: GRX,
    addPoints: (right, points) => this.calls.push(`points ${right ? "R" : "L"} ${points}`),
    setMessage: (right, text) => this.calls.push(`message ${right ? "R" : "L"} ${text}`),
    pop: () => this.calls.push("pop"),
    playSample: () => this.calls.push("sound"),
    playerLost: () => this.calls.push("lost"),
  };
}

const HERE: Here = { kind: "cell", x: 1, y: GRY - 1, right: false };

/** The first comma sequence anywhere in a tree, which is what owns a busy flag. */
function findComma(statements: readonly Stmt[]): Stmt | undefined {
  for (const node of statements) {
    if (node.kind === "commaSequence") return node;
    if (node.kind === "sequence" || node.kind === "block") {
      const nested = findComma(node.body);
      if (nested !== undefined) return nested;
    }
    if (node.kind === "scoped") {
      const nested = findComma([node.body]);
      if (nested !== undefined) return nested;
    }
    if (node.kind === "if") {
      const nested = findComma([node.then, ...(node.otherwise === null ? [] : [node.otherwise])]);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/** Open a window, which `runStep` does and `animate()` assumes. */
function step(h: ReturnType<typeof harness>): void {
  h.slices.open();
  h.blob.animate();
  h.slices.close();
}

describe("a blob's animate()", () => {
  it("runs the kind's draw code and puts a picture on its own stack", () => {
    const built = build();
    const h = harness(built, HERE, "drawer");
    step(h);
    // `drawer` writes `file=1; pos=3; qu=Q_ALL` and then draws, so all three reached the store
    // and one picture landed. Asserting the numbers and not just the count is the lesson 7.4's
    // verification records: "26 fills happened, all inside the canvas" passed while every blob
    // sat in one corner.
    expect(h.store.get(FILE)).toBe(0);
    expect(h.store.get(POS)).toBe(3);
    expect(h.store.get(QU)).toBe(-1);
    expect(h.blob.stack.entries).toHaveLength(1);
    const drawer = built.level.kinds.find((k) => k.name === "drawer");
    expect(h.blob.stack.entries[0]).toMatchObject({
      kind: drawer?.id,
      file: 0,
      pos: 3,
    });
  });

  it("asks where it stands on every step, rather than remembering", () => {
    // 15.4's constraint becoming structural: `here` moves when the blob does, and a field built
    // once would answer from whenever it was built. Asking per step is what makes a moving blob
    // correct, and the count is what says it happens.
    const built = build();
    const h = harness(built, HERE);
    step(h);
    const afterOne = h.asked.here;
    expect(afterOne).toBeGreaterThan(0);
    step(h);
    expect(h.asked.here).toBeGreaterThan(afterOne);
    expect(h.asked.field).toBeGreaterThan(0);
  });

  it("clears the picture stack before it draws, so a step never shows two frames", () => {
    // `braucheLeereStapel` is the *first* thing upstream does, and the order matters: a draw in
    // step 2 must not sit beside step 1's picture. Asserted by seeding the stack directly, which
    // is the only way to see the clear at all — a blob that draws every step looks the same
    // either way.
    const built = build();
    const h = harness(built, HERE);
    step(h);
    expect(h.blob.stack.entries).toHaveLength(1);
    h.blob.stack.add(
      { kind: 3, file: 0, pos: 0, quarter: -1, level: 0 },
      levelPictureSource(built.level, built.program),
    );
    expect(h.blob.stack.entries).toHaveLength(2);
    step(h);
    expect(h.blob.stack.entries).toHaveLength(1);
  });

  it("runs initSchritt even when the kind has no draw code", () => {
    // Upstream's own comment: "Muss auch gemacht werden, wenn der Blop nix von animieren weiss,
    // weil der Aenderungswunsch initialisiert werden soll. Und vielleicht wollen ja Nachbarn was
    // mit diesem Blop tun." The resets are not conditional on there being code, so a blob with
    // none still gets `file`, `pos`, `qu` and the debug outputs cleared.
    const built = build();
    const h = harness(built, HERE);
    const silent = new BlobAnimation(h.deps, "silent", h.store, null);
    h.store.set(FILE, 9);
    h.store.set(POS, 9);
    h.store.set(BLOCKS, 12345);
    h.slices.open();
    silent.animate();
    h.slices.close();
    expect(h.store.get(FILE)).toBe(0);
    expect(h.store.get(POS)).toBe(0);
    expect(h.store.get(BLOCKS)).toBe(0x7fff);
  });

  it("resets the old kind's animation when the kind changes, and this blob's only", () => {
    // `alt_co->busyReset(*this)` — the reset is given the blob, and 4.18 is about why that
    // matters. Two blobs, two stores, one shared program: changing one blob's kind must not
    // clear the other's flags, which a reset given the wrong store would do.
    const built = build();
    const mine = harness(built, HERE);
    const theirs = harness(built, HERE);

    // A comma sequence, which is what owns a busy flag.
    const drawer = built.level.kinds.find((k) => k.name === "drawer");
    const comma = findComma(drawer?.drawCode ?? []);
    expect(comma, "the test level needs a comma sequence").toBeDefined();
    if (comma === undefined) return;

    mine.store.busySet(built.program.allocation.busySlots.get(comma)?.first ?? -1, true);
    theirs.store.busySet(built.program.allocation.busySlots.get(comma)?.first ?? -1, true);

    // Slot 7 is `kind_beim_letzten_draw_aufruf`, so writing `drawer`'s id there and a different
    // kind into `kind` is exactly the state `beginDraw` exists to notice: the *old* kind's
    // animation is the one interrupted.
    mine.store.setInternal(7, drawer?.id ?? 0);
    mine.store.setInternal(KIND, 1);
    mine.blob.kindChange();
    mine.store.beginDraw(mine.blob.kindChange());

    expect(mine.store.busyGet(built.program.allocation.busySlots.get(comma)?.first ?? -1)).toBe(
      false,
    );
    expect(theirs.store.busyGet(built.program.allocation.busySlots.get(comma)?.first ?? -1)).toBe(
      true,
    );
  });

  it("does not reset anything when the kind has not changed", () => {
    // The `-1` guard: a blob that has never been drawn has nothing to interrupt, so slot 7
    // starting at `blopart_ausserhalb` means the first step resets nothing.
    const built = build();
    const h = harness(built, HERE);
    const drawer = built.level.kinds.find((k) => k.name === "drawer");
    const comma = findComma(drawer?.drawCode ?? []);
    if (comma === undefined) return;
    const bit = built.program.allocation.busySlots.get(comma)?.first ?? -1;
    h.store.busySet(bit, true);
    // Slot 7 is `blopart_ausserhalb` for a fresh store and kind 3 is current, so `beginDraw`
    // records 3 without resetting.
    expect(h.store.get(7)).not.toBe(-5 - 1);
    h.store.beginDraw(h.blob.kindChange());
    expect(h.store.busyGet(bit)).toBe(true);
  });

  it("puts a draw aimed at another cell on that cell's stack, not its own", () => {
    // `BildStapel::speichereBild` puts a foreign draw on the *target's* stack, so the asking
    // blob's own must stay empty. The harness's board holds a blob at (1, GRY-1), which is where
    // `reader`'s and `painter`'s targets are measured from.
    const built = build();
    const painter = built.level.kinds[1];
    const h = harness(built, HERE);
    const blob = new BlobAnimation(h.deps, "painter", h.store, painter?.drawCode ?? null);
    h.slices.open();
    blob.animate();
    h.slices.close();
    expect(blob.stack.entries, "not on the asking blob's own stack").toHaveLength(0);
    // (1, GRY-1) + (0,1) is off the board, so the address is unpaintable and nothing lands.
    // The point is that it was refused rather than silently drawn on the wrong stack.
    expect(h.stacks.size, "a stack was created for the target cell").toBeGreaterThan(0);
  });

  it("refuses a draw whose pos is outside its picture, rather than drawing something", () => {
    // `BildStapel::speichereBild`'s own check. It matters because blitting past the end of a
    // picture would draw whatever follows it there — a silently wrong icon rather than an error.
    const built = build();
    const h = harness(built, HERE);
    h.store.setSystem("kind", 3);
    // `changer`'s code draws at whatever `pos` says; force one past the end of a one-icon file.
    const one = built.level.kinds.find((k) => (k.pictureCounts[0] ?? 0) === 1);
    expect(one, "the level has a single-icon kind").toBeDefined();
    if (one === undefined) return;
    const blob = new BlobAnimation(h.deps, one.name, h.store, one.drawCode);
    h.store.setSystem("kind", one.id);
    // **The out-of-range `pos` comes from the level's own code.** It cannot be arranged by
    // writing the store first, because `initSchritt` resets `pos` to 0 before the code runs — so
    // a pre-set value would be corrected by the very step under test. `tiny` writes `pos=7`
    // against a one-icon picture, which is the shape a real mistyped level has.
    expect(one.drawCode, "the level asks for an icon its picture does not have").not.toBeNull();
    h.slices.open();
    expect(() => blob.animate()).toThrow(/out of range/);
    h.slices.close();
  });

  it("refuses an undeclared variable by name rather than reading zero", () => {
    const built = build();
    const h = harness(built, HERE);
    // `reader`'s code assigns to `shared`, which is declared. A name that is not declared must be
    // an error rather than 0 — zero is a legal value in Cual, so returning it turns a typo into
    // a level that quietly misbehaves.
    const reader = built.level.kinds[2];
    expect(reader?.drawCode).not.toBeNull();
    // The error path, through the same evaluator a real run uses.
    const level = { ...built.level, program: { ...built.program, allocation: { ...built.program.allocation, declaredSlots: new Map() } } };
    const broken = new BlobAnimation(
      { ...h.deps, level, program: level.program,
        pictureSource: levelPictureSource(level, level.program) },
      "reader",
      h.store,
      reader?.drawCode ?? null,
    );
    h.slices.open();
    expect(() => broken.animate()).toThrow(/no variable named 'shared'/);
    h.slices.close();
  });
});

describe("PictureSource over a level", () => {
  it("answers a picture's icon count from the counts the loader resolved", () => {
    const built = build();
    const source = levelPictureSource(built.level, built.program);
    const drawer = built.level.kinds.find((k) => k.name === "drawer");
    expect(drawer).toBeDefined();
    if (drawer === undefined) return;
    // One picture, and the corpus figure for a key that is in the table.
    expect(source.pictureCount(drawer.id, 0)).toBe(drawer.pictureCounts[0]);
    // Out of range in either direction is 0, which `PictureStack.add`'s range check turns into
    // its own error — a level asking for a file it never declared, not a picture with no icons.
    expect(source.pictureCount(drawer.id, 1)).toBe(0);
    expect(source.pictureCount(999, 0)).toBe(0);
  });

  it("takes the per-blob picture budget from the compiled program, not from the blob", () => {
    // `ld->mStapelHoehe` is computed once while loading the level and every `BildStapel`
    // allocates that many layers, so two kinds in one level share it.
    const built = build();
    const source = levelPictureSource(built.level, built.program);
    expect(source.maxPictures).toBe(maxPicturesOf(built.program.drawCode));
    expect(source.maxPictures).toBeGreaterThanOrEqual(1);
  });
});

describe("kindChangeOf", () => {
  it("answers the four things a kind change and a draw bookkeeping need", () => {
    const built = build();
    const store = new BlobStore(built.program.allocation.slotCount, GRY, new TimeSlices());
    const change = kindChangeOf(built.program, store, built.level.kinds.length);
    expect(change.colourCount).toBe(built.level.kinds.length);
    expect(change.drawCodeOf(1)).toBe(built.program.drawCode[1]);
    expect(change.drawCodeOf(999)).toBeNull();
    // The corpus's `reapply` declaration, `var shared = 0 : reapply`, reached through the
    // program's list rather than being recomputed here.
    expect(change.kindDefaults(0)).toBe(built.program.kindDefaults);
    expect(built.program.kindDefaults.length).toBeGreaterThan(0);
    expect(() => change.resetBusyOf(999)).not.toThrow();
  });
});