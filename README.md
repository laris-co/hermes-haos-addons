# Hermes Agent — Home Assistant OS add-on repository (unofficial)

Packages [Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent)
for Home Assistant OS / Supervisor. Not affiliated with Nous Research.

**v2 note**: this repo's first design wrapped upstream's published Docker
image `FROM`-unmodified. That was rejected during review — the target
guest is a 2048 MB HAOS VM (no `<maxMemory>` stanza in its libvirt XML,
so RAM can't be raised without an XML edit and a cold boot) with ~1 GB
free after HA core and other add-ons, and upstream's published image
measures 3.93 GB with a baseline that assumes a Docker-in-Docker code-exec
sandbox needing 5+ GB on its own. Both add-ons are now built from
**pinned upstream source** with a minimal dependency/extras profile
instead — see "Design notes" below and each add-on's `DOCS.md` for the
full reasoning and real measured numbers.

## What's here

| Add-on | Runs | Use it for | Image size (measured) |
|---|---|---|---|
| [`hermes-gateway`](hermes-gateway/) | `hermes gateway run` | Telegram / Discord / Slack / WhatsApp / Email bridge + cron scheduler + optional OpenAI-compatible API server | ~250 MiB |
| [`hermes-agent`](hermes-agent/) | `hermes dashboard` | Browser UI with an embedded PTY chat tab — the closest thing to the interactive `hermes` CLI you can run as a headless add-on | ~189 MiB |

Both add-ons are two faces of the same upstream project — this mirrors
upstream's own `docker-compose.yml`, which runs the same image as two
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

- **Built from a pinned git commit, not upstream's Docker image or a
  PyPI wheel.** Both Dockerfiles clone
  `d1afa16053a3777849c2b5465d59a0147b2172f9` from
  `github.com/nousresearch/hermes-agent` (verified reachable via a
  shallow `git fetch --depth 1 origin <sha>` from the public repo — not
  a local-only commit), and `pip install -e` it. Editable install is not
  a style choice: upstream's `setup.py` deliberately raises
  `RuntimeError: Building wheels or sdists for hermes-agent is not
  supported` for a normal build, and explicitly names `uv pip install
  -e .` as the sanctioned from-source path — confirmed by hitting that
  exact error on the first attempt at a plain `pip install`.
- **No extras baked in beyond what a bare install provides.** Confirmed
  from `pyproject.toml` that `fastapi`/`uvicorn`/`python-multipart`/
  `croniter` are unconditional core dependencies (not gated behind an
  extra), and that `messaging` (Telegram/Discord/Slack SDKs), `matrix`,
  `anthropic`, `bedrock`, `azure-identity`, `hindsight`, and `otlp` were
  deliberately dropped from upstream's own `[all]` extra specifically
  because they're lazy-installable via `tools/lazy_deps.py`. Neither
  add-on sets `HERMES_DISABLE_LAZY_INSTALLS` (upstream's own Docker
  image does, since it pre-bakes everything) — **verified end-to-end**:
  setting a Telegram token with no SDK baked in resulted in
  `python-telegram-bot` actually landing on disk under
  `/data/lazy-packages` at first connection attempt, not just an
  env-var-is-set check.
- **`hermes-agent` still needs a Node build stage** for `web/` and
  `ui-tui/` (the PyPI wheel doesn't bundle a built frontend — checked
  `tool.setuptools.package-data` directly) — but not Playwright and not
  the Python provider extras, and both halves (frontend + backend) are
  built from the **same** pinned commit rather than mixing a PyPI
  release with a different-vintage git checkout (upstream's git tags are
  CalVer and don't map cleanly onto PyPI's SemVer releases, so there's
  no clean way to match them without deeper archaeology — building both
  from one commit sidesteps the question entirely).
- **`init: true`** in both `config.yaml`s (not `false`) — this v2 image
  has no bundled supervisor of its own (no more s6-overlay; that only
  existed to run upstream's *own* multi-service image, which this repo
  no longer wraps). Each add-on's process is a single `hermes` command
  running directly as PID 1's child under Supervisor's own init, which
  is what reaps zombies and forwards signals here.
- **`TERMINAL_ENV=local`** — a real, documented security downgrade, not
  a free lunch. Upstream's default code-exec backend runs agent shell
  commands in a nested Docker sandbox that upstream's own docs default
  to 5120 MB of RAM for — more than this guest's entire free budget, and
  HAOS add-ons don't get `docker.sock` by default anyway so that backend
  would be broken here regardless. `local` runs tool commands directly
  in the add-on's own container. See each add-on's `DOCS.md` for the
  full writeup.
- **No custom SQLite build.** Upstream compiles a patched SQLite to work
  around Debian trixie's WAL-reset corruption bug; this repo's base image
  (`python:3.13-slim-trixie`) has the same vulnerable version and isn't
  patched. Verified this is a non-issue in practice: hermes's own runtime
  detects the vulnerable SQLite and falls back to `journal_mode=DELETE`
  automatically, with a one-time warning per database — a real log line
  captured from a running container, not an assumption.
- **Persistence**: both add-ons set `HERMES_HOME=/data`, redirecting
  hermes's own state directory onto Supervisor's per-add-on `/data`,
  which is persistent and included in HA backups with no `map:` entry
  needed.
- **No UID remap** — the process runs as root. Upstream's own image does
  a `HERMES_UID`/`HERMES_GID` remap dance so a host bind-mount keeps
  matching ownership; that problem doesn't exist here since `/data` is
  Supervisor's own volume, not something a human directly edits from the
  host side. Documented simplification, not an oversight.
- **Required-option safety**: `hermes-gateway` has no required options —
  verified by actually running `gateway run` with an empty
  `options.json`. `hermes-agent` requires a username/password because
  hermes itself refuses to bind a public dashboard without an auth
  provider; both use `options: null` + a non-optional schema type (not
  an empty-string default) so Supervisor blocks Save/Start on a blank
  value, rather than passing validation and failing at runtime with no
  visible error.

## What's verified vs. not

Verified locally with real `docker build` + `docker run` on this
machine — **this Mac is arm64 (Apple Silicon)**, not amd64 (a v1-report
error, corrected here). The deployment target (the HAOS guest) is amd64
per the original brief; both `linux/amd64` and `linux/arm64` were built
with explicit `--platform` flags via `docker buildx`, and both were
run-tested (amd64 under QEMU emulation on this host — functionally
faithful, not a performance benchmark). See each add-on's `DOCS.md` for
exact commands and full output:

- Both images build from the pinned source commit on both archs, and
  both boot cleanly.
- **Measured real image size**: `hermes-gateway` ~250 MiB (amd64:
  259,604,872 B / arm64: 258,453,794 B), `hermes-agent` ~189 MiB (amd64:
  198,425,451 B / arm64: 197,280,509 B) — via `docker image inspect
  --format '{{.Size}}'`, not `docker images`' list view (which
  double-counts shared base layers per-tag and isn't the right metric).
- **Measured idle memory** (amd64, target arch, via QEMU, after 30+s
  uptime): `hermes-gateway` ~106 MiB container / ~126 MB process RSS;
  `hermes-agent` ~137 MiB container / ~158 MB process RSS. Both
  comfortably inside the ~1 GB budget with large margin.
- `hermes-gateway` starts cleanly with zero configuration, and rejects
  `api_server_enabled: true` with no key with a clear log line and
  non-zero exit — not a silent hang.
- A `telegram_bot_token` set through options.json genuinely reaches the
  gateway process, genuinely triggers a real lazy-install of
  `python-telegram-bot` onto `/data/lazy-packages`, and genuinely gets
  rejected by Telegram's real servers (the token is fake) — full round
  trip, not just an env-var-is-set check.
- `extra_env` accepts well-formed `KEY=VALUE` pairs and rejects malformed
  ones with a warning instead of silently dropping or crashing. The new
  numeric tunables (`max_iterations`, `agent_timeout_seconds`, etc.)
  reach the process correctly, and `0` correctly means "leave unset."
- `hermes-agent` refuses to start with blank username/password, and with
  real credentials serves a working login page, accepts the configured
  password (200 + session cookies, real JS bundle hash confirming it's
  the frontend this Dockerfile built), rejects a wrong one (401), and
  persists `HERMES_HOME=/data` correctly.
- The auto-generated dashboard session secret survives a container
  restart instead of invalidating every session on every restart.
- The ingress finding from v1 was re-verified against the rebuilt image
  (byte-identical `/login` response with/without `X-Forwarded-Prefix`)
  — this is app-level behavior, unaffected by the Docker image rebuild.

**Not verified** (explicitly out of scope for this task):

- Actual install/run on a live HAOS Supervisor — plain `docker
  build`/`docker run` only, per the instruction not to touch the live
  guest at 192.168.1.143.
- Real Telegram/Discord/Slack/WhatsApp/Email credentials — only a
  deliberately fake Telegram token was used.
- `ingress: true` for `hermes-agent` — see that add-on's `DOCS.md` for
  the reproduced reason it's not used.
- Long-running memory behavior under real chat/messaging load — only
  idle-after-boot was measured.
- The embedded Chat tab's live `/api/pty` WebSocket round trip against
  this specific rebuild (verified the bundle builds and is served;
  didn't drive a full PTY session).
- No icon/logo images are included — image generation wasn't available
  in this session.

## Repo layout

```
repository.yaml         # Supervisor reads this for the store listing
hermes-gateway/
  config.yaml            # options/schema/ports/arch
  Dockerfile             # pinned-commit source build, no extras
  run.sh                 # options.json -> env, then exec hermes
  README.md
  DOCS.md                # full option reference + verification log
hermes-agent/
  config.yaml
  Dockerfile             # + a discarded Node stage for web/ + ui-tui/
  run.sh
  README.md
  DOCS.md
```
