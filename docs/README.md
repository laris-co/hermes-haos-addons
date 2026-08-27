# Air quality wall — public preview

Generated copy of [`esp-flasher/wall/`](../esp-flasher/wall/), published via GitHub Pages
so it's reachable without a Home Assistant login. The add-on's own `/wall/` (served
through HA ingress) is the source; sync changes there first, then re-copy here.

Start at [`index.html`](index.html) for the full gallery, or go straight to
[`air-wall.html`](air-wall.html) for the restrained table view.

## What's different from the ingress copy

The HA add-on fills each wall's connection settings server-side (nginx `sub_filter`
injects `_wallcreds.js`, which reads a JSON file rendered from Supervisor options —
see `esp-flasher/render_creds.py`). There's no server here to render anything, so:

- `_wallcreds.js` is the *same file*, injected once at copy time instead of at serve time.
- `_creds.json` is a **static, committed file** — not a live Supervisor option. It holds:
  - `host: cat2.buildwithoracle.com`, `port: 443`, `tls: true` — a Cloudflare Tunnel
    (`catlab-hassio`) published straight to `core-mosquitto:1884`.
  - `user`/`pass: catlab` / `catlab` — the fleet's shared MQTT credential.

## ⚠️ Known exposure — read before extending this

This page, this credential, and this broker hostname are now **public and permanent**:
anyone with this URL can view-source the credential, and `cat2.buildwithoracle.com` has
no Cloudflare Access gate in front of it — the credential authenticates against the
whole broker, not just a read-only scope. Decided and accepted 2026-08-27 (reuse
`catlab`/`catlab`, add an ACL later) rather than minting a separate scoped credential.

**Before this goes further than "link for the team":**
- [ ] Add a mosquitto ACL restricting this credential to read-only on the `dbk/#` topics
      it actually needs, not full publish/subscribe on everything.
- [ ] Consider a Cloudflare Access policy on `cat2.buildwithoracle.com`, or a separate
      credential scoped to this public page instead of the shared fleet one.
- [ ] Rotate `catlab`/`catlab` once the above lands — this exact string is now sitting in
      public git history and cannot be un-published from here.
