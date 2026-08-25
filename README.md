# Hermes Agent — Home Assistant OS add-on repository (unofficial)

Packages [Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent)
for Home Assistant OS / Supervisor. Not affiliated with Nous Research.

**Ships as two variants, on purpose**, after two rounds of review:

| | `hermes-gateway` / `hermes-agent` | `hermes-gateway-lite` / `hermes-agent-lite` |
|---|---|---|
| Built from | Upstream's own published Docker image, `FROM`-unmodified | Pinned upstream **git commit**, `pip install -e`, minimal extras |
| Image size (measured natively, amd64) | **~2.68 GB** | **~659 MB** (gateway; agent not independently re-measured natively, expect the same order of magnitude) |
| Idle memory | gateway: **134.5 MiB resident**, measured on a real Supervisor install (see below) | measured under emulation only — see each add-on's `DOCS.md` |
| Code-exec sandbox | Whatever upstream ships (still needs `docker.sock`, which Supervisor add-ons don't get by default — see below) | **None — `TERMINAL_ENV=local`, runs directly in the container** |
| Distribution channel | Official, upstream-published, upstream-tested | Not upstream-published — this repo's own build from source |
| **Recommended for** | **Most people. Start here.** | Genuinely disk/RAM-constrained hosts, once you've read and accepted the tradeoff below |

**Measurement note**: image sizes above are from a **native amd64 host**
(`docker images`, `docker image inspect --format '{{.Size}}'`, and `docker
save` all agree to within compression overhead there). An earlier pass of
this repo measured on an arm64 Mac pulling/building amd64 images under
QEMU/Rosetta emulation, where those same three tools *disagree with each
other and with reality* — that pass under-reported ~908 MiB / ~248 MiB,
off by ~2.7-2.9x in the same direction on both variants. If you're
re-measuring this yourself: **measure on a native host of the target
architecture, or not at all** — cross-arch emulated measurement is not a
smaller-but-close number, it's a wrong one, and it can go either
direction (a different pass that same night mis-read a real 259 MB image
as possibly 4x too small, in the *other* direction, before `docker save`
settled it). The ratio between variants held up across both passes
(~4x), even though both absolute numbers were wrong the first time —
that's the one thing safe to reason about from an emulated measurement.

**If you're not sure which to pick, install `hermes-gateway` / `hermes-agent`
(no "lite" suffix).** The size difference is real (~4x) but the
correctness/distribution-channel argument for the full variant is the
stronger reason — continue reading for why.

## Why two variants (the honest version)

This repo went through several rounds of review while being built, and
the numbers changed materially more than once — recorded here instead of
quietly memory-holed:

1. **First build**: wrapped upstream's published Docker image
   unmodified. Verified working end-to-end (real login round-trip, real
   Telegram API round-trip, clean options/schema).
2. **Second build**: told the wrapped image was ~3.93 GB and wouldn't fit
   a 2048 MB target guest with ~1 GB free — rebuilt from scratch as a
   minimal profile (no Playwright, no Docker-in-Docker sandbox, no
   baked-in provider extras) to fit that budget. That ~3.93 GB number
   came from `docker images`' list view on an arm64 Mac, which double-
   counts shared base layers per tag — wrong.
3. **Third pass**: re-measured on the *same arm64 Mac*, cross-arch, with
   `docker image inspect --format '{{.Size}}'` instead. Got ~908 MiB —
   looked authoritative (a different, more precise-sounding metric), and
   was *also* wrong: on an arm64 host, amd64 images pulled/built under
   QEMU/Rosetta emulation are only partially materialized, so none of
   `docker images`, `docker image inspect`, or `docker save` agree with
   each other or with reality there. Separately, the original target
   guest turned out not to be the right target at all — Hermes ended up
   running as a plain Docker container on a full-size host instead,
   because its code-exec backend spawns nested Docker containers and
   Supervisor add-ons don't get `docker.sock` by default, so the
   sandboxed backend cannot work under HAOS regardless of image size.
   This repo is now aimed at other people running HA on their own
   hardware, not a specific constrained guest.
4. **Fourth pass** (this one): measured on a native amd64 host
   (black.local) instead of the arm64 Mac. All three tools agree there:
   the wrapped image is **~2.68 GB**, the minimal `hermes-gateway-lite`
   image is **~659 MB**. A real Supervisor install of the full
   `hermes-gateway` add-on on a live HAOS guest (catlab) additionally
   confirms **134.5 MiB resident** at idle — the number that actually
   matters for "will this fit," measured the only way that counts.

Net effect: the size gap between the two variants is real (~4x, both on
disk and — separately measured, see each add-on's `DOCS.md` — plausibly
in idle memory too, though the idle-memory side of that comparison was
only measured under emulation and should be treated as directional, not
precise) but the deciding factor isn't really the megabytes. **Given
that, `hermes-gateway`/`hermes-agent` (the full, upstream-image variant)
is the recommended default** — it uses the official, upstream-tested
distribution channel, and ~2.7 GB of disk plus ~135 MiB of resident
memory is a small ask on most Home Assistant hardware (nine add-ons
including HA core summed to 945 MiB on the real guest this was tested
against). `-lite` is kept and documented for the case where the size
difference genuinely matters (older SBCs, HAOS VMs with a real disk/RAM
ceiling), with its tradeoffs — smaller, but `TERMINAL_ENV=local` and an
unofficial distribution channel — stated plainly rather than buried.

## What's here

| Add-on | Runs | Use it for |
|---|---|---|
| [`hello-world`](hello-world/) | Static nginx page | Minimal, ingress-only Home Assistant sidebar example. No published port, credentials, API access, mapped folders, or host privileges. |
| [`hermes-gateway`](hermes-gateway/) | `hermes gateway run` | Telegram / Discord / Slack / WhatsApp / Email bridge + cron scheduler + optional OpenAI-compatible API server. Wraps upstream's published Docker image. |
| [`hermes-agent`](hermes-agent/) | `hermes dashboard` | Browser UI with an embedded PTY chat tab. Wraps upstream's published Docker image. |
| [`hermes-gateway-lite`](hermes-gateway-lite/) | `hermes gateway run` | Same, built minimal from pinned source. Smaller, but `TERMINAL_ENV=local` — see its README before installing. |
| [`hermes-agent-lite`](hermes-agent-lite/) | `hermes dashboard` | Same, built minimal from pinned source. Same `TERMINAL_ENV=local` tradeoff, and it matters more here since the Chat tab is this add-on's whole point. |
| [`hermes-server`](hermes-server/) | `hermes serve` | Headless JSON-RPC/WebSocket backend for Hermes Desktop's "remote gateway" — a real published port + required credentials (no ingress; there's no browser page for HA to embed). Wraps upstream's published Docker image. |
| [`litellm`](litellm/) | LiteLLM proxy | OpenAI-compatible `/v1` endpoint + admin UI (`/ui/`) in front of 100+ LLM providers. Real published port + required master key (LiteLLM has no auth by default — verified). No ingress yet — a real path-prefix mechanism exists (verified) but needs a Supervisor-API step this session couldn't test live; see DOCS.md. |
| ~~`9router`~~ | 9Router | 🚫 **Built, NOT published.** A deeper advisory pass found 19 total (6 CRITICAL, 11 HIGH), two CRITICAL with no patch at all. Kept in the repo, deliberately excluded from the Add-on Store (`config.yaml` renamed to `config.yaml.disabled`) — see `9router/NOT_PUBLISHED.md`. |
| [`open-webui`](open-webui/) | Open WebUI | Browser chat UI over the OpenAI-compatible API — pairs with `litellm`. ⚠️ Heaviest add-on here (~1.66 GB / ~660-970 MiB idle) and no ingress (verified its frontend has no HA path-prefix support) — real published port instead. |
| [`thclaws`](thclaws/) | `thclaws --serve` | Native Rust AI coding-agent workspace. Ingress sidebar (verified: loopback bind by default, real 101 WebSocket upgrade, no absolute asset paths to break). ⚠️ ~1.06 GB — the brief assumed a light CLI-only binary existed; verified directly that it doesn't (the one official Linux binary hard-links a full GTK/WebKit/GStreamer stack in every mode). See its README before installing. |
| [`uptime-kuma`](uptime-kuma/) | Uptime Kuma | Self-hosted uptime/status dashboard for watching this repo's other add-ons (or anything else). Real published port, not ingress — verified its frontend uses absolute asset paths with no reverse-proxy-subpath support. No credential options; its own setup wizard creates the admin account. |
| [`paperclip`](paperclip/) | Paperclip + thclaws adapter | 🧪 **EXPERIMENTAL, may be withdrawn.** Wraps the official 5.62 GB Paperclip image (org-chart/task orchestration for teams of AI agents — upstream's own words: "not a single-agent tool") with thClaws wired in as a selectable agent adapter. Real published port, not ingress (verified). Read its README before installing. |

Within each pair, the two add-ons are faces of the same upstream
project — this mirrors upstream's own `docker-compose.yml`, which runs
the same image as two containers distinguished only by their `command:`.
See each add-on's README for why the repo doesn't ship a third "raw
interactive CLI" add-on (short version: `hermes` bare wants a live TTY;
the dashboard's embedded chat is the actual browser-reachable
equivalent).

