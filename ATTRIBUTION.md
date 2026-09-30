# Attribution

Cuyo was written by **Immanuel Halupczok** and maintained by the **Cuyo
developers**. The upstream release this project is based on is version 2.1.0,
whose full source is included unmodified in [`../cuyo-2.1.0`](../cuyo-2.1.0).

Upstream: <https://www.cuyo.de/> — mailing list `cuyo@karimmi.de`.

## What is reused

| Asset | Origin | Licence |
| --- | --- | --- |
| Level description files (`*.ld`) | Cuyo 2.1.0, `cuyo-2.1.0/data/` | GPL-2.0-or-later, per-file copyright headers in `cuyo-2.1.0/AUTHORS` |
| Game rules and mechanics | Cuyo 2.1.0 | GPL-2.0-or-later |
| `docs/cual.6`, `docs/cuyo.6` | Cuyo 2.1.0 | GPL-2.0-or-later |

## What is *not* reused

The 912 XPM spritesheets in `cuyo-2.1.0/data/pics/`, the `.it` music module, and
the original bitmap font are **not** part of this project. All artwork here is new
work authored for this project.

A build assertion enforces this: the build fails if any file originating in
`cuyo-2.1.0/data/pics` appears in the output.

## Documentation used as the specification

Behaviour was derived from the upstream sources and manual pages rather than by
diffing against a running original, because upstream cannot be built in this
environment (no SDL 1.2, no C++ compiler, no bison/flex). The manual pages contain
normative worked examples which are encoded as tests — see task group 12.

## This project

New code in this directory is authored for the Cuyo web port and is likewise
GPL-2.0-or-later. See [LICENSE-OR-LATER.md](LICENSE-OR-LATER.md).
