# 9Router — details

## Published with explicit security warnings

Everything below is kept as the full record of what was found and built.
The add-on was initially withheld, then published at the repository owner's
explicit request after the pinned 0.5.55 image was checked against the known
patched-version floors. Publication does not erase the remaining risk. A
still-later, third pass over the
advisories (prompted by this repo's own maintainer double-checking the
work below) found the total is **19 advisories: 6 CRITICAL, 11 HIGH, 2
medium**, and two of the CRITICAL ones — **GHSA-vjc7-jrh9-9j86**
(unauthenticated CRUD on `/api/providers` + full API-key leak via
`/api/usage/stats`) and **GHSA-qvfm-67h2-2qfx** (complete
credential/database takeover) — have **no patched version at all**.
Both are added to the table below for completeness.

## Security history — the full research behind README.md's warning

Requested as "the CVE history, do not soften it." What follows is what
was actually found, not just the two identifiers named in the original
brief — the picture turned out to be larger, and then larger again on a
third pass (see the notice above).

### The recurring pattern: header-trust auth bypass, fixed, recurs

| Identifier | Title | Severity | Fixed in |
|---|---|---|---|
| **GHSA-vjc7-jrh9-9j86** | Unauthenticated CRUD on `/api/providers`; full API-key leak via `/api/usage/stats` | **Critical** | **none — unpatched** |
| **GHSA-qvfm-67h2-2qfx** | Complete credential theft and database takeover | **Critical** | **none — unpatched** |
| CVE-2026-10269 | `Host` header spoofing bypasses dashboard `isAuthenticated` (`src/dashboardGuard.js`) | — | 0.4.1 |
| CVE-2026-46339 / GHSA-fhh6-4qxv-rpqj | Unauthenticated RCE via unprotected MCP plugin routes → `child_process.spawn()` | Critical | 0.5.2 |
| CVE-2026-49353 / GHSA-6g2f-w7g3-77vf | **Incomplete fix** for the above: the RCE fix's new "local-only" gate reads `Host`/`Origin` headers (client-controlled) instead of TCP source — bypassed the same way as 2026-10269 | High | (see advisory) |
| GHSA-x5c9-v98j-722r | "Reverse proxy locality collapse allows unauthenticated access to 9router /v1 APIs" — nginx-to-loopback forwarding misread as trusted-local | High | 0.5.2 |
| GHSA-86m2-fcxq-5q7c | "Unauthenticated `/v1` proxy access in 9router@0.4.71 via `Host`-header spoofing → open AI relay + SSRF" | High | (see advisory) |
| GHSA-8gmq-j984-vp4r | Unauthenticated LLM proxy access via `/codex` rewrite authorization bypass | High | (see advisory) |
| GHSA-5mj8-gf6m-fhw8 | Auth bypass in public LLM API via spoofable `X-9r-Real-Ip` header | High | 0.5.6 |
| GHSA-32gc-64m7-hj7v | Login brute-force lockout bypass via the same spoofable `X-9r-Real-Ip` header | Moderate | (see advisory) |
| GHSA-63p9-g54h-prrp | Authenticated RCE via unvalidated MCP plugin arguments | High | 0.5.2 |
| GHSA-vmjq-hvgq-2wv4 | Mass assignment in `PATCH /api/settings` → authorization downgrade | High | (see advisory) |
| GHSA-8g4w-4ffg-8vgx | Authenticated SSRF via OIDC provider test endpoint | High | (see advisory) |
| GHSA-6mwv-4mrm-5p3m | SSRF via Kiro region injection, forwards `Authorization` header | Moderate | (see advisory) |
| GHSA-cmhj-wh2f-9cgx | Image prefetch DNS rebinding → SSRF to internal services | High | (see advisory) |

Full, current list: <https://github.com/decolua/9router/security/advisories>
This DOCS.md's own advisory count grew twice: an initial pass found the
two identifiers in the original brief; checking the security page
directly found 10 GHSA entries plus 2 more CVE-numbered ones from a
separate search (12 total, first table above this note originally
listed); a still-later independent re-check found 19 total (6 CRITICAL,
11 HIGH, 2 medium), including the two unpatched criticals now listed
first in the table. Recorded honestly rather than presenting the final
number as if it were found on the first pass.

