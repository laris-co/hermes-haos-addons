import type { ServerAdapterModule } from "./types.js";
import { execute } from "./execute.js";
import { sessionCodec } from "./session.js";
import { testEnvironment } from "./test.js";

export const thclawsLocalAdapter: ServerAdapterModule = {
  type: "thclaws_local",
  execute,
  testEnvironment,
  sessionCodec,
  models: [],
  supportsLocalAgentJwt: true,
  supportsInstructionsBundle: true,
  instructionsPathKey: "instructionsFilePath",
  getConfigSchema: () => ({
    fields: [
      { key: "baseUrl", label: "OpenAI-compatible base URL", type: "text", required: true, hint: "Example: http://192.168.1.143:20128/v1" },
      { key: "apiKey", label: "API key", type: "text", hint: "Bearer key used by the configured gateway." },
      { key: "model", label: "Model", type: "text", required: true, default: "glm/glm-5.3", hint: "thClaws adds the required oai/ provider prefix automatically." },
      { key: "cwd", label: "Working directory", type: "text", hint: "Absolute workspace path. Sessions only resume in the same directory." },
      { key: "command", label: "thClaws command", type: "text", default: "thclaws" },
      { key: "timeoutSec", label: "Timeout (seconds)", type: "number", default: 0 },
      { key: "graceSec", label: "Shutdown grace (seconds)", type: "number", default: 15 },
    ],
  }),
  agentConfigurationDoc: `# thclaws_local agent configuration

Adapter: thclaws_local

Runs the thClaws CLI (https://github.com/thClaws/thClaws) non-interactively
via --print for each run. Paperclip persists the session id emitted by thClaws
and resumes it on later heartbeats for the same task/workspace.

Core fields:
- model (string, optional): passed to thclaws via -m
- baseUrl (string, required): OpenAI-compatible endpoint; sets OPENAI_COMPAT_BASE_URL
- apiKey (string, optional): sets OPENAI_COMPAT_API_KEY
- command (string, optional, default "thclaws"): binary to invoke
- cwd (string, optional): absolute working directory
- env (object, optional): additional KEY=VALUE environment variables
- instructionsFilePath (string, optional): instructions prepended to a fresh session

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds
`,
};

export function createServerAdapter(): ServerAdapterModule {
  return thclawsLocalAdapter;
}

export default thclawsLocalAdapter;
