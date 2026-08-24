# Hermes Agent (dashboard) — details

## What this wraps

`FROM nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495`
(same pin as `hermes-gateway` — see that add-on's `DOCS.md` for the
multi-arch verification), unmodified, plus:

- `run.sh` — reads `/data/options.json`, exports the matching env vars,
  auto-generates/persists a session secret if none was supplied, then
  `exec`s `/opt/hermes/docker/entrypoint-dispatch.sh dashboard --host
  0.0.0.0 --port 9119 --no-open`.
- `HERMES_HOME=/data` / `HERMES_WRITE_SAFE_ROOT=/data` — same
  persistence redirect as `hermes-gateway`.

## Option → env var mapping

| Option | Env var |
|---|---|
| `username` | `HERMES_DASHBOARD_BASIC_AUTH_USERNAME` |
| `password` | `HERMES_DASHBOARD_BASIC_AUTH_PASSWORD` |
| `session_secret` (or the auto-generated `/data/.dashboard_secret`) | `HERMES_DASHBOARD_BASIC_AUTH_SECRET` |
| `public_url` | `HERMES_DASHBOARD_PUBLIC_URL` |

These are upstream's own documented env vars for the bundled
zero-infrastructure `basic` dashboard-auth provider — see
`plugins/dashboard_auth/basic/__init__.py` in the hermes-agent source
(`HERMES_DASHBOARD_BASIC_AUTH_USERNAME` / `_PASSWORD` / `_SECRET`).

## Why `username`/`password` are required with no default

Upstream's dashboard **refuses to bind a non-loopback host without a
registered auth provider** — verified directly (see below): binding
`0.0.0.0:9119` with no credentials configured produces a clear
`Refusing to bind dashboard to 0.0.0.0 — the auth gate engages on
non-loopback binds...` error and the process exits.

Given that, the only two sane choices for `config.yaml` are:

1. `options: {username: "", password: ""}` + `schema: {username: str?,
   password: password?}` — technically valid, but an empty string
   satisfies `str?`, so Supervisor would let the add-on save/start with
   a blank password. hermes itself would still refuse to bind — so this
   *does* fail loud rather than silently — but it's the same shape of
   bug the packaging brief called out (Advanced SSH's empty required
   password), just caught one layer down instead of zero.
2. `options: {username: null, password: null}` + `schema: {username:
   str, password: password}` (no `?`) — what this add-on actually uses.
   Per Home Assistant's own add-on config docs: *"Set values to `null`
   or omit them to make options mandatory."* This makes Supervisor treat
   the fields as genuinely unset and required, blocking Save/Start in
   the UI until both are filled in — the failure surfaces at
   configuration time, in the Supervisor UI, instead of at container
   boot in the log.

`run.sh` also checks both are non-empty before exporting anything, as a
second line of defense, with a message naming the Supervisor option
(`username`/`password` in "this add-on's Configuration tab") rather than
just the env var — since a HAOS user configuring this through the UI has
never seen `HERMES_DASHBOARD_BASIC_AUTH_USERNAME`.

## Why no `ingress: true`

Investigated and rejected with a real reproduction, not a guess:

