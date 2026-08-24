# Hermes Agent (dashboard) — details

## What this wraps

`FROM nousresearch/hermes-agent@sha256:143bdb9086bb2db645346179f11091e621ef6b7f4f9e5049ae7454bfeb3a0495`
(same pin as `hermes-gateway` — see that add-on's `DOCS.md` for the
multi-arch verification), plus (as of v1.1) `nginx-light` and one new s6
service — see "ingress: true" below for why.

- `run.sh` — reads `/data/options.json`, exports `extra_env` pairs (the
  only option this add-on has left — see below), then `exec`s
  `/opt/hermes/docker/entrypoint-dispatch.sh dashboard --host 127.0.0.1
  --port 9119 --no-open`.
- `HERMES_HOME=/data` / `HERMES_WRITE_SAFE_ROOT=/data` — same
  persistence redirect as `hermes-gateway`.

## Option → env var mapping

| Option | Env var |
|---|---|
| `extra_env: ["KEY=VALUE", ...]` | each pair exported as-is, after re-validating shape — same escape hatch as `hermes-gateway` |

**v1 history**: earlier versions of this add-on exposed
`username`/`password`/`session_secret`/`public_url`, mapped to
upstream's `HERMES_DASHBOARD_BASIC_AUTH_USERNAME`/`_PASSWORD`/`_SECRET`
and `HERMES_DASHBOARD_PUBLIC_URL` (upstream's bundled zero-infra `basic`
dashboard-auth provider — see `plugins/dashboard_auth/basic/__init__.py`
in the hermes-agent source). Those options are **gone as of v1.1**: the
dashboard now binds loopback (see "ingress: true" below), and
`should_require_auth()` is keyed purely on the bind host — a configured
username/password would have zero effect in that mode, so keeping them
in `schema` would mean shipping options that look like they add security
and don't. The `git log` for this file still has the full v1 reasoning
if this add-on ever needs a non-ingress, direct-port mode again.

## `ingress: true` — the sidebar (v1.1, replaces the direct-port design)

### Why the obvious approach (bind 0.0.0.0, add ingress: true) doesn't work

Investigated and rejected with a real reproduction, not a guess — this
is why v1 shipped a direct port instead:

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
3. Even if header naming were fixed, the **unauthenticated basic-auth
   login page** — the one v1 used, since OAuth needs an external Nous
   Portal account — is a static HTML/JS blob that hardcodes
   root-relative paths regardless of any header:
   ```html
   fetch('/auth/password-login', { ... })
   window.location.assign((data && data.next) || '/')
   src="/fonts/Collapse-Regular.woff2"
   ```
   Confirmed by diffing two real responses from a running container —
   one with `X-Forwarded-Prefix: /api/hassio_ingress/testtoken12345`
   set, one without. **Byte-identical.** The login page does not vary at
   all based on that header. Under `ingress: true` with a 0.0.0.0 bind,
   the login page would load fine but submitting the form would `POST`
   past the ingress mount prefix and 404 against Home Assistant's own
   frontend instead of reaching the add-on.

### The fix: don't fix the login page — make it never load

The login page is only reachable when hermes's own auth gate is
engaged, and that gate is controlled entirely by
`hermes_cli/web_server.py`'s `should_require_auth()`:

```python
def should_require_auth(host: str, allow_public: bool = False) -> bool:
    return host not in _LOOPBACK_HOST_VALUES   # {"localhost", "127.0.0.1", "::1"}
```

Bind hermes to **127.0.0.1** instead of 0.0.0.0, and the gate never
engages at all — no login page, no basic-auth flow, nothing to break
under a path prefix. HA's own login (already required to reach the
ingress URL in the first place) becomes the auth boundary, exactly like
every other ingress-only HA add-on (Node-RED, ESPHome Builder, etc.).

That leaves one problem: something still has to sit between Supervisor's
ingress proxy (which connects on `ingress_port`, 8099) and hermes's now
loopback-only listener. This add-on adds **nginx, running in the same
container**, as a new s6-rc service
(`rootfs/etc/s6-overlay/s6-rc.d/nginx-ingress/`, supervised the same way
as upstream's own `dashboard`/`main-hermes` services) that reverse-proxies
`:8099 → 127.0.0.1:9119`. Two of hermes's own guards had to be satisfied
for that loopback bind to accept nginx's traffic (both in
`hermes_cli/web_server.py`):

1. **`_is_accepted_host()`** — when bound to loopback, only accepts a
   `Host` header in `{localhost, 127.0.0.1, ::1}` (a DNS-rebinding
   defence, GHSA-ppp5-vxwm-4cf7). Supervisor's real Host header would
   otherwise get a 400. Fixed: `proxy_set_header Host 127.0.0.1;`.
