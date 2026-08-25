import fs from "node:fs/promises";
import path from "node:path";
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

// thClaws is invoked non-interactively (`--print`) once per run. Its persisted
// session id is reported on stderr as `[session] saved <id>`; Paperclip stores
// that id through sessionParams and supplies it on later heartbeats. This keeps
// a task's conversation coherent without sharing `last` across agents.
//
// Deliberately NOT built against the retired @thclaws/paperclip-adapter —
// that package was tied to thCompany.ai, a separate commercial product that
// was discontinued (see thClaws CHANGELOG.md v0.110.0). This adapter only
// depends on thClaws' generic OpenAI-compatible surface
// (OPENAI_COMPAT_BASE_URL / OPENAI_COMPAT_API_KEY), which survives that
// retirement unaffected.

function savedSessionId(stderr: string): string | null {
  const matches = [...stderr.matchAll(/^\[session\]\s+saved\s+(\S+)\s*$/gmu)];
  return matches.at(-1)?.[1] ?? null;
}

function lastMeaningfulError(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [...lines].reverse().find((line) => !line.startsWith("[session]")) ?? lines.at(-1) ?? "";
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;

  const command = asString(config.command, "thclaws");
  const model = asString(config.model, "").trim();
  const cwd = path.resolve(asString(config.cwd, process.cwd()));
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

  const runtimeSession = parseObject(runtime.sessionParams);
  const runtimeSessionId = asString(runtimeSession.sessionId, runtime.sessionId ?? "").trim();
  const runtimeSessionCwd = asString(runtimeSession.cwd, "").trim();
  const runtimeSessionModel = asString(runtimeSession.model, "").trim();
  const canResumeSession =
    runtimeSessionId.length > 0 &&
    (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === cwd) &&
    (runtimeSessionModel.length === 0 || runtimeSessionModel === model);

  if (runtimeSessionId && !canResumeSession) {
    await onLog(
      "stdout",
      `[paperclip] thClaws session "${runtimeSessionId}" does not match cwd/model; starting a fresh session.\n`,
    );
  }

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
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: canResumeSession });
  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  const handoffPrompt = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const instructionsPath = asString(config.instructionsFilePath, "").trim();
  let instructions = "";
  if (instructionsPath && !canResumeSession) {
    const resolvedInstructionsPath = path.resolve(cwd, instructionsPath);
    try {
      instructions = await fs.readFile(resolvedInstructionsPath, "utf8");
    } catch (error) {
      await onLog(
        "stderr",
        `[paperclip] Could not read thClaws instructions "${resolvedInstructionsPath}": ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  const prompt = canResumeSession && wakePrompt
    ? joinPromptSections([wakePrompt, handoffPrompt])
    : joinPromptSections([instructions, wakePrompt, handoffPrompt, renderedPrompt]);

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
  if (canResumeSession) args.push("--resume", runtimeSessionId);
  args.push(prompt);

  if (onMeta) {
    await onMeta({
      adapterType: "thclaws_local",
      command: resolvedCommand,
      cwd,
      commandArgs: [...args.slice(0, -1), `<prompt ${prompt.length} chars>`],
      commandNotes: [
        "Prompt is passed to thclaws as a trailing positional argument with --print --accept-all for unattended execution.",
        canResumeSession
          ? `Resuming the Paperclip task's thClaws session ${runtimeSessionId}.`
          : "Starting a fresh thClaws session; its saved id will be returned to Paperclip.",
      ],
      env: loggedEnv,
      prompt,
      promptMetrics: {
        promptChars: prompt.length,
        wakePromptChars: wakePrompt.length,
        instructionsChars: instructions.length,
        handoffChars: handoffPrompt.length,
      },
      context,
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
  const sessionId = savedSessionId(stderr) ?? (canResumeSession ? runtimeSessionId : null);
  const sessionParams = sessionId ? { sessionId, cwd, ...(model ? { model } : {}) } : null;
  const errorLine = lastMeaningfulError(stderr);

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    errorMessage: failed ? (errorLine || `thclaws exited with code ${proc.exitCode ?? -1}`) : null,
    sessionId,
    sessionParams,
    sessionDisplayId: sessionId,
    model: model || null,
    provider: "thclaws",
    biller: "thclaws",
    billingType: "unknown",
    summary: failed ? null : stdout.trim(),
    resultJson: {
      stdout,
      stderr,
      resumedSession: canResumeSession,
    },
  };
}
