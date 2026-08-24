#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> env translation shim for Open WebUI. Runs as PID 1
# (see Dockerfile ENTRYPOINT). Same python3-based options.json reader as
# the hermes/litellm add-ons in this repo.
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

# --- Admin bootstrap: required, no default ---
# Upstream's own start.sh supports WEBUI_ADMIN_EMAIL/WEBUI_ADMIN_PASSWORD
# to create the first admin account automatically (verified directly —
# confirmed a real login round trip after setting these). Combined with
# ENABLE_SIGNUP=false (hardcoded in the Dockerfile), this add-on has NO
# unauthenticated bootstrap window at all: there is no "whoever signs up
# first becomes admin" race, because signup is never open. `options: null`
# + non-optional schema types, same pattern as every other add-on in
# this repo, so Supervisor refuses Save/Start until both are set.
admin_email="$(get_opt admin_email)"
admin_password="$(get_opt admin_password)"
if [ -z "$admin_email" ] || [ -z "$admin_password" ]; then
    echo "[open-webui] ERROR: admin_email and admin_password must both be set in this add-on's Configuration tab." >&2
    echo "[open-webui] Public signup is disabled in this add-on, so these are the only way to create an account at all." >&2
    exit 1
fi
export WEBUI_ADMIN_EMAIL="$admin_email"
export WEBUI_ADMIN_PASSWORD="$admin_password"

# --- Backend: fail loud if unset, don't guess a hostname ---
# This add-on exists specifically to close the loop with this repo's
# own `litellm` add-on (litellm routes, Open WebUI is the human
# interface). We deliberately do NOT default this to a guessed
# hostname like `local-litellm` or `litellm`: HAOS add-on hostnames are
# repository-hash-prefixed and assigned per installation (confirmed on
# a real guest — e.g. `a90308c2_hermes_gateway`, a different prefix per
# install, not predictable at build time). A hardcoded guess would work
# on exactly one installation and silently fail everywhere else,
# presenting as "Open WebUI can't reach my models" with no clue why —
# exactly the class of failure this repo exists to avoid. Failing loud
# with instructions is better than a wrong default that looks correct.
openai_api_base_url="$(get_opt openai_api_base_url)"
if [ -z "$openai_api_base_url" ]; then
    echo "[open-webui] ERROR: openai_api_base_url must be set in this add-on's Configuration tab." >&2
    echo "[open-webui] Find the value from the litellm add-on: open its page in Settings -> Add-ons," >&2
    echo "[open-webui] note the hostname shown there, and set this option to http://<that-hostname>:4000/v1" >&2
    echo "[open-webui] (see this add-on's DOCS.md for a worked example)." >&2
    exit 1
fi
export OPENAI_API_BASE_URL="$openai_api_base_url"
openai_api_key="$(get_opt openai_api_key)"
if [ -n "$openai_api_key" ]; then
    export OPENAI_API_KEY="$openai_api_key"
fi

# --- Escape hatch: arbitrary KEY=VALUE pairs, same pattern as every
# other add-on in this repo. Also how you'd override RAG_EMBEDDING_ENGINE
# back to the bundled local model if you want it instead of this add-on's
# leaner openai-routed default.
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
                    echo "[open-webui] WARNING: ignoring malformed extra_env entry: $pair" >&2
                    ;;
            esac
        done
        IFS="$old_ifs"
    fi
fi

echo "[open-webui] exec: $*"
exec "$@"
