# Shared proxy settings for every location in maw-ingress.conf.
#
# The Authorization header is REPLACED, not forwarded: the client authenticated
# to nginx with HTTP Basic (auth_basic, checked before this runs), and what
# maw serve wants instead is its own bearer token. Injecting it here is what
# lets the UI work without a second login prompt — the token never reaches the
# browser. /tmp/maw-auth.conf is generated at boot by run.sh because the token
# is not known until then.
include /tmp/maw-auth.conf;

proxy_http_version 1.1;

proxy_set_header Host $http_host;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
proxy_set_header X-Real-IP $remote_addr;

# Origin is REWRITTEN to one fixed value, which run.sh puts in
# MAW_SERVE_ALLOWED_ORIGINS. maw serve enforces an Origin allowlist (verified:
# an asset request carrying Origin: http://<ha-host> gets 403, the same
# request with no Origin gets 200, and "*" is not accepted as a wildcard), but
# the real Origin here depends on how the user reached Home Assistant —
# an mDNS name, a bare IP, a Tailscale or NetBird name — so it cannot be
# enumerated at build time. Normalizing it keeps the allowlist meaningful
# instead of forcing it open, and costs nothing: the only way to reach this
# proxy at all is through Supervisor's authenticated ingress.
proxy_set_header Origin "http://127.0.0.1:3461";

# maw serve's live views hold an idle-but-open WebSocket; nginx's 60s default
# would cull them.
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
