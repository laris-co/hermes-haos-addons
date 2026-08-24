# Open WebUI — details

## What this wraps

`FROM ghcr.io/open-webui/open-webui@sha256:72c0ba641ba75e7aa52655cb242570906ececd09b1140fb736483038a22b3228`
(the `v0.11.0` tag, a pinned release — not the mutable `:main` tag,
which can include breaking changes without warning per upstream's own
docs). Confirmed multi-arch via `docker manifest inspect` (amd64 +
arm64).

- `ENV DATA_DIR=/data` — redirects chat history/uploads/vector DB/the
  auto-generated `WEBUI_SECRET_KEY` file onto Supervisor's persistent
  per-add-on volume (confirmed by inspecting `/app/backend/open_webui/env.py`
  directly: `DATA_DIR = Path(os.getenv('DATA_DIR', BACKEND_DIR / 'data'))`).
- `ENV ENABLE_SIGNUP=false` — see "Why public signup is disabled" in
  README.md.
- `ENV RAG_EMBEDDING_ENGINE=openai` — see "Why it's heavy" in README.md.
- `run.sh` — reads `/data/options.json`, exports
  `WEBUI_ADMIN_EMAIL`/`WEBUI_ADMIN_PASSWORD` and `OPENAI_API_BASE_URL`
  (all three required — the URL fails loud if empty, see below) plus
  optionally `OPENAI_API_KEY` and `extra_env`, then `exec`s `bash
  start.sh` (the image's own unmodified default CMD — this image ships
  no custom `ENTRYPOINT` at all, just `WorkingDir: /app/backend` and
  `CMD: [bash, start.sh]`, confirmed via `docker image inspect`).

## `openai_api_base_url`: required, no guessed default — worked example

HAOS add-on hostnames follow a `{repo}_{slug}` convention where `{repo}`
is a hash Supervisor assigns **per repository-add event**, not
predictable at build time (confirmed on a real guest: the same add-ons
resolved as `a90308c2_hermes_gateway`, `9074a9fa_cloudflared`,
`5c53de3b_esphome` — three different prefixes on one host, and none of
them reproducible on someone else's). Concretely, on that guest, the
`litellm` add-on from an earlier point in this repo's development
resolved to a hostname like:

```
a90308c2_litellm
```

— so `openai_api_base_url` on that specific host would be:

```
http://a90308c2_litellm:4000/v1
```

**Your own installation's prefix will be different.** Find it from
**Settings → Add-ons → LiteLLM Proxy → Info tab** in your own Home
Assistant instance, not from this example. This add-on's `run.sh`
refuses to start with this option empty rather than defaulting to a
guess like `local-litellm` or `litellm` that would only work by
coincidence on one specific installation shape (a local/manually-added
repository) and silently fail on a repository added by URL — see the
verification below for the exact failure text.

## Why this add-on exists as a separate build from `litellm`

They're deliberately two add-ons, not one: `litellm` is the routing/API
layer (machine-to-machine, no UI), Open WebUI is the human-facing chat
UI. Keeping them separate means either can be swapped or run alone —
Open WebUI works fine against any other OpenAI-compatible backend, and
`litellm`'s `/v1` is equally usable by `hermes-gateway`/`hermes-server`
or any other client, not just this one.

## Why no `ingress: true` — the exact reproduction

Real HTML diffed, not inferred from documentation. Both requests to a
running container on this repo's admin-bootstrapped config:

```
$ curl http://127.0.0.1:.../ | grep -o 'src="[^"]*"\|href="[^"]*"'
href="/static/favicon.png"
href="/static/favicon-96x96.png"
...
href="/_app/immutable/entry/start.Bc2-tT3s.js"
href="/_app/immutable/chunks/D8-P3Sxj.js"
```
All root-relative. Checked upstream's own `PUBLIC_BASE_PATH` env var
(added specifically for reverse-proxy subpath deployments per PR #12002
on the upstream repo) by setting it directly and requesting the app at
that same path:

```
$ docker run ... -e PUBLIC_BASE_PATH=/api/hassio_ingress/testtoken12345 ...
$ curl http://127.0.0.1:18083/api/hassio_ingress/testtoken12345/ \
    | grep -o 'href="[^"]*"' | head -3
href="/static/favicon.png"     # unchanged — still root-relative
$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18083/
200                              # the bare root ALSO still serves the SPA shell
```
Setting `PUBLIC_BASE_PATH` to the exact literal prefix that would be
used did **not** change a single emitted asset path in this version
(v0.11.0). Whether that's a version-specific regression, a
frontend-vs-backend split where only backend routes honour it, or the
variable meaning something different than the PR description implied
wasn't investigated further — the empirical result is what matters
here: it didn't work, tested directly, not assumed from a changelog
entry.

Separately (and this would have been a second, independent blocker even
if the above had worked): HA's ingress token is assigned per-install by
Supervisor and is not something this container can reliably learn at
boot time without unverified Supervisor-API integration (checked HA's
own developer docs for whether `/addons/self/info` exposes an add-on's
assigned ingress path back to itself; the documentation excerpt
available did not confirm this one way or the other, and it was not
pursued further given the first blocker already ruled out this path).

**Conclusion, matching this repo's established standard ("a verified
port beats a broken sidebar" — see `hermes-agent`'s DOCS.md for the same
principle applied successfully, and `9router`'s for a case where it was
applied by necessity)**: a direct port, not ingress.

