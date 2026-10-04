/**
 * Tests for kind declarations (task 2.5).
 *
 * The numbering is the thing worth testing carefully, because it is the one rule
 * in the level format whose answer is not the obvious one: a name that appears
 * in two declaration lists takes the number of its first appearance, and the
 * second list's slot is simply unused. `cual.6`'s apple example pins that, and it
 * is a stronger assertion than "the kinds are in the right order".
 *
 * `upstream corpus` at the end is the other half: every real level's kind table
 * is built, which is the only way to know the transcription accepts the level
 * data rather than only the examples.
 */

import { describe, expect, it } from "vitest";
import { parseLd } from "./parser.ts";
import type { LdSection } from "./parser.ts";
import { DefinitionScope } from "./scope.ts";
import { DEFAULT_DIST_KEY, UNDEFINED_EXPLODE, buildKinds, decodeDistKey } from "./kinds.ts";
import type { KindDefaults } from "./kinds.ts";
import { NeighbourMode } from "../game-core/constants.ts";
import { Version } from "./version.ts";

/** The level-wide values, as a level that sets none would leave them. */
const DEFAULTS: KindDefaults = {
  neighbours: NeighbourMode.Rect,
  chainGrass: false,
  numExplode: 4,
};

/** The level-wide values of a level that sets `numexplode = 6`. */
const SIX: KindDefaults = { ...DEFAULTS, numExplode: 6 };

/** The level section's definitions, with the section's own definitions in place. */
function levelOf(body: string, version = Version.of("1", "main")): {
  level: DefinitionScope;
  root: DefinitionScope;
} {
  const file = parseLd(body, "test.ld");
  const first = file.definitions[0];
  if (first === undefined) throw new Error("no definitions parsed");
  if (first.value.type !== "section") throw new Error("the test level must be a section");
  const root = new DefinitionScope("", undefined, version, "test.ld");
  root.defineAll(file.definitions);
  const section: LdSection = first.value;
  const level = new DefinitionScope(first.name, root, version, "test.ld");
  level.defineAll(section.definitions);
  return { level, root };
}

function kindsOf(body: string, defaults: KindDefaults = DEFAULTS, version?: Version) {
  const { level } = levelOf(body, version ?? Version.of("1", "main"));
  return buildKinds(level, defaults);
}

/** The kind names in constant order. */
function namesOf(body: string, defaults?: KindDefaults): readonly string[] {
  return kindsOf(body, defaults).kinds.map((k) => k.name);
}

