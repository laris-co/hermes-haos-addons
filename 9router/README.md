# 9Router

> ## ⚠️ PUBLISHED WITH KNOWN SECURITY RISK
>
> This add-on **is installable**, but it was withheld first and published
> only at the repository owner's explicit request. A deeper pass over
> upstream's security advisories turned up **19 total: 6 CRITICAL, 11
> HIGH, 2 medium** — including **two CRITICAL advisories with no patched
> version at all** as of this writing (GHSA-vjc7-jrh9-9j86:
> unauthenticated API-key leak; GHSA-qvfm-67h2-2qfx: full
> credential/database takeover). The pinned 0.5.55 image is above their
> affected ranges, but that is **not** the same as being fixed. Read
> `SECURITY.md` in this directory before you install it.

> ## ⚠️ Security history — read this before installing anything
>
> [decolua/9router](https://github.com/decolua/9router) has shipped, and
> had to re-fix, **multiple unauthenticated remote-code-execution and
> authentication-bypass vulnerabilities through 2026**, and the pattern
> repeats: a fix closes one hole, and a variant of the same root cause
> reopens a different one.
>
> - **CVE-2026-10269** (fixed 0.4.1) — a spoofed `Host` header bypassed
>   dashboard login entirely (`isAuthenticated` in `src/dashboardGuard.js`).
> - **CVE-2026-46339** / GHSA-fhh6-4qxv-rpqj (fixed 0.5.2) —
>   **unauthenticated remote code execution**: unprotected MCP plugin
>   routes passed attacker-controlled arguments straight into
>   `child_process.spawn()`.
> - The fix for that RCE added a "local-only" gate restricting
>   spawn-capable routes to loopback requests — determined by reading the
>   `Host`/`Origin` headers instead of the actual TCP source.
> - **CVE-2026-49353** / GHSA-6g2f-w7g3-77vf — **that exact gate was
>   then bypassed** the same way as the original 2026-10269 bug: spoof
>   the header, walk through the "local-only" check from the network.
> - **19 advisories total on the project's own [security
>   page](https://github.com/decolua/9router/security/advisories): 6
>   CRITICAL, 11 HIGH, 2 medium** — including **GHSA-vjc7-jrh9-9j86**
>   (CRITICAL, unauthenticated CRUD on `/api/providers` + full API-key
>   leak via `/api/usage/stats`) and **GHSA-qvfm-67h2-2qfx** (CRITICAL,
>   complete credential/database takeover), **neither of which has a
>   patched version as of this writing** — you cannot pin past a fix
>   that doesn't exist. Also **GHSA-x5c9-v98j-722r** and
>   **GHSA-86m2-fcxq-5q7c**, both "unauthenticated access to `/v1` proxy
>   APIs" via the *same* class of header-trust bug **specifically in a
>   reverse-proxy deployment** (exactly the shape of deployment a HAOS
>   add-on is — this is why the ingress panel is a launcher rather than
>   a reverse proxy of the SPA, and why the published port must not be
>   tunnelled without further hardening; see `SECURITY.md`), and
>   **GHSA-5mj8-gf6m-fhw8** (a spoofed `X-9r-Real-Ip` header bypassing
>   API-key checks entirely).
> - Separately, **upstream's own documented default behavior ships two
>   more weak defaults** we do not inherit in this add-on — see
>   "What this add-on changes from upstream's defaults" below.
>
> **This add-on deliberately does not publish a port.** The dashboard is
> reached through Home Assistant's own sidebar (ingress — HA's login is
> the auth boundary for the browser UI), and the `/v1/*` proxy API is
> reachable by other add-ons on this same host over Supervisor's
> internal network, without needing to be reachable from your LAN or the
> internet at all. Given this project's specific history — nearly every
> serious advisory is *exactly* "a reverse-proxy header was trusted for a
> security decision, and shouldn't have been" — minimizing the externally
> reachable surface is the responsible default here, not a formality.
> **We are not implying the current version is unsafe to run.** We're
> telling you what it's been, plainly, so you can decide with full
> information rather than discover it later. See `DOCS.md` for exact
> verification of what this add-on changes.

## What it is

Runs [decolua/9router](https://github.com/decolua/9router): an
OpenAI-compatible routing proxy in front of 40+ AI providers with
fallback, token-saving compression, and quota tracking — built for
coding tools (Claude Code, Cursor, Cline, etc.) but usable by anything
that speaks the OpenAI API, including `hermes-gateway`/`hermes-server`
in this repo.

## Quick start

1. Set **Initial password** in this add-on's Configuration tab —
   required, with no default, on purpose (upstream's own unset default
   is the literal string `123456`; see `DOCS.md`).
2. Leave **Require API key** and **Auth cookie secure** at their
   defaults (`true`) unless you specifically know you need otherwise.
3. Start the add-on and open it from **Home Assistant's own sidebar**.
4. Log in with the initial password, then change it from the dashboard
   and set up your provider keys.
5. Other add-ons on this host (e.g. `hermes-gateway` via `extra_env`)
   can reach the `/v1` API directly over Supervisor's internal add-on
   network — see `DOCS.md` for the hostname convention (not
   independently confirmed for this specific repo, see that note).

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `initial_password` | password | *(none — required)* | First-login dashboard password. Change it from the dashboard after first login. |
| `require_api_key` | bool | `true` | Enforces a Bearer token on `/v1/*`. Upstream defaults this to off; this add-on does not. |
| `auth_cookie_secure` | bool | `true` | Marks the dashboard auth cookie `Secure`. Safe to leave on for the ingress deployment this add-on is built around (HA's frontend is normally HTTPS even though Supervisor's internal hop to the add-on is plain HTTP — the browser's Secure-cookie check is based on the page's own origin scheme, not that internal hop). Only turn off for a plain-HTTP-only LAN setup. |
| `extra_env` | list of `KEY=VALUE` | `[]` | Provider API keys and any other env-based tuning. Malformed entries are logged and skipped. |

## Networking — no published port, on purpose

No `ports:` block in this add-on. The dashboard is reached via HA's
sidebar (`ingress: true`); the `/v1/*` API is meant for other add-ons on
this host to call internally, not for an external tool on a different
machine. If you specifically need that (e.g. Claude Code running on your
laptop calling this add-on directly), that requires editing this
add-on's `config.yaml` yourself to add a `ports:` block — deliberately
not offered as a one-click option here, given the security history
above.

**Known limitation, verified not assumed**: the dashboard's static
assets (`/_next/static/...`) are root-relative and not aware of HA's
ingress path prefix — confirmed by diffing two real responses with and
without an `X-Ingress-Path` header (byte-identical). The dashboard page
may render unstyled/without its JS through the sidebar. This did not
change the networking decision above — see `DOCS.md` for the full
reasoning.

**If the sidebar entry doesn't appear after install** (see `SECURITY.md`
for the security context): `ingress: true` makes an
add-on *eligible* for a sidebar entry, but whether it's shown is
separate Supervisor runtime state (`ingress_panel`, not a `config.yaml`
key) that has been observed defaulting to off on most add-ons on a real
guest — check for a "Show in sidebar" toggle on the add-on's own page.

## Persistence

All app state (SQLite DB, JWT signing secret, and the HMAC secrets this
add-on generates — see `DOCS.md`) lives under this add-on's `/data`,
which Supervisor persists and backs up automatically.

See [`DOCS.md`](DOCS.md) for the full verification log — including the
exact commands that produced the 401/200 results this README's defaults
depend on.
