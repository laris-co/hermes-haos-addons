# Design and verification notes

thCLAWS v0.115 embeds a built-in GUI shell named `chatbot`. Its normal browser
server exposes the shell at `/gui-shell/chatbot/` and the shared agent IPC at
`/ws`. The shell bridge uses `postMessage` when an iframe parent hosts it.

This app reproduces that parent in fewer than 130 lines of dependency-free
JavaScript:

1. iframe loads thCLAWS's own `/gui-shell/chatbot/` assets;
2. shell bridge requests become `gui_shell_*` JSON frames on `/ws`;
3. `gui_shell_event` frames are posted back to the shell;
4. model/theme events are forwarded using the same envelopes as thCLAWS's
   React `UIView` host.

nginx listens on ingress port `8099` and lazily proxies the shell, WebSocket,
and sandboxed file assets to `a90308c2-thclaws:8342` across Supervisor's
private add-on network. Only the Supervisor ingress peer (`172.30.32.2`) may
reach port 8099. There are no published ports, APIs, mapped folders,
credentials, host privileges, or changes to the existing thCLAWS add-on.

## Failure mode

If thCLAWS is stopped or restarting, the host remains available and shows a
reconnecting state while shell/IPC requests temporarily fail. nginx resolves
the sibling name lazily through Docker DNS so the companion itself stays
running and recovers without a restart when thCLAWS returns.
