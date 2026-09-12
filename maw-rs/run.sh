#!/bin/sh
# shellcheck shell=sh
#
# Boots `maw serve` behind an nginx basic-auth sidecar.
# Runs as PID 1's direct child under Docker's built-in --init (config.yaml sets
# init: true — see that file for why there is no s6-overlay here).
set -eu

OPTIONS_FILE="/data/options.json"

get_opt() {
    key="$1"
    default="${2:-}"
    if [ ! -f "$OPTIONS_FILE" ]; then
        echo "$default"
        return 0
    fi
    val="$(python3 - "$OPTIONS_FILE" "$key" <<'PY'
import json, sys
path, key = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    print("")
    sys.exit(0)
val = data.get(key, "")
if val is None:
    val = ""
print(val)
PY
)"
    if [ -z "$val" ]; then
        echo "$default"
    else
        echo "$val"
    fi
}

username="$(get_opt username catlab)"
password="$(get_opt password catlab)"

if [ "$username" = "catlab" ] && [ "$password" = "catlab" ]; then
    echo "[maw] WARNING: using the default catlab:catlab login. Change it in this" >&2
    echo "[maw] add-on's Configuration tab before exposing it beyond your own LAN —" >&2
    echo "[maw] this credential is the only gate in front of a live agent fleet UI." >&2
fi

# openssl passwd -apr1 is the format nginx's auth_basic_user_file wants.
# Written to /tmp, not /data: it is derived state, regenerated every boot from
# whatever the options currently say, and must never outlive a password change.
#
# Owned by www-data, not root: nginx's master starts as root but its worker
# drops to www-data, and the worker is what opens this file. Root-owned 0600
# here produces a 500 on every request with `open() "/tmp/maw.htpasswd" failed
# (13: Permission denied)` in the error log — measured, not guessed.
printf '%s:%s\n' "$username" "$(openssl passwd -apr1 "$password")" > /tmp/maw.htpasswd
chown www-data /tmp/maw.htpasswd
chmod 400 /tmp/maw.htpasswd

# maw serve's own auth is a bearer token: without one it answers static files
# but rejects every browser API/WebSocket client with 403 ("browser clients
# refused" in its startup log). The token is generated once and persisted, so
# it survives restarts, and is injected by nginx — it is never sent to the
# browser and the user never types it. Their credential is the basic-auth pair.
TOKEN_FILE=/data/.maw_serve_token
mkdir -p /data
if [ ! -s "$TOKEN_FILE" ]; then
    openssl rand -hex 32 > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
fi
MAW_SERVE_TOKEN="$(cat "$TOKEN_FILE")"
export MAW_SERVE_TOKEN

printf 'proxy_set_header Authorization "Bearer %s";\n' "$MAW_SERVE_TOKEN" > /tmp/maw-auth.conf
chown www-data /tmp/maw-auth.conf
chmod 400 /tmp/maw-auth.conf

# maw keeps its state under $HOME/.maw. /data is Supervisor's persistent
# volume, mounted over whatever the image had there, so this has to happen at
# boot rather than in the Dockerfile.
export HOME=/data/home
mkdir -p "$HOME"
cd "$HOME"

# MAW_UI_DIR points maw serve at the dist baked into the image. This is the
# supported knob; the `<cwd>/.maw/ui/dist` path that `maw ui --install`
# validates was tried first and did NOT get picked up from a read-only
# symlink, whereas MAW_UI_DIR did (verified: /index.html went from 404 to
# <title>ARRA Office</title>).
export MAW_UI_DIR=/opt/maw-ui

# tmux needs a writable socket dir and a sane TERM; maw drives tmux for every
# oracle it wakes, so a broken tmux here is a broken add-on.
export TMUX_TMPDIR=/tmp
export TERM=xterm-256color

nginx -c /etc/nginx/maw-ingress.conf &
nginx_pid=$!

# If nginx dies, the add-on is unreachable but would otherwise sit there
# looking "started" — take the whole container down so Supervisor shows it.
trap 'kill "$nginx_pid" 2>/dev/null || true' TERM INT

echo "[maw] $(maw version 2>/dev/null || echo 'version unknown')"
echo "[maw] exec: maw serve --host 127.0.0.1 --port 3461 (nginx basic auth on :8343)"

# Bound to loopback deliberately: nginx is the only thing that may reach it,
# so the basic-auth gate cannot be bypassed by anything sharing this network.
exec maw serve --host 127.0.0.1 --port 3461