## Install

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories**.
2. Add this repository's URL (or, for local testing before it's ever pushed
   anywhere, point Supervisor at a local path per its
   [local add-ons docs](https://developers.home-assistant.io/docs/add-ons/testing/)).
3. Install whichever pair suits your hardware from the new "Hermes Agent
   (unofficial)" section of the store.
4. Configure each add-on's options (see its README/DOCS) before starting it.

## Design notes — full variant (`hermes-gateway` / `hermes-agent`)

- **Base image**: both Dockerfiles pin
  `nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495`
  (was tagged `:latest` on Docker Hub as of 2026-08-24) — a digest, not a
  mutable tag. Confirmed via `docker manifest inspect` to be a real
  multi-arch manifest list (linux/amd64 + linux/arm64), and confirmed
  against upstream's `.github/workflows/docker.yml` that both are built
  on native runners (`ubuntu-latest` / `ubuntu-24.04-arm`), not qemu.
- **Real measured size: ~2.68 GB**, measured on a native amd64 host
  (`docker images`, `docker image inspect --format '{{.Size}}'`, and
  `docker save` all agree there). Two earlier, wrong numbers were
  reported before this one — ~3.93 GB (a `docker images` list-view
  artifact) and ~908 MiB (an emulated-cross-arch-measurement artifact,
  from measuring an amd64 image on an arm64 Mac) — see "Why two
  variants" above for the full history. **Idle memory on a real
  Supervisor install: 134.5 MiB resident.**
- **`init: false`**: the upstream image already supervises itself via
  s6-overlay and expects to own PID 1. Each add-on's own `ENTRYPOINT` is
  `run.sh`, which does the options.json → env translation and then
  `exec`s straight into the upstream entrypoint.
- **Persistence**: `HERMES_HOME=/data`, Supervisor's own per-add-on
  volume, no `map:` entry needed.
- **No required options**: neither `hermes-gateway` (verified running
  with an empty `options.json`) nor `hermes-agent` (as of v1.1 — see
  below) requires any configuration to start.
- **`hermes-agent` uses `ingress: true`, not a direct port** (as of
  v1.1 — this replaced an earlier direct-port + required-username/
  password design). The dashboard binds `127.0.0.1` inside its own
  container; an in-container nginx translates Host/Origin headers so
  Home Assistant Supervisor's ingress proxy can reach it, and binding
  loopback means hermes's own auth gate never engages at all — HA's own
  login becomes the auth boundary, same as every other ingress-only
  add-on. Verified with a genuine `101 Switching Protocols` on both
  `/api/ws` and `/api/pty` through the proxy, simulating a real
  browser's Host/Origin under ingress — see `hermes-agent/DOCS.md` for
  the full transcript. (An earlier attempt at `ingress: true` with a
  0.0.0.0 bind was rejected for a real, reproduced reason — hermes's
  basic-auth login page hardcodes root-relative paths that break under
  an ingress mount — that failure mode still applies to
  `hermes-agent-lite`, which has not yet received this fix.)

## Design notes — lite variant (`hermes-gateway-lite` / `hermes-agent-lite`)

- **Built from a pinned git commit, not upstream's Docker image or a
  PyPI wheel.** Both Dockerfiles clone
  `d1afa16053a3777849c2b5465d59a0147b2172f9` (verified reachable via a
  shallow `git fetch --depth 1 origin <sha>` from the public repo) and
  `pip install -e` it. Editable install is not a style choice: upstream's
  `setup.py` deliberately refuses a normal wheel/sdist build and names
  `uv pip install -e .` as the sanctioned from-source path.
- **No extras baked in beyond a bare install.** Messaging platform SDKs
  lazy-install on first real use — verified end-to-end (a fake Telegram
  token genuinely triggered `python-telegram-bot` landing on
  `/data/lazy-packages`, then a genuine rejection from Telegram's API).
- **`hermes-agent-lite` still needs a Node build stage** for `web/` +
  `ui-tui/` (the PyPI wheel doesn't bundle a built frontend) — but not
  Playwright, not the Python provider extras, and both frontend and
  backend build from the same pinned commit.
- **`init: true`** (not `false`) — this image has no bundled supervisor
  of its own, so Supervisor's own init reaps zombies and forwards
  signals.
- **`TERMINAL_ENV=local` — read this before installing.** The agent's
  code-exec tool (including the dashboard's embedded Chat tab) runs
  **directly inside the add-on container**, not in any sandbox. A
  successful prompt injection or a buggy tool call has no container
  boundary between "the agent's actions" and this add-on's own
  filesystem. This is stated at the top of both lite add-ons' READMEs,
  not just here — it is the actual cost of the smaller image, not a free
  optimization.
- **No custom SQLite build.** Verified hermes's own runtime detects
  Debian trixie's vulnerable bundled SQLite and self-mitigates via
  `journal_mode=DELETE`, with a real logged warning.
- **No UID remap** — runs as root. `/data` is Supervisor's own volume,
  not a host bind-mount a human directly edits, so the ownership problem
  upstream's `HERMES_UID`/`HERMES_GID` dance solves doesn't apply here.

## What's verified vs. not

Two independent verification passes went into this repo:

1. **Local `docker build`/`docker run` on an arm64 Mac** (Apple Silicon —
   an earlier report's "amd64 host" was an error, corrected here), both
   archs built with explicit `--platform` flags via `docker buildx` and
   run-tested. Reliable for *functional* correctness (does it boot, does
   login work, does a token reach the process) — **not** reliable for
   *image size* on the amd64 target, since amd64 images on this host are
   QEMU/Rosetta-emulated and only partially materialized (see "Why two
   variants" above). See each add-on's `DOCS.md` for exact commands and
   full output.
2. **A real Supervisor install on a native amd64 HAOS guest** (catlab):
   the full `hermes-gateway` add-on, built on-device by Supervisor from
   this published repo, confirmed installed, started, and resident at
   134.5 MiB — the strongest evidence in this repo, and the one to trust
   over any locally-measured number if they ever disagree.

All four add-ons build on both archs and boot cleanly; `hermes-gateway*`
starts with zero config and rejects `api_server_enabled: true` with no
key with a clear log line and non-zero exit; a fake `telegram_bot_token`
genuinely reaches the process and is genuinely rejected by Telegram's
real API; `extra_env` rejects malformed entries with a warning and
persists `HERMES_HOME=/data` correctly. `hermes-agent` (v1.1, full
variant) serves its dashboard with no login at all via ingress, and a
genuine `101 Switching Protocols` on both `/api/ws` and `/api/pty`
through the in-container nginx proxy with a simulated real-browser
Host/Origin. `hermes-agent-lite` still has the earlier direct-port +
required-username/password design (refuses to start with blank
credentials, serves a real login round-trip with real ones) — it has
not yet received the ingress fix.

**Not verified**:

- `hermes-gateway-lite`, `hermes-agent`, and `hermes-agent-lite` have
  not been installed on a live Supervisor (only `hermes-gateway`, the
  full variant, has — see above). Everything else in this bullet list was
  local `docker build`/`docker run` testing only.
- Real Telegram/Discord/Slack/WhatsApp/Email credentials — only a
  deliberately fake Telegram token was used.
- `ingress: true` for `hermes-agent-lite` — it still uses the direct-port
  design; see `hermes-agent/DOCS.md` for why the naive `ingress: true` +
  0.0.0.0-bind approach doesn't work (HA's ingress proxy sends
  `X-Ingress-Path`; hermes's dashboard only reads `X-Forwarded-Prefix`,
  and its basic-auth login page hardcodes root-relative paths
  regardless), and for the loopback-bind-plus-nginx design that fixed it
  for the full `hermes-agent` variant.
- Long-running memory behavior under real chat/messaging load — only
  idle-after-boot was measured, for all four add-ons.
- The embedded Chat tab's live `/api/pty` WebSocket round trip (verified
  the bundle builds and is served; didn't drive a full PTY session).
- No icon/logo images are included — image generation wasn't available
  in this session.

## Repo layout

```
repository.yaml              # Supervisor reads this for the store listing
hermes-gateway/               # full — wraps upstream's Docker image
hermes-agent/                 # full — wraps upstream's Docker image, ingress sidebar
hermes-gateway-lite/          # minimal — built from pinned source
hermes-agent-lite/            # minimal — built from pinned source
hermes-server/                # full — hermes serve, headless backend, real port
litellm/                      # BerriAI LiteLLM proxy — OpenAI-compatible /v1
9router/                      # BUILT, NOT PUBLISHED — see 9router/NOT_PUBLISHED.md
open-webui/                   # Open WebUI — heaviest add-on here, no ingress, read its README
thclaws/                       # thClaws AI coding agent — ingress sidebar, ~1.06 GB, read its README
uptime-kuma/                   # Uptime Kuma status dashboard — real port, no ingress, read its README
paperclip/                     # EXPERIMENTAL — Paperclip + thclaws adapter, 6.59 GB, read its README
```
Each add-on directory: `config.yaml` (options/schema/ports/arch),
`Dockerfile`, `run.sh` (options.json → env, then exec into hermes),
`README.md`, `DOCS.md` (full reasoning + verification log with real
commands and output).