2. **`_ws_host_origin_reason()`** — the WebSocket-upgrade path
   (`/api/ws`, `/api/pty` — what the Chat tab actually uses) *also*
   checks the browser's `Origin` header against the same loopback set. A
   real browser's Origin under ingress is Home Assistant's own frontend
   origin (e.g. `https://ha.laris.co`), which would fail that check —
   **but** the same function reads `if not origin: return None` *before*
   the loopback comparison, so a missing Origin passes outright. Fixed:
   `proxy_set_header Origin "";` (stripped, not spoofed — more robust
   against a future hermes release changing the accepted value).

A third guard (`_ws_client_is_allowed`, the actual TCP peer IP) needs no
fix at all: nginx and hermes share this container's network namespace,
so a connection to `127.0.0.1:9119` is loopback-sourced by construction.

Full nginx config: `rootfs/etc/nginx/hermes-ingress.conf` (same file,
comments included, is the primary source of truth — this section
summarizes it).

**Consequence for config.yaml**: since `should_require_auth()` is keyed
purely on the bind host, not on whether credentials are configured,
`username`/`password`/`session_secret`/`public_url` would now be dead
options — set them and nothing changes, hermes's gate still never
engages. They've been removed from `options`/`schema` entirely rather
than left in as options that silently do nothing (the exact
misleading-security-toggle failure class this whole packaging effort
has tried to avoid). `extra_env` is kept as the one remaining option, for
forward-compatible tuning.

## Verification log — v1.1 ingress (2026-08-24)

This is the verification that actually matters for the current design.
Sections 1-4 further below are **v1 history** (the direct-port,
username/password design this replaced) — kept for provenance, no
longer describing what ships today.

### v1.1-1. `nginx-ingress` starts alongside upstream's own services

```
$ docker build -t local/hermes-agent:1.1.0 .
$ docker run -d -p 18099:8099 -v .../data:/data local/hermes-agent:1.1.0
$ docker logs <container>
...
s6-rc: info: service nginx-ingress: starting
s6-rc: info: service main-hermes: starting
s6-rc: info: service dashboard: starting
s6-rc: info: service nginx-ingress successfully started
s6-rc: info: service main-hermes successfully started
s6-rc: info: service dashboard successfully started
...
  Hermes Web UI → http://127.0.0.1:9119
```
Confirms the loopback bind (`127.0.0.1:9119`, not `0.0.0.0:9119`) and
that `nginx-ingress` is a real, running, s6-supervised sibling of
upstream's own services — `docker exec <container> s6-rc -a list`
prints `dashboard`, `main-hermes`, `nginx-ingress` alongside the s6
internals.

### v1.1-2. No login page — the auth gate genuinely never engages

```
$ curl -i http://127.0.0.1:18099/
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
<!doctype html>...<title>Hermes Agent - Dashboard</title>...

$ curl http://127.0.0.1:18099/api/status | jq .auth_required
false
```
Plain `200 OK` on the SPA's root — no `302` to `/login` (contrast with
the v1 log below, which redirects). `auth_required: false` confirms
`should_require_auth()` took the loopback branch.

### v1.1-3. The WebSocket path — the part that actually had to be proven

