# Vendored source — provenance and what's ours vs. upstream's

`src/index.ts`, `src/execute.ts`, `src/types.ts`, `src/test.ts`, and this
directory's `LICENSE-vendored-adapter` are copied verbatim from
[Soul-Brews-Studio/thclaws-paperclip-adapter](https://github.com/Soul-Brews-Studio/thclaws-paperclip-adapter)
(`main` branch, fetched 2026-08-24), MIT licensed — copyright notice
and permission notice preserved per that license's terms.

**Why vendored instead of `npm install @soul-brews-studio/thclaws-paperclip-adapter`**:
verified directly (`npm view @soul-brews-studio/thclaws-paperclip-adapter`
→ 404) that this package is not published on the public npm registry,
and its source repository is private with no `publishConfig` pointing
at any other registry. A public, buildable Dockerfile in this repo
cannot depend on a package that doesn't exist for the audience this
repo is for — vendoring the actual (small, MIT-licensed) source is the
honest fix, not a workaround. `@paperclipai/adapter-utils`, the one
real dependency this package has, genuinely is public on npm and is
installed normally.

**`src/paperclip-entry.ts` is NOT part of the vendored source** — it's
this repo's own compatibility shim, added on top. Paperclip's external-
adapter loader (`server/src/adapters/plugin-loader.ts`,
`validateAdapterModule`) requires a package's resolved entry point to
export a `createServerAdapter()` factory function. The vendored
adapter's own `src/index.ts` exports a plain `thclawsLocalAdapter`
object instead (`export default thclawsLocalAdapter`) — this file
adapts one shape to the other without editing the vendored files'
actual logic. Verified working against a real, running
`ghcr.io/paperclipai/paperclip` instance — see `../DOCS.md`.

If `@soul-brews-studio/thclaws-paperclip-adapter` is ever published
publicly, or its source changes to export `createServerAdapter()`
itself, this vendoring (and `paperclip-entry.ts`) should be removed in
favor of a normal `npm install`.
