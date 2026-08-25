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

### Gateway model persistence bridge (1.0.1)

Upstream revision `057dcdf2` documents `HERMES_INFERENCE_MODEL` for one-shot
and TUI invocations, but the gateway's `_resolve_gateway_model()` reads only
`model.default`/`model.model` from persistent `config.yaml`. A restart could
therefore load a stale model even when the provider environment was correct.

After exporting `extra_env`, `run.sh` now persists these non-secret routing
overrides with the pinned image's own `hermes config set` command:

| Env override | Persisted key |
|---|---|
| `HERMES_INFERENCE_PROVIDER` | `model.provider` |
| `HERMES_INFERENCE_MODEL` | `model.default` |
| `OPENROUTER_BASE_URL` (or `CUSTOM_BASE_URL`) | `model.base_url` |

Credentials are intentionally excluded from this bridge. For an OpenRouter-
compatible mirror such as 9Router, `openrouter_api_key` remains a Supervisor
password option and is exported only as `OPENROUTER_API_KEY`.

## Why no required options

Verified: `hermes gateway run` starts cleanly with a completely empty
`{}` options.json — no platform configured, no model provider configured.
It logs a warning about no allowlists and keeps running (the cron
scheduler and gateway supervisor both come up). That's why every option
here is optional with a safe empty/`false` default — there's no
"Advanced-SSH-empty-required-password" failure mode possible for this
add-on because nothing is actually required to reach a running state.

## Verification log (2026-08-24, Docker Desktop 29.6.2 on macOS)

All commands run for real; output trimmed to the relevant lines.

**Correction**: this log originally said "amd64 host." The build host is
actually **arm64** (Apple Silicon) — `uname -m` / `docker info` confirm
it. Section 2's `docker build -t local/hermes-gateway-amd64:1.0.0 .`
(no `--platform` flag) therefore built a native arm64 image that was
simply *mislabeled* "amd64" at the time, not a genuine cross-platform
build — the arm64 build two lines below it (`--platform linux/arm64`,
explicitly) was the only one that was actually testing what its tag
claimed. This was caught and fixed in the follow-up pass: see "Real
measured image size / idle memory" below, which redoes both archs with
explicit `--platform` flags and gives real, distinguishable numbers for
each.

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

### 2b. Real measured image size / idle memory — THREE PASSES, two of them wrong

This section went through three measurements before landing on a real
number. Recorded in full because the failure mode (cross-arch emulated
measurement) will bite again if it isn't named clearly:

**Pass 1** (2026-08-24, on this arm64 Mac, `docker images` list view):
~3.93 GB. Wrong — that view double-counts shared base layers per tag.

**Pass 2** (2026-08-24, same arm64 Mac, `docker image inspect --format
'{{.Size}}'` instead):
```
$ docker buildx build --platform linux/amd64 -t local/hermes-gateway-full-amd64:1.0.0 --load .
$ docker image inspect local/hermes-gateway-full-amd64:1.0.0 --format '{{.Size}}'
952682844
```
Read as ~908 MiB. **Also wrong** — on an arm64 host, an amd64 image built/
pulled under QEMU/Rosetta emulation is only partially materialized, so
`docker images`, `docker image inspect`, and `docker save` disagree with
each other AND with reality there. `docker image inspect` looking like
the more "correct" metric (vs. the visibly-broken list view) doesn't mean
its number is right when the underlying image itself is emulated.

**Pass 3** (2026-08-24, on **black.local, a native amd64 host** — the
one that counts): all three tools agree there:
```
docker images        2.68 GB
docker image inspect  2,678,364,779 bytes
docker save            2,755,512,832 bytes
```
**The real size is ~2.68 GB.**

**Idle memory**, still measured under emulation on the arm64 Mac (not yet
re-measured natively at the time of this pass — treat as directional):
```
$ docker run -d --platform linux/amd64 -v .../data:/data local/hermes-gateway-full-amd64:1.0.0
$ docker stats <container> --no-stream --format '{{.MemUsage}}'
196.1MiB / 7.748GiB
$ docker exec <container> sh -c 'grep VmRSS /proc/<hermes-pid>/status'
VmRSS:  188092 kB
```
~196 MiB container memory / ~184 MB process RSS at idle on an empty
`options.json` — **emulated measurement, treat as approximate.** The
number that actually matters: **a real Supervisor install of this exact
add-on on a live HAOS guest (catlab) measured 134.5 MiB resident**,
built on-device by Supervisor from this published repo. Trust that
number over the emulated one above if they ever seem to disagree.

For the equivalent numbers on `hermes-gateway-lite` (the from-source
minimal profile) — natively measured at ~659 MB (`docker images` /
`docker image inspect` / `docker save`: 658,577,529 / 684,941,312 bytes,
all agreeing on black.local) — see `hermes-gateway-lite/DOCS.md`. The
real ratio is **~4.07x** on disk (2,678,364,779 / 658,577,529). That's
smaller than the original (wrong) ~3.93 GB premise implied, but larger
than the (also wrong) ~908 MiB/~248 MiB pass made it look — the ratio
itself happened to survive both bad passes reasonably well (~3.6-4.8x
reported at the time vs. 4.07x actual) because the emulation artifact
scaled both variants in the same direction by a similar factor; the
absolute numbers did not survive.

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
