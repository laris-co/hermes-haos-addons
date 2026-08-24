# Hermes Server

Runs [Hermes Agent](https://github.com/NousResearch/hermes-agent)'s
**headless backend** (`hermes serve`): the same JSON-RPC/WebSocket
server `hermes dashboard` runs, minus the browser-facing bits — the
process the [Hermes Desktop](https://github.com/NousResearch/hermes-agent)
app (or any other remote client speaking the same protocol) connects to
as a "remote gateway."

This is a machine client backend, not a browser UI — there's nothing
for Home Assistant's ingress iframe to embed, so this add-on publishes a
real port instead of using `ingress: true` (compare `hermes-agent`,
which is the opposite case: a browser UI, reached via the sidebar, no
port).

## Quick start

1. Set **Username** and **Password** in this add-on's Configuration tab
   — both are required, with no default, on purpose (same reasoning as
   `hermes-agent`'s original design: an empty default would be a real
   security hole here, and `hermes serve` genuinely enforces it — it
   refuses to bind `0.0.0.0` without a configured auth provider).
2. Start the add-on.
3. In Hermes Desktop: **Settings → Gateway → Remote gateway**, enter
   `http://<your-home-assistant-host>:9119`, and sign in with the same
   username/password.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `username` | string | *(none — required)* | Backend login username. |
| `password` | password | *(none — required)* | Backend login password. |
| `session_secret` | password | *(empty)* | Optional. If left blank, the add-on generates one on first boot and persists it to `/data/.dashboard_secret`, so restarts don't invalidate every connected client's session. |
| `extra_env` | list of `KEY=VALUE` | `[]` | Escape hatch for advanced tuning. Malformed entries are logged and skipped. |

## Networking

Maps `9119/tcp` directly. **Never remap this to 80 or 443** — Home
Assistant itself owns those on this host.

## Persistence

All backend state lives under this add-on's `/data`, which Supervisor
persists and backs up automatically.

See [`DOCS.md`](DOCS.md) for the full verification log — including
confirmation that `hermes serve` shares its auth gate with `hermes
dashboard` (same env vars, same fail-closed behavior on an
unconfigured public bind).
