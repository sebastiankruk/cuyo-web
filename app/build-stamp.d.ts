/**
 * The commit the running bundle came from.
 *
 * A virtual module rather than Vite's `define`, because `define` behaves differently in
 * the two places that matter: it is substituted by `vite build`, and it is *not*
 * substituted in the dev server, where the identifier survives into the served module.
 * That is the opposite of what is wanted here - the dev server is exactly where the
 * question "which build am I looking at" gets asked - and it was found by grepping the
 * dev server's own response rather than by reasoning about it.
 *
 * A plugin works identically in dev, build and test, because all three go through the
 * same Vite pipeline. It also keeps the value out of `defineConfig`, which means nothing
 * in the build has to know the value exists except the one module that displays it.
 */
declare module "virtual:build-stamp" {
  /** Short commit hash, or `"unknown"` outside a git checkout. */
  export const COMMIT: string;
  /** Whether the working tree had uncommitted changes when the server started. */
  export const DIRTY: boolean;
}
