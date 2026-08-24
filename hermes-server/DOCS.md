# Hermes Server — details

## What this wraps

`FROM nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495`
(same pin as `hermes-gateway`/`hermes-agent`), unmodified, running
`hermes serve` instead of `hermes gateway run` or `hermes dashboard`.

Confirmed directly (`hermes serve --help` inside the published image)
that `serve` shares its full option surface with `dashboard`: `--host`
(default `127.0.0.1`), `--port` (default `9119`), `--insecure`
(deprecated no-op, same as dashboard), `--skip-build`, `--isolated`,
`--stop`, `--status`. Upstream's own `cli-commands.md` describes it as
*"the same server `hermes dashboard` runs, but headless: it never opens
a browser UI... Requires the `[web]` extra; the embedded Chat socket
additionally needs `[pty]`."*

## Why this add-on exists separately from `hermes-agent`

`hermes-agent` and `hermes-server` are literally the same underlying
FastAPI/uvicorn application (`hermes_cli/web_server.py`) launched two
different ways:

- `hermes dashboard` — opens a browser automatically, meant for a human
  sitting at the keyboard where the process runs. Packaged as
  `hermes-agent` in this repo, reached via HA's sidebar (ingress,
  loopback bind, no login — see `hermes-agent/DOCS.md`).
- `hermes serve` — never opens a browser, meant to be a headless
  backend a *different* machine (Hermes Desktop, or a custom remote
  client) connects to over the network. Packaged here as
  `hermes-server`, reached via a real published port with real
  credentials.

The loopback-bind-plus-ingress trick that removes the login page for
`hermes-agent` **does not apply here** — the whole point of `hermes
serve` is to be reachable from a *different* machine than the one it
runs on, which by definition means a non-loopback bind, which means the
auth gate genuinely has to engage. There is no login-page-hardcodes-
root-relative-paths problem to work around either, since there's no HA
ingress involved at all — Hermes Desktop is a native client hitting a
JSON API/WebSocket directly, not a browser rendering an HTML page
through a proxy.

## Option → env var mapping

| Option | Env var |
|---|---|
| `username` | `HERMES_DASHBOARD_BASIC_AUTH_USERNAME` |
| `password` | `HERMES_DASHBOARD_BASIC_AUTH_PASSWORD` |
| `session_secret` (or the auto-generated `/data/.dashboard_secret`) | `HERMES_DASHBOARD_BASIC_AUTH_SECRET` |
| `extra_env: ["KEY=VALUE", ...]` | each pair exported as-is, after re-validating shape |

Same env vars as `hermes-agent`'s original (v1) design and the same
`dashboard_auth/basic` provider — confirmed by the identical error text
both commands produce when unconfigured (see verification below): both
reference `dashboard.basic_auth.username` / `password_hash` in
config.yaml and the same `hash_password()` helper.

## Why `username`/`password` are required with no default

Same reasoning and same `options: null` + non-optional `schema` type
pattern as `hermes-agent`'s original design (see that add-on's git
history / "v1 history" section in its `DOCS.md`) — an empty-string
default would satisfy schema validation and let the add-on start with
no real password, which is exactly the failure class this packaging
effort has tried to avoid throughout. Here it's not just a style choice:
`hermes serve --host 0.0.0.0` **genuinely refuses to bind** without a
configured auth provider (verified below), so a blank credential would
either be silently useless or actively fail at boot with no add-on-level
context — naming the Supervisor option in `run.sh`'s own check gets the
user to the fix faster either way.

## Verification log (2026-08-24)

Build host: arm64 Mac (Apple Silicon) — see `hermes-gateway/DOCS.md` for
the general note on why amd64 image-size measurements from this host
aren't trusted; functional behavior (what's tested here) isn't
arch-sensitive the way image size is.

### 1. `hermes serve` shares the dashboard's auth gate exactly

```
$ docker run --rm -v .../opt/data:/opt/data <image> serve --host 0.0.0.0 --port 9877 --no-open
...
Refusing to bind dashboard to 0.0.0.0 — the auth gate engages on non-loopback binds (0.0.0.0), but no auth providers are registered.

Configure an auth provider before exposing the dashboard:
  • Password: set dashboard.basic_auth.username + password_hash in config.yaml
    (hash with: python -c "from plugins.dashboard_auth.basic import hash_password; print(hash_password('your-password'))")
  • OAuth: run `hermes dashboard register` (Nous Portal) or install a DashboardAuthProvider plugin.
```
Note the error literally says "Refusing to bind **dashboard**" and
references `dashboard.basic_auth` even though the command run was
`serve` — direct confirmation this is the same auth subsystem, not a
separate one that happens to behave similarly.

### 2. This add-on's own shim: fails loud before even reaching hermes

```
$ echo '{}' > options.json
$ docker run --name srv-noauth -v .../data:/data local/hermes-server:1.0.0
[hermes-server] ERROR: username and password must both be set in this add-on's Configuration tab.
[hermes-server] hermes serve binds 0.0.0.0 and refuses to serve an unauthenticated public backend.
$ docker inspect srv-noauth --format '{{.State.ExitCode}}'
1
```

### 3. Starts clean with credentials, real login round trip

```
$ echo '{"username":"admin","password":"S3cretPass!"}' > options.json
$ docker run -d -p 19400:9119 -v .../data:/data local/hermes-server:1.0.0
$ docker logs <container> | tail -3
HERMES_BACKEND_READY port=9119
  Hermes backend listening on 0.0.0.0:9119
```
Note the ready banner is genuinely different from `hermes dashboard`'s
(`Hermes Web UI → http://...`) — further confirmation this is a
distinct launch mode of the same app, not a copy-paste artifact.

```
$ curl http://127.0.0.1:19400/api/status | jq '.auth_required, .auth_providers'
true
["basic"]

$ curl -i -X POST http://127.0.0.1:19400/auth/password-login \
    -d '{"provider":"basic","username":"admin","password":"S3cretPass!","next":""}'
HTTP/1.1 200 OK
set-cookie: hermes_session_at=...; HttpOnly; Max-Age=43200; Path=/; SameSite=lax
{"ok":true,"next":"/"}
```
This matches upstream's own documented verification recipe for a remote
dashboard exactly (`website/docs/user-guide/features/web-dashboard.md`:
*"check that the dashboard advertises the username/password provider...
`auth_required: true` and `"basic"` in the providers list → Desktop's
Sign in flow will work"*).

## Not verified

- No live HAOS Supervisor install — plain `docker build`/`docker run`
  only.
- A real Hermes Desktop client was not driven against this add-on (only
  the same HTTP endpoints Desktop's own readiness/login flow uses, per
  upstream's documented verification recipe above).
- Image size / idle memory not separately measured for this add-on — it
  shares `hermes-agent`'s base image exactly (same digest), so
  `hermes-gateway`/`hermes-agent`'s native black.local measurement
  (~2.68 GB) applies here too, but wasn't independently re-confirmed for
  this specific build.
