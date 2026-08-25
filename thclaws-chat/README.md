# thCLAWS Chat — focused Home Assistant sidebar app

This app exposes thCLAWS v0.115's built-in `chatbot` GUI shell as its own
Home Assistant sidebar entry. It is deliberately a tiny nginx reverse proxy:

```text
browser -> Home Assistant ingress -> thclaws-chat -> thclaws -> agent engine
```

It does **not** copy provider credentials, call 9Router directly, start a
second thCLAWS process, or duplicate the chatbot assets. It proxies the
`gui-shell/chatbot/` assets already embedded in thCLAWS and supplies the same
small `postMessage` ↔ WebSocket relay as thCLAWS's own `UIView` component. The
full thCLAWS app and this focused chat surface use the same running agent,
sessions, models, tools, approvals, and workspace.

## Requirements

1. Install and configure the sibling `thclaws` add-on first.
2. Keep `thclaws` running whenever you use this app.

The internal target name `a90308c2-thclaws` is the Supervisor/Docker DNS name
for this repository's `thclaws` add-on. No host port is published and the
existing thCLAWS launch mode is unchanged.
