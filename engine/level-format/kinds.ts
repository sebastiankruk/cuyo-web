/**
 * Kind declarations: the numbered blob kinds a level creates, in the order and
 * with the constants the level format gives them.
 *
 * The numbering is the fiddly part, and it is *not* the order the kinds are built
 * in. `knoten.cpp:speicherPicsConst` assigns numbers as the file is parsed, so
 * they follow the order `pics`, `greypic` and `startpic` *appear*; `ladSorten`
 * then builds the kind objects in the fixed order pics, startpic, greypic, each
 * starting at the offset its list was given. `baender.ld` makes the distinction
 * visible:
 *
 * ```text
 *   greypic = Grau
 *   emptypic = Hinter
 *   pics[1] = Band * 5
 *   pics[2] = Band * 4
 * ```
 *
 * `Grau` is 0, because `greypic` comes first in the file. `Band` is 1 in *both*
 * the `[1]` and the `[2]` version, because first use wins - and `speicherPicsConst`
 * checks `enthaelt(name, version)`, the exact version, not the name.
 *
 * A repeated name does not stop the counter from advancing past its slot, so a
 * name that appears in two lists gets the number of its *first* appearance and the
 * second list's slot is simply unused. That is the man page's worked example, and
 * its numbers are not the ones a naive counting gives:
 *
 * ```text
 *   startpic = apple, orange
 *   pics = orange, pear, apple * 3, banana
 *   greypic = pineapple
 * ```
 *
 * gives apple 0, orange 1, pear 3, banana 7, pineapple 8 - so pear is *two* more
 * than orange, not one, because `orange` claimed slot 2 of the `pics` list on its
 * way past. `cual.6` says 2 and this reproduces it.
 *
 * The empty kind is not in the numbering at all. `emptypic` names the artwork for
 * the empty blob and defines a constant with the value `blopart_keins`, which is
 * -1; `cual.6` says the empty kind's constant's relation to the others "is not
 * specified at all", and it is not a slot in the kind array.
 */

import { LdParseError } from "./parser.ts";
import type { LdPos } from "./parser.ts";
import type { Kind, KindRole } from "./level-data.ts";
import { defaultBehaviour } from "./level-data.ts";
import {
  NUMBERED_KIND_LISTS,
  KIND_LISTS,
  isKindList,
  stripPicExtension,
} from "./scope.ts";
import type { DefinitionScope, KindList } from "./scope.ts";
import { Version, VersionSet } from "./version.ts";
import { implicitLength } from "./values.ts";
import type { ResolvedRun } from "./values.ts";
import { iconCountOf } from "./picture-icons.ts";

/**
 * The level-wide values a kind's defaults depend on.
 *
 * `Sorte::Sorte` seeds every kind from these before reading the kind's own
 * section, which is what makes a kind's `numexplode` an override rather than a
 * replacement: `getZahlEintragMitDefault("numexplode", version, mPlatzAnzahl)`
 * takes the seeded value as its default, so "inherit" and "override" are the same
 * operation. Task 2.6 produces the real object; the shape is declared here
 * because 2.5 needs it, and guessing at 2.6's shape from the wrong side would be
 * worse than declaring the three fields that are actually read.
 */
export interface KindDefaults {
  /** The level-wide `neighbours`, as the number the level format uses. */
  readonly neighbours: number;
  /** `chaingrass`: goal blobs need a chain reaction to be destroyed. */
  readonly chainGrass: boolean;
  /**
   * The level-wide `numexplode`, or {@link UNDEFINED_EXPLODE} when the level sets
   * none. `PlatzAnzahl_undefiniert` upstream.
   *
   * "Absent" has to be distinguishable from any real number, because a kind that
   * explodes on size with neither its own nor a level-wide value is an error
   * naming the kind.
   */
  readonly numExplode: number;
}

/**
 * `PlatzAnzahl_undefiniert`, which upstream writes as -1.
 *
 * Transcribed as -1 rather than 0 so that it cannot be confused with a real
 * threshold, and so that a level writing `numexplode = 0` is still caught by the
 * check rather than being taken for "unset".
 */
export const UNDEFINED_EXPLODE = -1;

/**
 * The `distkey` a kind gets when it does not name one: "A".
 *
 * `Sorte::Sorte` sets `mDistKey = 10` for a grass kind, and `liesDistKey("A")` is
 * also 10, because the key is read as base 62 with 0-9, then A-Z as 10-35, then
 * a-z as 36-61. The man page's "the default is A" and the constructor's 10 are
 * the same fact, which is only visible once the encoding is read.
 */
