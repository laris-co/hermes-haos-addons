# thCLAWS — details

## What this wraps

[thClaws](https://github.com/thClaws/thClaws) v0.115.0 (dual MIT/Apache
2.0), the official GitHub Release binary for
`x86_64-unknown-linux-gnu` / `aarch64-unknown-linux-gnu`, downloaded and
`sha256sum -c`-verified at build time against upstream's own published
`.sha256` sidecars — not compiled from source (out of scope for this
add-on) and not wrapped from an upstream Docker image (thClaws doesn't
publish one).

## The brief's premise was wrong — here's what's actually true

The task this add-on was built from stated: *"there are TWO binaries —
a GUI one that links Wayland/webkit2gtk at runtime and dies headless,
and a CLI/serve one to use instead."* This turned out to be inaccurate
in a way worth spelling out precisely, because the correction changes
what this add-on actually costs.

### 1. There is only one Linux binary per architecture

```
$ gh release view v0.115.0 --repo thClaws/thClaws --json assets --jq '.assets[].name'
thclaws-v0.115.0-x86_64-unknown-linux-gnu.tar.gz
thclaws-v0.115.0-x86_64-unknown-linux-gnu.tar.gz.sha256
thclaws-v0.115.0-aarch64-unknown-linux-gnu.tar.gz
thclaws-v0.115.0-aarch64-unknown-linux-gnu.tar.gz.sha256
(+ macOS/Windows targets)

$ tar -tzf thclaws-v0.115.0-x86_64-unknown-linux-gnu.tar.gz
thclaws
```

One tarball, one file, per Linux architecture. No separate `-cli` or
`-server` artifact exists in the official release channel.

### 2. That one binary hard-links the full GUI stack, in every mode

```
$ docker run --rm --platform linux/amd64 -v $PWD:/t debian:13-slim sh -c '
    apt-get update -qq && apt-get install -y -qq binutils >/dev/null
    readelf -d /t/thclaws | grep NEEDED'

 (NEEDED) Shared library: [libdbus-1.so.3]
 (NEEDED) Shared library: [libwayland-client.so.0]
 (NEEDED) Shared library: [libwebkit2gtk-4.1.so.0]
 (NEEDED) Shared library: [libgtk-3.so.0]
 (NEEDED) Shared library: [libgdk-3.so.0]
 (NEEDED) Shared library: [libcairo.so.2]
 (NEEDED) Shared library: [libgdk_pixbuf-2.0.so.0]
 (NEEDED) Shared library: [libsoup-3.0.so.0]
 (NEEDED) Shared library: [libgio-2.0.so.0]
 (NEEDED) Shared library: [libjavascriptcoregtk-4.1.so.0]
 (NEEDED) Shared library: [libgobject-2.0.so.0]
 (NEEDED) Shared library: [libglib-2.0.so.0]
 (NEEDED) Shared library: [libgcc_s.so.1]
 (NEEDED) Shared library: [libm.so.6]
 (NEEDED) Shared library: [libc.so.6]
 (NEEDED) Shared library: [ld-linux-x86-64.so.2]
```

These are `NEEDED` entries — hard, ELF-level dynamic-link dependencies,
not something the binary optionally `dlopen()`s only when a GUI window
is actually requested. The dynamic loader (`ld.so`) resolves every
`NEEDED` entry before `main()` runs, for **any** invocation:

```
$ docker run --rm --platform linux/amd64 -v $PWD:/t debian:13-slim sh -c '
    chmod +x /t/thclaws
    /t/thclaws --version'
/t/thclaws: error while loading shared libraries: libdbus-1.so.3: cannot open shared object file: No such file or directory
$ echo $?
127
```

`--version` — arguably the most trivial possible code path — fails to
even start. This is not "the GUI path fails, use `--cli` instead": the
process cannot begin executing `main()` at all without these libraries
present, regardless of argv.

Confirmed identical on `aarch64-unknown-linux-gnu` (tested **natively**,
not emulated, on this repo's arm64 build Mac) — two extra transitively-
pulled entries (`libpango-1.0.so.0`, `libcairo-gobject.so.2`) but the
same category of dependency, same failure mode without them.

### 3. Upstream's own README claim about this is wrong, or at best misleading

Upstream's README, verbatim (`README.md`, "Linux runtime dependencies"
section):

