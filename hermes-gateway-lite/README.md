# Hermes Gateway (lite)

> ⚠️ **Security tradeoff, read this first**: this build runs the agent's
> code-exec tool **directly inside this container** (`TERMINAL_ENV=local`),
> not inside upstream's sandboxed Docker-in-Docker backend. If the agent
> runs (or is tricked into running, e.g. via prompt injection from a
> message it receives) a destructive shell command, there is no
> container boundary between "the agent's sandbox" and this add-on's own
> filesystem/`/data`. This is the price of the ~250 MiB image size below —
> and that price buys less than it might sound: the full variant is
> ~908 MiB, not multiple gigabytes (see the repo README for the corrected
> measurement history). **Unless the size difference genuinely matters
> for your hardware, install [`hermes-gateway`](../hermes-gateway/) (no
> "lite" suffix) instead** — it wraps Nous Research's own published,
> tested Docker image, and is the recommended default. See
> [`DOCS.md`](DOCS.md) for the full writeup, not just this warning.

Runs [Hermes Agent](https://github.com/NousResearch/hermes-agent)'s
messaging gateway (`hermes gateway run`): Telegram, Discord, Slack,
WhatsApp, Email, the built-in cron scheduler, and (optionally) an
OpenAI-compatible API server for tools like Open WebUI.

This is the **lite** profile of one of two add-on pairs in this
repository — see the [repo README](../README.md) for the full picture:
`hermes-gateway` / `hermes-gateway-lite` (messaging) and `hermes-agent`
/ `hermes-agent-lite` (dashboard/chat).

**Minimal profile**: built fresh from pinned upstream source instead of
wrapping upstream's published Docker image — no Playwright, no Node, no
baked-in provider/messaging extras (they lazy-install on first real
use). Measured image size is **~250 MiB**, vs. the full `hermes-gateway`
add-on's **~908 MiB** (measured with `docker image inspect`, not the
inflated ~3.9 GB an earlier draft of this repo reported from `docker
images`' list view — see the repo README for the correction). See
[`DOCS.md`](DOCS.md) for the full reasoning and the real measured
numbers on both variants — this is a documented tradeoff, not a hidden
one.

## Quick start

1. Install and configure at least one messaging platform's token below
   (or none — the gateway starts and runs the cron scheduler either way,
   it just won't have anywhere to talk yet).
2. Start the add-on.
3. Check the log for `✓ <platform> connected` (or `✗ <platform> failed`
   if a token is wrong).

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `openrouter_api_key` | password | *(empty)* | Model provider — see hermes's own `hermes model`/`hermes setup` for other providers; this add-on only wires up the one env var, others can go through `extra_env`. |
| `telegram_bot_token` | password | *(empty)* | From [@BotFather](https://t.me/BotFather). |
| `telegram_allowed_users` | string | *(empty)* | Comma-separated Telegram user IDs. |
| `discord_bot_token` | password | *(empty)* | |
| `discord_allowed_users` | string | *(empty)* | |
| `slack_bot_token` | password | *(empty)* | `xoxb-...` |
| `slack_app_token` | password | *(empty)* | `xapp-...` (Socket Mode) |
| `slack_allowed_users` | string | *(empty)* | |
| `gateway_allow_all_users` | bool | `false` | Opt-in open access. Leave `false` unless you mean it. |
| `api_server_enabled` | bool | `false` | OpenAI-compatible endpoint on port `8642`. |
| `api_server_key` | password | *(empty)* | **Required if `api_server_enabled` is true** — the add-on refuses to start otherwise (checked before handing off to hermes, with a clear log line). |
| `max_iterations` | int | `0` (unset) | Caps agent tool-call turns per response. `0` = hermes's own default (500). |
| `agent_timeout_seconds` | int | `0` (unset) | `0` = hermes's own default (1800s / 30min). |
| `agent_timeout_warning_seconds` | int | `0` (unset) | `0` = hermes's own default (900s). |
| `session_stall_timeout_seconds` | int | `0` (unset) | `0` = hermes's own default (300s). |
| `restart_drain_timeout_seconds` | int | `0` (unset) | `0` = hermes's own default. |
| `extra_env` | list of `KEY=VALUE` | `[]` | Escape hatch for the many other integrations hermes supports (WhatsApp, Email, Matrix, Signal, Teams, Google Chat, other model providers — see upstream's `.env.example`) that don't have a dedicated option here yet. Malformed entries are logged and skipped, not silently dropped. |

## Ports

`8642/tcp` is declared but **unmapped by default** (`null`) — only relevant
if you turn on `api_server_enabled`. Map it to any host port other than
80/443 (Home Assistant owns those on this host) from the add-on's Network
page if you use it.

## Persistence

All gateway state (config.yaml, sessions, cron jobs, memories, skills,
auth.json) lives under this add-on's `/data`, which Supervisor persists
and backs up automatically.

See [`DOCS.md`](DOCS.md) for the full verification log (exact
`docker build`/`docker run` commands and their real output).