export const DEFAULT_DIST_KEY = "A";

/**
 * `src/leveldaten.h`: the sentinel keys, negative so that no base-62 number can
 * collide with them.
 *
 * `liesDistKey` maps the six characters `.` `+` `-` `*` `%` `&` onto the first six
 * of these. The order in that header is descending by value and it does not match
 * the order the characters are written in, which is worth knowing when reading
 * `liesDistKey`'s switch.
 *
 * These were first introduced here for the empty key only, with the value -2 and
 * with the reasoning that the rest belonged to `startdist`. Both were wrong: the
 * value is -1, and a `startdist` cell that is not a named kind needs all six.
 */
export const DIST_KEY_LEER = -1;
export const DIST_KEY_GRAS = -2;
export const DIST_KEY_GRAU = -3;
export const DIST_KEY_FARBE = -4;
export const DIST_KEY_NEIGHBOURS = -5;
export const DIST_KEY_CHAINREACTION = -6;
export const DIST_KEY_UNDEF = -7;

/** The empty key, for the name this project uses elsewhere. */
export const DIST_KEY_EMPTY = DIST_KEY_LEER;

/** The kinds a level declares, plus what was needed to number them. */
export interface KindTable {
  /** Every numbered kind, indexed by its constant. */
  readonly kinds: readonly Kind[];
  /** `mAnzFarben`: how many numbered kinds there are. */
  readonly count: number;
  /**
   * The empty kind's constant, `blopart_keins`.
   *
   * Always -1, and not a slot in {@link kinds} - see the note at the top.
   */
  readonly emptyKind: number;
  /** The empty kind's art key, from `emptypic`; "" when the level names none. */
  readonly emptyArtKey: string;
  /** Kind constant by declared name, as `nothing` and the kind names resolve. */
  readonly constants: ReadonlyMap<string, number>;
  /** `getSortenAnfang`: the first constant of each declaration list. */
  readonly firstConstant: ReadonlyMap<KindList, number>;
  /**
   * The per-kind neighbour modes, for `KindNeighbourOverride`.
   *
   * Collected here rather than read on demand because a kind's own `neighbours`
   * is only meaningful against the level-wide value, which this module is
   * already handed. Task 2.7 resolves the ten mode names; this is the raw data.
   */
  readonly neighbourOverrides: readonly { readonly kind: number; readonly mode: number }[];
}

/** One declaration as written: which list, which version, which words. */
interface Declaration {
  readonly key: KindList;
  readonly version: Version;
  readonly runs: readonly ResolvedRun[];
  readonly pos: LdPos;
}

/**
 * Builds the level's kinds.
 *
 * @param level the level section, which is where the four declarations live
 * @param defaults the level-wide values, for the defaults a kind does not set
 */
