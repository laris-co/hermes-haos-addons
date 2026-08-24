# Hermes Gateway — details

## What this wraps

`FROM nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495`
(Docker Hub `:latest` as of 2026-08-24, revision label
`057dcdf236f8a6a26721c10fcc6ccb72726e272a`), unmodified, plus:

- `run.sh` — reads `/data/options.json`, exports the matching env vars,
  then `exec`s `/opt/hermes/docker/entrypoint-dispatch.sh gateway run`.
- `HERMES_HOME=/data` / `HERMES_WRITE_SAFE_ROOT=/data` — redirects
  hermes's state directory onto Supervisor's persistent per-add-on volume.

Nothing else is changed. `init: false` is set because the base image
already runs its own s6-overlay supervision tree as PID 1 (see upstream's
`docker/entrypoint-dispatch.sh` / `docker/main-wrapper.sh`) — layering
Supervisor's own tini-style init on top would fight it.

## Option → env var mapping

| Option | Env var |
|---|---|
| `openrouter_api_key` | `OPENROUTER_API_KEY` |
| `telegram_bot_token` | `TELEGRAM_BOT_TOKEN` |
| `telegram_allowed_users` | `TELEGRAM_ALLOWED_USERS` |
| `discord_bot_token` | `DISCORD_BOT_TOKEN` |
| `discord_allowed_users` | `DISCORD_ALLOWED_USERS` |
| `slack_bot_token` | `SLACK_BOT_TOKEN` |
| `slack_app_token` | `SLACK_APP_TOKEN` |
| `slack_allowed_users` | `SLACK_ALLOWED_USERS` |
| `gateway_allow_all_users: true` | `GATEWAY_ALLOW_ALL_USERS=true` |
| `api_server_enabled: true` | `API_SERVER_ENABLED=true`, `API_SERVER_HOST=0.0.0.0`, `API_SERVER_PORT=8642` (fixed to match the declared container port) |
| `api_server_key` | `API_SERVER_KEY` |
| `extra_env: ["KEY=VALUE", ...]` | each pair exported as-is, after re-validating the `KEY=VALUE` shape (schema already constrains it with `match(^[A-Za-z_][A-Za-z0-9_]*=.*$)`, re-checked in `run.sh` since this is the one place a malformed entry could otherwise leak into the process environment) |

Only non-empty values are exported — an unset option never overwrites a
hermes default with an empty string.

## Why no required options

Verified: `hermes gateway run` starts cleanly with a completely empty
`{}` options.json — no platform configured, no model provider configured.
It logs a warning about no allowlists and keeps running (the cron
scheduler and gateway supervisor both come up). That's why every option
here is optional with a safe empty/`false` default — there's no
"Advanced-SSH-empty-required-password" failure mode possible for this
add-on because nothing is actually required to reach a running state.

## Verification log (2026-08-24, Docker Desktop 29.6.2 on macOS, amd64 host)

All commands run for real; output trimmed to the relevant lines.

### 1. Base image is real and multi-arch

```
$ docker pull nousresearch/hermes-agent:latest
Digest: sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495
Status: Downloaded newer image for nousresearch/hermes-agent:latest

$ docker manifest inspect nousresearch/hermes-agent:latest
  "architecture": "arm64", "os": "linux"
  "architecture": "amd64", "os": "linux"
```

Cross-checked against `nousresearch/hermes-agent/.github/workflows/docker.yml`:
the build matrix is `arch: amd64 -> runner: ubuntu-latest` and
`arch: arm64 -> runner: ubuntu-24.04-arm` — both native runners, no qemu.

### 2. `docker build` — both add-ons, both claimed archs

```
$ docker build -t local/hermes-gateway-amd64:1.0.0 .          # ~0.5s (cached FROM)
$ docker buildx build --platform linux/arm64 \
    -t local/hermes-gateway-aarch64:1.0.0 --load .            # succeeds
$ docker image inspect local/hermes-gateway-aarch64:1.0.0 --format '{{.Architecture}}'
arm64
$ docker run --rm --platform linux/arm64 local/hermes-gateway-aarch64:1.0.0 \
    sh -c 'uname -m'                                          # boots and runs under QEMU
```

### 3. Starts clean with zero config

```
$ echo '{}' > /data/options.json   # (simulated Supervisor mount)
$ docker run -d -v .../data:/data local/hermes-gateway-amd64:1.0.0
$ docker logs <container>
...
┌─────────────────────────────────────────────────────────┐
│           ⚕ Hermes Gateway Starting...                 │
├─────────────────────────────────────────────────────────┤
│  Messaging platforms + cron scheduler                    │
│  Press Ctrl+C to stop                                   │
└─────────────────────────────────────────────────────────┘
WARNING gateway.run: No env user allowlists configured. ...
```
Container stayed `Up` — no crash loop.

### 4. `api_server_enabled` without a key fails loud, not silent

```
$ echo '{"api_server_enabled": true, "api_server_key": ""}' > options.json
$ docker run --name gw-test2 -v .../data:/data local/hermes-gateway-amd64:1.0.0
[hermes-gateway] ERROR: api_server_enabled is true but api_server_key is empty.
[hermes-gateway] Set api_server_key in this add-on's Configuration tab, or turn api_server_enabled back off.
$ docker inspect gw-test2 --format '{{.State.ExitCode}}'
1
```

### 5. A real token genuinely reaches the running process

```
$ echo '{"telegram_bot_token": "123:ABC-fake-token", "extra_env": ["MY_CUSTOM_VAR=hello"]}' > options.json
$ docker run -d --name gw-test4 -v .../data:/data local/hermes-gateway-amd64:1.0.0
$ docker exec gw-test4 ps -ef | grep hermes
hermes   158  ...  /opt/hermes/.venv/bin/python3 /opt/hermes/.venv/bin/hermes gateway run --replace
$ docker exec --user root gw-test4 sh -c 'tr "\0" "\n" < /proc/157/environ | grep -E "TELEGRAM_BOT_TOKEN|MY_CUSTOM_VAR"'
TELEGRAM_BOT_TOKEN=123:ABC-fake-token
MY_CUSTOM_VAR=hello
$ docker logs gw-test4 | grep -i telegram
WARNING hermes_plugins.telegram_platform.adapter: [Telegram] Connecting to Telegram (attempt 1/8)…
ERROR   hermes_plugins.telegram_platform.adapter: [Telegram] Failed to connect to Telegram: The token `123:ABC-fake-token` was rejected by the server.
```
The gateway genuinely tried to use the fake token against Telegram's real
API and was genuinely rejected — full round trip through
`options.json → run.sh → env → s6 with-contenv → hermes process`, not
just an "env var got set" check.

### 6. Malformed `extra_env` entries are rejected, not silently dropped

```
$ echo '{"extra_env": ["MY_CUSTOM_VAR=hello", "bad entry no equals", "1BADSTART=nope"]}' > options.json
$ docker logs gw-test3 | grep WARNING
[hermes-gateway] WARNING: ignoring malformed extra_env entry: bad entry no equals
[hermes-gateway] WARNING: ignoring malformed extra_env entry: 1BADSTART=nope
```

## Not verified

- No real Telegram/Discord/Slack/WhatsApp bot token was used (only a
  deliberately fake Telegram token, to prove delivery without needing
  live credentials).
- No live HAOS Supervisor install — this is `docker build`/`docker run`
  only, per the task's constraint not to touch the live guest.
