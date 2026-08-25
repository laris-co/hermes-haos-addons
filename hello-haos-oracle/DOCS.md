# Hello HAOS Oracle

A tiny sidebar app. Open it from the Home Assistant sidebar — there is nothing to log into
and nothing to configure before it works.

## Configuration

```yaml
greeting: "The workshop is open."
accent_color: "#7c4dff"
```

**`greeting`** — the line shown under the title. Any text. Quotes and apostrophes are fine.

**`accent_color`** — any CSS colour (`#ff0000`, `rebeccapurple`, `rgb(20 180 140)`). It tints
the whole page background, not just an edge, so you can tell at a glance whether your change
was applied.

After changing either option press **Restart**. Options are read when the container starts.
You do not need Rebuild — that is for when the add-on's source code changes.

## Troubleshooting

**The page looks unstyled or shows `{{GREETING}}`.**
The template was served without being rendered. Check the add-on log; `run.sh` prints the
values it rendered with on every start, and refuses to start at all if its options reader is
missing.

**It does not appear in the sidebar after installing.**
`ingress: true` creates the route; the sidebar panel is a separate Supervisor flag. Turn it
on from the add-on page, or with the control tooling's `addons-sidebar` recipe. The Home
Assistant frontend also caches the panel list — a restart plus a hard reload settles it.

**It is gone after a host reboot.**
It should not be — this add-on sets `boot: auto` precisely so it comes back. If it is
stopped, something changed that setting.

**A `403` when you curl it directly.**
Correct and expected. The ingress service only accepts the Supervisor as a peer, because
Home Assistant has already done the authenticating. Reach it through the sidebar.
