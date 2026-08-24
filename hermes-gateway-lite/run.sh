#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> hermes env translation shim. Runs as PID 1 under
# Supervisor's own init (config.yaml sets init: true — this minimal
# image has no bundled supervisor of its own, unlike the v1 design that
# wrapped upstream's s6-overlay image). Reads Supervisor's
# /data/options.json, exports the env vars hermes's gateway already
# knows how to read (see nousresearch/hermes-agent .env.example), then
# execs straight into `hermes` so it becomes the real PID 1 / process
# Supervisor's init actually supervises (no extra shell layer sitting
# between init and the app).
#
# We use python3 (already present — this is the same interpreter
# `hermes` itself runs under) instead of jq, so this shim adds no new
# packages/layers beyond this one script.
set -eu

OPTIONS_FILE="/data/options.json"

# get_opt <dotted.json.path> — prints "" if the key is missing, null, or
# the file doesn't exist yet (first-ever boot before Supervisor has
# written options.json). Never fails the shim outright — every option
# this add-on defines has a working empty/false default (verified: the
# gateway starts cleanly with zero platform tokens configured).
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
if isinstance(val, bool):
    print("true" if val else "false")
else:
    print(val)
PY
}

export_if_set() {
    env_name="$1"
    value="$2"
    if [ -n "$value" ]; then
        export "$env_name=$value"
    fi
}

export_if_set OPENROUTER_API_KEY "$(get_opt openrouter_api_key)"
export_if_set TELEGRAM_BOT_TOKEN "$(get_opt telegram_bot_token)"
export_if_set TELEGRAM_ALLOWED_USERS "$(get_opt telegram_allowed_users)"
export_if_set DISCORD_BOT_TOKEN "$(get_opt discord_bot_token)"
export_if_set DISCORD_ALLOWED_USERS "$(get_opt discord_allowed_users)"
export_if_set SLACK_BOT_TOKEN "$(get_opt slack_bot_token)"
export_if_set SLACK_APP_TOKEN "$(get_opt slack_app_token)"
export_if_set SLACK_ALLOWED_USERS "$(get_opt slack_allowed_users)"

if [ "$(get_opt gateway_allow_all_users)" = "true" ]; then
    export GATEWAY_ALLOW_ALL_USERS=true
fi

# --- Optional tunables (gateway/run.py) ---
# 0 (the default) means "leave unset, let hermes use its own internal
# default" — these are genuine runtime knobs, not required config, so a
# 0 default is safe rather than a magic sentinel that could collide with
# a real user-intended value.
export_if_nonzero() {
    env_name="$1"
    value="$2"
    case "$value" in
        ""|0) return 0 ;;
    esac
    export "$env_name=$value"
}
export_if_nonzero HERMES_MAX_ITERATIONS "$(get_opt max_iterations)"
export_if_nonzero HERMES_AGENT_TIMEOUT "$(get_opt agent_timeout_seconds)"
export_if_nonzero HERMES_AGENT_TIMEOUT_WARNING "$(get_opt agent_timeout_warning_seconds)"
export_if_nonzero HERMES_SESSION_STALL_TIMEOUT "$(get_opt session_stall_timeout_seconds)"
export_if_nonzero HERMES_RESTART_DRAIN_TIMEOUT "$(get_opt restart_drain_timeout_seconds)"

# --- Optional OpenAI-compatible API server ---
# Off by default (verified: `hermes gateway run` starts cleanly with no
# API server config at all). hermes itself refuses to start the API
# server without a key — see hermes_cli/config_defaults.py
# API_SERVER_KEY: "Required whenever the API server is enabled; server
# refuses to start without it." We check it here too, before handing
# off, so the failure names the Supervisor option (api_server_key)
# instead of only the env var a user configuring through the add-on UI
# has never seen.
if [ "$(get_opt api_server_enabled)" = "true" ]; then
    api_key="$(get_opt api_server_key)"
    if [ -z "$api_key" ]; then
        echo "[hermes-gateway-lite] ERROR: api_server_enabled is true but api_server_key is empty." >&2
        echo "[hermes-gateway-lite] Set api_server_key in this add-on's Configuration tab, or turn api_server_enabled back off." >&2
        exit 1
    fi
    export API_SERVER_ENABLED=true
    export API_SERVER_KEY="$api_key"
    # 0.0.0.0, not hermes's own loopback default: config.yaml maps container
    # port 8642/tcp to a host port, and Docker port publishing only forwards
    # to an interface the process inside the container actually bound.
    export API_SERVER_HOST=0.0.0.0
    export API_SERVER_PORT=8642
fi

# --- Escape hatch: arbitrary KEY=VALUE pairs for anything this add-on
# doesn't have a dedicated option for yet (hermes has dozens of optional
# integrations — see .env.example upstream). Schema already constrains
# each entry to KEY=VALUE via match(); re-validated here defensively
# since this is the one place a malformed entry could otherwise export
# something unintended into the process environment.
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
                    # Intentional: $pair IS a "NAME=VALUE" string (that's
                    # the whole point of extra_env), so `export "$pair"`
                    # is the correct POSIX form for exporting a
                    # dynamically-named var — not a mistaken attempt to
                    # export a variable literally called "pair".
                    export "$pair"
                    ;;
                *)
                    echo "[hermes-gateway-lite] WARNING: ignoring malformed extra_env entry: $pair" >&2
                    ;;
            esac
        done
        IFS="$old_ifs"
    fi
fi

echo "[hermes-gateway-lite] exec: hermes $*"
exec hermes "$@"
