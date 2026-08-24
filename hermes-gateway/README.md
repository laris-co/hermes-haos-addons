# Hermes Gateway

Runs [Hermes Agent](https://github.com/NousResearch/hermes-agent)'s
messaging gateway (`hermes gateway run`): Telegram, Discord, Slack,
WhatsApp, Email, the built-in cron scheduler, and (optionally) an
OpenAI-compatible API server for tools like Open WebUI.

This is one of two add-ons in this repository — see the
[repo README](../README.md) for how it relates to `hermes-agent`
(the dashboard/chat side).

**Minimal profile**: this add-on is built from pinned upstream source
with no Playwright, no Node, and no baked-in provider/messaging extras
(they lazy-install on first real use) — measured image size is
**~250 MiB**, not the ~4 GB a full wrap of upstream's published Docker
image would be. This also means the agent's code-exec tool runs
in-container (`TERMINAL_ENV=local`) rather than in upstream's sandboxed
Docker-in-Docker backend, which needs more RAM than this add-on's whole
target guest has free and isn't available under Supervisor anyway (no
`docker.sock`). See [`DOCS.md`](DOCS.md) for the full reasoning and the
real measured numbers — this is a documented tradeoff, not a hidden one.

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
