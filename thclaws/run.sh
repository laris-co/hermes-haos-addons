#!/bin/sh
# shellcheck shell=sh
#
# HAOS options.json -> thclaws env translation shim, plus this add-on's
# nginx ingress sidecar. Runs as PID 1's direct child under Docker's
# built-in --init (config.yaml sets init: true — see that file's
# comment for why this add-on has no s6-overlay of its own).
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

# --- Provider credentials: all three verified directly (real fake-key
# 401s from Anthropic's, OpenAI's, and OpenRouter's own APIs — see
# DOCS.md) against these exact env var names. None is individually
# required — a user only needs one provider — so the real check (below,
# after extra_env is parsed) is "at least one of these OR extra_env is
# non-empty", not per-field.
have_named_key=0

anthropic_key="$(get_opt anthropic_api_key)"
if [ -n "$anthropic_key" ]; then
    export ANTHROPIC_API_KEY="$anthropic_key"
    have_named_key=1
fi

openai_key="$(get_opt openai_api_key)"
if [ -n "$openai_key" ]; then
    export OPENAI_API_KEY="$openai_key"
    have_named_key=1
fi

openrouter_key="$(get_opt openrouter_api_key)"
if [ -n "$openrouter_key" ]; then
    export OPENROUTER_API_KEY="$openrouter_key"
    have_named_key=1
fi

# --- Escape hatch: any other provider thclaws supports (Gemini,
# DashScope/Qwen, DeepSeek, Z.ai, Azure AI Foundry, Ollama, the generic
# oai/* slot for pointing at this repo's own litellm/9router add-ons,
# ...). Same pattern as every other add-on in this repo — malformed
# entries are logged and skipped, never silently dropped or fatal.
extra_env_count=0
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
                    extra_env_count=$((extra_env_count + 1))
                    ;;
                *)
                    echo "[thclaws] WARNING: ignoring malformed extra_env entry: $pair" >&2
                    ;;
            esac
        done
        IFS="$old_ifs"
    fi
fi

# --- Fail loud if genuinely no credential was configured at all. A
# keyless thclaws installs and starts, but every single request to it
# just retries 3x and errors — not an obviously-broken failure mode
# from the sidebar, so this is checked here instead.
if [ "$have_named_key" -eq 0 ] && [ "$extra_env_count" -eq 0 ]; then
    echo "[thclaws] ERROR: no LLM provider credential configured." >&2
    echo "[thclaws] Set at least one of anthropic_api_key / openai_api_key / openrouter_api_key" >&2
    echo "[thclaws] in this add-on's Configuration tab, or supply a different provider's key via" >&2
    echo "[thclaws] extra_env (e.g. GEMINI_API_KEY=..., or an oai/*-compatible base+key pointing" >&2
    echo "[thclaws] at this repo's own litellm/9router add-ons). See DOCS.md for provider names." >&2
    exit 1
fi

# --- HA ingress sidecar: nginx in front of thclaws's own loopback bind.
# No s6-overlay here (see config.yaml's init: true comment) — nginx is
# simply backgrounded, then this script execs into thclaws so it
# becomes Docker's own tini's direct child. Real, stated tradeoff: if
# nginx dies, nothing in this container restarts it (unlike
# hermes-agent's s6-supervised equivalent) — the whole add-on would
# need a manual restart. Not observed in testing but not proactively
# guarded against either; see DOCS.md.
nginx -c /etc/nginx/thclaws-ingress.conf &

# --- The agent's one working "project" directory (upstream: "one
# project per process; cd into the project dir before running"). This
# add-on points thclaws at its own persistent /data/workspace — NOT
# your Home Assistant config directory. Deliberately not configurable
# in this first pass: pointing an AI agent with filesystem/shell tool
# access at live HA config is a much bigger decision than a one-line
# option default should make for you. See DOCS.md.
#
# Created here, not in the Dockerfile: /data is Supervisor's persistent
# volume, mounted fresh at container start — a real bug caught in
# testing, `mkdir -p /data/...` baked into the image is a no-op once a
# host volume is bind-mounted over /data at runtime.
mkdir -p "$HOME" /data/workspace
cd /data/workspace

echo "[thclaws] exec: thclaws --serve --port 8443 --bind 127.0.0.1"
exec thclaws --serve --port 8443 --bind 127.0.0.1
