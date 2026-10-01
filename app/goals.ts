/**
 * Explains what a level is asking of the player.
 *
 * The HUD showed a bare count - a `10` with a tooltip - and nothing about which
 * blobs to connect, how many, or how the board decides what "connected" means. On
 * `Hormones` that meant a level that is genuinely not obvious from the board alone:
 * it connects **diagonally**, and a player has no way to learn that except by
 * failing. Upstream states the connection mode on the board itself; here it has to
 * be said, and this is where it is said.
 *
 * Pure and canvas-free on purpose, per design.md decision 12: these are the words
 * the player reads, and wording wants a test. The colour swatch is passed in rather
 * than derived, so this file does not need the renderer.
 */

import { NeighbourMode } from "../engine/game-core/constants.ts";
import type { LevelDef } from "../engine/level-format/level-data.ts";

/** How a level decides that two blobs are joined. */
export interface ConnectionRule {
  /** Short label for the rule. */
  readonly label: string;
  /** A sentence describing it, for a player who has not seen it before. */
  readonly detail: string;
  /** True when diagonals count, which is the part worth spelling out. */
  readonly includesDiagonal: boolean;
}

/**
 * The connection rule for a neighbour mode.
 *
 * The diagonal case leads with a small diagram, because "diagonally" is the one that
 * defeats expectation: on an orthogonal board a player will try to build a row and
 * wonder why nothing happens.
 */
export function connectionRule(mode: NeighbourMode): ConnectionRule {
  switch (mode) {
    case NeighbourMode.Diagonal:
      return {
        label: "Diagonal",
        detail: "Blobs join only across corners, not sides.",
        includesDiagonal: true,
      };
    case NeighbourMode.Eight:
      return {
        label: "Sides and corners",
        detail: "Blobs join across sides and across corners.",
        includesDiagonal: true,
      };
    case NeighbourMode.Knight:
      return {
        label: "Knight",
        detail: "Blobs join in an L shape, as a chess knight moves.",
        includesDiagonal: false,
      };
    case NeighbourMode.Hex6:
      return {
        label: "Hexagonal",
        detail:
          "Blobs join to six neighbours; every other column is offset down.",
        includesDiagonal: true,
      };
    case NeighbourMode.Hex4:
      return {
        label: "Hexagonal, sides only",
        detail:
          "Blobs join to four neighbours; every other column is offset down.",
        includesDiagonal: false,
      };
    case NeighbourMode.Horizontal:
      return {
        label: "Horizontal only",
        detail: "Blobs join only left and right, never up and down.",
        includesDiagonal: false,
      };
    case NeighbourMode.Vertical:
      return {
        label: "Vertical only",
        detail: "Blobs join only up and down, never left and right.",
        includesDiagonal: false,
      };
    case NeighbourMode.None:
      return {
        label: "None",
        detail: "Nothing ever joins on its own.",
        includesDiagonal: false,
      };
    case NeighbourMode.ThreeD:
      return {
        label: "Three-dimensional",
        detail: "Not implemented yet.",
        includesDiagonal: false,
      };
    default:
      return {
        label: "Sides",
        detail: "Blobs join across shared sides, as you would expect.",
        includesDiagonal: false,
      };
  }
}

/** What the player is being asked to do, in a form the HUD can render. */
export interface GoalSummary {
  /** The kind that has to be cleared, when the level has one. */
  readonly targetName: string | null;
  /** Its art key, for looking up a swatch colour. */
  readonly targetArtKey: string | null;
  /** How many of them are left. */
  readonly targetRemaining: number;
  /** How many same-kind blobs must join before they detonate. */
  readonly numExplode: number;
  /** How the board connects. */
  readonly connection: ConnectionRule;
  /** True when clearing the target needs an explosion next to it, not its own six. */
  readonly targetNeedsChain: boolean;
  /** Grey blobs left, for the levels that have them. */
  readonly greys: number;
  /** The level's own description, if it wrote one. */
  readonly description: string | null;
}

/**
 * The kinds a piece can be made of, in the order the player should be told about.
 *
 * A level with several goal kinds needs all of them cleared, so the summary lists
 * each rather than picking one. Two, in practice, at most.
 */
function goalKinds(level: LevelDef): LevelDef["kinds"] {
  return level.kinds.filter((k) => k.role === "grass");
}

/** How many blobs must join to detonate, taken from the colour kinds. */
function explodeThreshold(level: LevelDef): number {
  let threshold = 0;
  for (const kind of level.kinds) {
    if (kind.role === "colour" && kind.numexplode > threshold) {
      threshold = kind.numexplode;
    }
  }
  return threshold;
}

/**
 * Builds the summary from the level and the live counters.
 *
 * `remaining` is a map from goal kind id to how many of it are left, rather than a
 * single number, so a level with two goal kinds can show both. The simulation
 * tracks one combined count, so the caller passes what it has and this returns the
 * first goal kind's figure; the split belongs where the board is walked anyway.
 */
export function goalSummary(
  level: LevelDef,
  counts: { readonly targetRemaining: number; readonly greys: number },
): GoalSummary {
  const goals = goalKinds(level);
  const first = goals[0];
  return {
    targetName: first?.name ?? null,
    targetArtKey: first?.artKey ?? null,
    targetRemaining: counts.targetRemaining,
    numExplode: explodeThreshold(level),
    connection: connectionRule(level.neighbours),
    targetNeedsChain: level.chainGrass,
    greys: counts.greys,
    description: level.description,
  };
}

/**
 * The summary as sentences, for tests and for anything that cannot use markup.
 *
 * Ordered so the most load-bearing fact comes first: how the board connects is what
 * makes a level playable or not, and a player who has not got that will read the
 * rest without understanding it.
 *
 * The goal is described as "marked" rather than by name. Upstream calls the kind
 * `inGras` or `inBunt`, which is artwork naming and not something a player can act
 * on. The HUD shows a colour swatch beside the text instead; the name is kept in
 * `targetName` for a tooltip.
 */
export function goalSummaryLines(summary: GoalSummary): string[] {
  const lines: string[] = [];
  lines.push(
    summary.connection.includesDiagonal
      ? `Blobs join ${summary.connection.detail.replace(/^Blobs join /, "")}`
      : summary.connection.detail,
  );
  if (summary.numExplode > 1) {
    lines.push(
      `Join ${summary.numExplode} of the same colour to make them explode.`,
    );
  }
  if (summary.targetName !== null) {
    lines.push(
      summary.targetNeedsChain
        ? `Every marked blob must be cleared by an explosion next to it - ${summary.targetRemaining} left.`
        : `Clear every marked blob - ${summary.targetRemaining} left.`,
    );
  }
  if (summary.greys > 0) {
    lines.push(
      `Grey blobs must be cleared the same way - ${summary.greys} left.`,
    );
  }
  return lines;
}
