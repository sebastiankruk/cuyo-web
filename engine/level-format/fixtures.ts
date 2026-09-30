/**
 * Hand-written levels, so the engine and renderer are playable before the `.ld`
 * parser and Cual interpreter exist.
 *
 * Each fixture is a faithful transcription of the corresponding upstream level
 * for the single-player case, using the resolved `LevelDef` shape. When the
 * parser lands it produces the same structure from the `.ld` file, so nothing
 * here is throwaway: these double as the parser's expected-output fixtures.
 *
 * Values taken from upstream:
 *   nasenkugeln.ld  numexplode 4, single-player 6, chaingrass 0, toptime 50
 *   hormone.ld      numexplode 4, single-player 6, chaingrass 1,
 *                   neighbours diagonal, toptime 50
 */

import {
  DEFAULT_TOPTIME,
  NeighbourMode,
} from "../game-core/constants.ts";
import type { Kind, KindRole, LevelDef, StartRow } from "./level-data.ts";
import { defaultBehaviour } from "./level-data.ts";

let nextId = 0;

interface KindSpec {
  readonly name: string;
  readonly role: KindRole;
  readonly numexplode?: number;
  readonly weight?: number;
  readonly versions?: number;
}

function makeKinds(specs: readonly KindSpec[], chainGrass: boolean): Kind[] {
  nextId = 0;
  return specs.map((s) => {
    const role = s.role;
    return {
      id: nextId++,
      name: s.name,
      role,
      artKey: role === "empty" ? "" : s.name,
      versions: s.versions ?? 1,
      weight: s.weight ?? 1,
      behaviour: defaultBehaviour(role, chainGrass),
      numexplode: s.numexplode ?? 0,
      colourProb: role === "colour" ? 1 : 0,
      greyProb: role === "grey" ? 1 : 0,
      goalProb: role === "grass" ? 1 : 0,
      distKey: null,
    } satisfies Kind;
  });
}

/** Builds a bottom-aligned start layout from rows of kind ids. */
function layout(rows: readonly (readonly (number | null)[])[]): readonly StartRow[] {
  return rows.map((row) =>
    row.map((kind) => (kind === null ? null : { kind, version: 0 })),
  );
}

/** `nasenkugeln.ld`: five colours, one row of grass, 6 blobs to explode. */
export function nasenkugeln(): LevelDef {
  const kinds = makeKinds(
    [
      { name: "inGruen", role: "colour" },
      { name: "inGelb", role: "colour" },
      { name: "inSchwarz", role: "colour" },
      { name: "inRosaNasen", role: "colour" },
      { name: "inOrangeNasen", role: "colour" },
      { name: "inGras", role: "grass" },
      { name: "inGrau", role: "grey" },
    ],
    false,
  );
  const withExplode = kinds.map((k) =>
    k.role === "colour" ? { ...k, numexplode: 6 } : k,
  );

  return {
    id: "Nasenkugeln",
    name: "Noseballs",
    author: "Immi",
    description:
      "Put six balls together; then, they will explode. Try to make the grass explode, too.",
    kinds: withExplode,
    emptyKind: -1,
    neighbours: NeighbourMode.Rect,
    chainGrass: false,
    topTime: DEFAULT_TOPTIME,
    hetzrandStop: 0,
    randomGreys: -1,
    noGreyProb: 0,
    randomFallPos: false,
    mirror: false,
    colours: {
      background: "#ffffff",
      text: "#3c3c3c",
      top: "#c8c8c8",
    },
    // startdist = "**********": ten goal blobs, each of the single goal kind.
    startDist: layout([[5, 5, 5, 5, 5, 5, 5, 5, 5, 5]]),
  };
}

/** `hormone.ld`: four colours, diagonal connections, grass needs a chain. */
export function hormone(): LevelDef {
  const kinds = makeKinds(
    [
      { name: "ihRot", role: "colour" },
      { name: "ihGruen", role: "colour" },
      { name: "ihBlau", role: "colour" },
      { name: "ihLila", role: "colour" },
      { name: "ihBunt", role: "grass" },
      { name: "ihGrau", role: "grey" },
    ],
    true,
  );
  const withExplode = kinds.map((k) =>
    k.role === "colour" ? { ...k, numexplode: 6 } : k,
  );

  return {
    id: "Hormone",
    name: "Hormones",
    author: "Immi",
    description: 'When do the "hormones" connect?',
    kinds: withExplode,
    emptyKind: -1,
    neighbours: NeighbourMode.Diagonal,
    chainGrass: true,
    topTime: DEFAULT_TOPTIME,
    hetzrandStop: 0,
    randomGreys: -1,
    noGreyProb: 0,
    randomFallPos: false,
    mirror: false,
    colours: {
      background: "#000000",
      text: "#ffffff",
      top: "#444444",
    },
    // One row of goal blobs, as `startdist = "AAAAAAAAAA"` for one player.
    startDist: layout([[4, 4, 4, 4, 4, 4, 4, 4, 4, 4]]),
  };
}

export const FIXTURES: readonly { readonly make: () => LevelDef }[] = [
  { make: nasenkugeln },
  { make: hormone },
];