export function buildKinds(level: DefinitionScope, defaults: KindDefaults): KindTable {
  const declarations = collectDeclarations(level);
  const constants = new VersionSet<number>();
  const firstConstant = new Map<KindList, number>();

  /**
   * `getSortenAnzahl`: the sum of the resolved list lengths of the lists seen so
   * far, read at the active version.
   *
   * Reading at the active version is why a list declared only as `[1]` and `[2]`
   * contributes a different number of slots depending on who is playing:
   * `baender.ld` has five bands in one-player and four in two-player.
   */
  const slotsSoFar = (): number => {
    let total = 0;
    for (const key of firstConstant.keys()) {
      const list = level.ownRuns(key);
      if (list !== undefined) total += implicitLength(list.runs);
    }
    return total;
  };

  for (const declared of declarations) {
    // Upstream computes the offset *before* recording the key, so a list being
    // processed for the first time does not count itself.
    if (!firstConstant.has(declared.key)) {
      firstConstant.set(declared.key, slotsSoFar());
    }
    const start = firstConstant.get(declared.key) as number;

    // `speicherPicsConst`: walk the list's own entries, claiming a number for
    // each name it has not seen at this version, and advancing the counter by
    // every entry's multiplicity whether or not the name was already claimed.
    let next = start;
    for (const run of declared.runs) {
      const name = stripPicExtension(run.word);
      if (!constants.hasEntry(name, declared.version)) {
        constants.add(name, declared.version, next);
      }
      next += run.count;
    }
  }

  const emptyArtKey = readEmptyArtKey(level);
  const total = slotsSoFar();
  // Indexed by constant, because that is how upstream holds them: `ladSorten`
  // writes each list at the offset its declaration was given, so the array is in
  // file order even though the kinds are built list by list.
  const byNumber: (Kind | undefined)[] = new Array<Kind | undefined>(total);
  const neighbourOverrides: { kind: number; mode: number }[] = [];

  for (const key of NUMBERED_KIND_LISTS) {
    const start = firstConstant.get(key);
    if (start === undefined) continue;
    // `ladSorten` reads the list for the *active* version, not the one it was
    // written at, so a `[2]` list is what a two-player game builds.
    const list = level.ownRuns(key);
    if (list === undefined) continue;
    let at = start;
    for (const run of list.runs) {
      for (let i = 0; i < run.count; i++) {
        const kind = makeKind(at, key, run.word, level, defaults);
        const mode = ownNumber(level, kind.name, "neighbours");
        if (mode !== undefined) neighbourOverrides.push({ kind: at, mode });
        byNumber[at] = kind;
        at++;
      }
    }
  }

  // A list that no longer occupies its slots - a `[1]` list read under a `[2]`
  // version cannot happen, but a shorter `[2]` list read under `[2]` leaves the
  // tail of a longer `[1]` allocation unclaimed. Upstream leaves those array
  // entries null, and `mAnzFarben` is the length, so the count is what matters.
  const kinds: Kind[] = [];
  for (const kind of byNumber) if (kind !== undefined) kinds.push(kind);

  return {
    kinds,
    count: total,
    emptyKind: -1,
    emptyArtKey,
    constants: constantTable(constants, level.version),
    firstConstant,
    neighbourOverrides,
  };
}

/**
 * `liesDistKey`: what a `startdist` cell key or a `distkey` declaration means.
 *
 * Returns undefined for what upstream refuses. The six single characters map to
 * the sentinels above and are matched on the *first* character only, which is
 * what makes a multi-character key starting with one of them mean that key - the
 * man page's multichar extension.
 *
 * Anything else is read as base 62 over `0-9A-Za-z`, with a leading space allowed
 * once so that a multi-character key can be padded, and an all-space key refused
 * because it would be version 0 of nothing in particular.
 */
export function decodeDistKey(key: string): number | undefined {
  if (key === "") return undefined;
  switch (key[0]) {
    case ".":
      return DIST_KEY_LEER;
    case "+":
      return DIST_KEY_FARBE;
    case "-":
      return DIST_KEY_GRAU;
    case "*":
      return DIST_KEY_GRAS;
    case "%":
      return DIST_KEY_NEIGHBOURS;
    case "&":
      return DIST_KEY_CHAINREACTION;
    default:
      break;
  }
  let n = 0;
  let atStart = true;
  for (const c of key) {
    let stillAtStart = false;
    n *= 62;
    if (c >= "0" && c <= "9") n += c.charCodeAt(0) - 0x30;
    else if (c >= "A" && c <= "Z") n += c.charCodeAt(0) - 0x37;
    else if (c >= "a" && c <= "z") n += c.charCodeAt(0) - 0x3d;
    else if (atStart && c === " ") stillAtStart = true;
    else return undefined;
    atStart = stillAtStart;
  }
  // Upstream's `anfang` flag: still true means every character was a space.
  return atStart ? undefined : n;
}

/* ------------------------------------------------------------------ */

/** The three numbered declarations, in file order. */
function collectDeclarations(level: DefinitionScope): readonly Declaration[] {
  const out: Declaration[] = [];
  for (const header of level.definitionsInOrder()) {
    if (!isKindList(header.name) || header.name === "emptypic") continue;
    const list = level.ownRunsAt(header.name, header.version);
    if (list === undefined) continue;
    out.push({ key: header.name, version: header.version, runs: list.runs, pos: header.pos });
  }
  return out;
}

function readEmptyArtKey(level: DefinitionScope): string {
  // The empty list of a `emptypic` fallback, as upstream reads it: `""` means no
  // empty picture, and `Sorte` then sets everything on defaults.
  const list = level.ownRuns("emptypic", true);
  const first = list?.runs[0];
  if (first === undefined) return "";
  if (first.word === "nothing") return "";
  return first.word;
}