Both `/api/ws` (the chat tab's event stream) and `/api/pty` (the PTY
bridge — an actual terminal session) tested with a **simulated real
browser under HA ingress**: `Origin: https://ha.laris.co` and
`Host: ha.laris.co` (Home Assistant's own frontend origin, reached
through the same nginx that's supposed to be sitting in the way of a
naive setup), plus the session token scraped from the served page
(`window.__HERMES_SESSION_TOKEN__` — the loopback-mode credential
`_ws_auth_ok()` checks; discovered by reading the guard functions
directly rather than guessing why a bare `curl` upgrade attempt 403'd):

```
$ TOKEN=$(curl -s http://127.0.0.1:18099/ | grep -o '__HERMES_SESSION_TOKEN__="[^"]*"' | sed 's/.*"\(.*\)"/\1/')

$ curl -i --max-time 3 \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Origin: https://ha.laris.co" -H "Host: ha.laris.co" \
    "http://127.0.0.1:18099/api/ws?token=$TOKEN"
HTTP/1.1 101 Switching Protocols
Server: nginx/1.26.3
Connection: upgrade
Upgrade: websocket
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

{"jsonrpc": "2.0", "method": "event", "params": {"type": "gateway.ready", ...}}

$ curl -i --max-time 3 [... same headers ...] "http://127.0.0.1:18099/api/pty?token=$TOKEN"
HTTP/1.1 101 Switching Protocols
...
[15KB of real PTY output — an actual hermes chat session banner, streamed]
```
**A genuine `HTTP/1.1 101 Switching Protocols` on both endpoints**,
through nginx, with a Host/Origin pair that would fail every one of
hermes's own guards if nginx weren't rewriting them — this is the litmus
test the whole architecture stood or fell on, not just the HTTP page
load. Re-ran without a spoofed Origin/Host (hitting `127.0.0.1:9119`
directly, bypassing nginx) and confirmed a bare `curl` upgrade attempt
with no `?token=` genuinely 403s at the HTTP level (Starlette's
behavior for `ws.close()` called pre-`accept()`) — ruling out "nginx
happens to make everything pass" as an alternative explanation.

### v1.1-4. Survives a restart

```
$ docker restart <container>
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18099/
200
```
s6 brings `nginx-ingress` and `dashboard` back up cleanly together.

### v1.1-5. `extra_env` still works (the one remaining option)

```
$ echo '{"extra_env": ["MY_TEST=hello"]}' > options.json
$ docker run -d -p 18100:8099 -v .../data:/data local/hermes-agent:1.1.0
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18100/
200
```
Same options.json → env mechanism as `hermes-gateway`, unaffected by
the ingress rework.

## v1 history: direct-port verification log (2026-08-24, superseded)

Kept for provenance — describes the design v1.1 replaced, not what
ships today. Build host correction: this log originally said "amd64
host"; the actual build host is **arm64** (Apple Silicon) — see
`hermes-gateway/DOCS.md`'s equivalent note.

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

### 6. Real measured image size / idle memory — corrected in two steps

First pass (2026-08-24, arm64 Mac, cross-arch amd64 build):
```
$ docker buildx build --platform linux/amd64 -t local/hermes-agent-full-amd64:1.0.0 --load .
$ docker image inspect local/hermes-agent-full-amd64:1.0.0 --format '{{.Size}}'
952681044
```
Read as ~908 MiB at the time. **Wrong** — this is the same emulated-
cross-arch-measurement artifact documented in full in
`hermes-gateway/DOCS.md` §2b: on an arm64 host, an amd64 image built/
pulled under QEMU/Rosetta is only partially materialized, so none of
`docker images`, `docker image inspect`, or `docker save` agree with
each other or with reality there.

Corrected: this add-on shares the exact same base image as
`hermes-gateway` (same digest, different `CMD` only), which was
natively re-measured on black.local (a real amd64 host, all three tools
agreeing) at **~2.68 GB** (2,678,364,779 bytes). That figure applies
here unchanged — see `hermes-gateway/DOCS.md` §2b for the full
measurement.

```
$ echo '{"username":"admin","password":"S3cretPass!"}' > options.json
$ docker run -d --platform linux/amd64 -p 19198:9119 -v .../data:/data local/hermes-agent-full-amd64:1.0.0
$ curl -X POST http://127.0.0.1:19198/auth/password-login -d '{...}' -> 200
$ docker stats <container> --no-stream --format '{{.MemUsage}}'
171.8MiB / 7.748GiB
```
~172 MiB container memory at idle, with a real successful login already
exercised (not a cold/never-touched boot) — **still measured under
emulation, treat as approximate.** `hermes-gateway`'s real Supervisor
install (134.5 MiB resident, on catlab) is the more trustworthy data
point for this image family; this add-on wasn't independently installed
on a live Supervisor.

For the equivalent numbers on `hermes-agent-lite` (the from-source
minimal profile): `hermes-gateway-lite` was natively re-measured at
~659 MB; `hermes-agent-lite` (which additionally bundles a built
frontend) was not independently re-measured natively, so treat its
~189 MiB figure in `hermes-agent-lite/DOCS.md` as an emulated,
likely-understated number rather than a confirmed one — the real ratio
between full and lite is **~4.07x** (measured on `hermes-gateway`/
`hermes-gateway-lite`, both natively), not the ~4.8x this file
originally reported from two emulated numbers.

## Not verified

- No live HAOS Supervisor install of the v1.1 ingress design
  specifically. The `/api/ws` and `/api/pty` tests above simulate a real
  browser's Host/Origin under ingress as closely as `curl` allows, but
  the real proof is Supervisor actually routing a browser through the
  sidebar panel end to end (real `X-Ingress-Path` header, real cookie
  auth, real click on the sidebar icon) — not yet done. `hermes-gateway`
  (a different add-on) has a real Supervisor install on catlab; this one
  doesn't yet.
- `panel_icon: mdi:robot-happy` wasn't checked against a running HA
  frontend to confirm the icon name resolves to something sensible
  (any invalid MDI name typically just renders a blank/default icon in
  HA's sidebar rather than erroring, so this is low-risk but unverified).
- OAuth-based dashboard auth was not implemented or tested — moot now
  anyway, since the dashboard's own auth gate never engages in loopback
  mode regardless of which provider would otherwise be configured.
- hermes-agent-lite (the minimal-profile sibling) has NOT received the
  same ingress treatment — it still uses the v1 direct-port design. The
  nginx + loopback-bind mechanism is architecture-agnostic (it would
  work identically in front of the lite build's Python backend), but
  porting it there needs a different process-supervision approach since
  lite has no s6-overlay to hang a new service off of (a plain
  background-process-plus-wait pattern in run.sh would do it). Flagging
  as a real gap, not silently leaving it inconsistent.
