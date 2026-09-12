# maw add-on — how it works, and what had to be measured

Everything here was verified against a running instance. Where a claim came
from a document rather than an observation, it says so.

## Shape

```
browser
  └─ HA ingress  /api/hassio_ingress/<token>/     (authenticated by HA)
       └─ nginx  :8343                            (this add-on)
            ├─ /            → maw serve /index.html   (+ rewrites, see below)
            ├─ /addon-button.js → static file
            ├─ /addon/session   → session-api.py :8399
            └─ /*          → maw serve :3461
                 └─ maw serve  127.0.0.1:3461     (loopback only)
                      └─ tmux
```

`maw serve` is bound to loopback on purpose: nginx is the only thing that may
reach it, so nothing sharing the network can skip the proxy and use the bearer
token nginx would otherwise be adding.

## The five things that had to be fixed for ingress

maw-ui is a Vite SPA built for a root-mounted deployment. Supervisor serves
add-ons under `/api/hassio_ingress/<token>/` and strips that prefix before
proxying, so every root-absolute URL in the app leaves the ingress path and
lands on Home Assistant instead. Each of these was a separate failure with a
different symptom.

**1. Asset URLs in the HTML.** `/assets/main-*.js` → 404 from HA; the same
file as `assets/main-*.js` → 200 through ingress. Symptom: correct
`<title>ARRA Office</title>`, empty `#root`, because not one script tag
resolved. Fixed with nginx `sub_filter` making them relative — safe because
the ingress URL always ends in `/`.

**2. Asset URLs built at runtime.** The bundle carries Vite's own preload
helper with the base baked in:

```js
const qe="modulepreload",Ge=function(n){return"/"+n}
```

That builds every lazily-loaded route's CSS URL, which `sub_filter` on the
HTML never sees. Symptom: the app loads, then breaks on navigation with
"Something crashed — Unable to preload CSS for /assets/useWebSocket-*.css".
Patched at image build time, and **the build fails if the pattern is absent**,
so a maw-ui bump that changes this shape has to be looked at rather than
silently un-fixed.

**3. API and WebSocket URLs.** maw-ui builds these from an optional `?host=`
query parameter, falling back to the origin root:

```js
function sd(M){const k=_s();return k?`${k.httpProto}//${k.host}${M}`:M}
function ed(M){const k=_s();return k?`${k.wsProto}//${k.host}${M}`:`ws://${location.host}${M}`}
```

Symptom: UI renders, then sits on "Connection lost / Reconnecting…" with 403s
on `api/ui-state`, `api/asks`, `api/teams` and a failed `ws://<ha-host>/ws`.
nginx now redirects the bare page to itself with `?host=` filled in from
Supervisor's headers — maw-ui's own supported parameter, so no bundle patching.

Both headers were probed live rather than trusted from the add-on docs:

```
x-ingress-path=[/api/hassio_ingress/<token>]  xfp=[http]
```

The redirect target is percent-encoded. Unencoded it reads
`?host=http://…`, and a strict URL parser takes everything before that first
colon as a scheme — bun's `fetch` rejects the redirect with
`UnsupportedRedirectProtocol`, which broke this repo's own verification
tooling.

**4. Origin allowlist.** Every module script and stylesheet carries
`crossorigin`, so the browser sends `Origin`, and maw serve enforces an
allowlist. Measured: with `Origin: http://<ha-host>` an asset returns 403,
without one it returns 200, and `*` is **not** accepted as a wildcard.
Symptom: 403 on every chunk and a stylesheet rejected for MIME type
`application/json` — that JSON was maw serve's own error body. nginx rewrites
`Origin` to a fixed value that `run.sh` allowlists.

**5. Bearer token.** maw serve says so itself at startup:

```
maw-rs serve auth: open (no token — browser clients refused; set MAW_SERVE_TOKEN to authenticate them)
```

A browser cannot be prompted for a bearer, so the token is generated once,
persisted to `/data`, and injected by nginx. Verified both `Authorization:
Bearer` and `?token=` produce a 101 on `/ws`.

## tmux

`maw serve` shells out to tmux for `/api/teams` and the fleet views. Two
things bit here:

- **`tmux start-server` is not enough**, despite exiting 0 — `tmux ls`
  immediately afterwards still reports "no server running", because a server
  with no sessions has nothing keeping it alive. One detached session fixes
  it; `/api/teams` goes 503 → 200.
- **`tmux -t` matches by prefix.** With any session named `maw-<something>`
  present — which is exactly what the **+ session** button suggests by
  default — `has-session -t maw` succeeds while the `maw` session is gone, so
  the watchdog never fires. Found in live use. `-t =maw` forces exact match:
  verified `-t maw` exits 0 against `maw-abcd` while `-t =maw` exits 1.

## Other things worth knowing

- **`nginx -c` replaces `/etc/nginx/nginx.conf` entirely**, including the
  Debian package's `user www-data;`. Without restoring it the worker runs as
  `nobody(65534)`, cannot read the credential files `run.sh` writes, and every
  request 500s with "Permission denied".
- **`python3`, not `python3-minimal`.** The minimal package is a stripped
  interpreter with no `http.server`; the session endpoint dies at import with
  `ModuleNotFoundError: No module named 'http'`. Other add-ons in this repo use
  `python3-minimal` safely because they only ever parse JSON.
- **`MAW_UI_DIR` is the knob** that makes maw serve find the UI. The
  `<cwd>/.maw/ui/dist` path that `maw ui --install` validates did not pick up
  a read-only symlink; `MAW_UI_DIR` did.
- **maw serve keeps its own status page at `/`.** The application is at
  `/index.html`; nginx maps exact-match `/` onto it without shadowing assets,
  `/api` or `/ws`.
- **`/data` is mounted at runtime**, so anything created there has to be
  created in `run.sh` — a `mkdir` in the Dockerfile is shadowed by the volume.

## Endpoints this add-on adds

`POST /addon/session` — `{"name": "..."}`

| Response | Meaning |
|----------|---------|
| `201 {"ok":true,"name":"x"}` | created |
| `409 {"error":"duplicate session: x"}` | already exists |
| `400 {"error":"name must be 1-32 chars of A-Z a-z 0-9 _ -"}` | rejected |

The name is passed to tmux as a single argv entry, never through a shell.