/** A setting inside a kind's own section, or undefined when it is not set. */
function ownNumber(
  level: DefinitionScope,
  kindName: string,
  setting: string,
): number | undefined {
  const own = level.childSection(kindName);
  if (own === undefined) return undefined;
  return own.hasOwn(setting) ? own.ownNumber(setting, 0) : undefined;
}

/** One numbered kind, with its defaults and whatever its own section overrides. */
function makeKind(
  id: number,
  key: KindList,
  picture: string,
  level: DefinitionScope,
  defaults: KindDefaults,
): Kind {
  const role: KindRole = KIND_LISTS[key];
  const name = stripPicExtension(picture);
  const own = level.childSection(name);

  // `Sorte::Sorte` with a name that is only a number cannot happen in a real
  // level, because `pics` entries are words; `resolveRuns` renders a bare number
  // as its digits so the failure is here rather than in a type cast.
  if (!/^[A-Za-z_]/.test(name)) {
    throw new LdParseError(
      `in section ${level.name}: ${key} entry '${picture}' is not a kind name`,
      level.positionOf(key).line,
      level.positionOf(key).col,
      level.filename,
    );
  }

  const colourProb = readProbability(own, "colourprob", role === "colour");
  const greyProb = readProbability(own, "greyprob", role === "grey");
  const goalProb = readProbability(own, "goalprob", role === "grass");
  const versions = own?.hasOwn("versions") === true ? (own?.ownNumber("versions", 1) ?? 1) : 1;
  if (versions < 1) {
    throw new LdParseError(
      `${name} has versions=${versions}, which must be at least 1`,
      own?.positionOf("versions").line ?? 1,
      own?.positionOf("versions").col ?? 1,
      level.filename,
    );
  }

  const numExplode = own?.hasOwn("numexplode") === true
    ? (own?.ownNumber("numexplode", defaults.numExplode) ?? defaults.numExplode)
    : defaults.numExplode;

  // `Sorte::Sorte`'s "Kein Abschnitt in der Config": a kind with no section of
  // its own is its own picture, extension and all. Read with a default, because
  // `getListenEintrag("pics", version, true)` returns null for a kind that has
  // no picture list - and because `getKind` does not look at the parent, a bare
  // read here would be asking the *level's* `pics` for the wrong thing and then
  // finding nothing.
  const ownPics = own?.ownRuns("pics", true);
  // `pics[1]`, `pics[2]` and so on are **version specifiers, not further entries of the same
  // list** — `pics[1]=dnBlack.xpm` in `darken.ld` is that level's `pics` for version `[1]`,
  // and at every resolved version the kind has the one picture. So the run list is the file
  // list and its length is upstream's `mBilddateien.size()`.
  const pictures: string[] =
    ownPics === undefined ? [] : ownPics.runs.map((run) => (run as ResolvedRun).word);
  const artKey = pictures.length > 0 ? (pictures[0] as string) : picture;

  // `src/sorte.cpp:98-131`, transcribed. Read here because this is the last place the picture
  // list exists in full.
  const defaultCode = defaultCodeFor(pictures, role);

  const distKeyDefault = role === "grass" ? DEFAULT_DIST_KEY : "";
  const distKeyWord = own?.ownWord("distkey", distKeyDefault) ?? distKeyDefault;
  const distKey = distKeyWord === "" ? null : distKeyWord;

  return {
    id,
    name,
    role,
    artKey,
    pictures,
    // Filled in by the loader, which is the only place with the art manifest to resolve the
    // counts through. `buildKinds` reads `scope`, and a `.ld` says how many icons a picture
    // holds only by pointing at a file this project does not ship. See `Kind.pictureCounts`.
    pictureCounts: [],
    versions,
    weight: 1,
    behaviour: defaultBehaviour(role, defaults.chainGrass),
    numexplode: numExplode,
    colourProb,
    greyProb,
    goalProb,
    distKey,
    defaultCode,
    // Filled in by the loader, which is the only place that has the parsed `<< >>` blocks.
    // See `Kind.drawCode`.
    drawCode: null,
  };
}

