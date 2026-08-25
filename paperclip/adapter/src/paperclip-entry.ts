// NOT part of the original vendored adapter — this repo's own compatibility
// shim, added on top. See uptime-kuma/hermes-haos-addons/paperclip/DOCS.md
// for the full reasoning: Paperclip's external-adapter loader
// (server/src/adapters/plugin-loader.ts, validateAdapterModule) requires a
// named `createServerAdapter()` factory export from a package's resolved
// entry point. The vendored adapter's own src/index.ts (unmodified, as
// fetched from Soul-Brews-Studio/thclaws-paperclip-adapter@main, MIT
// licensed) exports a plain `thclawsLocalAdapter` object instead — this
// file adapts one to the other without touching the vendored logic.
import { thclawsLocalAdapter } from "./index.js";
import type { ServerAdapterModule } from "./types.js";

export function createServerAdapter(): ServerAdapterModule {
  return thclawsLocalAdapter;
}
