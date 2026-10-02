/**
 * The licence is stated once and checked everywhere.
 *
 * This exists because it was stated four different ways at once. The README badge said
 * GPL v2, `LICENSE-OR-LATER.md` said GPL-2.0-or-later, five scripts and the Makefile
 * carried AGPL-3.0 headers, and the contributor guide told people to submit
 * GPL-2.0-or-later. Every one of those was reasonable-looking and no gate noticed,
 * because nothing compared them.
 *
 * A licence that disagrees with itself is worse than a sloppy one: it makes every
 * recipient's obligations uncertain, and for a copyleft project the whole point is that
 * the obligations are knowable. So this asserts the one fact from as many directions as
 * can be read mechanically - the licence text itself, the badge, the prose, the script
 * headers - and fails naming the file that is wrong.
 *
 * The compatibility claims are asserted too, because they are the part that is easy to
 * state wrongly. AGPL-3.0 is *not* compatible with GPL-2.0-only, and a document that
 * implies otherwise would mislead a contributor into submitting something that cannot be
 * included.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname);

/** Every markdown file in the repository that states a licence. */
function docs(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 2) return;
    for (const entry of readdirSync(resolve(ROOT, dir), {
      withFileTypes: true,
    })) {
      if (entry.name.startsWith(".")) continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        // `.context` holds the AI's own memory and the upstream GPL source; neither is
        // this project's documentation.
        if (
          ["node_modules", "dist", ".context", "coverage"].includes(entry.name)
        ) {
          continue;
        }
        walk(rel, depth + 1);
      } else if (entry.name.endsWith(".md")) {
        out.push({ path: rel, text: readFileSync(resolve(ROOT, rel), "utf8") });
      }
    }
  };
  walk(".", 0);
  return out;
}

const SHIPPED = docs().filter((d) => !d.path.startsWith("openspec/changes/"));

describe("LICENSE holds the AGPL-3.0 text", () => {
  const text = readFileSync(resolve(ROOT, "LICENSE"), "utf8");

  it("is the Affero GPL, version 3", () => {
    expect(text).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(text).toContain("Version 3, 19 November 2007");
  });

  it("is complete, not a stub or a link", () => {
    // All eighteen numbered sections, and the closing marker. A truncated or
    // placeholder licence file is worse than a missing one, because it looks fine to a
    // skim and is not a licence at all.
    for (let n = 0; n <= 17; n++) {
      expect(text, `section ${n} missing`).toMatch(
        new RegExp(`^  ${n}\\. `, "m"),
      );
    }
    expect(text).toContain("END OF TERMS AND CONDITIONS");
    // The network clause is the entire reason for choosing the AGPL over the GPL, so its
    // absence would mean the file is not the licence it claims to be.
    expect(text).toContain("13. Remote Network Interaction");
  });
});

describe("every document says the same thing", () => {
  /**
   * The three places that state the *project's* licence, rather than upstream's.
   *
   * An earlier version of this test scanned every document for a GPL mention and tried to
   * decide whether it was about upstream. It flagged `ATTRIBUTION.md`, which is entirely
   * correct - it is mostly *about* upstream and says GPL-2.0-or-later for exactly that
   * reason. A test that fails on a correct document is worse than no test, because it
   * teaches you to ignore it. So the statements are enumerated instead of inferred: these
   * three are the ones that make a claim about this project, and each is checked exactly.
   */
  const statements: readonly (readonly [string, RegExp])[] = [
    ["README.md", /Licence: AGPL-3\.0-or-later\./],
    [
      "LICENSING.md",
      /licensed under the GNU Affero General Public License, version 3 or \(at your option\) any later version\./,
    ],
    [
      "ATTRIBUTION.md",
      /New code in this directory is authored for the Cuyo web port and is licensed AGPL-3\.0-or-later/,
    ],
  ];

  /**
   * Prose with the emphasis markers removed and the line wrapping collapsed.
   *
   * Because these are paragraphs rather than code, the wrapping is not fixed and moves
   * whenever anyone reflows a sentence. Matching raw text made this test fail for a
   * rewrap, which is the kind of failure that gets a test deleted rather than fixed - so
   * what is compared is the content, not the line breaks.
   */
  const flat = (file: string): string =>
    readFileSync(resolve(ROOT, file), "utf8")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();

  it("states it as AGPL-3.0-or-later in each of them", () => {
    const missing = statements
      .filter(([file, re]) => !re.test(flat(file)))
      .map(([file]) => file);
    expect(
      missing,
      "files not stating AGPL-3.0-or-later for this project",
    ).toEqual([]);
  });

  it("links the badge and the statement at a file that exists", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");
    // The badge and the statement must not drift apart, which is how the project ended up
    // claiming GPL v2 in one place and AGPL in another.
    expect(readme).toContain("License-AGPL_v3");
    expect(readme).not.toContain("License-GPL_v2");
    for (const target of ["LICENSING.md", "ATTRIBUTION.md"]) {
      expect(readme).toContain(`(${target})`);
    }
  });

  it("has no document still pointing at the deleted licence file", () => {
    // `LICENSE-OR-LATER.md` is gone; a link to it is now a dead reference, and the name
    // would be wrong even if the file existed - "or later" referred to GPL-2's clause.
    const stale = SHIPPED.filter((d) =>
      d.text.includes("LICENSE-OR-LATER"),
    ).map((d) => d.path);
    expect(stale, "documents referencing LICENSE-OR-LATER.md").toEqual([]);
  });
});

