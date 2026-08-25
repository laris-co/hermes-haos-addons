#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> env translation shim for Paperclip, plus this
# add-on's thclaws adapter registration. Runs as root (matching
# upstream's own image, which expects to start as root so its
# docker-entrypoint.sh can remap the node user's UID/GID and chown
# /data before dropping privileges via gosu) then hands off to that
# same upstream entrypoint at the end — this script does NOT replace
# upstream's privilege-drop logic, only runs before it.
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

get_opt_list() {
    key="$1"
    if [ ! -f "$OPTIONS_FILE" ]; then
        return 0
    fi
    python3 - "$OPTIONS_FILE" "$key" <<'PY'
import json, sys
path, key = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    sys.exit(0)
for item in data.get(key, None) or []:
    print(item)
PY
}

# --- Instance signing secrets: BETTER_AUTH_SECRET and
# PAPERCLIP_TOOL_ACTION_SIGNING_SECRET. Every documented upstream
# deployment example (DOCKER.md's one-liner, its Compose files, its
# Podman quadlet env template) generates these fresh with
# `openssl rand -hex 32` — they're internal signing keys, not
# credentials a user is meant to remember or type, so this add-on
# auto-generates and persists them to /data on first boot (same
# pattern as hermes-agent-lite's session_secret) rather than making
# them required Configuration-tab fields. An operator-supplied value
# (via the options below) always wins and is not overwritten.
ensure_secret() {
    opt_name="$1"
    file_name="$2"
    val="$(get_opt "$opt_name")"
    if [ -n "$val" ]; then
        echo "$val"
        return 0
    fi
    secret_file="/data/${file_name}"
    if [ ! -s "$secret_file" ]; then
        python3 -c "import secrets; print(secrets.token_hex(32))" > "$secret_file"
        chmod 600 "$secret_file"
    fi
    cat "$secret_file"
}

BETTER_AUTH_SECRET="$(ensure_secret better_auth_secret .better_auth_secret)"
export BETTER_AUTH_SECRET
PAPERCLIP_TOOL_ACTION_SIGNING_SECRET="$(ensure_secret tool_action_signing_secret .tool_action_signing_secret)"
export PAPERCLIP_TOOL_ACTION_SIGNING_SECRET

# --- Optional: only needed if you're exposing this add-on on a real,
# fixed external domain (see README's "Networking" section — this
# add-on ships on a published port, not ingress, precisely because a
# fixed public URL doesn't exist per-installation the way it would on
# a normal HAOS ingress-fronted add-on). Verified directly that leaving
# this unset does not break local access — Paperclip falls back to
# deriving the auth origin from the incoming request (a real startup
# WARN, not a fatal error).
public_url="$(get_opt public_url)"
if [ -n "$public_url" ]; then
    export PAPERCLIP_PUBLIC_URL="$public_url"
fi

# --- Escape hatch: same pattern as every other add-on in this repo.
extra_env="$(get_opt_list extra_env)"
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
                echo "[paperclip] WARNING: ignoring malformed extra_env entry: $pair" >&2
                ;;
        esac
    done
    IFS="$old_ifs"
fi

# --- Register the thclaws adapter (see adapter/NOTICE.md for why it's
# vendored, and DOCS.md for the live verification that this exact
# record shape makes Paperclip's external-adapter loader pick it up:
# real boot log line "Loaded external adapters from plugin store
# {"count":1,"adapters":["thclaws_local"]}" against this file). Written
# fresh on every boot, not just-if-missing — /data is a fresh volume
# mount per Supervisor install, and re-writing an identical file is
# cheap, so a future image update to this add-on's bundled adapter
# code always takes effect on next restart.
mkdir -p /data
cat > /data/adapter-plugins.json <<'JSON'
[
  {
    "packageName": "@soul-brews-studio/thclaws-paperclip-adapter",
    "localPath": "/opt/thclaws-adapter",
    "version": "0.1.0",
    "type": "thclaws_local",
    "installedAt": "2026-08-24T00:00:00.000Z"
  }
]
JSON

echo "[paperclip] exec: docker-entrypoint.sh $*"
exec docker-entrypoint.sh "$@"
