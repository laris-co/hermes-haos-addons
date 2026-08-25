import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "./types.js";
import {
  asString,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
} from "@paperclipai/adapter-utils/server-utils";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "thclaws");
  const configuredCwd = asString(config.cwd, "").trim();
  const paperclipHome = (process.env.PAPERCLIP_HOME ?? "").trim();
  const cwd = path.resolve(
    configuredCwd ||
    (paperclipHome ? path.join(paperclipHome, "thclaws-workspaces", ctx.companyId, ".environment-test") : process.cwd()),
  );
  const baseUrl = asString(config.baseUrl, "").trim();
  const apiKey = asString(config.apiKey, "").trim();

  if (!baseUrl) {
    checks.push({
      code: "thclaws_base_url_missing",
      level: "error",
      message: "thClaws adapter requires baseUrl (sets OPENAI_COMPAT_BASE_URL).",
      hint: "Point this at your gateway's OpenAI-compatible endpoint, e.g. http://192.168.1.185:20128/v1.",
    });
  } else {
    checks.push({
      code: "thclaws_base_url_present",
      level: "info",
      message: `Configured base URL: ${baseUrl}`,
    });
  }

  if (!apiKey) {
    checks.push({
      code: "thclaws_api_key_missing",
      level: "warn",
      message: "No apiKey configured (sets OPENAI_COMPAT_API_KEY). Some gateways require this.",
    });
  } else {
    checks.push({
      code: "thclaws_api_key_present",
      level: "info",
      message: "API key configured.",
    });
  }

  if (baseUrl) {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        checks.push({
          code: response.status === 401 || response.status === 403
            ? "thclaws_gateway_auth_failed"
            : "thclaws_gateway_probe_failed",
          level: "error",
          message: `Gateway model probe failed with HTTP ${response.status}.`,
          hint: response.status === 401 || response.status === 403
            ? "Set the agent's apiKey to a key authorized by this gateway."
            : "Verify the base URL and gateway health.",
        });
      } else {
        const payload = await response.json() as { data?: unknown[] };
        checks.push({
          code: "thclaws_gateway_ready",
          level: "info",
          message: `Gateway authentication succeeded; ${Array.isArray(payload.data) ? payload.data.length : 0} model(s) reported.`,
        });
      }
    } catch (error) {
      checks.push({
        code: "thclaws_gateway_unreachable",
        level: "error",
        message: "Could not reach the configured OpenAI-compatible gateway.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    await fs.access(cwd, fsConstants.W_OK);
    checks.push({
      code: "thclaws_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "thclaws_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const runtimeEnv = ensurePathInEnv({ ...process.env });
  try {
    await ensureCommandResolvable(command, cwd, runtimeEnv);
    checks.push({
      code: "thclaws_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "thclaws_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
