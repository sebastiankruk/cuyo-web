# Licensing

This project is licensed under the **GNU Affero General Public License, version 3 or (at
your option) any later version.** The full text is in [`LICENSE`](LICENSE).

Copyright (C) 2026 Sebastian Ryszard Kruk.

## Why AGPL rather than GPL

The AGPL is GPL plus one clause. Section 13 requires that if you modify this program and
let people interact with it over a network, you must offer those users the corresponding
source of your version.

That clause exists because plain GPL has a hole in it. You may make a modified version and
let the public use it on a server without ever releasing your changes — the GPL only
requires source when you *convey* the work, and hosting it is not conveying. For a
browser game that is not a hypothetical: this is a static site, so "fork it, change the
levels, put it online" is a thing someone can do in an afternoon, and under plain GPL the
result need never give anything back.

The honest caveat, because it should not be oversold: this is a client-side application
with no server component, and GPL's ordinary distribution clause already reaches
JavaScript served to a browser — the FSF's reading, though people do contest it. So the
AGPL buys less here than it would for server software. What it buys is that the guarantee
does not depend on that contested question, and that it keeps holding if this ever grows a
server — a shared level catalogue, a leaderboard, a server-side validator.

## Why this is compatible with upstream

Cuyo is **GPL-2.0-or-later**, and combining its level files and mechanics into an
AGPL-3.0 work is permitted *because* of the "or later" clause, not because AGPL-3.0 is
compatible with everything. It is not. AGPL-3.0 is **incompatible with GPL-2.0-only**
code; that asymmetry is why every "or later" clause exists.

The clause is in upstream's own per-file notices, which is what licenses those files:

> This program is free software; you can redistribute it and/or modify it under the
> terms of the GNU General Public License as published by the Free Software Foundation;
> either version 2 of the License, or (at your option) any later version.

(`COPYING` in the upstream tree is the plain GPL-2 text with no such wording; the per-file
notice is the operative grant, which is why the distinction is worth stating.)

**The practical consequence, for contributors.** A patch offered under GPL-2.0-**only** —
typically copied from a v2-only codebase without the clause — cannot be included, because
the combined work could not be distributed under AGPL-3.0. Copying from Cuyo is fine.
Copying from an arbitrary GPL-2 project is not. If that is your situation, say so in the
pull request rather than shipping it and finding out at review.

## Copies already distributed

Every copy of this project released up to and including 0.2.0 was distributed under
GPL-2.0-or-later, and that grant is perpetual: it cannot be withdrawn. Those copies remain
GPL-2.0-or-later forever, for everyone who holds one.

AGPL-3.0 applies from the next release onwards. Nobody's rights are reduced by this — a
GPL-2.0-or-later recipient can do everything they could before, and can still combine
this with GPL-3.0-or-later work, which they could not do under AGPL-3.0 alone.

## The interface notice

AGPL section 5(d) requires an interactive user interface to display "Appropriate Legal
Notices": a copyright notice, a statement that there is no warranty, that the work may be
conveyed under this licence, and where to read the licence. Plain GPL-2 had no such
requirement, so this is a genuinely new obligation created by the upgrade rather than
housekeeping.

It is satisfied by the footer on the catalogue screen, and section 13's "offer the
corresponding source" by the repository link beside it.

## What is not AGPL-3.0

Nothing in this repository is under a different licence from the rest of it, and nothing
that is not is bundled into the build. The two runtime dependencies, `react` and
`react-dom`, are MIT.

The vendored level files in `levels/upstream/` are upstream Cuyo's own work under
GPL-2.0-or-later, redistributed verbatim in a combined work. They are compatible for the
reason above and remain the work of their original authors. See
[`ATTRIBUTION.md`](ATTRIBUTION.md) for the full provenance and the artwork position.