1. Home Assistant Supervisor's ingress proxy injects `X-Ingress-Path`
   (confirmed via Home Assistant's own developer docs: *"Ingress adds a
   request header `X-Ingress-Path` which may be filtered to obtain the
   base URL."*).
2. hermes's dashboard path-prefix logic
   (`hermes_cli/dashboard_auth/prefix.py`, exercised by
   `tests/hermes_cli/test_dashboard_auth_prefix.py` upstream) only reads
   `X-Forwarded-Prefix`. The upstream test suite is explicitly aware of
   Home Assistant — it has a test literally named
   `test_home_assistant_ingress_prefix_with_subpath_is_accepted` and
   hardcodes the exact HA-shaped prefix
   (`/api/hassio_ingress/<64-char-token>/dashboard`) — but tests it via
   the `X-Forwarded-Prefix` header, not `X-Ingress-Path`. Nothing in the
   codebase translates one into the other.
3. Even if header naming were fixed (e.g. by a local nginx shim
   translating `X-Ingress-Path` → `X-Forwarded-Prefix`), the
   **unauthenticated basic-auth login page** — the one this add-on
   actually uses, since OAuth needs an external Nous Portal account — is
   a static HTML/JS blob that hardcodes root-relative paths regardless
   of any header:
   ```html
   fetch('/auth/password-login', { ... })
   window.location.assign((data && data.next) || '/')
   src="/fonts/Collapse-Regular.woff2"
   ```
   Confirmed by diffing two real responses from a running container —
   one with `X-Forwarded-Prefix: /api/hassio_ingress/testtoken12345`
   set, one without. **Byte-identical.** The login page does not vary at
   all based on that header.

Net effect under `ingress: true`: the login page would load fine (HA's
proxy forwards the initial GET), but submitting the form would `POST` to
`<ingress-root>/auth/password-login` — past the ingress mount prefix —
which 404s against Home Assistant's own frontend routing instead of
reaching the add-on. A direct port sidesteps this completely and is
provably correct (see the login round-trip test below).

## Verification log (2026-08-24, Docker Desktop 29.6.2 on macOS)

**Correction**: this log originally said "amd64 host." The build host is
actually **arm64** (Apple Silicon). See `hermes-gateway/DOCS.md`'s
equivalent note for the full explanation — same correction applies here.

### 1. Refuses to start with no credentials

```
$ echo '{}' > options.json
$ docker run --name ag-noauth -v .../data:/data local/hermes-agent-amd64:1.0.0
[hermes-agent] ERROR: username and password must both be set in this add-on's Configuration tab.
[hermes-agent] The dashboard binds 0.0.0.0 and hermes refuses to serve an unauthenticated public dashboard.
$ docker inspect ag-noauth --format '{{.State.ExitCode}}'
1
```

### 2. Starts clean and serves a real login flow with credentials

```
$ echo '{"username": "admin", "password": "S3cretPass!"}' > options.json
$ docker run -d -p 19120:9119 -v .../data:/data local/hermes-agent-amd64:1.0.0
$ curl -i http://127.0.0.1:19120/
HTTP/1.1 302 Found
location: /login?next=%2F

$ curl -i -X POST http://127.0.0.1:19120/auth/password-login \
    -H 'Content-Type: application/json' \
    -d '{"provider":"basic","username":"admin","password":"S3cretPass!","next":""}'
HTTP/1.1 200 OK
set-cookie: hermes_session_at=...; HttpOnly; Max-Age=43200; Path=/; SameSite=lax
set-cookie: hermes_session_rt=...; HttpOnly; Max-Age=2592000; Path=/; SameSite=lax
{"ok":true,"next":"/"}

$ curl -i -X POST http://127.0.0.1:19120/auth/password-login \
    -H 'Content-Type: application/json' \
    -d '{"provider":"basic","username":"admin","password":"WRONG","next":""}'
HTTP/1.1 401 Unauthorized
```

### 3. `/data` (HERMES_HOME) is genuinely populated

```
$ ls .../data
.dashboard_secret  .env  audio_cache  backups  cache  config.yaml  cron
home  hooks  image_cache  lazy-packages  logs  memories  options.json
pairing  plans  platforms  ...
```

### 4. Session secret survives a restart

```
$ SECRET_BEFORE=$(cat .../data/.dashboard_secret)
$ docker restart ag-ok
$ SECRET_AFTER=$(cat .../data/.dashboard_secret)
$ [ "$SECRET_BEFORE" = "$SECRET_AFTER" ] && echo PASS
PASS
```

### 5. Base image / multi-arch build

Same as `hermes-gateway` — see that add-on's `DOCS.md` §1-2. Both
`local/hermes-agent-amd64:1.0.0` and `local/hermes-agent-aarch64:1.0.0`
were built and the arm64 image was confirmed
(`docker image inspect --format '{{.Architecture}}'` → `arm64`) and run
under QEMU emulation.

### 6. Real measured image size / idle memory (2026-08-24, follow-up pass)

Redone with explicit `--platform` and the correct per-image size metric
(`docker image inspect --format '{{.Size}}'`, not `docker images`' list
view, which had produced a misleading multi-GB figure in an earlier
draft — see `hermes-gateway/DOCS.md`'s equivalent section for the full
explanation):

```
$ docker buildx build --platform linux/amd64 -t local/hermes-agent-full-amd64:1.0.0 --load .
$ docker image inspect local/hermes-agent-full-amd64:1.0.0 --format '{{.Size}}'
952681044
```
**~908 MiB** (essentially identical to `hermes-gateway`'s size — same
underlying image, different `CMD`).

```
$ echo '{"username":"admin","password":"S3cretPass!"}' > options.json
$ docker run -d --platform linux/amd64 -p 19198:9119 -v .../data:/data local/hermes-agent-full-amd64:1.0.0
$ curl -X POST http://127.0.0.1:19198/auth/password-login -d '{...}' -> 200
$ docker stats <container> --no-stream --format '{{.MemUsage}}'
171.8MiB / 7.748GiB
```
~172 MiB container memory at idle, with a real successful login already
exercised (not a cold/never-touched boot).

For the equivalent numbers on `hermes-agent-lite` (the from-source
minimal profile) — ~189 MiB image / ~137 MiB container / ~158 MB process
RSS — see `hermes-agent-lite/DOCS.md`. The gap is real (~4.8x on disk,
~1.25x on idle memory) but far smaller than the number that originally
motivated building a minimal profile at all.

## Not verified

- No live HAOS Supervisor install, and therefore no real end-to-end test
  of the direct-port networking through Supervisor's actual bridge
  network (only a plain `docker run -p` port publish was tested).
- OAuth-based dashboard auth (the alternative to `username`/`password`)
  was not implemented or tested — it needs an external Nous Portal
  account and was out of scope for a zero-infra default.
