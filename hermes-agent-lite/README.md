# Hermes Agent (lite)

> ⚠️ **Security tradeoff, read this first**: every command the agent
> runs from this dashboard's Chat tab — including anything a
> prompt-injected message or a buggy tool call talks it into running —
> executes **directly inside this container** (`TERMINAL_ENV=local`),
> not inside upstream's sandboxed Docker-in-Docker backend. There is no
> container boundary between "the agent's sandbox" and this add-on's own
> filesystem/`/data`. This matters more here than for `hermes-gateway`:
> the Chat tab is this add-on's whole point, so you will actually be
> running agent commands through it. This is the price of a smaller
> image (the sibling `hermes-gateway-lite`, natively measured, is ~659 MB
> against the full variant's ~2.68 GB — a real ~4.07x difference; this
> add-on's own image wasn't independently re-measured on native
> hardware, see `DOCS.md`). **Unless the size difference genuinely
> matters for your hardware, install [`hermes-agent`](../hermes-agent/)
> (no "lite" suffix) instead** — it wraps Nous Research's own published,
> tested Docker image, and is the recommended default. See
> [`DOCS.md`](DOCS.md) for the full writeup, not just this warning.

Runs [Hermes Agent](https://github.com/NousResearch/hermes-agent)'s
**dashboard** (`hermes dashboard --host 0.0.0.0 --port 9119`): a web UI
that includes model/config management *and* an embedded, PTY-backed Chat
tab — the same interactive agent conversation you'd otherwise only get
from the `hermes` terminal command.

## Why "dashboard" and not the raw `hermes` CLI

Upstream's `hermes` (bare, no subcommand) is a real terminal UI — it
wants a live TTY for multiline editing, streaming tool output, etc. A
HAOS add-on is a headless supervised process with no attached terminal,
so that mode has no way to run here. The dashboard's **Chat tab**
(`/api/pty` WebSocket, confirmed in `hermes_cli/web_server.py`) is
upstream's own browser-reachable equivalent — full agent conversation,
same session/model/tool config, just reached over HTTP instead of a TTY.
That's what this add-on exposes as "the agent/CLI side."

This is the **lite** profile of one of two add-on pairs in this
repository — see the [repo README](../README.md) for the full picture:
`hermes-gateway` / `hermes-gateway-lite` (messaging) and `hermes-agent`
/ `hermes-agent-lite` (dashboard/chat, this one).

**Minimal profile**: like `hermes-gateway-lite`, this is built from
pinned upstream source, not a wrap of upstream's published Docker image.
The frontend still has to be built (no prebuilt frontend ships on
PyPI), but without Playwright or any provider extras. Its sibling
`hermes-gateway-lite`, natively measured on amd64, is **~659 MB** versus
the full variant's **~2.68 GB** (a real ~4.07x difference) — this
add-on's own image size wasn't independently re-measured on native
hardware and is expected to be in the same range. See
[`DOCS.md`](DOCS.md) for the reasoning and the real measured numbers on
both variants, including exactly which numbers are natively confirmed
and which aren't.

## Quick start

1. Set **Username** and **Password** in this add-on's Configuration tab
   — both are required, with no default, on purpose (see `DOCS.md` for
   why an empty default would be a real security hole here).
2. Start the add-on.
3. Open `http://<your-home-assistant-host>:9119/` and sign in.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `username` | string | *(none — required)* | Dashboard login username. |
| `password` | password | *(none — required)* | Dashboard login password. Hashed/session-signed by hermes itself; not stored in plaintext beyond Supervisor's own options store. |
| `session_secret` | password | *(empty)* | Optional. If left blank, the add-on generates one on first boot and persists it to `/data/.dashboard_secret`, so restarts don't log everyone out. Set this yourself only if you want to pin/rotate it explicitly. |
| `public_url` | string | *(empty)* | Advanced — only for a reverse-proxy-behind-HAOS setup with a fixed public hostname. Leave blank for normal direct-port access. |

## Networking: a real port, not ingress

This add-on maps `9119/tcp` directly rather than using Home Assistant's
`ingress: true`. That was a deliberate, verified decision — see
`config.yaml`'s comment and `DOCS.md` for the reproduction: HA's ingress
proxy sends `X-Ingress-Path`, hermes's dashboard only understands
`X-Forwarded-Prefix`, and its basic-auth login page hardcodes
root-relative paths regardless of either header. Ingress would load the
login page and then break on submit. A direct port has none of that
risk. **Never remap this to 80 or 443** — Home Assistant itself owns
those on this host.

## Persistence

All dashboard state (config.yaml, sessions, the auto-generated session
secret, memories, skills) lives under this add-on's `/data`, which
Supervisor persists and backs up automatically.

See [`DOCS.md`](DOCS.md) for the full verification log (exact
`docker build`/`docker run` commands and their real output, including a
real login round-trip).
