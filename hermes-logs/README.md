# Hermes Logs

A focused Home Assistant sidebar console for the running Hermes Gateway add-on.
It reads the real Supervisor journal server-side, redacts common credential
shapes, and provides both a live browser view and small JSON/text APIs.

## Security boundary

- Home Assistant ingress is the only published UI; there is no host port.
- The Supervisor token stays inside this add-on and is never returned to the
  browser.
- Cross-add-on logs require `hassio_role: manager`. This app only performs
  `GET /addons/<slug>/logs` and exposes no control action.
- Common API keys, bearer tokens, Discord-token shapes, passwords, and URL
  credentials are redacted before any response leaves the server.
- The panel is administrator-only.

## APIs

All paths are relative to the Home Assistant ingress URL:

| Path | Result |
|---|---|
| `api/health` | Service and target health metadata |
| `api/config` | Non-secret UI configuration |
| `api/logs?lines=250` | Structured, classified, redacted JSON lines |
| `api/logs/raw?lines=250` | Redacted `text/plain` log view |

## Options

| Option | Default | Purpose |
|---|---:|---|
| `target_addon` | `a90308c2_hermes_gateway` | Installed Supervisor slug to read |
| `default_lines` | `250` | Initial line count, bounded to 50–1000 |
| `refresh_seconds` | `3` | Browser refresh interval, bounded to 1–60 seconds |