**Two more weak-by-default behaviors, found in upstream's own README**,
not advisories but real gaps this add-on doesn't inherit:

- `INITIAL_PASSWORD` unset → falls back to the literal password
  `123456`. This is the exact shape of a separate, already-fixed
  advisory: "9router before 0.4.60 Remote Code Execution via default
  password" (VulnCheck).
- `API_KEY_SECRET` / `MACHINE_ID_SALT` unset → fall back to the literal,
  source-visible strings `endpoint-proxy-api-key-secret` /
  `endpoint-proxy-salt`, identical across every unconfigured install.
- `REQUIRE_API_KEY` unset → `/v1/*` accepts requests with **no
  credential at all**. Upstream's own advisory (GHSA-x5c9-v98j-722r)
  explicitly recommends operators turn this on; it is not the shipped
  default.

## What this add-on changes from upstream's defaults

| Upstream default (unset) | This add-on's default |
|---|---|
| `INITIAL_PASSWORD=123456` | Required, no default — Supervisor blocks Save/Start until set (`options: null` + non-optional `password` schema). |
| `REQUIRE_API_KEY` off | `true` |
| `API_KEY_SECRET` / `MACHINE_ID_SALT` = shared static strings | Auto-generated (32 random bytes, `crypto.randomBytes`) and persisted to `/data/.api-key-secret` / `/data/.machine-id-salt` on first boot — not exposed as user-facing options, since there's no reason an operator would want to hand-pick an HMAC secret. |
| Upstream exposes the app directly | Port 20128 is published to the LAN so the SPA retains a root origin; HA ingress 20129 embeds it in the sidebar. |

## What this wraps

`FROM decolua/9router@sha256:f00fe389ef41a1999dd0d0275ad0c2955d13d176f7c4c5cb844b2f88c293c471`
(`decolua/9router:latest` as pulled 2026-08-24, image-reported version
`0.5.55` — newer than every patched-version floor found above).
Confirmed multi-arch via `docker manifest inspect` (amd64 + arm64).

- Base: Alpine Linux, Node.js only (no python3 — `run.sh` uses `node -e`
  for options.json parsing, unlike the Debian-based hermes/litellm
  add-ons in this repo).