## Why public signup is disabled

Verified directly: `ENABLE_SIGNUP` defaults to `True` whenever
`WEBUI_AUTH` is on (`os.getenv('ENABLE_SIGNUP', 'True')` in
`open_webui/config.py`), and `DEFAULT_USER_ROLE` defaults to `pending` —
but the very first account created is a special case that becomes the
real admin regardless. On a real published port reachable from your
LAN, that first-account race is a genuine risk if anyone else can reach
the add-on before the operator configures it.

Confirmed the alternative bootstrap path works end to end:
`WEBUI_ADMIN_EMAIL` + `WEBUI_ADMIN_PASSWORD` are read directly by
upstream's own `start.sh` (`grep`'d out of the image:
`open_webui.utils.auth:create_admin_user`), which calls
`create_admin_user()` before the server even finishes starting up. With
`ENABLE_SIGNUP=false` set alongside it, there is no window at all where
an unauthenticated visitor could create the first (admin) account — the
only account that can ever exist is the one this add-on's own required
options create.

## Why it's heavy, verified precisely

```
$ docker run -d -p ... ghcr.io/open-webui/open-webui:main    # no RAG_EMBEDDING_ENGINE override
$ docker exec <container> du -sh /app/backend/data/cache
977M    /app/backend/data/cache
$ docker exec <container> find /app/backend/data/cache -iname "*MiniLM*"
.../cache/embedding/models/models--sentence-transformers--all-MiniLM-L6-v2
$ docker stats <container> --no-stream --format '{{.MemUsage}}'
972.4MiB / 7.748GiB
```
vs. with `RAG_EMBEDDING_ENGINE=openai` set (this add-on's default):
```
$ docker exec <container> du -sh /app/backend/data/cache
0
$ docker stats <container> --no-stream --format '{{.MemUsage}}'
690.8MiB / 7.748GiB
```
The local embedding model accounts for the ~977 MB disk difference
entirely, and roughly 280 MiB of the idle-memory difference. The
remaining ~660-690 MiB baseline (confirmed again against this add-on's
own final build, not just the bare upstream image — see verification
log below) is the inherent cost of the FastAPI/uvicorn backend plus the
served compiled frontend; there's no further easy win available without
materially changing what the app does.

## Verification log (2026-08-24)

Build host: arm64 Mac. Image size (1,660,254,348 bytes for v0.11.0, both
archs) was pulled directly via `docker pull`/`docker manifest inspect`,
not measured via a cross-arch `docker build`/`docker run` — this repo's
established caveat about emulated-measurement artifacts (see
`hermes-gateway/DOCS.md` §2b) applies specifically to images
built/materialized under QEMU/Rosetta; a plain multi-arch manifest pull
is not that code path, but the number is still not independently
cross-checked on a native amd64 host (black.local) the way the hermes
add-ons' numbers eventually were. Treat the ~1.66 GB figure as likely
accurate but not held to the same bar as those.

### 1. Both archs confirmed published

```
$ docker manifest inspect ghcr.io/open-webui/open-webui:v0.11.0
  "architecture": "arm64", "os": "linux"
  "architecture": "amd64", "os": "linux"
```

### 2. This add-on: fails loud with no admin credentials

```
$ echo '{}' > options.json
$ docker run --name owui-noauth -v .../data:/data local/open-webui:1.0.0
[open-webui] ERROR: admin_email and admin_password must both be set in this add-on's Configuration tab.
[open-webui] Public signup is disabled in this add-on, so these are the only way to create an account at all.
$ docker inspect owui-noauth --format '{{.State.ExitCode}}'
1
```

### 3. This add-on (v1.1.0): also fails loud with no `openai_api_base_url`

Added after admin_email/admin_password were already required — this
option started out optional (v1.0.0) and was changed to required
(v1.1.0) once the per-installation-hostname problem below was
identified. Same fail-fast pattern:

```
$ echo '{"admin_email":"admin@example.com","admin_password":"Str0ng-Admin-Pw!"}' > options.json
$ docker run --name owui-nourl -v .../data:/data local/open-webui:1.1.0
[open-webui] ERROR: openai_api_base_url must be set in this add-on's Configuration tab.
[open-webui] Find the value from the litellm add-on: open its page in Settings -> Add-ons,
[open-webui] note the hostname shown there, and set this option to http://<that-hostname>:4000/v1
[open-webui] (see this add-on's DOCS.md for a worked example).
$ docker inspect owui-nourl --format '{{.State.ExitCode}}'
1
```

### 4. Starts clean, real login round trip, correct data-dir redirect

```
$ echo '{"admin_email":"admin@example.com","admin_password":"Str0ng-Admin-Pw!","openai_api_base_url":"http://example-litellm:4000/v1","openai_api_key":"sk-test"}' > options.json
$ docker run -d -p 18086:8080 -v .../data:/data local/open-webui:1.1.0
$ curl -i -X POST http://127.0.0.1:18086/api/v1/auths/signin \
    -d '{"email":"admin@example.com","password":"Str0ng-Admin-Pw!"}'
HTTP/1.1 200 OK
set-cookie: token=...; HttpOnly; ...
{"id":"...","name":"Admin","role":"admin","email":"admin@example.com",...}

$ ls .../data
cache  uploads  vector_db  webui.db  webui.db-shm  webui.db-wal
```
(`example-litellm` here is a placeholder hostname for the test, not a
claim about any real installation's prefix — see the worked-example
section above for why a real one can't be predicted.)
`role: "admin"` confirms the bootstrap account, not a default/fallback
one. Files landing directly under `/data` (not `/app/backend/data`)
confirms the `DATA_DIR` redirect took effect.

### 5. Idle memory, this add-on's actual final build

```
$ docker stats owui-final2 --no-stream --format '{{.MemUsage}}'
665.1MiB / 7.748GiB
```
Consistent with the bare-image `RAG_EMBEDDING_ENGINE=openai` test above
(690.8 MiB) — small variance, same order of magnitude.

### 6. amd64 build, separately re-tested

```
$ docker buildx build --platform linux/amd64 -t local/open-webui-amd64:1.0.0 --load .
$ docker run -d --platform linux/amd64 -p 18087:8080 -v .../data:/data local/open-webui-amd64:1.0.0
$ curl -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:18087/api/v1/auths/signin -d '{...}'
200
```
Same admin-bootstrap login flow confirmed under QEMU emulation on this
arm64 Mac, not just assumed from the native-arch result above.

## Not verified

- No live HAOS Supervisor install.
- Real provider completion calls were not tested — only login,
  bootstrap, and the auth/signup mechanics.
- No Socket.IO/WebSocket session was driven end to end (the task brief
  asked for this specifically for an ingress scenario; since ingress was
  ruled out, standard direct-port WebSocket behavior applies with none
  of the header-rewriting complexity that made deep WS verification
  necessary for `hermes-agent` — a basic reachability check on the
  socket.io endpoint returned a real HTTP response, not a connection
  refusal, but a full duplex session was not driven).
- `litellm` was not actually running during this verification — the
  `openai_api_base_url` pairing was designed and documented but not
  exercised against a live `litellm` instance in the same test pass.
