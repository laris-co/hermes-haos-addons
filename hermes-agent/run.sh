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

export_if_set() {
    env_name="$1"
    value="$2"
    if [ -n "$value" ]; then
        export "$env_name=$value"
    fi
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

# Dedicated model-route options are applied AFTER extra_env so the typed,
# password-redacted Supervisor fields remain authoritative.  In particular,
# never make users put OPENROUTER_API_KEY in extra_env: Supervisor displays
# arbitrary list values in plaintext, while `password?` stays redacted.
configured_openrouter_key="$(get_opt openrouter_api_key)"
configured_openrouter_base_url="$(get_opt openrouter_base_url)"
configured_inference_provider="$(get_opt inference_provider)"
configured_inference_model="$(get_opt inference_model)"

export_if_set OPENROUTER_API_KEY "$configured_openrouter_key"
export_if_set OPENROUTER_BASE_URL "$configured_openrouter_base_url"
export_if_set HERMES_INFERENCE_PROVIDER "$configured_inference_provider"
export_if_set HERMES_INFERENCE_MODEL "$configured_inference_model"

# Hermes loads /data/.env with override semantics.  A key/base URL saved from
# the dashboard must not silently replace the current Supervisor options after
# a restart.  Remove only the competing assignments; the live secret stays in
# the process environment and never enters argv or a generated file.
remove_persistent_override() {
    env_name="$1"
    configured_value="$2"
    env_file="/data/.env"
    [ -n "$configured_value" ] || return 0
    [ -f "$env_file" ] || return 0
    if [ -L "$env_file" ]; then
        echo "[hermes-agent] WARNING: refusing to edit symlinked $env_file" >&2
        return 0
    fi
    if ! /command/s6-setuidgid hermes /opt/hermes/.venv/bin/python - "$env_file" "$env_name" <<'PY'
import os
import re
import sys
import tempfile
from pathlib import Path

path = Path(sys.argv[1])
name = sys.argv[2]
pattern = re.compile(rf"^\s*(?:export\s+)?{re.escape(name)}\s*=")
original = path.read_text(encoding="utf-8")
lines = original.splitlines(keepends=True)
filtered = "".join(line for line in lines if not pattern.match(line))
if filtered == original:
    raise SystemExit(0)

fd, tmp_name = tempfile.mkstemp(prefix=".env.haos-", dir=path.parent)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(filtered)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(tmp_name, 0o600)
    os.replace(tmp_name, path)
finally:
    try:
        os.unlink(tmp_name)
    except FileNotFoundError:
        pass
PY
    then
        echo "[hermes-agent] WARNING: could not clear stale $env_name override from $env_file" >&2
    fi
}

remove_persistent_override OPENROUTER_API_KEY "$configured_openrouter_key"
remove_persistent_override OPENROUTER_BASE_URL "$configured_openrouter_base_url"

# Seed Hermes' saved model metadata as well as the live environment.  The
# embedded PTY/TUI inherits the env route immediately; config persistence keeps
# the Models page and future sessions intelligible instead of showing an old
# claude-opus default beside a working GLM route.
hermes_config_set() {
    key="$1"
    value="$2"
    if [ -n "$value" ]; then
        /opt/hermes/.venv/bin/hermes config set "$key" "$value" >/dev/null
    fi
}

hermes_config_set model.provider "$configured_inference_provider"
hermes_config_set model.default "$configured_inference_model"
hermes_config_set model.base_url "$configured_openrouter_base_url"

unset configured_openrouter_key configured_openrouter_base_url
unset configured_inference_provider configured_inference_model

echo "[hermes-agent] handing off to upstream entrypoint: $* (dashboard bound to loopback; reachable via HA ingress only — see DOCS.md)"
exec /opt/hermes/docker/entrypoint-dispatch.sh "$@"
