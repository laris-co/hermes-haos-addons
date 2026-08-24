# Hermes Gateway (lite) — details

## Why this add-on exists, and why it is NOT the recommended default

This is the "lite" sibling of [`hermes-gateway`](../hermes-gateway/),
which wraps upstream's published Docker image unmodified. This add-on
instead builds `pip install -e` from a pinned upstream git commit with
no extras — no Playwright, no npm frontend build, no
matrix/anthropic/bedrock/azure-identity/hindsight/otlp Python extras.

**The honest history, because the numbers that motivated this add-on
changed three times, not twice:**

1. It was originally built because a specific 2048 MB HAOS guest target
   (no `<maxMemory>` stanza in its libvirt XML — RAM couldn't be raised
   without an XML edit and a cold boot) had only ~1 GB free after HA core
   and other add-ons, and the full wrapped image was reported at **3.93
   GB** — measured via `docker images`' list view on an arm64 Mac, which
   double-counts shared base layers per tag. Wrong.
2. Re-measured on the *same arm64 Mac*, cross-arch, with `docker image
   inspect --format '{{.Size}}'` instead: ~908 MiB. **Also wrong** — on
   an arm64 host, an amd64 image built/pulled under QEMU/Rosetta
   emulation is only partially materialized, so `docker images`, `docker
   image inspect`, and `docker save` disagree with each other and with
   reality there. The more "precise-sounding" metric doesn't fix a
   measurement taken on an emulated image. Separately, that specific
   guest target turned out not to be the right target at all — the
   project ended up running Hermes as a plain Docker container on
   different hardware, because Hermes' code-exec backend spawns nested
   Docker containers and Supervisor add-ons don't get `docker.sock` by
   default, so the sandboxed backend can't work under HAOS regardless of
   image size.
3. Measured a third time on **black.local, a native amd64 host**: all
   three tools agree there. Full wrapped image: **~2.68 GB**
   (2,678,364,779 bytes). This add-on's own image, built natively from
   this exact Dockerfile: **~659 MB** (658,577,529 bytes via `docker
   image inspect`, 684,941,312 via `docker save`, 659 MB via `docker
   images` — all agreeing). Real ratio: **~4.07x**.

**So: the size gap this add-on buys (~2.68 GB → ~659 MB) is real, and it
comes with a real cost — `TERMINAL_ENV=local`, no sandbox, a from-source
build instead of upstream's own tested distribution channel.**
`hermes-gateway` (no "lite" suffix) is the recommended default for most
people — if anything the correctness argument for it gets *stronger*
once the real 2.68 GB figure is in view, since ~2 GB of extra disk on
modern hardware is a smaller cost than trading away the sandboxed
code-exec backend and the official distribution channel. This add-on is
kept, documented, and fully verified for the case where the size
difference genuinely matters — not deleted, per this fleet's own
"nothing is deleted" rule, and not hidden behind an inflated OR deflated
number either.

It's a from-scratch Dockerfile: `pip install -e` from a pinned upstream
git commit, no extras, no Node, no Playwright, no s6-overlay.

## What this wraps

Pinned commit: `d1afa16053a3777849c2b5465d59a0147b2172f9`
(`https://github.com/nousresearch/hermes-agent`, `origin/main` as of
2026-08-02 — confirmed reachable via `git fetch --depth 1 origin
<sha>`, not a local-only commit). `pyproject.toml` at that commit
declares `version = "0.19.1"`; PyPI's latest published release at the
time of writing was `0.19.0` — these are two different release trains
(PyPI SemVer vs. the repo's own CalVer git tags for Docker/installer
releases), so this add-on builds from git source directly rather than
mixing a PyPI wheel with a different-vintage git checkout for the
frontend (see hermes-agent-lite/DOCS.md, which actually needs both halves
to agree).

Base image: `python:3.13-slim-trixie`. `pip install -e /opt/hermes-src`
(editable — **required**, not a style choice: upstream's `setup.py`
deliberately raises `RuntimeError: Building wheels or sdists for
hermes-agent is not supported` for a normal build, explicitly pointing
at `uv pip install -e .` as the sanctioned from-source path — confirmed
by hitting that exact error on the first build attempt). Editable
installs are a path pointer, not a copy, which is why `/opt/hermes-src`
stays in the final image instead of being deleted after install like a
normal build artifact would be.

No extras were needed — a completely bare `pip install -e .` was enough
for `gateway run` to boot cleanly with zero `ImportError`s. Confirmed
from `pyproject.toml` directly:

