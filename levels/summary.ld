# Contributed levels, indexed exactly as upstream's summary.ld is.
#
# The format is upstream's on purpose: a contributor copies an upstream file and changes
# its contents rather than learning a sidecar. See ../docs/adding-levels.md.
#
# Add a section per level and list each one under a `level[track]` entry, or it will be
# indexed but unreachable from the menu. A level in no list is reported by the build
# rather than quietly dropped.
#
# Empty until someone contributes one. `level[contrib]` is upstream's own track for
# community levels, and a contributed level is welcome there or on a new one - the
# catalogue lists whatever tracks the summaries declare, in the order they are first
# mentioned, so a new name needs no code change.