describe("the man page's apple example", () => {
  //   startpic = apple, orange
  //   pics = orange, pear, apple * 3, banana
  //   greypic = pineapple
  const body = `Level = {
    startpic = apple, orange
    pics = orange, pear, apple * 3, banana
    greypic = pineapple
  }`;

  it("numbers the kinds as the file does, not as the lists would suggest", () => {
    const { constants } = kindsOf(body);
    // startpic comes first in the file, so apple and orange take 0 and 1.
    expect(constants.get("apple")).toBe(0);
    expect(constants.get("orange")).toBe(1);
    // Then `pics` starts at 2. `orange` is already claimed - but the counter
    // still advances past its slot, so pear lands on 3, not 2.
    expect(constants.get("pear")).toBe(3);
    // `apple * 3` claims nothing new and still consumes three slots.
    expect(constants.get("banana")).toBe(7);
    // greypic starts after all six pics slots.
    expect(constants.get("pineapple")).toBe(8);
  });

  it("agrees with the man page's own statement about the differences", () => {
    // "orange is 1 more than apple, pear is 2 more than orange, banana is 4 more
    //  than pear and pineapple is 1 more than banana."
    const { constants } = kindsOf(body);
    const n = (name: string): number => constants.get(name) as number;
    expect(n("orange") - n("apple")).toBe(1);
    expect(n("pear") - n("orange")).toBe(2);
    expect(n("banana") - n("pear")).toBe(4);
    expect(n("pineapple") - n("banana")).toBe(1);
  });

  it("builds nine kinds, since a repeated name still occupies its slots", () => {
    const { kinds, count } = kindsOf(body);
    expect(count).toBe(9);
    expect(kinds).toHaveLength(9);
    // Every kind's id is its index, and the array is in constant order.
    expect(kinds.map((k) => k.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // startpic takes 0 and 1, so `pics` starts at 2 and its first entry is the
    // second `orange` - a kind in its own right, because upstream copies the
    // `Sorte` rather than leaving a hole, so startdist can address it separately.
    expect(kinds.map((k) => k.name)).toEqual([
      "apple",
      "orange",
      "orange",
      "pear",
      "apple",
      "apple",
      "apple",
      "banana",
      "pineapple",
    ]);
  });

  it("gives the kinds of a list the role that list declares", () => {
    const { kinds } = kindsOf(body);
    const role = (name: string) => kinds.find((k) => k.name === name)?.role;
    expect(role("pear")).toBe("colour");
    expect(role("banana")).toBe("colour");
    expect(role("apple")).toBe("grass");
    expect(role("orange")).toBe("grass");
    expect(role("pineapple")).toBe("grey");
  });

  it("gives each kind the default behaviour of its list", () => {
    const { kinds } = kindsOf(body);
    const kind = (name: string) => kinds.find((k) => k.name === name) as {
      behaviour: number;
      colourProb: number;
      greyProb: number;
      goalProb: number;
    };
    // A colour kind explodes on size and counts towards chain size.
    expect(kind("pear").behaviour & 1).toBe(1);
    expect(kind("pear").colourProb).toBe(1);
    expect(kind("pear").goalProb).toBe(0);
    // A grass kind needs a chain reaction unless the level says otherwise, and it
    // cannot be won by exploding, so it carries the goal bit.
    expect(kind("orange").behaviour & 4).toBe(4);
    expect(kind("orange").behaviour & 2).toBe(2);
    expect(kind("orange").goalProb).toBe(1);
    // A grey kind explodes on a chain reaction and on an explosion.
    expect(kind("pineapple").behaviour & 4).toBe(4);
    expect(kind("pineapple").behaviour & 2).toBe(2);
    expect(kind("pineapple").greyProb).toBe(1);
    expect(kind("pineapple").colourProb).toBe(0);
  });

  it("drops the explosion bit from a grass kind when the level needs a chain", () => {
    const { level } = levelOf(
      `Level = {
        chaingrass = 1
        startpic = apple
        pics = pear
        greypic = grey
      }`,
    );
    const { kinds } = buildKinds(level, { ...DEFAULTS, chainGrass: true });
    const grass = kinds.find((k) => k.role === "grass") as { behaviour: number };
    expect(grass.behaviour & 4).toBe(4);
    expect(grass.behaviour & 2).toBe(0);
  });
});

describe("the declaration lists", () => {
  it("numbers in the order the lists appear in the file", () => {
    // Not the order `ladSorten` builds them in: pics kinds are built first
    // regardless, but here startpic is written first, so it gets 0 and 1.
    const { kinds, firstConstant } = kindsOf(
      `Level = {
        startpic = grass
        pics = colour
        greypic = grey
      }`,
    );
    expect(firstConstant.get("startpic")).toBe(0);
    expect(firstConstant.get("pics")).toBe(1);
    expect(firstConstant.get("greypic")).toBe(2);
    // The array is in constant order, so the grass comes first here.
    expect(kinds.map((k) => k.name)).toEqual(["grass", "colour", "grey"]);
  });

  it("counts the repeat multiplier as slots", () => {
    const { kinds, count } = kindsOf(
      `Level = {
        pics = apfel * 3, birne
        greypic = grey
      }`,
    );
    expect(count).toBe(5);
    expect(
      namesOf(`Level = {
        pics = apfel * 3, birne
        greypic = grau
      }`),
    ).toEqual(["apfel", "apfel", "apfel", "birne", "grau"]);
    expect(kinds.map((k) => k.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("reads a repeat count from an expression", () => {
    const { count } = kindsOf(
      `Level = {
        anzahl = 3
        pics = apfel * <anzahl>, birne
        greypic = grau
      }`,
    );
    expect(count).toBe(5);
  });

  it("gives a grass kind the default distkey A and the others none", () => {
    // "The default is A for kinds declared with startpic and undefined for all
    //  other kinds."
    const { kinds } = kindsOf(
      `Level = {
        startpic = grass
        pics = colour
      }`,
    );
    expect(kinds.find((k) => k.role === "grass")?.distKey).toBe(DEFAULT_DIST_KEY);
    expect(kinds.find((k) => k.role === "colour")?.distKey).toBeNull();
  });

  it("reads A as the base-62 number 10, as the constructor hard-codes", () => {
    // The man page's "A" and `Sorte::Sorte`'s `mDistKey = 10` are the same value.
    expect(decodeDistKey(DEFAULT_DIST_KEY)).toBe(10);
  });

  it("keeps a kind's own distkey", () => {
    const { kinds } = kindsOf(
      `Level = {
        startpic = grass
        pics = colour
        grass = {
          distkey = "AB"
        }
      }`,
    );
    expect(kinds.find((k) => k.role === "grass")?.distKey).toBe("AB");
    expect(kinds.find((k) => k.role === "colour")?.distKey).toBeNull();
  });

  it("uses the kind's name as its picture when it has no section", () => {
    const { kinds } = kindsOf(`Level = { pics = inGruen.xpm, birne }`);
    // "Kein Abschnitt in der Config für dieses Icon. Also direkt den Namen als
    //  Bilddateinamen verwenden. (Und zwar den Namen _mit_ Endung.)"
    expect(kinds[0]?.artKey).toBe("inGruen.xpm");
    expect(kinds[0]?.name).toBe("inGruen");
    // Without an extension there is nothing to add.
    expect(kinds[1]?.artKey).toBe("birne");
  });

  it("uses the kind's own pics list for its picture when it has a section", () => {
    // `ipGrau.xpm` rather than an invented name: a picture a kind declares has to carry a
    // stated icon count, because that count is what picks the kind's default draw code. The
    // block at the end of this file is where that refusal is pinned.
    const { kinds } = kindsOf(
      `Level = {
        pics = plain, other
        other = {
          pics = ipGrau.xpm
        }
      }`,
    );
    expect(kinds.find((k) => k.name === "plain")?.artKey).toBe("plain");
    expect(kinds.find((k) => k.name === "other")?.artKey).toBe("ipGrau.xpm");
    // And the whole list, not just its first entry: `pics[1]`, `pics[2]` are further entries of
    // the same list rather than versions of it, so the run list *is* the file list and its
    // length is upstream's `mBilddateien.size()`.
    expect(kinds.find((k) => k.name === "other")?.pictures).toEqual(["ipGrau.xpm"]);
    expect(kinds.find((k) => k.name === "plain")?.pictures).toEqual([]);
  });

  it("strips the extension from the kind's name but not from its art key", () => {
    // `picsEndungWeg` is applied to the name and to the constant, and *not* to
    // the picture the kind draws, which is why the two differ.
    const { kinds, constants } = kindsOf(
      `Level = {
        pics = inGruen.xpm, another.xpm
        another.xpm = { }
      }`,
    );
    expect(kinds[0]?.name).toBe("inGruen");
    expect(constants.get("inGruen")).toBe(0);
    expect(kinds[0]?.artKey).toBe("inGruen.xpm");
  });

  it("gives the empty kind no slot and the art key emptypic names", () => {
    const { kinds, emptyKind, emptyArtKey } = kindsOf(
      `Level = {
        emptypic = Hinter
        pics = colour
      }`,
    );
    // "This constant also exists for the empty kind, if one has been declared
    //  using emptypic. In this case the value's relation to the other values is
    //  not specified at all." - it is blopart_keins, which is -1.
    expect(emptyKind).toBe(-1);
    expect(emptyArtKey).toBe("Hinter");
    expect(kinds).toHaveLength(1);
  });

  it("reads no emptypic as no art", () => {
    const { emptyArtKey, emptyKind } = kindsOf(`Level = { pics = colour }`);
    expect(emptyArtKey).toBe("");
    expect(emptyKind).toBe(-1);
  });
});

describe("per-kind overrides", () => {
  it("lets a kind override the level-wide explode threshold", () => {
    const { level } = levelOf(
      `Level = {
        numexplode = 6
        pics = plain, greedy
        greedy = {
          numexplode = 3
        }
      }`,
    );
    const { kinds } = buildKinds(level, SIX);
    expect(kinds.find((k) => k.name === "plain")?.numexplode).toBe(6);
    expect(kinds.find((k) => k.name === "greedy")?.numexplode).toBe(3);
  });

  it("inherits the level-wide threshold when the kind says nothing", () => {
    const { level } = levelOf(
      `Level = {
        numexplode = 6
        pics = plain, greedy
        greedy = {
          weight = 2
        }
      }`,
    );
    const { kinds } = buildKinds(level, SIX);
    expect(kinds.find((k) => k.name === "greedy")?.numexplode).toBe(6);
  });

  it("collects a per-kind neighbour mode without applying it", () => {
    // Task 2.7 turns the number into one of the ten modes; here it is only
    // gathered, because a level-wide value has to be known before the two can
    // be compared.
    const { level } = levelOf(
      `Level = {
        neighbours = 0
        pics = plain, hexed
        hexed = {
          neighbours = 2
        }
      }`,
    );
    const table = buildKinds(level, DEFAULTS);
    expect(table.neighbourOverrides).toEqual([{ kind: 1, mode: 2 }]);
  });

  it("lets a kind override the probabilities its list would default", () => {
    const { level } = levelOf(
      `Level = {
        pics = common, rare
        common = {
          colourprob = 3
        }
        rare = {
          colourprob = 1
        }
      }`,
    );
    const { kinds } = buildKinds(level, DEFAULTS);
    expect(kinds.find((k) => k.name === "common")?.colourProb).toBe(3);
    expect(kinds.find((k) => k.name === "rare")?.colourProb).toBe(1);
  });

  it("reads a kind's number of appearances", () => {
    const { level } = levelOf(
      `Level = {
        pics = plain
        plain = {
          versions = 3
        }
      }`,
    );
    expect(buildKinds(level, DEFAULTS).kinds[0]?.versions).toBe(3);
    // The default is 1.
    expect(kindsOf(`Level = { pics = plain }`).kinds[0]?.versions).toBe(1);
  });
});

describe("first use of a name fixes its constant", () => {
  it("keeps the number from the first list that declares it", () => {
    const { constants } = kindsOf(
      `Level = {
        pics = apfel, birne
        greypic = birne, kirsche
      }`,
    );
    expect(constants.get("apfel")).toBe(0);
    expect(constants.get("birne")).toBe(1);
    // `birne` is declared again by greypic but keeps 1, and `kirsche` starts after the
    // greypic list's own two slots, one of which `b` already used.
    expect(constants.get("kirsche")).toBe(3);
  });

  it("does not advance a name's number when a later list repeats it", () => {
    const { kinds } = kindsOf(
      `Level = {
        pics = apfel
        greypic = apfel, birne
      }`,
    );
    // kinds[1] is the second `apfel` of the greypic list and kinds[2] is
    // `birne`, so the array is hole-free and `birne` really is constant 2.
    expect(kinds.map((k) => k.name)).toEqual(["apfel", "apfel", "birne"]);
    expect(kinds[2]?.id).toBe(2);
  });
});

describe("versioned declarations", () => {
  it("builds a different list of kinds per player count", () => {
    // `baender.ld`, which is the case that makes version resolution and kind
    // numbering meet.
    const body = `Level = {
      greypic = Grau
      emptypic = Hinter
      pics[1] = Band * 5
      pics[2] = Band * 4
    }`;
    const one = kindsOf(body, DEFAULTS, Version.of("1", "main"));
    const two = kindsOf(body, DEFAULTS, Version.of("2", "main"));

    // `greypic` is written first, so Grau is 0 in both.
    expect(one.constants.get("Grau")).toBe(0);
    expect(two.constants.get("Grau")).toBe(0);
    // Band is 1 in both, because the first declaration claimed it and the second
    // is at a version of its own.
    expect(one.constants.get("Band")).toBe(1);
    expect(two.constants.get("Band")).toBe(1);
    // But the lists differ, so the number of bands does.
    expect(one.count).toBe(6);
    expect(two.count).toBe(5);
    expect(one.kinds.filter((k) => k.name === "Band")).toHaveLength(5);
    expect(two.kinds.filter((k) => k.name === "Band")).toHaveLength(4);
  });

  it("reports an ambiguous pair of declarations", () => {
    // A `[2]` and a `[hard]` with no `[2,hard]` - the man page's own example.
    const { level } = levelOf(
      `Level = {
        pics[2] = apfel
        pics[hard] = birne
      }`,
      Version.of("2", "main", "hard"),
    );
    expect(() => buildKinds(level, DEFAULTS)).toThrow(
      /pics\[2,hard\] not uniquely defined/,
    );
  });
});

describe("levels with no kinds at all", () => {
  it("builds nothing rather than failing", () => {
    const { kinds, count } = kindsOf(`Level = { name = "Empty" }`);
    expect(kinds).toEqual([]);
    expect(count).toBe(0);
  });

  it("leaves numexplode undefined when the level does not set one", () => {
    // The kind builder inherits the value verbatim, including "unset": it is the
    // level loader that turns "unset" into an error for a kind that explodes on
    // size, in task 2.12.
    const { level } = levelOf(`Level = { pics = apfel }`);
    const { kinds } = buildKinds(level, {
      neighbours: NeighbourMode.Rect,
      chainGrass: false,
      numExplode: UNDEFINED_EXPLODE,
    });
    expect(kinds[0]?.numexplode).toBe(UNDEFINED_EXPLODE);
    expect(UNDEFINED_EXPLODE).toBe(-1);
  });
});

describe("`pics = name * N` is a kind repetition, not an icon count", () => {
  // The mistake `defaultCodeFor` made until 15.5's investigation, pinned here so it cannot
  // come back. `getVielfachheit` is *multiplicity*: `ladSorten` creates N `Sorte` objects that
  // share one picture (`mSorten.neueSorte(nr, mSorten[nr-1], false); // false = ist nur kopie`),
  // so a repeated entry says how many kinds there are and nothing about how many icons the
  // picture holds. The icon count is `anzBildchen()`, from the image.
  //
  // Measured over the corpus's constant-count `pics` entries, **914 of 936** disagree with
  // their image's real icon count — so the two numbers are not related, which is why reading
  // one as the other passed every test in this file and still picked the wrong default for
  // three of the five corpus kinds that fall back to one.
  it("makes N kinds sharing one picture file", () => {
    // `ipGrau.xpm` is a real key in the committed icon table with one icon, so the expected
    // default is `default1` and would be `default2` if the `* 3` were read as an icon count.
    const { kinds } = kindsOf(`Level = {
      pics = bolzer * 3
      bolzer = { pics = ipGrau.xpm }
    }`);
    const repeated = kinds.filter((kind) => kind.name === "bolzer");
    expect(repeated).toHaveLength(3);
    for (const kind of repeated) {
      expect(kind.pictures).toEqual(["ipGrau.xpm"]);
      expect(kind.defaultCode).toBe("default1");
    }
  });

  it("and the same picture repeated with no section of its own has no picture at all", () => {
    // `Sorte::Sorte` reads *its own* section's `pics`; `getKind` does not look at the parent.
    // So a kind the level only names in `pics` has no picture file, no icon count to consult
    // and nothing to draw — which is upstream's condition `mBilddateien.size() > 0`.
    const { kinds } = kindsOf(`Level = { pics = bolzer * 2 }`);
    for (const kind of kinds) {
      expect(kind.pictures).toEqual([]);
      expect(kind.defaultCode).toBeNull();
    }
  });

  it("and a kind with two picture files is default3 whatever the first holds", () => {
    // The file count is tested first upstream (`sorte.cpp:113`), so a multi-icon first file
    // does not rescue it. `aDragon.xpm` has 8 icons and `dnBlack.xpm` has 16.
    const { kinds } = kindsOf(`Level = {
      pics = apfel, birne
      apfel = { pics = aDragon.xpm, dnBlack.xpm }
    }`);
    expect(kinds.find((kind) => kind.name === "apfel")?.pictures).toEqual([
      "aDragon.xpm",
      "dnBlack.xpm",
    ]);
    expect(kinds.find((kind) => kind.name === "apfel")?.defaultCode).toBe("default3");
  });

  it("and one picture file's icon count decides between default1 and default2", () => {
    // Both keys are real entries in the committed table: `ipGrau.xpm` has 1 icon,
    // `jsGruenGras.xpm` has 6.
    const single = kindsOf(`Level = { pics = apfel  apfel = { pics = ipGrau.xpm } }`);
    expect(single.kinds[0]?.defaultCode).toBe("default1");
    const many = kindsOf(`Level = { pics = apfel  apfel = { pics = jsGruenGras.xpm } }`);
    expect(many.kinds[0]?.defaultCode).toBe("default2");
  });

  it("and refuses a picture the icon table does not carry, naming the key", () => {
    // The failure this rule has to have. Upstream read the count from an image this project
    // does not ship, so a key with no stated figure is a stale table — and `default1` is both
    // the available guess and the wrong picture, since `default1 = *` draws icon 0 of whatever
    // the level was choosing between.
    expect(() => kindsOf(`Level = { pics = apfel  apfel = { pics = neverHeardOfIt.xpm } }`)).toThrow(
      /neverHeardOfIt\.xpm/,
    );
  });
});