> The Linux GUI binary links against Wayland and webkit2gtk at
> runtime... Two options: **(a) Use CLI mode** — no GUI deps required:
> `thclaws --cli` / `thclaws -p "..."`. **(b) Install the GUI deps**:
> `sudo apt install libwayland-client0 libwebkit2gtk-4.1-0
> libsoup-3.0-0`.

Option (a) does not hold for the actual shipped binary, per the ELF
mechanics above — there is no separate code path that avoids the link
requirement, because the requirement is resolved before any code runs.
Option (b) is the only one that actually works, and it's what this
add-on does.

### 4. Option (b) verified working, at a real, non-trivial size cost

```
$ docker run --rm --platform linux/amd64 -v $PWD:/t debian:13-slim sh -c '
    apt-get update -qq
    dpkg-query -Wf "${Package}\n" > /tmp/before.txt
    apt-get install -y -qq --no-install-recommends \
        libwayland-client0 libwebkit2gtk-4.1-0 libsoup-3.0-0 ca-certificates curl >/dev/null 2>&1
    dpkg-query -Wf "${Package}\n" > /tmp/after.txt
    comm -13 /tmp/before.txt /tmp/after.txt | wc -l
    comm -13 /tmp/before.txt /tmp/after.txt | xargs dpkg-query -Wf "${Installed-Size} ${Package}\n" \
      | awk "{sum+=\$1} END {print sum/1024 \" MiB\"}"
    chmod +x /t/thclaws
    /t/thclaws --version'
239
641.816 MiB
thclaws 0.115.0
revision: af3b80f (HEAD)
built: 2026-08-19T17:29:01Z (release)
```

239 packages, ~642 MiB installed-size, almost entirely GStreamer
plugins, GTK3, Cairo, and their transitive closure — to satisfy a
dependency list a headless `--serve` process never actually calls into.
This add-on's final image is **~1.06 GB** (measured on this repo's
native arm64 build machine via `docker images` — not independently
re-measured on amd64; see the size-measurement caveat pattern in
`hermes-gateway/DOCS.md` for why arm64-Mac numbers for an amd64 target
would need separate native verification, which wasn't done here for
this specific number).

## `--serve` mode itself, once dependencies are satisfied

```
$ docker run --rm --platform linux/amd64 ... /t/thclaws --serve --port 7878
[serve] thClaws listening on http://127.0.0.1:7878
[serve] open the URL above in your browser (over an SSH tunnel for remote access)

$ curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7878/
200
```

`--help` confirms this is intentional upstream design, not an
accident this add-on is exploiting:

> `--serve`: ... Single-user; binds to 127.0.0.1 by default — use an
> SSH tunnel for remote access. `--bind 0.0.0.0` exposes the server
> publicly (only with auth in front: e.g. Tailscale, Cloudflare Access,
> reverse proxy with basic auth).

Real default port is **8443**, not the `7878` used as an example in
upstream's own README — this add-on uses `--port 8443` explicitly (see
`run.sh`) rather than relying on the default, matching this repo's
convention of always passing ports explicitly.

### The served page is fully self-contained — no ingress path-prefix problem

```
$ curl -s http://127.0.0.1:7878/ -o index.html
$ wc -c index.html
3835091 index.html
$ grep -o '\(src\|href\)="/[^"]*"' index.html | wc -l
0
```

Zero absolute (`/...`) asset references in the entire 3.8 MB response —
the whole frontend is inlined into one HTML document. Unlike litellm's
`/ui/` (rewrites asset paths based on `SERVER_ROOT_PATH`, incompatible
with Supervisor's prefix-stripping — see `litellm/DOCS.md`) or
9router's dashboard (root-relative `/_next/static/...` that breaks
under a path prefix — see `9router/DOCS.md`), there is nothing here for
Supervisor's ingress-strips-the-prefix behavior to break.

### WebSocket upgrade — verified at `/ws`, including under simulated ingress headers

