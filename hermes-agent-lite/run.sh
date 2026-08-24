#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> hermes env translation shim for the dashboard.
# Runs as PID 1 under Supervisor's own init (config.yaml sets init: true
# — no bundled supervisor in this minimal image). Mirrors
# hermes-gateway/run.sh — see that file for the general design note on
# why python3 instead of jq, and why we exec straight into `hermes`
# instead of an upstream entrypoint script.
set -eu

OPTIONS_FILE="/data/options.json"

get_opt() {
    key="$1"
    if [ ! -f "$OPTIONS_FILE" ]; then
        echo ""
        return 0
    fi
    python3 - "$OPTIONS_FILE" "$key" <<'PY'
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
}

username="$(get_opt username)"
password="$(get_opt password)"

# Schema marks both required (options: null + schema: str/password, no
# `?`) so Supervisor should refuse to even start the add-on with either
# blank. We check again here anyway: schema is enforced by Supervisor at
# save/start time, not by this container, and hermes's own dashboard
# fails closed on an empty auth provider with a clear log line either
# way — but naming the Supervisor option (not just the env var) here
# gets the user to the fix faster.
if [ -z "$username" ] || [ -z "$password" ]; then
    echo "[hermes-agent-lite] ERROR: username and password must both be set in this add-on's Configuration tab." >&2
    echo "[hermes-agent-lite] The dashboard binds 0.0.0.0 and hermes refuses to serve an unauthenticated public dashboard." >&2
    exit 1
fi

export HERMES_DASHBOARD_BASIC_AUTH_USERNAME="$username"
export HERMES_DASHBOARD_BASIC_AUTH_PASSWORD="$password"

# --- Session secret: auto-generate and persist so restarts don't log
# everyone out. If the operator supplied one via the session_secret
# option, that always wins (and is NOT persisted here — it already lives
# in Supervisor's own options.json).
session_secret="$(get_opt session_secret)"
if [ -z "$session_secret" ]; then
    secret_file="/data/.dashboard_secret"
    if [ ! -s "$secret_file" ]; then
        python3 -c "import secrets; print(secrets.token_hex(32))" > "$secret_file"
        chmod 600 "$secret_file"
    fi
    session_secret="$(cat "$secret_file")"
fi
export HERMES_DASHBOARD_BASIC_AUTH_SECRET="$session_secret"

public_url="$(get_opt public_url)"
if [ -n "$public_url" ]; then
    export HERMES_DASHBOARD_PUBLIC_URL="$public_url"
fi

echo "[hermes-agent-lite] exec: hermes $*"
exec hermes "$@"
