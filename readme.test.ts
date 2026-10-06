// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Sebastian Ryszard Kruk (dev@kruk.me)
// Licensed under the GNU Affero General Public License, version 3 or later.
// See LICENSING.md for the notices this project owes, and ATTRIBUTION.md for what it is
// a port of.
/**
 * README badges must be able to render.
 *
 * Found by looking at the rendered page rather than the source: the README's version and
 * CI badges were both broken, and in two different ways, which is why they looked like one
 * bug and were not.
 *
 * A badge is a network fact — it either loads or it does not — and a test cannot ask GitHub
 * without making the suite depend on a network and on repository visibility changing under
 * it. What it *can* do is pin the policy that makes the failure impossible to repeat by
 * accident: every badge is static, so it renders the same for everyone, **except** for a
 * named list of two that read the repository and work because it is public.
 *
 * Those two were removed once. On a private repository the actions badge is a hard 404 —
 * the image does not exist for anyone outside — and a shields.io badge that reads the
 * repository returns a valid image *saying* it cannot find it, which is worse, because it
 * reads as a statement about the project rather than a failure of the badge. They came back
 * when the repository was made public and a release was published, and both of those are
 * preconditions rather than intentions, which is why they are a list and not a blanket rule.
 *
 * **The gap this cannot close.** Nothing here checks that the repository is still public,
 * or that a release still exists. If either stops being true, these badges break again and
 * every assertion in this file still passes — the same silent failure, arrived at from the
 * other direction. Catching it needs a network check on a schedule, which is not something
 * `make check` should do. Until that exists, this file pins the *policy* and not the
 * *rendering*, and the README says so next to the badges.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const README = readFileSync(resolve(import.meta.dirname, "README.md"), "utf8");

/** Every badge image reference in the README. */
function badges(): { alt: string; url: string }[] {
  const out: { alt: string; url: string }[] = [];
  // The badge line(s): `[![alt](url)](link)`. Non-greedy on both so a run of adjacent
  // badges on one line yields one match each rather than one for the whole run.
  for (const m of README.matchAll(/\[!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    out.push({ alt: m[1] ?? "", url: m[2] ?? "" });
  }
  return out;
}

/**
 * A shields.io badge that draws the text it is given, asking nothing about the repository.
 *
 * Anchored at the start on purpose. Unanchored, `https://example.com/img.shields.io/badge/
 * something` reads as static and passes, which is the same category of bug as the one this
 * file exists to catch — a badge URL that looks fine and is not. CodeQL called it
 * (`js/regex/missing-regexp-anchor`) after eight CI jobs were green.
 */
const STATIC_BADGE = /^https:\/\/img\.shields\.io\/badge\//;

/**
 * The badges allowed to read the repository, and why each one is here.
 *
 * A list rather than a rule, because "reads the repository" is not one thing. These two
 * have different owners, different failure modes, and different preconditions, and the
 * reason each is acceptable is not the same reason as the other's. Adding a third means
 * writing down why *it* is acceptable, which is the point.
 */
const ALLOWED_DYNAMIC: readonly { match: RegExp; why: string }[] = [
  {
    match: /^https:\/\/img\.shields\.io\/github\/v\/release\//,
    why: "the version badge, which needs a public repository *and* a published release",
  },
  {
    match:
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/workflows\/[^/]+\/badge\.svg$/,
    why: "GitHub's own actions badge, which needs a public repository",
  },
];

const allowed = (url: string) => ALLOWED_DYNAMIC.some((a) => a.match.test(url));

/**
 * A `..` path segment, refused before anything else looks at the URL.
 *
 * Not paranoia about the README — it is not attacker-controlled. It is the same defect as
 * the lookalike host one row below: browsers and HTTP clients normalise a path before
 * sending it, so `img.shields.io/badge/../../github/v/release/x` *reaches* the endpoint that
 * reads the repository, while to this file it starts with `/badge/` and reads as static.
 *
 * Static is a claim about what the badge fetches. A claim that can be made true-looking and
 * false is not a claim, and the cheapest way to keep it honest is to refuse the one shape
 * where the two disagree.
 */
const TRAVERSAL = /(^|\/)\.\.(\/|$)/;

/** The path, without the query or fragment: the only part a client normalises. */
function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

/** How a badge URL is treated: drawn as given, permitted to read the repo, or refused. */
function classify(url: string): "static" | "allowed" | "refused" {
  // Tested against the path alone. `..` inside a query string is a parameter *to* the badge
  // endpoint and changes nothing about which endpoint is called, so refusing it would be
  // refusing a static badge for a reason that does not exist.
  if (TRAVERSAL.test(pathOf(url))) return "refused";
  if (STATIC_BADGE.test(url)) return "static";
  if (allowed(url)) return "allowed";
  return "refused";
}

describe("badge classification", () => {
  // Table-driven rather than exercised through README.md, and that is the point.
  //
  // The anchoring of these patterns is invisible in the README, because no badge in it
  // looks like the thing they exist to reject. Testing the predicate through a document
  // that happens to contain no counterexample leaves the exact defect unguarded: unanchoring
  // STATIC_BADGE widens what passes as static, the README has no lookalike host in it, and
  // every assertion still succeeds. This table fails instead.
  //
  // Each `want: "refused"` row is a URL that renders a plausible-looking badge and is not
  // one this project is willing to show.
  const cases: readonly { url: string; want: string; why: string }[] = [
    {
      url: "https://img.shields.io/badge/License-AGPL_v3-blue.svg",
      want: "static",
      why: "a shields.io badge whose text is given in the URL",
    },
    {
      url: "https://img.shields.io/badge/Node-22%2B-339933.svg?logo=node.js",
      want: "static",
      why: "a query string does not change what the badge is",
    },
    {
      url: "https://img.shields.io/github/v/release/sebastiankruk/cuyo-web?label=version",
      want: "allowed",
      why: "the version badge, listed",
    },
    {
      url: "https://github.com/sebastiankruk/cuyo-web/actions/workflows/quality.yml/badge.svg",
      want: "allowed",
      why: "GitHub's own actions badge, listed",
    },
    {
      url: "https://example.com/img.shields.io/badge/Thing-blue.svg",
      want: "refused",
      why: "shields.io in the path is not shields.io as the host",
    },
    {
      url: "https://example.com/proxy?u=https://img.shields.io/badge/Thing-blue.svg",
      want: "refused",
      why: "a real shields.io URL inside another host's query string",
    },
    {
      url: "https://img.shields.io.example.com/badge/Thing-blue.svg",
      want: "refused",
      why: "the host merely ends in shields.io",
    },
    {
      url: "https://img.shields.io/github/downloads/sebastiankruk/cuyo-web",
      want: "refused",
      why: "reads the repository, and is not on the list",
    },
    {
      url: "https://img.shields.io/github/stars/sebastiankruk/cuyo-web?style=social",
      want: "refused",
      why: "reads the repository, and is not on the list",
    },
    {
      url: "https://img.shields.io/badge/../../github/v/release/x",
      want: "refused",
      why: "a traversal out of /badge/ reaches a different endpoint than it looks like",
    },
    {
      url: "https://img.shields.io/github/v/release/../downloads/x",
      want: "refused",
      why: "a traversal out of a listed badge is the same trick in reverse",
    },
    {
      url: "https://img.shields.io/badge/x.svg?u=../../github/v/release/x",
      want: "static",
      why: "a traversal inside a query string is not a path segment",
    },
    {
      url: "https://raw.githubusercontent.com/sebastiankruk/cuyo-web/main/x.svg",
      want: "refused",
      why: "not a badge service at all",
    },
  ];

  for (const c of cases) {
    it(`treats ${c.want === "refused" ? "no" : "a"} badge as ${c.want}: ${c.why}`, () => {
      expect(classify(c.url), c.url).toBe(c.want);
    });
  }
});

describe("README badges", () => {
  const all = badges();

  it("has some, so the assertions below are not vacuous", () => {
    // A test that passes because it found nothing is a test that never runs. This is the
    // lesson from the corpus oracle that skipped 46 of 79 levels while reporting success.
    expect(all.length, "badge references found in README.md").toBeGreaterThan(3);
  });

  it("are all static, or on the list of ones allowed not to be", () => {
    const dynamic = all.filter((b) => classify(b.url) === "refused");
    expect(
      dynamic.map((b) => `${b.alt} -> ${b.url}`),
      "badges that need an unauthenticated read of the repository. They render " +
        "nothing, or an error, whenever the repository is private — and a broken " +
        "image in a README says something is wrong with the project when what is " +
        `wrong is the badge. Add it to ALLOWED_DYNAMIC and say why: ${ALLOWED_DYNAMIC.map(
          (a) => a.why,
        ).join("; ")}`,
    ).toEqual([]);
  });

  it("actually carry the two that read the repository", () => {
    // Without this, deleting a badge from the README would pass everything above, and the
    // list would quietly rot into a permission nobody granted.
    for (const entry of ALLOWED_DYNAMIC) {
      expect(
        all.filter((b) => entry.match.test(b.url)).length,
        `no badge matching ${entry.match} — ${entry.why}`,
      ).toBeGreaterThan(0);
    }
  });

  it("point the two repository-reading badges at this repository", () => {
    // A copied-in badge from a template is the obvious way to end up advertising someone
    // else's release status, and the regex above accepts any owner.
    const repo = "sebastiankruk/cuyo-web";
    const wrong = all.filter(
      (b) =>
        allowed(b.url) &&
        !b.url.includes(repo) &&
        !b.url.includes("img.shields.io/github/v/release"),
    );
    expect(
      wrong.map((b) => `${b.alt} -> ${b.url}`),
      `repository-reading badges should refer to ${repo}`,
    ).toEqual([]);
  });

  it("say what they mean in their alt text, since that is what a screen reader reads", () => {
    const vague = all.filter((b) => b.alt.trim().split(/\s+/).length < 2);
    expect(
      vague.map((b) => b.alt),
      "badge alt text should name the thing, not just the icon",
    ).toEqual([]);
  });

  it("describe the version badge as a version, and the CI badge as CI", () => {
    // Alt text is the label's only textual meaning in a reader, and a badge whose alt
    // says nothing is a badge that renders as "image" in a list of links.
    const named = (fragment: string) =>
      all.some((b) => b.url.includes(fragment) && /release|version/i.test(b.alt));
    const ci = all.some(
      (b) => b.url.includes("/badge.svg") && /ci|quality|build/i.test(b.alt),
    );
    expect(named("github/v/release"), "the version badge needs alt text naming it").toBe(
      true,
    );
    expect(ci, "the CI badge needs alt text naming it").toBe(true);
  });
});