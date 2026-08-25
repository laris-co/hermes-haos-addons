# Paperclip [EXPERIMENTAL]

> ## This add-on is experimental and may be withdrawn
>
> Shipped to find out whether it earns its place, not because we're
> confident it does. This repo has a precedent for withdrawing an
> add-on cleanly if it doesn't (see `9router`). Read this whole page
> before installing.

Wraps the official [`ghcr.io/paperclipai/paperclip`](https://github.com/paperclipai/paperclip)
image — "open-source orchestration for teams of AI agents," an
org-chart/task-manager/budget-governance platform, not a chatbot — with
[thClaws](https://github.com/thClaws/thClaws) wired in as a selectable
agent-runtime adapter.

## Read this first: the size, and who this is actually for

**~5.62 GB**, almost entirely upstream's, not this add-on's. It bundles
**five full agent CLI toolchains** — Claude Code, Codex, OpenCode,
Gemini CLI, Kimi Code — plus Node 24 and a compiled monorepo. **None of
that is used by the thclaws integration path.** Most of this image's
size is dead weight for the specific reason you'd install this add-on.
This add-on's own layer adds only the checksummed `thclaws` binary and
the adapter registration (~1 GB more, mostly the same GTK/WebKit/
GStreamer runtime libraries this repo's standalone `thclaws` add-on
already documents at length — final image: **~6.59 GB**).

Upstream's own README, verbatim, not paraphrased away:

> "Not a single-agent tool. This is for teams. If you have one agent,
> you probably don't need Paperclip. If you have twenty — you
> definitely do."

If you're here to run one thclaws instance, you are exactly the reader
upstream is talking to. This add-on exists anyway because Nat asked for
it to be shippable and removable — not because the fit argument above
stopped being true.

## What the thclaws adapter actually does (and doesn't)

The adapter (`@soul-brews-studio/thclaws-paperclip-adapter`) is a
**from-scratch implementation, not the retired official `@thclaws/paperclip-adapter`**
(that package was tied to thCompany.ai, a discontinued commercial
product — see thClaws' own `CHANGELOG.md` v0.110.0). Concretely, that
means:

- **Has**: spawns `thclaws -p --accept-all -m oai/<model> <prompt>` as
  non-interactive runs. Full stdout becomes the reply.
- **Has**: task-scoped session continuity. The adapter captures
  `[session] saved <id>` and returns it through Paperclip's session
  contract; later heartbeats use that exact `--resume <id>` only when
  cwd/model still match.
- **Has**: a real authenticated `GET /models` environment probe, a
  declarative adapter configuration form, and Paperclip instructions
  bundle support.
- **Does NOT have yet**: remote execution targets, skill staging/a
  Skills tab, or the retired package's curated 21-provider picker.

**Two gotchas, from the adapter's own README, worth knowing before you
rely on this**:

1. thclaws needs an `oai/` model prefix — a bare model id fails with
   `unknown model provider`. The adapter auto-prefixes if you leave it
   off.
2. **Never add `--resume last`.** The adapter deliberately uses the
   task-specific session id Paperclip persisted. `last` can cross
   agent/task boundaries in a shared working directory.

## Quick start

1. Install and start the add-on. First boot applies ~211 database
   migrations to an embedded Postgres — give it 15-30 seconds.
2. Open `http://<host>:3100` and complete Paperclip's own onboarding
   (`bootstrapStatus: bootstrap_pending` until you do — confirmed via
   its `/api/health` endpoint).
3. In Paperclip's UI, create or configure an agent using the
   **`thclaws_local`** adapter type. Its configuration fields (set in
   Paperclip's UI, not this add-on's Configuration tab):
   - `baseUrl` (required) — an OpenAI-compatible endpoint. Point this
     at this repo's own `litellm` or `9router` add-on, or any other
     OpenAI-compatible gateway.
   - `apiKey` — sent as `OPENAI_COMPAT_API_KEY`.
   - `model` — passed to thclaws via `-m`.
4. Click **Test now**. This now verifies the gateway and bearer key,
   not merely that the fields exist.
5. Run the agent from Paperclip's task system. Later heartbeats for
   the same task resume its thClaws session automatically.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `better_auth_secret` | password | *(auto-generated)* | Internal signing secret, not a credential you type anywhere. Auto-generated and persisted to `/data` on first boot if left blank. |
| `tool_action_signing_secret` | password | *(auto-generated)* | Same as above — another internal signing secret upstream's own deployment examples generate fresh with `openssl rand -hex 32`. |
| `public_url` | url | *(empty)* | Only set this if you're exposing the add-on's port on a real, fixed external domain. Leaving it empty is fine for local/LAN use — Paperclip falls back to deriving the auth origin from the incoming request (a real startup warning, not a fatal error — verified). |
| `extra_env` | list of `KEY=VALUE` | `[]` | Escape hatch for advanced tuning. Malformed entries are logged and skipped. |

## Networking — a published port, not ingress

Maps `3100/tcp` directly. Checked ingress properly before deciding
against it, same standard as every other add-on here: verified live
that `PAPERCLIP_PUBLIC_URL` has **zero effect** on served asset paths
(byte-identical `/assets/index-*.js` hrefs with and without it set —
same negative result as this repo's Open WebUI/litellm investigations),
and that a request carrying an ingress-shaped path prefix gets a flat
`404` — Paperclip has no reverse-proxy-subpath support at all. See
`DOCS.md` for the exact transcript.

**Verified live** (not just a Dockerfile default): Paperclip starts in
`authenticated`/`private` deployment mode — confirmed via its own
`/api/health` endpoint. It has a real login/onboarding flow; this
add-on doesn't weaken that.

**Never remap this to 80 or 443** — Home Assistant itself owns those on
this host.

## Persistence

`PAPERCLIP_HOME=/data` redirects the embedded Postgres data, uploaded
assets, local secrets key, and agent workspace data onto this add-on's
`/data`, which Supervisor persists and backs up automatically — same
env var upstream's own DOCKER.md quickstart example uses.

## Why this wraps a prebuilt image instead of building from source

Explicit instruction: prebuilt only. This does not build Paperclip from
source and does not reproduce the separate, larger (~4.66 GB) local
build that runs on black.local — it wraps the official, published,
multi-arch `ghcr.io/paperclipai/paperclip` image at a pinned digest.

See [`DOCS.md`](DOCS.md) for the full verification log — the live
adapter-loading proof, the `PAPERCLIP_DEPLOYMENT_MODE` verification, the
ingress investigation transcript, and two real bugs this build caught
before they shipped.
