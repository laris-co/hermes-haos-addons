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
>   add-on can create — this is why the ingress panel is a static landing page
>   rather than a reverse proxy, and why the port must not be
>   tunnelled without further hardening; see `SECURITY.md`), and
>   **GHSA-5mj8-gf6m-fhw8** (a spoofed `X-9r-Real-Ip` header bypassing
>   API-key checks entirely).
> - Separately, **upstream's own documented default behavior ships two
>   more weak defaults** we do not inherit in this add-on — see
>   "What this add-on changes from upstream's defaults" below.
>
> **This add-on publishes port 20128 to the LAN.** Home Assistant's sidebar
> shows a landing page whose primary button opens that direct dashboard in a
> new tab; the `/v1/*` API is on the same port. Do not expose it to the Internet or point
> a tunnel at it without additional hardening. Given this project's history,
> the LAN exposure is a deliberate usability tradeoff rather than a claim
> that the application is safe to expose broadly.
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
2. Leave **Require API key** on. The dashboard cookie defaults to non-Secure
   because the published LAN port is plain HTTP; enable **Auth cookie secure**
   only if you actually serve port 20128 over HTTPS.
3. Start the add-on, open it from **Home Assistant's own sidebar**, then click
   **Open 9Router ↗** to launch the dashboard in a new tab.
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
| `auth_cookie_secure` | bool | `false` | Marks the dashboard auth cookie `Secure`. The default must be false for the plain-HTTP `:20128` LAN origin opened by the landing page. Enable only when that port is genuinely served over HTTPS. |
| `extra_env` | list of `KEY=VALUE` | `[]` | Provider API keys and any other env-based tuning. Malformed entries are logged and skipped. |

## Networking — published app plus sidebar landing page

Port **20128** serves the unmodified 9Router dashboard and `/v1/*` API at
a root origin. HA ingress port **20129** serves a static landing page with an
**Open 9Router ↗** button (`target="_blank"`). This avoids forcing the Next.js
SPA under HA's dynamic ingress prefix, where its root-relative navigation
breaks, while keeping the Home Assistant tab open.

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
