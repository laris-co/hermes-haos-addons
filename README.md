# Hermes Agent — Home Assistant OS add-on repository (unofficial)

Packages [Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent)
for Home Assistant OS / Supervisor. Not affiliated with Nous Research.

**Ships as two variants, on purpose**, after two rounds of review:

| | `hermes-gateway` / `hermes-agent` | `hermes-gateway-lite` / `hermes-agent-lite` |
|---|---|---|
| Built from | Upstream's own published Docker image, `FROM`-unmodified | Pinned upstream **git commit**, `pip install -e`, minimal extras |
| Image size (measured) | **~908 MiB** | gateway ~248 MiB / agent ~189 MiB |
| Idle memory (measured) | gateway ~196 MiB / agent ~172 MiB | gateway ~106 MiB / agent ~137 MiB |
| Code-exec sandbox | Whatever upstream ships (still needs `docker.sock`, which Supervisor add-ons don't get by default — see below) | **None — `TERMINAL_ENV=local`, runs directly in the container** |
| Distribution channel | Official, upstream-published, upstream-tested | Not upstream-published — this repo's own build from source |
| **Recommended for** | **Most people. Start here.** | Genuinely disk/RAM-constrained hosts, once you've read and accepted the tradeoff below |

**If you're not sure which to pick, install `hermes-gateway` / `hermes-agent`
(no "lite" suffix).** The size difference is smaller than it might sound —
continue reading for why.

## Why two variants (the honest version)

This repo went through two redirects while being built, and the numbers
changed materially each time — recorded here instead of quietly memory-
holed:

1. **First build**: wrapped upstream's published Docker image
   unmodified. Verified working end-to-end (real login round-trip, real
   Telegram API round-trip, clean options/schema).
2. **Second build**: told the wrapped image was ~3.93 GB and wouldn't fit
   a 2048 MB target guest with ~1 GB free — rebuilt from scratch as a
   minimal profile (no Playwright, no Docker-in-Docker sandbox, no
   baked-in provider extras) to fit that budget. That number came from
   `docker images`' list view, which double-counts shared base layers per
   tag — the metric looked dramatic, and it was wrong.
3. **Third pass** (this one): re-measured with `docker image inspect
   --format '{{.Size}}'`, the actual per-image size. The wrapped image is
   **~908 MiB**, not 3.93 GB. Separately, the original target guest
   turned out not to be the right target at all — Hermes ended up running
   as a plain Docker container on a full-size host instead, because its
   code-exec backend spawns nested Docker containers and Supervisor
   add-ons don't get `docker.sock` by default, so the sandboxed backend
   cannot work under HAOS regardless of image size. This repo is now
   aimed at other people running HA on their own hardware, not a specific
   constrained guest.

Net effect: the size gap between the two variants is real (~650-720 MiB
of disk, and idle memory roughly 1.2-1.85x higher for the full variant)
but far less dramatic than the number that originally justified building
"lite" at all. **Given that, `hermes-gateway`/`hermes-agent` (the full,
upstream-image variant) is the recommended default** — it uses the
official, upstream-tested distribution channel, and ~900 MiB is a small
ask on most Home Assistant hardware. `-lite` is kept and documented for
the case where it genuinely matters (older SBCs, HAOS VMs with a real
disk/RAM ceiling), with its tradeoffs stated plainly rather than buried.

## What's here

| Add-on | Runs | Use it for |
|---|---|---|
| [`hermes-gateway`](hermes-gateway/) | `hermes gateway run` | Telegram / Discord / Slack / WhatsApp / Email bridge + cron scheduler + optional OpenAI-compatible API server. Wraps upstream's published Docker image. |
| [`hermes-agent`](hermes-agent/) | `hermes dashboard` | Browser UI with an embedded PTY chat tab. Wraps upstream's published Docker image. |
| [`hermes-gateway-lite`](hermes-gateway-lite/) | `hermes gateway run` | Same, built minimal from pinned source. Smaller, but `TERMINAL_ENV=local` — see its README before installing. |
| [`hermes-agent-lite`](hermes-agent-lite/) | `hermes dashboard` | Same, built minimal from pinned source. Same `TERMINAL_ENV=local` tradeoff, and it matters more here since the Chat tab is this add-on's whole point. |

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
- **Real measured size: ~908 MiB** (`docker image inspect --format
  '{{.Size}}'`), not the ~3.93 GB earlier reported from `docker images`'
  list view.
- **`init: false`**: the upstream image already supervises itself via
  s6-overlay and expects to own PID 1. Each add-on's own `ENTRYPOINT` is
  `run.sh`, which does the options.json → env translation and then
  `exec`s straight into the upstream entrypoint.
- **Persistence**: `HERMES_HOME=/data`, Supervisor's own per-add-on
  volume, no `map:` entry needed.
- **Required-option safety**: `hermes-gateway` has no required options
  (verified running with an empty `options.json`). `hermes-agent`
  requires username/password via `options: null` + a non-optional
  schema type (not an empty-string default), so Supervisor blocks
  Save/Start on a blank value instead of failing at runtime with no
  visible error.

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

Verified locally with real `docker build` + `docker run` on this
machine — **this Mac is arm64 (Apple Silicon)**, not amd64 (an earlier
report's error, corrected here). The deployment target for anyone
installing this is amd64 or arm64 hardware of their own; both were built
with explicit `--platform` flags via `docker buildx` and run-tested
(amd64 via Rosetta/QEMU on this host — functionally faithful, not a
performance benchmark). See each add-on's `DOCS.md` for exact commands
and full output.

Both variants: build on both archs and boot cleanly; `hermes-gateway*`
starts with zero config and rejects `api_server_enabled: true` with no
key with a clear log line and non-zero exit; a fake `telegram_bot_token`
genuinely reaches the process and is genuinely rejected by Telegram's
real API; `extra_env` rejects malformed entries with a warning;
`hermes-agent*` refuses to start with blank credentials, serves a real
login round-trip (200 + cookies / 401) with real credentials, and
persists `HERMES_HOME=/data` correctly; the dashboard session secret
survives a restart.

**Not verified** (explicitly out of scope for this task):

- Actual install/run on a live HAOS Supervisor — plain `docker
  build`/`docker run` only.
- Real Telegram/Discord/Slack/WhatsApp/Email credentials — only a
  deliberately fake Telegram token was used.
- `ingress: true` for either `hermes-agent` variant — see their `DOCS.md`
  for the reproduced reason it's not used (HA's ingress proxy sends
  `X-Ingress-Path`; hermes's dashboard only reads `X-Forwarded-Prefix`,
  and its basic-auth login page hardcodes root-relative paths
  regardless).
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
hermes-agent/                 # full — wraps upstream's Docker image
hermes-gateway-lite/          # minimal — built from pinned source
hermes-agent-lite/            # minimal — built from pinned source
```
Each add-on directory: `config.yaml` (options/schema/ports/arch),
`Dockerfile`, `run.sh` (options.json → env, then exec into hermes),
`README.md`, `DOCS.md` (full reasoning + verification log with real
commands and output).
