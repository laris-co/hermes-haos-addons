# This add-on is built but deliberately NOT published

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
