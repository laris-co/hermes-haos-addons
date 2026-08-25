# Hermes Logs — Home Assistant documentation

Open **Hermes Logs** from the Home Assistant sidebar. The page refreshes the
running Hermes Gateway journal automatically, supports text and severity
filters, and can be paused or copied without stopping the gateway.

The **Raw text API** link at the bottom opens the same server-side redacted
stream in a CLI-friendly format. Increase or reduce the retained line count in
the add-on configuration or from the page toolbar.

> The Supervisor manager role is required because one add-on is reading the
> logs of another. Hermes Logs makes read-only requests and does not expose its
> Supervisor credential to browser JavaScript.