- `fastapi`, `uvicorn[standard]`, `python-multipart` are **unconditional
  core dependencies** (`[project.dependencies]`), not gated behind the
  `web` extra — so the optional API server needs nothing extra either.
- `croniter` is core (the `cron` extra is kept only for back-compat,
  per its own comment: "croniter is now a core dependency").
- `messaging` (telegram/discord/slack SDKs), `matrix`, `anthropic`,
  `bedrock`, `azure-identity`, `hindsight`, `otlp` were all deliberately
  dropped from the `[all]` extra on 2026-05-12, per the comment right
  above that extra: *"Anything an opt-in backend ... needs MUST live
  exclusively in `LAZY_DEPS` and resolve at first use — otherwise one
  quarantined PyPI release breaks every fresh install."* `tools/
  lazy_deps.py:206-223` confirms `platform.telegram` / `platform.discord`
  / `platform.slack` are all registered there.

This add-on does **not** set `HERMES_DISABLE_LAZY_INSTALLS` (upstream's
own Docker image sets it to `1`, since everything is pre-baked there).
Leaving it unset is what makes the lazy-install mechanism work — proven
below, not assumed.

## No custom SQLite build (and why that's fine)

v1 didn't touch this either, but it's worth stating explicitly since the
upstream Dockerfile spends a whole build stage compiling a patched
SQLite (Debian trixie's bundled 3.46.1 has the WAL-reset corruption bug,
sqlite.org/wal.html#walresetbug). This add-on's base image
(`python:3.13-slim-trixie`) has the same vulnerable libsqlite3, and this
add-on does **not** patch it. Verified this is a non-issue in practice:
hermes's own runtime detects the vulnerable version and falls back to
`journal_mode=DELETE` instead of WAL, with a one-time warning per
database — real log line from a running container:

```
WARNING hermes_state: state.db (delivery_ledger): linked SQLite 3.46.1
is vulnerable to the WAL-reset corruption bug ... — using
journal_mode=DELETE instead of enabling WAL. Upgrade to SQLite 3.51.3+
... Hermes-managed installs can repair the embedded runtime with
`hermes update`. See `hermes doctor`.
```

DELETE-mode SQLite is slower under concurrent access than WAL, but it is
not vulnerable to the same corruption bug, and a single-tenant home-lab
gateway's delivery ledger is not high-concurrency. This is a real,
accepted tradeoff (documented, not hidden) rather than a silent risk —
skipping the ~30-60s SQLite compile stage in exchange for a self-mitigated
correctness path.

## TERMINAL_ENV=local — the real tradeoff

Set explicitly in the Dockerfile. Upstream's default code-exec sandbox
runs agent shell commands inside a **nested Docker container**
(`TERMINAL_ENV=docker`), and upstream's own docs default
`TERMINAL_CONTAINER_MEMORY=5120` MB for that sandbox — more RAM than
this entire guest has, let alone the ~1 GB free for add-ons. HAOS add-on
containers also don't get `docker.sock` by default, so that backend
would be broken here regardless of memory.

`TERMINAL_ENV=local` means the agent's shell/code-exec tool runs
commands **directly in this container**, as whatever user the process
runs as (root — see below). This is a real security downgrade: a
successful prompt-injection or a buggy tool call that runs a destructive
shell command runs with the same privileges as the gateway process
itself, with no container-boundary isolation between "the agent's
sandbox" and "the add-on's own filesystem." Mitigations that do exist:
`/opt/hermes-src` (the installed package) is not the only writable
thing, but `/data` (where all state lives) is the main persistent
surface at risk, and this is no worse than what most non-sandboxed
"AI agent with shell access" setups already accept — it is not being
hidden, and it is the direct, necessary consequence of the memory
budget, not an oversight.

## Root, not upstream's UID 10000

Upstream's image creates a dedicated `hermes` user (UID 10000) and does
a whole UID/GID-remap dance (`HERMES_UID`/`HERMES_GID`, `stage2-hook.sh`)
so a bind-mounted host directory keeps host-matching ownership. This
add-on doesn't replicate any of that — the process just runs as root,
and `/data` is Supervisor's own per-add-on volume (not a host bind-mount
a human also touches directly), so there's no cross-UID ownership
problem to solve in the first place. This is a deliberate simplification
for a from-scratch, single-tenant add-on image, not an oversight of
upstream's design — noted here so it's a documented choice rather than
a silent deviation.

## Option → env var mapping

Same as v1 (run.sh's translation logic is unchanged except for what it
hands off to at the end — `exec hermes "$@"` instead of an upstream
entrypoint script that no longer exists in this image):

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
| `api_server_enabled: true` | `API_SERVER_ENABLED=true`, `API_SERVER_HOST=0.0.0.0`, `API_SERVER_PORT=8642` |
| `api_server_key` | `API_SERVER_KEY` |
| `max_iterations` (0 = unset) | `HERMES_MAX_ITERATIONS` (hermes default: 500) |
| `agent_timeout_seconds` (0 = unset) | `HERMES_AGENT_TIMEOUT` (hermes default: 1800s) |
| `agent_timeout_warning_seconds` (0 = unset) | `HERMES_AGENT_TIMEOUT_WARNING` (hermes default: 900s) |
| `session_stall_timeout_seconds` (0 = unset) | `HERMES_SESSION_STALL_TIMEOUT` (hermes default: 300s) |
| `restart_drain_timeout_seconds` (0 = unset) | `HERMES_RESTART_DRAIN_TIMEOUT` (hermes has its own internal default) |
| `extra_env: ["KEY=VALUE", ...]` | each pair exported as-is, after re-validating shape |

Defaults per `gateway/run.py` (`HERMES_MAX_ITERATIONS`,
`HERMES_AGENT_TIMEOUT`, `HERMES_AGENT_TIMEOUT_WARNING`,
`HERMES_SESSION_STALL_TIMEOUT`) and `gateway/run.py:8182`
(`HERMES_RESTART_DRAIN_TIMEOUT`, internal constant).

## What's exposed in `schema` vs. left as `extra_env`

Upstream's actual messaging surface is larger than
Telegram/Discord/Slack: `plugins/platforms/` also has `signal`
(`SIGNAL_REQUIRE_MENTION`), `yuanbao`, `matrix`, `whatsapp`, `email`,
`teams`, `google_chat`, `feishu`, `dingtalk`, `wecom`, `line`,
`mattermost`, `irc`, `simplex`, `sms`, plus a cross-instance relay
(`GATEWAY_RELAY_ID`/`_SECRET`/`_DELIVERY_KEY`) and
`HERMES_KANBAN_BOARD`. Deliberately **not** turned into schema fields —
a 40-key schema nobody fills in correctly is worse than a working 12-key
one. Anything not listed above is configurable via `extra_env`
(`KEY=VALUE` pairs) using upstream's own documented env var names (see
`.env.example` in the source repo).

## Verification log (2026-08-24)

Build host: this Mac is **arm64** (Apple Silicon) — corrected after v1's
report mistakenly implied an amd64 build host. The actual deployment
target (the HAOS guest) is amd64, per the original brief. Both
architectures below were built with explicit `--platform` flags and
run-tested; the amd64 run is under QEMU emulation on this arm64 host
(functionally faithful; not a performance benchmark).

### 1. Both archs build and boot

```
$ docker buildx build --platform linux/amd64 -t local/hermes-gateway-amd64:2.0.0 --load .
$ docker buildx build --platform linux/arm64 -t local/hermes-gateway-arm64:2.0.0 --load .
$ docker image inspect local/hermes-gateway-amd64:2.0.0 --format '{{.Size}} {{.Architecture}}'
259604872 amd64
$ docker image inspect local/hermes-gateway-arm64:2.0.0 --format '{{.Size}} {{.Architecture}}'
258453794 arm64
```
These two numbers (measured on this arm64 Mac) are **known-unreliable
for the amd64 figure** — see below — and the arm64 figure, while native
to this host, has not been independently cross-checked with a second
measurement tool the way the amd64 one was, so it should also be
treated as approximate rather than confirmed.

**The trustworthy number**: re-measured on **black.local, a native
amd64 host**, where `docker images`, `docker image inspect`, and `docker
save` all agree: **~659 MB** (658,577,529 bytes / 684,941,312 bytes via
`docker save`). Compared against `hermes-gateway`'s (the full,
wrapped-image variant) equally natively-measured **~2.68 GB**
(2,678,364,779 bytes): a real **~4.07x** reduction — smaller than the
original (wrong) ~3.93 GB premise implied a gap could be, but this
add-on's actual boot/functional behavior (below) was still validated
correctly on this Mac; only the *size* numbers from this host are
unreliable, because an amd64 image on an arm64 host under QEMU/Rosetta
is only partially materialized, so none of `docker images`, `docker
image inspect`, or `docker save` agree with each other or with reality
there. Measure image size on a native host of the target arch, or not
at all.

### 2. Boots clean with zero config, on both archs

```
$ echo '{}' > options.json
$ docker run -d --platform linux/amd64 -v .../data:/data local/hermes-gateway-amd64:2.0.0
$ docker logs <container>
┌─────────────────────────────────────────────────────────┐
│           ⚕ Hermes Gateway Starting...                 │
└─────────────────────────────────────────────────────────┘
WARNING gateway.run: No env user allowlists configured. ...
WARNING gateway.run: No messaging platforms enabled.
```
Container stayed `Up`.

### 3. Idle memory (amd64, target arch, via QEMU)

```
$ docker stats <container> --no-stream --format '{{.MemUsage}}'
105.6MiB / 7.748GiB
$ docker exec <container> sh -c 'grep VmRSS /proc/1/status'   # PID 1 = hermes itself
VmRSS:  125932 kB
```
~106 MiB container memory, ~126 MB process RSS at idle, measured after
30+ seconds of uptime (not a cold-start snapshot) — **under QEMU
emulation on the arm64 Mac, not native amd64; treat as directional, not
precise.** For comparison, `hermes-gateway` (the full, wrapped-image
variant) measured ~196 MiB container memory / ~184 MB process RSS under
the same (also emulated) test. The number that actually matters: a real
Supervisor install of `hermes-gateway` on a live HAOS guest (catlab)
measured **134.5 MiB resident** — this add-on (`hermes-gateway-lite`)
has not been installed on a live Supervisor, so there's no equivalently
trustworthy idle-memory figure for it yet. Both variants are comfortably
small in absolute terms on any reasonably modern host; this add-on
exists for the case where the (real, ~4.07x) disk-size gap matters
(genuinely constrained hardware), not because the full variant is
impractical.

### 4. `api_server_enabled` without a key still fails loud

```
$ echo '{"api_server_enabled": true, "api_server_key": ""}' > options.json
$ docker run ...
[hermes-gateway] ERROR: api_server_enabled is true but api_server_key is empty.
$ docker inspect <container> --format '{{.State.ExitCode}}'
1
```

### 5. Lazy-install proof — not just "env var is set," the real package lands on disk

```
$ echo '{"telegram_bot_token": "123:ABC-fake-token"}' > options.json
$ docker run -d -v .../data:/data local/hermes-gateway-amd64:2.0.0
$ docker logs <container> | grep -i telegram
WARNING hermes_plugins.telegram_platform.adapter: [Telegram] Connecting to Telegram (attempt 1/8)…
ERROR   hermes_plugins.telegram_platform.adapter: [Telegram] Failed to connect to Telegram: The token `123:ABC-fake-token` was rejected by the server.
$ ls .../data/lazy-packages
telegram/  python_telegram_bot-22.6.dist-info/  httpx/  anyio/  h11/  ...
```
`python-telegram-bot` was never baked into the image — this is it being
installed for real, at runtime, into the persistent `/data/lazy-packages`
directory, on first actual connection attempt. This is the mechanism the
whole minimal-profile design depends on, and it's verified working
end-to-end, not just plausible from reading the source.

### 6. Malformed `extra_env` entries still rejected, not silently dropped

```
$ echo '{"extra_env": ["MY_CUSTOM_VAR=hello", "bad entry no equals", "9bad=nope"]}' > options.json
$ docker logs <container> | grep WARNING
[hermes-gateway] WARNING: ignoring malformed extra_env entry: bad entry no equals
[hermes-gateway] WARNING: ignoring malformed extra_env entry: 9bad=nope
```

### 7. New tunables actually reach the process

```
$ echo '{"max_iterations": 42, "session_stall_timeout_seconds": 111}' > options.json
$ docker exec <container> sh -c 'tr "\0" "\n" < /proc/1/environ | grep HERMES_'
HERMES_MAX_ITERATIONS=42
HERMES_SESSION_STALL_TIMEOUT=111
```
(`agent_timeout_seconds: 0` in the same test correctly did NOT export
`HERMES_AGENT_TIMEOUT` — confirms the "0 = leave unset" convention
works.)

## Not verified

- No real Telegram/Discord/Slack/WhatsApp bot token (deliberately fake,
  to prove delivery without live credentials).
- No live HAOS Supervisor install — plain `docker build`/`docker run`
  only, per the task's constraint not to touch the live guest.
- Long-running memory behavior (hours/days of uptime, many messages,
  many cron runs). Only idle-after-30s was measured.
- The lazy-install mechanism requires outbound network access to PyPI
  from the container at first-use time. If this guest's add-ons run
  behind an egress restriction, that first connection attempt would need
  to be allowed through (a one-time cost per platform actually enabled,
  cached in `/data/lazy-packages` afterward).
