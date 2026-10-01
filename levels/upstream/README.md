# Upstream levels

These are **upstream Cuyo's own 79 levels, copied verbatim**, GPL-2.0-or-later like the
rest of this project. They are committed rather than fetched, so a fresh clone builds,
tests and runs without reaching a Debian archive pool first.

They are here rather than in `../` alongside contributed levels for two reasons, and both
matter:

- **Provenance stays visible.** A reviewer can see at a glance which files are upstream's
  and which this project added or changed. Merging them into one directory would make
  that a matter of remembering.
- **A patch is a different file.** If a level here needs fixing, the fix goes in
  `../<name>.ld` and shadows this one. The vendored copy stays byte-identical to
  upstream, so `git log` shows the patch separately from the original and
  `make check-levels-upstream` can still prove the vendored files are unaltered.

## What was copied

Everything upstream's `data/` directory holds as a `.ld` file: 79 levels, plus
`globals.ld` and `summary.ld`.

- `globals.ld` is the shared vocabulary every level resolves its names against. The
  runtime needs it to read any level at all.
- `summary.ld` is the index. It decides which levels exist, their order, their authors,
  and which track each one appears on. `make level-index` compiles it into the
  catalogue.
- `example.ld` is upstream's documentation of the file format, and is not a level. It
  is not shipped to the browser and not in the catalogue, because its picture names are
  illustrative and would put art keys in the manifest that no real level uses.

## Verifying they are unaltered

```sh
make fetch-corpus          # once, to get upstream's own copy
make check-levels-upstream  # then, any time
```

`check-levels-upstream` compares both directions: a vendored file that differs from
upstream's, and an upstream level with no vendored counterpart. It **skips with a
message** when there is no checkout to compare against — deliberately not part of
`make check`, because CI has no upstream tree and a gate that can only ever skip in CI
gives false confidence rather than assurance.

The files were copied from the `cuyo_2.1.0.orig.tar.gz` tarball, SHA-256 verified by
`scripts/fetch-cuyo.sh`. Nothing here is derived from upstream's artwork, which is
GPL-2.0-or-later too and equally copyable — and equally deliberately not copied, since
this project generates its own. See `scripts/check-no-upstream-art.sh`, which fails the
build if any of upstream's 1749 sprite digests reaches `dist/`.

See [`../../ATTRIBUTION.md`](../../ATTRIBUTION.md) for the authors and the full
licence position.
