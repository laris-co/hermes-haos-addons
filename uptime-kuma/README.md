# Uptime Kuma

Runs [Uptime Kuma](https://github.com/louislam/uptime-kuma): a
self-hosted uptime/status monitoring dashboard — HTTP(s), TCP, DNS,
Docker container, and browser-based (Playwright) monitors, with
notifications to 90+ services. Useful here for watching this repo's
other add-ons (`litellm`, `hermes-server`, etc.) and anything else on
your network from one dashboard.

## Quick start

1. Install and start the add-on.
2. Open `http://<host>:3001` in a browser.
3. Complete Uptime Kuma's own first-run setup wizard — it creates the
   admin account interactively. There is no env-var or config-option
   way to preseed this (verified: no such mechanism exists in the
   image), and no way to leave it unauthenticated — the wizard is
   mandatory before the dashboard is usable.
4. Add monitors from the dashboard.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `extra_env` | list of `KEY=VALUE` | `[]` | Escape hatch for advanced tuning (e.g. notification-provider env vars). Malformed entries are logged and skipped. |

That's the only option. Unlike every other add-on in this repo, there
is no credential to configure here — Uptime Kuma has no env-var-based
auth bypass to fail loud on, so there's nothing for `run.sh` to check.

## Networking — a published port, not a sidebar

Maps `3001/tcp` directly, **not** an ingress sidebar, even though this
is a browser dashboard and the standing rule elsewhere in this repo is
"web UI → sidebar." Checked properly, not skipped: the served page
references absolute, root-relative asset paths
(`/assets/index-*.js`, `/assets/index-*.css`, `/apple-touch-icon.png`,
`/manifest.json`), and there's no `BASE_URL`-style env var or documented
reverse-proxy-subpath mode to fix it (checked the image's env and its
own `server/database.js` env-var reads). This is the same failure class
that kept `litellm`'s `/ui/` and `9router`'s dashboard off ingress in
this repo — see `DOCS.md` for the exact transcript.

**Never remap this to 80 or 443** — Home Assistant itself owns those on
this host.

## Persistence

`DATA_DIR=/data` (verified directly against the image's own source,
not assumed from docs) redirects Uptime Kuma's SQLite database,
uploaded assets, screenshots, and Docker-TLS certs onto this add-on's
`/data`, which Supervisor persists and backs up automatically.

See [`DOCS.md`](DOCS.md) for the full verification log.