describe("the script headers agree", () => {
  it("every script and the Makefile carry the AGPL notice", () => {
    const headers = [
      ...readdirSync(resolve(ROOT, "scripts"))
        .filter((f) => f.endsWith(".sh"))
        .map((f) => `scripts/${f}`),
      "Makefile",
    ];
    const wrong = headers.filter((f) => {
      const text = readFileSync(resolve(ROOT, f), "utf8");
      const head = text.slice(0, 900);
      return !head.includes("GNU Affero General Public License");
    });
    // These were AGPL while the project was GPL-2.0-or-later, which is the inconsistency
    // that prompted the upgrade. If this fails, a header has been copied from a GPL-2
    // project - the mistake this repository keeps making.
    expect(wrong, "headers not carrying the AGPL notice").toEqual([]);
  });
});

describe("the compatibility claims are right", () => {
  const licensing = readFileSync(resolve(ROOT, "LICENSING.md"), "utf8");

  it("says AGPL-3.0 is not compatible with GPL-2.0-only", () => {
    // The single most consequential fact in the file, and the one most likely to be
    // stated wrongly in a way that misleads a contributor.
    expect(licensing).toMatch(/incompatible with GPL-2\.0-only/i);
    expect(licensing).toMatch(
      /not because AGPL-3\.0 is\s+compatible with everything/i,
    );
  });

  it("grounds that in upstream's own per-file notice", () => {
    // A compatibility argument that cites the licence name rather than the grant is not
    // an argument. Upstream's `COPYING` is plain GPL-2 text; the per-file notice is what
    // carries "or later", and that distinction is the whole basis.
    expect(licensing).toContain(
      "either version 2 of the License, or (at your option) any later version",
    );
    expect(licensing).toContain("COPYING");
  });

  it("records that copies already distributed keep GPL-2.0-or-later", () => {
    // A licence grant is perpetual. Saying otherwise would be wrong, and omitting it
    // would leave someone believing they could relicense what they already gave away.
    expect(licensing).toMatch(/perpetual|cannot be withdrawn/i);
  });

  it("records the interface notice that section 5(d) requires", () => {
    // The one obligation the upgrade creates that plain GPL-2 did not have, so it is
    // easy to create and forget.
    expect(licensing).toContain("5(d)");

    // Asserted on the element, not on the file. A `toContain` over the whole module
    // matched the explanatory comment above the notice rather than the notice itself, so
    // deleting the "no warranty" text still passed - found by mutation, which is the only
    // reason it was found at all.
    const app = readFileSync(resolve(ROOT, "app/App.tsx"), "utf8");
    const notice = /<p className="shell__licence">([\s\S]*?)<\/p>/.exec(app);
    expect(notice, "no shell__licence paragraph in app/App.tsx").not.toBeNull();
    const rendered = (notice?.[1] ?? "").replace(/\s+/g, " ");

    // Section 0's four requirements, each one. A notice missing the warranty statement is
    // not an Appropriate Legal Notice, and nothing else would say so.
    expect(rendered, "copyright notice").toContain(
      "2026 Sebastian Ryszard Kruk",
    );
    expect(rendered, "no-warranty statement").toContain("no warranty");
    expect(rendered, "may be conveyed under the licence").toMatch(
      /free software under the/,
    );
    expect(rendered, "where to read the licence").toContain("agpl-3.0.html");
    // Section 13's half: the source, offered to the people using it.
    expect(rendered, "a link to the source").toContain(
      "github.com/sebastiankruk/cuyo-web",
    );
  });
});
