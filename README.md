# Hermes Agent — Home Assistant OS add-on repository (unofficial)

Packages [Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent)
for Home Assistant OS / Supervisor. Not affiliated with Nous Research —
both add-ons build `FROM` their published `nousresearch/hermes-agent`
Docker image unmodified; this repo only adds the glue a HAOS add-on needs
(options.json translation, `/data` persistence, container metadata).

## What's here

| Add-on | Runs | Use it for |
|---|---|---|
| [`hermes-gateway`](hermes-gateway/) | `hermes gateway run` | Telegram / Discord / Slack / WhatsApp / Email bridge + cron scheduler + optional OpenAI-compatible API server |
| [`hermes-agent`](hermes-agent/) | `hermes dashboard` | Browser UI with an embedded PTY chat tab — the closest thing to the interactive `hermes` CLI you can run as a headless add-on |

Both add-ons are two faces of the same upstream container — this mirrors
upstream's own `docker-compose.yml`, which runs the identical image as two
containers distinguished only by their `command:`. See each add-on's
`DOCS.md` for why the repo doesn't ship a third "raw interactive CLI"
add-on (short version: `hermes` bare wants a live TTY; the dashboard's
embedded chat is the actual browser-reachable equivalent).

## Install

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories**.
2. Add this repository's URL (or, for local testing before it's ever pushed
   anywhere, point Supervisor at a local path per its
   [local add-ons docs](https://developers.home-assistant.io/docs/add-ons/testing/)).
3. Install **Hermes Gateway** and/or **Hermes Agent** from the new
   "Hermes Agent (unofficial)" section of the store.
4. Configure each add-on's options (see its README/DOCS) before starting it.

## Design notes that apply to both add-ons

- **Base image**: both Dockerfiles pin
  `nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495`
  (was tagged `:latest` on Docker Hub as of 2026-08-24) — a digest, not a
  mutable tag, so builds are reproducible. Confirmed via `docker manifest
  inspect` to be a real multi-arch manifest list (linux/amd64 +
  linux/arm64), and confirmed against upstream's
  `.github/workflows/docker.yml` that both are built on native runners
  (`ubuntu-latest` / `ubuntu-24.04-arm`), not qemu — so `arch: [amd64,
  aarch64]` in both `config.yaml`s is an honest claim, not aspirational.
- **We do not rebuild hermes from source.** Upstream's own `Dockerfile`
  compiles a patched SQLite, downloads s6-overlay, builds two npm
  frontends, and installs a Playwright Chromium — their own comments
  estimate 15-45 minutes per build. Re-running that inside Supervisor's
  add-on builder on every install would be needless: upstream already
  publishes the finished image to Docker Hub. Each add-on's Dockerfile
  just layers a small `run.sh` translation shim on top, so `docker build`
  here takes seconds.
- **`init: false`** in both `config.yaml`s: the upstream image already
  supervises itself via s6-overlay (see its
  `docker/entrypoint-dispatch.sh`) and expects to own PID 1. Each add-on's
  own `ENTRYPOINT` is `run.sh`, which does the options.json → env
  translation and then `exec`s straight into the upstream entrypoint, so
  the same process stays PID 1 throughout and the upstream supervision
  tree works exactly as it would under a plain `docker run`.
- **Persistence**: both add-ons set `HERMES_HOME=/data`, redirecting
  hermes's own state directory (normally `/opt/data`, an anonymous
  `VOLUME` the image declares) onto Supervisor's per-add-on `/data`, which
  is persistent and included in HA backups with no `map:` entry needed.
- **Required-option safety**: `hermes-gateway` has no required options —
  verified by actually running `gateway run` with an empty
  `options.json` (see hermes-gateway/DOCS.md). `hermes-agent` requires a
  username/password because hermes itself refuses to bind a public
  dashboard without an auth provider; both use `options: null` +
  a non-optional schema type (not an empty-string default) specifically
  so Supervisor blocks Save/Start on a blank value, rather than passing
  validation and failing at runtime with no visible error — the exact
  failure class this packaging job was asked to avoid.

## What's verified vs. not

Verified locally with a real `docker build` + `docker run` on this
machine (Docker Desktop 29.6.2, amd64) — see each add-on's `DOCS.md` for
the exact commands and output:

- Both images build from a real, pulled, digest-pinned upstream image.
- `hermes-gateway` starts cleanly with zero configuration.
- `hermes-gateway` rejects `api_server_enabled: true` with no key, with a
  clear log line and non-zero exit — not a silent hang.
- A `telegram_bot_token` set through options.json genuinely reaches the
  gateway process's environment and the gateway genuinely attempts (and
  is genuinely rejected by Telegram's real servers, since the token is
  fake) — full round trip, not just an env-var-is-set check.
- `extra_env` accepts well-formed `KEY=VALUE` pairs and rejects malformed
  ones with a warning instead of silently dropping or crashing.
- `hermes-agent` refuses to start with blank username/password (fails in
  our own shim before even reaching hermes).
- `hermes-agent` with real credentials binds `0.0.0.0:9119`, serves a
  working login page, accepts the configured password (200 + session
  cookies), rejects a wrong one (401), and persists `HERMES_HOME=/data`
  correctly (config.yaml, sessions, memories, etc. all land in the
  mounted volume).
- The auto-generated dashboard session secret survives a container
  restart (same file, same bytes) instead of invalidating every session
  on every restart.
- Both images build for `linux/arm64` via `docker buildx --platform
  linux/arm64 --load` and the resulting image genuinely runs under QEMU
  emulation on this amd64 Mac (full s6 boot, clean exit).

**Not verified** (explicitly out of scope for this task):

- Actual install/run on a live HAOS Supervisor. This was built and tested
  as plain `docker build`/`docker run` only — Supervisor's own add-on
  build path (which sets `BUILD_VERSION`/`BUILD_ARCH` build-args and
  reads `config.yaml` for arch gating) was not exercised, per the
  instruction not to touch the live guest at 192.168.1.143.
- Real Telegram/Discord/Slack/WhatsApp/Email credentials — only a
  deliberately fake Telegram token was used, to prove the token reaches
  the process without needing a live bot.
- `ingress: true` was investigated and deliberately NOT used for
  `hermes-agent` — see that add-on's `config.yaml` comment and `DOCS.md`
  for the concrete, reproduced reason (HA's ingress proxy sends
  `X-Ingress-Path`; hermes's dashboard only reads `X-Forwarded-Prefix`,
  and its basic-auth login page hardcodes root-relative paths regardless).
- No icon/logo images are included — image generation wasn't available
  in this session; add `icon.png` (128×128) / `logo.png` (256×256) per
  add-on later if desired.

## Repo layout

```
repository.yaml         # Supervisor reads this for the store listing
hermes-gateway/
  config.yaml            # options/schema/ports/arch
  Dockerfile             # FROM the pinned upstream digest
  run.sh                 # options.json -> env, then exec upstream entrypoint
  README.md
  DOCS.md                # the full option reference + verification log
hermes-agent/
  config.yaml
  Dockerfile
  run.sh
  README.md
  DOCS.md
```
