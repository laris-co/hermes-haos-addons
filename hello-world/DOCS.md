# Hello World — implementation notes

This app is intentionally boring: static HTML behind nginx. That makes it a
useful known-good baseline when a more complex application fails under Home
Assistant ingress.

## Ingress contract

- `config.yaml` enables ingress on the conventional internal port `8099`.
- nginx permits only Supervisor's ingress address, `172.30.32.2`, and denies all
  other network peers.
- the page has no root-relative external assets, client-side routing, API calls,
  WebSockets, OAuth redirects, or assumptions about `location.origin`.
- Home Assistant owns authentication. The app does not implement a second login.

## Security surface

The container has no host network, Supervisor API, Home Assistant API, device,
folder, or credential access. It exposes no host port and remains in protected
mode. Its content security policy denies every resource type except the inline
stylesheet and the inline data emoji presentation.

## Verification

Build locally, attach the container to a test bridge, and request it from the
Supervisor address `172.30.32.2`; requests from other source addresses must be
denied. On HAOS, use a real Supervisor ingress session rather than treating a
`started` container state as proof that the page works.
