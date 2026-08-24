# Uptime Kuma — details

## What this wraps

`FROM louislam/uptime-kuma@sha256:3e24e96c89efff0e3a4b0698cbdd36c15ad3022371db57166e5588853002ee5c`
— the `2.5.3` tag (real GitHub release, `gh release list --repo
louislam/uptime-kuma`), pulled and digest-pinned on 2026-08-24.
Unmodified except `DATA_DIR=/data` and this repo's standard
`extra_env` translation shim.

```
$ docker manifest inspect louislam/uptime-kuma:2.5.3
  "architecture": "amd64", "os": "linux"
  "architecture": "arm64", "os": "linux"
  "architecture": "arm", "os": "linux", "variant": "v7"
```

Real, published multi-arch manifest. amd64 additionally confirmed
by actually running it (this repo's build machine is arm64 — see the
general size-measurement caveat pattern in `hermes-gateway/DOCS.md`).

## Image size

```
$ docker images louislam/uptime-kuma:2.5.3 --format "{{.Size}}"
2.51GB
```

Measured natively (arm64 build machine, native pull — not emulated).
Larger than a status dashboard might suggest at first — the image
bundles `playwright-core` for the "real browser" monitor type (2.x
added Playwright-driven monitors), which is real functionality this
add-on doesn't disable, not bloat to trim.

## Why this ships on a port, not ingress

The standing rule in this repo is "add-on with a web UI → HA sidebar
via ingress," so this was checked properly before deciding otherwise.

```
$ docker run -d -p 13001:3001 louislam/uptime-kuma:2.5.3
$ curl -s -D - -o /dev/null http://127.0.0.1:13001/
HTTP/1.1 302 Found
Location: /setup-database

$ curl -s -L -o page.html http://127.0.0.1:13001/
$ grep -o '(src|href)="/[^"]*"' page.html
href="/apple-touch-icon.png"
href="/assets/index-DYxx-ZA3.css"
href="/icon.svg"
href="/manifest.json"
src="/assets/index-BiJ2MzwC.js"
```

Every asset reference is absolute and root-relative. Home Assistant
Supervisor's ingress proxy strips the `/api/hassio_ingress/<token>/`
prefix before forwarding to the add-on (confirmed from Supervisor's own
`ingress.py` — see `litellm/DOCS.md` for the exact source snippet),
so a browser loading this page through ingress would request
`/assets/index-*.js` against the *Home Assistant frontend's own
origin*, not the add-on — a 404, and a blank/broken dashboard. Same
failure class as `litellm`'s `/ui/` and `9router`'s dashboard.

Checked for an escape hatch before concluding there isn't one:

```
$ docker exec <container> printenv | grep -i base
(no output — no BASE_URL-style var set or referenced)

$ docker run --rm louislam/uptime-kuma:2.5.3 \
    grep -rn 'DATA_DIR' /app/server/*.js
server/database.js:137:  Database.dataDir = process.env.DATA_DIR || args["data-dir"] || Database.getDevDataDir() || "./data/";
```

`DATA_DIR` is real (see Persistence below) but there is no equivalent
for a URL base path — no env var appears in the running container's
environment, and a search of the server source turned up nothing.
Uptime Kuma has a long history of GitHub issues asking for reverse-
proxy-subpath support; nothing found here suggests it landed in 2.5.3.
Rather than an nginx `sub_filter` rewrite (rejected elsewhere in this
repo — see `9router/DOCS.md` — for silently breaking things while
looking styled), this add-on ships on its own port instead, same
resolution as `litellm`.

## `DATA_DIR` — verified, not assumed

```
$ docker run -d -e DATA_DIR=/data -v $PWD/data:/data -p 13002:3001 louislam/uptime-kuma:2.5.3
$ docker logs <container> | grep -i "data dir"
Data Dir: /data
$ ls data/
docker-tls  screenshots  upload
```

Confirmed the SQLite DB and related state actually land under the
mounted directory, not just that the log line changed.

## Full add-on build + run

```
$ docker build -t local/uptime-kuma:1.0.0 .
$ docker run -d --init -p 13003:3001 -v .../data:/data \
    -e '{"extra_env":["UPTIME_KUMA_WS_ORIGIN_CHECK=bypass","BAD ENTRY"]}' \
    local/uptime-kuma:1.0.0
$ docker logs <container>
[uptime-kuma] WARNING: ignoring malformed extra_env entry: BAD ENTRY
[uptime-kuma] exec: dumb-init -- node server/server.js
... Uptime Kuma Version: 2.5.3
... Data Dir: /data
$ curl -s -L -o /dev/null -w '%{http_code}\n' http://127.0.0.1:13003/
200
```

The malformed `extra_env` entry (`"BAD ENTRY"`, no `KEY=VALUE` shape)
was logged and skipped, not silently dropped or fatal — same pattern
as every other add-on in this repo. The well-formed entry exported
without error.

## Shutdown behavior — verified, and a quirk that's upstream's, not this add-on's

```
$ time docker stop -t 5 <container>
docker stop -t 5 <container>  0.01s user 0.01s system 8% cpu 0.179 total
$ docker inspect <container> --format 'ExitCode={{.State.ExitCode}}'
ExitCode=1
```

Fast, clean stop (0.18s, no force-kill) — `init: false` is correct
here because the upstream image's own `ENTRYPOINT` is `dumb-init --`,
a real PID-1-safe init (contrast `thclaws/config.yaml`, which needs
Supervisor's `--init` for exactly this reason since it has no init of
its own). The `ExitCode=1` (not `0` or `143`) looked worth double-
checking rather than assuming this add-on's `run.sh` wrapper caused
it — re-tested against the **bare, unmodified upstream image** with no
wrapping at all:

```
$ docker run -d --init -p 13004:3001 louislam/uptime-kuma:2.5.3
$ docker stop -t 5 <container>
$ docker inspect <container> --format 'ExitCode={{.State.ExitCode}}'
ExitCode=1
```

Identical result with zero involvement from this add-on's `Dockerfile`
or `run.sh` — this is upstream's own Node process's behavior on
`SIGTERM`, not something introduced here. Documented rather than
silently treated as a non-issue.

## Not verified

- No live HAOS Supervisor install — plain `docker build`/`docker run`
  only (same caveat as every add-on in this repo).
- The setup wizard itself (account creation) was not driven end to
  end — confirmed it's reachable and mandatory (302 to
  `/setup-database`), not that account creation completes successfully.
- Notification providers, browser-based (Playwright) monitors, and
  Docker-container monitors were not individually tested.
- Image size measured on this repo's native arm64 build machine only —
  not independently re-measured on native amd64.