```
$ curl -sv -N -o /dev/null \
    -H "Host: 127.0.0.1:8443" -H "Origin: http://homeassistant.local:8123" \
    -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    http://127.0.0.1:8443/ws
< HTTP/1.1 101 Switching Protocols
< connection: upgrade
< upgrade: websocket
< sec-websocket-accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

A second attempt with a deliberately hostile `Origin:
http://evil.example.com` **also** returned a real 101 — thclaws does no
Origin-based CSWSH check on this endpoint at all. Not a problem for
this add-on's loopback+ingress design (nothing but nginx in the same
container can reach the port), but worth stating plainly rather than
silently — this is why this add-on does not also offer a direct,
non-loopback port as an option.

## Full image build + ingress verification (this add-on's actual Dockerfile/run.sh, not the bare binary)

```
$ docker build -t local/thclaws:1.0.0 .
... (nginx-light, python3-minimal, libwayland-client0, libwebkit2gtk-4.1-0,
     libsoup-3.0-0 installed; thclaws-v0.115.0-aarch64-unknown-linux-gnu.tar.gz.sha256: OK)
$ docker images local/thclaws:1.0.0 --format "{{.Size}}"
1.08GB
```

(Built natively for arm64 on this repo's dev machine — the aarch64
release path, tested for real, not emulated.)

### Fail-loud: no provider credential configured

```
$ echo '{"anthropic_api_key":"","openai_api_key":"","openrouter_api_key":"","extra_env":[]}' > options.json
$ docker run --name t -v .../data:/data local/thclaws:1.0.0
[thclaws] ERROR: no LLM provider credential configured.
[thclaws] Set at least one of anthropic_api_key / openai_api_key / openrouter_api_key
[thclaws] in this add-on's Configuration tab, or supply a different provider's key via
[thclaws] extra_env (e.g. GEMINI_API_KEY=..., or an oai/*-compatible base+key pointing
[thclaws] at this repo's own litellm/9router add-ons). See DOCS.md for provider names.
$ docker inspect t --format 'ExitCode={{.State.ExitCode}}'
ExitCode=1
```

### A real bug this exact test caught: `python3` was missing

The first build of this add-on's Dockerfile (based on `debian:13-slim`,
unlike every other add-on here, which `FROM`s an image that already
ships Python) did not install `python3`. `run.sh`'s `get_opt()` helper
— the same options.json reader used throughout this repo — depends on
it. The bug did not surface on the "no credential" test above (that
path short-circuits before ever calling `get_opt` meaningfully, since
`get_opt` returns empty on a missing options.json without touching
python3 at all), so an early pass with this bug still present produced
what looked like a correct fail-loud result, for the wrong reason. It
only surfaced once a real `options.json` file existed:

```
/addon/run.sh: 18: python3: not found
```

Fixed by adding `python3-minimal` to the Dockerfile's `apt-get
install` line. Left in as a documented example of why "the fail-loud
test passed" isn't sufficient on its own — the test needs to actually
exercise the code path a real user hits (a populated options.json), not
just the empty case.

### A second real bug this caught: `/data/workspace` didn't exist at runtime

```
$ docker run --name t -d -v .../data-extraenv:/data local/thclaws:1.0.0
$ docker logs t
/addon/run.sh: 128: cd: can't cd to /data/workspace
```

The Dockerfile originally did `RUN mkdir -p /data/home /data/workspace`
at build time. That directory only exists in the image's own layer —
Supervisor (and this test's own `-v .../data:/data`) bind-mounts a real
host directory over `/data` at container start, which replaces
whatever was there in the image. Fixed by moving the `mkdir -p` into
`run.sh`, so it runs against the actual mounted volume every time the
container starts, not once at build time against a layer that gets
shadowed.

### Real credential, full ingress chain (nginx → thclaws), through the published `ingress_port`

```
$ echo '{"anthropic_api_key":"sk-ant-fake-ingress-test","openai_api_key":"","openrouter_api_key":"","extra_env":[]}' > options.json
$ docker run -d --name t -p 18342:8342 -v .../data:/data local/thclaws:1.0.0
$ docker logs t
[thclaws] exec: thclaws --serve --port 8443 --bind 127.0.0.1
[schedule] in-process scheduler running (tick 30s)
[serve] thClaws listening on http://127.0.0.1:8443
$ curl -sv -o page.html -w 'HTTP %{http_code}\n' http://127.0.0.1:18342/
< HTTP/1.1 200 OK
< Server: nginx/1.26.3
< Content-Length: 3835091
HTTP 200
```

`Server: nginx/1.26.3` in the response confirms this went through the
in-container proxy, not a direct connection — same content-length as
the bare-binary test above, i.e. nginx is passing the response through
unmodified.

```
$ curl -sv -N -o /dev/null \
    -H "Host: 127.0.0.1:18342" -H "Origin: http://homeassistant.local:8123" \
    -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    http://127.0.0.1:18342/ws
