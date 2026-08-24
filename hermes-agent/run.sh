#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> hermes env translation shim for the dashboard.
# Runs as PID 1 (see Dockerfile ENTRYPOINT). Mirrors hermes-gateway/run.sh
# — see that file for the general design note on why python3 instead of
# jq.
#
# NOTE what's NOT here anymore: username/password/session_secret/
# public_url. This add-on now binds hermes to 127.0.0.1 (see Dockerfile
# CMD) and reaches it through an in-container nginx + HA ingress (see
# rootfs/etc/nginx/hermes-ingress.conf). hermes's own auth gate
# (hermes_cli/web_server.py should_require_auth()) is keyed PURELY on
# whether the bind host is loopback — not on whether credentials are
# configured — so a username/password option here would be a dead
# setting that LOOKS like it adds protection but has zero effect. HA's
# own login is the auth boundary now, same as every other ingress-only
# add-on. Don't add those options back without also making the bind
# host configurable (and understanding that reintroduces the broken
# root-relative login page — see DOCS.md).
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

# --- Escape hatch: arbitrary KEY=VALUE pairs, same pattern (and same
# regex re-validation reasoning) as hermes-gateway/run.sh.
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
                    echo "[hermes-agent] WARNING: ignoring malformed extra_env entry: $pair" >&2
                    ;;
            esac
        done
        IFS="$old_ifs"
    fi
fi

echo "[hermes-agent] handing off to upstream entrypoint: $* (dashboard bound to loopback; reachable via HA ingress only — see DOCS.md)"
exec /opt/hermes/docker/entrypoint-dispatch.sh "$@"
