# Hermes Agent (lite, dashboard) — details

## Why this add-on exists, and why it is NOT the recommended default

Same as `hermes-gateway-lite` — see that add-on's `DOCS.md` for the full,
honest history (the ~1 GB HAOS-guest budget that originally motivated
this add-on was based on a bad size measurement — the full wrapped image
is really ~908 MiB, not the ~3.93 GB first reported — and that guest
target turned out not to be the right one anyway). Read that file first
if you haven't; it isn't repeated in full here.

**`hermes-agent` (no "lite" suffix) is the recommended default.** This
add-on trades a modest size reduction (~189 MiB vs. ~908 MiB) for a real
cost: `TERMINAL_ENV=local` (no code-exec sandbox) and a from-source
build instead of upstream's own tested distribution channel. That
tradeoff matters *more* here than for the gateway, since this add-on's
whole point is the Chat tab, which is exactly where the sandbox would
matter.

The dashboard is the harder half of that redirect: **it genuinely needs
a built frontend**, unlike the gateway. Confirmed the PyPI wheel does
NOT bundle it — `pyproject.toml`'s `[tool.setuptools.package-data]`
only ships `hermes_cli/observability/schemas/*.json` and
`gateway/assets/**/*`, nothing under `hermes_cli/web_dist`. So this
add-on still runs a Node build stage, but a much narrower one than
upstream's Dockerfile:

- Builds **only** `web/` (the dashboard SPA) and `ui-tui/` (the
  prebuilt Chat-tab bundle — see below for why this one still matters).
- Does **not** install Playwright (that's a *runtime* dependency of the
  agent's Python-side browser tool, not something the frontend build
  needs at all).
- Does **not** install the matrix/bedrock/azure/hindsight/anthropic/otlp
  Python extras — same reasoning as `hermes-gateway-lite`.
- Prunes `apps/*` (except `apps/shared`, needed as a `file:` workspace
  dependency of `web/package.json`) and `tests-js` before `npm install`
  resolves the root `package.json`'s `workspaces` array — otherwise npm
  would also try to install `apps/desktop` (Electron — hundreds of MB,
  irrelevant to a headless add-on).

## Why build BOTH halves from the same pinned git commit (not PyPI + git)

`hermes-gateway-lite` uses `pip install -e` from the pinned commit because a
plain `pip install hermes-agent` from PyPI would have worked just as
well there (gateway needs no frontend, so there's nothing to keep in
sync). The dashboard is different: mixing a PyPI-published Python
package (currently `0.19.0`) with a **separately** git-cloned frontend
build (from commit `d1afa1605`, whose `pyproject.toml` says `0.19.1`)
would build two halves of the same app from two different, unrelated
points in history — a real risk of API drift between the SPA's
`fetch()` calls and the backend's actual routes. Upstream's own git tags
are CalVer (`v2026.6.19`) and don't map 1:1 onto PyPI's SemVer, so there
is no obvious way to find "the git commit that matches PyPI 0.19.0"
without deeper archaeology. Building both the frontend and the backend
from the **same** pinned commit sidesteps the whole question — it's
guaranteed internally consistent even though it isn't the literal PyPI
release.

## What this wraps

Same commit pin as `hermes-gateway-lite`: `d1afa16053a3777849c2b5465d59a0147b2172f9`
(verified reachable via `git fetch --depth 1 origin <sha>` from the
public repo). Base image: `python:3.13-slim-trixie` for the final stage,
`node:26-bookworm-slim` for the (discarded) frontend builder stage —
matching upstream's own Node version choice, though the repo's actual
`engines.node` floor is `>=22.22.0`.