< HTTP/1.1 101 Switching Protocols
< Server: nginx/1.26.3
< sec-websocket-accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

$ docker logs t | tail -2
192.168.65.1 - - [...] "GET / HTTP/1.1" 200 3835091 "-" "curl/8.7.1"
192.168.65.1 - - [...] "GET /ws HTTP/1.1" 101 0 "-" "curl/8.7.1"
```

A real, non-emulated `101 Switching Protocols` through the full
nginx-fronted chain, with nginx's own access log confirming it handled
both requests, under a realistic simulated Home Assistant ingress
Host/Origin pair.

## `init: true` is load-bearing here, not a formality — a third real finding

Tested `docker stop` behavior two ways:

**Without `--init`** (i.e. what the container looks like if `init:
true` were dropped from `config.yaml`):

```
$ docker run -d --name t -v .../data:/data local/thclaws:1.0.0
$ time docker stop t
docker stop t  0.01s user 0.01s system 0% cpu 10.202 total
$ docker inspect t --format 'ExitCode={{.State.ExitCode}}'
ExitCode=137
```

10.2 seconds — the full default grace period — then a force-kill
(`137` = `128 + SIGKILL`).

**With `--init`** (what Supervisor actually passes when `config.yaml`
sets `init: true`):

```
$ docker run -d --name t --init -v .../data:/data local/thclaws:1.0.0
$ docker top t
UID    PID    PPID   CMD
root   91582  91559  /sbin/docker-init -- /addon/run.sh
root   91596  91582  thclaws --serve --port 8443 --bind 127.0.0.1
root   91604  91596  nginx: master process ...
$ time docker stop -t 5 t
docker stop -t 5 t  0.01s user 0.01s system 15% cpu 0.100 total
$ docker inspect t --format 'ExitCode={{.State.ExitCode}}'
ExitCode=143
```

0.1 seconds, clean exit (`143` = `128 + SIGTERM`, i.e. it actually
received and responded to the signal).

**Why**: `run.sh` ends with `exec thclaws ...`, which replaces the
shell's process image while keeping its PID. Without `--init`, that PID
is the container's literal PID 1. Linux gives PID 1 inside a namespace
special signal-disposition handling — a process running as PID 1 does
**not** get the normal default action for a signal it hasn't installed
a handler for (this is deliberate kernel behavior, the same reason
bare-`CMD`-as-PID-1 containers are notorious for ignoring `docker
stop`). thclaws almost certainly has no explicit `SIGTERM` handler (no
reason a `--serve` binary would need one outside a container), so as
PID 1 it silently absorbs the signal — hence the 10-second timeout and
forced `SIGKILL`. With `--init`, Docker's own `docker-init` (tini)
takes the real PID 1 slot; thclaws becomes an ordinary child process,
gets normal default-terminate-on-SIGTERM kernel behavior, and exits
promptly. `config.yaml`'s `init: true` is the fix for a real, reproduced
problem, not a copy-pasted default.

## Provider credentials — verified per-provider, not assumed

Upstream's own README states plainly: *"API keys are never stored in
config files — only the OS keychain (default) or `.env`."* A headless
Supervisor add-on container has no OS keychain daemon at all, so
whether the `.env`/env-var fallback genuinely works without one was a
real open question, not a formality — tested directly, per provider:

```
$ mkdir /w && cd /w && echo "ANTHROPIC_API_KEY=sk-ant-fake-test-key-12345" > .env
$ thclaws -p "hello" -v
[retry 1/3 after 1s: provider error: http 401 Unauthorized:
  {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}]
