import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AdapterExecutionContext } from "./types.js";
import { execute } from "./execute.js";
import { sessionCodec } from "./session.js";
import { testEnvironment } from "./test.js";

function executionContext(
  cwd: string,
  command: string,
  env: Record<string, string>,
  runtime: AdapterExecutionContext["runtime"],
): AdapterExecutionContext {
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Workflow Agent",
      adapterType: "thclaws_local",
      adapterConfig: {},
    },
    runtime,
    config: {
      command,
      cwd,
      baseUrl: "http://router.example/v1",
      apiKey: "test-key",
      model: "glm/glm-5.3",
      promptTemplate: "Work for {{agent.name}}",
      env,
    },
    context: {},
    onLog: async () => {},
  };
}

test("session codec preserves task-scoped thClaws identity", () => {
  const decoded = sessionCodec.deserialize({
    session_id: "session-123",
    workdir: "/workspace",
    model: "glm/glm-5.3",
  });
  assert.deepEqual(decoded, {
    sessionId: "session-123",
    cwd: "/workspace",
    model: "glm/glm-5.3",
  });
  assert.equal(sessionCodec.getDisplayId?.(decoded), "session-123");
});

test("execute captures a fresh session and resumes it on the next heartbeat", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "thclaws-paperclip-test-"));
  try {
    const command = path.join(tmp, "fake-thclaws");
    const argsFile = path.join(tmp, "args.bin");
    const envFile = path.join(tmp, "env.txt");
    await fs.writeFile(command, `#!/bin/sh
printf '%s\\0' "$@" > "$CAPTURE_ARGS"
printf '%s\\n%s\\n' "$OPENAI_COMPAT_BASE_URL" "$OPENAI_COMPAT_API_KEY" > "$CAPTURE_ENV"
last=''
for arg in "$@"; do last="$arg"; done
printf 'answer:%s\\n' "$last"
printf '[session] saved session-123\\n' >&2
`);
    await fs.chmod(command, 0o755);
    const env = { CAPTURE_ARGS: argsFile, CAPTURE_ENV: envFile };

    const first = await execute(executionContext(tmp, command, env, {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: "task-1",
    }));
    assert.equal(first.exitCode, 0);
    assert.equal(first.sessionId, "session-123");
    assert.deepEqual(first.sessionParams, {
      sessionId: "session-123",
      cwd: tmp,
      model: "glm/glm-5.3",
    });
    assert.match(first.summary ?? "", /Work for Workflow Agent/);
    assert.deepEqual((await fs.readFile(envFile, "utf8")).trim().split("\n"), [
      "http://router.example/v1",
      "test-key",
    ]);

    const second = await execute(executionContext(tmp, command, env, {
      sessionId: "session-123",
      sessionParams: { sessionId: "session-123", cwd: tmp, model: "glm/glm-5.3" },
      sessionDisplayId: "session-123",
      taskKey: "task-1",
    }));
    assert.equal(second.exitCode, 0);
    const args = (await fs.readFile(argsFile)).toString().split("\0").filter(Boolean);
    assert.deepEqual(args.slice(0, 7), [
      "-p",
      "--accept-all",
      "-m",
      "oai/glm/glm-5.3",
      "--resume",
      "session-123",
      "Work for Workflow Agent",
    ]);
    assert.equal((second.resultJson as Record<string, unknown>).resumedSession, true);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("execute uses Paperclip's writable agent workspace when cwd is not configured", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "thclaws-paperclip-workspace-test-"));
  try {
    const command = path.join(tmp, "fake-thclaws");
    const pwdFile = path.join(tmp, "pwd.txt");
    const workspace = path.join(tmp, "agent-home");
    await fs.mkdir(workspace);
    await fs.writeFile(command, `#!/bin/sh
pwd > "$CAPTURE_PWD"
printf 'ok\\n'
printf '[session] saved workspace-session\\n' >&2
`);
    await fs.chmod(command, 0o755);
    const ctx = executionContext(tmp, command, { CAPTURE_PWD: pwdFile }, {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    });
    delete ctx.config.cwd;
    ctx.context.paperclipWorkspace = { source: "agent_home", agentHome: workspace };
    const result = await execute(ctx);
    assert.equal(result.sessionId, "workspace-session");
    assert.equal(
      await fs.realpath((await fs.readFile(pwdFile, "utf8")).trim()),
      await fs.realpath(workspace),
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("environment check proves gateway authentication instead of only checking fields", async () => {
  const server = http.createServer((request, response) => {
    if (request.url !== "/v1/models") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== "Bearer live-key") {
      response.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end('{"data":[{"id":"glm/glm-5.3"}]}');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    const ok = await testEnvironment({
      companyId: "company-1",
      adapterType: "thclaws_local",
      config: { baseUrl, apiKey: "live-key", command: process.execPath, cwd: process.cwd() },
    });
    assert.equal(ok.status, "pass");
    assert.ok(ok.checks.some((check) => check.code === "thclaws_gateway_ready"));

    const denied = await testEnvironment({
      companyId: "company-1",
      adapterType: "thclaws_local",
      config: { baseUrl, command: process.execPath, cwd: process.cwd() },
    });
    assert.equal(denied.status, "fail");
    assert.ok(denied.checks.some((check) => check.code === "thclaws_gateway_auth_failed"));
  } finally {
    server.close();
    await once(server, "close");
  }
});
