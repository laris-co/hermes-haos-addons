# Device Builder (your brand)

The ESPHome Device Builder with **your** name, colours and logo — configured
from the add-on's Configuration tab.

- **No fork.** Runs the official `ghcr.io/esphome/esphome-hassio` image; this
  repo contains no upstream source.
- **No hand-patching.** Branding is generated at start-up from your options, so
  one add-on serves any number of brands — change a colour, hit Restart.
- **Upgrade cheaply.** New ESPHome release = bump the `FROM` tag. Nothing to
  re-patch.
- **Fails soft.** If the frontend layout ever moves, it starts unbranded rather
  than not at all.

```yaml
brand_name: "Cat Lab Device Builder"
primary_color: "#7c4dff"
```

Ingress-only, so it can run alongside the official ESPHome add-on without
fighting over port 6052. Your devices in `/config/esphome` appear in both.

See [DOCS.md](DOCS.md) for every option, the CSP details that shape how the
injection works, and the licence/trademark reasoning.

> Reskin of Apache-2.0 (frontend) / MIT (backend) software. Not affiliated with
> or endorsed by ESPHome or the Open Home Foundation.