... (3 retries, same result)
```

A real, correctly-formatted 401 from Anthropic's own API — the fake key
round-tripped all the way to the real provider, no keychain error, no
hang. Repeated for the other two, both also genuine round-trips to the
real provider:

```
$ echo "OPENAI_API_KEY=sk-fake-openai-test" > .env && thclaws -m gpt-4o-mini -p "hi"
error: provider error: http 401 Unauthorized: {"error":{"message":"Incorrect API key provided: sk-fake-*******test. ...","code":"invalid_api_key"}}

$ echo "OPENROUTER_KEY=sk-or-fake-test" > .env && thclaws -m openrouter/anthropic/claude-sonnet-4-6 -p "hi"
error: config error: no API key found for provider 'openrouter' — set OPENROUTER_API_KEY
```

That last line is worth calling out: the **wrong** env var name
(`OPENROUTER_KEY`, no `_API_`) produces a clean, self-documenting error
naming the correct one (`OPENROUTER_API_KEY`) — confirmed directly from
thclaws's own error text, not guessed from convention. Re-tested with
the correct name and a fake key: a genuine OpenRouter-side 401
(`"Missing Authentication header"` — OpenRouter's own phrasing for this
particular malformed key shape, not evidence the key wasn't sent).

Also verified: a plain exported process environment variable works
identically to a `.env` file (`ANTHROPIC_API_KEY=... thclaws -p "hi"`
with no `.env` present at all produced the same real 401) — this
add-on's `run.sh` simply `export`s the configured option, matching
every other add-on in this repo's convention, rather than writing a
`.env` file.

## `--help` surface not exposed by this add-on (by design, for now)

`thclaws --help` reveals a much larger surface than "serve mode": a
`--gui-shell` mode (custom frontends), `--multi-tenant` (HMAC-routed
multi-user pods, dev-plan/35), `--telegram`/`--messenger` chat-surface
bridges, `--workflow` (headless pre-authored workflow runner), and a
`deploy`/`agent`/`cloud` command family for thClaws.cloud. None of this
is wired up here — this add-on ships the plain single-user `--serve
--port 8443 --bind 127.0.0.1` invocation only, matching the original
brief ("the same engine over WebSocket/HTTP — a real serve mode").
Extending this add-on to any of the above is a real, separate design
decision (especially `--multi-tenant`, which needs its own HMAC secret
management) — not attempted here.

## Why the project directory isn't configurable

thclaws's own `--help` text: *"One project per process; cd into the
project dir before running."* This add-on always runs it against its
own `/data/workspace` — never against Home Assistant's live `/config`
or any other host path. This wasn't an oversight: thclaws's tool
surface includes direct filesystem/shell access (`Bash`, `Edit`,
`Write`, `Glob`, `Grep`, ... — the full tool list is visible in its own
`-v` startup banner), and pointing an AI agent with that access at a
live Home Assistant config directory by default — rather than as an
explicit, informed choice a user makes themselves — is a materially
bigger decision than a config option default should silently make.
Nothing in this add-on prevents someone from editing `Dockerfile`/
`run.sh` to point elsewhere; it's just not offered as a one-click
option here, same reasoning as 9router's "no one-click LAN port"
decision.

## Not verified

- No live HAOS Supervisor install — plain `docker build`/`docker run`
  only (same caveat as every add-on in this repo).
- No real provider API key was used — only fake keys proving the
  credential-plumbing mechanism, not an actual upstream LLM call
  completing successfully end to end.
- Image size (~1.06–1.08 GB) measured on this repo's native arm64 build
  machine only — not independently re-measured on native amd64 (see
  `hermes-gateway/DOCS.md` for why that distinction has mattered
  before in this repo).
- `--multi-tenant`, `--gui-shell`, `--telegram`/`--messenger`,
  `--workflow`, and the `deploy`/`cloud`/`agent` command family are
  entirely untested here — this add-on only exercises plain
  single-user `--serve`.
- No real agent conversation was driven through the WebSocket end to
  end (only the HTTP-101 handshake itself was verified) — whether the
  actual chat protocol over that socket works correctly through nginx
  was not tested beyond the handshake.
