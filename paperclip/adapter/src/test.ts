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
  const cwd = asString(config.cwd, process.cwd());
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

  try {
    await ensureAbsoluteDirectory(cwd);
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
