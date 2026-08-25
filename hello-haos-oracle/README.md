# Hello HAOS Oracle

The guest-side oracle's calling card — a self-contained Home Assistant sidebar app.

It exists to prove the whole path end to end: **repository → Supervisor build → ingress →
sidebar**, with no published port, no credentials, no API access, and no host privileges.
It is also the reference for how an add-on in this repo should be shaped.

## What it demonstrates

| Property | Value | Why |
|---|---|---|
| `ingress: true`, no `ports:` | port 8099, Supervisor-only | Home Assistant login is the entire auth boundary |
| `hassio_api` / `homeassistant_api` / `host_network` | all `false` | an app that renders a page needs none of them |
| `boot: auto` | survives a host reboot | `boot: manual` add-ons come back **stopped**, which reads as a failed install |
| `init: false` | base image owns `/init` | the HA base ships s6-overlay; a second init is a bug |
| pinned `FROM` by digest | reproducible | Supervisor 2026.04+ no longer supplies an implicit `BUILD_FROM` |
| options rendered at start | `greeting`, `accent_color` | change config, restart, see it — no rebuild |

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `greeting` | `str` | `The workshop is open.` | HTML-escaped; quotes and apostrophes are safe |
| `accent_color` | `str` | `#7c4dff` | any CSS colour; paints a full-bleed wash |

Options are applied when the container **starts**, so after changing them use **Restart**,
not Rebuild. Rebuild is for when the *source* changed.

## Design notes worth keeping

**The page is HTML + CSS only, deliberately.** The ingress `Content-Security-Policy` is
`default-src 'none'` with no `script-src`, so an inline `<script>` would be blocked
*silently* — nothing in the console, nothing in the UI. If you ever need JavaScript, ship it
as a same-origin file and add `script-src 'self'`. Do not inline it and assume it ran.

**`run.sh` renders `index.tmpl` → `index.html` on every start** rather than editing the
served file in place. A Supervisor restart reuses the container's writable layer, so an
in-place `sed -i` would find its placeholder already consumed on the second restart and
quietly stop applying options. Rendering from an untouched template is idempotent for free.

**Substitution happens in `python3` with HTML escaping**, not `sed`. A greeting containing a
quote is a legal greeting, not a broken page. `python3` is installed explicitly in the
Dockerfile because the base image does not include it — omit it and the options reader fails
silently, so `run.sh` fails loud instead.

## Install

```sh
# from a machine with the control tooling (never SSH into the guest)
just addons-reload  <ip> <user> <pass>
just addons         <ip> <user> <pass> find hello_haos_oracle   # get the real slug
just addons         <ip> <user> <pass> install <slug>
just addons-sidebar <ip> <user> <pass>                          # ingress_panel on
```

Verify it actually **serves**, rather than merely reports `started`:

```sh
just addon-ingress <ip> <user> <pass> <slug> ''
```

`started` means Supervisor brought the container up. It does not mean anything answered.

## Licence

See the repository `LICENSE`.