Same editable-install requirement and reasoning as `hermes-gateway-lite`
(upstream's `setup.py` refuses a normal wheel/sdist build) — `pip
install -e /opt/hermes-src`, no extras. The built frontend lands at
`/opt/hermes-web/web_dist` and `/opt/hermes-web/ui-tui`, deliberately
**outside** `/opt/hermes-src` so a future re-install of the Python
package can't accidentally clobber them; `HERMES_WEB_DIST` /
`HERMES_TUI_DIR` point there explicitly.

No custom SQLite build here either — same self-mitigation via
`journal_mode=DELETE` as `hermes-gateway-lite` (see that add-on's DOCS.md for
the actual log line). Same `TERMINAL_ENV=local` tradeoff for the
embedded Chat tab's agent tool calls — see that add-on's DOCS.md for the
full writeup; it applies identically here since the Chat tab runs the
same agent loop as the gateway does.

## Option → env var mapping

Unchanged from v1 — this is app-level configuration, not Docker-image
plumbing, so the redirect from wrapping upstream's image to building our
own didn't touch it:

| Option | Env var |
|---|---|
| `username` | `HERMES_DASHBOARD_BASIC_AUTH_USERNAME` |
| `password` | `HERMES_DASHBOARD_BASIC_AUTH_PASSWORD` |
| `session_secret` (or the auto-generated `/data/.dashboard_secret`) | `HERMES_DASHBOARD_BASIC_AUTH_SECRET` |
| `public_url` | `HERMES_DASHBOARD_PUBLIC_URL` |

## Why `username`/`password` are required with no default

Unchanged from v1 — see that reasoning below, still verified against
this rebuilt image (§2).

Upstream's dashboard **refuses to bind a non-loopback host without a
registered auth provider**. The `options: null` + non-optional `schema`
type pattern (not an empty-string default) is what makes Supervisor
treat the fields as genuinely required and block Save/Start on a blank
value — per Home Assistant's own add-on config docs: *"Set values to
`null` or omit them to make options mandatory."*

## Why no `ingress: true`

Unchanged from v1, and **re-verified against this rebuilt image** on
2026-08-24 (byte-identical `/login` response with and without
`X-Forwarded-Prefix` set — this is app-level behavior in
`hermes_cli/web_server.py` / the built SPA, not something the Docker
image rebuild could have changed). See the full writeup and the
Home-Assistant-ingress-specific test-suite evidence in the v1 history of
this file (same reasoning, unchanged): HA's Supervisor sends
`X-Ingress-Path`, hermes only reads `X-Forwarded-Prefix`, and the
basic-auth login page hardcodes root-relative paths regardless of either
header.

## Verification log (2026-08-24)

Build host: this Mac is **arm64** (Apple Silicon) — see
`hermes-gateway-lite/DOCS.md` for the same correction. Target guest is amd64.

### 1. Builds fast — real minutes, not upstream's 15-45

```
$ time docker build -t local/hermes-agent-min:1.0.0 .
...
real   0m35.9s
```
(First build; Docker layer caching makes subsequent builds faster still.)

### 2. Both archs build and boot

```
$ docker buildx build --platform linux/amd64 -t local/hermes-agent-amd64:2.0.0 --load .
$ docker buildx build --platform linux/arm64 -t local/hermes-agent-arm64:2.0.0 --load .
$ docker image inspect local/hermes-agent-amd64:2.0.0 --format '{{.Size}} {{.Architecture}}'
198425451 amd64
$ docker image inspect local/hermes-agent-arm64:2.0.0 --format '{{.Size}} {{.Architecture}}'
197280509 arm64
```
**~188-189 MiB real image size** — smaller than the gateway's ~250 MiB
image despite including the built frontend, because it doesn't need
`nemo-relay`'s platform-marker pulls the same way and the frontend
assets themselves are small (a few MB of minified JS/CSS) compared to
Python dependency wheels. Both real, both built with explicit
`--platform`, no QEMU-vs-native ambiguity in the numbers.

### 3. Refuses to start with no credentials (same as v1)

```
$ echo '{}' > options.json
$ docker run --name ag-noauth -v .../data:/data local/hermes-agent-min:1.0.0
[hermes-agent] ERROR: username and password must both be set in this add-on's Configuration tab.
[hermes-agent] The dashboard binds 0.0.0.0 and hermes refuses to serve an unauthenticated public dashboard.
$ docker inspect ag-noauth --format '{{.State.ExitCode}}'
1
```

### 4. Real login round trip, on both the native build and amd64-via-QEMU

```
$ echo '{"username": "admin", "password": "S3cretPass!"}' > options.json
$ docker run -d -p 19121:9119 -v .../data:/data local/hermes-agent-min:1.0.0
$ curl -i http://127.0.0.1:19121/
HTTP/1.1 302 Found
location: /login?next=%2F

$ curl -i -X POST http://127.0.0.1:19121/auth/password-login \
    -d '{"provider":"basic","username":"admin","password":"S3cretPass!","next":""}'
HTTP/1.1 200 OK
set-cookie: hermes_session_at=...; HttpOnly; Max-Age=43200; Path=/; SameSite=lax
{"ok":true,"next":"/"}

$ curl -b cookies.txt http://127.0.0.1:19121/
HTTP/1.1 200            # authenticated page, real SPA bundle:
<script type="module" crossorigin src="/assets/index-DzvhJ1Gp.js">
```
The served JS bundle hash (`index-DzvhJ1Gp.js`) confirms this is the
frontend **this Dockerfile built**, not a cached/vendored copy.
Repeated on the amd64 (QEMU) image with the same result (200 OK login,
container logged "→ Using web dist from HERMES_WEB_DIST:
/opt/hermes-web/web_dist").

### 5. Idle memory (amd64, target arch, via QEMU)

```
$ docker stats <container> --no-stream --format '{{.MemUsage}}'
137.2MiB / 7.748GiB
$ docker exec <container> sh -c 'grep VmRSS /proc/1/status'
VmRSS:  158432 kB
```
For comparison, `hermes-agent` (the full, wrapped-image variant)
measured ~172 MiB container memory under the same test (real login,
same idle wait) — real, but only about 1.25x higher, not a dramatic gap.
Image size is the bigger, more genuine difference: ~189 MiB here vs.
~908 MiB for the full variant (measured with `docker image inspect`,
correcting an earlier draft's inflated multi-GB figure).

### 6. Session secret survives a restart (unchanged behavior, re-verified)

```
$ SECRET_BEFORE=$(cat .../data/.dashboard_secret)
$ docker restart ag-ok
$ SECRET_AFTER=$(cat .../data/.dashboard_secret)
$ [ "$SECRET_BEFORE" = "$SECRET_AFTER" ] && echo PASS
PASS
```

### 7. `/data` (HERMES_HOME) genuinely populated

Same result as v1 — `config.yaml`, `sessions/`, `.dashboard_secret`,
`memories/`, etc. all land under the mounted `/data` volume.

## Not verified

- No live HAOS Supervisor install — plain `docker build`/`docker run`
  only, per the task's constraint not to touch the live guest.
- OAuth-based dashboard auth was not implemented or tested (needs an
  external Nous Portal account).
- The embedded Chat tab's actual `/api/pty` WebSocket round trip (a
  live terminal session) was not driven end-to-end — verified the
  ui-tui bundle builds and is served (`ui-tui/dist/entry.js`, 3.5 MB per
  the build log), and verified the same code path in the v1 wrapped
  image worked, but did not re-drive a live PTY session against this
  specific rebuild.
- Long-running memory behavior under actual chat use (only idle-after-
  boot was measured).
