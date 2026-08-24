# thCLAWS

Runs [thClaws](https://github.com/thClaws/thClaws) (`thclaws --serve`): a
native Rust AI coding-agent workspace — the same agent engine you'd
otherwise run as a desktop GUI or terminal REPL, served over
HTTP/WebSocket instead. Appears in Home Assistant's own sidebar via
ingress — no port to open, no separate login.

> **Read this before installing — this is NOT a small add-on.** The
> brief this add-on was built from assumed there were two official
> Linux binaries (a heavy GUI one and a light CLI/serve one) and that
> using the latter would keep this add-on small. That assumption was
> wrong — verified directly, not just re-read from docs. There is only
> **one** official Linux release binary per architecture, and it
> unconditionally needs a GTK3/WebKit2GTK/GStreamer dependency stack to
> even start, in every mode including `--serve`. This add-on's image is
> **~1.06 GB** as a result (measured natively on this repo's arm64
> build machine — see `DOCS.md`). See "Why this add-on is heavier than
> briefed" below before deciding whether you want this.

> **If the sidebar entry doesn't appear after install**: `ingress: true`
> in `config.yaml` makes the add-on *eligible* for a sidebar entry, but
> whether it's actually shown is separate Supervisor **runtime** state
> (`ingress_panel`, the "Show in sidebar" toggle — not a `config.yaml`
> key at all). Confirmed on a real guest elsewhere in this repo: 8 of 9
> installed add-ons defaulted to this toggle off. Check the add-on's own
> page for a "Show in sidebar" toggle if the panel is missing.

## Why this add-on is heavier than briefed

Verified with `readelf -d` on both the `x86_64-unknown-linux-gnu` and
`aarch64-unknown-linux-gnu` release tarballs for v0.115.0, and with real
execution attempts on a minimal Debian image:

- The single official Linux binary hard-links (`NEEDED`, not an
  optional `dlopen()`) against `libdbus-1`, `libwayland-client`,
  `libwebkit2gtk-4.1`, `libgtk-3`, `libgdk-3`, `libcairo`,
  `libgdk_pixbuf-2.0`, `libsoup-3.0`, `libgio-2.0`,
  `libjavascriptcoregtk-4.1`, `libgobject-2.0`, and `libglib-2.0` — the
  full desktop GUI stack — **regardless of which flag you invoke it
  with**. ELF dynamic linking resolves every `NEEDED` entry before
  `main()` runs, so this holds even for `--version` or `--serve`.
- Upstream's own README says *"(a) Use CLI mode — no GUI deps
  required"* for headless servers. This is directly contradicted by
  testing: `thclaws --version` fails with `error while loading shared
  libraries: libdbus-1.so.3: cannot open shared object file` on a
  minimal image with none of these libs installed, in **every** mode,
  not just the GUI one.
- Upstream's own suggested fix — `apt install libwayland-client0
  libwebkit2gtk-4.1-0 libsoup-3.0-0` — genuinely works (verified: a
  clean `--version` and a working `--serve` afterward), but apt pulls
  in **239 packages / ~642 MiB** transitively (mostly GStreamer/GTK/
  Cairo/fonts) to satisfy it. This add-on pays that cost so `--serve`
  works at all.

If you were expecting something in the tens-of-MB range because
"native Rust single binary," this is the honest correction: that's true
of the binary itself, but not of what it needs installed next to it.

## Quick start

1. Set **at least one** of `anthropic_api_key`, `openai_api_key`, or
   `openrouter_api_key` in this add-on's Configuration tab — all three
   verified directly against the real provider APIs (see `DOCS.md`).
   Prefer a different provider (Gemini, DashScope, Ollama, or this
   repo's own `litellm`/`9router` via the generic `oai/*` slot)? Use
   `extra_env` instead — see `DOCS.md` for env var names.
2. Start the add-on.
3. Open it from **Home Assistant's own sidebar** (look for "thCLAWS").
4. Sign-in is whatever getting to that sidebar already required: your
   Home Assistant login. There's no separate thclaws credential — see
   "How the sidebar works" below.

## How the sidebar works

`thclaws --serve` binds `127.0.0.1` **by default** — this isn't
something this add-on had to force. Upstream's own `--help` text spells
out the implication directly: *"`--bind 0.0.0.0` exposes the server
publicly (only with auth in front: e.g. Tailscale, Cloudflare Access,
reverse proxy with basic auth)."* This add-on's design — loopback bind
plus an in-container nginx reachable only through Home Assistant's
ingress — **is** that recommended "auth in front" shape, not a
workaround. Verified directly (not assumed): a WebSocket upgrade to
`/ws` through the whole chain (nginx → thclaws) returns a real
`HTTP/1.1 101 Switching Protocols`, tested with a simulated ingress
Host/Origin header pair matching a real Home Assistant frontend origin.

One more thing verified, not assumed: thclaws does **no** Origin
validation on this endpoint at all — a WS upgrade with a deliberately
hostile `Origin: http://evil.example.com` also succeeded. This is fine
under this add-on's loopback+ingress design (HA's own login is the only
thing that can reach the port in the first place), but would not be
safe if this add-on ever shipped a direct, non-loopback port instead —
it doesn't, and this is why.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `anthropic_api_key` | password | *(empty)* | Verified directly (`ANTHROPIC_API_KEY`, real 401 from Anthropic's API with a fake key). |
| `openai_api_key` | password | *(empty)* | Verified directly (`OPENAI_API_KEY`, real 401 from OpenAI's API with a fake key). |
| `openrouter_api_key` | password | *(empty)* | Verified directly (`OPENROUTER_API_KEY` — thclaws's own error message names this exact env var when it's missing). |
| `extra_env` | list of `KEY=VALUE` | `[]` | Any other provider's key (Gemini, DashScope, DeepSeek, Azure, Ollama, the generic `oai/*` slot, ...). Malformed entries are logged and skipped. |

**At least one of the four must actually supply a usable credential.**
run.sh checks `anthropic_api_key` / `openai_api_key` /
`openrouter_api_key` / a non-empty `extra_env` and refuses to start
(exit 1, clear log message) if none is set — a keyless thclaws installs
and starts "successfully" but every request just retries three times
and errors, which is a much worse failure mode to discover from the
sidebar than a refusal to boot.

## Networking — no published port, ingress only

No `ports:` block. Reached only through Home Assistant's sidebar. If
you need thclaws's `/v1/agent/info`-style API surface reachable from
outside this host directly, that's not what this add-on's default
config offers — see `DOCS.md` for why that wasn't added casually.

## Persistence

thclaws's full state — `~/.thclaws/settings.json`, sessions, memories,
skills, the one project directory this add-on points it at — lives
under this add-on's `/data`, which Supervisor persists and backs up
automatically. The project directory is `/data/workspace`: this
add-on's own sandbox, **not** your Home Assistant config directory. See
`DOCS.md` for why that's not user-configurable in this first pass.

See [`DOCS.md`](DOCS.md) for the full verification log — including the
`readelf`/`ldd` transcripts behind the size finding above, the real
provider-credential 401 tests, the nginx+WebSocket transcript, and a
concrete `docker stop` timing comparison that turned out to make
`init: true` a load-bearing setting, not a formality, for this add-on
specifically.
