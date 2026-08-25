# Kit4Kids Lab

The classroom bench card for the Kit4Kids PM2.5 kit — wiring, sensor, MQTT topics and the
build order, on one page in the Home Assistant sidebar.

Ingress-only: no published port, no credentials, no API access, no host privileges. Home
Assistant's login is the whole auth boundary.

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `lab_name` | `str` | `Kit4Kids` | shown in the title and footer; HTML-escaped |
| `accent_color` | `str` | `#32c999` | any CSS colour; tints the whole page |
| `mqtt_prefix` | `str` | `DUSTBOY/DBK` | topic root shown on the card |

Options are applied when the container **starts** — after changing them press **Restart**,
not Rebuild. Rebuild is for when the source changes.

## Design notes

- **`boot: auto`.** A host reboot leaves `boot: manual` add-ons stopped, and a stopped add-on
  reads as a failed install when it is nothing of the kind.
- **HTML + CSS only.** The ingress CSP is `default-src 'none'` with no `script-src`, so an
  inline `<script>` is dropped *silently*. Ship JS as a same-origin file or not at all.
- **`Cache-Control: no-store`.** The page is regenerated at every start; without this a
  browser can apply heuristic freshness and show a stale page after an options change — the
  option applied correctly and simply never seen.
- **Rendered from a template, never `sed -i`.** A restart reuses the writable layer, so an
  in-place edit stops applying options from the second restart onward.
- **Escaped in `python3`, not `sed`.** A classroom name with an apostrophe is a legal name.
  `python3` is installed explicitly because the base image lacks it; `run.sh` fails loud
  rather than serving an unconfigured page.

## Install

```sh
just addons-reload  <ip> <user> <pass>
just addons         <ip> <user> <pass> find kit4kids
just addons         <ip> <user> <pass> install <slug>
just addons-sidebar <ip> <user> <pass>        # ingress_panel is false by default
just addon-ingress  <ip> <user> <pass> <slug> ''   # prove it SERVES, not just "started"
```

## Licence

See the repository `LICENSE`.
