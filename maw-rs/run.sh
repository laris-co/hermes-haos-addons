#!/bin/sh
# shellcheck shell=sh
#
# Boots `maw serve` behind an nginx sidecar that supplies its bearer token.
# Runs as PID 1's direct child under Docker's built-in --init (config.yaml sets
# init: true — see that file for why there is no s6-overlay here).
set -eu

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

# Must match the Origin nginx rewrites every proxied request to — see
# maw-proxy.inc for why that rewrite exists.
export MAW_SERVE_ALLOWED_ORIGINS=http://127.0.0.1:3461

# tmux needs a writable socket dir and a sane TERM; maw drives tmux for every
# oracle it wakes, so a broken tmux here is a broken add-on.
export TMUX_TMPDIR=/tmp
export TERM=xterm-256color

# Start the tmux server up front. maw serve shells out to tmux to answer
# /api/teams and the fleet views; with no server running it returns 503
# ("tmux unreachable: no server running on /tmp/tmux-0/default") and the UI
# loads with nothing in it.
#
# `tmux start-server` is NOT enough despite exiting 0 — measured: `tmux ls`
# immediately after still reports "no server running", because a server with
# no sessions has nothing to keep it alive. One detached session does the job
# (/api/teams then returns 200), and maw creates its own sessions on top.
tmux new-session -d -s maw

# Keep at least one session alive, forever.
#
# The reported failure: type `exit` in the terminal view and tmux prints
# "[session detached] / [connection closed]", the last session is gone, and
# the UI has nothing left to attach to and no way to make one — the add-on
# looks dead until it is restarted. Exiting a shell is a normal thing to do,
# so it must not be able to leave the add-on unusable.
#
# `tmux has-session` is the check rather than `tmux ls`, because it exits
# non-zero both when the session is missing and when the whole server is
# gone, which are the same problem here.
while true; do
    tmux has-session -t maw 2>/dev/null || tmux new-session -d -s maw
    sleep 5
done &
session_keeper_pid=$!

# The add-on's own session-creation endpoint — see rootfs/opt/maw-addon.
python3 /opt/maw-addon/session-api.py &
session_api_pid=$!

nginx -c /etc/nginx/maw-ingress.conf &
nginx_pid=$!

# If nginx dies, the add-on is unreachable but would otherwise sit there
# looking "started" — take the whole container down so Supervisor shows it.
trap 'kill "$nginx_pid" "$session_keeper_pid" "$session_api_pid" 2>/dev/null || true' TERM INT

echo "[maw] $(maw version 2>/dev/null || echo 'version unknown')"
echo "[maw] exec: maw serve --host 127.0.0.1 --port 3461 (nginx ingress on :8343)"

# Bound to loopback deliberately: nginx is the only thing that may reach it,
# so nothing sharing this network can skip the proxy and reach maw serve
# directly with the bearer token nginx would otherwise be adding.
exec maw serve --host 127.0.0.1 --port 3461
