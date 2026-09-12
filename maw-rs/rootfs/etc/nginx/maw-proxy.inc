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

# maw serve's live views hold an idle-but-open WebSocket; nginx's 60s default
# would cull them.
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
