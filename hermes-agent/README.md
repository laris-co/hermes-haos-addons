# Hermes Agent

Runs [Hermes Agent](https://github.com/NousResearch/hermes-agent)'s
**dashboard** (`hermes dashboard --host 127.0.0.1 --port 9119`): a web UI
that includes model/config management *and* an embedded, PTY-backed Chat
tab — the same interactive agent conversation you'd otherwise only get
from the `hermes` terminal command. Appears in Home Assistant's own
sidebar via ingress — no port to open, no separate login.

> **If the sidebar entry doesn't appear after install**: `ingress: true`
> in `config.yaml` makes the add-on *eligible* for a sidebar entry, but
> whether it's actually shown is separate Supervisor **runtime** state
> (`ingress_panel`, the "Show in sidebar" toggle — not a `config.yaml`
> key at all). Confirmed on a real guest: 8 of 9 installed add-ons
> defaulted to this toggle off, including an official add-on that ships
> `panel_icon`/`panel_title` just like this one does. If the panel is
> missing, check the add-on's own page for a "Show in sidebar" toggle
> (or an equivalent Supervisor-side action) — this add-on is not
> broken, the panel is just hidden by default.

## Why "dashboard" and not the raw `hermes` CLI

Upstream's `hermes` (bare, no subcommand) is a real terminal UI — it
wants a live TTY for multiline editing, streaming tool output, etc. A
HAOS add-on is a headless supervised process with no attached terminal,
so that mode has no way to run here. The dashboard's **Chat tab**
(`/api/pty` WebSocket, confirmed in `hermes_cli/web_server.py`) is
upstream's own browser-reachable equivalent — full agent conversation,
same session/model/tool config, just reached over HTTP instead of a TTY.
That's what this add-on exposes as "the agent/CLI side."

This is one of two add-ons in this repository — see the
[repo README](../README.md) for how it relates to `hermes-gateway`
(the messaging-platform side).

## Quick start

1. Install and start the add-on. There is no separate dashboard username or
   password. To use Chat, configure a model route in the add-on options (the
   9Router example below is the route used on catlab).
2. Open it from **Home Assistant's own sidebar** (it registers itself
   there via ingress — look for "Hermes Agent").
3. Sign-in is whatever getting to that sidebar already required: your
   Home Assistant login. There's no separate hermes credential.

## How the sidebar works (v1.1.3 — read this if you're curious why there's no login)

This add-on binds the dashboard to `127.0.0.1` **inside its own
container** and puts a small nginx in front of it, translating headers
so Home Assistant Supervisor's ingress proxy can reach it. Binding
loopback means hermes's own auth gate (`should_require_auth()` in
`hermes_cli/web_server.py`) never engages at all — there's no login page
to break under an ingress path prefix (which is exactly what killed the
earlier direct-port-plus-basic-auth design; see `DOCS.md` for that
history). Home Assistant's own login becomes the auth boundary instead,
same as every other ingress-only add-on (Node-RED, ESPHome Builder,
etc.) — anyone who can reach your Home Assistant sidebar can open this
add-on.

The proxy also translates Supervisor's `X-Ingress-Path` header into the
`X-Forwarded-Prefix` header Hermes understands. That translation keeps the
dashboard's `/assets/*`, `/api/*`, and WebSocket URLs under the per-session
ingress path. v1.1.0 missed it: the HTML returned 200 but every initial
JavaScript and CSS asset returned 404 in a real HA sidebar. v1.1.1 fixed the
initial page, but Vite's lazy-route preload helper still prepended `/` to its
dependency map; clicking **Chat**, **Sessions**, or another lazy page escaped
the ingress mount and failed the same way. v1.1.2 patched that generated helper,
but kept upstream's old content hash, allowing an already-open browser to reuse
the broken cached bundle. v1.1.3 rebuilds the pinned frontend with Vite
`--base ./`; initial assets, lazy imports, and preload dependencies are relative
by construction, and new content hashes force browsers onto the fixed build.
A landing page alone is not accepted as proof: route navigation and refresh are
tested.

Verified end to end, including the part that's easy to get wrong: a real
`HTTP/1.1 101 Switching Protocols` on both `/api/ws` and `/api/pty` (the
Chat tab's actual sockets) through the nginx proxy, with a Host/Origin
pair simulating a real browser under ingress. See `DOCS.md` for the full
transcript.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `openrouter_api_key` | password | empty | OpenRouter-compatible bearer key. Use this redacted field for 9Router; do not put the key in `extra_env`. |
| `openrouter_base_url` | URL | empty | OpenRouter-compatible `/v1` endpoint, e.g. `http://192.168.1.143:20128/v1`. |
| `inference_provider` | string | empty | Provider name, normally `openrouter` for 9Router. |
| `inference_model` | string | empty | Wire model ID, e.g. `glm/glm-5.3`. |
| `extra_env` | list of `KEY=VALUE` | `[]` | Escape hatch for advanced tuning — same pattern as `hermes-gateway`. Malformed entries are logged and skipped. |

The four model-route fields are exported into the embedded PTY and also seed
Hermes' saved `model.*` metadata at boot. The dedicated key field is deliberately
password-typed; Supervisor redacts it. A stale `OPENROUTER_API_KEY` or
`OPENROUTER_BASE_URL` saved from the dashboard is removed so it cannot override
the current add-on configuration after restart.

## Persistence

All dashboard state (config.yaml, sessions, memories, skills) lives
under this add-on's `/data`, which Supervisor persists and backs up
automatically.

See [`DOCS.md`](DOCS.md) for the full verification log (exact
`docker build`/`docker run` commands and their real output, including
the WebSocket-upgrade transcript this design depends on).
