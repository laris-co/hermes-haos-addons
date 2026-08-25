import type { ServerAdapterModule } from "./types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const thclawsLocalAdapter: ServerAdapterModule = {
  type: "thclaws_local",
  execute,
  testEnvironment,
  models: [],
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: `# thclaws_local agent configuration

Adapter: thclaws_local

Runs the thClaws CLI (https://github.com/thClaws/thClaws) non-interactively
via --print for each run. Minimal v1: no session resume, no remote execution
targets, no skill staging.

Core fields:
- model (string, optional): passed to thclaws via -m
- baseUrl (string, required): OpenAI-compatible endpoint; sets OPENAI_COMPAT_BASE_URL
- apiKey (string, optional): sets OPENAI_COMPAT_API_KEY
- command (string, optional, default "thclaws"): binary to invoke
- cwd (string, optional): absolute working directory
- env (object, optional): additional KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds
`,
};

export default thclawsLocalAdapter;