/**
 * Which default draw code a kind with this picture list runs.
 *
 * `src/sorte.cpp:104-130`, in the order upstream tests it: more than one file is `default3`,
 * otherwise a first file with more than one icon is `default2` — `default2g` for grass, which
 * is the only difference between them — and a single-icon file is `default1`. A kind with no
 * picture list gets `null`, because upstream's condition starts `mBilddateien.size() > 0` and
 * a kind with no pictures has no code to run and nothing to draw.
 *
 * **The icon count is the picture's, not the level's, and getting that wrong chose the wrong
 * default for three of the five corpus kinds that use one.** The first version of this function
 * took a run's `count` as the icon count, which looks plausible and is not what `* N` means:
 * `getVielfachheit` is *multiplicity*, and `ladSorten` uses it to create that many `Sorte`
 * objects sharing one picture — `for (int i = picsnamen->getVielfachheit(n)-1; i>0; i--)
 * mSorten.neueSorte(nr, mSorten[nr-1], false); // false = ist nur kopie`. The real icon count
 * is `anzBildchen()`, computed from the image, and it is transcribed per picture key in
 * `picture-icons.ts`.
 *
 * Measured over the corpus's constant-count `pics` entries: **914 of 936** disagree with their
 * image's real icon count. The two numbers are not related, which is why this was not caught by
 * reading the code alone. What it cost, over the five kinds that fall back to a default — and
 * **three of the five drew the wrong picture**, which is why the table rather than a count:
 *
 * | kind                     | picture           | icons | was      | is          |
 * | ------------------------ | ----------------- | ----: | -------- | ----------- |
 * | `Pfeile/ipGrau`          | `ipGrau.xpm`      |     1 | default1 | default1    |
 * | `Explosive/lbBlack`      | `lbBlack.xpm`     |     1 | default1 | default1    |
 * | `Embroidery/jsGruenGras` | `jsGruenGras.xpm` |     6 | default1 | **default2g** |
 * | `Ziehlen/gras`           | `mziAlle.xpm`     |    10 | default1 | **default2g** |
 * | `Darken/dnStart`         | `dnBlack.xpm`     |    16 | default1 | **default2g** |
 *
 * The three wrong ones are all grass, and that is what makes it visible rather than cosmetic:
 * `default1 = *` draws icon 0 and `default2g = {pos=version; *}` draws the version, so a goal
 * blob with six or ten or sixteen faces would have shown the same one every time.
 *
 * **`default3` is chosen by 318 corpus kinds and run by none of them**, and that is now a
 * measurement rather than an artefact. The earlier note claiming it was unreachable gave the
 * wrong reason — that no level writes a kind with one multi-icon picture file — which was
 * false, and it survived only because the rule computing the file count was itself wrong.
 * `default3` is every kind with more than one picture file, and all of those define their own
 * procedure, so the default is never consulted. The case that looks like a counterexample is
 * `darken.ld`'s `pics=dnBlack2.xpm  pics[1]=dnBlack.xpm`, where `pics[1]` is a **version
 * specifier** rather than a second entry and the kind has one picture at every version.
 */
export function defaultCodeFor(
  pictures: readonly string[],
  role: KindRole,
): string | null {
  if (pictures.length === 0) return null;
  if (pictures.length > 1) return "default3";
  const key = pictures[0] as string;
  const icons = iconCountOf(key);
  // A picture the table does not carry is a stale table, and upstream's answer for it was
  // computed from an image this project does not have. Guessing `default1` would be the one
  // silent failure available, and it is also the wrong picture; naming the key is the failure
  // somebody can act on.
  if (icons === null) {
    throw new Error(
      `Cual: picture '${key}' has no stated icon count. It is referenced by a level but ` +
        `missing from engine/level-format/picture-icons.ts - re-run ` +
        `\`node levels-src/transcribe-picture-icons.ts\` after \`make fetch-corpus\`, or add ` +
        `the figure by hand if the artwork is new.`,
    );
  }
  if (icons > 1) return role === "grass" ? "default2g" : "default2";
  return "default1";
}

/**
 * A `*prob` weight, whose default depends on the declaring list.
 *
 * `Sorte::Sorte` sets exactly one of the three to 1 for a colour, grey or grass
 * kind and all three to 0 otherwise, which is the man page's "the default is 1
 * for kinds declared with pics and 0 for all other kinds" per list.
 */
function readProbability(
  own: DefinitionScope | undefined,
  setting: string,
  isDefault: boolean,
): number {
  const fallback = isDefault ? 1 : 0;
  if (own === undefined) return fallback;
  return own.ownNumber(setting, fallback);
}

/** The constant table as {@link VersionSet} sees it, for the active version. */
function constantTable(
  set: VersionSet<number>,
  version: Version,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const name of set.names()) {
    const value = set.bestApproximating(name, version, true);
    if (value !== undefined) out.set(name, value);
  }
  return out;
}
