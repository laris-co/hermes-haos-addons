# 9Router — security posture

> **2026-08-25 — this add-on was withheld and is now published, at the
> repository owner's explicit request.** The reasoning that follows is the
> original withholding note, kept in full because it is still the right thing to
> read before installing. What changed is recorded here first.

## What changed

The withholding rested on two CRITICAL advisories with no patched version. Both
are still open (`first_patched_version: null`, neither withdrawn), but their
**affected ranges do not include the version this add-on now pins**:

| Advisory | Severity | Affected range | Pinned here |
|---|---|---|---|
| GHSA-vjc7-jrh9-9j86 | CRITICAL | `<= 0.4.41` | 0.5.55 |
| GHSA-qvfm-67h2-2qfx | CRITICAL | `<= 0.4.71` | 0.5.55 |

**Being above an affected range is not the same as being fixed.** Neither
advisory declares a patched version, which usually means later releases are
unassessed rather than confirmed clean — and this project's own history is of
the same root cause recurring after being "fixed". Treat 0.5.55 as unaudited,
not as safe.

## What this add-on does about it

- **Published LAN port, explicitly not an Internet port.** Port 20128 serves the
  dashboard and `/v1` API because the upstream SPA cannot run beneath HA's
  dynamic ingress prefix. The HA sidebar provides a landing page that opens this
  direct origin in a new tab. Keep the port behind the LAN firewall and do not tunnel it without
  additional authentication/hardening.
- **`initial_password` has no default** and is a non-optional schema type, so
  Supervisor refuses to start until a real one is set. Upstream's own default
  falls back to the literal `123456`, which is the exact weakness behind a
  documented prior RCE advisory.
- **`require_api_key` defaults to true**, where upstream leaves `/v1/*` reachable
  with no credential at all.
- **The dashboard cookie defaults to non-Secure** because the direct LAN origin
  is HTTP. This is required for login on that published port. Enable the
  Secure flag only if port 20128 is actually served over HTTPS.

## One thing worth knowing that is not a CVE

The dashboard loads Google Analytics from `googletagmanager.com`
(`G-LC959F603F`) on every page. A self-hosted AI router that reports page views
to a third party is a privacy property, not a vulnerability — but it is not
something the upstream README mentions, and it is visible in the served HTML.

---

# Original withholding note (kept in full)

## This add-on was built and deliberately NOT published

If you found this directory expecting an installable add-on: it was
built, fully documented, and verified — then withheld. This is not an
abandoned draft.

## Why

An independent, deeper pass over `github.com/decolua/9router`'s
security advisories (beyond what's already in `README.md`/`DOCS.md`)
found **19 advisories total: 6 CRITICAL, 11 HIGH, 2 medium.** Two of the
CRITICAL ones have **no patched version at all**, as of this writing:

- **GHSA-vjc7-jrh9-9j86** (CRITICAL, published 2026-06-13, no patch) —
  unauthenticated CRUD on `/api/providers` and a full API key leak via
  `/api/usage/stats`.
- **GHSA-qvfm-67h2-2qfx** (CRITICAL, published 2026-06-20, no patch) —
  complete credential theft and database takeover.

The digest this add-on pins (`decolua/9router:latest`, image-reported
version `0.5.55`) clears every *stated* patched-version floor found for
the other advisories — but you cannot clear a floor that does not
exist. Shipping this to strangers as an installable add-on would mean
handing out something with two open, unauthenticated, critical holes in
a piece of software whose entire job is holding API keys.

This also **inverts** this repo's original networking decision for this
add-on. The plan was `ingress: true` with no published port, reasoning
that a reverse proxy in front of 9router would contain the header-based
auth-bypass class documented elsewhere in its advisory history. Two of
the advisories found in this same pass — **GHSA-x5c9-v98j-722r**
("Reverse proxy locality collapse allows unauthenticated access to
9router `/v1` APIs") and **GHSA-86m2-fcxq-5q7c** (Host-header spoofing,
same shape) — describe a reverse-proxy deployment as the *vulnerable*
configuration, not the safe one. Ingress was never going to be the
containment it was assumed to be.

## What's safe, for contrast

A hand-run instance of 9router bound to a specific LAN IP (never
`0.0.0.0`) behind a real firewall — the shape this fleet actually runs
in production — is a materially different risk than a HAOS add-on
handed to strangers running arbitrary home networks. That deployment
shape stays; this add-on does not ship.

## How this add-on is disabled

`config.yaml` has been renamed to `config.yaml.disabled`. Supervisor's
repository scanner requires a valid `config.yaml`/`config.json` in a
directory to recognize it as an installable add-on — without one, this
directory is inert to the Add-on Store; the rest of the files
(`Dockerfile`, `run.sh`, `README.md`, `DOCS.md`) are left untouched and
fully readable, so the work and its reasoning aren't lost. If a
patched version of 9router closes both open criticals, this can be
re-enabled by renaming the file back.

Everything else in this repository — `hermes-gateway`, `hermes-agent`,
`hermes-server`, `litellm`, `open-webui`, and whatever ships after this
— is unaffected by this decision.
