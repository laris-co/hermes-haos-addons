# LiteLLM Proxy

Runs [BerriAI's LiteLLM](https://github.com/BerriAI/litellm) proxy — a
single OpenAI-compatible `/v1` endpoint in front of 100+ LLM providers
(OpenAI, Anthropic, Gemini, Bedrock, OpenRouter, local Ollama, and
more). Point `hermes-gateway`, Open WebUI, or anything else that speaks
the OpenAI API at this add-on's `/v1` endpoint instead of juggling
per-provider keys and SDKs directly.

## Quick start

1. Set **Master key** in this add-on's Configuration tab — required,
   with no default, on purpose (see `DOCS.md`: LiteLLM ships with **no
   authentication at all** unless this is set).
2. Start the add-on once to seed a starter config at
   `/data/config.yaml` (via Supervisor's add-on file access — Samba, SSH,
   or the File Editor add-on).
3. Edit `/data/config.yaml` to add your real models/providers (see
   [LiteLLM's config reference](https://docs.litellm.ai/docs/proxy/configs)).
   Reference provider API keys as `os.environ/YOUR_VAR_NAME` — supply the
   actual value via this add-on's `extra_env` option, not hardcoded in
   the file.
4. Restart the add-on to apply config changes.
5. Point clients at `http://<host>:4000/v1` with
   `Authorization: Bearer <master_key>`.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `master_key` | password | *(none — required)* | Bearer token every `/v1/*` call must present. LiteLLM has no auth without this. |
| `database_url` | password | *(empty)* | Optional. A Postgres connection string, only needed for LiteLLM's virtual-key/spend-tracking features. Not bundled — point this at your own Postgres (e.g. a separate add-on) if you want it. |
| `extra_env` | list of `KEY=VALUE` | `[]` | Provider API keys and any other env-based tuning — referenced from `config.yaml` via `os.environ/VAR_NAME`. Malformed entries are logged and skipped. |

## Networking

Maps `4000/tcp` directly (LiteLLM's own default port) — this is an API
proxy other services call, not a browser UI, so ingress doesn't apply
here. **Never remap this to 80 or 443** — Home Assistant itself owns
those on this host.

## Persistence

`/data/config.yaml` is the actual proxy configuration — edit it
directly. Supervisor persists and backs up this add-on's `/data`
automatically.

See [`DOCS.md`](DOCS.md) for the full verification log — including
confirmation that LiteLLM has no auth by default (401 without a master
key, 200 with one) and that the database is genuinely optional.
