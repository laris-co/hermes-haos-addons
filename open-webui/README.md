# Open WebUI

> ⚠️ **Heavier than every other add-on in this repository, and no
> sidebar.** Real measured numbers, not estimates: **~1.66 GB** image,
> **~660-970 MiB** idle memory depending on config (see `DOCS.md`). Also
> reachable via a **direct port**, not Home Assistant's ingress sidebar
> — verified (not assumed) that this app's compiled frontend has no
> HA-ingress path-prefix support, so a sidebar panel would render broken.
> Read this whole file before installing, especially if your host is
> memory-constrained.

Runs [Open WebUI](https://github.com/open-webui/open-webui) — a
full-featured browser chat interface speaking the OpenAI-compatible
API. Pairs naturally with the `litellm` add-on in this repo: point
`openai_api_base_url` at litellm's `/v1` endpoint and chat through
whatever provider litellm routes to (closing the loop: litellm routes,
Open WebUI is the human interface, `hermes-gateway`/`hermes-server` is
the agent side).

## Quick start

1. **Install and start the `litellm` add-on first** — this add-on
   requires it (see below).
2. Find litellm's own internal hostname: **Settings → Add-ons →
   LiteLLM Proxy → Info tab**. It looks like `<something>-litellm` or
   `<hash>_litellm` — the exact prefix is assigned per-installation, so
   copy it from your own Supervisor rather than guessing (see "Why
   `openai_api_base_url` has no default" below for why this matters).
3. Set **Admin email** and **Admin password** in this add-on's
   Configuration tab — required, with no default. Public signup is
   permanently disabled in this add-on (see `DOCS.md` for why), so this
   is the *only* way to get an account.
4. Set **OpenAI API base URL** to `http://<the hostname from step
   2>:4000/v1`, and **OpenAI API key** to litellm's `master_key`. Both
   are required — this add-on refuses to start without the URL.
5. Start the add-on and open `http://<host>:8080/` — **not** the Home
   Assistant sidebar, see the networking section below.
6. Sign in with the admin email/password you set.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `admin_email` | email | *(none — required)* | The only account this add-on will ever create for you automatically. |
| `admin_password` | password | *(none — required)* | |
| `openai_api_base_url` | url | *(none — required)* | `http://<litellm-hostname>:4000/v1` — see Quick start step 2 for finding the real hostname. No guessed default; see `DOCS.md`. |
| `openai_api_key` | password | *(empty)* | litellm's `master_key`, if pairing with that add-on. |
| `extra_env` | list of `KEY=VALUE` | `[]` | Escape hatch for any of Open WebUI's many other environment variables. Malformed entries are logged and skipped. |

## Why `openai_api_base_url` has no default

HAOS add-on hostnames are repository-hash-prefixed and assigned **per
installation** — confirmed on a real guest, where the same add-ons
resolved as `a90308c2_hermes_gateway`, `9074a9fa_cloudflared`, etc.,
three different prefixes, none predictable at build time and none the
same on someone else's machine. A default of `http://local-litellm:4000/v1`
or any other fixed guess would work on exactly one installation and
silently fail on every other — which would present as "Open WebUI can't
reach my models" with no clue why. This add-on requires the value
instead and tells you exactly where to find it (see `DOCS.md` for a
worked example with real-looking hostnames).

## Why no `ingress: true`

Investigated and rejected with a real reproduction, the same standard
this repo holds every ingress decision to. Open WebUI is a compiled
SvelteKit app whose static assets (`/_app/immutable/...`, `/static/...`)
are root-relative. Upstream added a `PUBLIC_BASE_PATH` environment
variable specifically for reverse-proxy subpath deployments — tested it
directly, setting it to a fixed value and requesting the app at that
same path:

```
$ docker run ... -e PUBLIC_BASE_PATH=/api/hassio_ingress/testtoken12345 ...
$ curl http://127.0.0.1:.../api/hassio_ingress/testtoken12345/ | grep -o 'href="[^"]*"'
href="/static/favicon.png"    # still root-relative — PUBLIC_BASE_PATH had no effect
```

The served asset paths didn't change. Even setting the exact value
didn't help — and HA's ingress token isn't known to the container at
boot time anyway, which would have been a second, separate problem even
if the first one hadn't existed. Under a real ingress mount, the browser
would request `/static/...` and `/_app/immutable/...` at the site root,
past the mount prefix, and 404 against Home Assistant's own frontend
instead of this add-on. A direct port has none of that risk and is
what's actually verified working (see `DOCS.md` for the full login
round-trip). **Never remap this port to 80 or 443** — Home Assistant
itself owns those on this host.

## Why it's heavy, and what this add-on already does about it

Open WebUI downloads and loads a local `sentence-transformers`
embedding model (`all-MiniLM-L6-v2`) for its RAG/document features by
default — verified this alone accounts for ~977 MB written to `/data`
on first boot, plus a meaningful chunk of idle memory. This add-on sets
`RAG_EMBEDDING_ENGINE=openai` by default instead, routing embeddings
through whatever OpenAI-compatible backend you configure (e.g. litellm)
rather than downloading anything locally — measured idle memory drops
from ~972 MiB to ~660-690 MiB with this change alone. If you specifically
want the bundled local embedding model, override it back via `extra_env`
(`RAG_EMBEDDING_ENGINE=` — see upstream's own docs for the full
embedding-engine option set). Either way, this remains the heaviest
add-on in this repository — it fits comfortably on a well-resourced
host, but think twice on constrained hardware.

## Why public signup is disabled

Verified: Open WebUI's own default (`ENABLE_SIGNUP=true` whenever auth
is on) means whoever reaches the port *first* can create an account —
on a real published port reachable from your LAN, that's a race between
you and anyone else who can reach it before you configure it. This
add-on hardcodes `ENABLE_SIGNUP=false` and instead uses upstream's own
`WEBUI_ADMIN_EMAIL`/`WEBUI_ADMIN_PASSWORD` bootstrap mechanism (verified
directly — a real login round trip after setting these) to create
exactly one admin account, from this add-on's own required options, with
no window where an unauthenticated visitor could claim the first
account.

## Persistence

Chat history, uploads, the vector DB, and the auto-generated session
signing key all live under this add-on's `/data`, which Supervisor
persists and backs up automatically.

See [`DOCS.md`](DOCS.md) for the full verification log.
