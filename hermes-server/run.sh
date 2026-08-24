#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> hermes env translation shim. Runs as PID 1 (see
# Dockerfile ENTRYPOINT). `hermes serve` shares its auth gate with
# `hermes dashboard` (same env vars, same should_require_auth() check —
# confirmed directly, see Dockerfile comment) so this is nearly
# identical to hermes-agent's v1 run.sh.
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
# blank — see hermes-agent's v1 DOCS.md (git history) for the full
# reasoning on why null+required beats an empty-string default here.
# We check again anyway: hermes itself also fails closed with a clear
# log line either way, but naming the Supervisor option here gets the
# user to the fix faster.
if [ -z "$username" ] || [ -z "$password" ]; then
    echo "[hermes-server] ERROR: username and password must both be set in this add-on's Configuration tab." >&2
    echo "[hermes-server] hermes serve binds 0.0.0.0 and refuses to serve an unauthenticated public backend." >&2
    exit 1
fi

export HERMES_DASHBOARD_BASIC_AUTH_USERNAME="$username"
export HERMES_DASHBOARD_BASIC_AUTH_PASSWORD="$password"

# Session secret: auto-generate and persist so restarts don't invalidate
# every client's session. Same pattern as hermes-agent's v1 design.
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

# --- Escape hatch: arbitrary KEY=VALUE pairs, same pattern as the other
# add-ons in this repo.
if [ -f "$OPTIONS_FILE" ]; then
    extra_env="$(python3 - "$OPTIONS_FILE" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except Exception:
    sys.exit(0)
for item in data.get("extra_env", None) or []:
    print(item)
PY
)"
    if [ -n "$extra_env" ]; then
        old_ifs="$IFS"
        IFS='
'
        for pair in $extra_env; do
            case "$pair" in
                [A-Za-z_]*=*)
                    # shellcheck disable=SC2163
                    export "$pair"
                    ;;
                *)
                    echo "[hermes-server] WARNING: ignoring malformed extra_env entry: $pair" >&2
                    ;;
            esac
        done
        IFS="$old_ifs"
    fi
fi

echo "[hermes-server] handing off to upstream entrypoint: $*"
exec /opt/hermes/docker/entrypoint-dispatch.sh "$@"
