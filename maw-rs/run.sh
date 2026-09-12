#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> ttyd env translation shim.
# Runs as PID 1's direct child under Docker's built-in --init (config.yaml
# sets init: true — see that file's comment for why this add-on has no
# s6-overlay of its own).
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
    echo "[maw] this is a real HTTP Basic Auth credential in front of a shell." >&2
fi

# maw keeps its own state under $HOME/.maw (peer registry, logs, mailbox —
# same layout observed throughout this fleet's other maw usage). /data is
# Supervisor's persistent volume, mounted fresh at container start — a
# real bug this repo's thclaws add-on already documents: `mkdir -p`
# baked into the image is a no-op once a host volume is bind-mounted over
# /data at runtime, so this has to run here, not in the Dockerfile.
export HOME=/data/home
mkdir -p "$HOME"
cd "$HOME"

# maw itself is a tmux orchestrator (it manages oracle sessions as tmux
# windows) — dropping the ttyd user directly into ONE tmux session named
# "maw", rather than a bare shell, matches maw's own designed UX ("maw a
# <oracle>" to attach a pane) and survives a ttyd client disconnecting
# and reconnecting (tmux keeps the session alive; a bare shell would not).
#
# Scope, stated plainly: this is a terminal into what THIS container can
# reach. maw's cross-machine features (`maw hey`, waking an oracle on
# another host) need SSH keys and network access this add-on does not
# configure — it ships a working `maw` binary and a place to run it, not
# a pre-wired connection to the rest of your fleet. See DOCS.md.
echo "[maw] exec: ttyd -p 8343 -c ${username}:*** tmux new-session -A -s maw"
exec ttyd -p 8343 -c "${username}:${password}" tmux new-session -A -s maw
