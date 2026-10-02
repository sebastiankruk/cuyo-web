/**
 * README badges must be able to render.
 *
 * Found by looking at the rendered page rather than the source: the README's version and
 * CI badges were both broken, and in two different ways, which is why they looked like one
 * bug and were not.
 *
 * This is a network fact — a badge either loads or it does not — and a test cannot ask
 * GitHub without making the suite depend on a network and on repository visibility
 * changing under it. What it *can* do is pin the policy that makes the failure impossible:
 * every badge is static, so it renders the same for everyone regardless of who is looking.
 *
 * The two that were removed are not static. GitHub's own actions badge endpoint returns a
 * hard 404 to an unauthenticated request for a private repository — the image does not
 * exist for anyone outside it — and a shields.io badge that reads the repository renders a
 * valid image *saying* it cannot find it, which is worse because it looks deliberate.
 *
 * If the repository is ever made public, delete the assertions below and put both badges
 * back; the failure message says so.
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

describe("README badges", () => {
  const all = badges();

  it("has some, so the assertions below are not vacuous", () => {
    // A test that passes because it found nothing is a test that never runs. This is the
    // lesson from the corpus oracle that skipped 46 of 79 levels while reporting success.
    expect(all.length, "badge references found in README.md").toBeGreaterThan(
      3,
    );
  });

  it("are all static, so they render for everyone", () => {
    // Static means the URL path is `/badge/...`: shields.io draws the text it is given
    // without asking anything about the repository.
    //
    // Anchored at the start on purpose. Unanchored, `https://example.com/img.shields.io/
    // badge/something` reads as static and passes, which is the same category of bug as
    // the one this file exists to catch - a badge URL that looks fine and is not. CodeQL
    // called it (`js/regex/missing-regexp-anchor`) after eight CI jobs were green.
    const STATIC_BADGE = /^https:\/\/img\.shields\.io\/badge\//;
    const dynamic = all.filter((b) => !STATIC_BADGE.test(b.url));
    expect(
      dynamic.map((b) => `${b.alt} -> ${b.url}`),
      "badges that need an unauthenticated read of the repository; they render " +
        "nothing (or an error) while it is private",
    ).toEqual([]);
  });

  it("do not use GitHub's actions badge endpoint", () => {
    // Named separately because it fails differently: a 404, rather than a rendered error.
    // The endpoint is correct and works on a public repository — this is about *this*
    // repository being private, not about the endpoint being wrong.
    const actions = all.filter((b) =>
      /\/actions\/workflows\/.*\/badge\.svg/.test(b.url),
    );
    expect(
      actions.map((b) => b.alt),
      "GitHub actions badges 404 for a private repository",
    ).toEqual([]);
  });

  it("do not ask shields.io to read the repository either", () => {
    // The version badge was one of these: a *valid* image carrying the words "no releases
    // or repo not found", which is worse than a broken one because it reads as a real
    // statement about the project rather than a failure of the badge.
    // Anchored for the same reason as `STATIC_BADGE`, and it has to agree with it: if
    // these two disagree about where a shields.io URL starts, a badge can pass one test
    // and fail the other for reasons no reader of the file would predict.
    const SHIELDS_HOST = /^https:\/\/img\.shields\.io\/(?!badge\/)/;
    const reads = all.filter((b) => SHIELDS_HOST.test(b.url));
    expect(
      reads.map((b) => `${b.alt} -> ${b.url}`),
      "shields.io badges that read the repository cannot work while it is private",
    ).toEqual([]);
  });

  it("say what they mean in their alt text, since that is what a screen reader reads", () => {
    const vague = all.filter((b) => b.alt.trim().split(/\s+/).length < 2);
    expect(
      vague.map((b) => b.alt),
      "badge alt text should name the thing, not just the icon",
    ).toEqual([]);
  });
});