- Upstream's own `/entrypoint.sh` (confirmed by reading it directly out
  of the image):
  ```sh
  #!/bin/sh
  chown -R node:node /app/data /app/data-home 2>/dev/null
  exec su-exec node "$@"
  ```
  Hardcoded to `/app/data`, not `$DATA_DIR`. Since this add-on sets
  `DATA_DIR=/data` (to land on Supervisor's actual persistent volume,
  not the image's un-persisted default path), `run.sh` does its own
  `chown -R node:node /data` **before** handing off to `/entrypoint.sh`
  — otherwise the app would try to write its SQLite DB/secrets as the
  unprivileged `node` user into a root-owned directory and fail.
- The SQLite DB and `jwt-secret` are created **lazily**, on first HTTP
  request that touches auth/DB logic — not at container boot. Confirmed
  by checking `/data` immediately after boot (neither present) vs. after
  one `curl /login` (both present). Not a bug, just a timing detail
  worth knowing if you're checking whether the add-on "really started."

## Networking — why the app is on a published port, not ingress

**2026-08-25: this add-on serves the SPA on a published port (`ports: 20128`) and
uses the ingress panel as a static full-size wrapper around that origin.** An earlier version tried to proxy the
dashboard through HA's ingress with an nginx sidecar rewriting HTML/CSS/JS/fetch
and the History API. It got the first paint but navigation still broke, and the
reason is architectural, not a missing rewrite:

- 9Router is a Next.js App-Router SPA that performs **hard `window.location`
  redirects to root-relative paths** (after login it navigates to `/dashboard` at
  the site root). Under HA's dynamic ingress prefix (`/api/hassio_ingress/<token>/`)
  that escapes the mount and HA answers its own bare `404: Not Found`.
- It builds **absolute API URLs from `window.location.origin`** in ~21 places
  (OAuth authorize/device-code, the `/v1` endpoint display, the CLI-tool cards).
- `window.location` assignment **cannot be intercepted by a reverse proxy**, and
  an OAuth `redirect_uri` can't round-trip through a per-session token path.

So the app runs at a root path on port **20128**, where the full dashboard, the
`/v1` API, and provider OAuth all work — the same way the upstream image runs. The
ingress port (**20129**) serves one static wrapper
(`rootfs/usr/share/9router-launcher/index.html`) that embeds the app from 20128
using the host the viewer reached HA on (`location.hostname`). The SPA remains at
its root origin while the complete UI appears inside the HA sidebar. The wrapper
checks reachability, fills the panel without a second scrollbar, and retains a
new-tab escape hatch for HTTPS/mixed-content and provider-OAuth edge cases.

Verified live on catlab: HA's outer ingress iframe has no sandbox; 9Router sends
neither `X-Frame-Options` nor a `frame-ancestors` CSP; its `SameSite=Lax` session
cookie remains same-site across ports; the authenticated dashboard and Usage page
both render and navigate inside the nested frame.

**Security note:** publishing the port widens the surface to the LAN. It is
acceptable here because `require_api_key` is on and `initial_password` is
mandatory, and this is a LAN box. Do NOT point a tunnel at :20128 without further
hardening — see SECURITY.md.

## Verification log (2026-08-24)

### 1. Both archs confirmed published

```
$ docker manifest inspect decolua/9router:latest
  "architecture": "amd64", "os": "linux"
  "architecture": "arm64", "os": "linux"
```

### 2. Upstream's own weak defaults, confirmed directly (not just from the README)

```
$ docker run -d -p 20128:20128 decolua/9router:latest    # no env at all
$ curl http://127.0.0.1:20128/v1/models
{"data":[],"object":"list"}                                # no auth needed — confirms REQUIRE_API_KEY off by default
```

### 3. `REQUIRE_API_KEY=true` genuinely enforces auth

```
$ docker run -d -p 20129:20128 -e REQUIRE_API_KEY=true -e INITIAL_PASSWORD=... decolua/9router:latest
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:20129/v1/models
401
```

### 4. This add-on: fails loud with no initial_password

```
$ echo '{}' > options.json
$ docker run --name 9r-noauth -v .../data:/data local/9router:1.0.0
[9router] ERROR: initial_password must be set in this add-on's Configuration tab.
[9router] Upstream's own default (INITIAL_PASSWORD unset) falls back to the literal password '123456' — the exact weakness behind a prior 9router RCE advisory. Set a real one.
$ docker inspect 9r-noauth --format '{{.State.ExitCode}}'
1
```

### 5. Starts clean with credentials; require_api_key defaults to true in THIS add-on

```
$ echo '{"initial_password":"My-Strong-Pw-123"}' > options.json
$ docker run -d -p 20140:20128 -v .../data:/data local/9router:1.0.0
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:20140/v1/models
401
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:20140/login
200
```
No `REQUIRE_API_KEY` was set in options.json for this run — the 401
confirms `run.sh`'s default-to-true behavior, not an explicit override.

### 6. Auto-generated secrets persisted, ownership correct

```
$ ls -la .../data
-rw-------  .api-key-secret
-rw-------  .machine-id-salt
(after one request:) -rw-------  jwt-secret
$ docker exec <container> stat -c '%U:%G' /data
node:node
```

## Not verified

- The `{repo}_{slug}` internal-hostname convention for add-on-to-add-on
  `/v1` access was not confirmed against a real installed instance of
  this specific repo (see the networking section above).
- No real provider API key or actual completion request was tested —
  only the auth-gate and config/secret mechanics.
- A real provider OAuth flow inside the nested frame was not exercised. Some
  identity providers reject framing; use the wrapper's new-tab escape hatch.
- Virtual-key/spend-tracking or any provider-fallback feature was not
  exercised.
- Image size / idle memory not measured.
