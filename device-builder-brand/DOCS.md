# Device Builder (your brand)

The ESPHome Device Builder with **your** name, colours and logo — set from the
Configuration tab. No fork, no hand-patched copy per brand, and no rebuild when
you change a colour.

## Configure

| Option | What it does |
|---|---|
| `brand_name` | Replaces every visible occurrence of `replace_word` — header, page title, onboarding. |
| `tagline` | Replaces the dashboard subtitle. Leave the default to keep upstream wording. |
| `primary_color` | Any CSS colour. Drives buttons, header, chips — the whole palette. |
| `accent_color` | Secondary accent. Defaults to `primary_color`. |
| `logo_svg` | Optional raw `<svg>…</svg>` markup. Empty keeps the upstream logo. |
| `replace_word` | The word swapped for `brand_name`. Only change if upstream renames itself. |

Change an option → **Restart** the add-on. (Rebuild is only needed after bumping
the ESPHome version in the Dockerfile.)

> ### Known caveat: a changed brand can be hidden by browser cache
>
> The rename is appended to the frontend's **content-hashed** bundle
> (`app.<hash>.js`). Appending changes the file's *contents* but not its
> *name* — and a hashed asset is served as effectively immutable, because the
> hash is normally a promise that the bytes never change. This add-on breaks
> that promise.
>
> Consequence: after changing `brand_name` (or any option) and restarting, a
> browser that already loaded the old bundle keeps showing the **old** brand,
> while the add-on serves the new one. Verified on a real guest 2026-08-25:
> the served bundle contained `"brand": "Cat Lab"` while the page still
> rendered the previous value, and an in-page cache purge did not clear it.
>
> Confirm what the add-on is *actually* serving, rather than what a tab shows:
>
> ```sh
> just addon-ingress <ip> <user> <pass> <slug> "app.<hash>.js" | grep -o 'var C={[^}]*}'
> ```
>
> To see the change in a browser: open it in a fresh profile or private window,
> or hard-reload with cache disabled in devtools. The colours are *not*
> affected — they live in an inline `<style>` in `index.html`, which is served
> `no-store`, so palette changes appear immediately.
>
> A proper fix is to rewrite `index.html` to reference the bundle with a
> cache-busting query (`app.<hash>.js?b=<brand-hash>`) so a brand change yields
> a new URL. Not yet implemented.

Example:

```yaml
brand_name: "Cat Lab Device Builder"
tagline: "Cast every smart device from the Cat Lab bench"
primary_color: "#7c4dff"
accent_color: "#ff6e9c"
logo_svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#7c4dff"/><circle cx="24" cy="26" r="11" fill="#fff"/></svg>'
```

## Running it alongside the official ESPHome add-on

Both read the same `/config/esphome`, so your devices appear in either. This
add-on is **ingress-only** (no `ports:`) precisely so it cannot collide with the
official add-on's `6052/tcp`. Open it from the sidebar.

If you are *not* running the official add-on and want a published port, add
`ports: {6052/tcp: 6052}` to `config.yaml`.

## How it works (and why it works that way)

The dashboard serves a strict Content-Security-Policy — read off the live page:

```
default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:
```

That single line dictates the whole design:

- **Colours** are injected as an inline `<style>` in `index.html`. `style-src`
  includes `'unsafe-inline'`, so this is allowed — and because CSS custom
  properties inherit *through* shadow DOM, redefining the dashboard's own
  tokens at `:root` recolours every Lit/Web-Awesome component at once.
- **Name and logo** are appended to the app bundle (`app.<hash>.js`), **not**
  added as an inline `<script>`. There is no `script-src`, so scripts fall back
  to `default-src 'self'`: an inline script is silently blocked (it fails with
  no error in the UI), while the same-origin bundle runs normally.
- The logo becomes a `data:` URI, which `img-src` permits.
- The rename **sweeps on an interval** rather than using a `MutationObserver`,
  because the SPA re-renders into shadow roots and an observer on the document
  does not see inside them.

Both injections are marker-delimited and stripped before re-applying, so
restarting with new options replaces the brand instead of stacking copies.

If the frontend ever moves, `brand.py` logs a warning and the add-on starts
**unbranded** rather than failing to boot.

## Licence and attribution

This add-on contains **no upstream source**. It runs the official image
`ghcr.io/esphome/esphome-hassio` and applies your branding at runtime.

| Component | Licence |
|---|---|
| Device Builder frontend (`esphome/device-builder-frontend`) | Apache-2.0 |
| Dashboard backend (`esphome/esphome`, Python) | MIT |
| Device runtime (`esphome/esphome`, C++) | GPLv3 — compiled onto the ESP; not modified or redistributed here |

Apache-2.0 permits modification and redistribution; **§6 does not grant
trademark rights**. That is why this add-on ships with a neutral default name
and requires you to supply your own: use it to brand *your* build, not to pass
your build off as ESPHome's. Keep the upstream `LICENSE`/`NOTICE` that ship
inside the base image intact.

"ESPHome" is a trademark of its respective owner, used here nominatively to
describe the origin of the software being reskinned. This add-on is not
affiliated with, sponsored by, or endorsed by ESPHome or the Open Home
Foundation.
