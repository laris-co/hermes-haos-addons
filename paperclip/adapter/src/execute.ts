import type { AdapterExecutionContext, AdapterExecutionResult } from "./types.js";
import {
  asString,
  asNumber,
  parseObject,
  buildPaperclipEnv,
  renderTemplate,
  ensureAbsoluteDirectory,
  ensurePathInEnv,
  resolveCommandForLogs,
  buildInvocationEnvForLogs,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  joinPromptSections,
  renderPaperclipWakePrompt,
} from "@paperclipai/adapter-utils/server-utils";

// Minimal v1: no session resume, no remote execution targets, no skill
// staging. thClaws is invoked non-interactively (`--print`) once per run;
// full stdout is captured as the reply. See paperclip's in-tree
// packages/adapters/grok-local for the fuller-featured shape this can grow
// toward (session resume, remote targets, skill staging).
//
// Deliberately NOT built against the retired @thclaws/paperclip-adapter —
// that package was tied to thCompany.ai, a separate commercial product that
// was discontinued (see thClaws CHANGELOG.md v0.110.0). This adapter only
// depends on thClaws' generic OpenAI-compatible surface
// (OPENAI_COMPAT_BASE_URL / OPENAI_COMPAT_API_KEY), which survives that
// retirement unaffected.

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog, onMeta, onSpawn, authToken } = ctx;

  const command = asString(config.command, "thclaws");
  const model = asString(config.model, "").trim();
  const cwd = asString(config.cwd, process.cwd());
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }
  env.PAPERCLIP_RUN_ID = runId;
  if (authToken) env.PAPERCLIP_API_KEY = authToken;

  const baseUrl = asString(config.baseUrl, "").trim();
  const apiKey = asString(config.apiKey, "").trim();
  if (baseUrl) env.OPENAI_COMPAT_BASE_URL = baseUrl;
  if (apiKey) env.OPENAI_COMPAT_API_KEY = apiKey;

  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  // No session resume in v1, so this is always a fresh session — the wake
  // prompt always carries the full execution contract (see
  // renderPaperclipWakePrompt's resumedSession doc comment).
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: false });
  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  const prompt = joinPromptSections([wakePrompt, renderedPrompt]);

  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 15);

  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  const resolvedCommand = await resolveCommandForLogs(command, cwd, runtimeEnv);
  const loggedEnv = buildInvocationEnvForLogs(env, {
    runtimeEnv,
    includeRuntimeKeys: ["HOME"],
    resolvedCommand,
  });

  const args = ["-p", "--accept-all"];
  if (model) args.push("-m", model.startsWith("oai/") ? model : `oai/${model}`);
  args.push(prompt);

  if (onMeta) {
    await onMeta({
      adapterType: "thclaws_local",
      command: resolvedCommand,
      cwd,
      commandArgs: [...args.slice(0, -1), `<prompt ${prompt.length} chars>`],
      commandNotes: ["Prompt is passed to thclaws as a trailing positional argument with --print --accept-all for unattended execution."],
      env: loggedEnv,
      prompt,
    });
  }

  const proc = await runChildProcess(runId, command, args, {
    cwd,
    env,
    timeoutSec,
    graceSec,
    onLog,
    onSpawn,
  });

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Timed out after ${timeoutSec}s`,
    };
  }

  const failed = (proc.exitCode ?? 0) !== 0;
  const stdout = proc.stdout ?? "";
  const stderr = proc.stderr ?? "";
  const firstErrorLine = stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    errorMessage: failed ? (firstErrorLine || `thclaws exited with code ${proc.exitCode ?? -1}`) : null,
    model: model || null,
    provider: "thclaws",
    biller: "thclaws",
    summary: failed ? null : stdout.trim(),
    resultJson: {
      stdout,
      stderr,
    },
  };
}
